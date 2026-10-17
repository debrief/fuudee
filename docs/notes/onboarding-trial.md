# Onboarding trial: protocol

Oct 17, 2026 · for the product owner to run · **formative** · status: **pending** (no participant has taken it yet)

## Why, and what kind of trial

NFR-09 asks that an analyst with domain knowledge but no Debrief training import a sample serial, compose a storyboard and export it within an hour (OUT-02, OUT-05). The storyboard is Phase 4, so the product owner decided on 17 Oct 2026 to trial now what exists: **import, tidy, annotate and export a traceable figure**, against a **provisional target of 40 minutes**. The full one-hour trial, storyboard included, runs again in Phase 4 with this protocol extended.

This trial is **formative**. With five to eight participants, it can find the problems newcomers meet and give a rough idea of the time the work takes. It cannot show statistically that a population of analysts meets the target. Its results guide what is fixed next. NFR-09 itself is confirmed at pilot (SRD section 8).

## Pass rule (pre-registered)

Write this down, dated, before the first participant (pilot excepted) takes the trial, and do not change it afterwards:

- **Completion.** At least 80% of participants complete all four tasks unaided, that is, without any help above rung 1 of the help ladder (below). With 5 participants that is at least 4; with 6, at least 5; with 7, at least 6; with 8, at least 7.
- **Time.** The **median** time of the *silent* runs (below) is at most **40 minutes**, and **no participant** takes over **60 minutes** for the four tasks.
- **Recurring problems.** Any stuck point seen in two or more participants is a finding to fix, whatever the times.

The trial passes when the completion and time rules both hold. Otherwise it fails, and the findings say why.

## Participants

- **Who:** analysts with domain knowledge of the community's work (O, N or D) who have **never used Debrief v4** and have had no training on it. Some may have used legacy Debrief; record which.
- **How many:** one **pilot** participant first, then five to eight, one at a time. The pilot's results are not counted. It checks the set-up, the task card and the timings, and anything it shows wrong is fixed before the next participant.
- **Not:** anyone on the development team, or anyone who has read the blog posts or guides closely.
- **Consent:** participants agree to be observed and timed, and to their words being noted without their name. Results are reported by participant number only.

## Set-up (fixed for every participant)

- **Hardware:** one laptop for every session, of the kind analysts use. Record its make, model, memory and screen size here before the pilot: ______. Use a mouse; a touchpad also works, but use the same for all participants.
- **Software:** Windows 11. VS Code at version ______, recorded before the pilot and unchanged throughout. The Debrief extension from one VSIX, its version ______ recorded. Python with Debrief's packages installed, **including `debrief-sample` and its `pyarrow`**, which the walkthroughs use to make their copies. The tool service running.
- **A catalogue already added** (product owner, 17 Oct 2026): an empty catalogue named *Trial*, added with **Add catalogue folder…** before the participant arrives, so the first task does not begin by asking where plots go. No other catalogue.
- **On the desktop, two files only:**
  - `red-one.rep`: serial 2's RED ONE from the sample exercise (`python -m debrief_sample build`, under `serial-2/sources/`);
  - a legacy Debrief plot, `legacy.dpf`: an unclassified .dpf plot the product owner provides. The playground's speed run uses `shapes.dpf` from debrief-io's tests in its place.
- The Debrief sidebar open, VS Code's Get Started page closed, notifications cleared. Screen recording on, if the participant agrees.
- A clock the observer can read; the observation sheet below, printed or open on another machine.
- Reset between participants: remove the *Trial* catalogue's contents, the walkthroughs' copies (**Start again** in each, or VS Code's extension storage), and VS Code's walkthrough progress; then check the set-up again.

## The observer

- **Neutral:** someone who did not build the part being tested, who reads the script as written and does not react to what the participant does. They do not demonstrate, hint, nod or say whether a step is right.
- **The help ladder.** When the participant asks for help, or makes no progress for 3 minutes, the observer climbs one rung at a time, and notes the rung and the time:
  1. "What are you trying to do?" (no help with Debrief)
  2. "Where have you looked? Is there anywhere else in Debrief that might help?"
  3. Points to where to look: "Try the walkthroughs" or "Look in the Outline's menu".
  4. Shows the step. **The task then fails**, and the participant carries on with the next task.

## Two runs: silent, then think-aloud

Thinking aloud slows people down. So each participant does the tasks **silently, timed**, and then, in a short second pass, **thinks aloud** about where they hesitated. Only silent runs are judged against the 40 minutes. The think-aloud pass is never timed against the target; it is for findings.

## Script

Read this aloud, as written:

> "Thank you for helping. We are testing Debrief, not you: if something is hard, that is what we need to know. There are four tasks on this card. Please work quietly; I will time you. I can't help you with Debrief, but Debrief has walkthroughs for newcomers. Use them as you wish. Tell me when you think each task is done. You can stop at any time. Afterwards I'll ask you to go back over the hard parts and tell me what you were thinking."

Then hand over the task card. Start the clock when the participant first touches the mouse or keyboard.

## Tasks (the task card)

The card says what to achieve, not how, and does not follow the walkthroughs step for step.

1. **Import.** Two files on the desktop came from an exercise: `red-one.rep` and `legacy.dpf`. Bring both into the *Trial* catalogue in Debrief. Plot the REP file's track as logged.
2. **Tidy.** Debrief's walkthroughs include a copy of serial 1 for practising tidying a track. Open that copy. Its RED ONE looks wrong in places: make it trustworthy, and then make it less noisy.
3. **Annotate.** On that copy, mark the area where BLUE ONE first holds contact on RED ONE, and give it a name. Make the times of BLUE ONE and RED ONE readable along their tracks, at intervals.
4. **Export a traceable figure.** Produce an image of the map for a slide that someone could later trace back to the plot. Then use the image to find the plot again in Debrief.

## What to time and note

- **Time to each task's end**, from the clock's start: when the participant says it is done, and whether it is done (see the success criteria).
- **Total time** to the end of task 4 (silent run).
- **Each stuck point** (no progress for 60 seconds, or a request for help): what they were trying to do, where they looked, what got them going again (a walkthrough, a tooltip, chance), and the help-ladder rung if any.
- **Walkthroughs used:** which, which steps, and whether a step ticked itself off when they did it.
- **Errors:** anything done wrongly and undone, or not noticed.
- **Words:** any term the participant did not understand or used differently (for the glossary and the language guide).
- **For every task that fails, the reason**, in one line: help at rung 4, time out (the 60-minute limit reached), wrong result, gave up, or a fault in Debrief (note what it was).

## Success criteria

| Task | Done when |
| --- | --- |
| Import | Both files are plots in *Trial*: RED ONE from `red-one.rep`, plotted over the ground (its import note says so), and the legacy plot from `legacy.dpf` (its import listing what was not imported, if anything) |
| Tidy | In *Serial 1: Tidy a track*, History shows *RED ONE: 3 jumps removed* and a smoothing of RED ONE (any number of fixes); no fix of RED ONE is more than 1 nmi from its neighbours' line |
| Annotate | An area (or circle or ellipse) named by the participant whose edge is within **2 nmi** of RED ONE's position at BLUE ONE's first sonar contact (the Timeline's first *Sonar* entry, 08:29Z), or contains that position; and BLUE ONE and RED ONE carry time labels at one interval between 5 and 30 minutes, set as one step or two |
| Export | A PNG of 1600 × 900 with a footer ID exists, and **Find source of image…** has opened the plot read-only from that image or its ID |

## Observation sheet

Copy one per participant.

| Participant | P__ (pilot: P0) | Community (O, N, D) | | Used legacy Debrief? | yes / no |
| --- | --- | --- | --- | --- | --- |

| Task | Start (mm:ss) | Said done (mm:ss) | Done? (Y/N) | If not, why | Stuck points (time: what, where, rung, how resolved) | Walkthrough steps used |
| --- | --- | --- | --- | --- | --- | --- |
| 1 Import | | | | | | |
| 2 Tidy | | | | | | |
| 3 Annotate | | | | | | |
| 4 Export and trace | | | | | | |

Silent-run total time: ______ Highest help rung reached: ______

Words not understood: ______

From the think-aloud pass ("What was hardest? What would have helped?"): ______

## Recording results

- Keep each sheet, and any recording, where the product owner keeps pilot records; not in this repository.
- Summarise in a new dated section of this note, **Results**: the pre-registered rule as written; then, by participant number, each task's time, success and reason for any failure, the silent total and the highest help rung; then the stuck points that recurred, and the words. State whether the pass rule held. Record the outcome as a dated decision in `docs/delivery-plan.md` (pass, or the findings to fix) and update NFR-09's note in the SRD.
- Findings become issues against the walkthroughs (`vscode/walkthroughs/tours.json`), the language guide or the feature concerned.

## The automated speed run (playground only)

`vscode/test/play/onboarding.mjs` (`speedRun`) does the four tasks in the playground, not in VS Code. It imports serial 2's `red-one.rep` and debrief-io's `shapes.dpf`, and smooths over 5 fixes. It uses the walkthroughs' own buttons where a step has one, so it is quicker than a newcomer could be. It counts each click, key press and field filled in, prints the count and the time, and **fails if the tasks come to take more than 36 actions**, so a change that makes them ask more is caught. It runs with the playground's tests in CI. On 17 Oct 2026: **32 actions in about 12 seconds** (import 5, tidy 10, annotate 12, export and trace 5). It proves the tasks are achievable and shows how much they ask; it says nothing about how long a person new to Debrief takes, which is what this trial is for.

## Results

*None yet: the trial is pending (17 Oct 2026). Pre-register the pass rule above before the first counted participant.*
