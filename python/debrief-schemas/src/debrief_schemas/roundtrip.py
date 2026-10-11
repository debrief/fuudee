"""Cross-language round trip, Python legs. See scripts/cross_language_roundtrip.sh.

    python -m debrief_schemas.roundtrip export FIXTURES OUT
    python -m debrief_schemas.roundtrip verify FIXTURES TS_OUT

FIXTURES is schemas/fixtures; each document kind's valid/ folder is used.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from debrief_schemas.documents import DocumentKind, dump_document, load_document


def _valid(fixtures: Path) -> list[tuple[DocumentKind, Path]]:
    return [
        (kind, path)
        for kind in DocumentKind
        for path in sorted((fixtures / kind.value / "valid").glob("*.json"))
    ]


def export(fixtures: Path, out: Path) -> None:
    for kind, path in _valid(fixtures):
        target = out / kind.value / path.name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(dump_document(kind, load_document(kind, path.read_text())))


def verify(fixtures: Path, returned: Path) -> int:
    failures = 0
    cases = _valid(fixtures)
    for kind, path in cases:
        name = f"{kind.value}/{path.name}"
        back = returned / kind.value / path.name
        if not back.exists():
            print(f"MISSING {name}")
            failures += 1
            continue
        original = json.loads(path.read_text())
        round_tripped = json.loads(dump_document(kind, load_document(kind, back.read_text())))
        if round_tripped != original:
            print(f"CHANGED {name}")
            failures += 1
    print(f"{len(cases) - failures}/{len(cases)} documents survived Python -> TypeScript -> Python")
    return failures


def main(argv: list[str]) -> int:
    command, fixtures, other = argv
    if command == "export":
        export(Path(fixtures), Path(other))
        return 0
    return 1 if verify(Path(fixtures), Path(other)) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
