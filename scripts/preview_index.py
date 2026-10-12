"""Writes the index of pull-request previews, newest first.

    python scripts/preview_index.py <pr-preview folder> <index.html>

Each preview is a folder pr-N holding the built site and, from when previews
started recording it, preview.json (site/hooks/preview_banner.py).
"""

import json
import re
import sys
from html import escape
from pathlib import Path

PAGE = """<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Debrief v4 previews</title>
<style>
:root {{ --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --line: #d1d9e0; --link: #0969da; }}
@media (prefers-color-scheme: dark) {{
  :root {{ --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d; --link: #4493f8; }}
}}
body {{ background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif;
  max-width: 820px; margin: 0 auto; padding: 24px 16px; }}
a {{ color: var(--link); }}
p.lead {{ color: var(--muted); }}
ul {{ list-style: none; padding: 0; }}
li {{ border-top: 1px solid var(--line); padding: 10px 0; }}
.meta {{ color: var(--muted); font-size: 13px; }}
</style>
</head>
<body>
<h1>Debrief v4 previews</h1>
<p class="lead">Every pull request that changed the site was previewed, and each preview is kept,
so earlier versions can still be read and played with. The published site is
<a href="../">here</a>.</p>
<ul>
{items}
</ul>
</body>
</html>
"""


def main(folder: Path, out: Path) -> None:
    previews = []
    for child in folder.iterdir():
        match = re.fullmatch(r"pr-(\d+)", child.name)
        if not (match and child.is_dir() and (child / "index.html").exists()):
            continue
        info = {"number": match.group(1)}
        if (child / "preview.json").exists():
            info |= json.loads((child / "preview.json").read_text(encoding="utf-8"))
        previews.append(info)
    previews.sort(key=lambda p: int(p["number"]), reverse=True)
    items = []
    for p in previews:
        number = escape(p["number"])
        title = f" {escape(p['title'])}" if p.get("title") else ""
        meta = []
        if p.get("url"):
            meta.append(f'<a href="{escape(p["url"])}">pull request #{number}</a>')
        if p.get("sha"):
            meta.append(f"built from {escape(p['sha'])}")
        if p.get("built"):
            meta.append(escape(p["built"]))
        items.append(
            f'<li><a href="pr-{number}/"><strong>#{number}</strong>{title}</a>'
            f'<div class="meta">{" · ".join(meta)}</div></li>'
        )
    out.write_text(PAGE.format(items="\n".join(items)), encoding="utf-8")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
