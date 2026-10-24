"""Sensors in legacy plot files (CAP-22, EXT-14), as legacy Debrief's SensorHandler and
SensorContactHandler wrote and read them: no longer listed as not imported."""

import pytest

from debrief_io import build_plot_from_dpf
from debrief_io.dpf import METRES_PER, parse_dpf
from debrief_schemas import dump_plot, models
from debrief_stac import sensors as plot_sensors

SOURCE = models.SourceRef(href="sources/x.dpf", content_hash="sha256:" + "0" * 64)
AGENT = models.AgentRef(kind="person", name="analyst")


def fix(dtg: str, long: str) -> str:
    return (
        f'<fix Course="90" Speed="10" Dtg="951212 {dtg}"><centre>'
        f'<shortLocation Lat="50.0" Long="{long}"/></centre></fix>'
    )


PLOT = f"""<?xml version="1.0" encoding="UTF-8"?>
<plot Name="Sensors"><session><layers>
<track Name="NELSON" Visible="true"><colour Value="RED"/>
<TrackSegment Name="leg">{fix("050000", "-4.0")}{fix("051000", "-3.9")}
{fix("052000", "-3.8")}</TrackSegment>
<sensor Name="Towed" Visible="true" TrackName="NELSON" LineThickness="2" ArrayMode="Worm in hole"
  BaseFrequency="150.0">
<colour Value="BLUE"/>
<Offset Units="m" Value="-200"/>
<sensor_contact AmbiguousBearing="135.000" Bearing="45.000" Dtg="951212 050500"
  Frequency="150.5" HasAmbiguousBearing="true" HasFrequency="true" Label="0505"
  LabelShowing="true" LineStyle="DOTTED" Visible="true"/>
<sensor_contact AmbiguousBearing="300.800" Bearing="59.300" Dtg="951212 050600"
  HasAmbiguousBearing="false" Label="0506" Comment="kept by hand" Visible="true">
<colour Value="GREEN"/></sensor_contact>
<sensor_contact AmbiguousBearing="0.000" Bearing="70.000" Dtg="951212 050700"
  HasAmbiguousBearing="false" Range="4000" Visible="false"/>
<sensor_contact Bearing="80.000" Dtg="951212 050800" Visible="true">
<Range Units="kyds" Value="2.5"/>
<centre><shortLocation Lat="50.1" Long="-3.95"/></centre></sensor_contact>
<sensor_contact Dtg="951212 050900" Frequency="151.0" HasFrequency="true" Visible="true"/>
<sensor_contact AmbiguousBearing="10.000" Bearing="20.000" Dtg="951212 060000"
  HasAmbiguousBearing="true" Visible="true"/>
</sensor>
</track>
</layers></session></plot>
"""


def test_a_sensors_contacts_are_read_as_legacy_wrote_them() -> None:
    parsed = parse_dpf(PLOT.encode())
    (track,) = parsed.tracks
    (sensor,) = track.sensors
    assert (sensor.name, sensor.colour, sensor.visible) == ("Towed", "#0064bd", True)
    assert sensor.offset_m == -200
    assert sensor.array_mode == "Worm in hole"
    assert sensor.base_frequency == 150.0
    assert sensor.line_thickness == 2
    first, kept, placeholder, positioned, frequency, late = sensor.contacts
    assert (first.bearing, first.ambiguous, first.has_ambiguous) == (45.0, 135.0, True)
    assert first.frequency == 150.5 and first.label_showing and first.line_style == "DOTTED"
    assert (kept.bearing, kept.ambiguous, kept.has_ambiguous) == (59.3, 300.8, False)
    assert kept.colour == "#00800b" and kept.comment == "kept by hand"
    assert (placeholder.ambiguous, placeholder.zero_twin) == (None, True)
    assert placeholder.range_m == pytest.approx(4000 * METRES_PER["yds"])
    assert not placeholder.visible
    assert positioned.range_m == pytest.approx(2.5 * METRES_PER["kyds"])
    assert positioned.origin == pytest.approx((-3.95, 50.1))
    assert frequency.bearing is None
    assert late.has_ambiguous


def test_sensors_come_into_the_plot_with_their_cuts() -> None:
    plot, report = build_plot_from_dpf(PLOT.encode(), SOURCE, AGENT)
    dump_plot(plot)  # valid
    (sensor,) = plot_sensors.sensors(plot)
    assert sensor.properties.name == "Towed"
    assert sensor.properties.host_track_id == "track-nelson"
    assert sensor.properties.colour == "#0064bd"
    cuts = plot_sensors.cuts(plot, sensor.id)
    assert [c.properties.bearing.value for c in cuts] == [45.0, 59.3, 70.0, 80.0, 20.0]
    # Unresolved; resolved by hand in legacy (it kept 59.3); never ambiguous.
    assert [
        (
            c.properties.ambiguous_bearing.value if c.properties.ambiguous_bearing else None,
            str(c.properties.resolved) if c.properties.resolved else None,
        )
        for c in cuts
    ] == [(135.0, None), (300.8, "bearing"), (None, None), (None, None), (10.0, None)]
    assert cuts[1].properties.colour == "#00800b"
    assert cuts[2].properties.hidden is True
    assert cuts[3].properties.origin == pytest.approx([-3.95, 50.1])
    assert report.sensor_cuts == 5
    said = "\n".join(report.omitted)
    for expected in [
        "Sensor data read: Towed on NELSON (5 cuts, 2 ambiguous, 1 resolved).",
        "Track 'NELSON': sensor 'Towed': 1 cut giving no bearing not imported.",
        "Track 'NELSON': sensor 'Towed': 2 cuts gave a frequency and its base frequency 150 Hz: "
        "not imported.",
        "Track 'NELSON': sensor 'Towed': its array offset of -200 m not imported",
        "how its cuts were drawn not imported (1 label shown on the map; line styles dotted (1); "
        "line thickness 2)",
        "1 cut gave an ambiguous bearing of 0.000 and was not ambiguous",
        "1 cut resolved in the legacy plot comes resolved",
        "Track 'NELSON': sensor 'Towed': 1 cut outside the track's fixes: kept, but not drawn",
    ]:
        assert expected in said, expected
    assert "(sensor, " not in said  # no longer listed as not imported
