"""The Tote over a plot (CAP-06, CAP-07): rows per secondary at a time, the primary's own
measures, tracks with no data or no longer in the plot, the choice of tracks kept in the
island (never a step), and tracks prepared once while the plot is unchanged."""

from pathlib import Path

import pytest

from debrief_kernel.geodesy import Position, range_bearing
from debrief_schemas import DocumentValidationError, models
from debrief_stac import Catalogue, Changes
from debrief_stac import tote as tote_module
from debrief_stac.tote import measure_groups, tote, tote_tracks

AGENT = models.AgentRef(kind="person", name="analyst")
T = "2026-10-11T09:3{}:00.000Z"


def record(n: int) -> models.ProvRecord:
    return models.ProvRecord(
        id=f"op-{n}", kind="edit", started_at="2026-10-11T10:00:00.000Z", agent=AGENT
    )


def track(feature_id, name, coordinates, minutes, *, courses=None, depths=None, colour=None):
    return models.TrackFeature(
        type="Feature",
        id=feature_id,
        geometry=models.LineStringGeometry(type="LineString", coordinates=coordinates),
        properties=models.TrackProperties(
            kind="track",
            name=name,
            times=[T.format(m) for m in minutes],
            style=models.TrackStyle(colour=colour or "#0064bd"),
            courses=models.AngleSeries(unit="deg", values=courses) if courses else None,
            speeds=models.SpeedSeries(unit="[kn_i]", values=[10.0] * len(minutes))
            if courses
            else None,
            depths=models.LengthSeries(unit="m", values=depths) if depths else None,
        ),
    )


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    details = models.PlotFeature(
        type="Feature",
        id="plot",
        geometry=None,
        properties=models.PlotProperties(kind="plot", title="Plot"),
    )
    blue = track("blue", "BLUE ONE", [[-4.0, 50.0], [-4.0, 50.1]], [0, 6], courses=[0.0, 0.0])
    red = track(
        "red",
        "RED ONE",
        [[-3.9, 50.0], [-3.9, 50.1]],
        [0, 6],
        courses=[350.0, 10.0],
        depths=[20.0, 30.0],
        colour="#e01c3e",
    )
    late = track("late", "LATE", [[-4.2, 50.0], [-4.2, 50.1]], [4, 6])
    catalogue.commit("p", [record(1)], Changes(added=[details, blue, red, late]))
    tote_module._CACHE.clear()
    return catalogue


VIEW = {"primary": "blue", "secondaries": ["red", "late", "gone"]}


def values(row) -> dict:
    return {v["measure"]: v.get("value") for v in row.get("values", [])}


def test_a_row_per_secondary_in_the_order_chosen(catalogue) -> None:
    result = tote(catalogue, "p", T.format(3), VIEW)
    models.ToteResult.model_validate(result)
    assert result["time"] == T.format(3)
    assert result["group"]["id"] == "core"
    assert [m["id"] for m in result["measures"]] == list(result["group"]["measures"])
    assert [r["track"] for r in result["rows"]] == ["red", "late", "gone"]
    red = result["rows"][0]
    assert (red["name"], red["colour"], red["status"]) == ("RED ONE", "#e01c3e", "ok")
    got = values(red)
    rng, brg = range_bearing(Position(-4.0, 50.05), Position(-3.9, 50.05))
    assert got["range"] == pytest.approx(rng.value, rel=1e-6)
    assert got["bearing"] == pytest.approx(brg.value, abs=1e-3)
    assert got["relative_bearing"] == pytest.approx(brg.value, abs=1e-3)  # primary heads 000
    assert got["course"] == pytest.approx(0.0, abs=1e-9)  # halfway from 350 to 010
    assert got["speed"] == pytest.approx(10 * 1852 / 3600)
    assert got["depth"] == pytest.approx(25.0)
    units = {v["measure"]: v["unit"] for v in red["values"]}
    assert units == {
        "range": "m",
        "bearing": "deg",
        "relative_bearing": "deg",
        "course": "deg",
        "speed": "m/s",
        "depth": "m",
    }


def test_the_primary_has_its_own_measures_only(catalogue) -> None:
    primary = tote(catalogue, "p", T.format(3), VIEW)["primary"]
    assert primary["track"] == "blue" and primary["status"] == "ok"
    assert [v["measure"] for v in primary["values"]] == ["course", "speed", "depth"]
    assert "value" not in primary["values"][2]  # no depth recorded: left out, not zero


def test_a_track_with_no_data_at_that_time_says_when_it_has(catalogue) -> None:
    rows = tote(catalogue, "p", T.format(3), VIEW)["rows"]
    assert rows[1] == {
        "track": "late",
        "name": "LATE",
        "colour": "#0064bd",
        "status": "no_data",
        "note": "Starts 09:34:00Z",
    }
    assert rows[2] == {"track": "gone", "status": "missing", "note": "No longer in the plot"}
    after = tote(catalogue, "p", "2026-10-11T09:37:00.000Z", VIEW)
    assert after["primary"]["status"] == "no_data"
    assert after["primary"]["note"] == "Ended 09:36:00Z"


def test_without_the_primary_relative_measures_are_left_out(catalogue) -> None:
    result = tote(catalogue, "p", T.format(5), {"primary": "late", "secondaries": ["red"]})
    assert values(result["rows"][0])["range"] is not None
    early = tote(catalogue, "p", T.format(1), {"primary": "late", "secondaries": ["red"]})
    got = values(early["rows"][0])
    assert got["range"] is None and got["relative_bearing"] is None
    assert got["course"] is not None  # its own measures still show


def test_no_choice_no_rows(catalogue) -> None:
    result = tote(catalogue, "p", T.format(3))
    assert "primary" not in result
    assert result["rows"] == []


def test_the_choice_is_read_from_the_island_and_saving_it_is_no_step(catalogue) -> None:
    head = catalogue.history("p").head()
    _, view_hash = catalogue.read_view("p")
    catalogue.write_view("p", {"tote": VIEW}, view_hash)
    assert catalogue.history("p").head() == head  # view state: never a step
    result = tote(catalogue, "p", T.format(3))
    assert result["primary"]["track"] == "blue"
    assert [r["track"] for r in result["rows"]] == ["red", "late", "gone"]


def test_the_island_refuses_a_primary_that_is_also_a_secondary(catalogue) -> None:
    _, view_hash = catalogue.read_view("p")
    with pytest.raises(DocumentValidationError, match="also a secondary"):
        catalogue.write_view("p", {"tote": {"primary": "red", "secondaries": ["red"]}}, view_hash)


def test_an_unknown_measure_group_shows_core_and_says_so(catalogue) -> None:
    result = tote(catalogue, "p", T.format(3), {**VIEW, "measure_group": "tma"})
    assert result["group"]["id"] == "core"
    assert "no measure group 'tma'" in result["note"]


def test_tracks_are_prepared_once_while_the_plot_is_unchanged(catalogue, monkeypatch) -> None:
    tote(catalogue, "p", T.format(1), VIEW)
    reads = []
    original = Catalogue.read_plot
    monkeypatch.setattr(
        Catalogue, "read_plot", lambda self, i: reads.append(i) or original(self, i)
    )
    for minute in range(6):
        tote(catalogue, "p", T.format(minute), VIEW)
    assert reads == []
    # Saving the island rewrites the file but not its content: still not read again.
    _, view_hash = catalogue.read_view("p")
    catalogue.write_view("p", {"tote": VIEW}, view_hash)
    tote(catalogue, "p", T.format(2), VIEW)
    assert reads == []
    # A change to the content is seen at once.
    catalogue.set_colour("p", ["red"], "#00ff00", AGENT, None)
    assert tote(catalogue, "p", T.format(2), VIEW)["rows"][0]["colour"] == "#00ff00"
    assert reads == ["p"]


def test_the_tracks_to_choose_from(catalogue) -> None:
    plot = catalogue.read_plot("p")
    assert tote_tracks(plot) == [
        {"id": "blue", "name": "BLUE ONE", "colour": "#0064bd"},
        {"id": "red", "name": "RED ONE", "colour": "#e01c3e"},
        {"id": "late", "name": "LATE", "colour": "#0064bd"},
    ]


def test_measure_groups_offer_core() -> None:
    groups = measure_groups()
    assert [g["id"] for g in groups["groups"]] == ["core"]
    assert {m["id"] for m in groups["measures"]} >= set(groups["groups"][0]["measures"])
