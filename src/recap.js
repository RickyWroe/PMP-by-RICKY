// Session recap — the "you are here" map.
//
// Run at the start of every work/IDE session (Claude Code runs it automatically
// via the SessionStart hook that `pmp init` installs). It detects the previous
// session, diffs what changed, and orients you in the 8-phase method in a few
// lines — so you never open the project feeling lost.

import { progress } from "./state.js";
import { currentPhase, PHASES } from "./phases.js";
import { chooseNextAction } from "./checkin.js";
import { purple, purpleBold, dim, bold, banner } from "./style.js";

export function takeSnapshot(state) {
  return {
    pct: progress(state).pct,
    phase: currentPhase(state).n,
    doneIds: state.deliverables.filter((d) => d.status === "done").map((d) => d.id),
    deliverableCount: state.deliverables.length,
    parked: state.scope.parkingLot.length,
  };
}

export function buildRecap(state) {
  const now = new Date();
  const prev = state.session?.snapshot || null;
  const lastAt = state.session?.lastRecapAt || null;
  const cur = takeSnapshot(state);
  const next = chooseNextAction(state);
  const ph = currentPhase(state);

  // What changed since the last session — concrete, not vibes.
  const changes = [];
  if (prev) {
    const prevDone = new Set(prev.doneIds || []);
    const shipped = cur.doneIds.filter((id) => !prevDone.has(id));
    if (shipped.length) changes.push(`shipped ${shipped.join(", ")}`);
    const added = cur.deliverableCount - (prev.deliverableCount || 0);
    if (added > 0) changes.push(`added ${added} deliverable${added > 1 ? "s" : ""}`);
    const parked = cur.parked - (prev.parked || 0);
    if (parked > 0) changes.push(`parked ${parked} idea${parked > 1 ? "s" : ""}`);
    if (prev.phase !== cur.phase) changes.push(`moved phase ${prev.phase} → ${cur.phase}`);
  }

  return {
    project: state.project.name,
    firstSession: !lastAt,
    lastSeen: lastAt,
    gap: lastAt ? ago(new Date(lastAt), now) : null,
    phase: ph,
    progress: progress(state),
    deadline: state.outcome.deadline || null,
    daysLeft: state.outcome.deadline ? daysLeft(state.outcome.deadline, now) : null,
    outcome: state.outcome.definition,
    changes,
    scopeFrozen: state.scope.frozen,
    parked: cur.parked,
    next,
  };
}

// Apply after rendering: this session becomes "last session" for the next one.
export function recordSession(state) {
  state.session = {
    lastRecapAt: new Date().toISOString(),
    snapshot: takeSnapshot(state),
  };
  return state;
}

export function renderRecap(r) {
  const L = [];
  const [b1, b2] = banner();
  const label = (s) => dim(s.padEnd(14));

  L.push("");
  L.push(`  ${b1}   ${bold(r.project)}`);
  L.push(
    `  ${b2}   ${dim(
      r.firstSession ? "first session — here's the map" : `last session: ${r.gap} ago`,
    )}`,
  );
  L.push("");

  // Where we are in the method — the one line that kills "lost" feeling.
  L.push(`  ${label("WHERE WE ARE")}${purple(`Phase ${r.phase.n}/8`)} — ${r.phase.title}`);
  const p = r.progress;
  let prog = `${purple(`${p.pct}%`)} (${p.done}/${p.total} deliverables shipped)`;
  if (r.deadline) {
    prog += dim(` · due ${r.deadline}`);
    if (r.daysLeft !== null)
      prog += r.daysLeft >= 0 ? dim(` (${r.daysLeft}d left)`) : bold(` (${-r.daysLeft}d OVERDUE)`);
  }
  L.push(`  ${label("PROGRESS")}${prog}`);
  if (r.outcome) L.push(`  ${label("DONE MEANS")}${r.outcome}`);
  L.push(
    `  ${label("SCOPE")}${r.scopeFrozen ? purple("frozen ❄") : bold("OPEN") + dim(" (freeze it: pmp scope freeze)")}` +
      (r.parked ? dim(` · ${r.parked} parked idea${r.parked > 1 ? "s" : ""}`) : ""),
  );
  L.push("");

  if (!r.firstSession) {
    L.push(
      `  ${label("SINCE LAST")}` +
        (r.changes.length
          ? r.changes.join(dim(" · "))
          : dim("no recorded progress — that's fine, we restart small.")),
    );
    L.push("");
  }

  L.push(`  ${purpleBold("→ NEXT ACTION")}  ${bold(r.next.text)}`);
  L.push("");
  L.push(`  ${dim(`phase guide: ${r.phase.goal}`)}`);
  L.push("");
  return L.join("\n");
}

function ago(then, now) {
  const ms = now - then;
  const min = Math.round(ms / 60000);
  if (min < 2) return "moments";
  if (min < 60) return `${min} minutes`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hour${h > 1 ? "s" : ""}`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? "s" : ""}`;
}

function daysLeft(deadline, now) {
  const d = new Date(deadline + "T23:59:59");
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d - now) / 86400000);
}
