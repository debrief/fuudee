"""Make the synthetic .doc fixtures from the synthetic .docx, and the playground test's
.docx (DEV-05: made-up content).

    uv run python python/debrief-io/tests/data/make_doc_fixtures.py

Needs LibreOffice (soffice) on the path: Word 97-2003 files cannot be written in Python.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

here = Path(__file__).parent
sys.path.insert(0, str(here.parent))
from synthetic_docs import NARRATIVE, PLAYGROUND_LOG, RIDER_TABLE, docx  # noqa: E402

# The playground's test reads this log into the sample (vscode/test/play/narrativeword.mjs);
# the blog post offers the same log to download and read into the demo.
log = docx(PLAYGROUND_LOG)
for folder in ("vscode/test/play", "site/docs/blog/posts/files"):
    target = here.parents[3] / folder / "red-one-log.docx"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(log)
    print(target, target.stat().st_size, "bytes")

with tempfile.TemporaryDirectory() as work:
    for name, data in {
        "synthetic-narrative": docx(NARRATIVE),
        "synthetic-rider": docx([], RIDER_TABLE),
    }.items():
        source = Path(work) / f"{name}.docx"
        source.write_bytes(data)
        subprocess.run(
            ["soffice", "--headless", "--convert-to", "doc", "--outdir", str(here), str(source)],
            check=True,
            capture_output=True,
        )
        print(f"{name}.doc", (here / f"{name}.doc").stat().st_size, "bytes")
