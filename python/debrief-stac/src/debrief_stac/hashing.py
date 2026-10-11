"""Content hashes for sources (SUB-11)."""

from __future__ import annotations

import hashlib
from typing import BinaryIO

CHUNK = 1 << 20


def content_hash(stream: BinaryIO) -> str:
    digest = hashlib.sha256()
    for chunk in iter(lambda: stream.read(CHUNK), b""):
        digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"
