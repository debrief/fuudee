"""Storage behind an interface (SUB-09).

Catalogues talk to a Store, never to the filesystem directly, so a database
backend (for example pgstac) could be added without changing the catalogue
or the data model. FileStore is the only implementation: a folder tree,
with access control left to the filesystem (PRN-05, SEC-01).
"""

from __future__ import annotations

import os
import shutil
import stat
import tempfile
from collections.abc import Iterator
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Protocol


class StoreError(Exception):
    """A storage operation could not be completed."""


class Store(Protocol):
    """Relative paths use forward slashes and never leave the store."""

    def exists(self, path: str) -> bool: ...

    def read_text(self, path: str) -> str: ...

    def write_text_atomic(self, path: str, text: str) -> None: ...

    def write_text_exclusive(self, path: str, text: str) -> None: ...

    def files(self, path: str) -> list[str]: ...

    def rename(self, path: str, new_path: str) -> None: ...

    def copy(self, path: str, new_path: str) -> None: ...

    def open_binary(self, path: str) -> BinaryIO: ...

    def import_file(self, source: Path, path: str) -> None: ...

    def subfolders(self, path: str) -> Iterator[str]: ...

    def size_and_mtime(self, path: str) -> tuple[int, int]: ...


class FileStore:
    def __init__(self, root: Path):
        self.root = Path(root).resolve()

    def _resolve(self, path: str) -> Path:
        relative = PurePosixPath(path)
        if relative.is_absolute() or ".." in relative.parts:
            raise StoreError(f"{path!r} is outside the catalogue")
        return self.root.joinpath(*relative.parts)

    def exists(self, path: str) -> bool:
        return self._resolve(path).exists()

    def read_text(self, path: str) -> str:
        return self._resolve(path).read_text(encoding="utf-8")

    def write_text_atomic(self, path: str, text: str) -> None:
        """Write via a temporary file and rename, so a failure part-way never
        leaves a corrupt file and the original survives (NFR-11)."""
        target = self._resolve(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        handle, temporary = tempfile.mkstemp(
            dir=target.parent, prefix=f".{target.name}.", suffix=".tmp"
        )
        try:
            with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
                stream.write(text)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)
        except BaseException:
            Path(temporary).unlink(missing_ok=True)
            raise

    def write_text_exclusive(self, path: str, text: str) -> None:
        """Write a new file atomically, failing with FileExistsError if it exists.

        Two processes writing the same path at once: exactly one succeeds. The
        content is written to a temporary file first and then hard-linked into
        place, so the file never appears part-written. Where the filesystem has
        no hard links, an exclusive create is used instead.
        """
        target = self._resolve(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        handle, temporary = tempfile.mkstemp(
            dir=target.parent, prefix=f".{target.name}.", suffix=".tmp"
        )
        try:
            with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
                stream.write(text)
                stream.flush()
                os.fsync(stream.fileno())
            try:
                os.link(temporary, target)
            except FileExistsError:
                raise
            except OSError:  # no hard links here: fall back to an exclusive create
                with open(target, "x", encoding="utf-8", newline="\n") as stream:
                    stream.write(text)
                    stream.flush()
                    os.fsync(stream.fileno())
        finally:
            Path(temporary).unlink(missing_ok=True)

    def files(self, path: str) -> list[str]:
        """Names of the files in a folder, sorted; none if it does not exist."""
        folder = self._resolve(path)
        if not folder.is_dir():
            return []
        return sorted(
            p.name for p in folder.iterdir() if p.is_file() and not p.name.startswith(".")
        )

    def rename(self, path: str, new_path: str) -> None:
        os.replace(self._resolve(path), self._resolve(new_path))

    def copy(self, path: str, new_path: str) -> None:
        """Copy a file, keeping it read-only if it was (sources stay immutable, SUB-10)."""
        target = self._resolve(new_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self._resolve(path), target)

    def open_binary(self, path: str) -> BinaryIO:
        return self._resolve(path).open("rb")

    def import_file(self, source: Path, path: str) -> None:
        """Copy a file in and make it read-only: imported sources are never modified (SUB-10)."""
        target = self._resolve(path)
        if target.exists():
            raise StoreError(f"{path} already exists; a source is never overwritten")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        target.chmod(stat.S_IREAD | stat.S_IRGRP | stat.S_IROTH)

    def subfolders(self, path: str) -> Iterator[str]:
        folder = self._resolve(path)
        if not folder.is_dir():
            return
        for child in sorted(folder.iterdir()):
            if child.is_dir() and not child.name.startswith("."):
                yield child.name

    def size_and_mtime(self, path: str) -> tuple[int, int]:
        info = self._resolve(path).stat()
        return info.st_size, info.st_mtime_ns
