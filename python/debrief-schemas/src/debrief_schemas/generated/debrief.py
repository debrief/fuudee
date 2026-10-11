# Generated from schemas/linkml/debrief.yaml by scripts/generate_schemas.py. Do not edit.
from __future__ import annotations

import re
import sys
from datetime import (
    date,
    datetime,
    time
)
from decimal import Decimal
from enum import Enum
from typing import (
    Any,
    ClassVar,
    Literal,
    Optional,
    Union
)

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    RootModel,
    SerializationInfo,
    SerializerFunctionWrapHandler,
    conlist,
    field_validator,
    model_serializer
)


metamodel_version = "1.12.0"
version = "0.0.1"


class ConfiguredBaseModel(BaseModel):
    model_config = ConfigDict(
        serialize_by_alias = True,
        validate_by_name = True,
        validate_assignment = True,
        validate_default = True,
        extra = "forbid",
        arbitrary_types_allowed = True,
        use_enum_values = True,
        strict = False,
    )





class LinkMLMeta(RootModel):
    root: dict[str, Any] = {}
    model_config = ConfigDict(frozen=True)

    def __getattr__(self, key:str):
        return getattr(self.root, key)

    def __getitem__(self, key:str):
        return self.root[key]

    def __setitem__(self, key:str, value):
        self.root[key] = value

    def __contains__(self, key:str) -> bool:
        return key in self.root


linkml_meta = LinkMLMeta({'default_prefix': 'debrief',
     'default_range': 'string',
     'description': 'Boundary types for Debrief v4 plot files (PRN-04). Phase 0 '
                    'LinkML spike: a track with units and provenance, end to end.',
     'id': 'https://debrief.info/schemas/debrief',
     'imports': ['linkml:types'],
     'license': 'EPL-2.0',
     'name': 'debrief',
     'prefixes': {'debrief': {'prefix_prefix': 'debrief',
                              'prefix_reference': 'https://debrief.info/schemas/debrief/'},
                  'geojson': {'prefix_prefix': 'geojson',
                              'prefix_reference': 'https://purl.org/geojson/vocab#'},
                  'linkml': {'prefix_prefix': 'linkml',
                             'prefix_reference': 'https://w3id.org/linkml/'},
                  'prov': {'prefix_prefix': 'prov',
                           'prefix_reference': 'http://www.w3.org/ns/prov#'}},
     'source_file': 'schemas/linkml/debrief.yaml',
     'title': 'Debrief data-file schema',
     'types': {'ContentHash': {'description': 'SHA-256 of a source file, as '
                                              'lowercase hex prefixed "sha256:" '
                                              '(SUB-11).',
                               'from_schema': 'https://debrief.info/schemas/debrief',
                               'name': 'ContentHash',
                               'pattern': '^sha256:[0-9a-f]{64}$',
                               'typeof': 'string'},
               'SchemaVersion': {'description': 'Semantic version of the data-file '
                                                'schema (SUB-12).',
                                 'from_schema': 'https://debrief.info/schemas/debrief',
                                 'name': 'SchemaVersion',
                                 'pattern': '^\\d+\\.\\d+\\.\\d+$',
                                 'typeof': 'string'},
               'UtcTimestamp': {'description': 'Instant in UTC with exactly '
                                               'millisecond precision (SUB-01), '
                                               'for example '
                                               '2026-10-11T09:30:00.000Z.',
                                'from_schema': 'https://debrief.info/schemas/debrief',
                                'name': 'UtcTimestamp',
                                'pattern': '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$',
                                'typeof': 'string'}}} )

class FeatureTypeEnum(str, Enum):
    Feature = "Feature"


class FeatureCollectionTypeEnum(str, Enum):
    FeatureCollection = "FeatureCollection"


class LineStringTypeEnum(str, Enum):
    LineString = "LineString"


class FeatureKindEnum(str, Enum):
    """
    Debrief feature taxonomy, used by tools to declare what they apply to (TL-06).
    """
    track = "track"


class ProvActivityKindEnum(str, Enum):
    import_ = "import"
    tool = "tool"
    edit = "edit"
    delete = "delete"


class SpeedUnitEnum(str, Enum):
    """
    Units a speed may be stored in (UCUM codes, SUB-02).
    """
    mSOLIDUSs = "m/s"
    """
    metres per second
    """
    LEFT_SQUARE_BRACKETkn_iRIGHT_SQUARE_BRACKET = "[kn_i]"
    """
    international knots
    """
    kmSOLIDUSh = "km/h"
    """
    kilometres per hour
    """


class AngleUnitEnum(str, Enum):
    """
    Units an angle may be stored in (UCUM codes, SUB-02).
    """
    deg = "deg"
    """
    degrees
    """
    rad = "rad"
    """
    radians
    """


class AgentKindEnum(str, Enum):
    person = "person"
    software_agent = "software_agent"



class LineStringGeometry(ConfiguredBaseModel):
    """
    GeoJSON LineString (RFC 7946 section 3.1.4). Each position is [longitude, latitude] in WGS84 decimal degrees.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: LineStringTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['LineStringGeometry',
                       'TrackFeature',
                       'DebriefFeatureCollection']} })
    coordinates: conlist(min_length=2, item_type=conlist(min_length=2, max_length=2, item_type=float)) = Field(default=..., json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'minimum_cardinality': 2}, {'exact_cardinality': 2}],
                   'exact_number_dimensions': 2},
         'domain_of': ['LineStringGeometry'],
         'unit': {'ucum_code': 'deg'}} })


class TrackFeature(ConfiguredBaseModel):
    """
    A platform track as a GeoJSON Feature with LineString geometry.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: FeatureTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['LineStringGeometry',
                       'TrackFeature',
                       'DebriefFeatureCollection']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature', 'ProvRecord']} })
    geometry: LineStringGeometry = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature']} })
    properties: TrackProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature']} })


class TrackProperties(ConfiguredBaseModel):
    """
    Per-position values are parallel arrays, one entry per geometry position, in the same order.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: FeatureKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'ProvRecord', 'AgentRef']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'ToolRef', 'AgentRef']} })
    platform_class: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    times: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    speeds: Optional[SpeedSeries] = Field(default=None, description="""Speed over ground at each position.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    courses: Optional[AngleSeries] = Field(default=None, description="""Course over ground at each position, true north, clockwise.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, description="""Feature-level provenance where needed (SUB-18).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'DebriefFeatureCollection']} })

    @field_validator('times')
    def pattern_times(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid times format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid times format: {v}"
            raise ValueError(err_msg)
        return v


class SpeedSeries(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    unit: SpeedUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries']} })
    values: list[float] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries']} })


class AngleSeries(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    unit: AngleUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries']} })
    values: list[float] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries']} })


class DebriefFeatureCollection(ConfiguredBaseModel):
    """
    The unit of analysis (SUB-05), stored as an asset of a STAC item.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief', 'tree_root': True})

    type: FeatureCollectionTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['LineStringGeometry',
                       'TrackFeature',
                       'DebriefFeatureCollection']} })
    schema_version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection']} })
    features: list[TrackFeature] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection']} })
    provenance: list[ProvRecord] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'DebriefFeatureCollection']} })

    @field_validator('schema_version')
    def pattern_schema_version(cls, v):
        pattern=re.compile(r"^\d+\.\d+\.\d+$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid schema_version format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid schema_version format: {v}"
            raise ValueError(err_msg)
        return v


class ProvRecord(ConfiguredBaseModel):
    """
    One recorded operation (SUB-18, SUB-19).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'class_uri': 'prov:Activity',
         'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature', 'ProvRecord']} })
    kind: ProvActivityKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'ProvRecord', 'AgentRef']} })
    started_at: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    ended_at: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    tool: Optional[ToolRef] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    agent: AgentRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    used: Optional[list[SourceRef]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    seed: Optional[int] = Field(default=None, description="""Random seed, for operations that use randomness (SUB-20).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    notes: Optional[list[str]] = Field(default=None, description="""Free-text notes such as truncations or omitted content (EXT-14, EXT-15).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })

    @field_validator('started_at')
    def pattern_started_at(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid started_at format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid started_at format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('ended_at')
    def pattern_ended_at(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid ended_at format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid ended_at format: {v}"
            raise ValueError(err_msg)
        return v


class ToolRef(ConfiguredBaseModel):
    """
    The tool and version that performed an operation (SUB-24).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'ToolRef', 'AgentRef']} })
    version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToolRef']} })


class AgentRef(ConfiguredBaseModel):
    """
    Who made a change; for software agents, which model (SUB-24).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'class_uri': 'prov:Agent',
         'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: AgentKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'ProvRecord', 'AgentRef']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'ToolRef', 'AgentRef']} })
    model: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AgentRef']} })


class SourceRef(ConfiguredBaseModel):
    """
    An immutable source file read by an operation (SUB-10, SUB-11).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'class_uri': 'prov:Entity',
         'from_schema': 'https://debrief.info/schemas/debrief'})

    href: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef']} })
    content_hash: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef']} })

    @field_validator('content_hash')
    def pattern_content_hash(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid content_hash format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid content_hash format: {v}"
            raise ValueError(err_msg)
        return v


# Model rebuild
# see https://pydantic-docs.helpmanual.io/usage/models/#rebuilding-a-model
LineStringGeometry.model_rebuild()
TrackFeature.model_rebuild()
TrackProperties.model_rebuild()
SpeedSeries.model_rebuild()
AngleSeries.model_rebuild()
DebriefFeatureCollection.model_rebuild()
ProvRecord.model_rebuild()
ToolRef.model_rebuild()
AgentRef.model_rebuild()
SourceRef.model_rebuild()
