"""The tool service's JSON-RPC methods, each declared once (review, 7 Nov 2026, finding 1).

A Method says everything the service needs to know of one method: its name, the
parameters it takes (a Params model), whether it changes the plot it names, whether it
needs agent (SUB-24), whether it runs on one plot inside its history, and its handler.
service.METHODS registers every method; the sets the service and its tests use (known,
writing, history, agent) are read from it, never kept by hand, and the README's method
table is printed from it (python -m debrief_tools methods).

A Params model refuses what a method cannot take with the words the service has always
used: each field names its refusal (Refusal), and the first field found wrong says it.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from typing import Any, ClassVar, Self, TypeVar

from pydantic import BaseModel, ConfigDict, PlainValidator, ValidationError

from debrief_tools.rpc import INVALID_PARAMS, RpcError


class Refused(ValueError):
    """A parameter refused with these words, said to the caller as they are."""


@dataclass(frozen=True)
class Refusal:
    """What a Params field's refusal says. {method} is the method's full name, {name} its
    name without debrief/, {field} the field's."""

    message: str


class Params(BaseModel):
    """A method's parameters. Strict, as the service's checks always were: text is a
    string, a whole number is an int (never true or 1.0), a list is a list. Members it
    does not name (store, item, agent, base and the like) are left to the service."""

    model_config = ConfigDict(strict=True, extra="ignore", arbitrary_types_allowed=True)
    # Said when a check across fields refuses (a model validator) without words of its own.
    refusal: ClassVar[str] = "{method} cannot take these parameters"

    @classmethod
    def read(cls, params: dict[str, Any], method: str) -> Self:
        try:
            return cls.model_validate(params)
        except ValidationError as error:
            raise RpcError(INVALID_PARAMS, cls.said(error.errors()[0], method)) from None

    @classmethod
    def said(cls, problem: Any, method: str) -> str:
        cause = (problem.get("ctx") or {}).get("error")
        if isinstance(cause, Refused):
            return str(cause)
        loc = problem.get("loc") or ()
        field = loc[0] if loc and isinstance(loc[0], str) else None
        message = cls.refusal
        if field in cls.model_fields:
            message = next(
                (m.message for m in cls.model_fields[field].metadata if isinstance(m, Refusal)),
                message,
            )
        return (
            message.replace("{method}", method)
            .replace("{name}", method.removeprefix("debrief/"))
            .replace("{field}", field or "")
        )


def _an_object(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("not an object")
    return value


def shaped(model: type[BaseModel]) -> PlainValidator:
    """An object passed on as it is, which the schema describes as model: what reads it
    (the catalogue) checks it and says what is wrong in its own words. Only its being an
    object is checked here, so what is accepted and refused stays the catalogue's."""
    return PlainValidator(_an_object, json_schema_input_type=model)


@dataclass(frozen=True)
class Method:
    """One JSON-RPC method of the tool service."""

    name: str
    does: str  # one line, for the README's method table
    handler: Callable[..., dict[str, Any]]
    params: type[Params] | None = None
    # Changes the plot it names: refused by VS Code on a revision shown read-only
    # (schemas/vectors/service-methods.json), and only on a writable store.
    writes: bool = False
    # Records who made the change: refused without agent, before anything is read (SUB-24).
    agent: bool = False
    # Runs on one plot (store, item, base), inside its history (SUB-21, SUB-28): the
    # handler takes a service.PlotCall rather than the service.
    history: bool = False
    # May send a request over MAX_BODY_BYTES (an exported image).
    large: bool = False

    def read(self, params: dict[str, Any]) -> Params | None:
        """The method's parameters, checked; None for a method that takes none of its own."""
        return self.params.read(params, self.name) if self.params else None

    def input_schema(self) -> dict[str, Any]:
        """A JSON Schema of the parameters this method takes. Not used by tools/list,
        which lists only tools (TL-17): offering these methods there is the product
        owner's choice to make."""
        schema = (
            self.params.model_json_schema() if self.params else {"type": "object", "properties": {}}
        )
        schema.pop("title", None)
        properties: dict[str, Any] = schema.setdefault("properties", {})
        required: list[str] = schema.setdefault("required", [])
        if self.history:
            properties["store"] = {"type": "string", "description": "Store id."}
            properties["item"] = {"type": "string", "description": "Plot id."}
            properties["base"] = {
                "type": "object",
                "required": ["current", "plot_hash"],
                "properties": {"current": {"type": "integer"}, "plot_hash": {"type": "string"}},
            }
            required[:0] = ["store", "item"]
        if self.agent:
            properties["agent"] = {
                "type": "object",
                "required": ["kind", "name"],
                "properties": {
                    "kind": {"enum": ["person", "software_agent"]},
                    "name": {"type": "string"},
                    "model": {"type": "string"},
                },
            }
            required.append("agent")
        return schema


Handler = TypeVar("Handler", bound=Callable[..., dict[str, Any]])


class Methods(Mapping[str, Method]):
    """Every method, by name, in the order registered."""

    def __init__(self) -> None:
        self._methods: dict[str, Method] = {}

    def add(self, method: Method) -> None:
        if method.name in self._methods:
            raise ValueError(f"{method.name} is registered twice")
        if method.writes and not method.history:
            raise ValueError(f"{method.name} changes a plot outside its history")
        self._methods[method.name] = method

    def register(
        self,
        name: str,
        does: str,
        params: type[Params] | None = None,
        **flags: bool,
    ) -> Callable[[Handler], Handler]:
        """A decorator: the function it decorates is the method's handler."""

        def register(handler: Handler) -> Handler:
            self.add(Method(name, does, handler, params, **flags))
            return handler

        return register

    def __getitem__(self, name: str) -> Method:
        return self._methods[name]

    def __iter__(self) -> Iterator[str]:
        return iter(self._methods)

    def __len__(self) -> int:
        return len(self._methods)

    def names(self, **flags: bool) -> frozenset[str]:
        """The methods whose flags (writes, agent, history, large) are as given."""
        return frozenset(
            name
            for name, method in self._methods.items()
            if all(getattr(method, flag) is value for flag, value in flags.items())
        )


def table(methods: Methods) -> str:
    """The README's method table: every method, whether it changes the plot it names,
    whether it needs agent, and what it does."""
    rows = [
        "| Method | Changes the plot | Needs `agent` | Does |",
        "| --- | --- | --- | --- |",
    ]
    for method in methods.values():
        writes = "yes" if method.writes else ""
        agent = "yes" if method.agent else ""
        rows.append(f"| `{method.name}` | {writes} | {agent} | {method.does} |")
    return "\n".join(rows) + "\n"
