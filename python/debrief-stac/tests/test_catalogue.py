import json
import stat
from pathlib import Path

import pytest

from debrief_schemas import DocumentKind, load_document, load_plot
from debrief_stac import (
    Catalogue,
    CatalogueError,
    CompositeCatalogue,
    NewerSchemaError,
    StoreError,
    plot_extent,
)

FIXTURES = Path(__file__).resolve().parents[3] / "schemas" / "fixtures" / "plot" / "valid"


def _plot(name: str = "mixed-features.json"):
    return load_plot((FIXTURES / name).read_text())


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    return Catalogue.create(tmp_path / "cat", "exercise-2026", "Exercise 2026", "Test catalogue")


def test_create_and_reopen(catalogue: Catalogue, tmp_path: Path) -> None:
    reopened = Catalogue.open(tmp_path / "cat")
    assert reopened.id == "exercise-2026"
    assert reopened.item_ids() == []
    with pytest.raises(CatalogueError):
        Catalogue.create(tmp_path / "cat", "again", "x", "y")
    with pytest.raises(CatalogueError):
        Catalogue.open(tmp_path / "nowhere")


def test_files_written_are_valid_documents(catalogue: Catalogue, tmp_path: Path) -> None:
    catalogue.create_plot("serial-01", "Serial 1", _plot())
    root = tmp_path / "cat"
    load_document(DocumentKind.STAC_CATALOG, (root / "catalog.json").read_text())
    load_document(DocumentKind.STAC_ITEM, (root / "serial-01" / "serial-01.json").read_text())
    load_plot((root / "serial-01" / "plot.geojson").read_text())


def test_plot_round_trip_and_extent(catalogue: Catalogue) -> None:
    plot = _plot()
    item = catalogue.create_plot("serial-01", "Serial 1", plot)
    assert catalogue.read_plot("serial-01") == plot
    extent = plot_extent(plot)
    assert item.bbox == list(extent.bbox)
    assert item.properties.start_datetime == "2026-10-11T09:30:00.000Z"
    assert item.properties.end_datetime == "2026-10-11T09:32:00.000Z"
    assert item.properties.datetime is None


def test_empty_plot_gets_a_datetime_and_no_geometry(catalogue: Catalogue) -> None:
    item = catalogue.create_plot("empty", "Empty")
    assert item.geometry is None and item.bbox is None
    assert item.properties.datetime is not None
    assert catalogue.read_plot("empty").features == []


def test_write_plot_updates_extent(catalogue: Catalogue) -> None:
    catalogue.create_plot("serial-01", "Serial 1")
    catalogue.write_plot("serial-01", _plot())
    item = catalogue.read_item("serial-01")
    assert item.bbox is not None and item.properties.start_datetime is not None


def test_items_found_by_walking_not_child_links(catalogue: Catalogue, tmp_path: Path) -> None:
    catalogue.create_plot("a", "A")
    catalogue.create_plot("b", "B")
    root = tmp_path / "cat"
    # Remove the child hints: items are still found (SUB-23).
    data = json.loads((root / "catalog.json").read_text())
    data["links"] = [link for link in data["links"] if link["rel"] != "child"]
    (root / "catalog.json").write_text(json.dumps(data))
    # A stray folder with an item claiming another parent is ignored.
    (root / "stray").mkdir()
    (root / "stray" / "stray.json").write_text(
        json.dumps({"links": [{"rel": "parent", "href": "../../other.json"}]})
    )
    assert Catalogue.open(root).item_ids() == ["a", "b"]


@pytest.mark.parametrize("bad", ["", "../escape", "a/b", ".hidden", "x" * 200])
def test_item_ids_are_safe_names(catalogue: Catalogue, bad: str) -> None:
    with pytest.raises(CatalogueError):
        catalogue.create_plot(bad, "Bad")


def test_duplicate_item_refused(catalogue: Catalogue) -> None:
    catalogue.create_plot("a", "A")
    with pytest.raises(CatalogueError):
        catalogue.create_plot("a", "Again")


def test_sources_are_immutable_and_hashed(catalogue: Catalogue, tmp_path: Path) -> None:
    catalogue.create_plot("serial-01", "Serial 1")
    source = tmp_path / "serial-01.rep"
    source.write_text("951212 050000.000 NELSON @C 22 10 00.00 N 021 59 00.00 W 269.7 2.0 0\n")
    ref = catalogue.add_source("serial-01", source)
    assert ref.href == "sources/serial-01.rep"
    assert ref.content_hash.startswith("sha256:")
    stored = tmp_path / "cat" / "serial-01" / "sources" / "serial-01.rep"
    assert not stat.S_IMODE(stored.stat().st_mode) & stat.S_IWUSR
    assert (
        catalogue.assets("serial-01")["source-serial-01.rep"].debrief_content_hash
        == ref.content_hash
    )
    assert catalogue.verify_sources("serial-01") == []
    # Importing the same file name again never overwrites the source.
    with pytest.raises((CatalogueError, StoreError)):
        catalogue.add_source("serial-01", source, key="second")


def test_payloads_are_hashed_data_assets(catalogue: Catalogue, tmp_path: Path) -> None:
    catalogue.create_plot("serial-01", "Serial 1")
    payload = tmp_path / "bearings.parquet"
    payload.write_bytes(b"PAR1 not really")
    ref = catalogue.add_payload("serial-01", payload, media_type="application/vnd.apache.parquet")
    assert ref.href == "payloads/bearings.parquet"
    asset = catalogue.assets("serial-01")["payload-bearings.parquet"]
    assert asset.debrief_asset_kind == "payload"
    assert asset.roles == ["data"]
    assert asset.debrief_content_hash == ref.content_hash
    stored = tmp_path / "cat" / "serial-01" / "payloads" / "bearings.parquet"
    assert not stat.S_IMODE(stored.stat().st_mode) & stat.S_IWUSR
    assert catalogue.verify_sources("serial-01") == []
    stored.chmod(stat.S_IWUSR | stat.S_IRUSR)
    stored.write_bytes(b"PAR1 changed after import")
    (problem,) = catalogue.verify_sources("serial-01")
    assert problem.startswith("payload ") and "changed" in problem


def test_changed_and_missing_sources_reported(catalogue: Catalogue, tmp_path: Path) -> None:
    catalogue.create_plot("serial-01", "Serial 1")
    source = tmp_path / "a.rep"
    source.write_text("original\n")
    catalogue.add_source("serial-01", source)
    stored = tmp_path / "cat" / "serial-01" / "sources" / "a.rep"
    stored.chmod(stat.S_IWUSR | stat.S_IRUSR)
    stored.write_text("tampered, and longer\n")
    assert "changed" in catalogue.verify_sources("serial-01")[0]
    # A fresh session re-hashes everything too.
    assert "changed" in Catalogue.open(tmp_path / "cat").verify_sources("serial-01")[0]
    stored.unlink()
    assert "missing" in catalogue.verify_sources("serial-01")[0]
    # Only the sources asked about are checked.
    assert catalogue.verify_sources("serial-01", hrefs=["sources/other.rep"]) == []


def test_atomic_write_leaves_no_temporary_files(catalogue: Catalogue, tmp_path: Path) -> None:
    catalogue.create_plot("serial-01", "Serial 1", _plot())
    plot = catalogue.read_plot("serial-01")
    edited = plot.model_copy(
        update={
            "features": [
                plot.features[0].model_copy(
                    update={
                        "properties": plot.features[0].properties.model_copy(update={"name": "X"})
                    }
                ),
                *plot.features[1:],
            ],
            "provenance": [*plot.provenance, plot.provenance[0].model_copy(update={"id": "p2"})],
        }
    )
    catalogue.write_plot("serial-01", edited)
    leftovers = [p for p in (tmp_path / "cat").rglob("*") if p.name.endswith(".tmp")]
    assert leftovers == []


def test_newer_schema_warning(catalogue: Catalogue, tmp_path: Path) -> None:
    root = tmp_path / "cat"
    # A catalogue declaring an older schema cannot be opened by this build
    # (SUB-14, no migration before 1.0.0), so set the declaration on the open model.
    catalogue.model.debrief_schema_version = "0.0.1"
    with pytest.raises(NewerSchemaError, match="0.0.1"):
        catalogue.create_plot("a", "A")
    catalogue.create_plot("a", "A", allow_newer_schema=True)
    assert Catalogue.open(root).schema_version == catalogue.model.debrief_schema_version


def test_composite_view_shows_source_catalogue(tmp_path: Path) -> None:
    first = Catalogue.create(tmp_path / "one", "one", "One", "First")
    second = Catalogue.create(tmp_path / "two", "two", "Two", "Second")
    first.create_plot("a", "A", _plot())
    second.create_plot("b", "B")
    view = CompositeCatalogue([first, second])
    assert [(s.catalogue_id, s.item_id) for s in view.summaries()] == [("one", "a"), ("two", "b")]
    assert view.read_plot("one", "a") == _plot()
    with pytest.raises(CatalogueError):
        CompositeCatalogue([first, Catalogue.open(tmp_path / "one")])
