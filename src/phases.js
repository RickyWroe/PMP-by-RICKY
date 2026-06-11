// The 8-phase methodology. Agile-lite: phases 1–6 set the project up, phases
// 7–8 are the running loop (check-ins) and the closeout (retro + improvement).
// Each phase knows how to tell you whether it's satisfied yet.

export const PHASES = [
  {
    n: 1,
    key: "outcome",
    title: "Define the outcome",
    goal: 'Pin down exactly what "Done" means — and what it does NOT mean.',
    isSatisfied: (s) =>
      s.outcome.definition.trim().length > 0 &&
      s.outcome.doneCriteria.length >= 1,
    hint: 'Set a one-sentence definition and at least one checkable "done" criterion.',
  },
  {
    n: 2,
    key: "deliverables",
    title: "Break into deliverables",
    goal: "Cut the outcome into concrete, shippable pieces.",
    isSatisfied: (s) => s.deliverables.length >= 2,
    hint: "Add at least 2 deliverables, each with a `doneWhen` acceptance line.",
  },
  {
    n: 3,
    key: "dependencies",
    title: "Map dependencies",
    goal: "Know what must come before what, so you never start a blocked thing.",
    isSatisfied: (s) =>
      s.deliverables.length >= 2 &&
      // satisfied once you've at least considered ordering: either a dep exists,
      // or you've explicitly confirmed the set is independent (frozen scope flag).
      (s.deliverables.some((d) => d.dependsOn.length > 0) || s.scope.frozen),
    hint: "Set `dependsOn` for any deliverable that needs another first (or freeze scope to confirm they're independent).",
  },
  {
    n: 4,
    key: "ownership",
    title: "Assign ownership (AI vs human)",
    goal:
      "Decide each piece: can AI execute it, or does it need human strategy, " +
      "judgment, and case-by-case reasoning?",
    isSatisfied: (s) =>
      s.deliverables.length >= 2 &&
      s.deliverables.every((d) => d.owner === "ai" || d.owner === "human"),
    hint: "Mark each deliverable owner: `ai` (mechanical/automatable) or `human` (strategy, taste, judgment).",
  },
  {
    n: 5,
    key: "estimation",
    title: "Estimate effort & risk",
    goal: "Size each piece (S/M/L) and flag what could go wrong.",
    isSatisfied: (s) =>
      s.deliverables.length >= 2 &&
      s.deliverables.every((d) => d.effort && d.risk),
    hint: "Give every deliverable an effort (S/M/L) and a risk (low/med/high).",
  },
  {
    n: 6,
    key: "execution",
    title: "Create the execution system",
    goal: "Lock scope, set the cadence, and turn on the daily nudge.",
    isSatisfied: (s) => s.scope.frozen && s.schedule.notify,
    hint: "Freeze scope (`pmp scope freeze`) and schedule daily pushes (`pmp notify setup`).",
  },
  {
    n: 7,
    key: "feedback",
    title: "Run feedback loops",
    goal: "Show up daily. Ship the next smallest thing. Log how it went.",
    // You're "in" feedback loops from your first check-in until every
    // deliverable ships. Only then does the project graduate to phase 8.
    isSatisfied: (s) =>
      s.log.length >= 1 &&
      s.deliverables.length > 0 &&
      s.deliverables.every((d) => d.status === "done"),
    hint: "Run `pmp checkin` each day. The Partner picks the next action and logs progress.",
  },
  {
    n: 8,
    key: "improvement",
    title: "Compare outcome vs goal & improve",
    goal: "When everything ships, compare result to the original outcome and capture the lesson.",
    isSatisfied: (s) => !!s.retro,
    hint: "Run `pmp complete` once all deliverables are done to run the retro.",
  },
];

export function phase(n) {
  return PHASES.find((p) => p.n === n);
}

// Returns the lowest-numbered phase that isn't satisfied yet — i.e. where the
// project actually stands, regardless of the stored `phase` pointer.
export function currentPhase(state) {
  for (const p of PHASES) {
    if (!p.isSatisfied(state)) return p;
  }
  return phase(8);
}

// Advance the stored pointer to wherever the project genuinely is.
export function reconcilePhase(state) {
  state.phase = currentPhase(state).n;
  return state;
}
