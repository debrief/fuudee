"""Command line: build the sample catalogue, or remake the AIS extract.

python -m debrief_sample build OUT_DIR [--seed N] [--recorded-at TIME]
python -m debrief_sample reduce-ais AIS_2023_06_15.zip OUT.csv
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from debrief_sample.ais import reduce_marinecadastre
from debrief_sample.builder import DEFAULT_SEED, RECORDED_AT, build


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m debrief_sample", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    build_cmd = commands.add_parser("build", help="build the sample catalogue")
    build_cmd.add_argument("out_dir", type=Path, help="folder for the new catalogue")
    build_cmd.add_argument("--seed", type=int, default=DEFAULT_SEED, help="random seed")
    build_cmd.add_argument(
        "--recorded-at",
        default=RECORDED_AT,
        help="time recorded in provenance, such as 2026-10-11T00:00:00.000Z",
    )
    reduce_cmd = commands.add_parser(
        "reduce-ais", help="remake the AIS extract from a MarineCadastre daily archive"
    )
    reduce_cmd.add_argument("archive", type=Path)
    reduce_cmd.add_argument("output", type=Path)
    args = parser.parse_args(argv)

    if args.command == "reduce-ais":
        count = reduce_marinecadastre(args.archive, args.output)
        print(f"Wrote {args.output}: {count} vessels.")
        return 0
    report = build(args.out_dir, seed=args.seed, recorded_at=args.recorded_at)
    print(f"Built the sample catalogue in {report.root} (seed {report.seed}).")
    for item, counts in report.plots.items():
        summary = ", ".join(f"{v} {k.replace('_', ' ')}" for k, v in counts.items())
        print(f"  {item}: {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
