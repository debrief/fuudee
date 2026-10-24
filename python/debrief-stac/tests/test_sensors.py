"""Sensors and their cuts in a plot (CAP-22): added from what an importer read as one
step, resolved one cut or a period at a time, each resolution one recorded, undoable
step with provenance, undone and reset to ambiguous; coloured and hidden as steps; and
carried with their host track when it is split or merged (product owner, 24 Oct 2026)."""

from pathlib import Path

import pytest

from debrief_kernel.geodesy import Position, TrackPath, destination
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


# --- Round 2: the panel's findings (24 Oct 2026) ------------------------------------------


def test_a_split_keeps_cuts_between_the_parts_drawable_and_resolvable(
    catalogue: Catalogue,
) -> None:
    """M2: a split at 09:20:30 leaves the 09:20:00 fix the first part's last and 09:21:00
    the second's first; cuts between were outside both spans, so never drawn. Round 3
    (L-1): pinned, such a cut keeps its course too, so it can still be resolved, and its
    origin is marked derived, not recorded."""
    record = models.ProvRecord(id="op-9", kind="import", started_at=at(0), agent=AGENT)
    gap = ReadSensor(
        name="Hull",
        host_track_id="track-blue",
        cuts=[ReadCut(T0 + int(20.4 * MINUTE), 10.0, ambiguous=170.0)],
    )
    catalogue.add_sensors("p", [gap], record)
    before = plot(catalogue)
    (cut,) = plot_sensors.cuts(before, "sensor-blue-one-hull")
    host = next(f for f in before.features if f.id == "track-blue")
    place = plot_sensors.place_of(cut, TrackPath.from_feature(host), None)
    catalogue.split_track("p", "track-blue", at(20.5), AGENT)
    after = plot(catalogue)
    (cut,) = [c for c in plot_sensors.cuts(after) if c.properties.bearing.value == 10.0]
    assert cut.properties.origin == pytest.approx(
        [place.position.longitude, place.position.latitude]
    )
    assert cut.properties.origin_derived is True
    assert cut.properties.course.value == pytest.approx(place.course)
    notes = last_record(catalogue).notes
    assert any(" near the split keep the position they were drawn from" in n for n in notes)
    catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": [cut.id]}, AGENT)
    (cut,) = [c for c in plot_sensors.cuts(plot(catalogue)) if c.id == cut.id]
    assert str(cut.properties.resolved) == "bearing"  # 010 is to port of 090
    described = plot_sensors.describe(plot(catalogue), with_cuts=True)
    entry = next(c for s in described for c in s["cut_list"] if c["id"] == cut.id)
    assert entry["origin_derived"] is True


def l_track(catalogue: Catalogue) -> None:
    """An L, logged: north 3 km in 10 minutes, turning east at 09:10, east 3 km."""
    coordinates = [[-4.0, 50.0]]
    for i in range(1, 21):
        heading = 0 if i <= 10 else 90
        p = destination(Position(*coordinates[-1]), Quantity(heading, "deg"), Quantity(300, "m"))
        coordinates.append([p.longitude, p.latitude])
    ell = models.TrackFeature(
        type="Feature",
        id="track-ell",
        geometry=models.LineStringGeometry(type="LineString", coordinates=coordinates),
        properties=models.TrackProperties(
            kind="track",
            name="ELL",
            times=[at(i) for i in range(21)],
            courses=models.AngleSeries(unit="deg", values=[0.0] * 10 + [90.0] * 11),
            style={"colour": "#0064bd"},
        ),
    )
    origin = models.ProvRecord(id="op-5", kind="import", started_at=at(0), agent=AGENT)
    catalogue.commit("p", [origin], Changes(added=[ell]))


def test_a_split_pins_an_arrays_cuts_its_worm_reached_past(catalogue: Catalogue) -> None:
    """Round 3, M-3: an array 600 m astern, worm in the hole, two minutes back along the
    track: split at 09:11:30, the cuts just after it walked back round the turn into the
    first part, and moved (and their sides with them) once the part was cut off."""
    l_track(catalogue)
    record = models.ProvRecord(id="op-6", kind="import", started_at=at(0), agent=AGENT)
    read = ReadSensor(
        name="Towed array",
        host_track_id="track-ell",
        cuts=[ReadCut(T0 + int(m * MINUTE), 30.0, ambiguous=150.0) for m in range(1, 20)],
    )
    catalogue.add_sensors("p", [read], record)
    sensor = next(
        s
        for s in plot_sensors.sensors(plot(catalogue))
        if s.properties.host_track_id == "track-ell"
    )
    catalogue.set_array_offset("p", [sensor.id], Quantity(600, "m"), AGENT)

    def drawn():
        out = {}
        for d in plot_sensors.describe(plot(catalogue), with_cuts=True):
            for c in d.get("cut_list", []):
                out[c["time"]] = (c["origin"], c.get("side"))
        return out

    before = drawn()
    catalogue.split_track("p", "track-ell", at(11.5), AGENT)
    after = drawn()
    assert set(before) == set(after)
    for when, (origin, side) in before.items():
        assert after[when][0] == pytest.approx(origin, abs=1e-9), when
        assert after[when][1] == side, when
    pinned = [c for c in plot_sensors.cuts(plot(catalogue)) if c.properties.origin_derived]
    # 09:12 and 09:13 walked back past 09:11:30 (600 m is 2 minutes); none before it moved.
    assert sorted(c.properties.time[11:16] for c in pinned) == ["09:12", "09:13"]
    assert any(n.startswith("2 cuts near the split keep") for n in last_record(catalogue).notes)


def test_merging_keeps_arrays_of_different_offsets_apart(catalogue: Catalogue) -> None:
    """Round 3, M-2: joined on merge, the second sensor's array offset was lost and its
    cuts were drawn from the first's array."""
    origin = models.ProvRecord(id="op-3", kind="import", started_at=at(0), agent=AGENT)
    catalogue.commit("p", [origin], Changes(added=[track("track-later", "BLUE TWO", 5, 40)]))
    record = models.ProvRecord(id="op-4", kind="import", started_at=at(0), agent=AGENT)
    catalogue.add_sensors("p", [towed("track-later", range(40, 44))], record)
    later = next(
        s
        for s in plot_sensors.sensors(plot(catalogue))
        if s.properties.host_track_id == "track-later"
    )
    catalogue.set_array_offset("p", [later.id], Quantity(300, "m"), AGENT)
    catalogue.merge_tracks("p", ["track-blue", "track-later"], AGENT)
    merged = plot(catalogue)
    towed_arrays = [s for s in plot_sensors.sensors(merged) if s.properties.name == "Towed array"]
    assert len(towed_arrays) == 2
    assert {s.properties.host_track_id for s in towed_arrays} == {"track-blue"}
    assert sorted(len(plot_sensors.cuts(merged, s.id)) for s in towed_arrays) == [4, 30]
    offsets = {
        len(plot_sensors.cuts(merged, s.id)): s.properties.array_offset for s in towed_arrays
    }
    assert offsets == {30: None, 4: models.Length(value=300, unit="m")}
    assert (
        "Towed array: kept as two sensors, as their arrays differ (at the ship; 300 m "
        "astern, worm in the hole), so each keeps its own cuts, drawn as before."
    ) in last_record(catalogue).notes


def test_merging_keeps_a_joined_sensors_colour_and_symbology(catalogue: Catalogue) -> None:
    origin = models.ProvRecord(id="op-3", kind="import", started_at=at(0), agent=AGENT)
    catalogue.commit("p", [origin], Changes(added=[track("track-later", "BLUE TWO", 5, 40)]))
    record = models.ProvRecord(id="op-4", kind="import", started_at=at(0), agent=AGENT)
    later = towed("track-later", range(40, 44))
    later.colour, later.legacy_symbology = "#00a000", "@G"
    catalogue.add_sensors("p", [later], record)
    catalogue.merge_tracks("p", ["track-blue", "track-later"], AGENT)
    merged = plot(catalogue)
    sensor = next(s for s in plot_sensors.sensors(merged) if s.properties.name == "Towed array")
    assert sensor.properties.legacy_symbology == "@G"  # the first had none
    joined = [c for c in plot_sensors.cuts(merged, sensor.id) if c.properties.time >= at(40)]
    assert [c.properties.colour for c in joined] == ["#00a000"] * 4


def test_hidden_cuts_are_left_out_of_a_period_and_said(catalogue: Catalogue) -> None:
    ids = cut_ids(catalogue)
    catalogue.set_hidden("p", ids[:2], True, AGENT)
    sensor = plot_sensors.sensors(plot(catalogue))[0].id
    catalogue.resolve_ambiguity("p", {"keep": "port", "sensor_ids": [sensor]}, AGENT)
    assert resolved(catalogue)[:3] == [None, None, "bearing"]
    assert (
        "2 hidden cuts left as they are: show them to resolve them." in last_record(catalogue).notes
    )
    # Named, a hidden cut is resolved.
    catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": ids[:1]}, AGENT)
    assert resolved(catalogue)[0] == "bearing"


def test_keeping_bearings_on_both_sides_says_mixed(catalogue: Catalogue) -> None:
    ids = cut_ids(catalogue)
    catalogue.resolve_ambiguity(
        "p", {"keep": "bearing", "cut_ids": ids[:1]}, AGENT
    )  # port, to the north-east of course 090
    catalogue.resolve_ambiguity("p", {"keep": "ambiguous_bearing", "cut_ids": ids[1:2]}, AGENT)
    catalogue.history("p").undo()
    catalogue.history("p").undo()
    # Two at once, of either side: not named for the first.
    first = plot_sensors.resolve(
        plot(catalogue), models.AmbiguityResolution(keep="bearing", cut_ids=ids[:2])
    )
    assert first.note.startswith("Port kept: 2 Towed array cuts")
    plot_now = plot(catalogue)
    flipped = [
        c.model_copy(
            update={
                "properties": c.properties.model_copy(
                    update={
                        "bearing": c.properties.ambiguous_bearing,
                        "ambiguous_bearing": c.properties.bearing,
                    }
                )
            }
        )
        if c.id == ids[1]
        else c
        for c in plot_now.features
    ]
    mixed = plot_sensors.resolve(
        plot_now.model_copy(update={"features": flipped}),
        models.AmbiguityResolution(keep="bearing", cut_ids=ids[:2]),
    )
    assert mixed.note.startswith("Mixed-side kept: 2 Towed array cuts")


def test_a_cut_resolved_so_already_is_not_resolved_again(catalogue: Catalogue) -> None:
    """The guard against a step that changes a cut to what it is."""
    ids = cut_ids(catalogue)
    catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": ids[:3]}, AGENT)
    steps = len(catalogue.history("p").steps())
    catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": ids[:4]}, AGENT)
    assert len(catalogue.history("p").steps()) == steps + 1
    record = last_record(catalogue)
    assert record.notes[0] == "Port bearing kept on Towed array cut at 09:03:00Z"
    assert "3 cuts already resolved so." in record.notes
    with pytest.raises(CatalogueError, match="already resolved so"):
        catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": ids[:4]}, AGENT)


def test_an_array_offset_is_one_step_and_moves_where_cuts_are_drawn(catalogue: Catalogue) -> None:
    sensor = plot_sensors.sensors(plot(catalogue))[0].id
    before = plot_sensors.describe(plot(catalogue), with_cuts=True)[0]["cut_list"][10]["origin"]
    catalogue.set_array_offset("p", [sensor], Quantity(300, "[yd_i]"), AGENT)
    assert last_record(catalogue).notes[0] == "Towed array: 300 yd astern, worm in the hole"
    described = plot_sensors.describe(plot(catalogue), with_cuts=True)[0]
    assert described["array_offset_m"] == pytest.approx(300 * 0.9144)
    after = described["cut_list"][10]["origin"]
    # Heading east: the array is west of the ship, as far as 300 yd.
    assert after[0] < before[0] and after[1] == pytest.approx(before[1], abs=1e-5)
    distance = range_of(after, before)
    assert distance == pytest.approx(300 * 0.9144, abs=0.5)
    assert catalogue.set_array_offset("p", [sensor], Quantity(300, "[yd_i]"), AGENT) is None
    catalogue.set_array_offset("p", [sensor], Quantity(300, "[yd_i]"), AGENT, mode="plain")
    assert last_record(catalogue).notes[0] == "Towed array: 300 yd straight astern"
    catalogue.set_array_offset("p", [sensor], None, AGENT)
    assert last_record(catalogue).notes[0] == "Towed array: at the ship"
    for _ in range(3):
        catalogue.history("p").undo()
    assert plot_sensors.sensors(plot(catalogue))[0].properties.array_offset is None
    with pytest.raises(CatalogueError, match="distance astern"):
        catalogue.set_array_offset("p", [sensor], Quantity(-5, "m"), AGENT)


def range_of(a, b):
    from debrief_kernel.geodesy import range_bearing

    reach, _ = range_bearing(Position(*a), Position(*b))
    return reach.to("m").value


def test_port_is_told_by_the_logged_course_as_legacy(tmp_path) -> None:
    """H1 (legs_20.rep): the fix after a cut logs 090 where the line between fixes runs
    000. Legacy kept the north-east bearing as port; the line's course called it
    starboard."""
    catalogue = Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")
    catalogue.create_plot("p", "Plot")
    north = models.TrackFeature(
        type="Feature",
        id="track-blue",
        geometry=models.LineStringGeometry(
            type="LineString", coordinates=[[-4.0, 50.0], [-4.0, 50.05]]
        ),
        properties=models.TrackProperties(
            kind="track",
            name="BLUE ONE",
            times=[at(0), at(10)],
            courses=models.AngleSeries(unit="deg", values=[0.0, 90.0]),
            style={"colour": "#0064bd"},
        ),
    )
    origin = models.ProvRecord(id="op-1", kind="import", started_at=at(0), agent=AGENT)
    catalogue.commit("p", [origin], Changes(added=[north]))
    record = models.ProvRecord(id="op-2", kind="import", started_at=at(0), agent=AGENT)
    one = ReadSensor(
        name="Towed array", host_track_id="track-blue", cuts=[ReadCut(T0 + 5 * MINUTE, 45.0, 315.0)]
    )
    catalogue.add_sensors("p", [one], record)
    catalogue.resolve_ambiguity("p", {"keep": "port", "cut_ids": ["cut-00001"]}, AGENT)
    (cut,) = plot_sensors.cuts(plot(catalogue))
    assert str(cut.properties.resolved) == "bearing"
