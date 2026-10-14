"""Per-user configuration: location rules, reading, locked changes and store edits."""

import json
import os
import threading
import time
from pathlib import Path

import pytest

import debrief_config.config as module
from debrief_config import (
    ConfigError,
    add_store,
    config_path,
    load_config,
    normalise_location,
    remove_store,
    same_location,
    track_import_mode,
    update_config,
    with_track_import_mode,
)
from debrief_schemas import CONFIG_VERSION

ROOT = Path(__file__).resolve().parents[3]
PATHS = json.loads((ROOT / "schemas" / "vectors" / "config-paths.json").read_text())["cases"]
LOCATIONS = json.loads((ROOT / "schemas" / "vectors" / "store-locations.json").read_text())


@pytest.mark.parametrize("case", PATHS, ids=[c["name"] for c in PATHS])
def test_config_path_matches_shared_vectors(case: dict) -> None:
    path = config_path(env=case["env"], platform=case["platform"], home=case["home"])
    assert str(path) == case["expected"]


@pytest.mark.parametrize(
    "case", LOCATIONS["normalise"], ids=lambda c: f"{c['platform']}:{c['input']}"
)
def test_normalise_location_matches_shared_vectors(case: dict) -> None:
    if case.get("error"):
        with pytest.raises(ConfigError, match="full path"):
            normalise_location(case["input"], case["platform"])
    else:
        assert normalise_location(case["input"], case["platform"]) == case["expected"]


@pytest.mark.parametrize("case", LOCATIONS["same"], ids=lambda c: f"{c['platform']}:{c['a']}")
def test_same_location_matches_shared_vectors(case: dict) -> None:
    assert same_location(case["a"], case["b"], case["platform"]) is case["expected"]


def test_missing_file_is_empty_config(tmp_path: Path) -> None:
    config = load_config(tmp_path / "absent.json")
    assert config.config_version == CONFIG_VERSION
    assert config.stores == []


def test_update_adds_and_removes(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "config.json"
    location = str(tmp_path / "cat")
    config = update_config(
        lambda c: add_store(c, title="Team exercises", location=location)[0], path
    )
    (store,) = config.stores
    assert (store.id, store.location) == ("team-exercises", location)
    assert load_config(path) == config
    assert update_config(lambda c: remove_store(c, "team-exercises"), path).stores == []
    leftovers = [p.name for p in path.parent.iterdir() if p.name != "config.json"]
    assert leftovers == [], "no temporary or lock file left behind"


def test_same_title_gets_distinct_id_and_same_location_is_not_added_twice(tmp_path: Path) -> None:
    config, first = add_store(
        load_config(tmp_path / "c.json"), title="Exercise", location=tmp_path / "a"
    )
    config, second = add_store(config, title="Exercise", location=tmp_path / "b")
    assert (first.id, second.id) == ("exercise", "exercise-2")
    again, existing = add_store(config, title="Other", location=f"{tmp_path}/a/")
    assert existing == first and again == config


def test_relative_location_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="full path"):
        add_store(load_config(tmp_path / "c.json"), title="X", location="relative/folder")


def test_remove_unknown_store_is_an_error(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="no-such"):
        remove_store(load_config(tmp_path / "c.json"), "no-such")


def test_concurrent_changes_are_all_kept(tmp_path: Path) -> None:
    """The extension and a service adding stores at once must not lose either."""
    path = tmp_path / "config.json"

    def add(n: int) -> None:
        update_config(lambda c: add_store(c, title=f"S{n}", location=f"/data/s{n}")[0], path)

    threads = [threading.Thread(target=add, args=(n,)) for n in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(s.location for s in load_config(path).stores) == [f"/data/s{n}" for n in range(8)]


def test_held_lock_times_out_and_stale_lock_is_cleared(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "config.json"
    lock = tmp_path / "config.json.lock"
    lock.write_text("12345\n")
    monkeypatch.setattr(module, "LOCK_WAIT_S", 0.2)
    with pytest.raises(ConfigError, match="Another Debrief process"):
        update_config(lambda c: add_store(c, title="X", location="/x")[0], path)
    old = time.time() - module.LOCK_STALE_S - 1
    os.utime(lock, (old, old))
    update_config(lambda c: add_store(c, title="X", location="/x")[0], path)
    assert not lock.exists()


def test_replace_retries_while_file_is_in_use(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "config.json"
    real_replace, calls = os.replace, []

    def busy_then_free(src, dst):
        calls.append(dst)
        if len(calls) < 3:
            raise PermissionError(32, "The process cannot access the file")
        real_replace(src, dst)

    monkeypatch.setattr(module.os, "replace", busy_then_free)
    update_config(lambda c: add_store(c, title="X", location="/x")[0], path)
    assert len(calls) == 3 and load_config(path).stores[0].id == "x"


def test_newer_config_is_refused_and_never_overwritten(tmp_path: Path) -> None:
    path = tmp_path / "config.json"
    original = json.dumps({"config_version": CONFIG_VERSION + 1, "stores": [], "future": True})
    path.write_text(original)
    with pytest.raises(ConfigError, match="newer version of Debrief"):
        load_config(path)
    with pytest.raises(ConfigError, match="newer version of Debrief"):
        update_config(lambda c: add_store(c, title="X", location="/x")[0], path)
    assert path.read_text() == original


def test_byte_order_mark_is_tolerated(tmp_path: Path) -> None:
    path = tmp_path / "config.json"
    path.write_bytes(b"\xef\xbb\xbf" + json.dumps({"config_version": 1, "stores": []}).encode())
    assert load_config(path).stores == []


@pytest.mark.parametrize(
    "content",
    [
        b"{not json",
        b"\xff\xfe\x00bad",
        json.dumps({"config_version": 1, "stores": [{"id": "x"}]}).encode(),
    ],
    ids=["bad-json", "bad-encoding", "invalid"],
)
def test_unreadable_file_is_a_config_error_naming_the_file(tmp_path: Path, content: bytes) -> None:
    path = tmp_path / "config.json"
    path.write_bytes(content)
    with pytest.raises(ConfigError, match=r"config\.json"):
        load_config(path)


def test_non_ascii_titles_are_written_as_utf8(tmp_path: Path) -> None:
    path = tmp_path / "config.json"
    update_config(lambda c: add_store(c, title="Übung Nord", location="/data/übung")[0], path)
    assert "Übung Nord" in path.read_text(encoding="utf-8")


def test_default_location_follows_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DEBRIEF_CONFIG", str(tmp_path / "mine.json"))
    update_config(lambda c: add_store(c, title="Mine", location=str(tmp_path))[0])
    assert (tmp_path / "mine.json").exists()


def test_writes_the_same_bytes_typescript_writes(tmp_path: Path) -> None:
    fixture = ROOT / "schemas" / "fixtures" / "user_config" / "valid" / "two-stores.json"
    path = tmp_path / "config.json"
    config = load_config(fixture)
    update_config(lambda _: config, path)
    assert path.read_bytes() == fixture.read_bytes()


def test_the_track_import_mode_is_ask_until_remembered_and_can_be_cleared(tmp_path: Path) -> None:
    """User state (CAP-01): ask, or the choice remembered for future imports, in the
    user's configuration file, never in a catalogue; clearing it asks again."""
    path = tmp_path / "config.json"
    assert track_import_mode(load_config(path)) == "ask"
    update_config(lambda c: with_track_import_mode(c, "dr"), path)
    assert track_import_mode(load_config(path)) == "dr"
    assert json.loads(path.read_text())["track_import_mode"] == "dr"
    update_config(lambda c: with_track_import_mode(c, "ask"), path)
    assert track_import_mode(load_config(path)) == "ask"
    assert "track_import_mode" not in json.loads(path.read_text())
    with pytest.raises(ConfigError, match="not a track import mode"):
        with_track_import_mode(load_config(path), "sideways")
