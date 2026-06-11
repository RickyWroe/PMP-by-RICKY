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
    case "log":
      return cmdLog();
    case "complete":
      return cmdComplete();
    case "help":
    case "-h":
    case "--help":
      return help();
    default:
      console.log(`Unknown command: ${cmd}\n`);
      return help();
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

  let state;
  if (headless) {
    state = emptyState((flags.name || defName).toString());
    state.project.profile = parseProfiles(asStr(flags.profile));
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
    const v = (await rl.question("  Speak nudges aloud? (y/N): ")).trim().toLowerCase();
    state.schedule.voice = v === "y" || v === "yes";

    rl.close();
  }

  reconcilePhase(state);
  save(state);

  console.log("\n  ✓ Saved to .pmpartner/project.json\n");
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

  console.log("");
  console.log(`  ${state.project.name}`);
  console.log(
    `  ${pct}%  ${done}/${total} deliverables shipped` +
      (state.outcome.deadline ? `  · due ${state.outcome.deadline}` : ""),
  );
  if (state.project.profile.length)
    console.log(`  tuned for: ${state.project.profile.map(describeProfile).join(", ")}`);
  console.log("");

  console.log("  Phases:");
  for (const p of PHASES) {
    const ok = p.isSatisfied(state);
    const mark = ok ? "✓" : p.n === ph.n ? "▸" : "·";
    console.log(`    ${mark} ${p.n}. ${p.title}`);
  }
  console.log("");

  if (state.deliverables.length) {
    console.log("  Deliverables:");
    for (const d of state.deliverables) {
      const box = { todo: "○", doing: "◐", done: "●", blocked: "✕" }[d.status] || "○";
      const dep = d.dependsOn.length ? `  ←${d.dependsOn.join(",")}` : "";
      console.log(
        `    ${box} ${d.id} [${d.owner === "ai" ? "AI" : "you"}/${d.effort}/${d.risk}] ${d.title}${dep}`,
      );
    }
    console.log("");
  }

  if (state.scope.parkingLot.length) {
    console.log(`  Parking lot (${state.scope.parkingLot.length} parked idea(s)) — protected scope`);
    console.log("");
  }

  console.log(`  ▸ You're in phase ${ph.n}: ${ph.title}`);
  console.log(`    ${ph.hint}`);
  console.log("");
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
    const id = nextDeliverableId(state);
    const headless = !canPrompt() || flags.title;
    let title, doneWhen, owner, effort, risk, dependsOn;

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
    } else {
      const rl = readline.createInterface({ input: stdin, output: stdout });
      console.log(`\n  New deliverable ${id} (phases 2–5):`);
      title = (await rl.question("  Title: ")).trim();
      doneWhen = (await rl.question("  Done when (acceptance criterion): ")).trim();
      owner = (await rl.question("  Owner — (a)i can do it / (h)uman judgment [h]: "))
        .trim()
        .toLowerCase()
        .startsWith("a")
        ? "ai"
        : "human";
      effort = pick(
        (await rl.question("  Effort S/M/L [M]: ")).trim().toUpperCase(),
        ["S", "M", "L"],
        "M",
      );
      risk = pick(
        (await rl.question("  Risk low/med/high [low]: ")).trim().toLowerCase(),
        ["low", "med", "high"],
        "low",
      );
      const depRaw = (
        await rl.question(`  Depends on (e.g. D1,D2 — blank if none): `)
      ).trim();
      rl.close();
      dependsOn = depRaw
        ? depRaw.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean)
        : [];
    }

    state.deliverables.push(
      newDeliverable({ id, title, doneWhen, owner, effort, risk, dependsOn }),
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
    const id = (args[1] || "").toUpperCase();
    const d = state.deliverables.find((x) => x.id === id);
    if (!d) throw new Error(`No deliverable ${id}. See \`pmp deliverable list\`.`);
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
  // Convenience alias: `pmp ship D2`
  return cmdDeliverable(["done", ...args]);
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
  if (sub === "freeze") {
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
    pmp checkin [--notify]       Your 1-decision nudge + log it (phase 7)
    pmp next                     Just the next action, nothing else
    pmp status                   Where everything stands
    pmp ship <ID>                Mark a deliverable done

  Manage
    pmp deliverable start|done|block|todo <ID>
    pmp outcome [set|criterion] ...
    pmp profile [set adhd,...]
    pmp scope [freeze|park "..."|list]
    pmp notify [setup|off|test]
    pmp log                      Check-in history
    pmp complete                 Retro + close out (phase 8)
`);
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
