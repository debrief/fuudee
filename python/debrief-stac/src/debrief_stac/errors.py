"""The base of every domain module's refusals.

A domain module (annotations, narrative, tracks, sensors, TMA, collation, figures and
those to come) says why it will not do what was asked by raising a subclass of
DomainError, in plain words for the analyst. Catalogue._change, the one commit path
for changes made by hand, turns any DomainError into a CatalogueError with the same
message, so a new module's refusals reach the analyst without being listed anywhere
(tests/test_errors.py checks that every domain module's errors subclass it).
"""

from __future__ import annotations


class DomainError(ValueError):
    """Something a domain module will not do, said in plain words for the analyst."""


__all__ = ["DomainError"]
