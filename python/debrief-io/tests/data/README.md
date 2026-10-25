# Test data

`shapes.dpf` is an unmodified copy of legacy Debrief's sample plot
`org.mwc.cmap.combined.feature/root_installs/sample_data/shapes.dpf`, from
https://github.com/debrief/debrief (commit `2f121f4a`, git blob `b5e7c295`).
Legacy Debrief, its sample data included, is licensed under the Eclipse
Public License 1.0 (EPL-1.0); see `LICENSE.txt` in that repository. It is
kept here, under that licence, as a fixture for the .dpf importer's tests.

`synthetic-narrative.doc` and `synthetic-rider.doc` are not legacy Debrief's:
they are made-up, unclassified narratives (platforms BLUE ONE, RED TWO;
organisations by initial only), written as Word 97-2003 files by LibreOffice
from the `.docx` that `../synthetic_docs.py` builds, by `make_doc_fixtures.py`,
for the Word and PDF narrative dialects' tests (CAP-19, DEV-05). The same script
writes the playground test's `vscode/test/play/red-one-log.docx`.

`tma.dpf` is not legacy Debrief's either: a made-up, unclassified plot of one
ownship (MAYO), its Bow sensor's cuts, and a legacy TMA solution of a relative
leg, a dynamic infill and an absolute leg, as `../test_dpf_tma.py` builds it
(`PLOT`), for the playground test's import of a legacy solution (CAP-21).
