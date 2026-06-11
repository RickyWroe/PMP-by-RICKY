# PM Partner

> An installable project-completion partner that lives inside your project and pushes you to finish it — with daily push notifications, an Agile-lite 8‑phase method, and coaching tuned to *why you don't finish things*.

You install it once into a project. It stays in `.pmpartner/` until the project is **Done**, sends you a daily nudge surfacing the single next action, and on completion runs a retro comparing the result to your original goal.

It is psychology-aware. Most project tools assume the problem is unclear work. For a lot of us the problem is the *relationship to finishing*: ADHD activation energy, perfectionism, OCD re-checking loops, fear of finishing, identity attachment, and runaway scope. PM Partner counters each of those directly.

---

## Install

```bash
git clone <this-repo> pm-partner
cd pm-partner
./install.sh            # links `pmp` into ~/.local/bin
# or: ./install.sh --link   (uses npm link)
```

Then, inside the project you actually want to finish:

```bash
cd ~/path/to/your-project
pmp init
```

`pmp init` asks for your outcome, your psychological profile, and a daily push time, then writes everything to `.pmpartner/project.json` in that project. It also installs the **IDE orientation layer**: a `CLAUDE.md` discipline block plus a Claude Code `SessionStart` hook, so every coding session in that project opens with `pmp recap` automatically.

> Requires Node ≥ 18. Daily auto-push and spoken nudges use macOS (`launchd` + `say`); on other systems the check-in still works — wire `pmp checkin` into cron.

---

## The 8 phases

PM Partner walks the project through these and won't let you skip the setup that prevents drift later.

| # | Phase | What it locks down |
|---|-------|--------------------|
| 1 | **Define the outcome** | One sentence for "Done" + checkable criteria + anti-goals |
| 2 | **Break into deliverables** | Concrete, shippable pieces with acceptance lines |
| 3 | **Map dependencies** | What must come before what |
| 4 | **Assign ownership** | Per piece: can **AI** execute it, or does it need **human** strategy & judgment? |
| 5 | **Estimate effort & risk** | S/M/L + low/med/high |
| 6 | **Create the execution system** | Freeze scope, set cadence, turn on the daily push |
| 7 | **Run feedback loops** | Daily check-in → next smallest action → log it |
| 8 | **Compare outcome vs goal & improve** | Retro: did it match? what's the lesson? |

`pmp status` always shows which phase you're really in (computed from state, not a checkbox you can lie to).

---

## Never lost: the session recap

Open the project after a day — or a month — and run `pmp recap` (Claude Code runs it for you at session start via the installed hook):

```
  ◆ PM Partner — Launch Page
  Last session: 3 days ago.

  WHERE WE ARE: Phase 7/8 — Run feedback loops
  PROGRESS:     40% (2/5 deliverables shipped) · due 2026-07-01 (20d left)
  DONE MEANS:   Landing page live at real URL converting signups
  SCOPE:        frozen ❄ · 2 parked ideas

  SINCE LAST SESSION: shipped D2 · parked 1 idea

  → NEXT ACTION: D3: Wire the form (AI can execute this — hand it to Claude Code). Done when: form posts to the API.
```

It detects the previous session, diffs exactly what changed, names the phase you're in, and surfaces the single next action. You can never open the IDE and feel lost about where the project stands.

Three layers deliver it automatically:

1. **Claude Code sessions** — the `SessionStart` hook installed by `pmp init` runs the recap before any work starts.
2. **Any terminal** (IDE terminals included) — run `pmp shell install` once, globally; every new shell opened inside *any* managed project, or any `cd` into one, prints the recap. Silent everywhere else, greets once per project per shell.
3. **Any other AI agent** — the `CLAUDE.md` block tells it to run `pmp recap` first and follow the discipline rules.

---

## Never assume: discipline guards

The methodology is enforced, not suggested. The CLI **refuses** moves that break PM best practice — and every refusal explains the *why* and the fix:

| You try | PM Partner says no because |
|---------|---------------------------|
| Add a deliverable before "Done" is defined | We never break down work before the outcome exists (phase 1 first) |
| Add a deliverable without a "done when" line | Without an acceptance criterion, "done" is a feeling, not a fact |
| Reference a dependency that doesn't exist | We never plan against assumed work |
| Freeze scope before the breakdown exists | Freezing vagueness locks in vagueness |
| Mark `D3` done while `D2` is open | Out-of-order shipping means a wrong map or fake-done — human decision required |
| `pmp ship D3` without verifying | Shipping requires checking the criterion: confirm interactively or pass `--yes` after verifying |

Nothing is ever filled in by guesswork: missing plan data is asked for, never defaulted into existence.

---

## Daily use

The whole point is **one decision per day**:

```bash
pmp checkin
```

```
  ▌ your-project
  ▌ ████████░░░░░░░░░░░░  40%  (2/5 shipped) · phase 7/8

  → For the next 10 minutes only: D3: wire up the contact form (AI can execute this — hand it to Claude Code). Done when: form posts to the API.

  “You don't need motivation, you need a 10-minute on-ramp. Start the timer, not the project.”

  · One thing on screen. Close the other tabs. The next action is the ONLY action.
  · Scope is frozen. New ideas go to the parking lot, not the plan.

  tuned for: ADHD, Poor scope control
```

`pmp checkin --notify` also fires a macOS banner (and speaks it if voice is on). The daily `launchd` job runs exactly this for you.

Other everyday commands:

```bash
pmp next                 # just the next action, nothing else
pmp ship D3              # mark a deliverable done
pmp scope park "idea"    # capture a new idea WITHOUT touching scope
pmp status               # full picture
pmp complete             # when all deliverables are done → retro
```

---

## How the psychology engine works

Set your profile at init or with `pmp profile set adhd,perfectionism`. Each profile adds:

- a **reframe** (rotates daily so it doesn't go stale),
- a **guardrail** rule that protects the project from that failure mode,
- a **shrink** that rewrites the next action into its least-threatening form.

| Profile | Core counter-move |
|---------|-------------------|
| `adhd` | 10-minute on-ramp, one thing on screen, start the timer not the project |
| `perfectionism` | ship the B+, "good enough to show someone," revise later *on purpose* |
| `ocd` | each criterion verified **once**, no re-opening checked boxes |
| `fear_of_finishing` | finishing graduates you; "just one more" near the end is the fear talking |
| `identity_attachment` | the work is something you made, not who you are; outcome is data, not a verdict |
| `poor_scope_control` | every new idea is a tax on finishing → park it, protect the frozen line |

Multiple profiles stack — all guardrails apply; reframes rotate.

---

## Voice

PM Partner supports spoken nudges (`pmp init` → "Speak nudges aloud?", or `pmp notify` with voice on). It's also built to be driven by **Claude Code**: ask Claude to run `pmp checkin` and read it back to you, or talk through a deliverable and let Claude update state with `pmp deliverable ...`. The state file is plain JSON so any agent can read and edit it.

---

## Files

```
.pmpartner/
  project.json     # single source of truth (outcome, deliverables, log, sessions, retro)
  checkin.log      # output from the scheduled daily run
CLAUDE.md          # PM discipline block for agents (managed between pm-partner markers)
.claude/
  settings.json    # SessionStart hook → pmp recap (merged non-destructively)
```

Everything lives with the project and travels with it in git (commit `.pmpartner/project.json` if you want the history; it's git-ignored in *this* repo only to keep test runs clean).

---

## License

MIT
