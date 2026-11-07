"""Exported images through the tool service (SUB-25, EXT-05, OUT-04), for hosts and agents.

debrief/figure_id     a fresh image ID for the plot shown: at its current revision, or at
                      an earlier one shown read-only (revision), with its short form for
                      the footer. Reads only.
debrief/export_image  from a host, the image its map drew (image): the ID put into its
                      metadata, the export recorded, and the image given back for the host
                      to write where the analyst chose. The service never writes an image
                      file itself.
                      From an agent, with no image: an open map draws it, through the
                      host's debrief.exportImage, as the analyst's export does (decision,
                      product owner, 16 Oct 2026). The host is asked through
                      debrief/host_poll; refused if no map is open. The host writes the
                      file, only into the workspace or the exports folder set, and never
                      over a file without the analyst's say.
debrief/find_image_source
                      the plots an image came from: from a file's metadata (a PNG, an SVG,
                      or the pictures in a Word or PowerPoint file), or from an ID typed
                      from an image's footer; searched in every catalogue in the analyst's
                      configuration, and in their own export log.
debrief/open_revision the plot as it was at a revision, rebuilt by replay and checked, to
                      show read-only, with the export log entry for an image if named.
debrief/host_poll     a host (VS Code) waits here for what the service asks of it: an
                      agent's export. Long-polled; a host polling is a map open to draw.
debrief/host_answer   the host's answer to one such request.

An export is recorded in the plot's export log (its island, never a step); where the
plot's cannot be written (a read-only catalogue), in the analyst's own export log beside
their Debrief configuration (debrief_config.exports), which Find source reads too.

Only the image's ID goes into the image: never the plot's title, its catalogue's name nor
who exported it, which stay in the export log.
"""

from __future__ import annotations

import base64
import binascii
import functools
import threading
import time
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING, Any

from debrief_config import ConfigError
from debrief_config.exports import append_export, export_log_path, read_export_log
from debrief_kernel.time import format_utc
from debrief_schemas import DocumentKind, dump_document, models
from debrief_stac import Catalogue, CatalogueError
from debrief_stac.figures import (
    FigureIdError,
    figure_for,
    figure_ids_in,
    find_sources,
    log_export,
    parse_figure_id,
    prepare_export,
)
from debrief_tools.rpc import INVALID_PARAMS, MAPPED, RpcError, agent_ref, rpc_error

if TYPE_CHECKING:
    from debrief_tools.service import ToolService

# A file read to find an image's ID: an image, or a Word or PowerPoint file of them.
MAX_READ = 256 * 1024 * 1024
SUFFIXES = {"png": ".png", "svg": ".svg"}
EXPORT_MEMBERS = (
    "format",
    "footer",
    "preset",
    "theme",
    "width",
    "height",
    "viewport",
    "time",
    "tote",
)
AGENT_CHOICES = ("preset", "theme", "footer", "overwrite")
NO_MAP = (
    "No Debrief map is open to draw the image. Open the plot in Debrief in VS Code, then ask again."
)


class Bridge:
    """What the service asks of a host: an agent's export, drawn by an open map. A host
    long-polls for requests (poll) and answers each (answer); an agent's request waits
    for its answer (ask). A host that has polled within SEEN_S is there to ask."""

    POLL_S = 20.0  # a poll waits at most this long for a request
    SEEN_S = 30.0  # a host not seen polling this long is gone
    ANSWER_S = 120.0  # an agent waits at most this long for the map to draw

    def __init__(self) -> None:
        self._changed = threading.Condition()
        self._waiting: list[dict[str, Any]] = []
        self._answers: dict[str, dict[str, Any]] = {}
        self._seen: float | None = None

    def host_present(self) -> bool:
        with self._changed:
            return self._seen is not None and time.monotonic() - self._seen < self.SEEN_S

    def ask(self, request: dict[str, Any]) -> dict[str, Any]:
        """The host's answer to a request: {result} or {problem}. Raises TimeoutError if
        it does not answer in ANSWER_S."""
        key = uuid.uuid4().hex
        with self._changed:
            self._waiting.append({"id": key, **request})
            self._changed.notify_all()
            answered = self._changed.wait_for(lambda: key in self._answers, self.ANSWER_S)
            if not answered:
                self._waiting = [r for r in self._waiting if r["id"] != key]
                raise TimeoutError
            return self._answers.pop(key)

    def poll(self, wait_s: float | None = None) -> list[dict[str, Any]]:
        """The requests waiting, once there are some or wait_s has passed."""
        with self._changed:
            self._seen = time.monotonic()
            self._changed.wait_for(lambda: self._waiting, self.POLL_S if wait_s is None else wait_s)
            taken, self._waiting = self._waiting, []
            self._seen = time.monotonic()
            return taken

    def answer(self, key: str, answer: dict[str, Any]) -> None:
        with self._changed:
            self._seen = time.monotonic()
            self._answers[key] = answer
            self._changed.notify_all()


def answered(
    work: Callable[[ToolService, dict[str, Any]], dict[str, Any]],
) -> Callable[[ToolService, dict[str, Any], Any], dict[str, Any]]:
    """A method's handler, as service.METHODS registers it: what its work raises said as
    the JSON-RPC error a caller acts on."""

    @functools.wraps(work)
    def handler(service: ToolService, params: dict[str, Any], _args: Any = None) -> dict[str, Any]:
        try:
            return work(service, params)
        except FigureIdError as error:
            raise RpcError(INVALID_PARAMS, str(error)) from None
        except FileNotFoundError as error:
            raise RpcError(INVALID_PARAMS, f"There is no file {error.filename}.") from None
        except MAPPED as error:
            raise rpc_error(error) from None

    return handler


@answered
def export_image(service: ToolService, params: dict[str, Any]) -> dict[str, Any]:
    """debrief/export_image: a host's image (image) stamped and logged, or, from an agent
    (no image), the image an open map draws."""
    if "image" in params:
        return _stamp_and_log(service, params)
    return _ask_map(service, params)


@answered
def host_poll(service: ToolService, params: dict[str, Any]) -> dict[str, Any]:
    """debrief/host_poll: the requests waiting for the host, long-polled."""
    wait = params.get("wait_s")
    wait_s = min(float(wait), Bridge.POLL_S) if isinstance(wait, int | float) else None
    return {"requests": service.bridge.poll(wait_s)}


def _plot(service: ToolService, params: dict[str, Any]) -> tuple[models.KnownStore, Catalogue, str]:
    item = params.get("item")
    if not isinstance(item, str):
        raise RpcError(INVALID_PARAMS, "this needs a store and an item")
    store = service.store(params.get("store"), writing=False)
    catalogue = Catalogue.open(Path(store.location))
    if item not in catalogue.item_ids():
        raise RpcError(INVALID_PARAMS, f"There is no plot {item!r} in {store.title}.")
    return store, catalogue, item


@answered
def figure_id(service: ToolService, params: dict[str, Any]) -> dict[str, Any]:
    """{id, short, revision}: a fresh image ID for an export of the plot, at its current
    revision or the revision given."""
    revision = params.get("revision")
    _, catalogue, item = _plot(service, params)
    figure = figure_for(catalogue, item, revision if isinstance(revision, str) else None)
    shown = revision if isinstance(revision, str) else catalogue.history(item).head().plot_hash
    return {"id": figure.text, "short": figure.short, "revision": shown}


def _user_log(service: ToolService) -> Path:
    return export_log_path(service.config_path)


def _stamp_and_log(service: ToolService, params: dict[str, Any]) -> dict[str, Any]:
    """A host's export: the image its map drew, with its ID put into its metadata and the
    export recorded; the image given back for the host to write. params: store, item, id
    (the image's ID in full, from debrief/figure_id), image (a PNG as base 64, or an SVG's
    text), file (the name it will be written as, for the log), the log's format, footer,
    preset, theme, width, height, viewport, time and tote, and agent.
    {id, short, revision, image, recorded, logged, note?}: logged is where the export is
    recorded: "plot", "user" (the analyst's own log) or none."""
    store, catalogue, item = _plot(service, params)
    figure, image, file = params.get("id"), params.get("image"), params.get("file")
    if not isinstance(figure, str) or not isinstance(image, str):
        raise RpcError(INVALID_PARAMS, "export_image needs the image's id and the image")
    image_format = params.get("format")
    if image_format not in SUFFIXES:
        raise RpcError(INVALID_PARAMS, "format must be png or svg")
    data = _image_bytes(image, image_format)
    agent = agent_ref(params)
    details = {k: params.get(k) for k in EXPORT_MEMBERS}
    details.update(
        file=Path(file).name if isinstance(file, str) and file else None,
        by=agent.name,
        at=format_utc(_now_ms()),
        footer=bool(params.get("footer")),
    )
    stamped, entry = prepare_export(catalogue, item, figure, data, details)
    path = _user_log(service)
    logged = log_export(
        catalogue,
        item,
        entry,
        read_only=f"{store.title} is read-only" if store.read_only else None,
        user_log=lambda e: append_export(e, path),
        allow_newer_schema=params.get("allow_newer_schema") is True,
    )
    out: dict[str, Any] = {
        "id": entry.id,
        "short": parse_figure_id(entry.id).short,
        "revision": entry.revision,
        "image": base64.b64encode(stamped).decode("ascii")
        if image_format == "png"
        else stamped.decode("utf-8"),
        "recorded": logged.where == "plot",
        "logged": logged.where,
    }
    if logged.note:
        out["note"] = logged.note
    return out


def _ask_map(service: ToolService, params: dict[str, Any]) -> dict[str, Any]:
    """An agent's export: an open map draws the plot, as the analyst's export does, and
    the host writes it where the agent said, within the folders the host allows. params:
    store, item, file (ending .png or .svg), preset, theme, footer (default on),
    overwrite, agent. Refused if no map is open; the host refuses if it shows another
    plot. Drawing resizes the analyst's map for a moment."""
    _plot(service, params)
    file = params.get("file")
    if not isinstance(file, str) or not Path(file).is_absolute():
        raise RpcError(INVALID_PARAMS, "export_image needs a file: the full path to write")
    suffix = Path(file).suffix.lower()
    image_format = params.get("format") or next(
        (f for f, s in SUFFIXES.items() if s == suffix), None
    )
    if image_format not in SUFFIXES:
        raise RpcError(INVALID_PARAMS, "format must be png or svg")
    if suffix != SUFFIXES[image_format]:
        raise RpcError(
            INVALID_PARAMS,
            f"A {image_format.upper()} image's file name ends {SUFFIXES[image_format]}.",
        )
    if not service.bridge.host_present():
        raise RpcError(INVALID_PARAMS, NO_MAP)
    agent = agent_ref(params)
    request: dict[str, Any] = {
        "kind": "export_image",
        "store": params.get("store"),
        "item": params.get("item"),
        "file": file,
        "format": image_format,
        "agent": agent.model_dump(mode="json", exclude_none=True),
    }
    request.update({k: params[k] for k in AGENT_CHOICES if k in params})
    try:
        answer = service.bridge.ask(request)
    except TimeoutError:
        raise RpcError(
            INVALID_PARAMS, "The map did not draw the image in time. Ask again."
        ) from None
    if "problem" in answer or not isinstance(answer.get("result"), dict):
        raise RpcError(INVALID_PARAMS, str(answer.get("problem") or "The image was not exported."))
    return answer["result"]


@answered
def host_answer(service: ToolService, params: dict[str, Any]) -> dict[str, Any]:
    key = params.get("id")
    if not isinstance(key, str):
        raise RpcError(INVALID_PARAMS, "host_answer needs the request's id")
    if isinstance(params.get("result"), dict):
        service.bridge.answer(key, {"result": params["result"]})
    else:
        service.bridge.answer(key, {"problem": str(params.get("problem") or "")})
    return {}


def _image_bytes(image: str, image_format: str) -> bytes:
    if image_format == "svg":
        return image.encode("utf-8")
    try:
        return base64.b64decode(image, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("The PNG image is not base 64.") from None


def _now_ms() -> int:
    return int(time.time() * 1000)


def _catalogues(service: ToolService) -> list[tuple[str | None, str | None, Catalogue]]:
    out = []
    for store in service.config().stores:
        try:
            out.append((store.id, store.title, Catalogue.open(Path(store.location))))
        except (CatalogueError, OSError, ValueError):
            continue
    return out


def _logged(service: ToolService) -> list[models.LoggedExport]:
    """The analyst's own export log; none if it cannot be read (the plots' logs still are)."""
    try:
        return read_export_log(_user_log(service))
    except ConfigError:
        return []


@answered
def find_image_source(service: ToolService, params: dict[str, Any]) -> dict[str, Any]:
    """{images: [{id, short, where, sources}], skipped?, problem?}: the plots each image ID
    names. file, a path to an image (or a Word or PowerPoint file of them); or id, typed
    from a footer. A source for each export the ID names: a footer's short form can name
    more than one export of a revision, each listed for the analyst to choose. skipped:
    the pictures that could not be read, each with why."""
    file, typed = params.get("file"), params.get("id")
    skipped: list[dict[str, str]] = []
    if isinstance(typed, str):
        refs = [(parse_figure_id(typed), "typed")]
    elif isinstance(file, str):
        path = Path(file)
        if path.stat().st_size > MAX_READ:
            raise RpcError(INVALID_PARAMS, f"{path.name} is too large to search for images.")
        found = figure_ids_in(path.read_bytes(), path.name)
        skipped = [{"where": where, "why": why} for where, why in found.skipped]
        if not found.ids:
            out: dict[str, Any] = {
                "images": [],
                "problem": (
                    f"{path.name} carries no Debrief image ID: its metadata may have been "
                    "removed. Type the ID from the image's footer instead."
                ),
            }
            if skipped:
                out["skipped"] = skipped
                out["problem"] += " " + _skipped_said(skipped)
            return out
        refs = [(parse_figure_id(text), where) for text, where in found.ids]
    else:
        raise RpcError(INVALID_PARAMS, "find_image_source needs a file or an id")
    catalogues = _catalogues(service)
    logged = _logged(service)
    images = []
    for ref, where in refs:
        sources = find_sources(catalogues, ref, logged)
        images.append(
            {
                "id": ref.text,
                "short": ref.short,
                "where": where,
                "sources": [s.model().model_dump(mode="json", exclude_none=True) for s in sources],
            }
        )
    out = {"images": images}
    if skipped:
        out["skipped"] = skipped
    if not any(i["sources"] for i in images):
        out["problem"] = (
            "No plot in your catalogues has the revision this image was exported at. "
            "Add the catalogue it came from, then try again."
        )
    return out


def _skipped_said(skipped: list[dict[str, str]]) -> str:
    return " ".join(f"{s['where']} was not read: {s['why']}." for s in skipped)


@answered
def open_revision(service: ToolService, params: dict[str, Any]) -> dict[str, Any]:
    """{plot, step, current, latest, revision, export?}: the plot as it was at a revision,
    rebuilt by replay and checked; with the export log entry for the image id names, from
    the plot's export log or the analyst's own."""
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
        entries = list(view.exports or []) if view else []
        entries += [
            e.export for e in _logged(service) if e.catalogue == catalogue.id and e.item == item
        ]
        export = next((e for e in entries if e.id == wanted), None)
        if export is not None:
            out["export"] = export.model_dump(mode="json", exclude_none=True)
    return out


def dump_json(plot: Any) -> Any:
    import json

    return json.loads(dump_document(DocumentKind.PLOT, plot))
