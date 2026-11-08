# Working in this repository

Debrief v4: a VS Code extension and playground over Python domain code, with every boundary type generated from LinkML. Read [docs/engineering.md](docs/engineering.md) before changing code: it names the one place each kind of thing is added and the recipe for each. Requirements are in [docs/srd.md](docs/srd.md); identifiers such as SUB-24 or PAR-09 refer to it and to [docs/panel-parity-srd.md](docs/panel-parity-srd.md).

## Rules that matter most

1. **Add things at their extension point, never by copying a neighbour.** A service method is registered in `debrief_tools.methods`; a command is a flow under `vscode/webview/panels/flows/` registered for both hosts; a message kind is one class in `schemas/linkml/messages.yaml`; a domain operation is a function raising `DomainError`, committed through `Catalogue._change`. If adding your thing means editing a ladder, a tuple or a second host by hand, the extension point is incomplete: fix it in the same pull request, or stop and say so.
2. **Boundary types are generated (PRN-04).** Never hand-write a type that crosses Python and TypeScript. Regenerate with `scripts/generate_schemas.py` and `npm run --prefix ts/schemas generate`; CI checks they are current. A service method's parameters and reply are classes in `schemas/linkml/rpc.yaml`, named by its registration; `python -m debrief_tools rpc-types` prints the extension's types for each method into `vscode/src/generated/rpc.ts`.
3. **Schema versions bump by script.** A file-type change runs `uv run python scripts/bump_schema.py X.Y.Z`; a message or request change does not bump. Never edit a version string by hand.
4. **The third copy is the trigger.** Two hand-written cases are allowed; the third builds the shared mechanism and ports the first two, or a design note under `docs/notes/` says why not.
5. **One tool, one panel or one mechanism per pull request.** A feature travels with its blog post, guide entries and tests (DEV-05). A schema bump that regenerates fixtures is its own pull request.
6. **Tests are fixed, not skipped.** No test is disabled, quarantined or retried to get green. A timing step waits on the status line or a message, never on a delay.
7. **Say what an analyst would say.** User-facing text follows the [language guide](site/docs/guides/style-guide/language.md): British English, glossary terms, no software jargon. Organisations by initial only, unclassified sample data only (DEV-05).

## Before pushing

From the repository root, the same checks CI runs:

```bash
uv run ruff check . && uv run ruff format --check .
uv run python scripts/generate_schemas.py --check && npm run --prefix ts/schemas generate -- --check
uv run pytest
```

```bash
cd vscode && npm run typecheck && npm test && npm run check:theme && npm run check:language && npm run check:panels
```

Then the slow suite that covers the change: `DEBRIEF_IT_ONLY=<suite> xvfb-run -a npm run test:integration` for VS Code, `DEBRIEF_PLAY=<play> npm run test:play` for the playground (the plays' names: `node test/play/shards.mjs`; `DEBRIEF_PLAY_PART=<n>` plays CI's part n), `uv run --only-group docs mkdocs build --strict --config-file site/mkdocs.yml` for the site.

## Pull requests

Fill in `.github/pull_request_template.md` truthfully; a CI job reads the boxes. Commit messages name the requirement or review finding served, as in `(review finding 2)` or `SUB-24`. Decisions go in the current decision log under `docs/`, not the delivery plan. A new mechanism gets a design note under `docs/notes/` and a recipe in `docs/engineering.md`.
