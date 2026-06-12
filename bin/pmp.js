#!/usr/bin/env node
// pmp — the PM Partner CLI.
// Lives inside a project (.pmpartner/) and pushes you to finish it.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import {
  load,
  save,
  exists,
  emptyState,
  newDeliverable,
  nextDeliverableId,
  progress,
  isComplete,
} from "../src/state.js";
import { PHASES, currentPhase, reconcilePhase, phase } from "../src/phases.js";
import { knownProfiles, describeProfile, PROFILES } from "../src/psychology.js";
import {
  buildNudge,
  renderNudge,
  nudgeHeadline,
  nudgeSpeech,
  chooseNextAction,
} from "../src/checkin.js";
import { osNotify, speak, scheduleDaily, unscheduleDaily } from "../src/notify.js";
import { buildRecap, renderRecap, recordSession } from "../src/recap.js";
import {
  requirePhasesThrough,
  requireAcceptance,
  validateDependencies,
  requireDepsDone,
  requireEvidenceQuality,
} from "../src/guards.js";
import { installClaudeMd, installSessionHook, recapCommand, writeStateBlock } from "../src/ide.js";
import { purple, purpleBold, dim, bold, banner } from "../src/style.js";

const CLI_PATH = url.fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const cmd = argv[0];
const rest = argv.slice(1);
const flags = parseFlags(rest);

main().catch((e) => {
  console.error("✗ " + e.message);
  process.exit(1);
});

async function main() {
  switch (cmd) {
    case "init":
      return cmdInit();
    case "status":
    case undefined:
      return cmdStatus();
    case "recap":
    case "resume":
      return cmdRecap();
    case "next":
      return cmdNext();
    case "checkin":
      return cmdCheckin();
    case "deliverable":
    case "d":
      return cmdDeliverable(rest);
    case "ship":
      return cmdShip(rest);
    case "outcome":
      return cmdOutcome(rest);
    case "profile":
      return cmdProfile(rest);
    case "scope":
      return cmdScope(rest);
    case "notify":
      return cmdNotify(rest);
    case "ide":
      return cmdIde();
    case "shell":
      return cmdShell(rest);
    case "log":
      return cmdLog();
    case "complete":
      return cmdComplete();
    case "help":
    case "-h":
    case "--help":
      return help();
    case "version":
    case "--version":
    case "-v":
      return cmdVersion();
    default:
      console.log(`Unknown command: ${cmd}\n`);
      help();
      process.exit(1);
  }
}

// ---- shared UI helpers -----------------------------------------------------

// Present a numbered menu and return the selected option's value.
// defaultIdx is 0-based. Pressing Enter picks the default.
async function choose(rl, question, options, defaultIdx = 0) {
  console.log(`\n  ${question}`);
  options.forEach((opt, i) => {
    const num = i === defaultIdx ? purpleBold(`${i + 1}.`) : dim(`${i + 1}.`);
    const label = i === defaultIdx ? opt.label : dim(opt.label);
    console.log(`    ${num} ${label}`);
  });
  while (true) {
    const raw = (await rl.question(`\n  Choice [${defaultIdx + 1}]: `)).trim();
    if (!raw) return options[defaultIdx].value;
    const n = parseInt(raw, 10);
    if (n >= 1 && n <= options.length) return options[n - 1].value;
    console.log(`  Please enter 1–${options.length}.`);
  }
}

// ---- init ------------------------------------------------------------------

async function cmdInit() {
  if (exists()) {
    console.log("PM Partner is already set up here. Run `pmp status`.");
    return;
  }

  // Headless when flags drive it or there's no TTY (e.g. Claude / scripts).
  const headless = !canPrompt() || flags.name || flags.outcome || flags.yes;
  const defName = path.basename(process.cwd());

  const SCOPE_TYPES = [
    { label: "Production strategy — real client, real evidence required", value: "production" },
    { label: "Test / validation — sample evidence allowed for some deliverables", value: "test" },
    { label: "Prototype — proof of concept, sample data is fine throughout", value: "prototype" },
  ];

  let state;
  if (headless) {
    state = emptyState((flags.name || defName).toString());
    state.project.profile = parseProfiles(asStr(flags.profile));
    state.project.scopeType = pick(
      asStr(flags.scope).toLowerCase(),
      ["production", "test", "prototype"],
      "production",
    );
    state.outcome.definition = asStr(flags.outcome);
    if (flags.criterion) state.outcome.doneCriteria.push(asStr(flags.criterion));
    if (flags.anti) state.outcome.antiGoals.push(asStr(flags.anti));
    if (flags.deadline) state.outcome.deadline = asStr(flags.deadline);
    if (typeof flags.time === "string" && /^\d{1,2}:\d{2}$/.test(flags.time))
      state.schedule.dailyTime = flags.time;
    state.schedule.voice = flags.voice === true || flags.voice === "y" || flags.voice === "yes";
  } else {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    console.log("\n  PM Partner — let's set up your finish line.\n");

    const name = (await rl.question(`  Project name [${defName}]: `)).trim() || defName;
    state = emptyState(name);

    state.project.scopeType = await choose(rl, "What kind of project is this?", SCOPE_TYPES);

    console.log("\n  Your profile tunes how I push you. Pick all that fit (comma-separated):");
    knownProfiles().forEach((k, i) => console.log(`    ${i + 1}. ${describeProfile(k)} (${k})`));
    state.project.profile = parseProfiles((await rl.question("  Profiles: ")).trim());

    console.log("\n  Phase 1 — Define the outcome.");
    state.outcome.definition = (
      await rl.question("  In one sentence, what does DONE mean? ")
    ).trim();
    const crit = (await rl.question("  First checkable 'done' criterion: ")).trim();
    if (crit) state.outcome.doneCriteria.push(crit);
    const anti = (
      await rl.question("  One thing you are explicitly NOT doing (optional): ")
    ).trim();
    if (anti) state.outcome.antiGoals.push(anti);
    const deadline = (await rl.question("  Deadline (YYYY-MM-DD, optional): ")).trim();
    if (deadline) state.outcome.deadline = deadline;

    const t = (await rl.question("  Daily push time [09:00]: ")).trim();
    if (/^\d{1,2}:\d{2}$/.test(t)) state.schedule.dailyTime = t;

    state.schedule.voice =
      (await choose(rl, "Speak nudges aloud via text-to-speech?", [
        { label: "No", value: "no" },
        { label: "Yes (macOS only)", value: "yes" },
      ])) === "yes";

    rl.close();
  }

  reconcilePhase(state);
  save(state);

  console.log("\n  ✓ Saved to .pmpartner/project.json");

  // IDE integration: every future session in this project opens with a recap,
  // and the agent gets standing orders to follow the PM discipline.
  if (!flags["no-ide"]) {
    const recapCmd = recapCommand(CLI_PATH);
    const md = installClaudeMd(process.cwd(), recapCmd);
    console.log(`  ✓ Wrote PM discipline block → ${path.relative(process.cwd(), md)}`);
    const hook = installSessionHook(process.cwd(), recapCmd);
    if (hook.ok) {
      console.log(
        `  ✓ SessionStart recap hook → ${path.relative(process.cwd(), hook.file)}` +
          (hook.added === false ? " (already present)" : ""),
      );
    } else {
      console.log(`  ⚠ Skipped hook: ${hook.reason}`);
    }
  }

  console.log("");
  console.log("  Next steps:");
  console.log("    pmp deliverable add   — break the outcome into pieces (phases 2–5)");
  console.log("    pmp scope freeze      — lock scope when the list feels complete (phase 6)");
  console.log("    pmp notify setup      — turn on the daily push");
  console.log("    pmp checkin           — your daily 1-decision nudge\n");
  cmdStatus();
}

// ---- status ----------------------------------------------------------------

function cmdStatus() {
  const state = load();
  reconcilePhase(state);
  const { done, total, pct } = progress(state);
  const ph = currentPhase(state);
  const [b1, b2] = banner();

  const SCOPE_LABELS = { production: "Production", test: "Test/Validation", prototype: "Prototype" };
  const scopeLabel = SCOPE_LABELS[state.project.scopeType] || "Production";

  console.log("");
  console.log(`  ${b1}   ${purpleBold(state.project.name)}`);
  console.log(
    `  ${b2}   ${purpleBold(`${pct}%`)} ${dim(`${done}/${total} shipped`)}` +
      dim(`  · ${scopeLabel}`) +
      (state.outcome.deadline ? dim(`  · due ${state.outcome.deadline}`) : "") +
      (state.scope.frozen ? `  ${purple("❄ scope locked")}` : ""),
  );
  if (state.project.profile.length)
    console.log(`         ${dim("tuned for: " + state.project.profile.map(describeProfile).join(", "))}`);
  console.log("");

  console.log(`  ${dim("Phases:")}`);
  for (const p of PHASES) {
    const ok = p.isSatisfied(state);
    const isCurrent = p.n === ph.n;
    const mark = ok ? purple("✓") : isCurrent ? purpleBold("▸") : dim("·");
    const label = ok
      ? dim(`${p.n}. ${p.title}`)
      : isCurrent
        ? `${purple(String(p.n))}. ${bold(p.title)}`
        : dim(`${p.n}. ${p.title}`);
    console.log(`    ${mark} ${label}`);
  }
  console.log("");

  if (state.deliverables.length) {
    console.log(`  ${dim("Deliverables:")}`);
    for (const d of state.deliverables) {
      const isDone    = d.status === "done";
      const isDoing   = d.status === "doing";
      const isBlocked = d.status === "blocked";
      const box  = isDone ? purple("●") : isDoing ? purpleBold("◐") : isBlocked ? bold("✕") : dim("○");
      const meta = dim(`[${d.owner === "ai" ? "AI" : "you"}/${d.effort}/${d.risk}]`);
      const dep  = d.dependsOn.length ? `  ${purple("←")}${dim(d.dependsOn.join(","))}` : "";
      const id   = isDone ? dim(d.id) : isDoing ? purpleBold(d.id) : purple(d.id);
      const title = isDone ? dim(d.title) : isDoing ? bold(d.title) : d.title;
      const evBadge = !isDone && d.evidenceType === "sample" ? dim(" [sample evidence]") : "";
      const ndifBadge =
        !isDone && d.notDoneIf && d.notDoneIf.length
          ? dim(` · ${d.notDoneIf.length} blocker${d.notDoneIf.length > 1 ? "s" : ""}`)
          : "";
      console.log(`    ${box} ${meta} ${id} ${title}${evBadge}${ndifBadge}${dep}`);
    }
    console.log("");
  }

  if (state.scope.parkingLot.length) {
    console.log(`  ${dim(`${state.scope.parkingLot.length} idea${state.scope.parkingLot.length > 1 ? "s" : ""} parked`)} ${dim("— protected scope")}`);
    console.log("");
  }

  console.log(`  ${purpleBold("▸")} ${purple(`Phase ${ph.n}:`)} ${bold(ph.title)}`);
  console.log(`    ${dim(ph.hint)}`);
  console.log("");
}

// ---- recap (session orientation) --------------------------------------------

// Designed to run at IDE session start (hook-safe: exits 0 even when not set up).
function cmdRecap() {
  if (!exists()) {
    console.log(
      "\n  ◆ PM Partner: not set up in this project yet. Run `pmp init` to define the finish line.\n",
    );
    return;
  }
  const state = load();
  reconcilePhase(state);
  const recap = buildRecap(state);
  console.log(renderRecap(recap));
  recordSession(state);
  save(state);
  writeStateBlock(process.cwd(), state);
}

// ---- next / checkin --------------------------------------------------------

function cmdNext() {
  const state = load();
  const next = chooseNextAction(state);
  console.log("\n  → " + next.text + "\n");
}

async function cmdCheckin() {
  const state = load();
  reconcilePhase(state);
  const nudge = buildNudge(state);

  console.log(renderNudge(nudge));

  // Log the check-in (Phase 7 — feedback loop).
  state.log.push({
    date: new Date().toISOString(),
    type: "checkin",
    phase: nudge.phase,
    action: nudge.next.text,
    pct: nudge.progress.pct,
  });
  // Entering phase 7 the first time we check in.
  reconcilePhase(state);
  save(state);

  if (flags.notify || state.schedule.notify) {
    await osNotify(`PM Partner · ${state.project.name}`, nudgeHeadline(nudge));
  }
  if (flags.speak || state.schedule.voice) {
    await speak(nudgeSpeech(nudge));
  }

  if (isComplete(state)) {
    console.log("  🎉 All deliverables are done. Run `pmp complete` to close it out.\n");
  }
}

// ---- deliverable -----------------------------------------------------------

async function cmdDeliverable(args) {
  const sub = args[0];
  const state = load();

  if (sub === "add") {
    // Best practice: never break down work before "Done" is defined (phase 1).
    requirePhasesThrough(state, 1, "add deliverables");
    const id = nextDeliverableId(state);
    const headless = !canPrompt() || flags.title;
    let title, doneWhen, owner, effort, risk, dependsOn, evidenceType, notDoneIf;

    if (headless) {
      title = asStr(flags.title);
      if (!title) throw new Error('Headless add needs --title "…". See `pmp help`.');
      doneWhen = asStr(flags.done);
      owner = asStr(flags.owner).toLowerCase().startsWith("a") ? "ai" : "human";
      effort = pick(asStr(flags.effort).toUpperCase(), ["S", "M", "L"], "M");
      risk = pick(asStr(flags.risk).toLowerCase(), ["low", "med", "high"], "low");
      dependsOn = asStr(flags.depends)
        .split(",")
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean);
      evidenceType = pick(
        asStr(flags.evidence).toLowerCase(),
        ["real", "sample"],
        "real",
      );
      notDoneIf = asStr(flags["not-done-if"])
        ? [asStr(flags["not-done-if"])]
        : [];
    } else {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      console.log(`\n  New deliverable ${id} (phases 2–5):`);
      title = (await rl.question("  Title: ")).trim();
      doneWhen = (await rl.question("  Done when (acceptance criterion): ")).trim();
      while (!doneWhen) {
        console.log("  (Required — without it, 'done' is a feeling, not a fact.)");
        doneWhen = (await rl.question("  Done when: ")).trim();
      }

      owner = await choose(rl, "Who does this work?", [
        { label: "Human judgment required", value: "human" },
        { label: "AI can execute it", value: "ai" },
      ]);

      effort = await choose(rl, "Effort?", [
        { label: "Small  (hours)", value: "S" },
        { label: "Medium (days)", value: "M" },
        { label: "Large  (week+)", value: "L" },
      ], 1);

      risk = await choose(rl, "Risk?", [
        { label: "Low — well understood, unlikely to surprise", value: "low" },
        { label: "Med — some unknowns", value: "med" },
        { label: "High — likely to reveal new information", value: "high" },
      ]);

      evidenceType = await choose(rl, "Evidence quality for this deliverable?", [
        { label: "Real evidence required — sample doesn't count toward done", value: "real" },
        { label: "Sample / test data OK", value: "sample" },
      ]);

      console.log('\n  "Not done if…" blockers — negative criteria checked before shipping.');
      console.log("  Example: Only one competitor ad was used");
      console.log("  (blank line to finish)");
      notDoneIf = [];
      while (true) {
        const line = (await rl.question(`  ${notDoneIf.length + 1}: `)).trim();
        if (!line) break;
        notDoneIf.push(line);
      }

      const depRaw = (
        await rl.question(`\n  Depends on (e.g. D1,D2 — blank if none): `)
      ).trim();
      rl.close();
      dependsOn = depRaw
        ? depRaw.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean)
        : [];
    }

    // Never assume: acceptance criterion is mandatory, dependencies must be real.
    requireAcceptance(doneWhen, title || id);
    validateDependencies(state, dependsOn, id);

    state.deliverables.push(
      newDeliverable({ id, title, doneWhen, notDoneIf, evidenceType, owner, effort, risk, dependsOn }),
    );
    reconcilePhase(state);
    save(state);
    console.log(`\n  ✓ Added ${id}: ${title}\n`);
    return;
  }

  if (sub === "list" || !sub) {
    if (!state.deliverables.length) {
      console.log("\n  No deliverables yet. Add one: `pmp deliverable add`\n");
      return;
    }
    console.log("");
    for (const d of state.deliverables) {
      console.log(
        `  ${d.id} [${d.status}] ${d.title}\n     done when: ${d.doneWhen || "—"}` +
          `  · ${d.owner}/${d.effort}/${d.risk}` +
          (d.dependsOn.length ? `  · after ${d.dependsOn.join(",")}` : ""),
      );
    }
    console.log("");
    return;
  }

  // status changes: start / done / block / todo <ID>
  const statusMap = { start: "doing", done: "done", block: "blocked", todo: "todo" };
  if (sub in statusMap) {
    const id = (args.find((a) => /^d\d+$/i.test(a)) || "").toUpperCase();
    const d = state.deliverables.find((x) => x.id === id);
    if (!d) throw new Error(`No deliverable ${id || "(missing ID)"}. See \`pmp deliverable list\`.`);

    if (statusMap[sub] === "done") {
      // Ship in dependency order — out-of-order "done" means a wrong map or fake-done.
      requireDepsDone(state, d);
      // Verify against the acceptance criterion — never assume it's met.
      const confirmed = await confirmAcceptance(d, state);
      if (!confirmed) {
        console.log(
          `\n  Not shipped. Verify the criterion first, then re-run \`pmp ship ${id} --yes\`.\n`,
        );
        return;
      }
    }

    d.status = statusMap[sub];
    reconcilePhase(state);
    save(state);
    console.log(`\n  ✓ ${id} → ${d.status}\n`);
    if (d.status === "done" && isComplete(state))
      console.log("  🎉 That was the last one. Run `pmp complete`.\n");
    return;
  }

  console.log(
    "  Usage: pmp deliverable add | list | start <ID> | done <ID> | block <ID> | todo <ID>",
  );
}

function cmdShip(args) {
  // Convenience alias: `pmp ship D2 --yes`
  return cmdDeliverable(["done", ...args]);
}

// "Done" must be verified against the acceptance criterion, once.
// TTY: walk through blockers then confirm. Headless: require explicit --yes.
async function confirmAcceptance(d, state) {
  console.log(`\n  ${d.id}: ${d.title}`);
  console.log(`  Done when: ${d.doneWhen}`);

  // Evidence quality guard — enforced regardless of TTY.
  requireEvidenceQuality(d, state.project.scopeType || "production");

  // "Not done if..." — walk each negative blocker before the final confirm.
  if (d.notDoneIf && d.notDoneIf.length) {
    if (flags.yes) {
      console.log(`\n  ${dim("Negative blockers (--yes bypassed interactive check):")}`);
      d.notDoneIf.forEach((c) => console.log(`    ${dim("✗")} ${c}`));
    } else if (canPrompt()) {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      console.log(`\n  Verify "${d.id}" is not blocked:`);
      for (const criterion of d.notDoneIf) {
        console.log(`\n  ${bold("✗ Not done if:")} ${criterion}`);
        const still = await choose(rl, "Is this condition currently true?", [
          { label: "No — this doesn't apply, we're clear", value: "clear" },
          { label: "Yes — still true, can't ship yet", value: "blocked" },
        ]);
        if (still === "blocked") {
          rl.close();
          console.log(`\n  Blocked. Resolve "${criterion}" first, then re-run.\n`);
          return false;
        }
      }
      rl.close();
    }
  }

  if (flags.yes) return true;
  if (!canPrompt()) {
    console.log(
      "\n  PM discipline: shipping requires verification. If the criterion above is met, add --yes.",
    );
    return false;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ans = await choose(rl, `Is "${d.doneWhen}" actually met?`, [
    { label: "Yes — criterion is fully met, ship it", value: "yes" },
    { label: "No — not yet, back to work", value: "no" },
  ]);
  rl.close();
  return ans === "yes";
}

// ---- outcome ---------------------------------------------------------------

async function cmdOutcome(args) {
  const state = load();
  const sub = args[0];
  if (sub === "criterion" || sub === "criteria") {
    const text = args.slice(1).join(" ").trim();
    if (!text) throw new Error('Usage: pmp outcome criterion "all tests pass"');
    state.outcome.doneCriteria.push(text);
    reconcilePhase(state);
    save(state);
    console.log(`\n  ✓ Added done criterion. (${state.outcome.doneCriteria.length} total)\n`);
    return;
  }
  if (sub === "set") {
    const text = args.slice(1).join(" ").trim();
    if (!text) throw new Error('Usage: pmp outcome set "ship the landing page live"');
    state.outcome.definition = text;
    reconcilePhase(state);
    save(state);
    console.log("\n  ✓ Outcome updated.\n");
    return;
  }
  // show
  console.log("\n  Outcome:");
  console.log("  " + (state.outcome.definition || "(not set)"));
  if (state.outcome.doneCriteria.length) {
    console.log("\n  Done when ALL true:");
    state.outcome.doneCriteria.forEach((c) => console.log(`    ☐ ${c}`));
  }
  if (state.outcome.antiGoals.length) {
    console.log("\n  Explicitly NOT doing:");
    state.outcome.antiGoals.forEach((c) => console.log(`    ✕ ${c}`));
  }
  console.log("");
}

// ---- profile ---------------------------------------------------------------

function cmdProfile(args) {
  const state = load();
  if (args[0] === "set") {
    state.project.profile = parseProfiles(args.slice(1).join(" "));
    save(state);
    console.log(`\n  ✓ Profile: ${state.project.profile.map(describeProfile).join(", ") || "(none)"}\n`);
    return;
  }
  console.log("\n  Current profile: " + (state.project.profile.map(describeProfile).join(", ") || "(none)"));
  console.log("\n  Available:");
  Object.keys(PROFILES).forEach((k) => console.log(`    ${k} — ${PROFILES[k].label}`));
  console.log('\n  Set with: pmp profile set adhd,perfectionism\n');
}

// ---- scope -----------------------------------------------------------------

function cmdScope(args) {
  const state = load();
  const sub = args[0];
  if (sub === "type") {
    const t = (args[1] || "").toLowerCase();
    const valid = ["production", "test", "prototype"];
    if (!valid.includes(t)) {
      throw new Error(`Usage: pmp scope type production|test|prototype\n  production — real evidence required\n  test       — some sample evidence OK\n  prototype  — proof of concept, samples fine`);
    }
    state.project.scopeType = t;
    save(state);
    console.log(`\n  ✓ Scope type → ${t}. Evidence enforcement updated.\n`);
    return;
  }
  if (sub === "freeze") {
    // Freezing an undefined or unbroken-down scope would lock in vagueness.
    requirePhasesThrough(state, 2, "freeze scope");
    state.scope.frozen = true;
    reconcilePhase(state);
    save(state);
    console.log("\n  ✓ Scope frozen. New ideas now go to the parking lot, not the plan.\n");
    return;
  }
  if (sub === "unfreeze") {
    state.scope.frozen = false;
    save(state);
    console.log("\n  Scope unfrozen. (Be careful — an open edge never finishes.)\n");
    return;
  }
  if (sub === "park") {
    const text = args.slice(1).join(" ").trim();
    if (!text) throw new Error('Usage: pmp scope park "could add dark mode"');
    state.scope.parkingLot.push({ text, at: new Date().toISOString() });
    save(state);
    console.log(`\n  ✓ Parked. You lose nothing; you protect the finish. (${state.scope.parkingLot.length} parked)\n`);
    return;
  }
  // list
  console.log(`\n  Scope: ${state.scope.frozen ? "FROZEN ❄" : "open"}`);
  if (state.scope.parkingLot.length) {
    console.log("\n  Parking lot:");
    state.scope.parkingLot.forEach((p, i) => console.log(`    ${i + 1}. ${p.text}`));
  } else {
    console.log("  Parking lot is empty.");
  }
  console.log("");
}

// ---- notify ----------------------------------------------------------------

async function cmdNotify(args) {
  const state = load();
  const sub = args[0];
  if (sub === "setup" || sub === "on") {
    if (flags.time && /^\d{1,2}:\d{2}$/.test(flags.time)) state.schedule.dailyTime = flags.time;
    state.schedule.notify = true;
    reconcilePhase(state);
    save(state);
    const res = await scheduleDaily({
      projectName: state.project.name,
      projectRoot: process.cwd(),
      cliPath: CLI_PATH,
      time: state.schedule.dailyTime,
    });
    console.log("\n  " + res.message + "\n");
    return;
  }
  if (sub === "off") {
    state.schedule.notify = false;
    save(state);
    const res = await unscheduleDaily({ projectName: state.project.name });
    console.log(`\n  ✓ Daily push off (removed ${res.label}).\n`);
    return;
  }
  if (sub === "test") {
    const nudge = buildNudge(state);
    await osNotify(`PM Partner · ${state.project.name}`, nudgeHeadline(nudge));
    if (state.schedule.voice) await speak(nudgeSpeech(nudge));
    console.log("\n  ✓ Sent a test notification.\n");
    return;
  }
  console.log(
    `\n  Daily push: ${state.schedule.notify ? "ON" : "off"} at ${state.schedule.dailyTime}` +
      `${state.schedule.voice ? " (voice on)" : ""}\n` +
      "  pmp notify setup --time 08:30 | off | test\n",
  );
}

// ---- ide ---------------------------------------------------------------------

// (Re)install the IDE orientation layer into this project.
function cmdIde() {
  load(); // ensures pmp is initialized here before wiring hooks
  const recapCmd = recapCommand(CLI_PATH);
  const md = installClaudeMd(process.cwd(), recapCmd);
  const hook = installSessionHook(process.cwd(), recapCmd);
  console.log(`\n  ✓ PM discipline block → ${path.relative(process.cwd(), md)}`);
  console.log(
    hook.ok
      ? `  ✓ SessionStart recap hook → ${path.relative(process.cwd(), hook.file)}${hook.added === false ? " (already present)" : ""}`
      : `  ⚠ Hook skipped: ${hook.reason}`,
  );
  console.log("\n  Every new IDE session here will now open with `pmp recap`.\n");
}

// ---- shell (terminal greeter) ------------------------------------------------

// Wires shell/pmp.zsh into ~/.zshrc so any terminal opened inside a managed
// project (IDE terminals included) greets you with the recap. This is global,
// one-time: it works for every PM-Partner project, not just this one.
async function cmdShell(args) {
  const os = await import("node:os");
  const zshrc = path.join(os.homedir(), ".zshrc");
  const snippet = path.join(path.dirname(CLI_PATH), "..", "shell", "pmp.zsh");
  const START = "# >>> pm-partner >>>";
  const END = "# <<< pm-partner <<<";
  const esc = (s) => s.replace(/'/g, "'\\''");
  const block = `${START}\n[ -f '${esc(snippet)}' ] && source '${esc(snippet)}'\n${END}\n`;

  let content = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, "utf8") : "";

  if (args[0] === "uninstall") {
    if (!content.includes(START)) {
      console.log("\n  Terminal greeter wasn't installed. Nothing to do.\n");
      return;
    }
    content = content.replace(new RegExp(`\\n?${escRe(START)}[\\s\\S]*?${escRe(END)}\\n?`), "\n");
    fs.writeFileSync(zshrc, content);
    console.log("\n  ✓ Terminal greeter removed from ~/.zshrc.\n");
    return;
  }

  // install (default)
  if (content.includes(START)) {
    content = content.replace(new RegExp(`${escRe(START)}[\\s\\S]*?${escRe(END)}\\n?`), block);
    fs.writeFileSync(zshrc, content);
    console.log("\n  ✓ Terminal greeter already installed — refreshed in ~/.zshrc.");
  } else {
    fs.writeFileSync(zshrc, (content ? content.replace(/\n*$/, "\n\n") : "") + block);
    console.log("\n  ✓ Terminal greeter installed in ~/.zshrc.");
  }
  console.log(
    "    Every NEW terminal opened inside a PM-Partner project (IDE terminals too)\n" +
      "    will now greet you with `pmp recap`. Open a new terminal — or run\n" +
      "    `source ~/.zshrc` in this one — to activate it.\n",
  );
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- log -------------------------------------------------------------------

function cmdLog() {
  const state = load();
  if (!state.log.length) {
    console.log("\n  No check-ins yet. Run `pmp checkin`.\n");
    return;
  }
  console.log("\n  Check-in history:");
  for (const e of state.log.slice(-14)) {
    const d = new Date(e.date);
    const day = d.toISOString().slice(0, 10);
    console.log(`    ${day}  ${String(e.pct).padStart(3)}%  ${e.action}`);
  }
  console.log("");
}

// ---- complete (Phase 8) ----------------------------------------------------

async function cmdComplete() {
  const state = load();
  if (!isComplete(state)) {
    const { done, total } = progress(state);
    console.log(
      `\n  Not done yet — ${done}/${total} shipped. Finish the rest, then run this.\n`,
    );
    return;
  }
  console.log("\n  Phase 8 — Compare outcome vs goal & capture the lesson.\n");
  console.log("  Your original outcome was:");
  console.log("    " + (state.outcome.definition || "(none recorded)"));
  if (state.outcome.doneCriteria.length) {
    console.log("\n  Done criteria:");
    state.outcome.doneCriteria.forEach((c) => console.log(`    ☑ ${c}`));
  }
  console.log("");

  let matched, learned, drift;
  const headless = !canPrompt() || flags.matched || flags.lesson;
  if (headless) {
    matched = asStr(flags.matched).toLowerCase() || "unrecorded";
    learned = asStr(flags.lesson);
    drift = asStr(flags.drift);
  } else {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    matched = (
      await rl.question("  Did the result match the original goal? (y/n/partly): ")
    )
      .trim()
      .toLowerCase();
    learned = (await rl.question("  What's the one lesson to carry forward? ")).trim();
    drift = (
      await rl.question("  Where did scope/effort drift most from the estimate? ")
    ).trim();
    rl.close();
  }

  state.retro = {
    at: new Date().toISOString(),
    matchedGoal: matched,
    lesson: learned,
    drift,
    parked: state.scope.parkingLot.map((p) => p.text),
    checkins: state.log.length,
  };
  state.completedAt = new Date().toISOString();
  reconcilePhase(state);
  save(state);

  console.log("\n  ✓ Retro saved to .pmpartner/project.json");
  console.log("  This project is DONE. You finished it.\n");
  if (state.scope.parkingLot.length) {
    console.log(`  ${state.scope.parkingLot.length} parked idea(s) survived — seeds for the next project:`);
    state.scope.parkingLot.forEach((p) => console.log(`    · ${p.text}`));
    console.log("");
  }
  await unscheduleDaily({ projectName: state.project.name }).catch(() => {});
  console.log("  Daily push turned off. Go enjoy being done.\n");
}

// ---- helpers ---------------------------------------------------------------

function help() {
  console.log(`
  PM Partner — finish the project you started.

  Setup
    pmp init                     One-time setup: outcome, profile, schedule
    pmp deliverable add          Break work into pieces (phases 2–5)
    pmp scope freeze             Lock scope (phase 6)
    pmp notify setup [--time]    Turn on the daily push

  Daily
    pmp recap                    Where are we? Detects last session, diffs progress,
                                 names the phase + single next action (auto-runs at
                                 IDE session start via the installed hook)
    pmp checkin [--notify]       Your 1-decision nudge + log it (phase 7)
    pmp next                     Just the next action, nothing else
    pmp status                   Where everything stands
    pmp ship <ID> --yes          Mark done (only after verifying its "done when")

  Manage
    pmp deliverable start|done|block|todo <ID>
    pmp outcome [set|criterion] ...
    pmp profile [set adhd,...]
    pmp scope [freeze|park "..."|list]
    pmp notify [setup|off|test]
    pmp ide                      (Re)install the IDE session-recap hook + CLAUDE.md rules
    pmp shell install            Greet with recap in ANY terminal opened in a managed
                                 project (one-time, global, IDE terminals included)
    pmp log                      Check-in history
    pmp complete                 Retro + close out (phase 8)

  Discipline (always on — the CLI refuses, with reasons):
    · no deliverables before "Done" is defined        · no "done when" → no deliverable
    · dependencies must exist                          · no shipping out of dependency order
    · no shipping without verifying the criterion      · frozen scope → ideas go to the parking lot
`);
}

function cmdVersion() {
  const pkgPath = new URL("../package.json", import.meta.url);
  const { version } = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  console.log(`pm-partner ${version}`);
}

function parseFlags(args) {
  const f = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-n") f.notify = true;
    else if (a === "-s") f.speak = true;
    else if (a.startsWith("--")) {
      const body = a.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        f[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        const next = args[i + 1];
        if (next === undefined || next.startsWith("--")) f[body] = true;
        else {
          f[body] = next;
          i++;
        }
      }
    } else {
      f._.push(a);
    }
  }
  return f;
}

// Interactive only when we have a real terminal AND no flags were supplied to
// drive the command non-interactively (so Claude / scripts can run it headless).
function canPrompt() {
  return Boolean(stdin.isTTY);
}

function parseProfiles(raw) {
  if (!raw) return [];
  const known = knownProfiles();
  return raw
    .split(/[,\s]+/)
    .map((x) => x.trim().toLowerCase())
    .map((x) => {
      // accept "1".."6" or slug
      const idx = parseInt(x, 10);
      if (!Number.isNaN(idx) && idx >= 1 && idx <= known.length) return known[idx - 1];
      return x;
    })
    .filter((x) => known.includes(x));
}

function pick(val, allowed, fallback) {
  return allowed.includes(val) ? val : fallback;
}

// Flags may be boolean true (bare flag) or string; normalize to a string.
function asStr(v) {
  if (v === undefined || v === true) return "";
  return String(v);
}
