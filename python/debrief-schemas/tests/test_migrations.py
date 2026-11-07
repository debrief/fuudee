"""Older files open only through registered migrations (SUB-13, SUB-14).

The registry is empty, so these tests register a migration of their own, from a
version before the current one, and take it away again afterwards.
"""

import copy
import json
from pathlib import Path

import pytest

from debrief_schemas import (
    SCHEMA_VERSION,
    DocumentKind,
    SchemaVersionError,
    dump_document,
    load_document,
    load_plot,
    migrations,
    unrecorded_migration,
)
from debrief_schemas.chain import (
    GENESIS_HASH,
    chain_problem,
    content_text_of,
    step_hash,
    text_hash,
)

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "schemas" / "fixtures"
OLDER = "0.0.0"  # before every version Debrief has had
MIDDLE = "0.0.1"  # between it and the current version
assert migrations.parse_version(SCHEMA_VERSION) > migrations.parse_version(MIDDLE)
REGISTERED = migrations.MIGRATIONS  # the real registry, before any test replaces it


def _fixture(kind: str, name: str) -> dict:
    return json.loads((FIXTURES / kind / "valid" / f"{name}.json").read_text())


@pytest.fixture(autouse=True)
def registry(monkeypatch: pytest.MonkeyPatch) -> dict:
    """An empty registry for each test, the real one restored afterwards."""
    empty: dict = {}
    monkeypatch.setattr(migrations, "MIGRATIONS", empty)
    return empty


def _title_to_name(kind: str, document: dict) -> dict:
    """A test-only migration: at OLDER a track's name was called its title."""
    assert kind == "plot"
    for feature in document["features"]:
        props = feature["properties"]
        if props["kind"] == "track" and "title" in props:
            props["name"] = props.pop("title")
    return document


def _older_track() -> dict:
    plot = _fixture("plot", "minimal-track")
    plot["schema_version"] = OLDER
    props = plot["features"][0]["properties"]
    props["title"] = props.pop("name")
    return plot


def test_the_registry_starts_empty() -> None:
    """Nothing registered, so only the current version opens, as before."""
    assert REGISTERED == {}


def test_older_file_with_a_migration_opens_and_records_it() -> None:
    migrations.register_migration(
        OLDER, SCHEMA_VERSION, _title_to_name, "a track's title is its name"
    )
    older = _older_track()
    given = copy.deepcopy(older)

    plot = load_plot(json.dumps(older))

    assert older == given  # the document read is never changed
    assert plot.schema_version == SCHEMA_VERSION
    assert plot.features[0].properties.name == "NELSON"
    record = plot.provenance[-1]
    assert record.kind == "migration"
    assert record.agent.kind == "software_agent"
    assert record.agent.name == migrations.MIGRATION_AGENT
    assert record.notes == [
        f"Data-file schema {OLDER} to {SCHEMA_VERSION}: a track's title is its name"
    ]
    # Written out, it is a file of the current version.
    again = json.loads(dump_document(DocumentKind.PLOT, plot))
    assert again["schema_version"] == SCHEMA_VERSION


def test_a_chain_of_migrations_is_followed_and_each_recorded() -> None:
    migrations.register_migration(OLDER, MIDDLE, _title_to_name, "a track's title is its name")
    migrations.register_migration(MIDDLE, SCHEMA_VERSION, lambda _k, d: d, "nothing else")

    plot = load_plot(_older_track())

    assert plot.features[0].properties.name == "NELSON"
    assert [r.kind for r in plot.provenance] == ["migration", "migration"]
    assert [r.notes[0].split(":")[0] for r in plot.provenance] == [
        f"Data-file schema {OLDER} to {MIDDLE}",
        f"Data-file schema {MIDDLE} to {SCHEMA_VERSION}",
    ]


def _older_with_history() -> dict:
    """A plot whose history has a step undone, written at OLDER, as Debrief wrote it then:
    the current step's result_hash is the content's, version included."""
    older = _fixture("plot", "history-undone-and-abandoned")
    older["schema_version"] = OLDER
    history = older["history"]
    current = history["steps"][history["current"] - 1]
    current["result_hash"] = text_hash(content_text_of(older))
    previous = GENESIS_HASH
    for step in history["steps"]:
        step["step_hash"] = step_hash(step, previous)
        previous = step["step_hash"]
    history["head_hash"] = previous
    return older


def test_opening_an_older_plot_leaves_its_file_and_history_untouched(tmp_path: Path) -> None:
    migrations.register_migration(OLDER, SCHEMA_VERSION, _title_to_name, "nothing changed")
    path = tmp_path / "plot.json"
    path.write_text(json.dumps(_older_with_history(), indent=2))
    on_disk = path.read_bytes()
    history_as_read = json.loads(on_disk)["history"]

    plot = load_plot(path.read_text())  # migrated in memory, its history checked as read

    assert path.read_bytes() == on_disk  # opening writes nothing
    assert plot.schema_version == SCHEMA_VERSION
    assert plot.provenance[-1].kind == "migration"
    # The history is the file's, step for step: the migration is not recorded yet.
    assert plot.history.current == history_as_read["current"]
    assert plot.history.head_hash == history_as_read["head_hash"]
    assert [(s.step_hash, str(s.state)) for s in plot.history.steps] == [
        (s["step_hash"], s["state"]) for s in history_as_read["steps"]
    ]
    assert [r.kind for r in unrecorded_migration(plot)] == ["migration"]


def test_saving_a_migrated_plot_records_the_migration_in_one_step() -> None:
    migrations.register_migration(OLDER, SCHEMA_VERSION, lambda _k, d: d, "nothing changed")
    older = _older_with_history()
    steps_before = len(older["history"]["steps"])

    plot = load_plot(json.dumps(older))
    first = dump_document(DocumentKind.PLOT, plot)  # the first save records it
    second = dump_document(DocumentKind.PLOT, plot)  # and a later one does not again

    assert first == second
    raw = json.loads(first)
    assert len(raw["history"]["steps"]) == steps_before + 1
    assert raw["history"]["current"] == steps_before + 1
    step = raw["history"]["steps"][-1]
    assert step["after"] == 4 and step["state"] == "applied"
    assert [r["kind"] for r in step["records"]] == ["migration"]
    assert step["records"] == raw["provenance"][-1:]
    assert step["result_hash"] == text_hash(content_text_of(raw))
    # The step undone before the migration is now replaced by it (SUB-21).
    assert raw["history"]["steps"][4]["state"] == "abandoned"
    assert chain_problem(raw["history"]["steps"], raw["history"]["head_hash"]) is None
    # The model holds what was written; the saved file opens with nothing to migrate.
    assert len(plot.history.steps) == steps_before + 1
    assert unrecorded_migration(plot) == []
    reopened = load_plot(first)
    assert len(reopened.history.steps) == steps_before + 1
    assert unrecorded_migration(reopened) == []


@pytest.mark.parametrize(
    "copied",
    [
        lambda p: p.model_copy(),
        lambda p: p.model_copy(deep=True),
        copy.deepcopy,
        copy.copy,
    ],
    ids=["model_copy", "model_copy-deep", "deepcopy", "copy"],
)
def test_a_copy_made_after_opening_records_the_migration_when_saved(copied) -> None:
    migrations.register_migration(OLDER, SCHEMA_VERSION, lambda _k, d: d, "nothing changed")
    older = _older_with_history()
    steps_before = len(older["history"]["steps"])

    plot = load_plot(json.dumps(older))
    duplicate = copied(plot)

    assert [r.kind for r in unrecorded_migration(duplicate)] == ["migration"]
    raw = json.loads(dump_document(DocumentKind.PLOT, duplicate))
    added = raw["history"]["steps"][steps_before:]
    assert [[r["kind"] for r in s["records"]] for s in added] == [["migration"]]
    assert chain_problem(raw["history"]["steps"], raw["history"]["head_hash"]) is None
    # The pending migration is state on the model, never written to the file.
    assert "unrecorded" not in json.dumps(raw)
    assert unrecorded_migration(duplicate) == []
    # Saving the copy leaves the plot it was copied from to record its own.
    assert len(plot.history.steps) == steps_before
    assert [r.kind for r in unrecorded_migration(plot)] == ["migration"]


def test_older_stac_item_with_a_migration_opens_at_the_current_version() -> None:
    migrations.register_migration(OLDER, SCHEMA_VERSION, lambda _k, d: d, "nothing changed")
    item = _fixture("stac_item", "serial-item")
    item["properties"]["debrief:schema_version"] = OLDER

    loaded = load_document(DocumentKind.STAC_ITEM, item)

    assert loaded.properties.debrief_schema_version == SCHEMA_VERSION


def test_older_file_without_a_migration_is_refused_naming_its_version() -> None:
    with pytest.raises(SchemaVersionError, match=f"schema {OLDER}, which .* cannot migrate"):
        load_plot(_older_track())


def test_a_chain_stopping_short_of_the_current_version_is_refused() -> None:
    migrations.register_migration(OLDER, MIDDLE, _title_to_name, "a track's title is its name")
    with pytest.raises(SchemaVersionError, match=OLDER):
        load_plot(_older_track())


def test_newer_file_is_refused_whatever_is_registered() -> None:
    newer = "99.0.0"
    migrations.register_migration(OLDER, SCHEMA_VERSION, lambda _k, d: d, "nothing changed")
    plot = _fixture("plot", "minimal-track")
    plot["schema_version"] = newer
    with pytest.raises(SchemaVersionError, match=f"needs data-file schema {newer}"):
        load_plot(plot)


def test_writing_never_migrates() -> None:
    migrations.register_migration(OLDER, SCHEMA_VERSION, lambda _k, d: d, "nothing changed")
    plot = load_plot(_fixture("plot", "minimal-track"))
    older = plot.model_copy(update={"schema_version": OLDER})
    with pytest.raises(SchemaVersionError):
        dump_document(DocumentKind.PLOT, older)


@pytest.mark.parametrize(
    ("start", "end", "why"),
    [
        ("0.0.2", "0.0.1", "goes forward"),
        ("0.0.1", "0.0.1", "goes forward"),
        ("0.0.1", "x", "not a semantic version"),
    ],
)
def test_a_migration_must_go_forward(start: str, end: str, why: str) -> None:
    with pytest.raises(ValueError, match=why):
        migrations.register_migration(start, end, lambda _k, d: d, "note")


def test_one_migration_from_each_version() -> None:
    migrations.register_migration("0.0.1", "0.0.2", lambda _k, d: d, "note")
    with pytest.raises(ValueError, match="already registered"):
        migrations.register_migration("0.0.1", "0.0.3", lambda _k, d: d, "note")
