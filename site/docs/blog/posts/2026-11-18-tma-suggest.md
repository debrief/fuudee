---
date: 2026-11-18
authors: [ian]
categories: [Capability]
slug: tma-suggest
---

# A suggested first guess for a TMA solution

The first guess's form asked you for a range, a course and a speed, and offered 10,000 yd across the bearing at 8 kn whatever the bearings said. Now it has a **Suggest** button. It fills those three fields from the cuts themselves: the one course and speed that best fit every bearing. You still make the solution, and you still fit it.

<!-- more -->

*A trial. The fit is the classical batch least squares that our research project, gitma2, uses as its yardstick, copied into Debrief so it runs in the playground too. The tracks and bearings are the sample exercise's serial 1, made up as the exercise is.*

## What it does

- **It fills the form, nothing more.** Check the range, course and speed, change them if you like, then **Make solution**. The step is the same as before, and whether the solution is good enough is still yours to say.
- **It waits for ambiguous bearings.** A towed array's cut has two bearings until you keep one, and a fit along the wrong side is confidently wrong. While any of the cuts is ambiguous, **Suggest** is greyed and the form says how many, and to keep a side first: **Select bearings** in Bearings, or **Keep port** or **Keep starboard** in the Tools.
- **It says when bearings cannot give range.** Bearings give range only once ownship has changed course or speed during the period. If it has not, the form keeps your fields and says *BLUE ONE needs to change course or speed during the period for bearings to give range*.
- **It says when one course and speed cannot fit.** If the target manoeuvred in the period, or a side was kept wrongly, the cuts are typically more than 3° off any single leg. The form says so and fills nothing.
- **It names what is far off.** A cut or two far off the fit are wild bearings to leave out once the solution is made. A run of them together drifts off it: the target may have manoeuvred, and a shorter period gives a better guess.

## On serial 1

The walkthrough *Bearings and TMA* fits RED ONE's first leg by hand, moving the solution to 3.27 nmi and shearing it to about 246° at 3.8 knots. With the Bow sonar's cuts from 09:46Z to 10:32Z, which are not ambiguous, **Suggest** gives **3.27 nmi (± 0.12 nmi), 248.3° 3.9 kn**, at an RMS of 1.4°.

The towed array's cuts are refused until a side is kept. Kept to port all through, they fit no one course and speed (typically 13° off), so nothing is offered. Kept, cut by cut, on the side the Bow sonar agrees with, the first leg gives 3.48 nmi, 248° 3.5 kn. The whole period, across RED ONE's turn, is not offered. The second leg gives 201° 5.1 kn, and the wild bearing is named.

## What it is not

It is not a solution generator. It fits one leg, and it does not find the legs: you still split the solution at a manoeuvre, as before. Its ± is two standard deviations of the fit, and on the towed array it once understated the error (0.21 nmi off against ± 0.19). Whether it saves an analyst time has not been measured yet; that is the trial. If it helps, the next step is to suggest where the legs are.

## For agents

`debrief/tma_suggest` takes the cuts as `debrief/tma_create` does, and answers what it would put in the form, or why not. It changes nothing.
