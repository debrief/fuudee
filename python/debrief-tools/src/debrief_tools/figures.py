"""Exported images through the tool service (SUB-25, EXT-05, OUT-04), for hosts and agents.

debrief/figure_id     a fresh image ID for the plot shown: at its current revision, or at
                      an earlier one shown read-only (revision), with its short form for
                      the footer. Reads only.
debrief/export_image  the image a host drew (the map), or one an agent has, with the ID
                      put into its metadata, written to file, and the export recorded in
                      the plot's export log (its island, never a step). A read-only
                      catalogue's plots are exported, but not logged, and the answer says so.
debrief/find_image_source
                      the plots an image came from: from a file's metadata (a PNG, an SVG,
                      or the pictures in a Word or PowerPoint file), or from an ID typed
                      from an image's footer; searched in every catalogue in the analyst's
                      configuration.
debrief/open_revision the plot as it was at a revision, rebuilt by replay and checked, to
                      show read-only, with the export log entry for an image if named.

Only the image's ID goes into the image: never the plot's title, its catalogue's name nor
who exported it, which stay in the plot's export log.
"""

from __future__ import annotations

import base64
import binascii
import os
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, Any

from debrief_kernel.time import format_utc
from debrief_schemas import DocumentKind, dump_document, models
from debrief_stac import Catalogue, CatalogueError, HistoryError
from debrief_stac.figures import (
    FigureIdError,
    figure_for,
    figure_ids_in,
    find_sources,
    log_export,
    parse_figure_id,
    prepare_export,
)

if TYPE_CHECKING:
    from debrief_tools.service import ToolService

# A file read to find an image's ID: an image, or a Word or PowerPoint file of them.
MAX_READ = 256 * 1024 * 1024
SUFFIXES = {"png": ".png", "svg": ".svg"}
EXPORT_MEMBERS = ("format", "footer", "preset", "theme", "width", "height", "viewport", "time")


def handle(service: ToolService, method: str, params: dict[str, Any]) -> dict[str, Any]:
    from debrief_tools.service import INVALID_PARAMS, RpcError

    try:
        if method == "debrief/figure_id":
            return _figure_id(service, params)
        if method == "debrief/export_image":
            return _export_image(service, params)
        if method == "debrief/find_image_source":
            return _find(service, params)
        return _open_revision(service, params)
    except FigureIdError as error:
        raise RpcError(INVALID_PARAMS, str(error)) from None
    except FileNotFoundError as error:
        raise RpcError(INVALID_PARAMS, f"There is no file {error.filename}.") from None
    except (CatalogueError, HistoryError, OSError, ValueError) as error:
        raise RpcError(INVALID_PARAMS, str(error)) from None


def _plot(service: ToolService, params: dict[str, Any]) -> tuple[models.KnownStore, Catalogue, str]:
    from debrief_tools.service import INVALID_PARAMS, RpcError

    item = params.get("item")
    if not isinstance(item, str):
        raise RpcError(INVALID_PARAMS, "this needs a store and an item")
    store = service._store(params.get("store"), writing=False)
    catalogue = Catalogue.open(Path(store.location))
    if item not in catalogue.item_ids():
        raise RpcError(INVALID_PARAMS, f"There is no plot {item!r} in {store.title}.")
    return store, catalogue, item


def _figure_id(service: ToolService, params: dict[str, Any]) -> dict[str, Any]:
    """{id, short, revision}: a fresh image ID for an export of the plot, at its current
    revision or the revision given."""
    revision = params.get("revision")
    _, catalogue, item = _plot(service, params)
    figure = figure_for(catalogue, item, revision if isinstance(revision, str) else None)
    shown = revision if isinstance(revision, str) else catalogue.history(item).head().plot_hash
    return {"id": figure.text, "short": figure.short, "revision": shown}


def _export_image(service: ToolService, params: dict[str, Any]) -> dict[str, Any]:
    """Stamp, write and log an exported image. params: store, item, id (the image's ID in
    full, from debrief/figure_id), image (a PNG as base 64, or an SVG's text), file (where
    to write it, ending .png or .svg), overwrite (true to replace a file there), the export
    log's format, footer, preset, theme, width, height, viewport and time, and agent."""
    from debrief_tools.service import INVALID_PARAMS, RpcError, _agent

    store, catalogue, item = _plot(service, params)
    figure, image, file = params.get("id"), params.get("image"), params.get("file")
    if not isinstance(figure, str) or not isinstance(image, str) or not isinstance(file, str):
        raise RpcError(INVALID_PARAMS, "export_image needs the image's id, the image and a file")
    image_format = params.get("format")
    if image_format not in SUFFIXES:
        raise RpcError(INVALID_PARAMS, "format must be png or svg")
    target = Path(file)
    if target.suffix.lower() != SUFFIXES[image_format]:
        raise RpcError(
            INVALID_PARAMS,
            f"A {image_format.upper()} image's file name ends {SUFFIXES[image_format]}.",
        )
    if target.exists() and params.get("overwrite") is not True:
        raise RpcError(INVALID_PARAMS, f"{target.name} is there already. Choose another name.")
    if not target.parent.is_dir():
        raise RpcError(INVALID_PARAMS, f"There is no folder {target.parent}.")
    data = _image_bytes(image, image_format)
    agent = _agent(params)
    details = {k: params.get(k) for k in EXPORT_MEMBERS}
    details.update(
        file=target.name, by=agent.name, at=format_utc(_now_ms()), footer=bool(params.get("footer"))
    )
    stamped, entry = prepare_export(catalogue, item, figure, data, details)
    _write_atomically(target, stamped)
    if store.read_only:
        note = (
            f"The image traces to the plot by its ID, but this export is not in the plot's "
            f"export log: {store.title} is read-only."
        )
    else:
        note = log_export(
            catalogue, item, entry, allow_newer_schema=params.get("allow_newer_schema") is True
        )
    out: dict[str, Any] = {
        "file": str(target),
        "id": entry.id,
        "short": parse_figure_id(entry.id).short,
        "revision": entry.revision,
        "recorded": note is None,
    }
    if note:
        out["note"] = note
    return out


def _image_bytes(image: str, image_format: str) -> bytes:
    if image_format == "svg":
        return image.encode("utf-8")
    try:
        return base64.b64decode(image, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("The PNG image is not base 64.") from None


def _now_ms() -> int:
    import time

    return int(time.time() * 1000)


def _write_atomically(target: Path, data: bytes) -> None:
    """Written whole or not at all: to a file beside it, then renamed over it."""
    handle, temporary = tempfile.mkstemp(
        prefix=".debrief-", suffix=target.suffix, dir=target.parent
    )
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
        os.replace(temporary, target)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def _catalogues(service: ToolService) -> list[tuple[str | None, str | None, Catalogue]]:
    out = []
    for store in service._config().stores:
        try:
            out.append((store.id, store.title, Catalogue.open(Path(store.location))))
        except (CatalogueError, OSError, ValueError):
            continue
    return out


def _find(service: ToolService, params: dict[str, Any]) -> dict[str, Any]:
    """{images: [{id, short, where, sources}]}: the plots each image ID names. file, a path
    to an image (or a Word or PowerPoint file of them); or id, typed from a footer."""
    from debrief_tools.service import INVALID_PARAMS, RpcError

    file, typed = params.get("file"), params.get("id")
    if isinstance(typed, str):
        refs = [(parse_figure_id(typed), "typed")]
    elif isinstance(file, str):
        path = Path(file)
        if path.stat().st_size > MAX_READ:
            raise RpcError(INVALID_PARAMS, f"{path.name} is too large to search for images.")
        found = figure_ids_in(path.read_bytes(), path.name)
        if not found.ids:
            return {
                "images": [],
                "problem": (
                    f"{path.name} carries no Debrief image ID: its metadata may have been "
                    "removed. Type the ID from the image's footer instead."
                ),
            }
        refs = [(parse_figure_id(text), where) for text, where in found.ids]
    else:
        raise RpcError(INVALID_PARAMS, "find_image_source needs a file or an id")
    catalogues = _catalogues(service)
    images = []
    for ref, where in refs:
        sources = find_sources(catalogues, ref)
        images.append(
            {
                "id": ref.text,
                "short": ref.short,
                "where": where,
                "sources": [s.model().model_dump(mode="json", exclude_none=True) for s in sources],
            }
        )
    out: dict[str, Any] = {"images": images}
    if not any(i["sources"] for i in images):
        out["problem"] = (
            "No plot in your catalogues has the revision this image was exported at. "
            "Add the catalogue it came from, then try again."
        )
    return out


def _open_revision(service: ToolService, params: dict[str, Any]) -> dict[str, Any]:
    """{plot, step, current, latest, revision, export?}: the plot as it was at a revision,
    rebuilt by replay and checked; with the export log entry for the image id names."""
    from debrief_tools.service import INVALID_PARAMS, RpcError

    revision = params.get("revision")
    if not isinstance(revision, str):
        raise RpcError(INVALID_PARAMS, "open_revision needs the revision")
    _, catalogue, item = _plot(service, params)
    history = catalogue.history(item)
    plot, step = catalogue.revision_shown(item, revision)
    head = history.head()
    out: dict[str, Any] = {
        "plot": dump_json(plot),
        "step": step,
        "current": head.current,
        "latest": head.latest,
        "revision": revision,
    }
    wanted = params.get("id")
    if isinstance(wanted, str):
        view, _ = history.view()
        export = next((e for e in (view.exports or []) if e.id == wanted), None) if view else None
        if export is not None:
            out["export"] = export.model_dump(mode="json", exclude_none=True)
    return out


def dump_json(plot: Any) -> Any:
    import json

    return json.loads(dump_document(DocumentKind.PLOT, plot))
