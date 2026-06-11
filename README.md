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

`pmp init` asks for your outcome, your psychological profile, and a daily push time, then writes everything to `.pmpartner/project.json` in that project.

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
  project.json     # single source of truth (outcome, deliverables, log, retro)
  checkin.log      # output from the scheduled daily run
```

Everything lives with the project and travels with it in git (commit `.pmpartner/project.json` if you want the history; it's git-ignored in *this* repo only to keep test runs clean).

---

## License

MIT
