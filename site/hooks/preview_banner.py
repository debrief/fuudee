"""Marks a pull-request preview as one, with a link back to its pull request.

When PREVIEW_PR is set (by .github/workflows/preview.yml), every page gets a
banner naming the pull request, the commit it was built from and a link to
all previews, and the build writes preview.json for the index of previews.
Previews are kept after their pull requests close, so this is how a reader
of an old preview knows what they are looking at.
"""

import json
import os
import re
from datetime import UTC, datetime
from html import escape
from pathlib import Path

STYLE = (
    "background:#fff4ce;color:#3b2f00;border-bottom:1px solid #e0c060;"
    "padding:6px 16px;font:14px/1.4 system-ui,sans-serif;text-align:center"
)
LINK = "color:inherit;text-decoration:underline"


def _preview() -> dict[str, str] | None:
    number = os.environ.get("PREVIEW_PR")
    if not number:
        return None
    return {
        "number": number,
        "title": os.environ.get("PREVIEW_PR_TITLE", ""),
        "url": os.environ.get("PREVIEW_PR_URL", ""),
        "sha": os.environ.get("PREVIEW_SHA", "")[:7],
        "built": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
    }


def on_post_page(output, page, config, **kwargs):
    preview = _preview()
    if preview is None:
        return output
    previews = config["site_url"].rstrip("/").rsplit("/", 1)[0] + "/"  # the folder of pr-N folders
    number = escape(preview["number"])
    pull = f'<a style="{LINK}" href="{escape(preview["url"])}">pull request #{number}</a>'
    title = f": {escape(preview['title'])}" if preview["title"] else ""
    built = f" Built from {escape(preview['sha'])}" if preview["sha"] else " Built"
    banner = (
        f'<div class="pr-preview-banner" style="{STYLE}">Preview of {pull}{title}.'
        f"{built} on {escape(preview['built'])}. "
        f'<a style="{LINK}" href="{escape(previews)}">All previews</a></div>'
    )
    return re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + banner, output, count=1)


def on_post_build(config, **kwargs):
    preview = _preview()
    if preview is not None:
        target = Path(config["site_dir"]) / "preview.json"
        target.write_text(json.dumps(preview, indent=1) + "\n", encoding="utf-8")
