# Engineering guide

**North Star:** a new tool, panel, message or document kind is added in one place, and CI says if you missed one.

Owner: Ian Mayo (provisional, as the other guides' owners are).

This guide is for whoever changes the code: the team, a contractor, a scientist, or an agent working from `CLAUDE.md`. The user-facing guides (style, interaction models, tool-author) say what Debrief should be; this one says how a change is made so that the next change is no harder than the last. It exists because the [health check of 7 Nov 2026](review-2026-11-07.md) found twelve problems with one cause: there was no document of how a change is made, so every feature was added by copying the nearest example, and the nearest example was always the previous bolt-on.

It grows as the other guides do ([how the guides grow](../site/docs/guides/index.md)): a skeleton first, extended in the same pull request as the change that needs it, every entry citing what it serves, read end to end by its owner at every phase exit.

## 1. The shape of the system

Four layers, each with one job. A change belongs to exactly one of them; a change that needs all four is a new *kind* of thing (section 4).

| Layer | Where | Owns | Must not |
| --- | --- | --- | --- |
| Schema | `schemas/linkml/` | Every type that crosses a process or language boundary (PRN-04) | Hold logic |
| Domain | `python/debrief-*` | All domain logic (PRN-03): catalogues, history, importers, kernel, tools | Know about hosts or pixels |
| Service | `python/debrief-tools/service.py`, `methods.py`, `rpc.py` | The JSON-RPC surface: one registry of methods, each with its parameters model and flags | Hold domain logic or hand-roll parameter checks |
| Hosts | `vscode/src` (VS Code), `vscode/play` (playground), `vscode/webview` (pages shared by both) | Presentation, replaceable (PRN-09). Command logic is written once as a flow against a host interface (PAR-09) | Re-implement a flow or a panel per host |

### The boundaries, and what generates each

PRN-04 says every boundary type is generated. The review found that rule honoured where a boundary was named and missed where it was not, so this table names them all. A boundary not in this table is either new (add it) or hand-written by mistake.

| Boundary | Source | Generated for Python | Generated for TypeScript | Held to by |
| --- | --- | --- | --- | --- |
| Files: plots, STAC, history, provenance | `schemas/linkml/*.yaml` | `debrief_schemas.models` | `@debrief/schemas` | 414 fixtures in 11 kinds, both languages; the cross-language round trip |
| Host-to-page messages | `messages.yaml`, one class per kind under a union on `kind` | same | same, as a discriminated union | `checkMessage` on every post; semantic fixtures in both languages |
| Tool declarations and results | `tools.yaml` | same | same | the tool contract tests in `run.py` |
| Shared state, formatting, config | `state.yaml`, `formatting.yaml`, `config.yaml` | same | same | the shared vectors |
| JSON-RPC parameters and replies | `rpc.yaml`, a parameters class and a reply class per method or family, named by the method's registration (`request=`, `reply=`) | same | same; `RpcMethods` in `vscode/src/generated/rpc.ts`, printed from the registry, types `ToolService.call` per method | `test_rpc_schema.py`: every method but MCP's own names both; the service's tests check every request that succeeds, and its reply, against them (`conftest.py`) |
| Kernel behaviour (units, geodesy, formatting, residuals) | `schemas/vectors/*.json` | `debrief_kernel` | `@debrief/kernel` | 17 vector files, both languages |

### Extension points

Each is the *one* place a thing of its kind is added. If you find yourself adding the same thing somewhere else as well, stop: either the extension point is incomplete (fix it in the same pull request, section 5) or you are adding a new kind of thing (section 4).

| To add a | The one place | What derives from it |
| --- | --- | --- |
| Analysis tool for analysts and agents (TL-04 to TL-06) | `@tool` in `debrief_tools.declare`, a module registered as the [tool-author guide](../site/docs/guides/tool-author/index.md) says | Its form, `tools/list`, worker isolation, provenance, conflicts |
| Service method (`debrief/*`) | `METHODS.register(...)` in `debrief_tools.methods`, with a `Params` model and its `request` and `reply` classes from `rpc.yaml` | `tools/list`, the README's method table (a test holds them equal), the writing, history and agent sets, the input schema, the extension's types for it (`rpc.ts`, a test holds them equal) |
| Domain operation on a plot | A function in that domain's module under `debrief_stac` returning `(changes, note, record)`, raising a `DomainError`; committed through `Catalogue._change`, the only commit path | The history step, its provenance, the error the analyst sees |
| Command offered in both hosts | A flow under `vscode/webview/panels/flows/`, registered through `registerCommands` from `flows/register.ts` | Both hosts' command tables (`registration.test.ts` holds them equal), the action catalogue, context menus (PAR-05 to PAR-08) |
| Panel or view in VS Code | A `WebviewHost` owner under `vscode/src/panels/`; a pop-out through `PoppableView` | Ready-gating, startup marks, retention, posting |
| Message kind to a page | One class in `messages.yaml` under the `WebviewMessage` union | Both languages' types, `checkMessage`, the page's narrowing on `kind` |
| Document kind in a file | A class in the schema, a fixture directory under `schemas/fixtures/`, a version bump (section 3) | Both languages' validators and tests |
| Importer | `debrief_io`, registered as the others are | The import flow's choices |

## 2. Recipes

Each recipe lists every file a change of that kind touches. **A recipe that grows past the files listed here is a finding**: fix the extension point, do not extend the recipe. Numbers in the review for each are given so the reasoning is traceable.

### Add a service method (review finding 1)

1. A `Params` subclass in `method_params.py` (or the domain's existing Pydantic model, through `shaped`).
2. Its parameters class and reply class in `schemas/linkml/rpc.yaml` (a method on one plot `is_a` `PlotParams` or `PlotChangeParams`, and answers `PlotReply`, `PlotChangeReply` or a class that `is_a` one), reusing the domain's classes; regenerate (`scripts/generate_schemas.py`, `npm run --prefix ts/schemas generate`). A request type: no version bump, a line in `schemas/CHANGELOG.md`.
3. The handler, registered with `METHODS.register(name, does, params, writes=…, agent=…, history=…, request=models.XParams, reply=models.XReply)`. A writing method is also a history method and needs `agent` (SUB-24; review finding 9).
4. Its tests under `python/debrief-tools/tests/`, against the service `client` fixture: every reply they receive is checked against its class, and the run says which typed methods no test exercised.
5. Run `uv run python -m debrief_tools methods` to print the README's method table and paste it, and `uv run python -m debrief_tools rpc-types > vscode/src/generated/rpc.ts`; tests fail if either differs from the registry.
6. Its wrapper in `vscode/src/service.ts`, through `call("debrief/x", …)`, typed by `RpcMethods`.

Not touched: `KNOWN_METHODS`, group tuples, elif ladders, the module docstring. If any of those still needs editing, that is a regression of finding 1.

### Add a domain operation (review finding 4)

1. A function in the domain's module under `debrief_stac` (annotations, sensors, tma, tracks, …), `(plot, …) -> (changes, note, record)`, raising that module's `DomainError` subclass with words for the analyst.
2. The `Catalogue` method that wraps it in `_change`. Nothing else catches errors; `_change` and the RPC layer map a `DomainError` to the invalid-parameters code, a locked or full store to a retryable code, and damaged history to a re-open code.
3. Tests in `python/debrief-stac/tests/`.

### Add a command to both hosts (review finding 2)

1. A flow module under `vscode/webview/panels/flows/`, written against `FlowHost` (asks, messages, service calls, files) and, if registering needs more, a small host interface of its own.
2. Its command ids in that module's `CommandIds`, registered with `registerCommands`.
3. Both `src/extension.ts` and `play/host.ts` call the module's register function. If one needs a different line from the other, the difference goes into the feature's host interface, not into the host.
4. `package.json` contributes the command, its menu placement and keybinding; `scripts/menus.mjs` derives the playground's menus from it.
5. A unit test for the flow against the recording fake host (`test/unit/flows.test.ts`); `registration.test.ts` already holds that both hosts register the same set.
6. Its guide entry (an interaction model, or an extension to one) and the playground review checklist if it is a host difference (PAR-19).

### Add a panel (review finding 7)

1. A `WebviewHost` owner under `src/panels/`; its retention in `RETAIN_CONTEXT_WHEN_HIDDEN`; a `PoppableView` if it pops out.
2. The page under `webview/`, its controller as a pure class (`*control.ts`) with a jsdom unit test, its DOM half thin.
3. Its message kinds (below).
4. The playground's panel in `play/`, through the same page and flows: its row in `play/panels.mjs` (`PANELS`, titled as its VS Code view is named, and a group in `DEFAULT_GROUPS`), its `<section class="panel" id="panel-<name>">` in `play/index.html`, and its name in `play/host.ts`'s `OPTIONAL` and default `panels` list so a blog's demo can choose it.
5. Its view in `package.json` (`contributes.views`), registered in `src/extension.ts`.
6. Its plays: a module under `test/play` exporting `plays` (`{ name, cost, start | after, play }`, `test/play/shards.mjs`); CI's parts are made from them, so nothing else is edited. Its tracer suite (section 6), its walkthrough step if any (`vscode/walkthroughs/tours.json`), its interaction model (a row in `site/docs/guides/interaction-models/index.md`, which places it in the nav; `mkdocs.yml` is not edited), its blog post (DEV-02) with its demo's `data-demo="?panels=..."`, and its name in the browser layout guide's **Panels.** list.
7. `npm run check:panels` (`scripts/check-panels.mjs`, in CI) holds all of these to each other: package.json's views and their registration and retention, the playground's table, page and host, every `data-demo` and `data-page` in the site, every view a when clause, walkthrough or command names, the walkthroughs' `focus:` targets, and the browser layout guide. A missing one fails with the file and what to add.

### Add a message kind (review finding 3)

1. One class in `schemas/linkml/messages.yaml`, under the union, with its members; no bump (section 3).
2. Regenerate both languages (`scripts/generate_schemas.py`, `npm run --prefix ts/schemas generate`); CI checks they are current.
3. A fixture under `schemas/fixtures/messages/`, valid and, where a member has a rule, an `invalid/semantic` case.
4. The host posts it typed (`MessageOf<"show_x">`); the page narrows on `kind`. No casts.

### Add a document kind or change a file type (review finding 8)

1. The schema change.
2. `uv run python scripts/bump_schema.py X.Y.Z`: never by hand. It rewrites every fixture and test, reseals histories, stubs the CHANGELOG and regenerates.
3. The CHANGELOG entry, written for whoever opens an older file.
4. A migration in both registries if the change can be migrated; before 1.0.0 none is promised, and the CHANGELOG says so.
5. Fixtures for the new kind in both languages' test lists; a guard test for any hand-written fast-path validator.

### Add a schema module or vector

A vector is a fact both languages must agree on. Add the JSON under `schemas/vectors/`, a test in each language that reads it, and nothing that hand-copies the values.

## 3. Policies

Rules the code holds everyone to. Each names its enforcement; an unenforced rule is listed in section 7 until it is enforced.

| Policy | Enforced by |
| --- | --- |
| Generated types are current | CI `schemas` job, both generators with `--check` |
| Both languages open the same files the same way | the cross-language round trip, 129 documents |
| A file-type change bumps the version; a message or request change does not | `bump_schema.py --check` under test; the CHANGELOG test |
| Every writing method records who made the change (SUB-24) | `Methods.add` refuses a writing method outside history; the service refuses a call without `agent` |
| The README's method table is the registry | `test_methods.py` |
| Both hosts register the same commands (PAR-09) | `registration.test.ts` |
| Every message posted is valid | `checkMessage` before every post, both hosts |
| User-facing text follows the language guide; no hard-coded colours | `check-language.mjs`, `check-theme.mjs` |
| A panel is registered alike in both hosts, the demos, the walkthroughs and the guides | `check-panels.mjs` |
| A guide is in the site's nav | `site/hooks/guides_nav.py` builds the Guides nav from the folder, in the order each folder's `index.md` links its pages; one not linked fails the strict build |
| The playground's CI parts are balanced and complete | `test/play/shards.mjs` makes CI's matrix from every module's `plays` |
| Walkthrough steps match in both hosts | `scripts/walkthroughs.mjs` from one `tours.json` |
| The pull-request checklist is filled in | `pr-checklist.yml` |
| Generated paths are collapsed in review | `.gitattributes` |
| Legacy-sample importer paths are exercised | **unenforced**: 12 tests skip without `DEBRIEF_LEGACY` (section 7) |
| Red checks do not merge | **branch protection on `main`**, requiring `schemas`, `vscode`, `playground`; confirm it is on (section 7) |

## 4. When to generalise

The review's root pattern: a first hand-written case became the template for sixty. The rule that would have stopped it:

**The third copy is the trigger.** Two of a thing may be written by hand. When a third is needed, the pull request that adds it either builds the extension point (section 1) and ports the first two, or opens a design note saying why not. A reviewer who sees a third copy asks for one or the other.

**A new kind of thing gets a design note first.** When a change does not fit any recipe in section 2 (a new boundary, a new host, a new place things are registered), write a short note under `docs/notes/` before the code: the question, the shape chosen, what it replaces, the recipe it will add to this guide. The spikes (`docs/spikes/`) and decision logs are the existing shapes for a question and a decision; a design note is the shape for a mechanism. One page; the pull request links it.

**Hand-written where generated exists is a finding**, not a shortcut. If the generator cannot express something, fix the generator (`docs/spikes/linkml.md` lists the workarounds) or record the exception in the boundary table with its reason.

## 5. Pull requests

- **One tool, one panel, or one mechanism per pull request.** The review measured a mean of 69 files; a reviewer cannot see drift in that. A feature with its blog post and guide entries is one pull request (DEV-05); a schema bump that regenerates fixtures is its own, before the feature that needs it.
- **The template is read by CI.** The checklist in `.github/pull_request_template.md` fails the `PR checklist` job when unticked. Tick what is true, not what is wanted.
- **A pull request that touches an extension point ports what it finds.** If adding your method means editing a ladder that should not exist, delete the ladder in the same pull request, or in one just before.
- **Run before pushing**, from the repository root; CI runs the same:

```bash
uv run ruff check . && uv run ruff format --check .
uv run python scripts/generate_schemas.py --check && npm run --prefix ts/schemas generate -- --check
uv run pytest
```

```bash
cd vscode && npm run typecheck && npm test && npm run check:theme && npm run check:language && npm run check:panels
```

Then whichever slow suite covers the change: `DEBRIEF_IT_ONLY=<suite> npm run test:integration` for VS Code, `DEBRIEF_PLAY=<play> npm run test:play` for the playground (the plays' names: `node test/play/shards.mjs`; `DEBRIEF_PLAY_PART=<n>` plays CI's part n), `mkdocs build --strict` for the site.

- **Commit messages name the review finding or requirement** the change serves, as the recent ones do (`(review finding 2)`, `SUB-24`), so `git log` answers why.

## 6. Tests

Which layer owns what, so each new feature adds the right tests and not a longer script.

| Layer | Runs in | Owns | Budget |
| --- | --- | --- | --- |
| Python unit and service tests | `pytest` | Domain logic, every method, every error path; the service `client` fixture for RPC | 1,971 tests in under 3 minutes; the service tests share a worker where they can |
| Vitest unit | `vscode`, `ts/*` | Kernel and controller logic (`*control.ts` under jsdom), flows against the fake host, parity tests | Seconds; no wall-clock assertions unless behind an opt-in flag |
| Tracer | `test/integration`, real VS Code | One Mocha suite per feature after `smoke`; each sets up its own serial; `DEBRIEF_IT_ONLY` to run one | Each test 5 minutes, the run 20, in two VS Code versions as a CI matrix |
| Play | `test/play`, Chromium | Every demo under CSP with message validation; each module's `plays`, shared out into CI's parts by cost (`shards.mjs`), each unit on a fresh page | Each part about 4 minutes (`BUDGET`) |

Rules:

- A panel's logic is tested in vitest; the tracer and play suites show it works in a host, they do not test it.
- A timing-sensitive step waits on the status line or a message, never on a delay. A flake is a bug in the test; it is fixed, not retried, and never quarantined.
- A new play is a descriptor in its module's `plays`: `start` (`blank`, `ready` or `arranged`) for one on a page of its own, `after` for one that needs the page a play leaves; its `cost` the seconds it takes in CI (the run prints each play's). The parts, and how many, follow; a unit of plays is never split, so a play that does not need the page before it starts its own.
- The 12 importer tests gated on `DEBRIEF_LEGACY` are a known gap until the legacy samples can be committed or synthesised.

## 7. Open items and rules not yet enforced

Kept here so they are seen at every phase exit, not rediscovered by the next review.

- The service's `Params` models (`method_params.py`) are still hand-written beside the generated parameters classes (`rpc.yaml`): a test holds that each reads only what its class describes and needs what it requires, but the refusals' words live in the models. MCP's own methods (`initialize`, `ping`, `tools/list`, `tools/call`) are not described in `rpc.yaml`.
- Branch protection on `main` requiring the three jobs (fix plan 1): confirm in the repository settings; the review found none.
- `DEBRIEF_LEGACY` importer tests never run in CI.
- The review image on Heroku is never built by CI; VS Code's version is pinned in three places.
- No CODEOWNERS; guide owners are one person, provisional.

## 8. Health check

The review's metrics are re-measured at each phase exit and appended here, so accretion shows as a trend. The first row is the review's baseline.

| Date | `extension.ts` lines | `host.ts` lines | `catalogue.py` lines | Hand-written methods outside the registry | Mean files per PR | CI runs failed of last 100 | Fixture files per bump |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 Nov 2026, review baseline (commit `97be7e3`) | 3,356 | 4,053 | 3,092 | 65 | 69 | 30 (28 playground) | about 172 |
| 7 Nov 2026, after fix plan 1 to 5, 7 to 11, 13 (commit `f094f3c`) | 2,407 | 4,167 | 3,026 | 0 | not re-measured | not re-measured | 0 by hand (`bump_schema.py`) |

A number that moves the wrong way for two phases running is a finding for the next review. The playground host grew while the flows were shared because each feature's playground glue moved into it; it falls when the remaining features move to flows (fix plan 10).
