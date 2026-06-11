// The daily check-in: figure out the single next action, wrap it in coaching,
// and produce a short nudge. Keeps the user in exactly one decision: do this.

import { actionable, progress, isComplete } from "./state.js";
import { currentPhase } from "./phases.js";
import { coach } from "./psychology.js";
import { purple, purpleBold, deep, dim, bold } from "./style.js";

const EFFORT_RANK = { S: 0, M: 1, L: 2 };

// The whole philosophy: surface ONE thing. If the project isn't set up yet, the
// next action is the next setup step. Otherwise it's the smallest actionable
// deliverable (momentum > optimality for this user profile).
export function chooseNextAction(state) {
  if (isComplete(state)) {
    return {
      kind: "complete",
      text: "Every deliverable is done. Run `pmp complete` to close it out.",
      deliverable: null,
    };
  }

  const ph = currentPhase(state);
  if (ph.n < 7) {
    return {
      kind: "setup",
      text: `Phase ${ph.n} — ${ph.title}: ${ph.hint}`,
      deliverable: null,
    };
  }

  const candidates = actionable(state);
  if (candidates.length === 0) {
    const blocked = state.deliverables.filter(
      (d) => d.status !== "done" && d.status !== "blocked",
    );
    if (blocked.length === 0) {
      return {
        kind: "blocked",
        text: "Everything left is blocked. Unblock one dependency to keep moving (`pmp deliverable`).",
        deliverable: null,
      };
    }
    return {
      kind: "waiting",
      text: "Nothing is actionable right now — a dependency is still open above.",
      deliverable: null,
    };
  }

  // Prefer something already in progress (finish before starting), then the
  // smallest effort to lower activation energy.
  candidates.sort((a, b) => {
    const doingA = a.status === "doing" ? 0 : 1;
    const doingB = b.status === "doing" ? 0 : 1;
    if (doingA !== doingB) return doingA - doingB;
    return (EFFORT_RANK[a.effort] ?? 1) - (EFFORT_RANK[b.effort] ?? 1);
  });

  const d = candidates[0];
  const ownerNote =
    d.owner === "ai"
      ? " (AI can execute this — hand it to Claude Code)"
      : " (needs your judgment)";
  return {
    kind: "deliverable",
    text: `${d.id}: ${d.title}${ownerNote}. Done when: ${d.doneWhen || "you say so"}.`,
    deliverable: d,
  };
}

// Compose the nudge object the CLI / notifier / Claude voice layer all render from.
export function buildNudge(state) {
  const next = chooseNextAction(state);
  const c = coach(state, next.text);
  const { done, total, pct } = progress(state);
  return {
    project: state.project.name,
    progress: { done, total, pct },
    phase: currentPhase(state).n,
    next,
    reframe: c.reframe,
    action: c.action,
    guardrails: c.guardrails,
    profiles: c.profiles,
  };
}

// Short string for an OS notification (must fit on a banner).
export function nudgeHeadline(nudge) {
  const p = nudge.progress;
  const bar = p.total ? `${p.done}/${p.total}` : "setup";
  return `${nudge.project} · ${bar} · ${truncate(nudge.action, 110)}`;
}

// Full terminal render.
export function renderNudge(nudge) {
  const lines = [];
  const p = nudge.progress;
  lines.push("");
  lines.push(`  ${purpleBold("▌")} ${bold(nudge.project)}`);
  lines.push(
    `  ${purpleBold("▌")} ${bar(p.pct)}  ${purple(`${p.pct}%`)}  ${dim(
      `(${p.done}/${p.total} shipped) · phase ${nudge.phase}/8`,
    )}`,
  );
  lines.push("");
  lines.push(`  ${purpleBold("→")} ${bold(nudge.action)}`);
  lines.push("");
  lines.push(`  ${purple(`“${nudge.reframe}”`)}`);
  if (nudge.guardrails.length) {
    lines.push("");
    for (const g of nudge.guardrails) lines.push(`  ${purple("·")} ${dim(g)}`);
  }
  if (nudge.profiles.length) {
    lines.push("");
    lines.push(`  ${dim(`tuned for: ${nudge.profiles.join(", ")}`)}`);
  }
  lines.push("");
  return lines.join("\n");
}

// Spoken version for `say` — strip symbols, keep it human.
export function nudgeSpeech(nudge) {
  const p = nudge.progress;
  const status = p.total
    ? `You're ${p.pct} percent there, ${p.done} of ${p.total} done.`
    : `Let's get set up.`;
  return `${nudge.project}. ${status} ${stripForSpeech(nudge.action)} ${stripForSpeech(
    nudge.reframe,
  )}`;
}

function bar(pct, width = 20) {
  const filled = Math.round((pct / 100) * width);
  return deep("█".repeat(filled)) + dim("░".repeat(width - filled));
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function stripForSpeech(s) {
  return s.replace(/[`*_>→·▌“”]/g, "").replace(/\s+/g, " ").trim();
}
