# Changes

## 0.1.0, 29 Oct 2026

The first pilot release, the Phase 3 exit (NFR-12, DEP-01, DEP-02): the shared core, installed from a VSIX file.

- **One VSIX for each platform:** Windows (x64), Linux (x64), macOS on Apple silicon (arm64) and macOS on Intel (x64). Each comes with its own Python 3.12 and Debrief's Python packages, so you need no Python of your own and nothing is downloaded when you install or first start Debrief.
- **Developers** can still choose another Python with **Debrief: Python** in Settings, or `DEBRIEF_PYTHON`. Run from source, Debrief uses `python3` (`python` on Windows) as before.
- What is in the core: catalogues, the map, the time controller, track operations, annotations, the Tote, the Timeline and narrative, collation, sensor bearings and TMA solutions, exported images and five walkthroughs. See the [delivery plan](https://github.com/debrief/fuudee/blob/main/docs/delivery-plan.md) for each.
