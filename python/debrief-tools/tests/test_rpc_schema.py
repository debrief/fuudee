"""Every method's parameters and reply are classes in the schema (rpc.yaml; PRN-04, review
7 Nov 2026 finding 3), named by the method in the registry. conftest.py checks every
request that succeeds in these tests, and its reply, against them; here, that every method
names them, that they agree with the method's Params model, that the extension's types are
printed from them, and a reply no other test receives."""

import json
from pathlib import Path

from pydantic import BaseModel

from debrief_io import import_rep
from debrief_schemas import class_problems
from debrief_stac import Catalogue
from debrief_tools.methods import RPC_TYPES, rpc_types
from debrief_tools.service import METHODS, ToolService
from debrief_tools.worker import ToolWorker

ROOT = Path(__file__).resolve().parents[3]
SCHEMA = json.loads((ROOT / "schemas" / "generated" / "debrief.schema.json").read_text())

# The model context protocol's own methods: MCP's types, not Debrief's (CON-04), so the
# schema does not describe them. Every other method is typed; nothing is waiting to be.
MCP_OWN = {"initialize", "ping", "tools/list", "tools/call"}


def test_every_method_names_its_parameters_and_reply_in_the_schema() -> None:
    untyped = {name for name, method in METHODS.items() if method.request is None}
    assert untyped == MCP_OWN, "name the method's request and reply classes (rpc.yaml)"
    for method in METHODS.values():
        for model in (method.request, *method.replies):
            if model is not None:
                assert issubclass(model, BaseModel)
                assert model.__name__ in SCHEMA["$defs"], f"{method.name}: {model.__name__}"


def test_each_params_model_takes_what_its_request_class_describes() -> None:
    """The Params model that refuses a method's parameters (method_params.py) reads only
    members its request class has, and needs every member that class requires."""
    for method in METHODS.values():
        if method.params is None or method.request is None:
            continue
        described = SCHEMA["$defs"][method.request.__name__]
        properties, required = described["properties"], set(described.get("required", []))
        fields = method.params.model_fields
        unknown = sorted(set(fields) - set(properties))
        assert not unknown, f"{method.name} reads {unknown}, which rpc.yaml does not describe"
        needed = {name for name, field in fields.items() if field.is_required()}
        assert needed <= required, f"{method.name} needs {sorted(needed - required)}"


def test_the_extensions_types_are_the_registry_printed() -> None:
    """Fails when a method or its classes change without the extension's types: run
    python -m debrief_tools rpc-types > vscode/src/generated/rpc.ts."""
    assert (ROOT / RPC_TYPES).read_text() == rpc_types(METHODS)


def test_a_reply_that_differs_from_its_class_is_found() -> None:
    stores = METHODS["debrief/stores"]
    assert stores.problems({}, {"stores": [{"id": "x", "title": "X", "read_only": False}]}) == []
    assert stores.problems({"agent": 1}, {"stores": [{"id": 1}]}) == [
        "params <root>: Additional properties are not allowed ('agent' was unexpected)",
        "reply as StoresReply stores/0: 'title' is a required property",
        "reply as StoresReply stores/0: 'read_only' is a required property",
        "reply as StoresReply stores/0/id: 1 is not of type 'string'",
    ]
    # A reply of two shapes matches if either does: an agent's export is the host's answer.
    export = METHODS["debrief/export_image"]
    shapes = [r.__name__ for r in export.replies]
    assert shapes == ["StampedImage", "ExportedImage"]
    said = export.problems(
        {"store": "s", "item": "i", "agent": {"kind": "person", "name": "a"}}, {"file": "f"}
    )
    assert {p.split(" ")[2] for p in said} == set(shapes)


FOUR_FIXES = """\
951212 050000.000 NELSON @C 50 20 00.00 N 004 10 00.00 W 090.0 12.0 0
951212 051000.000 NELSON @C 50 20 00.00 N 004 06 52.00 W 090.0 12.0 0
951212 052000.000 NELSON @C 50 20 00.00 N 004 03 44.00 W 090.0 12.0 0
951212 053000.000 NELSON @C 50 20 00.00 N 004 00 36.00 W 090.0 12.0 0
"""


def test_a_track_split_in_two_answers_its_parts(
    config_file: Path, catalogue: Catalogue, tmp_path: Path
) -> None:
    """The one typed reply the service's other tests do not receive: their split is refused."""
    source = tmp_path / "four.rep"
    source.write_text(FOUR_FIXES)
    import_rep(catalogue, source, item_id="four")
    service = ToolService(ToolWorker([], str(config_file), timeout_s=3), str(config_file))
    try:
        where = {"store": "exercise", "item": "four", "agent": {"kind": "person", "name": "a"}}
        split = service.handle(
            "debrief/split_track",
            {**where, "feature": "track-nelson", "at": "1995-12-12T05:15:00.000Z"},
        )
    finally:
        service.worker.close()
    assert split["changed"] and len(split["features"]) == 2
    assert class_problems("PlotChangeReply", split) == []
