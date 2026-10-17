# Onboarding trial: protocol

Oct 17, 2026 · for the product owner to run · status: **pending** (no participant has taken it yet)

## Why

NFR-09 asks that an analyst with domain knowledge but no Debrief training import a sample serial, compose a storyboard and export it within an hour (OUT-02, OUT-05). The storyboard is Phase 4, so the product owner decided on 17 Oct 2026 to trial now what exists: **import, tidy, annotate and export a traceable figure**, against a **provisional target of 40 minutes**. The full one-hour trial, storyboard included, runs again in Phase 4 with this protocol extended.

This trial tests whether a newcomer can do the work, with Debrief's own walkthroughs as the only help (CAP-25). It does not test speed of an expert; the playground's automated speed run (below) already shows the tasks can be done, and how many actions they take.

## Participants

- **Who:** analysts with domain knowledge of the community's work (O, N or D) who have **never used Debrief v4** and have had no training on it. Some may have used legacy Debrief; record which.
- **How many:** five to eight, enough to see problems that recur. One at a time.
- **Not:** anyone on the development team, or anyone who has read the blog posts or guides closely.
- **Consent:** participants agree to be observed and timed, and to their words being noted without their name. Results are reported by participant number only.

## Set-up

- A Windows 11 laptop of the kind analysts use, with VS Code and the Debrief extension installed from the VSIX, the Python tool service running, and **no catalogue added** (as a first use).
- On the desktop, one file: `red-one.rep`, serial 2's RED ONE from the sample exercise (built with `python -m debrief_sample build`; it is under `serial-2/sources/`). Nothing else.
- The Debrief sidebar open, VS Code's Get Started page closed. Notifications cleared. Screen recording on, if the participant agrees.
- A clock the observer can read; the observation sheet below, printed or open on another machine.

## Script

Read this aloud, as written:

> "Thank you for helping. We are testing Debrief, not you: if something is hard, that is what we need to know. Please think aloud as you work: say what you are looking for and what you expect. I can't help you with Debrief, but Debrief has walkthroughs for newcomers; use them as you wish. There are four tasks. Tell me when you think each is done. You can stop at any time."

Then hand over the task card. Start the clock when the participant first touches the mouse or keyboard.

## Tasks (the task card)

1. **Import.** Import the file `red-one.rep` on the desktop into Debrief, plotted over the ground, and open it on the map.
2. **Tidy.** Open the walkthroughs' copy of serial 1 for *Tidy a track*. Its RED ONE has GPS glitches: remove them, then smooth RED ONE over 5 fixes.
3. **Annotate.** On that plot, draw an area around where BLUE ONE first holds RED ONE, and name it. Label BLUE ONE and RED ONE with their times every 10 minutes.
4. **Export a traceable figure.** Export the map as a PNG for a slide (1600 × 900) with its ID in a corner. Then, from the ID in the image's corner, find the plot it came from in Debrief.

## What to time and note

- **Time to each task's end**, from the clock's start: when the participant says it is done, and whether it is (success criteria, below).
- **Total time** to the end of task 4.
- **Each time the participant is stuck** (no progress for 60 seconds, or asks for help): what they were trying to do, where they looked, and what got them going again (a walkthrough, a tooltip, chance).
- **Walkthroughs used:** which, which steps, and whether a step ticked itself off when they did it.
- **Errors:** anything done wrongly and undone, or not noticed.
- **Words:** any term the participant did not understand or used differently (for the glossary and the language guide).
- **Observer help:** if the observer had to step in, what and when. A task the observer had to complete is a failure.

## Success criteria

| Task | Done when |
| --- | --- |
| Import | A plot of RED ONE from `red-one.rep` is open on the map, plotted over the ground (the import's note says so) |
| Tidy | In *Serial 1: Tidy a track*, History shows *RED ONE: 3 jumps removed* and *RED ONE smoothed over 5 fixes* |
| Annotate | An area named by the participant is on the map near RED ONE's first detection, and BLUE ONE and RED ONE show time labels every 10 minutes (one step) |
| Export | A 1600 × 900 PNG with a footer ID exists, and **Find source of image…** has opened the plot read-only from that ID |

**The trial passes** if at least four in five participants complete all four tasks without the observer's help, and the median total time is **40 minutes or less** (provisional target, product owner, 17 Oct 2026). Any single stuck point seen in two or more participants is a finding to fix, whatever the times.

## Observation sheet

Copy one per participant.

| Participant | P__ | Community (O, N, D) | | Used legacy Debrief? | yes / no |
| --- | --- | --- | --- | --- | --- |

| Task | Start (mm:ss) | Said done (mm:ss) | Done? (Y/N) | Stuck points (time: what, where, how resolved) | Walkthrough steps used |
| --- | --- | --- | --- | --- | --- |
| 1 Import | | | | | |
| 2 Tidy | | | | | |
| 3 Annotate | | | | | |
| 4 Export and trace | | | | | |

Total time: ______ Observer help (what, when): ______

Words not understood: ______

Participant's own comment at the end ("What was hardest? What would have helped?"): ______

## Recording results

- Keep each sheet, and any recording, where the product owner keeps pilot records; not in this repository.
- Summarise in a new dated section of this note, **Results**, by participant number: each task's time and success, the total, the stuck points that recurred, and the words. Then record the outcome as a dated decision in `docs/delivery-plan.md` (pass, or the findings to fix) and update NFR-09's status in the SRD.
- Findings become issues against the walkthroughs (`vscode/walkthroughs/tours.json`), the language guide or the feature concerned.

## The automated speed run

`vscode/test/play/onboarding.mjs` (`speedRun`) does the four tasks in the playground, as quickly as the page answers, counting each click, key press and field filled in, and prints the count and the time; it runs with the playground's tests in CI. On 17 Oct 2026: **28 actions in about 11 seconds** (import 3, tidy 8, annotate 12, export and trace 5). It proves the tasks are achievable and shows how much they ask; it says nothing about how long a person new to Debrief takes, which is what this trial is for.

## Results

*None yet: the trial is pending (17 Oct 2026).*
