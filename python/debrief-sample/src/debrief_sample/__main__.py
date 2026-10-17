"""Command line: build the sample catalogue, or remake the AIS extract.

python -m debrief_sample build OUT_DIR [--seed N] [--recorded-at TIME]
python -m debrief_sample reduce-ais AIS_2023_06_15.zip OUT.csv
python -m debrief_sample walkthrough OUT_DIR TOUR
python -m debrief_sample media OUT_DIR [--check]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from debrief_sample.ais import reduce_marinecadastre
from debrief_sample.builder import DEFAULT_SEED, RECORDED_AT, build
from debrief_sample.media import write_media
from debrief_sample.walkthrough import TOURS, prepare


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
    tour_cmd = commands.add_parser(
        "walkthrough", help="a fresh copy of the sample for a walkthrough, in a folder of its own"
    )
    tour_cmd.add_argument("out_dir", type=Path, help="an empty folder for the walkthrough")
    tour_cmd.add_argument("tour", choices=list(TOURS), help="which walkthrough")
    media_cmd = commands.add_parser(
        "media", help="the walkthroughs' pictures, drawn from the sample"
    )
    media_cmd.add_argument("out_dir", type=Path, help="folder for the SVG files")
    media_cmd.add_argument("--check", action="store_true", help="fail if the files differ")
    args = parser.parse_args(argv)

    if args.command == "walkthrough":
        print(json.dumps(prepare(args.out_dir, args.tour)))
        return 0
    if args.command == "media":
        stale = write_media(args.out_dir, check=args.check)
        if stale:
            print("Out of date: " + ", ".join(stale) + ". Run python -m debrief_sample media.")
            return 1
        return 0

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
