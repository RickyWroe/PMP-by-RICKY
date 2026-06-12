// PM discipline guards.
//
// "Extreme orientation to completing the project, never assuming."
// These guards make the methodology non-optional: the CLI refuses moves that
// skip a phase, mark unverified work as done, or fill in plan data by guesswork.
// Every refusal explains WHY (the best practice) and exactly what to do instead.

import { phase } from "./phases.js";

export class DisciplineError extends Error {
  constructor(message) {
    super(message);
    this.name = "DisciplineError";
  }
}

// Block an action until every phase up to `upTo` is genuinely satisfied.
export function requirePhasesThrough(state, upTo, doing) {
  for (let n = 1; n <= upTo; n++) {
    const p = phase(n);
    if (!p.isSatisfied(state)) {
      throw new DisciplineError(
        `PM discipline: can't ${doing} yet — phase ${n} (${p.title}) isn't complete.\n` +
          `    Why it matters: ${p.goal}\n` +
          `    Do this first:  ${p.hint}`,
      );
    }
  }
}

// A deliverable without an acceptance criterion is an assumption waiting to
// happen — "done" would mean whatever you feel like on a bad day.
export function requireAcceptance(doneWhen, title) {
  if (!doneWhen || !doneWhen.trim()) {
    throw new DisciplineError(
      `PM discipline: "${title}" needs a "done when" acceptance criterion.\n` +
        `    Why it matters: without one, "done" is a feeling, not a fact — and feelings move the goalposts.\n` +
        `    Do this:        describe the checkable condition (e.g. --done "form posts to the API and shows a success state").`,
    );
  }
}

// Dependencies must reference real deliverables. A typo'd dependency would
// silently block (or unblock) the wrong work.
export function validateDependencies(state, dependsOn, selfId = null) {
  const ids = new Set(state.deliverables.map((d) => d.id));
  for (const dep of dependsOn) {
    if (dep === selfId) {
      throw new DisciplineError(`PM discipline: ${selfId} can't depend on itself.`);
    }
    if (!ids.has(dep)) {
      throw new DisciplineError(
        `PM discipline: dependency ${dep} doesn't exist.\n` +
          `    Existing deliverables: ${[...ids].join(", ") || "(none yet)"}\n` +
          `    We never plan against assumed work — add ${dep} first or fix the reference.`,
      );
    }
  }
}

// Sample evidence on a production-scope project is a discipline violation.
// One ad, one test session, or a sample dataset does not constitute real evidence
// when the deliverable is marked "real evidence required".
export function requireEvidenceQuality(deliverable, scopeType) {
  if (deliverable.evidenceType === "sample" && scopeType === "production") {
    throw new DisciplineError(
      `PM discipline: ${deliverable.id} requires real evidence but this is a production-scope project.\n` +
        `    Why it matters: sample evidence in production strategy means the output isn't usable by the client.\n` +
        `    Do this:        collect real data first, or change scope type if this is a test run (pmp scope type test).`,
    );
  }
}

// Work ships in dependency order. Marking something done while its inputs are
// open means either the map is wrong or the work is fake-done; both need a
// human decision, not a silent pass.
export function requireDepsDone(state, deliverable) {
  const doneIds = new Set(
    state.deliverables.filter((d) => d.status === "done").map((d) => d.id),
  );
  const open = deliverable.dependsOn.filter((dep) => !doneIds.has(dep));
  if (open.length) {
    throw new DisciplineError(
      `PM discipline: ${deliverable.id} depends on ${open.join(", ")} — still open.\n` +
        `    Why it matters: shipping out of order means either the dependency map is wrong or this isn't really done.\n` +
        `    Do this:        finish ${open.join(", ")} first, or fix the map with the user (never assume).`,
    );
  }
}
