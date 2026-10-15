# Do the sidebar's three webviews slow startup?

**Question (product owner, 15 Oct 2026).** The Debrief sidebar now holds three webview views: Time (`debrief.time`), Tote (`debrief.tote`, collapsed by default) and Timeline (`debrief.timeline`), beside the native Catalogues, Outline, Tools and History trees. Does having several webviews slow startup, and would one composite webview be quicker? Measure before deciding.

**Answer.** Yes, a little, but not much. Opening the sidebar with a plot open, the views are usable in about 0.4 s on the CI machine (median; p90 about 0.85 s). One view alone takes 0.22 to 0.33 s. VS Code loads the views in parallel and loads collapsed ones only when they are expanded, so the collapsed Tote costs nothing. Merging the three into one webview would save about 0.1 s at the median on this machine, less on a laptop. Merging would also give up things VS Code's separate views provide. **Recommendation: keep three views, with small tweaks (below). Pending the product owner's decision.**

## Method

The extension now records when startup steps happen (`vscode/src/startup.ts`). It notes when activation starts and ends. For each webview (the three sidebar views and the map) it notes when VS Code asked for the view (`resolveWebviewView`; for the map, when the panel was created), when its HTML was set, when the page said it was ready, and when the page was first shown something. These marks are always taken and cost one clock read each. Tests and agents read them through the API: `startupTimings()`, beside `toteLatency()`.

With `DEBRIEF_STARTUP_TIMING` set, each page also sends its own marks (`vscode/webview/timing.ts`): when its document began loading, when its script started, when it said it was ready, and when it had drawn a plot (one animation frame after it was shown one). These marks are a message outside the webview message schema. The extension records them and never acts on them. Without the flag, the pages send nothing extra.

`npm run measure:startup` (`vscode/test/integration/startup-run.ts` and `startup.ts`) launches real VS Code 1.141.0 under xvfb, as the integration test does. It uses a production build and the sample exercise. Each scenario runs on a copy of the extension whose `package.json` expands or collapses the three views. Each run is two launches:

- **cold:** a fresh profile.
- **relaunch:** a second launch on the same profile, with the caches the first launch left (Chromium's code and script caches).

Each launch activates the extension, opens serial 1 (the map), opens the Debrief sidebar, and waits for every expanded view to draw the plot. It then waits 3 s more to see whether a collapsed view loads anyway. There were 10 runs per scenario (two batches of 5, scenarios interleaved), so 20 launches per scenario and 120 in all.

**The machine** was the development container: 4 CPUs (Intel Xeon @ 2.30 GHz), Linux, xvfb, `--disable-gpu`, software rendering. It is the same kind of machine CI uses. Expect a typical developer laptop to be noticeably quicker (perhaps half these times), with a narrower spread. The p90s here are dominated by the odd slow launch on a shared 4-CPU container.

**Two limits.** Developer: Reload Window could not be measured: it ends an extension test run. VS Code under test also keeps no layout between launches (its storage is not written), so the relaunch opens the sidebar the same way the first launch did. To cover VS Code starting with the Debrief sidebar already showing, the `default-sidebar-first` scenario opens the sidebar before anything else. That activates the extension, as `onView` does at startup, and the plot is opened after.

## Results

Times are in milliseconds, median / p90, over 10 runs. "From sidebar opened" means from `workbench.view.extension.debrief` being run, with the plot already open. *Ready* means the page has loaded and said so. *Drawn* means the page has drawn the plot. *Sidebar usable* means every expanded view has drawn the plot.

| Scenario (expanded views) | Launch | Activation (activate) | Time ready / drawn | Tote ready / drawn | Timeline ready / drawn | Sidebar usable |
| --- | --- | --- | --- | --- | --- | --- |
| (a) default: Time, Timeline (Tote collapsed) | cold | 106 / 135 | 415 / 842 · 426 / 848 | not loaded | 369 / 800 · 423 / 829 | **426 / 848** |
| | relaunch | 108 / 141 | 540 / 926 · 556 / 950 | not loaded | 563 / 1111 · 645 / 1136 | **645 / 1136** |
| (b) all three | cold | 106 / 119 | 332 / 589 · 352 / 605 | 389 / 737 · 397 / 754 | 378 / 1050 · 411 / 1127 | **411 / 1127** |
| | relaunch | 113 / 129 | 361 / 1055 · 370 / 1079 | 492 / 1150 · 514 / 1161 | 391 / 1169 · 436 / 1260 | **514 / 1281** |
| (c) Time only | cold | 118 / 136 | 209 / 294 · 220 / 311 | not loaded | not loaded | **220 / 311** |
| | relaunch | 105 / 130 | 205 / 533 · 220 / 537 | not loaded | not loaded | **220 / 537** |
| (c) Tote only | cold | 110 / 127 | not loaded | 258 / 344 · 271 / 353 | not loaded | **271 / 353** |
| | relaunch | 115 / 141 | not loaded | 285 / 980 · 302 / 986 | not loaded | **302 / 986** |
| (c) Timeline only | cold | 97 / 118 | not loaded | not loaded | 280 / 862 · 327 / 952 | **327 / 952** |
| | relaunch | 116 / 140 | not loaded | not loaded | 362 / 1095 · 373 / 1158 | **373 / 1158** |
| default, sidebar first (VS Code starting with it showing) | cold | 98 / 116 | 607 / 672 | not loaded | 609 / 671 | 609 / 672 ready; plot drawn 124 / 138 after it is opened |
| | relaunch | 117 / 150 | 631 / 767 | not loaded | 632 / 768 | 632 / 768 ready; plot drawn 116 / 130 after it is opened |

Other timings:

- **Activation** takes about 100 to 120 ms. It ends 1.1 to 1.4 s after the extension host starts; most of that wait is VS Code's own startup.
- **Map, for comparison:** ready 185 to 195 ms after its panel is created, and the plot drawn 380 to 460 ms after (Leaflet, the land layer and the tracks).
- **Sidebar first:** VS Code asks for the views 415 to 445 ms after the sidebar opens. Most of that wait is the extension being loaded and activated. After that, each page takes 160 to 220 ms to load.

Where the time goes, per view (median over all launches of the scenario):

| Step | One view alone | Two or three views together | Map |
| --- | --- | --- | --- |
| Asked for → HTML set (our code) | 0 to 1 | 0 to 1 | 1 to 2 |
| HTML set → page begins loading (VS Code makes the webview's frames) | 80 to 150 | 155 to 190 | 95 |
| Page begins loading → script starts (CSS, bundle fetched and parsed) | 35 to 50 | 80 to 110 | 35 |
| Script starts → ready sent (our page's own code) | 1 to 5 | 2 to 10 | 23 |
| Content sent → drawn (a frame later) | 12 to 23 | 12 to 37 | 180 to 205 |

Our own code is a small share of the time: under 10 ms to start each page, and 12 to 37 ms to draw. The rest is VS Code making and loading a webview, 120 to 300 ms each. With two or three views, those steps stretch because the views compete for the same renderer.

## Lazy and parallel

- **Collapsed views load lazily.** This is documented: `resolveWebviewView` "is called when a view first becomes visible" (`WebviewViewProvider`, VS Code API). It was also confirmed here: in 120 launches, no collapsed view was ever asked for, even 3 s after the sidebar had settled. The collapsed Tote costs nothing at startup. `retainContextWhenHidden` does not change this. It only keeps a view's page alive once loaded, while the view is collapsed or the sidebar shows another container.
- **Expanded views load in parallel.** VS Code asks for every expanded view within 5 ms of the others (median spread 4 to 7 ms). Their pages then load at the same time and become ready within 40 to 120 ms of each other (median spread). They do not load one after another: three views take about as long as two (411 against 426 ms cold), and far less than the sum of the singles (about 820 ms). The cost of the extra views is contention, not queueing. Two views together are ready about 100 to 200 ms later than the quicker of them alone.
- **Relaunch is no quicker than cold.** Warm caches do not help pages this small. The cost is in making the webview, not in fetching the bundle.

## What one composite webview would save

No prototype was built, because the measurements answer the question.

A composite page would pay the cost of one webview (about 120 to 300 ms here). It would also pay the extra script: Time, Tote and Timeline are 16 KB, 12 KB and 29 KB minified (26, 20 and 48 KB in the development build). Each page's script runs in 1 to 10 ms, so the combined bundle costs about 15 ms more than the Timeline alone.

| | Sidebar usable, cold (median) | Relaunch (median) |
| --- | --- | --- |
| Today, default (Time + Timeline) | 426 | 645 |
| Today, all three | 411 | 514 |
| Estimated composite: the slowest single view plus about 15 ms | about 340 | about 390 |
| **Estimated saving** | **about 70 to 90 ms** | **about 120 to 250 ms** (the relaunch medians are noisy) |

So consolidating would make opening the sidebar about 0.1 s quicker at the median on this machine. That is roughly a fifth to a third of the time, and less in absolute terms on a laptop.

When VS Code starts with the sidebar already showing, the views wait about 0.45 s for the extension to activate. A composite would save only the contention: the pages load in lockstep in 160 to 220 ms, so perhaps 50 ms of about 0.6 s. Here the sidebar's median is 0.41 to 0.65 s, near NFR-01's 500 ms for interactive updates. On a laptop it is likely to be well within it, though that was not measured. The occasional p90 of 1.1 s is a slow launch on a shared CI container.

Consolidating would lose things VS Code's separate views give for free:

- each view collapses, resizes and moves on its own, and can be dragged to the panel or the secondary sidebar;
- the Tote's lazy load, which saves its whole cost while it is collapsed;
- the Time view's title menu (*Context tracks*) and description;
- per-view keyboard navigation and screen reader landmarks (`F6`, view headings);
- `Debrief: Focus on Timeline view` and `debrief.timeline.focus`, which the narrative form uses;
- the Tote asking the tool service for values only while it is showing.

A composite would have to rebuild every one of these inside one page: collapsible sections, focus, a lazy Tote, and visibility per section. It would also mean two hosts of each component to keep in step with the playground, whose side panels are already separate.

## Recommendation

**Keep three separate webview views, with tweaks.** The cost is about 0.1 s when the sidebar opens, and it is paid in parallel. A composite would save less than that and lose real features. Tweaks, none of them urgent:

1. **Keep the Tote collapsed by default.** It is then free at startup. Any further webview views should start collapsed too, unless they are needed at a glance.
2. **Keep `retainContextWhenHidden` on all three.** It does not affect startup (collapsed views are still not loaded). Turning it off would mean paying 120 to 300 ms again each time a view is expanded or the sidebar is shown again. The cost is memory: one live page per expanded view.
3. **Re-measure with `npm run measure:startup`** before adding a fourth webview to the sidebar, or if the views' bundles grow past about 100 KB each. Reconsider a composite if the default layout's sidebar takes more than about 0.6 s (cold median, on CI), or if the views together take more than 0.2 s longer than the slowest one alone.
4. Not worth doing now: lighter pages. Our script runs in under 10 ms; VS Code's webview setup dominates.

*Pending the product owner's decision.*
