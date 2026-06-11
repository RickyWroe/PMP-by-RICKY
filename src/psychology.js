// The psychology engine.
//
// Most project tools fail the same person for the same reasons: the work isn't
// unclear, the *relationship to finishing* is. This module encodes evidence-aligned
// counter-moves for each profile and blends them into the daily nudge.
//
// Each strategy can contribute:
//   - reframe(state, ctx): a one-line cognitive reframe
//   - guardrail(state, ctx): a rule that protects the project from the failure mode
//   - shrink(action): turns a next-action into the smallest non-threatening version
//   - tone: words the nudge should lean on

export const PROFILES = {
  adhd: {
    label: "ADHD",
    // The enemy is activation energy and time-blindness, not laziness.
    reframe: () =>
      "You don't need motivation, you need a 10-minute on-ramp. Start the timer, not the project.",
    guardrail: () =>
      "One thing on screen. Close the other tabs. The next action is the ONLY action.",
    shrink: (action) => `For the next 10 minutes only: ${action}`,
    tone: ["tiny", "now", "timer", "just-start"],
  },

  perfectionism: {
    label: "Perfectionism / Anxiety",
    // The enemy is "not yet good enough" as a permanent state. Ship the B+.
    reframe: () =>
      "A finished B+ beats an imaginary A. The grade comes from shipping, not polishing.",
    guardrail: (s) =>
      `Done means your criteria are met — not flawless. Re-read them: ${
        (s.outcome.doneCriteria[0] || "your done criteria").trim()
      }`,
    shrink: (action) =>
      `${action} — at "good enough to show someone," then stop. You can revise later, on purpose.`,
    tone: ["good-enough", "ship-the-draft", "version-1", "reversible"],
  },

  ocd: {
    label: "OCD / over-checking",
    // The enemy is the re-checking loop. Bound it. Closure is the medicine.
    reframe: () =>
      "Checking it again won't make it more done. The checklist is closed when it's checked once.",
    guardrail: () =>
      "Rule: each acceptance line gets verified exactly once. No re-opening a checked box today.",
    shrink: (action) =>
      `${action} — then mark it done and do NOT revisit it this session.`,
    tone: ["closed", "once", "move-on", "bounded"],
  },

  fear_of_finishing: {
    label: "Fear of finishing",
    // The enemy is the void after Done. Name it; finishing frees you, not exposes you.
    reframe: () =>
      "Finishing this doesn't end you — it graduates you. The next thing needs this one out of the way.",
    guardrail: () =>
      "When you notice yourself adding 'just one more' near the end, that's the fear talking. Ship instead.",
    shrink: (action) => `${action}. Letting it be done is part of the task.`,
    tone: ["graduate", "release", "complete", "next-chapter"],
  },

  identity_attachment: {
    label: "Identity attachment",
    // The enemy is "this project IS me," so finishing/judging it feels like self-judgment.
    reframe: () =>
      "This project is something you made, not who you are. Its outcome is data, not a verdict on you.",
    guardrail: () =>
      "Separate the work from the worth. Critique the deliverable; leave yourself out of it.",
    shrink: (action) => `${action} — as a maker shipping a thing, not as it being you.`,
    tone: ["the-work", "not-you", "made-not-am", "data-not-verdict"],
  },

  poor_scope_control: {
    label: "Poor scope control",
    // The enemy is the ever-expanding edge. Park ideas; protect the frozen line.
    reframe: () =>
      "Every new idea right now is a tax on finishing. Park it — you lose nothing, you protect the finish.",
    guardrail: (s) =>
      s.scope.frozen
        ? "Scope is frozen. New ideas go to the parking lot, not the plan."
        : "Freeze scope soon (`pmp scope freeze`). An open edge never finishes.",
    shrink: (action) => `${action}. New ideas → parking lot, not this task.`,
    tone: ["frozen", "park-it", "protect-the-finish", "no-new-edges"],
  },
};

export function knownProfiles() {
  return Object.keys(PROFILES);
}

export function describeProfile(key) {
  return PROFILES[key]?.label || key;
}

// Build the full coaching layer for today, given state + a chosen next action.
export function coach(state, action) {
  const active = (state.project.profile || []).filter((p) => PROFILES[p]);
  const strategies = active.map((p) => PROFILES[p]);

  // Pick the most relevant single reframe for the day so the nudge stays short.
  // Rotate through the active profiles by day-of-year for variety.
  let reframe = "Show up, ship the next smallest thing, log it. That's the whole game.";
  let shrunk = action;
  const guardrails = [];

  if (strategies.length) {
    const doy = dayOfYear(new Date());
    const pick = strategies[doy % strategies.length];
    reframe = pick.reframe(state);
    shrunk = pick.shrink(action);
    // Apply every guardrail — they protect different failure modes.
    for (const st of strategies) guardrails.push(st.guardrail(state));
  }

  return {
    profiles: active.map(describeProfile),
    reframe,
    action: shrunk,
    guardrails: dedupe(guardrails),
  };
}

function dedupe(arr) {
  return [...new Set(arr)];
}

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}
