// Notification + scheduling layer.
//
// Two delivery channels, used together:
//   1. Native macOS notification (banner) — fired by `pmp checkin --notify`.
//   2. macOS `launchd` daily timer — runs the check-in automatically each day so
//      the push arrives even when you never open the terminal. This is the
//      "lives inside the project until completion" promise.
//
// Optional spoken nudge via `say`. On non-macOS we degrade gracefully to stdout.

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const isMac = process.platform === "darwin";

export async function osNotify(title, message) {
  if (!isMac) {
    console.log(`[notify] ${title} — ${message}`);
    return;
  }
  // osascript is built in; no extra install needed.
  const script = `display notification ${q(message)} with title ${q(
    title,
  )} sound name "Glass"`;
  try {
    await run("osascript", ["-e", script]);
  } catch {
    console.log(`[notify] ${title} — ${message}`);
  }
}

export async function speak(text) {
  if (!isMac) return;
  try {
    await run("say", ["-r", "190", text]);
  } catch {
    /* `say` unavailable — silently skip */
  }
}

function q(s) {
  return '"' + String(s).replace(/["\\]/g, "\\$&") + '"';
}

// ---- launchd daily schedule ------------------------------------------------

const LABEL_PREFIX = "com.pmpartner.";

function labelFor(projectName) {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${LABEL_PREFIX}${slug || "project"}`;
}

function plistPath(label) {
  return path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
}

// Build a LaunchAgent that runs `pmp checkin --notify` at HH:MM every day,
// pinned to this project's directory.
export function buildPlist({ label, nodeBin, cliPath, projectRoot, hour, minute }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${cliPath}</string>
    <string>checkin</string>
    <string>--notify</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectRoot}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${path.join(projectRoot, ".pmpartner", "checkin.log")}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(projectRoot, ".pmpartner", "checkin.log")}</string>
</dict>
</plist>
`;
}

export async function scheduleDaily({ projectName, projectRoot, cliPath, time }) {
  const [hour, minute] = time.split(":").map((x) => parseInt(x, 10));
  const label = labelFor(projectName);
  const file = plistPath(label);
  const nodeBin = process.execPath;

  if (!isMac) {
    return {
      ok: false,
      label,
      file,
      message:
        "Automatic daily scheduling uses macOS launchd. On this OS, run `pmp checkin` from cron or your scheduler of choice.",
    };
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    buildPlist({ label, nodeBin, cliPath, projectRoot, hour, minute }),
  );

  // Reload so changes take effect immediately.
  try {
    await run("launchctl", ["unload", file]).catch(() => {});
    await run("launchctl", ["load", file]);
  } catch (e) {
    return {
      ok: false,
      label,
      file,
      message: `Wrote ${file} but couldn't load it: ${e.message}. Try \`launchctl load ${file}\`.`,
    };
  }

  return {
    ok: true,
    label,
    file,
    message: `Daily push scheduled for ${time} (launchd: ${label}).`,
  };
}

export async function unscheduleDaily({ projectName }) {
  const label = labelFor(projectName);
  const file = plistPath(label);
  if (isMac && fs.existsSync(file)) {
    await run("launchctl", ["unload", file]).catch(() => {});
    fs.rmSync(file);
  }
  return { label, file };
}
