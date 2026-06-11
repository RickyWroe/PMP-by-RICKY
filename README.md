# PMP by RICKY

```
█▀█ █▀▄▀█ █▀█
█▀▀ █ ▀ █ █▀▀   finish what you started.
```

> PM Partner — an installable project-completion partner that lives inside your project until it's Done.

---

## What this repo does — and what it doesn't

**PMP is a command-line tool (`pmp`) you install into one project at a time.** It runs the project through an 8-phase completion method — define Done → break into deliverables → map dependencies → assign AI vs. human ownership → estimate effort & risk → freeze scope → daily feedback loops → retro — and refuses to let you skip steps, ship unverified work, or sneak in scope. Every day it sends one push notification with one action. Every time you open the project — terminal, IDE, AI agent — it recaps exactly where you stand. When everything ships, it makes you compare the result to the original goal, captures the lesson, and shuts itself off.

**In scope:**
- One person, one project, one finish line — installed per-project, deleted by completion
- Solo builders, side projects, anything that keeps dying at 80%
- Local-first: your data is one JSON file in your repo. No accounts, no cloud, no telemetry
- AI-agent native: Claude Code, Codex, Cursor — anything with a shell can drive it

**Out of scope (on purpose):**
- Team PM — this is not Jira, Linear, or Asana. No boards, no assignees, no standups
- Time tracking, Gantt charts, sprints with ceremonies — the only ceremony is showing up
- Windows/Linux auto-notifications (the check-in works everywhere; the scheduled push is macOS `launchd` — wire `pmp checkin` into cron elsewhere)
- Managing five projects at once. That's the disease, not the cure

---

## 1. Why this exists

You don't have a starting problem. You have a finishing problem.

The graveyard of side projects isn't full of bad ideas — it's full of good ideas abandoned at 80%, killed by the same six assassins every time: **ADHD** (the on-ramp is too steep), **perfectionism** ("not good enough yet" as a permanent state), **OCD loops** (checking it again won't make it more done), **fear of finishing** (what am I without this project?), **identity attachment** (if the project fails, *I* fail), and **scope creep** (every new idea is a tax on the finish line).

Normal project tools assume the problem is unclear work. It almost never is. The problem is your *relationship to finishing* — so that's what PM Partner manages.

**The promise:** install it once into a project, and it stays there until the project is *Done*. Every day it pushes you one notification with one action. Every time you open the project — terminal, IDE, AI agent — it tells you exactly where you stand, so you never feel lost. And it enforces real project management discipline so ruthlessly that the project physically cannot drift, bloat, or quietly die.

It never assumes. It never lets you lie to it. It never asks you to make more than one decision a day.

---

## 2. How to use it

**Install once per machine:**

```bash
git clone https://github.com/RickyWroe/PMP-by-RICKY.git && cd PMP-by-RICKY && ./install.sh
pmp shell install     # optional: every terminal greets you with the recap
```

**Install once per project:**

```bash
cd ~/the-project-you-keep-not-finishing
pmp init
```

It asks you five things: the project name, which of the six assassins are yours, what *Done* means in one sentence, one checkable done-criterion, and what time you want your daily push. It also wires itself into your IDE — Claude Code sessions and terminals in that folder will open with a recap from then on.

**Then set up the plan (the 8 phases, enforced in order):**

```bash
pmp deliverable add    # break Done into pieces — each needs a "done when" line
pmp scope freeze       # lock the edges. New ideas → parking lot, not the plan
pmp notify setup       # turn on the daily push (macOS launchd, 9:00 by default)
```

**Then just live your life.** Once a day, a notification surfaces the single next action. When you sit down to work:

```bash
pmp recap              # where are we? (runs automatically in IDE/terminal)
pmp ship D3 --yes      # mark a deliverable done — after verifying its criterion
pmp scope park "idea"  # capture the shiny new thing WITHOUT touching scope
pmp complete           # when everything ships: retro, lesson captured, push off
```

`pmp help` shows everything else. `pmp` alone shows status.

---

## 3. How it was built

**Zero dependencies, on purpose.** It's plain Node (≥18) and nothing else — no framework, no database, no daemon. The entire project state lives in one human-readable JSON file (`.pmpartner/project.json`) inside *your* project, so it travels with your repo and any tool can read it.

**The phase you're in is computed, never claimed.** The 8 phases (define the outcome → break into deliverables → map dependencies → assign AI vs. human ownership → estimate effort & risk → build the execution system → run feedback loops → compare outcome vs. goal) are each a predicate over the state file. `pmp status` derives where you really are. There is no checkbox to lie to.

**The discipline is code, not advice.** A guards layer refuses — with the reason and the fix — anything that breaks PM best practice: deliverables before *Done* is defined, work without an acceptance criterion, phantom dependencies, shipping out of dependency order, marking things done without verification, freezing vagueness.

**The psychology engine is the core, not a feature.** Each profile contributes a daily-rotating reframe, a standing guardrail, and a "shrink" that rewrites today's action into its least-threatening form ("for the next 10 minutes only: …"). Profiles stack.

**The pushy parts are just the OS.** Daily notifications are a macOS `launchd` agent + `osascript` banner (optional spoken nudge via `say`). The terminal greeting is twenty lines of zsh. The IDE recap is a Claude Code `SessionStart` hook. Nothing to keep running; nothing to break.

**Built to be driven by agents.** Every command that writes state has headless flags (`pmp init --outcome "..." --criterion "..."`), so Claude Code — or Codex, Cursor, anything with a shell — can operate it on your behalf, including by voice. The one thing no agent can do is invent your outcome. That's yours.

---

## 4. Best practices

**Write "Done" as a fact, not a feeling.** "Landing page is live at the real URL" beats "landing page is basically finished." If you can't check it, it can't be done.

**Make deliverables small and the first one tiny.** Momentum beats optimality. The check-in deliberately picks the smallest actionable thing — help it help you.

**Freeze scope earlier than feels comfortable.** An open edge never finishes. The parking lot is not a trash can: parked ideas survive to the retro and seed the *next* project. You lose nothing. You protect the finish.

**Park, don't argue.** When the shiny idea arrives mid-session (it will), `pmp scope park` takes four seconds. Negotiating with yourself takes the afternoon.

**Verify once, then keep your hands off.** Each "done when" line gets checked exactly one time. Re-opening a checked box is the loop talking, not quality assurance.

**Let AI take the `ai`-owned deliverables.** You marked them mechanical for a reason. Your judgment is the scarce resource — spend it on the `human` ones.

**Show up badly rather than not at all.** A check-in where you ship nothing still counts: the recap stays honest, the chain stays alive, and "we restart small" is built into the copy on purpose.

**Actually run `pmp complete`.** The retro — did the result match the goal? what's the one lesson? — is phase 8, not a nice-to-have. Finishing without comparing outcome to intention is how you repeat the same project forever.

---

[MIT licensed](LICENSE). © Ricky Manyari (RICKY).

Now go ship D1.
