"""python -m debrief_tools serve [--port N] [--library MODULE ...] | list"""

from __future__ import annotations

import argparse
import json
import logging

from debrief_schemas import DocumentKind, dump_document
from debrief_tools.registry import Registry
from debrief_tools.service import serve


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m debrief_tools")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("serve", "list"):
        command = commands.add_parser(name)
        command.add_argument("--library", action="append", default=[], help="extra tool module")
    commands.choices["serve"].add_argument("--port", type=int, default=0)
    commands.choices["serve"].add_argument(
        "--timeout", type=float, default=120.0, help="seconds before a tool call is stopped"
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if args.command == "serve":
        serve(args.port, args.library, args.timeout)
        return
    registry = Registry.discover(args.library)
    for tool in registry.tools.values():
        print(dump_document(DocumentKind.TOOL_DECLARATION, tool.declaration))
    for problem in registry.unavailable:
        print(json.dumps({"unavailable": problem.__dict__}))


if __name__ == "__main__":
    main()
