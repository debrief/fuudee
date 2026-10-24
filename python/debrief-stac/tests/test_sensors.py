"""Sensors and their cuts in a plot (CAP-22): added from what an importer read as one
step, resolved one cut or a period at a time, each resolution one recorded, undoable
step with provenance, undone and reset to ambiguous; coloured and hidden as steps; and
carried with their host track when it is split or merged (product owner, 24 Oct 2026)."""

from pathlib import Path

import pytest

from debrief_kernel.geodesy import Position, destination
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import models
from debrief_stac import Catalogue, CatalogueError, Changes, Conflict
from debrief_stac import sensors as plot_sensors
from debrief_stac.sensors import ReadCut, ReadSensor

AGENT = models.AgentRef(kind="person", name="analyst")
T0 = parse_utc("2026-10-11T09:00:00.000Z")
MINUTE = 60_000


def at(minutes: float) -> str:
    return format_utc(T0 + int(minutes * MINUTE))


def east(n: int) -> list[list[float]]:
    """n fixes a minute apart heading east at 10 kn."""
    out = []
    for i in range(n):
        p = destination(
            Position(-4.0, 50.0), Quantity(90, "deg"), Quantity(10 * 1852 / 60 * i, "m")
        )
        out.append([p.longitude, p.latitude])
    return out


def track(track_id: str = "track-blue", name: str = "BLUE ONE", n: int = 31, start=0.0):
    return models.TrackFeature(
        type="Feature",
        id=track_id,
        geometry=models.LineStringGeometry(type="LineString", coordinates=east(n)),
        properties=models.TrackProperties(
            kind="track",
            name=name,
            times=[at(start + i) for i in range(n)],
            style={"colour": "#0064bd"},
        ),
    )


def towed(host: str = "track-blue", minutes=range(0, 30)) -> ReadSensor:
    """A towed array heading east: the target to the north-east (port of course 090 is
    north), its ambiguous twin to the south-east."""
    return ReadSensor(
        name="Towed array",
        host_track_id=host,
        colour="#e01c3e",
        cuts=[
            ReadCut(T0 + m * MINUTE, 45.0 + m * 0.1, ambiguous=135.0 - m * 0.1, label=f"{m}")
            for m in minutes
        ],
    )


def bow(host: str = "track-blue") -> ReadSensor:
    return ReadSensor(
        name="Bow sonar",
        host_track_id=host,
        cuts=[ReadCut(T0 + m * MINUTE, 50.0, range_m=4000.0) for m in range(0, 30, 5)],
    )


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    origin = models.ProvRecord(id="op-1", kind="import", started_at=at(0), agent=AGENT)
    catalogue.commit("p", [origin], Changes(added=[track()]))
    record = models.ProvRecord(
        id="op-2", kind="import", started_at=at(0), agent=AGENT, notes=["Sensor data read"]
    )
    catalogue.add_sensors("p", [towed(), bow()], record)
    return catalogue


def plot(catalogue: Catalogue):
    return catalogue.read_plot("p")


def cut_ids(catalogue: Catalogue, sensor_name: str = "Towed array") -> list[str]:
    sensor = next(
        s for s in plot_sensors.sensors(plot(catalogue)) if s.properties.name == sensor_name
    )
    return [c.id for c in plot_sensors.cuts(plot(catalogue), sensor.id)]


def resolved(catalogue: Catalogue) -> list[str | None]:
    sensor = next(
        s for s in plot_sensors.sensors(plot(catalogue)) if s.properties.name == "Towed array"
    )
    return [
        None if c.properties.resolved is None else str(c.properties.resolved)
        for c in plot_sensors.cuts(plot(catalogue), sensor.id)
    ]


def last_record(catalogue: Catalogue) -> models.ProvRecord:
    return catalogue.history("p").steps()[-1].records[0]


# --- Adding ----------------------------------------------------------------------------


def test_sensors_and_their_cuts_are_features_of_their_own(catalogue: Catalogue) -> None:
    features = plot(catalogue).features
    kinds = [f.properties.kind for f in features]
    assert kinds.count("sensor") == 2
    assert kinds.count("sensor_cut") == 36
    sensor = next(f for f in features if f.properties.kind == "sensor")
    assert sensor.id == "sensor-blue-one-towed-array"
    assert sensor.geometry is None
    assert sensor.properties.host_track_id == "track-blue"
    first = next(f for f in features if f.properties.kind == "sensor_cut")
    assert first.id == "cut-00001"
    assert first.properties.sensor_id == sensor.id
    assert first.properties.colour is None  # its sensor's
    assert first.properties.resolved is None
    assert first.properties.ambiguous_bearing.value == pytest.approx(135.0)


def test_adding_sensor_data_is_one_step_with_the_importers_record(catalogue: Catalogue) -> None:
    steps = catalogue.history("p").steps()
    assert len(steps) == 2
    assert steps[-1].records[0].notes == ["Sensor data read"]


def test_a_sensor_needs_its_host_track_in_the_plot(catalogue: Catalogue) -> None:
    record = models.ProvRecord(id="op-3", kind="import", started_at=at(0), agent=AGENT)
    with pytest.raises(CatalogueError, match="no track 'track-ghost'"):
        catalogue.add_sensors("p", [towed("track-ghost")], record)


def test_new_cuts_are_numbered_on_from_those_in_the_plot(catalogue: Catalogue) -> None:
    record = models.ProvRecord(id="op-3", kind="import", started_at=at(0), agent=AGENT)
    _, (sensor_id,) = catalogue.add_sensors("p", [towed(minutes=range(2))], record)
    # Read again, a sensor of its name on its track is joined, as legacy merged them.
    assert sensor_id == "sensor-blue-one-towed-array"
    assert len(plot_sensors.sensors(plot(catalogue))) == 2
    ids = [c.id for c in plot_sensors.cuts(plot(catalogue), sensor_id)]
    # In time order, the new cuts numbered on from the highest: cut-00037 and cut-00038.
    assert ids[:4] == ["cut-00001", "cut-00037", "cut-00002", "cut-00038"]
    record = models.ProvRecord(id="op-4", kind="import", started_at=at(0), agent=AGENT)
    other = ReadSensor(name="Towed array 2", host_track_id="track-blue", cuts=[ReadCut(T0, 1.0)])
    _, (new_id,) = catalogue.add_sensors("p", [other], record)
    assert new_id == "sensor-blue-one-towed-array-2"


# --- Resolving ---------------------------------------------------------------------------


def test_keeping_port_for_one_cut_is_one_step_named_for_it(catalogue: Catalogue) -> None:
    first = cut_ids(catalogue)[0]
    catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": [first]}, AGENT)
    assert resolved(catalogue)[0] == "bearing"  # 045 is to port of 090
    assert resolved(catalogue)[1:] == [None] * 29
    record = last_record(catalogue)
    assert record.notes[0] == "Port bearing kept on Towed array cut at 09:00:00Z"
    assert {p.name: p.value for p in record.parameters} == {"keep": "port", "cuts": 1}
    assert record.selected == [first]


def test_keeping_starboard_keeps_the_ambiguous_twin(catalogue: Catalogue) -> None:
    first = cut_ids(catalogue)[0]
    catalogue.resolve_ambiguity("p", {"keep": "starboard", "cut_ids": [first]}, AGENT)
    assert resolved(catalogue)[0] == "ambiguous_bearing"


def test_a_line_clicked_keeps_that_bearing_and_says_its_side(catalogue: Catalogue) -> None:
    first = cut_ids(catalogue)[0]
    catalogue.resolve_ambiguity("p", {"keep": "ambiguous_bearing", "cut_ids": [first]}, AGENT)
    assert resolved(catalogue)[0] == "ambiguous_bearing"
    assert last_record(catalogue).notes[0] == (
        "Starboard bearing kept on Towed array cut at 09:00:00Z"
    )


def test_a_period_is_one_step_for_every_cut_in_it(catalogue: Catalogue) -> None:
    sensor = plot_sensors.sensors(plot(catalogue))[0].id
    catalogue.resolve_ambiguity(
        "p",
        {"keep": "port", "sensor_ids": [sensor], "period": {"start": at(10), "end": at(19)}},
        AGENT,
    )
    assert resolved(catalogue) == [None] * 10 + ["bearing"] * 10 + [None] * 10
    record = last_record(catalogue)
    assert record.notes[0] == "Port kept: 10 Towed array cuts 09:10:00Z–09:19:00Z"
    assert {p.name: p.value for p in record.parameters} == {
        "keep": "port",
        "sensors": sensor,
        "start": at(10),
        "end": at(19),
    }
    assert len(catalogue.history("p").steps()) == 3


def test_undo_brings_the_ambiguity_back_and_redo_the_resolution(catalogue: Catalogue) -> None:
    sensor = plot_sensors.sensors(plot(catalogue))[0].id
    catalogue.resolve_ambiguity("p", {"keep": "starboard", "sensor_ids": [sensor]}, AGENT)
    assert set(resolved(catalogue)) == {"ambiguous_bearing"}
    catalogue.history("p").undo()
    assert set(resolved(catalogue)) == {None}
    catalogue.history("p").redo()
    assert set(resolved(catalogue)) == {"ambiguous_bearing"}


def test_cuts_can_be_made_ambiguous_again_as_a_step_of_their_own(catalogue: Catalogue) -> None:
    ids = cut_ids(catalogue)
    catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": ids[:3]}, AGENT)
    catalogue.resolve_ambiguity("p", {"keep": "ambiguous", "cut_ids": ids[:5]}, AGENT)
    assert set(resolved(catalogue)) == {None}
    record = last_record(catalogue)
    assert record.notes[0] == "Ambiguous again: 3 Towed array cuts 09:00:00Z–09:02:00Z"
    assert "2 cuts already ambiguous." in record.notes
    assert len(catalogue.history("p").steps()) == 4


def test_cuts_with_nothing_ambiguous_are_left_and_said(catalogue: Catalogue) -> None:
    ids = cut_ids(catalogue)[:2] + cut_ids(catalogue, "Bow sonar")[:3]
    catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": ids}, AGENT)
    assert "3 cuts had no ambiguous bearing, so nothing to keep." in last_record(catalogue).notes


def test_nothing_to_change_is_refused_saying_why(catalogue: Catalogue) -> None:
    ids = cut_ids(catalogue, "Bow sonar")
    with pytest.raises(CatalogueError, match="no ambiguous bearing"):
        catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": ids}, AGENT)
    sensor = plot_sensors.sensors(plot(catalogue))[0].id
    with pytest.raises(CatalogueError, match="none of the sensor's cuts fall in the period"):
        catalogue.resolve_ambiguity(
            "p",
            {"keep": "port", "sensor_ids": [sensor], "period": {"start": at(40), "end": at(50)}},
            AGENT,
        )
    with pytest.raises(CatalogueError, match="keep is port, starboard"):
        catalogue.resolve_ambiguity("p", {"keep": "left", "cut_ids": ids}, AGENT)


def test_cuts_outside_the_hosts_span_cannot_be_told_port_from_starboard(
    catalogue: Catalogue,
) -> None:
    record = models.ProvRecord(id="op-3", kind="import", started_at=at(0), agent=AGENT)
    _, (late,) = catalogue.add_sensors("p", [towed(minutes=range(28, 34))], record)
    catalogue.resolve_ambiguity("p", {"keep": "port", "sensor_ids": [late]}, AGENT)
    notes = last_record(catalogue).notes
    assert any(n.startswith("3 cuts left ambiguous: outside the host track's span") for n in notes)


def test_a_resolution_over_a_change_made_elsewhere_is_refused(catalogue: Catalogue) -> None:
    base = catalogue.history("p").base()
    ids = cut_ids(catalogue)
    catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": ids[:1]}, AGENT)
    with pytest.raises(Conflict):
        catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": ids[1:2]}, AGENT, base)


def test_the_kept_bearing_stays_kept_when_the_host_is_moved(catalogue: Catalogue) -> None:
    """The cut records which bearing, not which side: moving the track does not flip it."""
    first = cut_ids(catalogue)[0]
    catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": [first]}, AGENT)
    edit = {"action": "rotate", "angle": {"value": 180, "unit": "deg"}}
    catalogue.edit_track("p", "track-blue", edit, AGENT)
    assert resolved(catalogue)[0] == "bearing"


# --- Colour and hiding ------------------------------------------------------------------


def test_a_sensor_is_coloured_and_hidden_as_steps(catalogue: Catalogue) -> None:
    sensor = plot_sensors.sensors(plot(catalogue))[0].id
    catalogue.set_colour("p", [sensor], "#00800b", AGENT, colour_name="green")
    assert last_record(catalogue).notes[0] == "Colour of Towed array set to green"
    catalogue.set_hidden("p", [sensor], True, AGENT)
    assert last_record(catalogue).notes[0] == "Towed array hidden on the map"
    after = next(f for f in plot(catalogue).features if f.id == sensor)
    assert after.properties.colour == "#00800b"
    assert after.properties.hidden is True
    catalogue.history("p").undo()
    catalogue.history("p").undo()
    after = next(f for f in plot(catalogue).features if f.id == sensor)
    assert after.properties.colour == "#e01c3e"
    assert not after.properties.hidden


def test_a_cut_hidden_is_named_by_its_sensor_and_time(catalogue: Catalogue) -> None:
    first = cut_ids(catalogue)[0]
    catalogue.set_hidden("p", [first], True, AGENT)
    assert last_record(catalogue).notes[0] == "Towed array cut at 09:00:00Z hidden on the map"


# --- With the host track ----------------------------------------------------------------


def test_a_split_track_takes_the_later_cuts_to_its_second_part(catalogue: Catalogue) -> None:
    _, (first, second) = catalogue.split_track("p", "track-blue", at(20), AGENT)
    features = {f.id: f for f in plot(catalogue).features}
    towed_ids = [s.id for s in plot_sensors.sensors(plot(catalogue))]
    assert towed_ids == [
        "sensor-blue-one-towed-array",
        "sensor-blue-one-bow-sonar",
        "sensor-blue-one-2-towed-array",
        "sensor-blue-one-2-bow-sonar",
    ]
    later = features["sensor-blue-one-2-towed-array"]
    assert later.properties.host_track_id == second
    assert later.properties.name == "Towed array"
    moved = plot_sensors.cuts(plot(catalogue), later.id)
    assert [c.properties.time for c in moved] == [at(m) for m in range(20, 30)]
    assert len(plot_sensors.cuts(plot(catalogue), "sensor-blue-one-towed-array")) == 20
    notes = last_record(catalogue).notes
    assert "Towed array: its 10 cuts from the split on are a sensor of BLUE ONE (2)'s" in notes


def test_merged_tracks_take_their_sensors(catalogue: Catalogue) -> None:
    origin = models.ProvRecord(id="op-3", kind="import", started_at=at(0), agent=AGENT)
    catalogue.commit("p", [origin], Changes(added=[track("track-later", "BLUE TWO", 5, 40)]))
    record = models.ProvRecord(id="op-4", kind="import", started_at=at(0), agent=AGENT)
    _, (later,) = catalogue.add_sensors("p", [towed("track-later", range(40, 44))], record)
    before = len(plot_sensors.cuts(plot(catalogue), "sensor-blue-one-towed-array"))
    _, merged, lost = catalogue.merge_tracks("p", ["track-blue", "track-later"], AGENT)
    assert merged == "track-blue"
    # Sensors of one name are one again, every cut on the first, as legacy joined them.
    assert not any(f.id == later for f in plot(catalogue).features)
    towed_now = plot_sensors.cuts(plot(catalogue), "sensor-blue-one-towed-array")
    assert len(towed_now) == before + 4
    assert "Towed array: one sensor again, with every cut." in lost
    hosts = {s.properties.host_track_id for s in plot_sensors.sensors(plot(catalogue))}
    assert hosts == {"track-blue"}


def test_a_split_and_merged_track_has_its_sensors_as_they_were(catalogue: Catalogue) -> None:
    sensors_before = [s.id for s in plot_sensors.sensors(plot(catalogue))]
    cuts_before = cut_ids(catalogue)
    _, (first, second) = catalogue.split_track("p", "track-blue", at(20), AGENT)
    catalogue.merge_tracks("p", [first, second], AGENT)
    assert [s.id for s in plot_sensors.sensors(plot(catalogue))] == sensors_before
    assert sorted(cut_ids(catalogue)) == sorted(cuts_before)
