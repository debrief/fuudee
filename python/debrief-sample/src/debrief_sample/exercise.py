"""The sample exercise: where and when it happens, and what each serial's script says.

Everything here is fiction except the background traffic, which is real AIS
(see ``ais.py``). The exercise lies in open water east of the entrance to
Chesapeake Bay, on the day of the AIS extract.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

from debrief_kernel.time import to_epoch_ms

EXERCISE_DATE = (2023, 6, 15)


def _at(hour: int, minute: int = 0) -> int:
    return to_epoch_ms(datetime(*EXERCISE_DATE, hour, minute, tzinfo=UTC))


@dataclass(frozen=True)
class Area:
    """The exercise area, a latitude and longitude box in degrees."""

    south: float
    north: float
    west: float
    east: float

    def ring(self) -> list[list[float]]:
        return [
            [self.west, self.south],
            [self.east, self.south],
            [self.east, self.north],
            [self.west, self.north],
            [self.west, self.south],
        ]


AREA = Area(south=36.70, north=37.20, west=-75.90, east=-75.20)


@dataclass(frozen=True)
class Leg:
    """An ordered course, speed and depth, held for a number of minutes."""

    minutes: int
    course_deg: float
    speed_kn: float
    depth_m: float = 0.0


@dataclass(frozen=True)
class Platform:
    name: str
    symbology: str  # REP symbology: "@A" draws blue, "@C" red
    start: tuple[float, float]  # longitude, latitude
    legs: tuple[Leg, ...]
    turn_rate_deg_min: float
    file_name: str


@dataclass(frozen=True)
class ScriptLine:
    """A scripted narrative entry, so many minutes into the serial."""

    minute: int
    platform: str
    text: str


@dataclass(frozen=True)
class Serial:
    item_id: str
    number: int
    start_ms: int
    end_ms: int
    blue: Platform
    red: Platform
    # Minutes into the serial when the ownship's sonar is not listening,
    # for example during a sprint or a planned trial.
    deaf: tuple[tuple[int, int], ...] = ()
    script: tuple[ScriptLine, ...] = field(default_factory=tuple)

    @property
    def title(self) -> str:
        return f"Serial {self.number}"

    @property
    def minutes(self) -> int:
        return (self.end_ms - self.start_ms) // 60_000


BLUE = "BLUE ONE"
RED = "RED ONE"
CONTROL = "EXCON"

# Serial windows (start, end) in epoch milliseconds: 4, 5 and 6 hours.
WINDOWS: tuple[tuple[int, int], ...] = (
    (_at(8), _at(12)),
    (_at(12), _at(17)),
    (_at(17), _at(23)),
)


def _blue(start: tuple[float, float], *legs: Leg) -> Platform:
    return Platform(BLUE, "@A", start, legs, turn_rate_deg_min=30.0, file_name="blue-one.rep")


def _red(start: tuple[float, float], *legs: Leg) -> Platform:
    return Platform(RED, "@C", start, legs, turn_rate_deg_min=10.0, file_name="red-one.rep")


SERIALS: tuple[Serial, ...] = (
    Serial(
        "serial-1",
        1,
        *WINDOWS[0],
        blue=_blue(
            (-75.40, 36.96),
            Leg(40, 30, 10),
            Leg(40, 270, 6),
            Leg(40, 180, 6),
            Leg(40, 270, 6),
            Leg(40, 180, 6),
            Leg(40, 240, 5),
        ),
        red=_red(
            (-75.25, 37.17),
            Leg(80, 225, 5, 90),
            Leg(70, 250, 4, 120),
            Leg(90, 200, 6, 60),
        ),
        script=(
            ScriptLine(
                0, CONTROL, "Serial 1 started. Sea state 3, wind south-west 15 kn, visibility good."
            ),
            ScriptLine(
                0, RED, "Dived north-east of the area. Intention: transit south-west undetected."
            ),
            ScriptLine(0, BLUE, "On task. Searching the north-east of the area with bow sonar."),
            ScriptLine(120, CONTROL, "Weather: wind backing south, 18 kn."),
            ScriptLine(150, RED, "Communications window missed. Continuing to the south-west."),
            ScriptLine(200, BLUE, "Holding RED ONE. Request permission to simulate an attack."),
            ScriptLine(203, CONTROL, "Permission granted."),
            ScriptLine(212, BLUE, "Simulated attack on RED ONE complete."),
            ScriptLine(240, CONTROL, "Serial 1 ended. Units reposition for Serial 2."),
        ),
    ),
    Serial(
        "serial-2",
        2,
        *WINDOWS[1],
        blue=_blue(
            (-75.45, 37.05),
            Leg(40, 90, 8),
            Leg(45, 240, 7),
            Leg(45, 330, 7),
            Leg(45, 240, 7),
            Leg(45, 330, 7),
            Leg(40, 240, 7),
            Leg(40, 330, 7),
        ),
        red=_red(
            (-75.25, 36.98),
            Leg(100, 290, 5, 100),
            Leg(80, 250, 6, 150),
            Leg(120, 300, 4, 80),
        ),
        script=(
            ScriptLine(0, CONTROL, "Serial 2 started. RED ONE free to close the shipping lane."),
            ScriptLine(0, RED, "Intention: transit west at slow speed, deep, towards the lane."),
            ScriptLine(
                0, BLUE, "Intention: close RED ONE's last known position, then screen the lane."
            ),
            ScriptLine(100, CONTROL, "RED ONE reports a simulated defect; may go deep."),
            ScriptLine(185, BLUE, "Bearing drift slow. Changing legs to resolve range."),
            ScriptLine(175, RED, "Assessed held by BLUE ONE. Coming shallower to clear the layer."),
            ScriptLine(300, CONTROL, "Serial 2 ended."),
        ),
    ),
    Serial(
        "serial-3",
        3,
        *WINDOWS[2],
        blue=_blue(
            (-75.40, 36.98),
            Leg(60, 350, 5),
            Leg(20, 20, 14),
            Leg(60, 300, 5),
            Leg(20, 270, 14),
            Leg(80, 250, 5),
            Leg(20, 200, 14),
            Leg(100, 180, 5),
        ),
        red=_red(
            (-75.30, 36.92),
            Leg(120, 340, 5, 80),
            Leg(120, 280, 4, 150),
            Leg(120, 200, 6, 100),
        ),
        deaf=((60, 80), (140, 160), (240, 260)),
        script=(
            ScriptLine(
                0,
                CONTROL,
                "Serial 3 started. BLUE ONE to sprint and drift; sonar off when sprinting.",
            ),
            ScriptLine(0, RED, "Intention: evade to the north, then double back to the west."),
            ScriptLine(0, BLUE, "Intention: sprint and drift to hold RED ONE as it evades."),
            ScriptLine(200, CONTROL, "Communications check with all units: good."),
            ScriptLine(300, BLUE, "Closing RED ONE's estimated position from the west."),
            ScriptLine(360, CONTROL, "Serial 3 ended. End of exercise."),
        ),
    ),
)
