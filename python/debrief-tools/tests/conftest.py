"""A catalogue holding one imported plot: two crossing tracks and a third far away in time."""

from pathlib import Path

import pytest

from debrief_config import add_store, update_config
from debrief_io import import_rep
from debrief_stac import Catalogue

REP = """\
951212 050000.000 NELSON @C 50 20 00.00 N 004 10 00.00 W 090.0 12.0 0
951212 051000.000 NELSON @C 50 20 00.00 N 004 06 52.00 W 090.0 12.0 0
951212 052000.000 NELSON @C 50 20 00.00 N 004 03 44.00 W 090.0 12.0 0
951212 050000.000 BLUE @A 50 23 00.00 N 004 05 00.00 W 180.0 12.0 0
951212 051000.000 BLUE @A 50 21 00.00 N 004 05 00.00 W 180.0 12.0 0
951212 052000.000 BLUE @A 50 19 00.00 N 004 05 00.00 W 180.0 12.0 0
951212 070000.000 LATE @F 50 00 00.00 N 004 00 00.00 W 000.0 5.0 0
951212 071000.000 LATE @F 50 01 00.00 N 004 00 00.00 W 000.0 5.0 0
"""


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    catalogue = Catalogue.create(tmp_path / "store", "ex", "Exercise", "Test")
    source = tmp_path / "serial.rep"
    source.write_text(REP)
    import_rep(catalogue, source)
    return catalogue


@pytest.fixture
def config_file(tmp_path: Path, catalogue: Catalogue) -> Path:
    path = tmp_path / "config.json"
    update_config(
        lambda c: add_store(c, title="Exercise", location=str(catalogue.store.root))[0], path
    )
    return path
