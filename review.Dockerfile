# The review copy of Debrief: VS Code in the browser (code-server) with the extension
# and the Python tool service, on the sample data. See deploy/review/README.md.
# At the repository root because Heroku builds with the Dockerfile's folder as its context (heroku.yml).

# The extension, packaged as a VSIX (DEP-02).
FROM node:22.22.0-bookworm-slim AS extension
WORKDIR /src
COPY schemas schemas
COPY ts ts
COPY vscode vscode
RUN for p in schemas kernel config; do npm ci --prefix ts/$p && npm run --prefix ts/$p build; done
RUN cd vscode && npm ci && npx --yes @vscode/vsce@4.0.0 package --no-dependencies --skip-license \
      --allow-missing-repository \
      --baseContentUrl https://github.com/debrief/fuudee/blob/main/vscode \
      --baseImagesUrl https://github.com/debrief/fuudee/raw/main/vscode \
      -o /debrief.vsix

# 4.141 is VS Code 1.141, the version the integration test runs.
FROM codercom/code-server:4.141.0
USER root
COPY --from=ghcr.io/astral-sh/uv:0.11.20 /uv /usr/local/bin/uv

# Debrief's Python packages at the lockfile's versions, on the Python CI uses.
ENV UV_PYTHON_INSTALL_DIR=/opt/python UV_LINK_MODE=copy UV_NO_CACHE=1
WORKDIR /opt/debrief-src
COPY pyproject.toml uv.lock ./
COPY python python
RUN uv export --frozen --no-dev --no-editable --no-hashes \
      --package debrief-tools --package debrief-sample --package debrief-config -o requirements.txt \
 && uv venv --python 3.12 /opt/debrief \
 && VIRTUAL_ENV=/opt/debrief uv pip install -r requirements.txt

# The seed start.sh copies to /tmp/debrief-review: the sample catalogue (DEP-08) in the
# workspace, a configuration naming it, the user settings and the installed extension.
COPY --from=extension /debrief.vsix /opt/review/debrief.vsix
COPY deploy/review/settings.json /opt/review/seed/user-data/User/settings.json
COPY deploy/review/start.sh /opt/review/start.sh
RUN /opt/debrief/bin/python -m debrief_sample build /opt/review/seed/workspace/exercise \
 && /opt/debrief/bin/python -c "from pathlib import Path; from debrief_config import add_store, update_config; \
update_config(lambda c: add_store(c, title='Sample exercise', location='/tmp/debrief-review/workspace/exercise')[0], \
Path('/opt/review/seed/config.json'))" \
 && code-server --extensions-dir /opt/review/seed/extensions --install-extension /opt/review/debrief.vsix \
 && chmod -R a+rX /opt/review /opt/debrief /opt/python

USER coder
WORKDIR /tmp
# The base image's entrypoint would pass CMD to code-server as arguments.
ENTRYPOINT []
CMD ["dumb-init", "/opt/review/start.sh"]
