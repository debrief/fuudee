# Playground review checklist

For reviewing a change in the playground (PAR-19, [panel-parity-srd.md](../panel-parity-srd.md)). The playground runs the same panel models, action catalogue, flows, message glue and walkthrough table as VS Code. It differs only as [§5 of the SRD](../panel-parity-srd.md#5-permitted-host-differences) allows. Anything else you see differ is a defect: report it.

## What the playground cannot show

Check these in VS Code, not in the playground:

- [ ] **Files on disk.** VS Code saves and opens files on disk; the playground uploads and downloads them. The questions are the same, so check the file handling itself in VS Code.
- [ ] **Catalogue management.** Add catalogue, Add plot file, Refresh, and choosing a catalogue on import. The playground has one in-browser catalogue.
- [ ] **Bearings pop-out window.** VS Code only.
- [ ] **Where view state persists.** VS Code keeps it in webview state; the playground uses `localStorage`. Check that a view's state survives a reload in VS Code.
- [ ] **Native rendering.** QuickPicks, the native tree and the codicons are VS Code's. The playground draws inline forms, an HTML tree and its own icon artwork. Check spacing, focus and icons in VS Code.
- [ ] **Sidebar and panel areas.** VS Code places views in its sidebar and panel; the playground uses tab groups.

## What only the playground has

These are allowed. Don't copy them into VS Code:

- [ ] The **Try** menu, **Reset layout** and the sample-plot list.
- [ ] The top-bar **Plot** list, a shortcut beside the Catalogues tree.
- [ ] The top-bar **Export** menu, a shortcut beside the map's title bar.
- [ ] The next-walkthrough button below the steps. VS Code offers the same with a link on the last step and a notification, in the same words.
- [ ] The **Starting Python…** state. It must use VS Code's loading row and disabled reasons, not new ones.

## What must match

If any of these differ between the hosts, it is a defect:

- [ ] Rows in the Outline, Catalogues, Tools and History: labels, details, tooltips, icons and what a screen reader hears.
- [ ] Context menus and title-bar actions: titles, order, grouping, and which are disabled and why.
- [ ] The questions a flow asks, in the same order, with the same defaults and the same messages afterwards.
- [ ] Which walkthrough step a change ticks, and what each step's button does.
- [ ] A webview message the host refuses. The play tests fail on `webview_message_refused`.
