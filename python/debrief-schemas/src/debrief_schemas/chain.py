"""The plot's history inside its plot file: content, hash chain and pointer rules.

A plot file is its content, its island (the whole-plot feature's view, SUB-22)
and its history (the top-level member history, decision 13 Oct). The content
hash leaves out both: the island because it is view state, the history
because it records content hashes. The history is protected by a hash chain
instead: each step's step_hash covers the step and the step before it, and
head_hash is the last step's, so a step altered, removed or reordered is
noticed. A step's state and the history's current step are pointers, checked
against the steps' after links (see pointer_problems).

The rules here are shared by document validation (documents.py) and the
plot's history (debrief_stac.history), which checks only the steps it has not
already checked.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from typing import Any

from debrief_schemas.island import PLOT_KIND, dump_json

HISTORY_MEMBER = "history"
GENESIS_HASH = "sha256:" + "0" * 64
# Members of a step that are not part of its step_hash: the hash itself, and
# its state, which undo and redo change.
UNHASHED = ("step_hash", "state")


def text_hash(text: str | bytes) -> str:
    data = text.encode("utf-8") if isinstance(text, str) else text
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def canonical_step(raw: dict[str, Any]) -> bytes:
    """A step as its step_hash covers it: every member but step_hash and state,
    keys sorted, no spaces, UTF-8."""
    kept = {k: v for k, v in raw.items() if k not in UNHASHED}
    return json.dumps(kept, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def step_hash(raw: dict[str, Any], previous: str) -> str:
    """sha256 of the canonical step followed by the previous step's step_hash."""
    return text_hash(canonical_step(raw) + previous.encode("ascii"))


def _without_view(features: Any) -> Any:
    if not isinstance(features, list):
        return features
    out = []
    for feature in features:
        properties = feature.get("properties") if isinstance(feature, dict) else None
        if (
            isinstance(properties, dict)
            and properties.get("kind") == PLOT_KIND
            and "view" in properties
        ):
            properties = {k: v for k, v in properties.items() if k != "view"}
            feature = {**feature, "properties": properties}
        out.append(feature)
    return out


def content_of(document: dict[str, Any]) -> dict[str, Any]:
    """A parsed plot file's content: without its history and its island. Shallow:
    the document given is not changed."""
    content = {k: v for k, v in document.items() if k != HISTORY_MEMBER}
    if "features" in content:
        content["features"] = _without_view(content["features"])
    return content


def content_text_of(document: dict[str, Any]) -> str:
    """The text the content hash is taken over, as Debrief writes it."""
    return dump_json(content_of(document))


# A step's state as the History view says it.
_WORDS = {"applied": "in the plot", "undone": "undone", "abandoned": "replaced by a later change"}


def pointer_problems(
    steps: Sequence[tuple[int, int, str | None]], current: int
) -> tuple[list[str], list[str]]:
    """Rules for the numbers and pointers: (seq, after, state) of each step, and current.

    Returns the problems and, when the numbers are sound, each step's state as
    the after links and current say it should be.
    """
    problems = []
    count = len(steps)
    seqs = [seq for seq, _, _ in steps]
    if seqs != list(range(1, count + 1)):
        problems.append("its steps are not numbered 1, 2, 3 and so on, in order")
        return problems, []
    for seq, after, _ in steps:
        if not 0 <= after < seq:
            problems.append(f"step {seq} follows step {after}, which is not an earlier step")
    if current > count:
        problems.append(f"its current step, {current}, is beyond its last step, {count}")
    if problems:
        return problems, []
    afters = {seq: after for seq, after, _ in steps}

    def chain(upto: int) -> set[int]:
        found = set()
        while upto:
            found.add(upto)
            upto = afters[upto]
        return found

    applied, live = chain(current), chain(count)
    if current and current not in live:
        problems.append(f"its current step, {current}, was replaced by a later change")
    expected = [
        "applied" if seq in applied else "undone" if seq in live else "abandoned"
        for seq in range(1, count + 1)
    ]
    for (seq, _, state), wanted in zip(steps, expected, strict=True):
        if state is not None and state != wanted:
            problems.append(
                f"step {seq} is marked {_WORDS.get(state, state)} but is {_WORDS[wanted]}"
            )
    return problems, expected


def chain_problem(raw_steps: Sequence[dict[str, Any]], head_hash: Any) -> str | None:
    """Where the hash chain breaks, in plain words, or None if it is whole."""
    previous = GENESIS_HASH
    for index, raw in enumerate(raw_steps):
        if not isinstance(raw, dict) or step_hash(raw, previous) != raw.get("step_hash"):
            return f"step {index + 1} of its history is not as Debrief recorded it"
        previous = raw["step_hash"]
    if head_hash != previous:
        return "the last step of its history is missing or was changed"
    return None
