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

const START = "<!-- pm-partner:start -->";
const END = "<!-- pm-partner:end -->";

function claudeBlock(recapCmd) {
  return `${START}
## PM Partner — project completion discipline

This project is managed by PM Partner (state: \`.pmpartner/project.json\`).
**At the start of every session, run \`pmp recap\` and read it before doing anything else.** It detects the last session and says exactly where the project stands in the 8-phase method and the single next action. (Fallback if \`pmp\` isn't on PATH: \`${recapCmd}\`)

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
  return `command -v pmp >/dev/null && pmp recap || '${process.execPath}' '${cliPath}' recap || true`;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
