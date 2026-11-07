"""The service's methods are declared once (methods.py, service.METHODS): the README's
table is printed from that registry, and each method's parameters are a Params model
that refuses in the service's own words."""

import re
import subprocess
import sys
from pathlib import Path
from typing import Annotated, get_args

import pytest
from pydantic import StrictBool, StrictStr

from debrief_stac import Base, frequencies, tma
from debrief_tools import method_params as mp
from debrief_tools.methods import Method, Methods, Params, Refusal, table
from debrief_tools.rpc import BASE_SHAPE, INVALID_PARAMS, RpcError, base_of
from debrief_tools.service import KNOWN_METHODS, METHODS

README = Path(__file__).resolve().parents[1] / "README.md"
TABLE = re.compile(r"<!-- methods:[^\n]*-->\n(.*?)<!-- /methods -->", re.S)


def test_the_readme_table_is_the_registry_printed() -> None:
    """Fails when a method is added, removed or changed without the README: run
    python -m debrief_tools methods and paste its output between the markers."""
    found = TABLE.search(README.read_text())
    assert found, "the README has no method table between <!-- methods: --> markers"
    assert found.group(1) == table(METHODS)


def test_the_readme_names_only_methods_the_service_has() -> None:
    named = set(re.findall(r"`(debrief/\w+)", README.read_text()))
    assert named <= KNOWN_METHODS, named - KNOWN_METHODS
    listed = set(re.findall(r"^\| `([\w/]+)` \|", TABLE.search(README.read_text()).group(1), re.M))
    assert listed == set(METHODS)


def test_the_table_prints_from_the_command_line() -> None:
    printed = subprocess.run(
        [sys.executable, "-m", "debrief_tools", "methods"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert printed == table(METHODS)


def test_every_method_can_describe_its_parameters_as_a_json_schema() -> None:
    """As tools/list offers it."""
    for method in METHODS.values():
        schema = method.input_schema()
        assert schema["type"] == "object", method.name
        if method.history:
            assert {"store", "item"} <= set(schema["required"]), method.name
        if method.agent:
            assert "agent" in schema["required"], method.name
    tma_create = METHODS["debrief/tma_create"].input_schema()
    assert "TmaRequest" in tma_create["$defs"]


def test_a_method_is_registered_once_and_changes_a_plot_only_inside_its_history() -> None:
    methods = Methods()
    methods.add(Method("a", "A.", lambda *_: {}))
    with pytest.raises(ValueError, match="twice"):
        methods.add(Method("a", "A again.", lambda *_: {}))
    with pytest.raises(ValueError, match="outside its history"):
        methods.add(Method("b", "B.", lambda *_: {}, writes=True))


class Example(Params):
    feature: Annotated[StrictStr, Refusal("{name} needs the {field} ({method})")]
    shown: Annotated[StrictBool, Refusal("shown is true or false")] = False


def test_the_first_field_found_wrong_says_why_in_its_own_words() -> None:
    with pytest.raises(RpcError) as refused:
        Example.read({"shown": 1}, "debrief/example")
    assert refused.value.code == INVALID_PARAMS
    assert str(refused.value) == "example needs the feature (debrief/example)"
    with pytest.raises(RpcError, match="^shown is true or false$"):
        Example.read({"feature": "f", "shown": 1}, "debrief/example")
    # Strict, as the service's checks always were (1 is not true); members it does not
    # name are the service's to read.
    assert Example.read({"feature": "f", "shown": True, "agent": {}}, "debrief/example").shown


def test_a_validator_may_say_what_is_wrong_itself() -> None:
    with pytest.raises(RpcError, match=r"^time: "):
        mp.Tote.read({"item": "serial", "time": "noon"}, "debrief/tote")
    with pytest.raises(RpcError, match=r"^None is not a file\.$"):
        mp.RepTracks.read({}, "debrief/rep_tracks")
    with pytest.raises(RpcError, match=r"^take_new_data needs source \{catalogue, item\}$"):
        mp.TakeNewData.read({"source": {"catalogue": "ex"}}, "debrief/take_new_data")
    with pytest.raises(RpcError, match=r"^debrief/link_tracks needs the source"):
        mp.LinkTracks.read({"source": []}, "debrief/link_tracks")


def test_the_parameter_models_follow_what_debrief_stac_reads() -> None:
    assert get_args(get_args(mp.TmaSplitLeg.model_fields["side"].annotation)[0]) == tma.SPLIT_SIDES
    assert set(frequencies.FIELDS) <= set(mp.SetTrackFrequencies.model_fields)


def test_a_base_is_checked_in_one_place_for_the_service_and_the_worker() -> None:
    assert base_of(None) is None
    assert base_of({"current": 2, "plot_hash": "h"}) == Base(2, "h")
    for wrong in ({}, {"current": True, "plot_hash": "h"}, {"current": 2}, [2, "h"], "base"):
        with pytest.raises(ValueError, match=re.escape(BASE_SHAPE)):
            base_of(wrong)
