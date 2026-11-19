# A suggested first guess for a TMA solution

*Product owner, 18 Nov 2026: trial gitma2's work in Debrief, stage A ("A then B"); NumPy port, not a dependency; refused while bearings are ambiguous, asking the analyst to resolve them.*

## What it is

**TMA solution from cuts…** opens the first guess's form in Bearings: a range along the first cut's bearing, a course and a speed. The analyst types them, or takes Debrief's (10,000 yd, across the bearing, 8 kn). **Suggest** fills the same three fields from the cuts themselves: batch least squares on one course at one speed, the classical solve that gitma2 (`debrief/gitma2`) holds as its reference and that its learned components were measured against. The analyst then makes the solution as before and fits it by dragging. Nothing is made by Suggest, and whether the solution is good enough stays the analyst's decision (PRN-08). This is why it amends CAP-21 rather than reversing it: SATC and solutions fitted by Debrief stay out of scope.

## Why least squares, and not gitma2's learned models

gitma2's findings: a learned real-time model added little over a classical one (+0.007 in Gate 2), and its uncertainty was overconfident (95% intervals covered 0.60), so it must not be shown as one. A learned whole-period model was stopped (study L). What gitma2 offers that is sound is classical: least squares for a leg (here), and for a whole period its time-late search `ctl` with candidate tracks (stage B, below).

## Where it lives

| Part | Place |
| --- | --- |
| The solve | `debrief_kernel.tma_fit`: gitma2's `references/lsq.py` (grid start, 12 ranges 1–40 km × 8 courses × 3 speeds; Levenberg–Marquardt), NumPy only, so Pyodide runs it in the playground. Held to gitma2's answers by `python/debrief-kernel/tests/data/gitma2-lsq.json`, made by the script beside it in a gitma2 checkout. |
| The domain | `debrief_stac.tma.suggest` and `Catalogue.tma_suggest`: the cuts as `tma_create` roots them, on a plane about the first cut's origin (geodesic range and bearing), the answer back as the form's range, course and speed. |
| The method | `debrief/tma_suggest` (reading; `TmaSuggestParams`, `TmaSuggestReply` with `TmaSuggestion`). |
| The view | **Suggest** on the first guess's form; `tma_suggest` and `tma_suggested` messages; each host asks Python as it asks for residuals. |

It is a service method by its recipe (engineering guide §2), so it needs no recipe of its own.

## Decisions

- **Ambiguous cuts refuse it** (product owner, 18 Nov 2026). A fit along the wrong side is confidently wrong, and the solve cannot tell which side is the contact. While any cut shown in the period is ambiguous and unresolved, Suggest is disabled and says how many, naming the ways to keep a side (Select bearings in Bearings; Keep port or Keep starboard in the Tools); the service refuses with the same words.
- **Offered only where the range is settled.** From bearings alone, range needs ownship to change course or speed during the period. The fit's covariance (the residuals' variance times (JᵀJ)⁻¹) gives the range's spread at the first cut; a guess is offered when two standard deviations are within half the range and the fit converged. Otherwise the form keeps Debrief's guess and says why (*BLUE ONE needs to change course or speed during the period for bearings to give range*). The threshold is a choice for the trial, recorded here.
- **Offered only where one course and speed fit.** The cuts' typical error about the fit, 1.4826 × the median absolute residual (robust to a few wild bearings), must be within 3°; above it, the target manoeuvred in the period or a side was kept wrongly, and the form says so rather than offer a confident wrong answer. Checked before the range, so the analyst hears the likelier cause.
- **Far-off cuts are said.** Residuals over three typical errors (floor 0.1°) are far off the fit. A run of three or more together *drifts* off it: the target may have manoeuvred at or some time before then (the fit bends to absorb part of a turn, so the run starts late and the note does not claim a time), and a shorter period is suggested. Fewer, each over four typical errors, are wild bearings, to be left out once the solution is made (four, not three, from 19 Nov 2026: at three, about one of 334 clean cuts crossed by chance and was named one). Proposing the legs themselves is stage B.
- **One course, one speed.** As the form's guess is: one leg.
- **Hidden cuts are left out**, as the RMS leaves them out; at least five cuts with an origin are needed (four unknowns and a residual).
- **A flat plane** about the first cut's origin: the solution itself is dead reckoned along geodesics, so a guess from tens of kilometres differs from the plane's by metres, which the analyst's fit absorbs.
- **The solution is the fit itself** (18 Nov 2026, found on serial 4). At first the form put Suggest's range along the first cut's measured bearing, as a typed guess is. That bearing carries the cut's own error, so the whole solution was shifted sideways; with the target on one side throughout, every error fell on one side (mean −2.4°, RMS 2.9° against the fit's 1.5°, made worse by the form's rounding of speed to 0.1 kn). Pinning the fit to that bearing removed the bias but moved the start 0.8 nmi from the truth. Instead the reply gives the fit's `start_position`, and the form sends it with the unrounded course and speed while its fields read as filled: the solution made then has the fit's RMS (1.516° against 1.515°) and errors either side of zero. The remaining difference, the plane the fit works on against the solution's geodesics, is under 0.1°.
- **The notes say it.** The suggestion's note is shown under the form; the made solution's step records the first guess as given, as now.

## What it gives on serial 1 (the walkthrough's sample)

Measured 18 Nov 2026 (held by `test_suggest_finds_red_ones_first_leg_from_the_bow_sonar`); the walkthrough reaches 3.27 nmi, 246° 3.8 kn on the first leg and 200° 5.2 kn on the second by hand.

| Cuts | Suggest says |
| --- | --- |
| Bow sonar, 09:46–10:32Z (90 cuts, none ambiguous) | 3.27 nmi (± 0.12), 248.3° 3.9 kn, RMS 1.4° |
| Towed array, any period, sides not kept | Refused: keep a side first |
| Towed array, every cut kept to port | Not offered: typically 13° off one course and speed (the sides are wrong) |
| Towed array, every cut kept to starboard, 09:46–10:32Z | Not offered: range not settled |
| Towed array, each cut kept on the Bow sonar's side, 09:46–10:32Z | 3.48 nmi (± 0.19), 248.3° 3.5 kn, RMS 1.5° |
| The same, 09:46–12:00Z (RED ONE turns at 10:38Z) | Not offered: typically 7.4° off one course and speed |
| The same, 10:38–12:00Z | 3.29 nmi (± 1.19), 201.4° 5.1 kn, RMS 5.3°, the wild bearing named |

What this shows and does not: on one sample, a leg's guess lands where the walkthrough's hand fit does, and the refusals fire where they should. Two standard deviations understated the towed array's range error once (0.21 nmi off against ± 0.19). Nothing here measures an analyst's time: that is the trial's next step.

## Serial 4: a green start (19 Nov 2026)

Serial 4's sensors are quieter (0.5°, against 1.5° and 2° in serials 1 to 3), so a solution of the whole serial can have every error within the 3° cut-off. Suggest on the Bow sonar's 334 cuts gives 2.29 nmi (± 0.18), 241.3° 5.0 kn, RMS 0.5°; the solution made from it has its largest error 1.7°, none beyond 3°, its error pane green from the start. RED ONE was 2.51 nmi off: the bearings fit RED ONE's own track no better (RMS 0.507° against 0.506°), so the difference is not a fault of the fit, but the ± is narrow. It is two standard deviations from the fit's covariance, which assumes one course and speed exactly, and RED ONE wanders a little about its course (the sample's seeded jitter). Read it as a lower bound.

## Stage B, if stage A helps

gitma2's time-late search (`ctl`: a declared history at margin 1, quiet probability 0.01) proposing the leg split times and two or three candidate tracks over the whole period, as a background job with progress (a minute for 30 minutes of bearings, hours for six), applied by the analyst as ordinary undoable splits and drags. Its candidate probabilities are calibrated only on its simulator's manoeuvre statistics and are overconfident when those are wrong, so they would be shown as a rank. Stage B is decided on stage A's trial: how many drags and how long an analyst takes to reach an RMS near the bearings' accuracy on the walkthrough's sample, with and without Suggest.
