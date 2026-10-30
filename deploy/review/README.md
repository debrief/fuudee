# The review copy on Heroku

VS Code in the browser ([code-server](https://github.com/coder/code-server)) with the Debrief extension, its Python tool service and the sample catalogue (DEP-08), for stakeholders to review from a browser that blocks WebAssembly. Why, and what it risks: [the decision record](../../docs/notes/hosted-review.md).

Nothing persists. Every start copies a fresh workspace from the image, so a restart (at least daily on Heroku) resets it.

## What is in it

| File | Does |
| --- | --- |
| [`heroku.yml`](../../heroku.yml) | Tells Heroku to build `Dockerfile` from the repository root |
| `Dockerfile` | Packages the extension as a VSIX, installs Debrief's Python packages from `uv.lock` on Python 3.12, builds the sample catalogue and installs the extension into code-server 4.141 (VS Code 1.141) |
| `start.sh` | Copies the seed to `/tmp/debrief-review` and starts code-server on `$PORT` behind `$PASSWORD` |
| `settings.json` | The reviewers' VS Code settings: Debrief's Python, no telemetry, no update checks, no AI features |

## Deploying

Needs the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) and a Heroku account.

```bash
heroku create debrief-review --stack container --region eu
```

```bash
heroku config:set PASSWORD="$(openssl rand -base64 18)" --app debrief-review
```

```bash
git push https://git.heroku.com/debrief-review.git HEAD:main
```

```bash
heroku ps:type web=standard-2x --app debrief-review
```

Send reviewers the address (`heroku apps:info --app debrief-review`) and the password (`heroku config:get PASSWORD --app debrief-review`). Setting a new password restarts the app, so everyone signs in again.

To update it, push again. Each push rebuilds the image, which takes several minutes.

## Size

Measured locally, 30 Oct 2026: code-server alone takes about 380 MB, and each open browser window adds an extension host and a tool service, about 300 MB together. So a Standard-2X dyno (1 GB) serves two reviewers at once. More than that, it swaps and slows; past 2 GB, Heroku restarts it. For more reviewers, use `performance-m` (2.5 GB, about seven).

A closed window's memory is freed 10 minutes later (`--reconnection-grace-time`), so a reviewer whose connection drops for less than that carries on where they were.

## Running it locally

```bash
docker build -f deploy/review/Dockerfile -t debrief-review .
```

```bash
docker run --rm -p 8080:8080 -e PORT=8080 -e PASSWORD=review debrief-review
```

Then open http://localhost:8080. Add `--user 12345:12345` to run as a user with no account, as Heroku may.

## Known limits

- **Shared.** Every reviewer works in the same workspace, so they see each other's changes to the plots.
- **No syntax colouring.** VS Code colours text with WebAssembly, which reviewers' browsers block; Debrief's views do not use it.
- **The terminal works.** Anyone with the password has a shell on the dyno. That is why there is a password.
