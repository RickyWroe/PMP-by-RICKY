// IDE integration — installed into the HOST project by `pmp init`.
//
// Two artifacts make "never feel lost" automatic when working in Claude Code
// (or any agentic IDE that reads CLAUDE.md):
//
//   1. A CLAUDE.md block: standing orders for the agent — run `pmp recap` at
//      session start, follow the discipline rules, never assume plan data.
//   2. A .claude/settings.json SessionStart hook that actually runs the recap,
//      so the orientation appears before any work starts.
//
// Both are idempotent: re-running init updates the block in place.

import fs from "node:fs";
import path from "node:path";
import { progress } from "./state.js";
import { currentPhase } from "./phases.js";

const START = "<!-- pm-partner:start -->";
const END = "<!-- pm-partner:end -->";
const STATE_START = "<!-- pm-partner:state:start -->";
const STATE_END = "<!-- pm-partner:state:end -->";

// Every major agentic IDE that reads a context file at session start.
// Detection is conservative: only write to files/dirs that already exist —
// except Claude (primary target), which we always write to.
const AGENTS = [
  {
    name: "claude",
    detect: (r) => fs.existsSync(path.join(r, ".claude")) || fs.existsSync(path.join(r, "CLAUDE.md")),
    file: (r) => path.join(r, "CLAUDE.md"),
  },
  {
    name: "codex",
    detect: (r) => fs.existsSync(path.join(r, "AGENTS.md")),
    file: (r) => path.join(r, "AGENTS.md"),
  },
  {
    name: "cursor",
    detect: (r) => fs.existsSync(path.join(r, ".cursor")) || fs.existsSync(path.join(r, ".cursorrules")),
    file: (r) =>
      fs.existsSync(path.join(r, ".cursor"))
        ? path.join(r, ".cursor", "rules", "pm-partner.md")
        : path.join(r, ".cursorrules"),
  },
  {
    name: "windsurf",
    detect: (r) => fs.existsSync(path.join(r, ".windsurfrules")) || fs.existsSync(path.join(r, ".windsurf")),
    file: (r) => path.join(r, ".windsurfrules"),
  },
  {
    name: "copilot",
    detect: (r) => fs.existsSync(path.join(r, ".github", "copilot-instructions.md")),
    file: (r) => path.join(r, ".github", "copilot-instructions.md"),
  },
  {
    name: "gemini",
    detect: (r) => fs.existsSync(path.join(r, "GEMINI.md")),
    file: (r) => path.join(r, "GEMINI.md"),
  },
];

function claudeBlock(recapCmd) {
  return `${START}
## PM Partner — project completion discipline

This project is managed by PM Partner (state: \`.pmpartner/project.json\`).

**At the start of every conversation, before doing anything else:**
1. Read the "PM Partner — Live Project State" block in this file.
2. Confirm out loud in one sentence: what phase you're in and what the single next action is.
3. Then wait for the user's instruction.

This orients every session without the user having to explain where the project stands.
(To refresh the state block at any point: run \`pmp recap\` or fallback \`${recapCmd}\`)

Non-negotiable rules for working in this repo:

1. **Never assume.** If an outcome, acceptance criterion, owner, effort, risk, or dependency is missing or unclear, ask the user — do not invent it. The CLI will refuse guessed data anyway.
2. **One next action at a time.** Work only on what \`pmp recap\` / \`pmp next\` surfaces. Do not open parallel workstreams.
3. **Scope is sacred.** When scope is frozen, new ideas go to \`pmp scope park "..."\` — never into the plan, never into the code "while we're at it".
4. **Ship only verified work.** Check the deliverable's "done when" line against reality, then \`pmp ship <ID> --yes\`. Never mark work done that you haven't verified.
5. **Keep state true.** Reflect reality with \`pmp deliverable start|done|block <ID>\` as you work, so the next session's recap is accurate.
6. **Close the loop.** When everything ships, run \`pmp complete\` with the user to compare the result against the original goal and capture the lesson.
${END}
`;
}

export function installClaudeMd(projectRoot, recapCmd) {
  const file = path.join(projectRoot, "CLAUDE.md");
  const block = claudeBlock(recapCmd);
  let content = "";
  if (fs.existsSync(file)) content = fs.readFileSync(file, "utf8");

  if (content.includes(START)) {
    // Replace existing block in place.
    const re = new RegExp(`${escapeRe(START)}[\\s\\S]*?${escapeRe(END)}\\n?`);
    content = content.replace(re, block);
  } else {
    content = content ? content.replace(/\n*$/, "\n\n") + block : block;
  }
  fs.writeFileSync(file, content);
  return file;
}

export function installSessionHook(projectRoot, recapCmd) {
  const dir = path.join(projectRoot, ".claude");
  const file = path.join(dir, "settings.json");

  let settings = {};
  if (fs.existsSync(file)) {
    try {
      settings = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return { file, ok: false, reason: "existing settings.json isn't valid JSON — left untouched" };
    }
  }

  settings.hooks = settings.hooks || {};
  let list = settings.hooks.SessionStart || [];

  // Idempotent + self-upgrading: drop any prior pmp recap hooks, add the current one.
  const isOurs = (entry) =>
    (entry.hooks || []).some(
      (h) => typeof h.command === "string" && /pmp(\.js)?'? recap/.test(h.command),
    );
  const already = list.some((e) => isOurs(e) && e.hooks.some((h) => h.command === recapCmd));
  list = list.filter((e) => !isOurs(e));
  list.push({ hooks: [{ type: "command", command: recapCmd }] });
  settings.hooks.SessionStart = list;

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
  return { file, ok: true, added: !already };
}

// Prefer `pmp` from PATH (survives node upgrades); fall back to the absolute
// node + CLI path for hook shells that don't have ~/.local/bin on PATH.
// Quotes survive spaces in paths ("PM Partner"). `|| true` keeps the hook
// from ever failing a session.
export function recapCommand(cliPath) {
  const esc = (s) => s.replace(/'/g, "'\\''");
  return `command -v pmp >/dev/null && pmp recap || '${esc(process.execPath)}' '${esc(cliPath)}' recap || true`;
}

function stateBlock(state) {
  const { done, total, pct } = progress(state);
  const ph = currentPhase(state);
  const blocked = state.deliverables.filter((d) => d.status === "blocked");
  const doing   = state.deliverables.filter((d) => d.status === "doing");
  const todo    = state.deliverables.filter((d) => d.status === "todo");

  const SCOPE_LABELS = { production: "Production strategy", test: "Test / validation", prototype: "Prototype" };
  const scopeLabel = SCOPE_LABELS[state.project.scopeType] || "Production strategy";

  const lines = [
    STATE_START,
    `## PM Partner — Live Project State`,
    `*Auto-updated at session start — do not edit this block.*`,
    ``,
    `- **Project:** ${state.project.name}`,
    `- **Scope type:** ${scopeLabel}`,
    `- **Phase:** ${ph.n} of 8 — ${ph.title}`,
    `- **Progress:** ${done}/${total} deliverables shipped (${pct}%)`,
    `- **Scope:** ${state.scope.frozen ? "Frozen ❄" : "Open"}`,
  ];

  if (doing.length)
    lines.push(`- **In progress:** ${doing.map((d) => `${d.id} — ${d.title}`).join(", ")}`);
  if (blocked.length)
    lines.push(`- **Blocked:** ${blocked.map((d) => `${d.id} — ${d.title}`).join(", ")}`);
  if (todo.length)
    lines.push(`- **Up next:** ${todo[0].id} — ${todo[0].title}`);

  lines.push(``, `**Right now:** ${ph.hint}`, ``, STATE_END, ``);
  return lines.join("\n");
}

function upsertBlock(content, block, s, e) {
  if (content.includes(s)) {
    return content.replace(
      new RegExp(`${escapeRe(s)}[\\s\\S]*?${escapeRe(e)}\\n?`),
      block,
    );
  }
  return (content ? content.replace(/\n*$/, "\n\n") : "") + block;
}

export function writeStateBlock(projectRoot, state) {
  const block = stateBlock(state);
  for (const agent of AGENTS) {
    try {
      if (!agent.detect(projectRoot)) continue;
      const filePath = agent.file(projectRoot);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
      fs.writeFileSync(filePath, upsertBlock(content, block, STATE_START, STATE_END));
    } catch {
      // never crash a session because a context file couldn't be written
    }
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
