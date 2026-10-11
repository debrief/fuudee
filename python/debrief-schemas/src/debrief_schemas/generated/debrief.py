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
version = "0.0.4"


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
     'description': 'Every type that crosses a process or language boundary in '
                    'Debrief v4, generated into Python, JSON Schema and TypeScript '
                    '(PRN-04). The version below is the data-file schema version '
                    '(SUB-12); see schemas/CHANGELOG.md.',
     'id': 'https://debrief.info/schemas/debrief',
     'license': 'EPL-2.0',
     'name': 'debrief',
     'prefixes': {'debrief': {'prefix_prefix': 'debrief',
                              'prefix_reference': 'https://debrief.info/schemas/debrief/'},
                  'geojson': {'prefix_prefix': 'geojson',
                              'prefix_reference': 'https://purl.org/geojson/vocab#'},
                  'linkml': {'prefix_prefix': 'linkml',
                             'prefix_reference': 'https://w3id.org/linkml/'},
                  'prov': {'prefix_prefix': 'prov',
                           'prefix_reference': 'http://www.w3.org/ns/prov#'},
                  'schema': {'prefix_prefix': 'schema',
                             'prefix_reference': 'http://schema.org/'},
                  'shex': {'prefix_prefix': 'shex',
                           'prefix_reference': 'http://www.w3.org/ns/shex#'},
                  'stac': {'prefix_prefix': 'stac',
                           'prefix_reference': 'https://stacspec.org/'},
                  'xsd': {'prefix_prefix': 'xsd',
                          'prefix_reference': 'http://www.w3.org/2001/XMLSchema#'}},
     'source_file': 'schemas/linkml/debrief.yaml',
     'title': 'Debrief data-file schema',
     'types': {'ContentHash': {'description': 'SHA-256 of a file, as lowercase hex '
                                              'prefixed "sha256:" (SUB-11).',
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
                                'typeof': 'string'},
               'boolean': {'base': 'Bool',
                           'description': 'A binary (true or false) value',
                           'exact_mappings': ['schema:Boolean'],
                           'from_schema': 'https://debrief.info/schemas/debrief',
                           'name': 'boolean',
                           'notes': ['If you are authoring schemas in LinkML YAML, '
                                     'the type is referenced with the lower case '
                                     '"boolean".'],
                           'repr': 'bool',
                           'uri': 'xsd:boolean'},
               'curie': {'base': 'Curie',
                         'comments': ['in RDF serializations this MUST be expanded '
                                      'to a URI',
                                      'in non-RDF serializations MAY be serialized '
                                      'as the compact representation'],
                         'conforms_to': 'https://www.w3.org/TR/curie/',
                         'description': 'a compact URI',
                         'from_schema': 'https://debrief.info/schemas/debrief',
                         'name': 'curie',
                         'notes': ['If you are authoring schemas in LinkML YAML, '
                                   'the type is referenced with the lower case '
                                   '"curie".'],
                         'repr': 'str',
                         'uri': 'xsd:string'},
               'date': {'base': 'XSDDate',
                        'description': 'a date (year, month and day) in an '
                                       'idealized calendar',
                        'exact_mappings': ['schema:Date'],
                        'from_schema': 'https://debrief.info/schemas/debrief',
                        'name': 'date',
                        'notes': ["URI is dateTime because OWL reasoners don't "
                                  'work with straight date or time',
                                  'If you are authoring schemas in LinkML YAML, '
                                  'the type is referenced with the lower case '
                                  '"date".'],
                        'repr': 'str',
                        'uri': 'xsd:date'},
               'date_or_datetime': {'base': 'str',
                                    'description': 'Either a date or a datetime',
                                    'from_schema': 'https://debrief.info/schemas/debrief',
                                    'name': 'date_or_datetime',
                                    'notes': ['If you are authoring schemas in '
                                              'LinkML YAML, the type is referenced '
                                              'with the lower case '
                                              '"date_or_datetime".'],
                                    'repr': 'str',
                                    'uri': 'linkml:DateOrDatetime'},
               'datetime': {'base': 'XSDDateTime',
                            'description': 'The combination of a date and time',
                            'exact_mappings': ['schema:DateTime'],
                            'from_schema': 'https://debrief.info/schemas/debrief',
                            'name': 'datetime',
                            'notes': ['If you are authoring schemas in LinkML '
                                      'YAML, the type is referenced with the lower '
                                      'case "datetime".'],
                            'repr': 'str',
                            'uri': 'xsd:dateTime'},
               'decimal': {'base': 'Decimal',
                           'broad_mappings': ['schema:Number'],
                           'description': 'A real number with arbitrary precision '
                                          'that conforms to the xsd:decimal '
                                          'specification',
                           'from_schema': 'https://debrief.info/schemas/debrief',
                           'name': 'decimal',
                           'notes': ['If you are authoring schemas in LinkML YAML, '
                                     'the type is referenced with the lower case '
                                     '"decimal".'],
                           'uri': 'xsd:decimal'},
               'double': {'base': 'float',
                          'close_mappings': ['schema:Float'],
                          'description': 'A real number that conforms to the '
                                         'xsd:double specification',
                          'from_schema': 'https://debrief.info/schemas/debrief',
                          'name': 'double',
                          'notes': ['If you are authoring schemas in LinkML YAML, '
                                    'the type is referenced with the lower case '
                                    '"double".'],
                          'uri': 'xsd:double'},
               'float': {'base': 'float',
                         'description': 'A real number that conforms to the '
                                        'xsd:float specification',
                         'exact_mappings': ['schema:Float'],
                         'from_schema': 'https://debrief.info/schemas/debrief',
                         'name': 'float',
                         'notes': ['If you are authoring schemas in LinkML YAML, '
                                   'the type is referenced with the lower case '
                                   '"float".'],
                         'uri': 'xsd:float'},
               'integer': {'base': 'int',
                           'description': 'An integer',
                           'exact_mappings': ['schema:Integer'],
                           'from_schema': 'https://debrief.info/schemas/debrief',
                           'name': 'integer',
                           'notes': ['If you are authoring schemas in LinkML YAML, '
                                     'the type is referenced with the lower case '
                                     '"integer".'],
                           'uri': 'xsd:integer'},
               'jsonpath': {'base': 'str',
                            'conforms_to': 'https://www.ietf.org/archive/id/draft-goessner-dispatch-jsonpath-00.html',
                            'description': 'A string encoding a JSON Path. The '
                                           'value of the string MUST conform to '
                                           'JSON Point syntax and SHOULD '
                                           'dereference to zero or more valid '
                                           'objects within the current instance '
                                           'document when encoded in tree form.',
                            'from_schema': 'https://debrief.info/schemas/debrief',
                            'name': 'jsonpath',
                            'notes': ['If you are authoring schemas in LinkML '
                                      'YAML, the type is referenced with the lower '
                                      'case "jsonpath".'],
                            'repr': 'str',
                            'uri': 'xsd:string'},
               'jsonpointer': {'base': 'str',
                               'conforms_to': 'https://datatracker.ietf.org/doc/html/rfc6901',
                               'description': 'A string encoding a JSON Pointer. '
                                              'The value of the string MUST '
                                              'conform to JSON Point syntax and '
                                              'SHOULD dereference to a valid '
                                              'object within the current instance '
                                              'document when encoded in tree form.',
                               'from_schema': 'https://debrief.info/schemas/debrief',
                               'name': 'jsonpointer',
                               'notes': ['If you are authoring schemas in LinkML '
                                         'YAML, the type is referenced with the '
                                         'lower case "jsonpointer".'],
                               'repr': 'str',
                               'uri': 'xsd:string'},
               'ncname': {'base': 'NCName',
                          'description': 'Prefix part of CURIE',
                          'from_schema': 'https://debrief.info/schemas/debrief',
                          'name': 'ncname',
                          'notes': ['If you are authoring schemas in LinkML YAML, '
                                    'the type is referenced with the lower case '
                                    '"ncname".'],
                          'repr': 'str',
                          'uri': 'xsd:string'},
               'nodeidentifier': {'base': 'NodeIdentifier',
                                  'description': 'A URI, CURIE or BNODE that '
                                                 'represents a node in a model.',
                                  'from_schema': 'https://debrief.info/schemas/debrief',
                                  'name': 'nodeidentifier',
                                  'notes': ['If you are authoring schemas in '
                                            'LinkML YAML, the type is referenced '
                                            'with the lower case '
                                            '"nodeidentifier".'],
                                  'repr': 'str',
                                  'uri': 'shex:nonLiteral'},
               'objectidentifier': {'base': 'ElementIdentifier',
                                    'comments': ['Used for inheritance and type '
                                                 'checking'],
                                    'description': 'A URI or CURIE that represents '
                                                   'an object in the model.',
                                    'from_schema': 'https://debrief.info/schemas/debrief',
                                    'name': 'objectidentifier',
                                    'notes': ['If you are authoring schemas in '
                                              'LinkML YAML, the type is referenced '
                                              'with the lower case '
                                              '"objectidentifier".'],
                                    'repr': 'str',
                                    'uri': 'shex:iri'},
               'sparqlpath': {'base': 'str',
                              'conforms_to': 'https://www.w3.org/TR/sparql11-query/#propertypaths',
                              'description': 'A string encoding a SPARQL Property '
                                             'Path. The value of the string MUST '
                                             'conform to SPARQL syntax and SHOULD '
                                             'dereference to zero or more valid '
                                             'objects within the current instance '
                                             'document when encoded as RDF.',
                              'from_schema': 'https://debrief.info/schemas/debrief',
                              'name': 'sparqlpath',
                              'notes': ['If you are authoring schemas in LinkML '
                                        'YAML, the type is referenced with the '
                                        'lower case "sparqlpath".'],
                              'repr': 'str',
                              'uri': 'xsd:string'},
               'string': {'base': 'str',
                          'description': 'A character string',
                          'exact_mappings': ['schema:Text'],
                          'from_schema': 'https://debrief.info/schemas/debrief',
                          'name': 'string',
                          'notes': ['In RDF serializations, a slot with range of '
                                    'string is treated as a literal or type '
                                    'xsd:string. If you are authoring schemas in '
                                    'LinkML YAML, the type is referenced with the '
                                    'lower case "string".'],
                          'uri': 'xsd:string'},
               'time': {'base': 'XSDTime',
                        'description': 'A time object represents a (local) time of '
                                       'day, independent of any particular day',
                        'exact_mappings': ['schema:Time'],
                        'from_schema': 'https://debrief.info/schemas/debrief',
                        'name': 'time',
                        'notes': ['URI is dateTime because OWL reasoners do not '
                                  'work with straight date or time',
                                  'If you are authoring schemas in LinkML YAML, '
                                  'the type is referenced with the lower case '
                                  '"time".'],
                        'repr': 'str',
                        'uri': 'xsd:time'},
               'uri': {'base': 'URI',
                       'close_mappings': ['schema:URL'],
                       'comments': ['in RDF serializations a slot with range of '
                                    'uri is treated as a literal or type '
                                    'xsd:anyURI unless it is an identifier or a '
                                    'reference to an identifier, in which case it '
                                    'is translated directly to a node'],
                       'conforms_to': 'https://www.ietf.org/rfc/rfc3987.txt',
                       'description': 'a complete URI',
                       'from_schema': 'https://debrief.info/schemas/debrief',
                       'name': 'uri',
                       'notes': ['If you are authoring schemas in LinkML YAML, the '
                                 'type is referenced with the lower case "uri".'],
                       'repr': 'str',
                       'uri': 'xsd:anyURI'},
               'uriorcurie': {'base': 'URIorCURIE',
                              'description': 'a URI or a CURIE',
                              'from_schema': 'https://debrief.info/schemas/debrief',
                              'name': 'uriorcurie',
                              'notes': ['If you are authoring schemas in LinkML '
                                        'YAML, the type is referenced with the '
                                        'lower case "uriorcurie".'],
                              'repr': 'str',
                              'uri': 'xsd:anyURI'}}} )

class QuantityKindEnum(str, Enum):
    """
    Physical quantity kinds that carry units (SUB-02).
    """
    length = "length"
    speed = "speed"
    angle = "angle"
    duration = "duration"


class LengthUnitEnum(str, Enum):
    """
    Units a length may be stored in (UCUM codes).
    """
    m = "m"
    """
    metres
    """
    km = "km"
    """
    kilometres
    """
    LEFT_SQUARE_BRACKETnmi_iRIGHT_SQUARE_BRACKET = "[nmi_i]"
    """
    international nautical miles
    """
    LEFT_SQUARE_BRACKETyd_iRIGHT_SQUARE_BRACKET = "[yd_i]"
    """
    international yards
    """
    LEFT_SQUARE_BRACKETft_iRIGHT_SQUARE_BRACKET = "[ft_i]"
    """
    international feet
    """


class SpeedUnitEnum(str, Enum):
    """
    Units a speed may be stored in (UCUM codes).
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
    Units an angle may be stored in (UCUM codes).
    """
    deg = "deg"
    """
    degrees
    """
    rad = "rad"
    """
    radians
    """


class DurationUnitEnum(str, Enum):
    """
    Units a duration may be stored in (UCUM codes).
    """
    ms = "ms"
    """
    milliseconds
    """
    s = "s"
    """
    seconds
    """
    min = "min"
    """
    minutes
    """
    h = "h"
    """
    hours
    """


class PointTypeEnum(str, Enum):
    Point = "Point"


class LineStringTypeEnum(str, Enum):
    LineString = "LineString"


class PolygonTypeEnum(str, Enum):
    Polygon = "Polygon"


class ProvActivityKindEnum(str, Enum):
    import_ = "import"
    tool = "tool"
    edit = "edit"
    delete = "delete"
    migration = "migration"
    """
    Schema migration on open (SUB-13).
    """


class AgentKindEnum(str, Enum):
    person = "person"
    software_agent = "software_agent"


class FeatureTypeEnum(str, Enum):
    Feature = "Feature"


class FeatureCollectionTypeEnum(str, Enum):
    FeatureCollection = "FeatureCollection"


class FeatureKindEnum(str, Enum):
    """
    The feature taxonomy (TL-06).
    """
    track = "track"
    annotation = "annotation"
    sensor_observations = "sensor_observations"


class TrackKindEnum(str, Enum):
    track = "track"


class AnnotationKindEnum(str, Enum):
    annotation = "annotation"


class SensorObservationsKindEnum(str, Enum):
    sensor_observations = "sensor_observations"


class AnnotationStyleEnum(str, Enum):
    """
    What an annotation depicts (CAP-03, CAP-04).
    """
    label = "label"
    shape = "shape"
    chart_furniture = "chart_furniture"
    note = "note"
    """
    Free-text note, usually time-only.
    """
    time_period = "time_period"
    """
    A period of interest, time-only (TL-11).
    """


class ObservationTypeEnum(str, Enum):
    """
    Sensor observation types Debrief imports (CAP-22). Frequency is never imported.
    """
    bearing = "bearing"
    ambiguous_bearing = "ambiguous_bearing"
    """
    Towed-array bearing with two candidate sides.
    """


class PayloadFormatEnum(str, Enum):
    """
    Standard formats for opaque payloads (CON-02).
    """
    arrow = "arrow"
    parquet = "parquet"
    geojson = "geojson"


class CatalogTypeEnum(str, Enum):
    Catalog = "Catalog"


class ItemTypeEnum(str, Enum):
    Feature = "Feature"


class AssetKindEnum(str, Enum):
    """
    What an asset holds in Debrief terms.
    """
    plot = "plot"
    """
    The plot FeatureCollection (SUB-05).
    """
    source = "source"
    """
    An immutable imported source file (SUB-10).
    """
    supporting_file = "supporting_file"
    """
    Video, imagery, acoustic files and the like (SUB-06).
    """
    payload = "payload"
    """
    An opaque observation payload (CON-02).
    """
    result = "result"
    """
    A saved non-spatial result (TL-13, CAP-26).
    """
    measure_group = "measure_group"
    """
    A measure group definition (CAP-07).
    """


class ParameterKindEnum(str, Enum):
    """
    Parameter kinds Debrief can build a form for (TL-07).
    """
    number = "number"
    integer = "integer"
    string = "string"
    boolean = "boolean"
    choice = "choice"
    """
    One of a fixed list of strings.
    """
    quantity = "quantity"
    """
    A number with a unit of the declared quantity kind.
    """
    time = "time"
    """
    A UtcTimestamp.
    """


class ToolOutputKindEnum(str, Enum):
    """
    What a tool may return (TL-11).
    """
    new_features = "new_features"
    modified_features = "modified_features"
    deleted_features = "deleted_features"
    non_spatial = "non_spatial"
    named_sets = "named_sets"
    state_change = "state_change"


class ResultPresentationEnum(str, Enum):
    number = "number"
    table = "table"
    graph = "graph"


class PositionNotationEnum(str, Enum):
    dd = "dd"
    """
    Decimal degrees: 50.335°N 004.120°W
    """
    dm = "dm"
    """
    Degrees and decimal minutes: 50°20.120'N 004°07.210'W
    """
    dms = "dms"
    """
    Degrees, minutes and seconds: 50°20'07.2"N 004°07'12.6"W
    """


class TimeStyleEnum(str, Enum):
    time = "time"
    """
    Time of day: 09:30:05Z
    """
    date_time = "date_time"
    """
    Date and time: 11 Oct 2026 09:30:05Z
    """
    dtg = "dtg"
    """
    Military date-time group, always Zulu: 110930Z OCT 26
    """



class Length(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length', 'Speed', 'Angle', 'Duration', 'ParameterValue']} })
    unit: LengthUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'SpeedSeries',
                       'AngleSeries',
                       'PayloadColumn',
                       'ResultColumn']} })


class Speed(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length', 'Speed', 'Angle', 'Duration', 'ParameterValue']} })
    unit: SpeedUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'SpeedSeries',
                       'AngleSeries',
                       'PayloadColumn',
                       'ResultColumn']} })


class Angle(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length', 'Speed', 'Angle', 'Duration', 'ParameterValue']} })
    unit: AngleUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'SpeedSeries',
                       'AngleSeries',
                       'PayloadColumn',
                       'ResultColumn']} })


class Duration(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length', 'Speed', 'Angle', 'Duration', 'ParameterValue']} })
    unit: DurationUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'SpeedSeries',
                       'AngleSeries',
                       'PayloadColumn',
                       'ResultColumn']} })


class SpeedSeries(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    unit: SpeedUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'SpeedSeries',
                       'AngleSeries',
                       'PayloadColumn',
                       'ResultColumn']} })
    values: list[float] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries']} })


class AngleSeries(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    unit: AngleUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'SpeedSeries',
                       'AngleSeries',
                       'PayloadColumn',
                       'ResultColumn']} })
    values: list[float] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries']} })


class TimeRange(ConfiguredBaseModel):
    """
    A closed interval of time. Start shall not be after end.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    start: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange']} })
    end: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange']} })

    @field_validator('start')
    def pattern_start(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid start format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid start format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('end')
    def pattern_end(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid end format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid end format: {v}"
            raise ValueError(err_msg)
        return v


class ParameterValue(ConfiguredBaseModel):
    """
    A tool parameter value as supplied or recorded (TL-07, SUB-19). Scalars, or a quantity with its unit.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    value: Union[Angle, Duration, Length, Speed, bool, float, str] = Field(default=..., json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'float'},
                    {'range': 'string'},
                    {'range': 'boolean'},
                    {'range': 'Length'},
                    {'range': 'Speed'},
                    {'range': 'Angle'},
                    {'range': 'Duration'}],
         'domain_of': ['Length', 'Speed', 'Angle', 'Duration', 'ParameterValue']} })

    @field_validator('name')
    def pattern_name(cls, v):
        pattern=re.compile(r"^[a-z][a-z0-9_]*$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid name format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid name format: {v}"
            raise ValueError(err_msg)
        return v


class PointGeometry(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: PointTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    coordinates: conlist(min_length=2, max_length=2, item_type=float) = Field(default=..., json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 2}],
                   'exact_number_dimensions': 1},
         'domain_of': ['PointGeometry', 'LineStringGeometry', 'PolygonGeometry']} })


class LineStringGeometry(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: LineStringTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    coordinates: conlist(min_length=2, item_type=conlist(min_length=2, max_length=2, item_type=float)) = Field(default=..., json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'minimum_cardinality': 2}, {'exact_cardinality': 2}],
                   'exact_number_dimensions': 2},
         'domain_of': ['PointGeometry', 'LineStringGeometry', 'PolygonGeometry']} })


class PolygonGeometry(ConfiguredBaseModel):
    """
    Linear rings; the first is the exterior. Each ring is closed (first position equals last).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: PolygonTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    coordinates: conlist(min_length=1, item_type=conlist(min_length=4, item_type=conlist(min_length=2, max_length=2, item_type=float))) = Field(default=..., json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'minimum_cardinality': 1},
                                  {'minimum_cardinality': 4},
                                  {'exact_cardinality': 2}],
                   'exact_number_dimensions': 3},
         'domain_of': ['PointGeometry', 'LineStringGeometry', 'PolygonGeometry']} })


class ProvRecord(ConfiguredBaseModel):
    """
    One recorded operation (SUB-18, SUB-19).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'class_uri': 'prov:Activity',
         'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog']} })
    kind: ProvActivityKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'ParameterDeclaration']} })
    started_at: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    ended_at: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    tool: Optional[ToolRef] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    agent: AgentRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    parameters: Optional[list[ParameterValue]] = Field(default=None, description="""Parameter values the operation ran with, so replay can repeat it (SUB-19).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'ToolDeclaration']} })
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

    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToolRef', 'InnerSchemaRef', 'ToolDeclaration']} })


class AgentRef(ConfiguredBaseModel):
    """
    Who made a change; for software agents, which model (SUB-24).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'class_uri': 'prov:Agent',
         'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: AgentKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'ParameterDeclaration']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    model: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AgentRef']} })


class SourceRef(ConfiguredBaseModel):
    """
    An immutable source file read by an operation (SUB-10, SUB-11).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'class_uri': 'prov:Entity',
         'from_schema': 'https://debrief.info/schemas/debrief'})

    href: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef', 'StacLink', 'StacAsset']} })
    content_hash: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef']} })

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


class TrackFeature(ConfiguredBaseModel):
    """
    A platform track. Per-position values are parallel arrays matching the geometry.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: FeatureTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog']} })
    geometry: LineStringGeometry = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'StacItem']} })
    properties: TrackProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'StacItem']} })


class TrackProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: TrackKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'ParameterDeclaration']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    platform_class: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    times: list[str] = Field(default=..., description="""One per position, non-decreasing.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    speeds: Optional[SpeedSeries] = Field(default=None, description="""Speed over ground at each position.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    courses: Optional[AngleSeries] = Field(default=None, description="""Course over ground at each position, true north, clockwise.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    style: Optional[TrackStyle] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'AnnotationProperties']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, description="""Feature-level provenance where needed (SUB-18).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'DebriefFeatureCollection']} })

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


class TrackStyle(ConfiguredBaseModel):
    """
    How a track is drawn. Data colours do not change with the theme (DEV-07). Presentation only: changes are undoable but not recorded in provenance (SUB-22).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    colour: str = Field(default=..., description="""Lower-case hex RGB, for example \"#e01c3e\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle']} })
    legacy_symbology: Optional[str] = Field(default=None, description="""The REP symbology code the colour came from, such as \"@C\", kept for export.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle']} })

    @field_validator('colour')
    def pattern_colour(cls, v):
        pattern=re.compile(r"^#[0-9a-f]{6}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid colour format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid colour format: {v}"
            raise ValueError(err_msg)
        return v


class AnnotationFeature(ConfiguredBaseModel):
    """
    Shapes, labels and chart furniture as ordinary GeoJSON (CAP-03). An annotation with only a time has null geometry and shall give a time or a time range (CAP-04).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: FeatureTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog']} })
    geometry: Optional[Union[LineStringGeometry, PointGeometry, PolygonGeometry]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'PointGeometry'},
                    {'range': 'LineStringGeometry'},
                    {'range': 'PolygonGeometry'}],
         'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'StacItem']} })
    properties: AnnotationProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'StacItem']} })


class AnnotationProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: AnnotationKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'ParameterDeclaration']} })
    style: AnnotationStyleEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'AnnotationProperties']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    text: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties']} })
    time: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'SharedState', 'SharedStateChange']} })
    time_range: Optional[TimeRange] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'SensorObservationsProperties']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'DebriefFeatureCollection']} })

    @field_validator('time')
    def pattern_time(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid time format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid time format: {v}"
            raise ValueError(err_msg)
        return v


class SensorObservationsFeature(ConfiguredBaseModel):
    """
    A set of sensor observations, such as weeks of bearings, held as an opaque payload (CON-02, NFR-06). Geometry is null; positions come from the host track at each observation time.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: FeatureTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog']} })
    geometry: Optional[PointGeometry] = Field(default=None, description="""Always null.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'StacItem']} })
    properties: SensorObservationsProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'StacItem']} })


class SensorObservationsProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: SensorObservationsKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'ParameterDeclaration']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    sensor_name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    host_track_id: str = Field(default=..., description="""The track carrying the sensor.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    observation_type: ObservationTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    time_range: TimeRange = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'SensorObservationsProperties']} })
    observation_count: int = Field(default=..., ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    payload: PayloadRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'DebriefFeatureCollection']} })


class PayloadRef(ConfiguredBaseModel):
    """
    Envelope for data LinkML expresses badly (CON-02): the payload's format, a versioned reference to its inner schema, units, CRS and time reference.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    href: str = Field(default=..., description="""Path relative to the referencing file.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef', 'StacLink', 'StacAsset']} })
    format: PayloadFormatEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef']} })
    inner_schema: InnerSchemaRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef']} })
    columns: list[PayloadColumn] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef', 'NonSpatialResult']} })
    crs: str = Field(default=..., description="""Coordinate reference system of any positions in the payload.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef']} })
    time_reference: str = Field(default=..., description="""Time scale of any times in the payload. Always UTC (SUB-01).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef']} })
    content_hash: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef']} })

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


class InnerSchemaRef(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToolRef', 'InnerSchemaRef', 'ToolDeclaration']} })

    @field_validator('version')
    def pattern_version(cls, v):
        pattern=re.compile(r"^\d+\.\d+\.\d+$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid version format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid version format: {v}"
            raise ValueError(err_msg)
        return v


class PayloadColumn(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    quantity_kind: Optional[QuantityKindEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadColumn', 'ParameterDeclaration', 'ResultColumn']} })
    unit: Optional[str] = Field(default=None, description="""UCUM unit code, required when quantity_kind is given.""", json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'SpeedSeries',
                       'AngleSeries',
                       'PayloadColumn',
                       'ResultColumn']} })


class NamedSet(ConfiguredBaseModel):
    """
    A saved, reusable selection (TL-11).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    feature_ids: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NamedSet', 'Selection']} })


class DebriefFeatureCollection(ConfiguredBaseModel):
    """
    The unit of analysis (SUB-05), stored as an asset of a STAC item.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief', 'tree_root': True})

    type: FeatureCollectionTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    schema_version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection']} })
    features: list[Union[AnnotationFeature, SensorObservationsFeature, TrackFeature]] = Field(default=..., json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'}],
         'domain_of': ['DebriefFeatureCollection']} })
    named_sets: Optional[list[NamedSet]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection', 'ToolResult']} })
    provenance: list[ProvRecord] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'DebriefFeatureCollection']} })

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


class StacLink(ConfiguredBaseModel):
    """
    Parent links are authoritative; child links are a hint only and are never trusted (SUB-23).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    rel: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['StacLink']} })
    href: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef', 'StacLink', 'StacAsset']} })
    type: Optional[str] = Field(default=None, description="""Media type.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult']} })


class StacAsset(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'extra_slots': {'allowed': True},
         'from_schema': 'https://debrief.info/schemas/debrief'})

    key: str = Field(default=..., description="""The asset's key in the item's assets object; not written inside the asset.""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacAsset']} })
    href: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef', 'StacLink', 'StacAsset']} })
    type: Optional[str] = Field(default=None, description="""Media type.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult']} })
    roles: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['StacAsset']} })
    debrief_asset_kind: AssetKindEnum = Field(default=..., alias="debrief:asset_kind", json_schema_extra = { "linkml_meta": {'domain_of': ['StacAsset']} })
    debrief_content_hash: Optional[str] = Field(default=None, alias="debrief:content_hash", description="""Required for sources (SUB-11).""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacAsset']} })

    @field_validator('debrief_content_hash')
    def pattern_debrief_content_hash(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid debrief_content_hash format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid debrief_content_hash format: {v}"
            raise ValueError(err_msg)
        return v


class StacItemProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'extra_slots': {'allowed': True},
         'from_schema': 'https://debrief.info/schemas/debrief'})

    datetime: Optional[str] = Field(default=None, description="""Null when start_datetime and end_datetime are given.""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties']} })
    start_datetime: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties']} })
    end_datetime: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties']} })
    title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult']} })
    description: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties', 'StacCatalog']} })
    debrief_schema_version: str = Field(default=..., alias="debrief:schema_version", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties', 'StacCatalog']} })
    debrief_participants: Optional[list[str]] = Field(default=None, alias="debrief:participants", description="""Platform names, for catalogue search (SUB-16).""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties']} })

    @field_validator('datetime')
    def pattern_datetime(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid datetime format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid datetime format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('start_datetime')
    def pattern_start_datetime(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid start_datetime format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid start_datetime format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('end_datetime')
    def pattern_end_datetime(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid end_datetime format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid end_datetime format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('debrief_schema_version')
    def pattern_debrief_schema_version(cls, v):
        pattern=re.compile(r"^\d+\.\d+\.\d+$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid debrief_schema_version format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid debrief_schema_version format: {v}"
            raise ValueError(err_msg)
        return v


class StacItem(ConfiguredBaseModel):
    """
    A STAC item. A plot is the item's \"plot\" asset (SUB-05, SUB-06).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: ItemTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    stac_version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['StacItem', 'StacCatalog']} })
    stac_extensions: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['StacItem', 'StacCatalog']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog']} })
    geometry: Optional[Union[LineStringGeometry, PointGeometry, PolygonGeometry]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'PointGeometry'},
                    {'range': 'LineStringGeometry'},
                    {'range': 'PolygonGeometry'}],
         'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'StacItem']} })
    bbox: Optional[conlist(min_length=4, max_length=4, item_type=float)] = Field(default=None, description="""[west, south, east, north] in WGS84 degrees.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 4}],
                   'exact_number_dimensions': 1},
         'domain_of': ['StacItem', 'Viewport']} })
    properties: StacItemProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'StacItem']} })
    links: list[StacLink] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['StacItem', 'StacCatalog']} })
    assets: dict[str, StacAsset] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['StacItem']} })


class StacCatalog(ConfiguredBaseModel):
    """
    A static, file-based STAC catalogue (SUB-15). Holds one protection level (SEC-02).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: CatalogTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    stac_version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['StacItem', 'StacCatalog']} })
    stac_extensions: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['StacItem', 'StacCatalog']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog']} })
    title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult']} })
    description: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties', 'StacCatalog']} })
    links: list[StacLink] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['StacItem', 'StacCatalog']} })
    debrief_schema_version: str = Field(default=..., alias="debrief:schema_version", description="""The newest data-file schema this catalogue holds (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties', 'StacCatalog']} })

    @field_validator('debrief_schema_version')
    def pattern_debrief_schema_version(cls, v):
        pattern=re.compile(r"^\d+\.\d+\.\d+$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid debrief_schema_version format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid debrief_schema_version format: {v}"
            raise ValueError(err_msg)
        return v


class TimeState(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    current: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState']} })
    range: TimeRange = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState']} })

    @field_validator('current')
    def pattern_current(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid current format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid current format: {v}"
            raise ValueError(err_msg)
        return v


class Selection(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    plot: str = Field(default=..., description="""Href of the plot the selection belongs to.""", json_schema_extra = { "linkml_meta": {'domain_of': ['Selection']} })
    feature_ids: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NamedSet', 'Selection']} })


class Viewport(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    bbox: conlist(min_length=4, max_length=4, item_type=float) = Field(default=..., description="""[west, south, east, north] in WGS84 degrees, independent of display projection.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 4}],
                   'exact_number_dimensions': 1},
         'domain_of': ['StacItem', 'Viewport']} })


class SharedState(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    time: TimeState = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'SharedState', 'SharedStateChange']} })
    selection: Selection = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange']} })
    viewport: Viewport = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange']} })


class SharedStateChange(ConfiguredBaseModel):
    """
    A change to some or all of shared state, as set by a view or returned by a tool (TL-10, TL-11).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    time: Optional[TimeState] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'SharedState', 'SharedStateChange']} })
    selection: Optional[Selection] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange']} })
    viewport: Optional[Viewport] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange']} })


class ToolDeclaration(ConfiguredBaseModel):
    """
    How a tool describes itself to Debrief, agents and hooks (TL-04, TL-06).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., description="""Dotted, unique across loaded libraries, for example core.smooth_track.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToolRef', 'InnerSchemaRef', 'ToolDeclaration']} })
    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult']} })
    explanation: str = Field(default=..., description="""Short user-facing explanation of what the tool does (CAP-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration', 'ParameterDeclaration']} })
    judgement: Optional[str] = Field(default=None, description="""Any judgement the tool involves, shown on its form (CAP-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration']} })
    applies_to: list[str] = Field(default=..., description="""Feature kinds from the taxonomy, or \"*\" for any (TL-06). Debrief offers a tool only if every selected item matches (TL-08).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration']} })
    min_selected: Optional[int] = Field(default=1, ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration'], 'ifabsent': 'int(1)'} })
    max_selected: Optional[int] = Field(default=None, ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration']} })
    parameters: Optional[list[ParameterDeclaration]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'ToolDeclaration']} })
    outputs: list[ToolOutputKindEnum] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration']} })
    uses_randomness: Optional[bool] = Field(default=None, description="""When true, Debrief records the seed (SUB-20).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration']} })

    @field_validator('name')
    def pattern_name(cls, v):
        pattern=re.compile(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid name format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid name format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('applies_to')
    def pattern_applies_to(cls, v):
        pattern=re.compile(r"^(\*|[a-z_]+)$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid applies_to format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid applies_to format: {v}"
            raise ValueError(err_msg)
        return v


class ParameterDeclaration(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult']} })
    explanation: Optional[str] = Field(default=None, description="""Shown beside the field on the form (CAP-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration', 'ParameterDeclaration']} })
    kind: ParameterKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'ParameterDeclaration']} })
    quantity_kind: Optional[QuantityKindEnum] = Field(default=None, description="""Required when kind is quantity.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadColumn', 'ParameterDeclaration', 'ResultColumn']} })
    required: Optional[bool] = Field(default=True, json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterDeclaration'], 'ifabsent': 'True'} })
    default: Optional[Union[Angle, Duration, Length, Speed, bool, float, str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'float'},
                    {'range': 'string'},
                    {'range': 'boolean'},
                    {'range': 'Length'},
                    {'range': 'Speed'},
                    {'range': 'Angle'},
                    {'range': 'Duration'}],
         'domain_of': ['ParameterDeclaration']} })
    minimum: Optional[float] = Field(default=None, description="""Lower bound for number, integer and quantity kinds; for a quantity, in the default's unit.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterDeclaration']} })
    maximum: Optional[float] = Field(default=None, description="""Upper bound, as for minimum.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterDeclaration']} })
    choices: Optional[list[str]] = Field(default=None, description="""Required when kind is choice.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterDeclaration']} })

    @field_validator('name')
    def pattern_name(cls, v):
        pattern=re.compile(r"^[a-z][a-z0-9_]*$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid name format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid name format: {v}"
            raise ValueError(err_msg)
        return v


class ToolResult(ConfiguredBaseModel):
    """
    What a tool run returns (TL-11). Any combination of parts may be present.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    new_features: Optional[list[Union[AnnotationFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'}],
         'domain_of': ['ToolResult']} })
    modified_features: Optional[list[Union[AnnotationFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'}],
         'domain_of': ['ToolResult']} })
    deleted_feature_ids: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ToolResult']} })
    non_spatial: Optional[list[NonSpatialResult]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ToolResult']} })
    named_sets: Optional[list[NamedSet]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection', 'ToolResult']} })
    state_change: Optional[SharedStateChange] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ToolResult']} })


class NonSpatialResult(ConfiguredBaseModel):
    """
    A number, table or graph (TL-13), held column by column. A number is one column with one value; a graph plots its first column against the rest.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult']} })
    presentation: ResultPresentationEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NonSpatialResult']} })
    columns: list[ResultColumn] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef', 'NonSpatialResult']} })


class ResultColumn(ConfiguredBaseModel):
    """
    One column; exactly one of numbers or strings is given.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    quantity_kind: Optional[QuantityKindEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadColumn', 'ParameterDeclaration', 'ResultColumn']} })
    unit: Optional[str] = Field(default=None, description="""UCUM unit code, required when quantity_kind is given.""", json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'SpeedSeries',
                       'AngleSeries',
                       'PayloadColumn',
                       'ResultColumn']} })
    numbers: Optional[list[float]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ResultColumn']} })
    strings: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ResultColumn']} })


class FormatSettings(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    length_unit: LengthUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FormatSettings']} })
    length_decimals: int = Field(default=..., ge=0, le=6, json_schema_extra = { "linkml_meta": {'domain_of': ['FormatSettings']} })
    speed_unit: SpeedUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FormatSettings']} })
    speed_decimals: int = Field(default=..., ge=0, le=6, json_schema_extra = { "linkml_meta": {'domain_of': ['FormatSettings']} })
    angle_decimals: int = Field(default=..., ge=0, le=6, json_schema_extra = { "linkml_meta": {'domain_of': ['FormatSettings']} })
    duration_unit: DurationUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FormatSettings']} })
    duration_decimals: int = Field(default=..., ge=0, le=6, json_schema_extra = { "linkml_meta": {'domain_of': ['FormatSettings']} })
    position_notation: PositionNotationEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FormatSettings']} })
    position_decimals: int = Field(default=..., ge=0, le=6, json_schema_extra = { "linkml_meta": {'domain_of': ['FormatSettings']} })
    time_style: TimeStyleEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FormatSettings']} })
    show_milliseconds: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FormatSettings']} })
    time_zone: str = Field(default=..., description="""IANA time zone for display, or UTC for Zulu time (SUB-01).""", json_schema_extra = { "linkml_meta": {'domain_of': ['FormatSettings']} })

    @field_validator('time_zone')
    def pattern_time_zone(cls, v):
        pattern=re.compile(r"^(UTC|[A-Za-z_]+(/[A-Za-z0-9_+-]+)+)$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid time_zone format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid time_zone format: {v}"
            raise ValueError(err_msg)
        return v


# Model rebuild
# see https://pydantic-docs.helpmanual.io/usage/models/#rebuilding-a-model
Length.model_rebuild()
Speed.model_rebuild()
Angle.model_rebuild()
Duration.model_rebuild()
SpeedSeries.model_rebuild()
AngleSeries.model_rebuild()
TimeRange.model_rebuild()
ParameterValue.model_rebuild()
PointGeometry.model_rebuild()
LineStringGeometry.model_rebuild()
PolygonGeometry.model_rebuild()
ProvRecord.model_rebuild()
ToolRef.model_rebuild()
AgentRef.model_rebuild()
SourceRef.model_rebuild()
TrackFeature.model_rebuild()
TrackProperties.model_rebuild()
TrackStyle.model_rebuild()
AnnotationFeature.model_rebuild()
AnnotationProperties.model_rebuild()
SensorObservationsFeature.model_rebuild()
SensorObservationsProperties.model_rebuild()
PayloadRef.model_rebuild()
InnerSchemaRef.model_rebuild()
PayloadColumn.model_rebuild()
NamedSet.model_rebuild()
DebriefFeatureCollection.model_rebuild()
StacLink.model_rebuild()
StacAsset.model_rebuild()
StacItemProperties.model_rebuild()
StacItem.model_rebuild()
StacCatalog.model_rebuild()
TimeState.model_rebuild()
Selection.model_rebuild()
Viewport.model_rebuild()
SharedState.model_rebuild()
SharedStateChange.model_rebuild()
ToolDeclaration.model_rebuild()
ParameterDeclaration.model_rebuild()
ToolResult.model_rebuild()
NonSpatialResult.model_rebuild()
ResultColumn.model_rebuild()
FormatSettings.model_rebuild()

# Classes that accept undeclared properties (extra_slots), added by the generator.
StacAsset.model_config["extra"] = "allow"
StacItemProperties.model_config["extra"] = "allow"
StacAsset.model_rebuild(force=True)
StacItemProperties.model_rebuild(force=True)
StacItem.model_rebuild(force=True)
