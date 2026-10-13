"""Storage behind an interface (SUB-09).

Catalogues talk to a Store, never to the filesystem directly, so a database
backend (for example pgstac) could be added without changing the catalogue
or the data model. FileStore is the only implementation: a folder tree,
with access control left to the filesystem (PRN-05, SEC-01).
"""

from __future__ import annotations

import os
import shutil
import socket
import stat
import tempfile
import time
from collections.abc import Iterator
from contextlib import AbstractContextManager, contextmanager
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

    def delete(self, path: str) -> None: ...

    def delete_folder(self, path: str) -> None: ...

    def locked(self, path: str) -> AbstractContextManager[None]: ...

    def copy(self, path: str, new_path: str) -> None: ...

    def open_binary(self, path: str) -> BinaryIO: ...

    def import_file(self, source: Path, path: str) -> None: ...

    def subfolders(self, path: str) -> Iterator[str]: ...

    def size_and_mtime(self, path: str) -> tuple[int, int]: ...

    def leftovers(self, path: str) -> list[str]: ...

    def discard_leftovers(self, path: str) -> int: ...


LOCK_WAIT_S = 10.0
LOCK_STALE_S = 30.0
REPLACE_WAIT_S = 2.0


class StoreBusy(StoreError):
    """Another process holds the lock for longer than we wait. Try again."""


def _sync_folder(folder: Path) -> None:
    """Make a rename or link in a folder durable (POSIX; a no-op where unsupported)."""
    if not hasattr(os, "O_DIRECTORY"):
        return
    try:
        handle = os.open(folder, os.O_RDONLY | os.O_DIRECTORY)
    except OSError:
        return
    try:
        os.fsync(handle)
    except OSError:  # some network filesystems refuse; the write itself still stands
        pass
    finally:
        os.close(handle)


def _replace(temporary: str | Path, target: Path) -> None:
    """Rename over a file, retrying while Windows reports it open elsewhere
    (the extension reading it, a virus scanner, an indexer)."""
    deadline = time.monotonic() + REPLACE_WAIT_S
    while True:
        try:
            os.replace(temporary, target)
            return
        except PermissionError:
            if time.monotonic() > deadline:
                raise
            time.sleep(0.05)


def _owner_is_gone(lock: Path) -> bool:
    """Whether a lock was left by a process on this machine that has since died.

    Only checked on POSIX, where signal 0 asks without disturbing the process;
    elsewhere, and for locks taken on another machine, the age rule applies.
    """
    if os.name != "posix":
        return False
    try:
        host, pid = lock.read_text(encoding="utf-8").split()
        if host != socket.gethostname():
            return False
        os.kill(int(pid), 0)
    except ProcessLookupError:
        return True
    except (OSError, ValueError):  # unreadable, half-written, or alive but not ours
        return False
    return False


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
            _replace(temporary, target)
        except BaseException:
            Path(temporary).unlink(missing_ok=True)
            raise
        _sync_folder(target.parent)

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
            link = getattr(os, "link", None)  # absent under Pyodide (CON-09)
            try:
                if link is None:
                    raise OSError("no hard links on this platform")
                link(temporary, target)
            except FileExistsError:
                raise
            except OSError:  # no hard links here: fall back to an exclusive create
                with open(target, "x", encoding="utf-8", newline="\n") as stream:
                    stream.write(text)
                    stream.flush()
                    os.fsync(stream.fileno())
        finally:
            Path(temporary).unlink(missing_ok=True)
        _sync_folder(target.parent)

    def files(self, path: str) -> list[str]:
        """Names of the files in a folder, sorted; none if it does not exist."""
        folder = self._resolve(path)
        if not folder.is_dir():
            return []
        return sorted(
            p.name for p in folder.iterdir() if p.is_file() and not p.name.startswith(".")
        )

    def rename(self, path: str, new_path: str) -> None:
        target = self._resolve(new_path)
        _replace(self._resolve(path), target)
        _sync_folder(target.parent)

    def delete(self, path: str) -> None:
        self._resolve(path).unlink(missing_ok=True)

    def delete_folder(self, path: str) -> None:
        """Remove a folder and everything in it, including read-only files."""

        def writable_then_retry(function, failed, _):  # sources are read-only
            os.chmod(failed, stat.S_IWRITE | stat.S_IREAD)
            function(failed)

        folder = self._resolve(path)
        if folder.exists():
            shutil.rmtree(folder, onerror=writable_then_retry)

    @contextmanager
    def locked(self, path: str) -> Iterator[None]:
        """Hold a short advisory lock: a file created exclusively, removed after.

        For writes that take milliseconds, never for an analyst's session: plots
        are not locked while open (SUB-29). A lock left by a process that died
        is taken over at once if it was on this machine, otherwise once it is
        LOCK_STALE_S old.
        """
        lock = self._resolve(path)
        lock.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + LOCK_WAIT_S
        while True:
            try:
                handle = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
                break
            except FileExistsError:
                try:
                    if _owner_is_gone(lock) or time.time() - lock.stat().st_mtime > LOCK_STALE_S:
                        lock.unlink(missing_ok=True)
                        continue
                except FileNotFoundError:
                    continue
                if time.monotonic() > deadline:
                    raise StoreBusy(
                        "Another Debrief process is saving this plot. Try again in a moment."
                    ) from None
                time.sleep(0.02)
        try:
            os.write(handle, f"{socket.gethostname()} {os.getpid()}\n".encode())
            os.close(handle)
            yield
        finally:
            lock.unlink(missing_ok=True)

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

    def leftovers(self, path: str) -> list[str]:
        """Temporary files beside a file from atomic writes of it: one in progress, or
        one whose process died before the rename (NFR-11)."""
        target = self._resolve(path)
        return sorted(p.name for p in target.parent.glob(f".{target.name}.*.tmp"))

    def discard_leftovers(self, path: str) -> int:
        """Remove what an atomic write of this file left when its process died before
        the rename. Only while holding the file's lock, so that no write in progress
        is mistaken for one. Returns how many there were."""
        target = self._resolve(path)
        found = list(target.parent.glob(f".{target.name}.*.tmp"))
        for leftover in found:
            leftover.unlink(missing_ok=True)
        return len(found)
