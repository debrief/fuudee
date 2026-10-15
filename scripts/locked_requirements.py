"""Print name==version for each package named, as uv.lock pins it.

The playground and the Pyodide spike install pure-Python dependencies from wheels
downloaded at build time; taking their versions from the lock keeps the browser on
the versions the desktop runs and the tests check.

    python3 scripts/locked_requirements.py pypdf olefile
"""

import sys
import tomllib
from pathlib import Path

lock = tomllib.loads((Path(__file__).resolve().parent.parent / "uv.lock").read_text())
versions = {p["name"]: p["version"] for p in lock["package"] if "version" in p}
missing = [name for name in sys.argv[1:] if name not in versions]
if missing:
    sys.exit(f"Not in uv.lock: {', '.join(missing)}")
print(" ".join(f"{name}=={versions[name]}" for name in sys.argv[1:]))
