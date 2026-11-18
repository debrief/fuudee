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
- **One course, one speed.** A target that manoeuvres in the period fits badly; the RMS says so, and the analyst splits the solution as now. Proposing the legs is stage B.
- **Hidden cuts are left out**, as the RMS leaves them out; at least five cuts with an origin are needed (four unknowns and a residual).
- **A flat plane** about the first cut's origin: the solution itself is dead reckoned along geodesics, so a guess from tens of kilometres differs from the plane's by metres, which the analyst's fit absorbs.
- **The notes say it.** The suggestion's note is shown under the form; the made solution's step records the first guess as given, as now.

## Stage B, if stage A helps

gitma2's time-late search (`ctl`: a declared history at margin 1, quiet probability 0.01) proposing the leg split times and two or three candidate tracks over the whole period, as a background job with progress (a minute for 30 minutes of bearings, hours for six), applied by the analyst as ordinary undoable splits and drags. Its candidate probabilities are calibrated only on its simulator's manoeuvre statistics and are overconfident when those are wrong, so they would be shown as a rank. Stage B is decided on stage A's trial: how many drags and how long an analyst takes to reach an RMS near the bearings' accuracy on the walkthrough's sample, with and without Suggest.
