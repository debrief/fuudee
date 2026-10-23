---
date: 2026-10-24
authors: [ian]
categories: [Capability]
slug: browser-layout
---

# Panels where you need them: a docked layout in the browser

The browser version of Debrief, the playground and the <a href="../../../../../demo/">web demo</a>, had grown thirteen panels in one column beside the map, and analysts scrolled up and down to find them. Now, on any screen 900 pixels wide or more, the panels sit in tab groups around the map, grouped by task, and you can drag them where you want them.

<!-- more -->

*The pictures are the pull request's screenshots, taken by the playground's test on the sample exercise, which is made up. The site's other pictures of the browser are refreshed once the layout is agreed.*

## Before and after

Before, at a laptop's 1366 pixels: one long column of panels on the left, the walkthroughs in a column of their own on the right.

![The playground before: a long side column of panels beside the map](https://raw.githubusercontent.com/debrief/fuudee/pr-screenshots/manual/dock/before-1366.png)

After, the same screen: Time, the Tote, and the Outline with the Catalogue on the left; the map with the Timeline and Coverage under it; the walkthroughs, Tools and History on the right. Nothing scrolls the page, and the map keeps more than half the width.

![The playground's default layout at 1366 pixels, dark theme](https://raw.githubusercontent.com/debrief/fuudee/pr-screenshots/manual/dock/dock-01-default-1366-dark.png)

The same in the light theme. The tabs, borders and handles take their colours from the theme, like everything else in Debrief.

![The default layout at 1366 pixels, light theme](https://raw.githubusercontent.com/debrief/fuudee/pr-screenshots/manual/dock/dock-03-default-1366-light.png)

## Fewer panels, and a top bar

Four panels were things used now and then, so they moved to a slim bar along the top: the **Plot** list, **Import…**, **Export** and **Try**, each a menu that opens under its button. **Import…** is in the Catalogue panel too, where new files arrive. Every control is where it was inside them, by the same name.

That leaves nine panels, grouped by task:

| Where | Panels | For |
| --- | --- | --- |
| Left | Time; Tote; Outline and Catalogue | When, what is where, and what is in the plot |
| Under the map | Timeline and Coverage | The narrative and the data, in time |
| Right | Walkthroughs, Tools and History | Learning, doing, and what was done |

## Make it yours

Drag a tab onto another group to join it, or onto a group's edge to split it. Here History has its own group under the Outline, and Coverage sits beside the walkthroughs, while a tool's form is open beside the map:

![A rearranged layout: History under the Outline, Coverage beside the walkthroughs, a tool's form beside the map](https://raw.githubusercontent.com/debrief/fuudee/pr-screenshots/manual/dock/dock-02-rearranged.png)

Your layout is kept in your browser, its shape only, never anything from a plot. **Reset layout**, in the top bar, puts it back as it started.

Nothing reloads as you do it. The map, a tool's form and its results each run in a frame, and a frame moved in a web page starts again, losing what it showed. So they never move: the map stays where it is and the layout is drawn around it, and Python, running in the background, never notices.

## Without a mouse

The tabs are in the keyboard's order: `Tab` reaches each group, and `←` and `→` move along its tabs, `Enter` bringing one to the front. `Shift+F10` on a tab, or the **⋯** at the end of each group, opens a menu to move the panel to another group (*Move to left: Outline, Catalogue*), or to a group of its own, or to reset the layout. Screen readers hear each group named by where it is and what it holds.

## On a phone

Narrower than 900 pixels, docking is more trouble than help, especially by touch. There, and in the blog's demos, the panels are one column as before, each folding away by its heading, with the top bar above.

![The narrow layout at 390 pixels: the top bar, the map, then the panels in one column](https://raw.githubusercontent.com/debrief/fuudee/pr-screenshots/manual/dock/dock-04-narrow-390.png)

The layout is built with [Dockview](https://dockview.dev), a small open-source docking library, in the browser only: VS Code arranges its own views. More in the guides: the [browser layout](../../guides/interaction-models/browser-layout.md) and its [keyboard equivalents](../../guides/interaction-models/keyboard-equivalents.md).
