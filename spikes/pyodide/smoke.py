"""Pyodide spike smoke test (CON-09).

Exercises the schema and kernel packages and prints a JSON report. The same
script runs under CPython and Pyodide; the spike passes when both reports
match exactly and every check passed.

    python smoke.py FIXTURES_DIR
"""

import json
import sys
import time
from pathlib import Path

from debrief_kernel import geodesy_arrays
from debrief_kernel.formatting import format_bearing, format_position, format_quantity, format_time
from debrief_kernel.geodesy import Position, TrackPath, closest_approach, destination, range_bearing
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import angle, duration, length, speed
from debrief_schemas import SCHEMA_VERSION, DocumentKind, dump_document, load_document, models
from debrief_tools import ToolContext, bind
from debrief_tools import core as core_tools
from debrief_tools.declare import tools_in


def _track(feature_id: str, path: TrackPath) -> models.TrackFeature:
    return models.TrackFeature(
        type="Feature",
        id=feature_id,
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[p.longitude, p.latitude] for p in path.positions]
        ),
        properties=models.TrackProperties(
            kind="track", name=feature_id.upper(), times=[format_utc(t) for t in path.times_ms]
        ),
    )


def _rounded(value, places: int = 9):
    """Floats to 1e-9 (about 0.1 mm in degrees): CPython and Pyodide link different maths
    libraries, which can differ in the last bit of a geodesic result."""
    if isinstance(value, float):
        return round(value, places)
    if isinstance(value, list):
        return [_rounded(v, places) for v in value]
    if isinstance(value, dict):
        return {k: _rounded(v, places) for k, v in value.items()}
    return value


def run_core_tools(a: TrackPath, b: TrackPath) -> dict:
    """Every core tool, run as the service runs it, on a two-track plot (CON-09)."""
    tracks = [_track("alpha", a), _track("bravo", b)]
    plot = models.DebriefFeatureCollection(
        type="FeatureCollection", schema_version=SCHEMA_VERSION, features=tracks, provenance=[]
    )
    cases = {
        "core.track_summary": (tracks, {}),
        "core.closest_approach": (tracks, {}),
        "core.range_rings": (tracks[:1], {"rings": 2}),
        "core.add_note": ([], {"text": "Contact gained", "at": "1970-01-01T00:30:00.000Z"}),
    }
    results = {}
    for tool in tools_in(core_tools):
        selection, supplied = cases[tool.name]
        values, _ = bind(tool.declaration, supplied)
        result = tool.run(ToolContext(plot=plot, selection=selection, parameters=values))
        results[tool.name] = _rounded(json.loads(dump_document(DocumentKind.TOOL_RESULT, result)))
    return results


def main(fixtures: Path, docs: Path | None = None) -> dict:
    report: dict = {"schema_version": SCHEMA_VERSION, "documents": {}, "kernel": {}}
    timings: dict = {}

    # Schemas: every valid fixture loads, validates and round-trips; invalid ones are rejected.
    started = time.perf_counter()
    for kind in DocumentKind:
        for path in sorted((fixtures / kind.value / "valid").glob("*.json")):
            original = json.loads(path.read_text())
            again = json.loads(dump_document(kind, load_document(kind, original)))
            report["documents"][f"{kind.value}/{path.name}"] = again == original
        for folder in ("invalid/schema", "invalid/semantic"):
            for path in sorted((fixtures / kind.value / folder).glob("*.json")):
                try:
                    load_document(kind, path.read_text())
                    rejected = False
                except ValueError:
                    rejected = True
                report["documents"][f"{kind.value}/{folder}/{path.name}"] = rejected
    timings["all_fixtures_ms"] = (time.perf_counter() - started) * 1000

    # Kernel: geodesy, units and formatting give identical answers.
    wellington, salamanca = Position(174.81, -41.32), Position(-5.50, 40.96)
    rng, brg = range_bearing(wellington, salamanca)
    a = TrackPath(
        [0, 3_600_000],
        [Position(0, 0), destination(Position(0, 0), angle(45), length(12, "[nmi_i]"))],
    )
    b_start = destination(Position(0, 0), angle(90), length(6, "[nmi_i]"))
    b = TrackPath(
        [0, 3_600_000], [b_start, destination(b_start, angle(330), length(10, "[nmi_i]"))]
    )
    cpa = closest_approach(a, b)
    lons = [174.81, 0.0, -4.12, 179.9]
    lats = [-41.32, 0.0, 50.35, 0.0]
    vec = geodesy_arrays.range_bearing(
        lons, lats, [-5.50, 1.0, -3.5, -179.9], [40.96, 0.0, 50.9, 0.0]
    )
    track_positions = geodesy_arrays.positions_at(a, [0, 1_800_000, 3_600_000])
    report["kernel_arrays"] = {
        "range_m": [round(float(v), 3) for v in vec.range_m],
        "bearing_deg": [round(float(v), 9) for v in vec.bearing_deg],
        "track_lat": [round(float(v), 9) for v in track_positions.latitude],
        "residuals": [
            round(float(v), 9)
            for v in geodesy_arrays.bearing_residuals([10, 350, 180], [350, 10, 0])
        ],
        "matches_per_point": abs(float(vec.range_m[0]) - rng.value) < 1e-6,
    }
    report["kernel"] = {
        "wellington_salamanca_m": round(rng.value, 3),
        "wellington_salamanca_deg": round(brg.value, 9),
        "cpa_time_ms": cpa.time_ms,
        "cpa_range": format_quantity(cpa.range),
        "cpa_position": format_position(cpa.position_a),
        "bearing": format_bearing(angle(7.25)),
        "speed": format_quantity(length(10, "[nmi_i]") / duration(1, "h")),
        "time": format_time(parse_utc("2026-10-11T09:30:05.250Z")),
        "derived": format_quantity(speed(12, "[kn_i]") * duration(30, "min")),
    }

    report["core_tools"] = run_core_tools(a, b)

    started = time.perf_counter()
    for _ in range(200):
        range_bearing(wellington, salamanca)
    timings["range_bearing_us"] = (time.perf_counter() - started) / 200 * 1e6

    # History: a plot is saved, changed, undone and redone, as the browser playground does.
    report["history"] = _history()

    # The Tote (CAP-06, NFR-04): measures at one time, asked again for each time.
    report["tote"], timings["tote_ms"] = _tote()

    # The narrative (CAP-20): REP lines read, one order, entries changed as steps.
    report["narrative"], timings["narrative_5000_ms"] = _narrative()

    # Narrative from Word and PDF (CAP-19): the same documents read the same way.
    report["narrative_documents"], timings["narrative_documents_ms"] = _documents(docs)

    return {"report": report, "timings": timings}


def _docx(paragraphs: list[tuple[str, str, str]]) -> bytes:
    """A minimal .docx, built with the standard library: each paragraph's middle run
    hidden, as a narrative document hides its metadata."""
    import io
    import zipfile

    w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

    def run(text: str, hidden: bool = False) -> str:
        props = "<w:rPr><w:vanish/></w:rPr>" if hidden else ""
        return f'<w:r>{props}<w:t xml:space="preserve">{text}</w:t></w:r>'

    body = "".join(f"<w:p>{run(a)}{run(b, True)}{run(c)}</w:p>" for a, b, c in paragraphs)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Override PartName="/word/document.xml" ContentType="application/'
            'vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        )
        archive.writestr(
            "word/document.xml", f"<w:document {w}><w:body>{body}</w:body></w:document>"
        )
    return out.getvalue()


def _pdf(lines: list[str]) -> bytes:
    """A minimal PDF, a line of text a line."""
    content = "BT /F1 10 Tf 12 TL 40 800 Td " + " ".join(f"({x}) Tj T*" for x in lines) + " ET"
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        "/Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
        f"<< /Length {len(content)} >>\nstream\n{content}\nendstream",
    ]
    out, offsets = "%PDF-1.4\n", []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n{body}\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    return out.encode("latin-1")


def _documents(docs: Path | None) -> tuple[dict, float]:
    from debrief_io.documents import read_document
    from debrief_io.word import read_dialect

    made = {
        "made.docx": _docx(
            [
                ("121005", ",12,03,20,HMS BLUE ONE,OOW COMMENT,", "Came to 090."),
                ("122345", ",13,03,20,HMS BLUE ONE,OOW COMMENT,", "Late entry."),
                ("110900", ",11,03,20,HMS BLUE ONE,LOG,", "Mangled day."),
            ]
        ),
        "made.pdf": _pdf(["12 Mar 20", "121005 Came to 090.", "130010 SR023 B-123 R-5kyds"]),
    }
    for path in sorted(docs.glob("*.doc")) if docs else []:
        made[path.name] = path.read_bytes()
    began = time.perf_counter()
    out = {}
    for name, data in made.items():
        read = read_dialect(read_document(name, data), default_year=2026)
        out[name] = {
            "dialect": read.dialect,
            "entries": [(e.time_ms, e.source, e.entry_type, e.text) for e in read.entries],
            "problems": read.problems,
            "warnings": read.warnings,
        }
    return out, (time.perf_counter() - began) * 1000


def _narrative() -> tuple[dict, float]:
    import tempfile

    from debrief_io import parse_rep
    from debrief_io.importer import narrative_features
    from debrief_stac import Catalogue, Changes, narrative

    text = (
        ';NARRATIVE2:\t110621\t093000\t"RED ONE"\tCSD\tGoing deep.\n'
        ";NARRATIVE:\t110621\t093000\tBLUE_ONE\tComment\tContact on 045.\n"
        ';NARRATIVE: 110621 092959.500 "HMS TORBAY" Marked range.\n'
        ";NARRATIVE: 110621 093100 BLUE_ONE\n"
    )
    parsed = parse_rep(text)
    agent = models.AgentRef(kind="person", name="smoke")
    record = models.ProvRecord(
        id="op-1", kind="import", started_at="2026-10-11T10:00:00.000Z", agent=agent
    )
    with tempfile.TemporaryDirectory() as folder:
        catalogue = Catalogue.create(Path(folder) / "cat", "smoke", "Smoke", "")
        catalogue.create_plot("p", "Plot")
        catalogue.commit("p", [record], Changes(added=narrative_features(parsed.narrative, {})))
        _, added = catalogue.add_narrative(
            "p",
            {"time": "2011-06-21T09:30:00.000Z", "source": "blue_one", "text": "Same second."},
            agent,
        )
        catalogue.edit_narrative("p", added, {"entry_type": "Sonar"}, agent)
        catalogue.delete_narrative("p", ["narrative-0001"], agent)
        catalogue.history("p").undo()
        plot = catalogue.read_plot("p")
        ordered = [
            (f.id, f.properties.source, f.properties.entry_type)
            for f in narrative.order(narrative.entries(plot))
        ]
        # Sizing: 5,000 entries added as one step, as a log read into a plot.
        many = [
            models.NarrativeFeature(
                type="Feature",
                id=f"bulk-{i}",
                geometry=None,
                properties=models.NarrativeProperties(
                    kind="narrative",
                    time=f"2011-06-21T{10 + i // 3600:02d}:{i // 60 % 60:02d}:{i % 60:02d}.000Z",
                    source=["BLUE ONE", "RED ONE"][i % 2],
                    text=f"Entry {i}.",
                ),
            )
            for i in range(5000)
        ]
        began = time.perf_counter()
        catalogue.commit("p", [record.model_copy(update={"id": "op-2"})], Changes(added=many))
        bulk_ms = (time.perf_counter() - began) * 1000
        return {
            "lines": [(n.source, n.entry_type, n.text, n.time_truncated) for n in parsed.narrative],
            "errors": parsed.errors,
            "ordered": ordered,
            "steps": [
                s.records[0].notes[0] if s.records[0].notes else None
                for s in catalogue.history("p").steps()
            ],
        }, bulk_ms


def _history() -> dict:
    import tempfile

    from debrief_stac import Catalogue, Changes

    note = models.AnnotationFeature(
        type="Feature",
        id="note-1",
        geometry=None,
        properties=models.AnnotationProperties(
            kind="annotation", style="note", name="Note", time="2026-10-11T09:30:00.000Z"
        ),
    )
    record = models.ProvRecord(
        id="op-1",
        kind="edit",
        started_at="2026-10-11T10:00:00.000Z",
        agent=models.AgentRef(kind="person", name="smoke"),
    )
    with tempfile.TemporaryDirectory() as folder:
        catalogue = Catalogue.create(Path(folder) / "cat", "smoke", "Smoke", "")
        catalogue.create_plot("p", "Plot")
        catalogue.commit("p", [record], Changes(added=[note]))
        catalogue.commit(
            "p", [record.model_copy(update={"id": "op-2"})], Changes(deleted_ids=["note-1"])
        )
        history = catalogue.history("p")
        undone = history.undo()
        after_undo = [f.id for f in catalogue.read_plot("p").features]
        history.redo()
        # One file, history included: the plot file alone, added to another catalogue.
        plot_file = Path(folder) / "cat" / "p" / "plot.geojson"
        load_document(DocumentKind.PLOT, plot_file.read_text())  # the hash chain checked
        other = Catalogue.create(Path(folder) / "other", "other", "Other", "")
        added = other.add_plot_file(plot_file, models.AgentRef(kind="person", name="smoke"))
        other.history(added).goto(1)
        return {
            "steps": [s.status for s in history.steps()],
            "undone_to": undone,
            "after_undo": after_undo,
            "after_redo": [f.id for f in catalogue.read_plot("p").features],
            "history_in_file": sorted(json.loads(plot_file.read_text())["history"]),
            "received_steps": [s.status for s in other.history(added).steps()],
            "received_at_step_1": [f.id for f in other.read_plot(added).features],
        }


def _tote() -> tuple[dict, float]:
    import tempfile

    from debrief_stac import Catalogue, Changes
    from debrief_stac.tote import tote

    record = models.ProvRecord(
        id="op-1",
        kind="edit",
        started_at="2026-10-11T10:00:00.000Z",
        agent=models.AgentRef(kind="person", name="smoke"),
    )
    start = parse_utc("2026-10-11T09:00:00.000Z")
    paths = {
        "a": TrackPath([start, start + 3_600_000], [Position(179.9, 0), Position(-179.8, 0.1)]),
        "b": TrackPath([start, start + 3_600_000], [Position(179.95, 0.05), Position(-179.9, 0)]),
        "c": TrackPath([start, start + 3_600_000], [Position(0, 89.9), Position(180, 89.9)]),
    }
    with tempfile.TemporaryDirectory() as folder:
        catalogue = Catalogue.create(Path(folder) / "cat", "smoke", "Smoke", "")
        catalogue.create_plot("p", "Plot")
        features = [_track(name, path) for name, path in paths.items()]
        catalogue.commit("p", [record], Changes(added=features))
        view = {"primary": "a", "secondaries": ["b", "c"]}
        at = [start + i * 18_000 for i in range(200)]
        results = [tote(catalogue, "p", at[0], view)]
        began = time.perf_counter()
        for t in at:
            tote(catalogue, "p", t, view)
        per_call_ms = (time.perf_counter() - began) / len(at) * 1000
        results.append(tote(catalogue, "p", start + 1_800_000, view))
        # Ranges of thousands of kilometres in metres: a micrometre is the last bit's scale.
        return _rounded(results, 6), per_call_ms


if __name__ == "__main__":
    docs = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    print(json.dumps(main(Path(sys.argv[1]), docs), indent=2, sort_keys=True))
