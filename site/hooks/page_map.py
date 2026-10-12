"""Writes pages.json beside the built site: each page's source file and its URL.

The pull-request preview (.github/workflows/preview.yml) uses it to screenshot
the pages a change touches, blog posts included, whose URLs come from their date
and slug rather than their file name.
"""

import json
from pathlib import Path

_pages: dict[str, str] = {}


def on_pre_build(config, **kwargs):
    _pages.clear()


def on_page_markdown(markdown, page, **kwargs):
    _pages[page.file.src_uri] = page.url
    return markdown


def on_post_build(config, **kwargs):
    target = Path(config["site_dir"]) / "pages.json"
    target.write_text(json.dumps(_pages, indent=1, sort_keys=True) + "\n", encoding="utf-8")
