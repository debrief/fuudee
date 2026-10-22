"""The walkthroughs' pictures (CAP-25), drawn from the sample's serial 1.

One SVG a step, shown beside it on VS Code's Get Started page and in the playground's
Walkthroughs panel. Each is the serial's tracks, where the sample has them, with what the
step is about drawn over them. Interface colours are VS Code theme variables, so a picture
follows the editor's theme (light, dark or high contrast); tracks keep their data colours
(DEV-07). The pictures are schematic: they show what to look for, not the screen exactly.

python -m debrief_sample media vscode/media/walkthroughs [--check]
"""

from __future__ import annotations

import math
import tempfile
from collections.abc import Callable
from html import escape
from pathlib import Path

from debrief_kernel.formatting import format_bearing, format_range
from debrief_kernel.geodesy import Position, TrackPath, range_bearing
from debrief_kernel.time import format_utc, parse_utc
from debrief_sample.walkthrough import (
    LOG_TAIL_MS,
    PLOT,
    glitch_indices,
    glitched_positions,
    log_period,
)
from debrief_stac import Catalogue

W, H = 480, 270
FG = "var(--vscode-foreground)"
MUTED = "var(--vscode-descriptionForeground)"
BG = "var(--vscode-editor-background)"
PANEL = "var(--vscode-editorWidget-background)"
BORDER = "var(--vscode-panel-border)"
FOCUS = "var(--vscode-focusBorder)"
WARN = "var(--vscode-editorWarning-foreground)"
FONT = "var(--vscode-font-family)"
MONO = "var(--vscode-editor-font-family)"
ANNOTATION = "#c7820a"  # the annotation amber: a data colour (theme guide)
MARK = "#00800b"  # a fix's own colour: legacy green, a data colour


class Map:
    """Serial 1 projected onto the picture: the exercise (BLUE ONE and RED ONE) fills it."""

    def __init__(self, tracks: dict[str, dict]):
        self.tracks = tracks
        focus = [p for n in ("BLUE ONE", "RED ONE") for p in tracks[n]["coordinates"]]
        lons, lats = [p[0] for p in focus], [p[1] for p in focus]
        self.lat0 = math.radians((min(lats) + max(lats)) / 2)
        x0, x1 = min(lons), max(lons)
        y0, y1 = min(lats), max(lats)
        span_x, span_y = (x1 - x0) * math.cos(self.lat0), y1 - y0
        self.scale = min((W - 80) / span_x, (H - 70) / span_y)
        self.cx, self.cy = (x0 + x1) / 2, (y0 + y1) / 2

    def xy(self, lon: float, lat: float) -> tuple[float, float]:
        x = W / 2 + (lon - self.cx) * math.cos(self.lat0) * self.scale
        y = H / 2 - (lat - self.cy) * self.scale
        return round(x, 1), round(y, 1)

    def path(self, coordinates: list, **attributes: str) -> str:
        points = " ".join(f"{x},{y}" for x, y in (self.xy(p[0], p[1]) for p in coordinates))
        return _el("polyline", points=points, fill="none", **attributes)


def _el(name: str, text: str | None = None, **attributes: object) -> str:
    attrs = " ".join(
        f'{k.rstrip("_").replace("_", "-")}="{escape(str(v))}"' for k, v in attributes.items()
    )
    return f"<{name} {attrs}/>" if text is None else f"<{name} {attrs}>{escape(text)}</{name}>"


def _text(x: float, y: float, words: str, size: int = 11, fill: str = FG, **more: object) -> str:
    return _el(
        "text",
        words,
        **{"x": x, "y": y, "font_size": size, "fill": fill, "font_family": FONT, **more},
    )


def _svg(parts: list[str]) -> str:
    body = "\n".join(parts)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">\n'
        f'<rect width="{W}" height="{H}" fill="{BG}" stroke="{BORDER}"/>\n{body}\n</svg>\n'
    )


def _background(m: Map, *, dim: bool = False, skip: tuple[str, ...] = ()) -> list[str]:
    parts = []
    for name, t in m.tracks.items():
        if name in skip:
            continue
        exercise = name in ("BLUE ONE", "RED ONE")
        opacity = 0.25 if dim and exercise is False else (0.35 if dim else (1 if exercise else 0.6))
        parts.append(
            m.path(
                t["coordinates"],
                stroke=t["colour"],
                stroke_width=2 if exercise else 1,
                opacity=opacity,
            )
        )
        if exercise and not dim:
            x, y = m.xy(*t["coordinates"][-1][:2])
            parts.append(_text(x + 4, y + 4, name, 10, t["colour"], font_weight="bold"))
    return parts


def _at(m: Map, name: str, ms: int) -> tuple[float, float]:
    p = m.tracks[name]["path"].position_at(ms)
    return m.xy(p.longitude, p.latitude)


def _square(x: float, y: float, colour: str) -> str:
    return _el(
        "rect", x=x - 4, y=y - 4, width=8, height=8, fill=colour, stroke=FG, stroke_width=0.5
    )


def _panel(x: float, y: float, w: float, h: float) -> str:
    return _el("rect", x=x, y=y, width=w, height=h, rx=3, fill=PANEL, stroke=BORDER)


def draw(tracks: dict[str, dict], narrative: list[dict]) -> dict[str, str]:
    """Every walkthrough picture, by file name."""
    m = Map(tracks)
    blue, red = tracks["BLUE ONE"], tracks["RED ONE"]
    start, end = blue["path"].start_ms, blue["path"].end_ms
    now = start + (end - start) * 5 // 8 // 60_000 * 60_000
    pictures: dict[str, Callable[[], list[str]]] = {}

    def at_now() -> list[str]:
        return [_square(*_at(m, n, now), m.tracks[n]["colour"]) for n in ("BLUE ONE", "RED ONE")]

    pictures["explore-open.svg"] = lambda: _background(m)

    def time() -> list[str]:
        y = H - 22
        x = 20 + (W - 40) * (now - start) / (end - start)
        return [
            *_background(m),
            *at_now(),
            _panel(10, y - 14, W - 20, 30),
            _el("line", x1=20, y1=y + 4, x2=W - 20, y2=y + 4, stroke=MUTED, stroke_width=2),
            _el("circle", cx=x, cy=y + 4, r=5, fill=FOCUS),
            _text(20, y - 2, "Current time", 10, MUTED),
            _text(W - 20, y - 2, format_utc(now)[11:19] + "Z", 10, FG, text_anchor="end"),
        ]

    pictures["explore-time.svg"] = time

    def select() -> list[str]:
        parts = _background(m, dim=True)
        for t in (blue, red):
            parts.append(m.path(t["coordinates"], stroke=FOCUS, stroke_width=6, opacity=0.5))
            parts.append(m.path(t["coordinates"], stroke=t["colour"], stroke_width=2))
        return parts

    pictures["explore-select.svg"] = select

    def tote() -> list[str]:
        (bx, by), (rx, ry) = _at(m, "BLUE ONE", now), _at(m, "RED ONE", now)
        a, b = blue["path"].position_at(now), red["path"].position_at(now)
        distance, bearing = range_bearing(a, b)
        rows = [("Range nmi", format_range(distance)), ("Brg °T", format_bearing(bearing))]
        parts = [
            *_background(m),
            *at_now(),
            _el("line", x1=bx, y1=by, x2=rx, y2=ry, stroke=MUTED, stroke_dasharray="4 3"),
        ]
        parts += [
            _panel(W - 170, 10, 160, 66),
            _text(W - 162, 26, "Tote", 11, FG, font_weight="bold"),
        ]
        parts.append(_text(W - 70, 26, "RED ONE", 10, red["colour"], text_anchor="end"))
        for i, (label, value) in enumerate(rows):
            parts.append(_text(W - 162, 44 + i * 16, label, 10, MUTED))
            parts.append(
                _text(W - 18, 44 + i * 16, value, 10, FG, text_anchor="end", font_family=MONO)
            )
        return parts

    pictures["explore-tote.svg"] = tote

    def timeline() -> list[str]:
        shown = [e for e in narrative if parse_utc(e["time"]) <= now][-3:]
        parts = [*_background(m), *at_now(), _panel(W - 210, 10, 200, 70)]
        for i, e in enumerate(shown):
            current = i == len(shown) - 1
            y = 28 + i * 20
            if current:
                parts.append(
                    _el("rect", x=W - 206, y=y - 12, width=192, height=17, fill=FOCUS, opacity=0.25)
                )
            parts.append(_text(W - 202, y, e["time"][11:16] + "Z", 9, MUTED, font_family=MONO))
            parts.append(_text(W - 168, y, (e["source"] + ": " + e["text"])[:30], 9, FG))
        return parts

    pictures["explore-timeline.svg"] = timeline

    first, last = log_period(start, end)

    def emphasise_blue() -> list[str]:
        return [
            *_background(m, dim=True),
            m.path(blue["coordinates"], stroke=blue["colour"], stroke_width=3),
        ]

    pictures["collate-open.svg"] = emphasise_blue

    def imported() -> list[str]:
        lines = [
            ";; A navigation log",
            '230615 104000.000 "Blue One" @A …',
            '230615 104010.000 "Blue One" @A …',
            '230615 104020.000 "Blue One" @A …',
        ]
        parts = [*_background(m, dim=True), _panel(20, 20, 250, 82)]
        for i, line in enumerate(lines):
            parts.append(_text(30, 40 + i * 16, line, 9, MUTED if i == 0 else FG, font_family=MONO))
        parts += [
            _el("line", x1=270, y1=60, x2=320, y2=60, stroke=FOCUS, stroke_width=2),
            _panel(320, 44, 140, 34),
        ]
        parts.append(_text(330, 65, "✦ New data", 11, WARN, font_weight="bold"))
        return parts

    pictures["collate-import.svg"] = imported

    def bars(chosen: bool) -> list[str]:
        x0, x1 = 110, W - 20
        tail = end + LOG_TAIL_MS

        def x(ms: int) -> float:
            return round(x0 + (x1 - x0) * (ms - start) / (tail - start), 1)

        parts = [
            _panel(10, 10, W - 20, H - 20),
            _text(20, 34, "Coverage", 12, FG, font_weight="bold"),
        ]
        rows = [
            ("BLUE ONE", "Serial 1", start, end, blue["colour"]),
            ("", "Navigation log", first, tail, blue["colour"]),
            ("RED ONE", "Serial 1", start, end, red["colour"]),
        ]
        for i, (track, source, a, b, colour) in enumerate(rows):
            y = 70 + i * 44
            if track:
                parts.append(_text(20, y - 14, track, 11, colour, font_weight="bold"))
            parts.append(_text(20, y + 6, source, 10, MUTED))
            parts.append(
                _el("rect", x=x0, y=y - 4, width=x1 - x0, height=14, fill="none", stroke=BORDER)
            )
            parts.append(
                _el("rect", x=x(a), y=y - 4, width=x(b) - x(a), height=14, fill=colour, opacity=0.6)
            )
        if chosen:
            parts.append(
                _el(
                    "rect",
                    x=x(first),
                    y=66 + 44 - 4,
                    width=x(last) - x(first),
                    height=22,
                    fill="none",
                    stroke=FOCUS,
                    stroke_width=2,
                )
            )
            parts.append(
                _text(
                    x(first),
                    140,
                    f"{format_utc(first)[11:16]}Z to {format_utc(last)[11:16]}Z: Navigation log",
                    10,
                    FG,
                )
            )
        for ms in range(start, tail + 1, 3_600_000):
            parts.append(
                _text(x(ms), H - 26, format_utc(ms)[11:16] + "Z", 9, MUTED, text_anchor="middle")
            )
        return parts

    pictures["collate-coverage.svg"] = lambda: bars(False)
    pictures["collate-prefer.svg"] = lambda: bars(True)

    def take() -> list[str]:
        p = blue["path"]
        a, b = p.positions[-2], p.positions[-1]
        rng, brg = range_bearing(a, b)
        speed = rng.value / ((p.times_ms[-1] - p.times_ms[-2]) / 1000)
        from debrief_kernel.geodesy import destination
        from debrief_kernel.units import Quantity

        on = [b]
        for i in range(1, 21):
            on.append(destination(b, brg, Quantity(speed * 60 * i, "m")))
        extended = [[q.longitude, q.latitude] for q in on]
        return [
            *_background(m),
            m.path(extended, stroke=blue["colour"], stroke_width=2, stroke_dasharray="2 3"),
        ]

    pictures["collate-take.svg"] = take

    glitched = glitched_positions(red["coordinates"])
    spikes = glitch_indices(len(glitched))

    def tidy(rings: bool = False, smooth: bool = False) -> list[str]:
        parts = [
            *_background(m, skip=("RED ONE",)),
            m.path(glitched, stroke=red["colour"], stroke_width=2),
        ]
        if rings:
            for i in spikes:
                x, y = m.xy(*glitched[i][:2])
                parts.append(
                    _el("circle", cx=x, cy=y, r=7, fill="none", stroke=WARN, stroke_width=2)
                )
        if smooth:
            parts = [
                *_background(m, skip=("RED ONE",)),
                m.path(red["coordinates"], stroke=red["colour"], stroke_width=2),
            ]
            moved = [[lon + 0.004, lat - 0.003] for lon, lat in (p[:2] for p in red["coordinates"])]
            parts.append(
                m.path(moved, stroke=red["colour"], stroke_width=1.5, stroke_dasharray="5 3")
            )
        return parts

    pictures["tidy-open.svg"] = tidy
    pictures["tidy-jumps.svg"] = lambda: tidy(rings=True)
    pictures["tidy-smooth.svg"] = lambda: tidy(smooth=True)

    def mark() -> list[str]:
        coords = red["coordinates"]
        x, y = m.xy(*coords[len(coords) // 2][:2])
        return [
            *_background(m),
            _el("circle", cx=x, cy=y, r=5, fill=MARK, stroke=FG, stroke_width=0.5),
            _text(x + 8, y - 6, "Turned away", 11, FG, font_weight="bold"),
        ]

    pictures["tidy-mark.svg"] = mark

    def shear() -> list[str]:
        coords = blue["coordinates"]
        held = m.xy(*coords[0][:2])
        x, y = m.xy(*coords[-1][:2])
        moved = (x + 30, y - 24)
        n = len(coords)
        sheared = []
        for i, p in enumerate(coords):
            px, py = m.xy(*p[:2])
            f = i / (n - 1)
            sheared.append(f"{round(px + 30 * f, 1)},{round(py - 24 * f, 1)}")
        diamond = " ".join(
            f"{moved[0] + dx},{moved[1] + dy}" for dx, dy in ((0, -6), (6, 0), (0, 6), (-6, 0))
        )
        return [
            *_background(m),
            _el(
                "polyline",
                points=" ".join(sheared),
                fill="none",
                stroke=blue["colour"],
                stroke_width=2,
                stroke_dasharray="5 3",
            ),
            _el("polygon", points=diamond, fill=FOCUS, stroke=FG, stroke_width=0.5),
            _el("circle", cx=held[0], cy=held[1], r=4, fill="none", stroke=FG),
            _text(moved[0] + 10, moved[1] - 8, "New course and speed", 10, FG),
        ]

    pictures["tidy-shear.svg"] = shear
    pictures["annotate-open.svg"] = lambda: _background(m)

    def area() -> list[str]:
        cx, cy = _at(m, "RED ONE", start + (end - start) // 6)
        corners = [(cx - 40, cy - 25), (cx + 45, cy - 30), (cx + 50, cy + 28), (cx - 35, cy + 30)]
        points = " ".join(f"{a},{b}" for a, b in corners)
        return [
            *_background(m),
            _el(
                "polygon",
                points=points,
                fill=ANNOTATION,
                fill_opacity=0.05,
                stroke=ANNOTATION,
                stroke_width=1.5,
                stroke_dasharray="6 3",
            ),
            _text(cx - 36, cy - 30, "Search area", 11, ANNOTATION, font_weight="bold"),
        ]

    pictures["annotate-area.svg"] = area

    def frequencies() -> list[str]:
        parts = _background(m)
        for t in (blue, red):
            for ms in range(start, end + 1, 1_800_000):
                x, y = _at(m, t["name"], ms)
                parts.append(_el("circle", cx=x, cy=y, r=2, fill=t["colour"]))
                parts.append(
                    _text(x + 4, y - 3, format_utc(ms)[11:13] + format_utc(ms)[14:16], 8, FG)
                )
        return parts

    pictures["annotate-frequencies.svg"] = frequencies

    def export() -> list[str]:
        return [
            *_background(m),
            _el(
                "rect",
                x=4,
                y=4,
                width=W - 8,
                height=H - 8,
                fill="none",
                stroke=FOCUS,
                stroke_width=2,
                stroke_dasharray="8 4",
            ),
            _text(14, H - 14, "DBF-PTET-KG8R-B9EM-69", 9, MUTED, font_family=MONO),
        ]

    pictures["annotate-export.svg"] = export

    def trace() -> list[str]:
        steps = [
            "Step 7  Labels every 10 min",
            "Step 6  Search area added",
            "Step 5  Shown read-only",
        ]
        parts = [
            *_background(m, dim=True),
            _panel(20, 20, 200, 28),
            _text(30, 38, "DBF-PTET-KG8R-B9EM-69", 11, FG, font_family=MONO),
        ]
        parts += [
            _el("line", x1=220, y1=34, x2=260, y2=34, stroke=FOCUS, stroke_width=2),
            _panel(260, 14, 200, 72),
        ]
        for i, line in enumerate(steps):
            y = 32 + i * 20
            if i == 2:
                parts.append(
                    _el(
                        "rect",
                        x=264,
                        y=y - 12,
                        width=192,
                        height=17,
                        fill="none",
                        stroke=WARN,
                        stroke_dasharray="3 2",
                    )
                )
            parts.append(_text(270, y, line, 10, FG if i == 2 else MUTED))
        return parts

    pictures["annotate-trace.svg"] = trace
    return {name: _svg(make()) for name, make in sorted(pictures.items())}


def sample_tracks() -> tuple[dict[str, dict], list[dict]]:
    """Serial 1's tracks and narrative, from a fresh build of the sample."""
    from debrief_sample.builder import build

    with tempfile.TemporaryDirectory() as work:
        root = Path(work) / "sample"
        build(root)
        plot = Catalogue.open(root).read_plot(PLOT)
    tracks = {}
    for f in plot.features:
        if f.properties.kind == "track":
            colour = f.properties.style.colour if f.properties.style else "#808080"
            tracks[f.properties.name] = {
                "name": f.properties.name,
                "coordinates": [list(p[:2]) for p in f.geometry.coordinates],
                "colour": colour,
                "path": TrackPath.from_feature(f),
            }
    narrative = sorted(
        (
            {"time": f.properties.time, "source": f.properties.source, "text": f.properties.text}
            for f in plot.features
            if f.properties.kind == "narrative"
        ),
        key=lambda e: e["time"],
    )
    return tracks, narrative


def write_media(out: Path, *, check: bool = False) -> list[str]:
    """Write every picture into out; with check, write nothing and list those that differ."""
    out = Path(out)
    pictures = draw(*sample_tracks())
    stale = [
        n
        for n, svg in pictures.items()
        if not (out / n).exists() or (out / n).read_text(encoding="utf-8") != svg
    ]
    if not check:
        out.mkdir(parents=True, exist_ok=True)
        for name in stale:
            (out / name).write_text(pictures[name], encoding="utf-8")
        return []
    return stale


__all__ = ["Position", "draw", "write_media"]
