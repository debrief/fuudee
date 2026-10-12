"""A Debrief process that dies part-way through saving a change (NFR-10).

It writes the change's delta, then is killed before it can record the change
as current. The extension must finish the change when the plot is next opened.
Arguments: catalogue folder, plot id.
"""

import os
import sys
from pathlib import Path

from debrief_schemas import models
from debrief_stac import Catalogue, Changes

catalogue = Catalogue.open(Path(sys.argv[1]))
real = catalogue.store.write_text_atomic


def die_before_the_head(path: str, text: str) -> None:
    if path.endswith("head.json"):
        os._exit(9)  # killed: no clean-up, no exception handlers
    real(path, text)


catalogue.store.write_text_atomic = die_before_the_head
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
    notes=["Note added just before a crash"],  # what the History view calls the step
)
catalogue.commit(sys.argv[2], [record], Changes(added=[note]))
