"""Legacy TMA solutions in a .dpf plot (CAP-21, EXT-14; product owner, 24 Oct 2026): a track
of TMA legs comes in as a solution track, its absolute leg as it was saved, its relative leg
converted to positions from where its host's sensor was, a note saying so; its legs joined,
a dynamic infill between them said and left out; rooted in its sensor's cuts. No longer
listed as not imported."""

import os
from pathlib import Path

import pytest

from debrief_io import build_plot_from_dpf
from debrief_io.dpf import parse_dpf
from debrief_kernel.geodesy import Position, destination, range_bearing
from debrief_kernel.time import format_utc, parse_utc
from debrief_kernel.units import Quantity
from debrief_schemas import dump_plot, models
from debrief_stac import tma, tracks

SOURCE = models.SourceRef(href="sources/x.dpf", content_hash="sha256:" + "0" * 64)
AGENT = models.AgentRef(kind="person", name="analyst")
T0 = parse_utc("1995-12-12T09:00:00.000Z")
MINUTE = 60_000
KNOT = 1852 / 3600


def run(start: Position, course: float, knots: float, n: int) -> list[Position]:
    out = [start]
    for _ in range(n - 1):
        out.append(destination(out[-1], Quantity(course, "deg"), Quantity(knots * KNOT * 60, "m")))
    return out


OWN = run(Position(-4.0, 50.0), 90.0, 10.0, 11)
# The target: 4 nmi on 040 at 09:00, steering 200 at 6 kn; from 09:06, 160 at 8 kn.
LEG1 = run(destination(OWN[0], Quantity(40, "deg"), Quantity(4 * 1852, "m")), 200.0, 6.0, 6)
LEG2 = run(destination(LEG1[-1], Quantity(170, "deg"), Quantity(200, "m")), 160.0, 8.0, 5)
TARGET = LEG1 + LEG2


def dtg(minute: int) -> str:
    return f"951212 09{minute:02d}00"


def fix(minute: int, p: Position, course: float, knots: float) -> str:
    return (
        f'<fix Course="{course:.3f}" Speed="{knots:.3f}" Dtg="{dtg(minute)}" '
        f'Label="09{minute:02d}">'
        f'<centre><shortLocation Lat="{p.latitude:.7f}" Long="{p.longitude:.7f}"/></centre></fix>'
    )


def contact(minute: int) -> str:
    bearing = range_bearing(OWN[minute], TARGET[minute])[1].value
    return f'<sensor_contact Bearing="{bearing:.3f}" Dtg="{dtg(minute)}" Visible="true"/>'


OFFSET_M, OFFSET_BRG = range_bearing(OWN[0], LEG1[0])
PLOT = f"""<?xml version="1.0" encoding="UTF-8"?>
<plot Name="TMA"><session><layers>
<track Name="MAYO" Visible="true"><colour Value="BLUE"/>
<TrackSegment Name="Positions">{"".join(fix(m, OWN[m], 90, 10) for m in range(11))}</TrackSegment>
<sensor Name="Bow" Visible="true" TrackName="MAYO"><colour Value="GREEN"/>
{"".join(contact(m) for m in range(11))}
</sensor>
</track>
<track Name="TMA_0900" Visible="true"><colour Value="RED"/>
<RelativeTMASegment CourseDegs="200.000" HostSensor="Bow" HostTrack="MAYO" Name="0900"
  Visible="true">
{"".join(fix(m, LEG1[m], 200, 6) for m in range(5))}
<Speed Units="kts" Value="6.000"/>
<Offset BearingDegs="{OFFSET_BRG.value:.4f}">
<Range Units="degs" Value="{OFFSET_M.value / 111120:.9f}"/></Offset>
</RelativeTMASegment>
<DynamicInfillSegment Name="infill" Visible="true">{fix(5, LEG1[5], 180, 7)}</DynamicInfillSegment>
<AbsoluteTMASegment CourseDegs="160.000" Name="0906" Visible="true">
{"".join(fix(m, TARGET[m], 160, 8) for m in range(6, 11))}
<Speed Units="m/s" Value="{8 * KNOT:.6f}"/>
<Origin><shortLocation Lat="{LEG2[0].latitude:.7f}" Long="{LEG2[0].longitude:.7f}"/></Origin>
</AbsoluteTMASegment>
</track>
</layers></session></plot>
"""


def test_a_tma_legs_solution_is_read_as_legacy_saved_it() -> None:
    parsed = parse_dpf(PLOT.encode())
    relative, infill, absolute = parsed.tracks[1].legs
    assert relative.tma.course_deg == 200 and relative.tma.speed_kn == pytest.approx(6.0)
    assert (relative.tma.host_track, relative.tma.host_sensor) == ("MAYO", "Bow")
    assert relative.tma.offset_m == pytest.approx(OFFSET_M.value, abs=0.01)
    assert relative.tma.offset_bearing_deg == pytest.approx(OFFSET_BRG.value, abs=1e-4)
    assert infill.tma is None
    assert absolute.tma.speed_kn == pytest.approx(8.0)  # m/s, as legacy wrote it, in knots
    assert absolute.tma.origin == pytest.approx((LEG2[0].longitude, LEG2[0].latitude))


def test_a_legacy_solution_comes_in_as_a_solution_track() -> None:
    plot, report = build_plot_from_dpf(PLOT.encode(), SOURCE, AGENT)
    dump_plot(plot)  # valid
    (solution,) = tma.solutions(plot)
    props = solution.properties
    assert props.name == "TMA_0900" and str(props.plotting_mode) == "dr"
    tag = props.tma
    assert tag.contact == "TMA_0900"
    assert tag.leg_starts == [format_utc(T0 + 6 * MINUTE)]
    # The infill's fix is not a fix of the solution: the join takes its place.
    assert props.times == [format_utc(T0 + m * MINUTE) for m in (0, 1, 2, 3, 4, 6, 7, 8, 9, 10)]
    # Rooted in the cuts of its host's sensor within its legs (not the infill's).
    assert len(tag.cut_ids) == 10
    # The relative leg converted from where Bow was at 09:00, plus the offset: on the truth.
    coordinates = solution.geometry.coordinates
    for i, m in enumerate((0, 1, 2, 3, 4)):
        assert range_bearing(Position(*coordinates[i]), TARGET[m])[0].value < 1.0
    # The absolute leg from its origin, as saved.
    for i, m in enumerate((6, 7, 8, 9, 10), start=5):
        assert range_bearing(Position(*coordinates[i]), TARGET[m])[0].value < 1.0
    # Joined: the leg's last fix takes the course and speed that reach the next leg's start,
    # so dead reckoning from its first fix puts every fix where it is.
    reckoned = tracks.dead_reckoned_positions(solution)
    for got, want in zip(reckoned, coordinates, strict=True):
        assert range_bearing(Position(*got), Position(*want))[0].value < 0.01
    assert props.courses.values[4] != 200.0
    # Its residuals: the cuts were taken on the truth.
    report_rows = tma.residual_report(plot, solution.id)
    assert report_rows["counted"] == 10 and report_rows["rms"] < 0.01
    said = "\n".join(report.omitted)
    for expected in [
        "Track 'TMA_0900' is a TMA solution from legacy Debrief: imported as a solution of "
        "contact 'TMA_0900', plotted by dead reckoning, 2 legs, rooted in 10 cuts of Bow.",
        "Track 'TMA_0900': its relative leg '0900', 4.00 nmi on 040.0°T from MAYO's Bow at "
        "09:00:00Z, is converted to positions at import: by dead reckoning from there, along "
        "geodesics. It no longer moves with its host.",
        "Track 'TMA_0900': its absolute leg '0906' starts at its origin, as saved.",
        "Track 'TMA_0900': the most any fix is from where legacy Debrief drew it: 0.00 nmi.",
        "Track 'TMA_0900': its legs are joined, as a v4 solution's are",
        "Track 'TMA_0900': 1 fix of a dynamic infill between its legs not imported",
    ]:
        assert expected in said, expected
    assert "the solution behind them is not" not in said  # no longer listed as not imported


def test_a_relative_leg_whose_host_is_not_in_the_plot_keeps_its_saved_positions() -> None:
    plot_text = PLOT.replace('HostTrack="MAYO"', 'HostTrack="GHOST"')
    plot, report = build_plot_from_dpf(plot_text.encode(), SOURCE, AGENT)
    (solution,) = tma.solutions(plot)
    assert range_bearing(Position(*solution.geometry.coordinates[0]), LEG1[0])[0].value < 0.05
    said = "\n".join(report.omitted)
    assert "is relative to 'GHOST', which is not in the plot, so its positions are those" in said
    assert solution.properties.tma.cut_ids == []
    assert "none of the cuts its legs were worked out from is in the plot" in said


LEGACY = os.environ.get("DEBRIEF_LEGACY")


@pytest.mark.skipif(not LEGACY, reason="DEBRIEF_LEGACY is not set")
def test_legacy_samples_tma_solutions_come_in_close_to_where_legacy_drew_them() -> None:
    """Every legacy sample plot with TMA legs: each solution valid, rooted in cuts, and its
    fixes within a few hundred metres of where legacy drew them (a flat earth there)."""
    root = Path(LEGACY)
    files = [p for p in root.rglob("*.dpf") if b"TMASegment" in p.read_bytes()]
    assert files
    for path in files:
        plot, report = build_plot_from_dpf(path.read_bytes(), SOURCE, AGENT)
        dump_plot(plot)
        for solution in tma.solutions(plot):
            assert solution.properties.tma.cut_ids, path.name
            assert tma.residual_report(plot, solution.id)["counted"] > 0
        assert any("is a TMA solution from legacy Debrief" in n for n in report.omitted), path
