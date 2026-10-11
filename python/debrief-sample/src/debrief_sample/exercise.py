"""The sample exercise: where and when it happens, and what each serial's script says.

Everything here is fiction except the background traffic, which is real AIS
(see ``ais.py``). The exercise lies in open water east of the entrance to
Chesapeake Bay, on the day of the AIS extract. The area was chosen because
open AIS covers it, not for any naval use. It is on the continental shelf,
mostly 10 to 35 m deep, so RED ONE's depths (15 to 25 m) are notional.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
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
    # Written only if BLUE ONE holds the classified target at this minute,
    # so a line such as "Holding RED ONE" never contradicts the bearings.
    if_holding_at: int | None = None


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
            (-75.22, 37.10),
            Leg(30, 295, 10),
            Leg(35, 215, 10),
            Leg(35, 345, 7),
            Leg(35, 190, 10),
            Leg(35, 335, 10),
            Leg(35, 165, 10),
            Leg(35, 280, 10),
        ),
        red=_red(
            (-75.35, 37.17),
            Leg(80, 225, 5, 20),
            Leg(70, 250, 4, 25),
            Leg(90, 200, 5, 15),
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
            ScriptLine(
                55,
                BLUE,
                "Holding RED ONE. Request permission to simulate an attack.",
                if_holding_at=55,
            ),
            ScriptLine(58, CONTROL, "Permission granted.", if_holding_at=55),
            ScriptLine(67, BLUE, "Simulated attack on RED ONE complete.", if_holding_at=55),
            ScriptLine(150, RED, "Communications window missed. Continuing to the south-west."),
            ScriptLine(240, CONTROL, "Serial 1 ended. Units reposition for Serial 2."),
        ),
    ),
    Serial(
        "serial-2",
        2,
        *WINDOWS[1],
        blue=_blue(
            (-75.24, 37.04),
            Leg(30, 230, 10),
            Leg(30, 255, 7),
            Leg(30, 5, 7),
            Leg(30, 235, 10),
            Leg(30, 330, 7),
            Leg(30, 200, 10),
            Leg(30, 325, 10),
            Leg(30, 215, 7),
            Leg(30, 350, 7),
            Leg(30, 240, 7),
        ),
        red=_red(
            (-75.30, 36.98),
            Leg(100, 290, 5, 20),
            Leg(80, 250, 6, 25),
            Leg(120, 300, 4, 15),
        ),
        script=(
            ScriptLine(0, CONTROL, "Serial 2 started. RED ONE free to close the shipping lane."),
            ScriptLine(0, RED, "Intention: transit west at slow speed towards the lane."),
            ScriptLine(
                0, BLUE, "Intention: close RED ONE's last known position, then screen the lane."
            ),
            ScriptLine(75, BLUE, "Changing legs to resolve range on RED ONE.", if_holding_at=75),
            ScriptLine(100, CONTROL, "RED ONE reports its simulated defect cleared."),
            ScriptLine(175, RED, "Assessed held by BLUE ONE. Altering to the west-north-west."),
            ScriptLine(300, CONTROL, "Serial 2 ended."),
        ),
    ),
    Serial(
        "serial-3",
        3,
        *WINDOWS[2],
        blue=_blue(
            (-75.44, 36.95),
            Leg(60, 50, 5),
            Leg(20, 140, 14),
            Leg(60, 345, 5),
            Leg(20, 290, 14),
            Leg(80, 220, 5),
            Leg(20, 345, 14),
            Leg(100, 255, 5),
        ),
        red=_red(
            (-75.30, 36.92),
            Leg(120, 340, 5, 15),
            Leg(120, 280, 4, 25),
            Leg(120, 200, 6, 20),
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
            ScriptLine(300, BLUE, "Searching for RED ONE."),
            ScriptLine(360, CONTROL, "Serial 3 ended. End of exercise."),
        ),
    ),
)


def script_digest(serial: Serial) -> str:
    """A hash of everything scripted for a serial: legs, sonar-off periods and narrative.

    Recorded in provenance so that a replay can tell whether the script it
    runs is the one that built the plot.
    """
    text = json.dumps(asdict(serial), sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()
