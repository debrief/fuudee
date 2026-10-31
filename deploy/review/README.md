# The review copy on Heroku

VS Code in the browser ([code-server](https://github.com/coder/code-server)) with the Debrief extension, its Python tool service and the sample catalogue (DEP-08), for stakeholders to review from a browser that blocks WebAssembly. Why, and what it risks: [the decision record](../../docs/notes/hosted-review.md).

Nothing persists. Every start copies a fresh workspace from the image, so a restart (at least daily on Heroku) resets it.

## What is in it

| File | Does |
| --- | --- |
| [`heroku.yml`](../../heroku.yml) | Tells Heroku to build `review.Dockerfile` |
| [`app.json`](../../app.json) | Tells a pipeline how to make a review app (below) |
| [`review.Dockerfile`](../../review.Dockerfile) | At the repository root, because Heroku builds with the Dockerfile's folder as its context. Packages the extension as a VSIX, installs Debrief's Python packages from `uv.lock` on Python 3.12, builds the sample catalogue and installs the extension into code-server 4.141 (VS Code 1.141) |
| `start.sh` | Copies the seed to `/tmp/debrief-review` and starts code-server on `$PORT` behind `$PASSWORD`, or open to all without one |
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

## Review apps

The `fuudee` pipeline makes a review app of each pull request, a preview of that change in VS Code; GitHub links to it from the pull request. [`app.json`](../../app.json) tells Heroku how: the container stack, a Basic dyno and an optional `PASSWORD`.

- Set `PASSWORD` once, in the pipeline's **Review apps → Configure → config vars**, so every review app shares it.
- **Without `PASSWORD`, a review app is open to anyone with its address**, and the terminal gives them a shell on the dyno. Scanners look for open code-server instances, so keep such an app for a short test and destroy it afterwards.
- Each review app is a Basic dyno (512 MB) of its own, billed while it exists, and destroyed when its pull request closes. Basic is enough for one reviewer at a time (decision, Ian Mayo, 31 Oct 2026); it swaps with more. Set stale review apps to be destroyed after a few days without a push.
- Only a branch with `heroku.yml` and `app.json` (this one, and `main` once it is merged) can make one. A pull request opened before that needs `main` merged into it first.

## Size

Measured locally, 30 Oct 2026: code-server alone takes about 380 MB, and each open browser window adds an extension host and a tool service, about 300 MB together. So a Standard-2X dyno (1 GB) serves two reviewers at once. More than that, it swaps and slows; past 2 GB, Heroku restarts it. For more reviewers, use `performance-m` (2.5 GB, about seven).

A closed window's memory is freed 10 minutes later (`--reconnection-grace-time`), so a reviewer whose connection drops for less than that carries on where they were.

## Running it locally

```bash
docker build -f review.Dockerfile -t debrief-review .
```

```bash
docker run --rm -p 8080:8080 -e PORT=8080 -e PASSWORD=review debrief-review
```

Then open http://localhost:8080. Add `--user 12345:12345` to run as a user with no account, as Heroku may.

## Known limits

- **Shared.** Every reviewer works in the same workspace, so they see each other's changes to the plots.
- **No syntax colouring.** VS Code colours text with WebAssembly, which reviewers' browsers block; Debrief's views do not use it.
- **The terminal works.** Anyone with the password has a shell on the dyno. That is why there is a password.
