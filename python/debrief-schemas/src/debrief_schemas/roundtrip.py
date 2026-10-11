"""Cross-language round trip, Python legs. See scripts/cross_language_roundtrip.sh.

python -m debrief_schemas.roundtrip export FIXTURES OUT
python -m debrief_schemas.roundtrip verify FIXTURES TS_OUT
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from debrief_schemas.plot_io import dump_plot, load_plot


def export(fixtures: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for path in sorted(fixtures.glob("*.json")):
        (out / path.name).write_text(dump_plot(load_plot(path.read_text())))


def verify(fixtures: Path, returned: Path) -> int:
    failures = 0
    paths = sorted(fixtures.glob("*.json"))
    for path in paths:
        back = returned / path.name
        if not back.exists():
            print(f"MISSING {path.name}")
            failures += 1
            continue
        original = json.loads(path.read_text())
        round_tripped = json.loads(dump_plot(load_plot(back.read_text())))
        if round_tripped != original:
            print(f"CHANGED {path.name}")
            failures += 1
    print(f"{len(paths) - failures}/{len(paths)} plots survived Python -> TypeScript -> Python")
    return failures


def main(argv: list[str]) -> int:
    command, fixtures, other = argv
    if command == "export":
        export(Path(fixtures), Path(other))
        return 0
    return 1 if verify(Path(fixtures), Path(other)) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
