"""Per-user configuration: location rules, reading, writing and store edits."""

import json
from pathlib import Path

import pytest

from debrief_config import (
    ConfigError,
    add_store,
    config_path,
    load_config,
    remove_store,
    save_config,
)
from debrief_schemas import CONFIG_VERSION

ROOT = Path(__file__).resolve().parents[3]
VECTORS = json.loads((ROOT / "schemas" / "vectors" / "config-paths.json").read_text())["cases"]


@pytest.mark.parametrize("case", VECTORS, ids=[c["name"] for c in VECTORS])
def test_config_path_matches_shared_vectors(case: dict) -> None:
    path = config_path(env=case["env"], platform=case["platform"], home=case["home"])
    assert str(path) == case["expected"]


def test_missing_file_is_empty_config(tmp_path: Path) -> None:
    config = load_config(tmp_path / "absent.json")
    assert config.config_version == CONFIG_VERSION
    assert config.stores == []


def test_add_save_load_remove(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "config.json"
    config, store = add_store(
        load_config(path),
        title="Team exercises",
        location=tmp_path / "cat",
        protection_level="OFFICIAL",
    )
    assert store.id == "team-exercises"
    assert store.location == str((tmp_path / "cat").resolve())
    save_config(config, path)
    loaded = load_config(path)
    assert loaded == config
    assert remove_store(loaded, "team-exercises").stores == []
    assert not list(path.parent.glob("*.tmp")), "no temporary file left behind"


def test_same_title_gets_distinct_id_and_same_location_is_not_added_twice(tmp_path: Path) -> None:
    config, first = add_store(
        load_config(tmp_path / "c.json"), title="Exercise", location=tmp_path / "a"
    )
    config, second = add_store(config, title="Exercise", location=tmp_path / "b")
    assert (first.id, second.id) == ("exercise", "exercise-2")
    again, existing = add_store(config, title="Other", location=tmp_path / "a")
    assert existing == first and again == config


def test_remove_unknown_store_is_an_error(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="no-such"):
        remove_store(load_config(tmp_path / "c.json"), "no-such")


def test_newer_config_is_refused_and_never_overwritten(tmp_path: Path) -> None:
    path = tmp_path / "config.json"
    original = json.dumps({"config_version": CONFIG_VERSION + 1, "stores": [], "future": True})
    path.write_text(original)
    with pytest.raises(ConfigError, match="newer version of Debrief"):
        load_config(path)
    with pytest.raises(ConfigError, match="newer version of Debrief"):
        save_config(load_config(tmp_path / "absent.json"), path)
    assert path.read_text() == original


def test_invalid_file_names_the_file_and_problem(tmp_path: Path) -> None:
    path = tmp_path / "config.json"
    path.write_text(json.dumps({"config_version": 1, "stores": [{"id": "x"}]}))
    with pytest.raises(ConfigError, match=r"config\.json is not a valid Debrief configuration"):
        load_config(path)


def test_default_location_follows_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DEBRIEF_CONFIG", str(tmp_path / "mine.json"))
    save_config(add_store(load_config(), title="Mine", location=tmp_path)[0])
    assert (tmp_path / "mine.json").exists()
