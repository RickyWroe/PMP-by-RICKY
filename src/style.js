// Minimal ANSI styling — purple identity, nothing noisy.
//
// Colors only when stdout is a real terminal (or PMP_COLOR=1 forces them), so
// piped output, the launchd check-in log, and notifications stay plain text.

const on =
  process.env.PMP_COLOR === "1" ||
  (process.stdout.isTTY && process.env.NO_COLOR === undefined);

const wrap = (code) => (s) => (on ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const purple = wrap("38;5;141"); // soft violet — accents
export const purpleBold = wrap("1;38;5;141"); // headline / next action
export const deep = wrap("38;5;99"); // deeper purple — banner shadow line
export const dim = wrap("2"); // labels, meta
export const bold = wrap("1");

// Big-but-minimal PMP banner (2 lines, half-block caps).
export function banner() {
  return [purpleBold("█▀█ █▀▄▀█ █▀█"), deep("█▀▀ █ ▀ █ █▀▀")];
}
