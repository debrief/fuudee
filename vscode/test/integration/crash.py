"""A Debrief process that dies part-way through saving a change (NFR-10, NFR-11).

It writes the whole new plot file under a temporary name, then is killed
before it can rename it over the plot file. The plot file is the one from
before the save, whole; the extension says, when the plot is next opened,
that a save was interrupted, and clears what it left.
Arguments: catalogue folder, plot id.
"""

import os
import sys
from pathlib import Path

import debrief_stac.store as store
from debrief_schemas import models
from debrief_stac import Catalogue, Changes


def die_before_the_rename(temporary, target) -> None:
    os._exit(9)  # killed: no clean-up, no exception handlers


catalogue = Catalogue.open(Path(sys.argv[1]))
store._replace = die_before_the_rename
note = models.AnnotationFeature(
    type="Feature",
    id="note-before-the-crash",
    geometry=None,
    properties=models.AnnotationProperties(
        kind="annotation",
        style="note",
        name="Saved just before the crash",
        time="2023-06-15T09:00:00.000Z",
    ),
)
record = models.ProvRecord(
    id="edit-before-the-crash",
    kind="edit",
    started_at="2023-06-15T09:00:00.000Z",
    agent=models.AgentRef(kind="person", name="analyst"),
    notes=["Note added just before a crash"],  # what the History view would call the step
)
catalogue.commit(sys.argv[2], [record], Changes(added=[note]))
