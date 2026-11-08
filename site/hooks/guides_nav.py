"""Builds a folder's part of the nav from the folder itself (review of 7 Nov 2026, finding 7).

In mkdocs.yml, a nav entry whose value is a folder ending in "/" (``- Guides: guides/``)
becomes that folder's pages: its index.md first, then each page and subfolder in the
order the index first links to them. A subfolder with pages of its own becomes a
section, named by its index's heading; one with only an index is a page. Every other
page is named by its own first heading, as the hand-written nav named them.

A new guide therefore needs no edit here: linking it from its folder's index, as each
index already lists its guides, places it. A page or subfolder the index does not link
to is a warning, so the strict build fails and says which index to link it from.
"""

import logging
import re
from pathlib import Path

log = logging.getLogger("mkdocs.plugins.guides_nav")

# A Markdown link's target ending in .md: "](style-guide/language.md" or "](tote.md#keys".
_LINK = re.compile(r"\]\(([^)\s#]+\.md)")


def _heading(page: Path) -> str:
    for line in page.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    raise ValueError(f"{page} has no first heading (# ...) to name it in the nav")


def _has_pages(folder: Path) -> bool:
    return any(p.suffix == ".md" and p.name != "index.md" or p.is_dir() for p in folder.iterdir())


def _placeable(path: Path) -> bool:
    """A page, or a folder with an index, other than the index itself and hidden files."""
    if path.name.startswith(".") or path.name == "index.md":
        return False
    return path.suffix == ".md" or (path.is_dir() and (path / "index.md").exists())


def _children(docs: Path, folder: Path) -> list:
    """The folder's pages and subfolders, after its index, in the order its index links to them."""
    index = folder / "index.md"
    found = {p.name: p for p in sorted(folder.iterdir()) if _placeable(p)}
    order: list[str] = []
    for target in _LINK.findall(index.read_text(encoding="utf-8")):
        name = Path(target).parts[0]
        if name in found and name not in order:
            order.append(name)
    for name in sorted(set(found) - set(order)):
        page, linked_from = found[name].relative_to(docs), index.relative_to(docs)
        log.warning(
            f"{page} is not linked from {linked_from}: link it there to place it in the nav"
        )
        order.append(name)
    entries = []
    for name in order:
        path = found[name]
        if path.is_dir() and _has_pages(path):
            entries.append({_heading(path / "index.md"): _section(docs, path)})
        else:
            page = path / "index.md" if path.is_dir() else path
            entries.append({_heading(page): page.relative_to(docs).as_posix()})
    return entries


def _section(docs: Path, folder: Path) -> list:
    return [(folder / "index.md").relative_to(docs).as_posix(), *_children(docs, folder)]


def _expand(entry, docs: Path):
    if isinstance(entry, list):
        return [_expand(e, docs) for e in entry]
    if isinstance(entry, dict):
        return {title: _expand(value, docs) for title, value in entry.items()}
    if isinstance(entry, str) and entry.endswith("/"):
        return _section(docs, docs / entry.rstrip("/"))
    return entry


def on_config(config, **kwargs):
    if config["nav"]:
        config["nav"] = _expand(config["nav"], Path(config["docs_dir"]))
    return config
