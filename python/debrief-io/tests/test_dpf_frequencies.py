"""How often a legacy plot's tracks are labelled, marked and arrowed (CAP-32): its display
rules (CoreFormatter) become the tracks' intervals, or, where none says, the fixes legacy
Debrief showed with their label, symbol or arrow give them, where they fall regularly.
Every plot file here is made up for the test."""

from pathlib import Path

import pytest

from debrief_io import import_dpf
from debrief_io.dpf_import import _legacy_shown
from debrief_schemas import models
from debrief_stac import Catalogue


@pytest.fixture
def catalogue(tmp_path: Path) -> Catalogue:
    return Catalogue.create(tmp_path / "cat", "ex", "Exercise", "Test")


def _plot_file(tmp_path: Path, layers: str) -> Path:
    source = tmp_path / "made.dpf"
    source.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<plot xmlns="http://www.debrief.info/plot">\n'
        f"<session>\n<layers>\n{layers}\n</layers>\n</session>\n</plot>\n"
    )
    return source


def _rule(name: str, style: str, interval: str, **attrs: str) -> str:
    """A display rule as legacy Debrief writes one (CoreFormatHandler)."""
    extra = "".join(f' {key}="{value}"' for key, value in attrs.items())
    return f'<CoreFormatter Name="{name}" A_Style="{style}" Interval="{interval}"{extra}/>'


def _minutes(name: str, count: int, flags: dict[str, set[int]] | None = None) -> str:
    """A track with a fix a minute from 05:00, showing its label, symbol or arrow at the
    minutes given."""
    fixes = []
    for minute in range(count):
        shown = "".join(
            f' {flag}="true"' for flag, minutes in (flags or {}).items() if minute in minutes
        )
        fixes.append(
            f'<fix Course="90" Speed="12" Dtg="951212 05{minute:02d}00"{shown}><centre>'
            f'<shortLocation Depth="0" Lat="50.0" Long="{-4 + minute / 100:.2f}"/></centre>'
            "</fix>"
        )
    return f'<track Name="{name}"><TrackSegment>{"".join(fixes)}</TrackSegment></track>'


def _intervals(catalogue: Catalogue) -> dict[str, tuple]:
    return {
        f.properties.name: (
            f.properties.label_interval,
            f.properties.symbol_interval,
            f.properties.arrow_interval,
        )
        for f in catalogue.read_plot("made").features
        if f.properties.kind == "track"
    }


def minutes(count: int) -> models.Duration:
    return models.Duration(value=count, unit="min")


def test_display_rules_become_track_intervals(catalogue: Catalogue, tmp_path: Path) -> None:
    """Each active rule sets the interval of the tracks it names, or of every track; what
    cannot be taken is said."""
    rules = "".join(
        [
            _rule("half_hour_labels", "Label", "1800000", LayerName="", RegularIntervals="true"),
            _rule("arrows", "Arrow", "900000", RegularIntervals="true", Symbology="@B"),
            _rule("every_symbol", "Symbol", "0", LayerName="NELSON", RegularIntervals="true"),
            _rule("arrows_everywhere", "Arrow", "0", LayerName="NELSON"),
            _rule("two_days", "Label", "172800000", LayerName="NELSON"),
            _rule("asleep", "Symbol", "60000", Active="false"),
            _rule("nobody", "Label", "60000", LayerName="GHOST"),
            _rule("loose", "Symbol", "120000", LayerName="COLLINGWOOD"),
        ]
    )
    source = _plot_file(
        tmp_path,
        f"{_minutes('NELSON', 3)}{_minutes('COLLINGWOOD', 3)}"
        f'<layer Name="Formatters" Visible="true">{rules}</layer>',
    )
    report = import_dpf(catalogue, source)
    assert _intervals(catalogue) == {
        "NELSON": (minutes(30), models.FixIntervalAllEnum.all, minutes(15)),
        "COLLINGWOOD": (minutes(30), minutes(2), minutes(15)),
    }
    notes = "\n".join(report.omitted)
    for said in [
        "Display rule 'half_hour_labels' in layer 'Formatters' imported: labels every 30 min "
        "on every track.",
        "Display rule 'arrows' in layer 'Formatters' imported: arrows every 15 min on every track.",
        "Display rule 'arrows': its symbology match '@B' is not imported",
        "Display rule 'every_symbol' in layer 'Formatters' imported: symbols at every fix on "
        "'NELSON'.",
        "Display rule 'arrows_everywhere' in layer 'Formatters' not imported: it shows arrows "
        "at every fix, which Debrief v4 does not offer.",
        "Display rule 'two_days' in layer 'Formatters' not imported: its interval of "
        "172800000 ms is not a whole number of seconds from 1 s to 24 h.",
        "Display rule 'asleep' in layer 'Formatters' not imported: it is not active.",
        "Display rule 'nobody' in layer 'Formatters' not imported: it applies to 'GHOST', and "
        "no track of that name was imported.",
        "Display rule 'loose': legacy Debrief applied it from each track's first fix",
        "Layer 'Formatters' (layer, shown): its settings are not imported, since v4 has no "
        "layers yet; its display rules are said above.",
    ]:
        assert said in notes, said
    # Only a rule that is not on regular intervals is said to differ.
    assert "Display rule 'half_hour_labels': legacy" not in notes
    assert "display rules are not yet supported" not in notes


def test_a_later_rule_wins_as_in_legacy(catalogue: Catalogue, tmp_path: Path) -> None:
    rules = _rule("first", "Label", "600000") + _rule("second", "Label", "3600000")
    source = _plot_file(tmp_path, f'{_minutes("T", 3)}<layer Name="F">{rules}</layer>')
    report = import_dpf(catalogue, source)
    assert _intervals(catalogue)["T"][0] == models.Duration(value=1, unit="h")
    assert (
        "Track 'T': display rules 'first' and 'second' both set its labels; the later, "
        "'second', is used, as in legacy Debrief." in report.omitted
    )


def test_a_rule_names_a_track_split_into_legs_by_its_legacy_name(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    """A track whose legs overlap comes in as a track a leg; a rule naming it sets all."""
    leg = (
        '<TrackSegment Name="{n}"><fix Course="0" Speed="1" Dtg="951212 0500{s}"><centre>'
        '<shortLocation Lat="50" Long="-4"/></centre></fix><fix Course="0" Speed="1" '
        'Dtg="951212 0510{s}"><centre><shortLocation Lat="50.1" Long="-4"/></centre></fix>'
        "</TrackSegment>"
    )
    track = f'<track Name="T">{leg.format(n="a", s="00")}{leg.format(n="b", s="30")}</track>'
    rule = _rule("labels", "Label", "300000", LayerName="T")
    source = _plot_file(tmp_path, f'{track}<layer Name="F">{rule}</layer>')
    import_dpf(catalogue, source)
    assert {name: i[0] for name, i in _intervals(catalogue).items()} == {
        "T (a)": minutes(5),
        "T (b)": minutes(5),
    }


def test_fixes_shown_at_a_regular_interval_give_the_tracks_interval(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    """With no display rule, the fixes legacy Debrief showed with their label, symbol or
    arrow give the track's interval where they fall as it would have shown them at one the
    forms offer, or at every fix; otherwise they are listed."""
    shown = {
        "LabelShowing": {0, 10, 20},  # every 10 min, from 05:00
        "SymbolShowing": set(range(21)),  # every fix
        "ArrowShowing": {0, 3, 4, 17},  # no interval
    }
    source = _plot_file(tmp_path, _minutes("T", 21, shown))
    report = import_dpf(catalogue, source)
    assert _intervals(catalogue)["T"] == (minutes(10), models.FixIntervalAllEnum.all, None)
    notes = "\n".join(report.omitted)
    assert (
        "Track 'T': its fixes' labels shown in the legacy plot fall every 10 min, so its "
        "labels are every 10 min." in notes
    )
    assert "Track 'T': its fixes' symbols shown in the legacy plot fall at every fix" in notes
    assert (
        "Track 'T': 4 of 21 fixes showed their arrow in the legacy plot, at no interval "
        "Debrief v4 offers; which arrows were shown is not imported." in notes
    )


def test_fixes_shown_at_no_interval_always_show_their_label_or_symbol(
    catalogue: Catalogue, tmp_path: Path
) -> None:
    """Labels and symbols legacy Debrief showed at no interval the forms offer are kept as
    those fixes always showing theirs (product owner, 16 Oct 2026); arrows are listed."""
    shown = {
        "LabelShowing": {0, 3, 4, 17},
        "SymbolShowing": {2, 9},
        "ArrowShowing": {0, 3, 4, 17},
    }
    source = _plot_file(tmp_path, _minutes("T", 21, shown))
    report = import_dpf(catalogue, source)
    assert _intervals(catalogue)["T"] == (None, None, None)
    track = next(f for f in catalogue.read_plot("made").features if f.properties.name == "T")
    marks = track.properties.fix_marks or []
    assert len([m for m in marks if m.show_label]) == 4
    assert len([m for m in marks if m.show_symbol]) == 2
    notes = "\n".join(report.omitted)
    assert (
        "Track 'T': 4 of 21 fixes showed their label in the legacy plot, at no interval "
        "Debrief v4 offers; those fixes always show their label." in notes
    )
    assert "those fixes always show their symbol." in notes
    assert "which arrows were shown is not imported." in notes


def test_a_display_rule_wins_over_what_fixes_showed(catalogue: Catalogue, tmp_path: Path) -> None:
    source = _plot_file(
        tmp_path,
        f"{_minutes('T', 21, {'LabelShowing': {0, 10, 20}})}"
        f'<layer Name="F">{_rule("hourly", "Label", "3600000")}</layer>',
    )
    report = import_dpf(catalogue, source)
    assert _intervals(catalogue)["T"][0] == models.Duration(value=1, unit="h")
    assert not any("fixes' labels shown" in note for note in report.omitted)


def test_legacy_shows_the_first_fix_at_or_after_each_multiple() -> None:
    """LightweightTrackWrapper.setFixes, as its own test of CoreFormatItemListener has it."""
    times = [0, 4000, 5000, 9000, 10_000, 14_100, 15_000]
    assert _legacy_shown(times, 5000) == [True, False, True, False, True, False, True]
    # A track no longer than one interval: its start.
    assert _legacy_shown([1000, 2000], 60_000) == [True, False]
    # After a gap, the next multiple after it, not a fix far past one.
    assert _legacy_shown([0, 60_000, 400_000, 420_000], 60_000) == [True, True, False, True]
