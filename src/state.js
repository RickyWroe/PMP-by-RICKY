// State engine. The PM Partner keeps everything in `.pmpartner/` inside the
// project it is installed into. One JSON file is the single source of truth.
// No external dependencies — only Node built-ins — so the repo installs anywhere.

import fs from "node:fs";
import path from "node:path";

export const DIR = ".pmpartner";
export const STATE_FILE = "project.json";
export const SCHEMA_VERSION = 1;

export function stateDir(root = process.cwd()) {
  return path.join(root, DIR);
}

export function statePath(root = process.cwd()) {
  return path.join(stateDir(root), STATE_FILE);
}

export function exists(root = process.cwd()) {
  return fs.existsSync(statePath(root));
}

export function emptyState(name = path.basename(process.cwd())) {
  const now = new Date().toISOString();
  return {
    version: SCHEMA_VERSION,
    project: {
      name,
      createdAt: now,
      updatedAt: now,
      // Psychological profile — drives how the Partner talks to you.
      // Any of: adhd, perfectionism, ocd, fear_of_finishing,
      // identity_attachment, poor_scope_control
      profile: [],
    },
    phase: 1, // 1..8, see src/phases.js
    // Phase 1 — Define the outcome
    outcome: {
      definition: "", // one sentence: what does "Done" mean
      doneCriteria: [], // checkable statements; all true => project is Done
      antiGoals: [], // things you are explicitly NOT doing (scope guardrails)
      deadline: "", // ISO date or "" for none
    },
    // Phase 2/3/4/5 — Deliverables with dependencies, ownership, effort, risk
    deliverables: [],
    // Phase 6 — Execution system
    scope: {
      frozen: false, // once true, new ideas go to parkingLot, not deliverables
      parkingLot: [], // captured-but-deferred ideas (protects against scope creep)
    },
    cadence: "daily", // sprint rhythm for the nudge
    schedule: {
      dailyTime: "09:00", // local HH:MM for the daily push
      notify: true,
      voice: false, // speak the nudge aloud via macOS `say`
    },
    // Phase 7 — Feedback loops: every check-in is logged here
    log: [],
    // Phase 8 — Improvement: filled in at completion
    retro: null,
    completedAt: null,
  };
}

export function load(root = process.cwd()) {
  const p = statePath(root);
  if (!fs.existsSync(p)) {
    throw new Error(
      `No PM Partner found here. Run \`pmp init\` in your project first.`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return migrate(raw);
}

export function save(state, root = process.cwd()) {
  const dir = stateDir(root);
  fs.mkdirSync(dir, { recursive: true });
  state.project.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath(root), JSON.stringify(state, null, 2) + "\n");
  return state;
}

// Forward-compatible: fill in any keys added in later versions.
function migrate(state) {
  const base = emptyState(state?.project?.name);
  return {
    ...base,
    ...state,
    project: { ...base.project, ...(state.project || {}) },
    outcome: { ...base.outcome, ...(state.outcome || {}) },
    scope: { ...base.scope, ...(state.scope || {}) },
    schedule: { ...base.schedule, ...(state.schedule || {}) },
  };
}

// ---- Deliverable helpers ---------------------------------------------------

export function nextDeliverableId(state) {
  const n = state.deliverables.length + 1;
  return `D${n}`;
}

export function newDeliverable(partial = {}) {
  return {
    id: partial.id,
    title: partial.title || "",
    doneWhen: partial.doneWhen || "", // concrete acceptance criterion
    owner: partial.owner || "human", // "ai" | "human"
    effort: partial.effort || "M", // S | M | L
    risk: partial.risk || "low", // low | med | high
    status: partial.status || "todo", // todo | doing | done | blocked
    dependsOn: partial.dependsOn || [], // [deliverableId]
    notes: partial.notes || "",
  };
}

// Topologically usable: deliverables whose dependencies are all done,
// that aren't done themselves. These are the things you *can* work on now.
export function actionable(state) {
  const doneIds = new Set(
    state.deliverables.filter((d) => d.status === "done").map((d) => d.id),
  );
  return state.deliverables.filter(
    (d) =>
      d.status !== "done" &&
      d.status !== "blocked" &&
      d.dependsOn.every((dep) => doneIds.has(dep)),
  );
}

export function progress(state) {
  const total = state.deliverables.length;
  const done = state.deliverables.filter((d) => d.status === "done").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

export function isComplete(state) {
  if (state.deliverables.length === 0) return false;
  return state.deliverables.every((d) => d.status === "done");
}
