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
version = "0.0.22"


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
               'FigureId': {'description': 'An image ID in full: DBF1, then the '
                                           'plot key (8 symbols: the first 40 bits '
                                           "of the SHA-256 of the catalogue's id "
                                           "and the item's id), the revision (16 "
                                           'symbols: the first 80 bits of the '
                                           "plot's content hash), the export (8 "
                                           'random symbols) and a check symbol '
                                           '(Luhn mod 32 over the rest), in '
                                           "Crockford's base 32, for example "
                                           'DBF1-PTETVDX3-KG8RB9E5X7Y58R98-M6SC7N75-Z. '
                                           "Its short form, the footer's, is DBF, "
                                           'four symbols of the plot key, seven of '
                                           'the revision, two of the export and a '
                                           'check symbol: DBF-PTET-KG8R-B9EM-69.',
                            'from_schema': 'https://debrief.info/schemas/debrief',
                            'name': 'FigureId',
                            'pattern': '^DBF1-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{16}-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]$',
                            'typeof': 'string'},
               'SchemaVersion': {'description': 'Semantic version of the data-file '
                                                'schema (SUB-12).',
                                 'from_schema': 'https://debrief.info/schemas/debrief',
                                 'name': 'SchemaVersion',
                                 'pattern': '^\\d+\\.\\d+\\.\\d+$',
                                 'typeof': 'string'},
               'ShortFigureId': {'description': "An image ID's short form, as the "
                                                'footer shows it and an analyst '
                                                'types it: 4 symbols of the plot '
                                                'key, 7 of the revision, 2 of the '
                                                'export and a check symbol, so two '
                                                'exports of one revision have '
                                                'different footers.',
                                 'from_schema': 'https://debrief.info/schemas/debrief',
                                 'name': 'ShortFigureId',
                                 'pattern': '^DBF-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$',
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
    angular_rate = "angular_rate"
    """
    Rate of change of an angle, such as bearing rate.
    """


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


class AngularRateUnitEnum(str, Enum):
    """
    Units an angular rate may be stored in (UCUM codes). Degrees per minute is the analysts' standard for bearing rate.
    """
    degSOLIDUSmin = "deg/min"
    """
    degrees per minute
    """
    degSOLIDUSs = "deg/s"
    """
    degrees per second
    """
    radSOLIDUSs = "rad/s"
    """
    radians per second
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
    plot = "plot"
    """
    The whole plot: its own details and its view. At most one per plot.
    """
    narrative = "narrative"
    """
    A narrative entry: what a platform, a person or a document logged at a time, with no position (CAP-19, CAP-20).
    """


class PlotKindEnum(str, Enum):
    plot = "plot"


class ContextTracksEnum(str, Enum):
    """
    How the map draws each track outside the time window: its context (CAP-29). An analyst's setting for the minimum contrast can show faint as visible, never hidden as anything else.
    """
    visible = "visible"
    """
    Easy to see on any theme: at least 3:1 against the map's background.
    """
    faint = "faint"
    """
    Fainter, for a busy plot. Not guaranteed to reach 3:1.
    """
    hidden = "hidden"
    """
    Not drawn: only what is in the time window shows.
    """


class TrackKindEnum(str, Enum):
    track = "track"


class TrackEditActionEnum(str, Enum):
    """
    What a track edit does (CAP-01).
    """
    move = "move"
    """
    Every fix in the period goes the same range along the same bearing.
    """
    rotate = "rotate"
    """
    Every fix in the period turns about the pivot by the angle, keeping its range from it.
    """
    shear = "shear"
    """
    One end of the period is held; the other is dragged, and every fix moves in proportion to its time from the held end, so course and speed change together (TMA shear).
    """
    stretch = "stretch"
    """
    One end of the period is held; every fix's range from it is scaled, so speeds change and courses do not (TMA stretch).
    """
    move_fix = "move_fix"
    """
    One fix, found by its time (fix_time), goes to a new place: a distance along a bearing, or a position. Its time, its recorded course and speed, its mark and every other fix stay as they were.
    """
    set_plotting_mode = "set_plotting_mode"
    """
    The track plotted over the ground (OTG) or by dead reckoning (DR): plotting_mode says which.
    """


class PlottingModeEnum(str, Enum):
    """
    How a track is plotted, as legacy Debrief asked of each track imported (CAP-01, decision, product owner, 14 Oct 2026).
    """
    otg = "otg"
    """
    Over the ground: each fix where it was logged.
    """
    dr = "dr"
    """
    Dead reckoning: the first fix where it was logged, and each fix after it placed from the one before by that fix's recorded course and speed over the time between, along the geodesic.
    """


class FixIntervalOffEnum(str, Enum):
    """
    A track's labels, symbols or direction arrows explicitly turned off (CAP-32), rather than left to Debrief's default.
    """
    off = "off"
    """
    None drawn.
    """


class FixIntervalAllEnum(str, Enum):
    """
    A track's time labels or symbols at every recorded fix (CAP-32), legacy Debrief's "All" (decision, product owner, 15 Oct 2026): still thinned when zoomed out. Not for arrows.
    """
    all = "all"
    """
    At every fix.
    """


class TrackEditAnchorEnum(str, Enum):
    """
    Which end of the period a shear or a stretch holds fixed; the other end is the one dragged.
    """
    start = "start"
    """
    The period's first fix is held; its last is dragged.
    """
    end = "end"
    """
    The period's last fix is held; its first is dragged.
    """


class AnnotationKindEnum(str, Enum):
    annotation = "annotation"


class SensorObservationsKindEnum(str, Enum):
    sensor_observations = "sensor_observations"


class NarrativeKindEnum(str, Enum):
    narrative = "narrative"


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


class AnnotationShapeEnum(str, Enum):
    """
    How an annotation is drawn (CAP-03). Left out, it follows from the geometry: a line string is a line, a polygon an area, a point a label (style label) or a marker, and no geometry a note. Circles and ellipses must say so, since GeoJSON has no curves: their geometry is a polygon that approximates them, for other tools, and their own properties (centre, radius or semi-axes and orientation) say exactly what they are.
    """
    line = "line"
    """
    A line through two or more positions, drawn along geodesics.
    """
    area = "area"
    """
    A closed area with three or more corners, drawn along geodesics.
    """
    circle = "circle"
    """
    Every position at one range from a centre, measured along geodesics.
    """
    ellipse = "ellipse"
    """
    An ellipse about a centre, its axes measured along geodesics from it.
    """
    label = "label"
    """
    Text at a position.
    """
    marker = "marker"
    """
    A marked position.
    """
    note = "note"
    """
    Text at a time, with no position (CAP-04).
    """


class LineStyleEnum(str, Enum):
    """
    How an annotation's line is drawn.
    """
    solid = "solid"
    dashed = "dashed"
    dotted = "dotted"


class LabelPositionEnum(str, Enum):
    """
    Where an annotation's label is drawn, relative to it.
    """
    above = "above"
    below = "below"
    left = "left"
    right = "right"
    centre = "centre"
    none = "none"
    """
    No label on the map; the annotation is still named in the outline.
    """


class ChartFurnitureEnum(str, Enum):
    """
    Chart furniture a plot can carry (CAP-03). The scale bar is always drawn.
    """
    north_arrow = "north_arrow"
    """
    An arrow pointing to true north, in a corner of the map.
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


class MeasureSubjectEnum(str, Enum):
    """
    What a measure is of.
    """
    relative = "relative"
    """
    Between the primary and a secondary, such as range: needs both at current time.
    """
    own = "own"
    """
    Of one track on its own, such as its course: shown for the primary and each secondary.
    """


class MeasureDisplayEnum(str, Enum):
    """
    How a measure's value is written for people, by the formatting service (SUB-04).
    """
    quantity = "quantity"
    """
    In the analyst's unit for its kind, such as 1.25 nmi or 12.0 kn.
    """
    range = "range"
    """
    A range, in the analyst's length unit; where that is nautical miles, a range under 1 nmi is in whole yards, such as 60 yd (decision, 14 Oct 2026).
    """
    bearing = "bearing"
    """
    Three figures, true: 045.0°T.
    """
    relative_bearing = "relative_bearing"
    """
    From the primary's head, port red and starboard green: R045.0° or G045.0°.
    """
    depth = "depth"
    """
    A depth, in metres, or feet where the analyst's lengths are imperial.
    """


class ToteRowStatusEnum(str, Enum):
    """
    Whether a track in the Tote has values at current time.
    """
    ok = "ok"
    """
    The track has data at current time.
    """
    no_data = "no_data"
    """
    Current time is before the track starts or after it ends: nothing to show (note says which).
    """
    missing = "missing"
    """
    The plot no longer has this track (merged or deleted since it was chosen).
    """


class TrackImportModeEnum(str, Enum):
    """
    How tracks imported are plotted: ask for each track (the default), or one choice the analyst said to use for future imports. User state, kept here and never in a catalogue or a plot file.
    """
    ask = "ask"
    """
    Ask, for each track imported, whether it is plotted over the ground or by dead reckoning.
    """
    otg = "otg"
    """
    Over the ground: each fix where it was logged.
    """
    dr = "dr"
    """
    Dead reckoning: from the first fix, by each fix's recorded course and speed.
    """


class StoreKindEnum(str, Enum):
    """
    How a store is reached. Only static file catalogues so far (SUB-15).
    """
    file = "file"
    """
    A static STAC catalogue in a local or shared folder.
    """


class CoverageLinkEnum(str, Enum):
    """
    How a source's track is known to be the plot's platform.
    """
    plot = "plot"
    """
    The plot's own data for the track, as imported.
    """
    linked = "linked"
    """
    Confirmed, or linked by hand, as this platform.
    """
    proposed = "proposed"
    """
    Its name matches the track's, ignoring case and spaces: proposed, not yet confirmed.
    """


class CoverageItemRoleEnum(str, Enum):
    """
    What an item is to the plot.
    """
    this_plot = "this_plot"
    """
    The plot itself.
    """
    drawn_from = "drawn_from"
    """
    The plot took data from it.
    """
    other = "other"
    """
    In the folder tree the plot draws from, but nothing taken from it.
    """


class ImageFormatEnum(str, Enum):
    """
    How an image is written (decision, product owner, 16 Oct 2026; no JPEG).
    """
    png = "png"
    """
    A raster image, its ID in an iTXt chunk and in XMP.
    """
    svg = "svg"
    """
    A vector image, its ID in its metadata element; reference tiles embedded as images.
    """


class ImageThemeEnum(str, Enum):
    """
    The colours an image is drawn in.
    """
    current = "current"
    """
    As the analyst sees the map: the editor's theme.
    """
    light = "light"
    """
    Light, for print and white slides, whatever the editor's theme.
    """


class ImagePresetEnum(str, Enum):
    """
    The size an image is drawn at.
    """
    screen = "screen"
    """
    The map as it is on screen, at twice its size for sharpness.
    """
    slide = "slide"
    """
    1600 by 900 pixels: a 16:9 slide.
    """
    a4_landscape = "a4_landscape"
    """
    A4 landscape at twice its size on screen: 1754 by 1240 pixels (150 dots an inch).
    """


class TimelineEntryKindEnum(str, Enum):
    """
    What a Timeline row is.
    """
    narrative = "narrative"
    """
    A narrative entry.
    """
    annotation = "annotation"
    """
    A time-only annotation: a note or a period of interest.
    """
    fix_comment = "fix_comment"
    """
    A comment on one of a track's fixes.
    """
    coverage = "coverage"
    """
    A period a track has data for, from one source: the plot itself or the catalogue item supplying it (CAP-05, CAP-08).
    """


class WebviewMessageKindEnum(str, Enum):
    ready = "ready"
    """
    Webview to host: loaded and listening.
    """
    show_plot = "show_plot"
    """
    Host to map: draw this plot (plot, plot_title, selection, and current time and viewport if known, and how many features are hidden); with revision_shown, an earlier revision of the plot, shown read-only.
    """
    set_selection = "set_selection"
    """
    Host to map: the selection changed elsewhere (selection).
    """
    selection_changed = "selection_changed"
    """
    Map to host: the analyst changed the selection (selection).
    """
    set_time = "set_time"
    """
    Host to map: current time changed elsewhere (time).
    """
    time_changed = "time_changed"
    """
    Map to host: the analyst moved current time (time).
    """
    set_viewport = "set_viewport"
    """
    Host to map: show this area (viewport).
    """
    viewport_changed = "viewport_changed"
    """
    Map to host: the analyst panned or zoomed (viewport).
    """
    show_hidden = "show_hidden"
    """
    Map to host: show every feature hidden on the map (no members).
    """
    show_form = "show_form"
    """
    Host to form: show this tool's form (tool, selected_names, time_range of the plot, and current time if known).
    """
    run_tool = "run_tool"
    """
    Form to host: run the tool with these values (tool_name, parameters).
    """
    cancel = "cancel"
    """
    Form to host: close without running.
    """
    form_busy = "form_busy"
    """
    Host to form: the tool is running (message).
    """
    form_error = "form_error"
    """
    Host to form: the run failed or a value was refused (message).
    """
    show_results = "show_results"
    """
    Host to results: show a tool's result (tool, result_title, result).
    """
    show_time = "show_time"
    """
    Host to time controller: current time, its range being the time window shown (time), the plot's whole period (time_range), the window as saved in the plot (saved_window), how tracks outside the window are drawn (context_tracks) and whether the analyst's setting shows faint as visible (minimum_context_contrast); none when no plot is open.
    """
    window_changed = "window_changed"
    """
    Time controller to host: the analyst let go of the time window, or chose Keep; save it in the plot (time_range).
    """
    context_changed = "context_changed"
    """
    Time controller to host: the analyst chose how tracks outside the window are drawn; save it in the plot (context_tracks).
    """
    set_context = "set_context"
    """
    Host to map: draw tracks outside the window this way (context_tracks), the analyst's setting already applied.
    """
    show_annotation_form = "show_annotation_form"
    """
    Host to annotation form: add an annotation, or change the one given (annotation and feature_id); the plot's period (time_range) and current time if known.
    """
    save_annotation = "save_annotation"
    """
    Annotation form to host: add this annotation, or change the one named (annotation, and feature_id when changing one).
    """
    delete_annotation = "delete_annotation"
    """
    Annotation form to host: delete this annotation (feature_id).
    """
    edit_annotation = "edit_annotation"
    """
    Map to host: the analyst asked to change this annotation (feature_id): by double-clicking it, which opens its form; or, with annotation, by dragging or nudging it on the map, which changes it so as one recorded step.
    """
    annotation_drawn = "annotation_drawn"
    """
    Map to host: the analyst finished drawing an annotation on the map (annotation, its name empty); open the annotation form with it, to name it and add it as one step.
    """
    edit_track = "edit_track"
    """
    Map to host: the analyst let go of a track's move, rotate, shear or stretch handle or one of its fixes, or stopped nudging one (feature_id, track_edit); change it so, as one recorded step.
    """
    show_fixes = "show_fixes"
    """
    Host to map: ring these fixes of a track for the analyst to check (feature_id, fix_times), such as jumps found before they are removed, and perhaps draw the track as a change would leave it (preview), with a note (message); with no feature_id, take them away.
    """
    show_tote = "show_tote"
    """
    Host to Tote: the tracks that can be chosen (tote_tracks), which are chosen (tote_view) and the values at current time (tote), any of them; none when no plot is open.
    """
    tote_changed = "tote_changed"
    """
    Tote to host: the analyst chose a primary, added or removed a secondary, chose a measure group, or turned the map's lines on or off; save it in the plot (tote_view).
    """
    set_tote = "set_tote"
    """
    Host to map: which tracks the Tote compares (tote_view), for a thin line from the primary to each secondary at current time unless its map_lines is false; none when nothing is chosen.
    """
    show_timeline = "show_timeline"
    """
    Host to Timeline: what the Timeline lists (timeline_entries, in its order), the tracks a narrative entry can belong to (timeline_tracks), current time with the window shown (time), which plot it is (plot_id, so another plot is told from the same one changed) and whether the map shows the narrative entry at current time (narrative_on_map, left out meaning it does); none when no plot is open.
    """
    narrative_on_map_changed = "narrative_on_map_changed"
    """
    Timeline to host: the analyst turned the narrative box on the map on or off (narrative_on_map); save it in the plot's island.
    """
    playing_changed = "playing_changed"
    """
    Time controller to host, and host to Timeline: current time started or stopped playing (playing). The Timeline follows current time again when playing starts.
    """
    timeline_chosen = "timeline_chosen"
    """
    Timeline to host: the analyst chose an entry (feature_id, the entry's id): move current time to it.
    """
    save_narrative = "save_narrative"
    """
    Timeline to host: add this narrative entry, or change the one named (narrative, and feature_id when changing one), as one recorded step.
    """
    delete_narrative = "delete_narrative"
    """
    Timeline to host: delete this narrative entry (feature_id), as one recorded step.
    """
    open_narrative_form = "open_narrative_form"
    """
    Host to Timeline: open the form to add a narrative entry, or to change the one named (feature_id), as a command or an agent asked.
    """
    narrative_saved = "narrative_saved"
    """
    Host to Timeline: the entry was added or changed (feature_id), so the form closes and the list shows it; or, with message, why it was not.
    """
    set_narrative = "set_narrative"
    """
    Host to map: the narrative entry current time is at, where it belongs to a track (timeline_entry), to show beside that track's marker; none to take it away.
    """
    undo_asked = "undo_asked"
    """
    Timeline to host: the analyst pressed Undo (Ctrl+Z; Cmd+Z on macOS) with focus in the Timeline but not in a text box: undo the plot's last step, as the map, Outline and History do (decision, product owner, 15 Oct 2026).
    """
    redo_asked = "redo_asked"
    """
    Timeline to host: the analyst pressed Redo (Ctrl+Shift+Z or Ctrl+Y; Cmd+Shift+Z on macOS) with focus in the Timeline but not in a text box: redo the step last undone.
    """
    fix_chosen = "fix_chosen"
    """
    Map to host: the analyst asked to colour, label or comment on a fix (feature_id, fix_time), by right-clicking it or pressing Enter on a fix chosen with the keyboard.
    """
    show_coverage = "show_coverage"
    """
    Host to Coverage: the open plot's coverage (coverage) and current time (time); none when no plot is open; or, with message alone, why what the analyst asked for was not done, leaving what is shown.
    """
    source_chosen = "source_chosen"
    """
    Coverage to host: the analyst chose which source supplies a period of a track (feature_id, time_range, source), as one recorded step (CAP-09).
    """
    link_changed = "link_changed"
    """
    Coverage to host: the analyst confirmed or linked (linked true), or refused or unlinked (linked false), a track in another item as the platform of the plot's track (feature_id, source), as one recorded step.
    """
    take_asked = "take_asked"
    """
    Coverage to host: take the new data in this item into the plot (item_revision), as one recorded step (CAP-11).
    """
    dismiss_asked = "dismiss_asked"
    """
    Coverage to host: set this item's new data aside for now (item_revision): its mark clears until it is revised (CAP-10).
    """
    review_cleared = "review_cleared"
    """
    Coverage to host: the analyst reviewed the plot against the items revised since it drew from them; clear its review flag (CAP-12).
    """
    export_image = "export_image"
    """
    Host to map: draw the map as an image (image_request), as the analyst sees it, at the size, in the theme and with the footer asked for (SUB-25).
    """
    image_rendered = "image_rendered"
    """
    Map to host: the image drawn (image), for its ID to go into its metadata; or, with message alone, why it could not be drawn.
    """
    latest_asked = "latest_asked"
    """
    Map to host: the analyst asked to leave the earlier revision shown read-only and go to the plot's latest (no members).
    """


class StepStateEnum(str, Enum):
    """
    Where a step stands, as the after links and the current step say.
    """
    applied = "applied"
    """
    On the chain to the current step: in the plot now.
    """
    undone = "undone"
    """
    After the current step on the chain to the latest: can be redone.
    """
    abandoned = "abandoned"
    """
    Undone, then replaced by a later change: kept on record, never replayed.
    """



class Length(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'ParameterValue',
                       'MeasureValue']} })
    unit: LengthUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn',
                       'MeasureValue']} })


class Speed(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'ParameterValue',
                       'MeasureValue']} })
    unit: SpeedUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn',
                       'MeasureValue']} })


class Angle(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'ParameterValue',
                       'MeasureValue']} })
    unit: AngleUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn',
                       'MeasureValue']} })


class Duration(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'ParameterValue',
                       'MeasureValue']} })
    unit: DurationUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn',
                       'MeasureValue']} })


class AngularRate(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'ParameterValue',
                       'MeasureValue']} })
    unit: AngularRateUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn',
                       'MeasureValue']} })


class SpeedSeries(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    unit: SpeedUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn',
                       'MeasureValue']} })
    values: list[float] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries', 'LengthSeries', 'ToteRow']} })


class AngleSeries(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    unit: AngleUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn',
                       'MeasureValue']} })
    values: list[float] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries', 'LengthSeries', 'ToteRow']} })


class LengthSeries(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    unit: LengthUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn',
                       'MeasureValue']} })
    values: list[float] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries', 'LengthSeries', 'ToteRow']} })


class TimeRange(ConfiguredBaseModel):
    """
    A closed interval of time. Start shall not be after end.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    start: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry']} })
    end: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry']} })

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
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    value: Union[Angle, AngularRate, Duration, Length, Speed, bool, float, str] = Field(default=..., json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'float'},
                    {'range': 'string'},
                    {'range': 'boolean'},
                    {'range': 'Length'},
                    {'range': 'Speed'},
                    {'range': 'Angle'},
                    {'range': 'Duration'},
                    {'range': 'AngularRate'}],
         'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'ParameterValue',
                       'MeasureValue']} })

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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    kind: ProvActivityKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessage']} })
    started_at: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    ended_at: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    tool: Optional[ToolRef] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'WebviewMessage']} })
    agent: AgentRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    parameters: Optional[list[ParameterValue]] = Field(default=None, description="""Parameter values the operation ran with, so replay can repeat it (SUB-19).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'ToolDeclaration', 'WebviewMessage']} })
    selected: Optional[list[str]] = Field(default=None, description="""Ids of the features the operation was applied to, in selection order, so replay can repeat it (SUB-19).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    used: Optional[list[SourceRef]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    seed: Optional[int] = Field(default=None, description="""Random seed, for operations that use randomness (SUB-20).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    notes: Optional[list[str]] = Field(default=None, description="""Free-text notes such as truncations or omitted content (EXT-14, EXT-15).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'RenderedImage']} })
    drawn_from: Optional[list[ItemRef]] = Field(default=None, description="""Catalogue items the operation took data from, each at the revision it read (CAP-09 to CAP-12): PROV's wasDerivedFrom. A product whose provenance names an item at a revision it no longer has may need review (CAP-12).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })

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
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
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
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessage']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
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


class ItemRef(ConfiguredBaseModel):
    """
    A catalogue item an operation took data from, at one revision (CAP-09 to CAP-12). Items are named by their catalogue's own id (the catalog.json id, not the analyst's name for the folder) and their item id, so the reference means the same on every analyst's machine.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'class_uri': 'prov:Entity',
         'from_schema': 'https://debrief.info/schemas/debrief'})

    catalogue: str = Field(default=..., description="""The id in the item's catalog.json.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    item: str = Field(default=..., description="""The item's id in that catalogue.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    title: Optional[str] = Field(default=None, description="""The item's title when it was read, to name it if it has gone.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    revision: str = Field(default=..., description="""The item's revision when it was read: the content hash of its plot (its whole-plot details included), so any recorded change to the item, of data or details, is a new revision.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource']} })

    @field_validator('revision')
    def pattern_revision(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid revision format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid revision format: {v}"
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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    geometry: LineStringGeometry = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: TrackProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })


class TrackProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: TrackKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessage']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    platform_class: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    times: list[str] = Field(default=..., description="""One per position, non-decreasing.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    speeds: Optional[SpeedSeries] = Field(default=None, description="""Speed over ground at each position.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    courses: Optional[AngleSeries] = Field(default=None, description="""Course over ground at each position, true north, clockwise.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    depths: Optional[LengthSeries] = Field(default=None, description="""Depth below the sea surface at each position, positive down. Absent where depth is not known.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    style: Optional[TrackStyle] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'AnnotationProperties']} })
    fix_marks: Optional[list[FixMark]] = Field(default=None, description="""Fixes with a colour, a label or a comment of their own, or always showing their time label or symbol, in time order, each found by its time (CAP-01, EXT-14). Most fixes have none, so only marked fixes are listed. Content: each change is a recorded, undoable step (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    plotting_mode: Optional[PlottingModeEnum] = Field(default=None, description="""How the track is plotted: over the ground (otg, as logged; also when left out) or by dead reckoning (dr), chosen as it was imported and changed as a recorded, undoable step (CAP-01, SUB-22). The geometry is always the positions as plotted, so other GeoJSON tools draw what Debrief draws.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'TrackEdit']} })
    logged_positions: Optional[LineStringGeometry] = Field(default=None, description="""A track plotted by dead reckoning: its positions as logged, over the ground, one per fix, so plotting it over the ground again puts them back. Left out for a legacy plot's DR leg, which saved only the positions it worked out.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    logged_courses: Optional[AngleSeries] = Field(default=None, description="""A track plotted by dead reckoning: its courses as logged, one per fix, as they were when it was plotted so. On a DR track the courses and speeds are what edits change (decision, product owner, 14 Oct 2026), so these tell what was changed while plotted by dead reckoning, and plotting it over the ground again puts them back.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    logged_speeds: Optional[SpeedSeries] = Field(default=None, description="""A track plotted by dead reckoning: its speeds as logged, one per fix, as they were when it was plotted so; see logged_courses.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    label_interval: Optional[Union[Duration, FixIntervalAllEnum, FixIntervalOffEnum]] = Field(default=None, description="""How often the track is labelled with the time (CAP-32): at each whole multiple of this interval of UTC (every 10 min is 0900, 0910, 0920...), as legacy Debrief aligns them, from 1 second to 24 hours; at every fix (\"all\"); or off. Left out, Debrief's default: none. Presentation content: each change is a recorded, undoable step, like colour (SUB-22).""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'Duration'},
                    {'range': 'FixIntervalOffEnum'},
                    {'range': 'FixIntervalAllEnum'}],
         'domain_of': ['TrackProperties']} })
    symbol_interval: Optional[Union[Duration, FixIntervalAllEnum, FixIntervalOffEnum]] = Field(default=None, description="""How often a small symbol in the track's colour marks where it was (CAP-32): aligned and bounded as label_interval, or at every fix (\"all\"). Left out, none.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'Duration'},
                    {'range': 'FixIntervalOffEnum'},
                    {'range': 'FixIntervalAllEnum'}],
         'domain_of': ['TrackProperties']} })
    arrow_interval: Optional[Union[Duration, FixIntervalOffEnum]] = Field(default=None, description="""How often a chevron on the line shows the track's direction of travel (CAP-32): aligned and bounded as label_interval. Left out, Debrief's default: a few along the track in the time window.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'Duration'}, {'range': 'FixIntervalOffEnum'}],
         'domain_of': ['TrackProperties']} })
    hidden: Optional[bool] = Field(default=None, description="""Not drawn on the map. Still listed, and still selectable, in the outline. Content: hiding is a recorded, undoable change (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'TimelineEntry']} })
    supplies: Optional[list[TrackSupply]] = Field(default=None, description="""Which catalogue item supplies each period of the track (CAP-09): where two items have data for the platform over the same period, the analyst chooses which supplies it, and the track is stitched from the chosen periods. In time order, not overlapping, each from its first fix to its last. Left out, the plot itself supplies the whole track, as imported. Content: each change is a recorded, undoable step (SUB-22), naming the items and periods.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    platform_links: Optional[list[SourceTrackRef]] = Field(default=None, description="""Tracks in other catalogue items the analyst confirmed, or linked by hand, as this track's platform (CAP-09; decision, product owner, 16 Oct 2026). Tracks whose names match this one's, ignoring case and spaces, are proposed until confirmed or refused. Each change is a recorded, undoable step.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    platform_unlinks: Optional[list[SourceTrackRef]] = Field(default=None, description="""Tracks in other catalogue items whose names match this one's but which the analyst said are another platform: no longer proposed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, description="""Feature-level provenance where needed (SUB-18).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
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


class SourceTrackRef(ConfiguredBaseModel):
    """
    A track in a catalogue item, as collation names it (CAP-08, CAP-09): the item by its catalogue's own id and its item id, the track by its feature id there, and its name when last read, to show if the item has gone.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    catalogue: str = Field(default=..., description="""The id in the item's catalog.json.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    track: str = Field(default=..., description="""The track's feature id in that item.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })


class TrackSupply(ConfiguredBaseModel):
    """
    One period of a track and the catalogue item that supplies it (CAP-09): the fixes from start to end, ends included, are that item's track's (the plot's own, where it names the plot itself).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    catalogue: str = Field(default=..., description="""The id in the item's catalog.json.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    track: str = Field(default=..., description="""The supplying track's feature id in that item.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry']} })
    title: str = Field(default=..., description="""The item's title when the period was taken from it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    revision: Optional[str] = Field(default=None, description="""The item's revision when the period was taken from it; left out where the plot supplies it itself.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource']} })
    start: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry']} })
    end: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry']} })

    @field_validator('revision')
    def pattern_revision(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid revision format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid revision format: {v}"
            raise ValueError(err_msg)
        return v

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


class TrackStyle(ConfiguredBaseModel):
    """
    How a track is drawn. Data colours do not change with the theme (DEV-07). Colour is content: the analyst changing it (blue friendly to red enemy, say) is a recorded, undoable change (SUB-22).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    colour: str = Field(default=..., description="""Lower-case hex RGB, for example \"#e01c3e\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TimelineEntry']} })
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


class FixMark(ConfiguredBaseModel):
    """
    One fix of a track marked by the analyst, or by a legacy plot: drawn in a colour of its own, labelled on the map, carrying a comment, or always showing its time label or symbol. Found by its time, not its place in the track, so a mark stays with its fix when fixes before it are removed, the track is split or merged, or it is moved, rotated, sheared, stretched or smoothed. Where two fixes share a time, the mark is the first's.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    time: str = Field(default=..., description="""The time of the fix marked; one of the track's times.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'WebviewMessage']} })
    colour: Optional[str] = Field(default=None, description="""The fix's own colour, lower-case hex RGB: its marker and the line from it to the next fix are drawn in it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TimelineEntry']} })
    label: Optional[str] = Field(default=None, description="""Text drawn on the map beside the fix.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark', 'MeasureDefinition']} })
    comment: Optional[str] = Field(default=None, description="""Free text about the fix, shown when the analyst points at it and in the Timeline.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark']} })
    show_label: Optional[bool] = Field(default=None, description="""The fix always shows its time label, as the track's label_interval draws them, whatever that interval is and at any zoom (CAP-32; decision, product owner, 15 Oct 2026: force on only, so true when given). Never drawn twice where the interval falls on the same time.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark']} })
    show_symbol: Optional[bool] = Field(default=None, description="""The fix always shows its symbol, as the track's symbol_interval draws them, whatever that interval is and at any zoom (CAP-32); true when given.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark']} })

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


class TrackEdit(ConfiguredBaseModel):
    """
    A track moved, rotated, sheared or stretched by hand, as the map, a form or an agent describes it (CAP-01, CAP-02, CAP-21): one recorded, undoable step in the plot's history (SUB-19). Geodesic: a move takes every fix in the period the same range along the same bearing, each along its own geodesic; a rotation keeps each fix's range from the pivot and turns its bearing from the pivot by the angle. A shear and a stretch hold one end of the period (the anchor) and work in the azimuthal equidistant frame about it, where a geodesic through the anchor is a straight line: a shear adds to each fix the dragged end's displacement times the fix's fraction of the time from the anchor to the dragged end; a stretch scales each fix's range from the anchor, keeping its bearing from it. Either way a straight, steady leg stays a straight, steady leg. Fixes outside the period stay where they are, so the joins jump. A single fix moved (move_fix) goes where it is told, alone: its neighbours, its time and its recorded course and speed stay. set_plotting_mode with plotting_mode dr plots the whole track by dead reckoning, each fix placed from the one before by that fix's recorded course and speed, from the track's first fix; with otg it puts the fixes back where they were logged, after the analyst confirms losing any change made while plotted by dead reckoning (discard_dr_changes).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    action: TrackEditActionEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    period: Optional[TimeRange] = Field(default=None, description="""The fixes to change: those whose times fall in it, ends included. Left out, the whole track.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    distance: Optional[Length] = Field(default=None, description="""How far a move takes each fix, a shear drags the end that is not held, or a single fix is moved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    bearing: Optional[Angle] = Field(default=None, description="""Which way a move takes each fix, a shear drags the end that is not held, or a single fix is moved, true, clockwise from north.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    angle: Optional[Angle] = Field(default=None, description="""How far a rotation turns the fixes about the pivot; positive is clockwise.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    pivot: Optional[list[float]] = Field(default=None, description="""[longitude, latitude] of the position a rotation turns about. Left out, the fix nearest current time in the period, or the period's first fix.""", min_length=2, max_length=2, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    anchor: Optional[TrackEditAnchorEnum] = Field(default=None, description="""The end of the period a shear or a stretch holds fixed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    course: Optional[Angle] = Field(default=None, description="""The course made good a shear gives the period: the true bearing, at its first fix, of the geodesic from its first fix to its last. With speed, instead of a distance and a bearing for the dragged end.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    speed: Optional[Speed] = Field(default=None, description="""The speed made good a shear or a stretch gives the period: the geodesic range from its first fix to its last over the time between.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    fix_time: Optional[str] = Field(default=None, description="""The time of the one fix a move_fix moves: the fix is found by its time, as a mark is (where two fixes share a time, the first).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit', 'WebviewMessage']} })
    position: Optional[list[float]] = Field(default=None, description="""[longitude, latitude] a move_fix puts the fix at, instead of a distance and a bearing from where it is.""", min_length=2, max_length=2, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    plotting_mode: Optional[PlottingModeEnum] = Field(default=None, description="""How set_plotting_mode plots the track, over the ground or by dead reckoning.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'TrackEdit']} })
    discard_dr_changes: Optional[bool] = Field(default=None, description="""set_plotting_mode to otg only: plot the track over the ground although it was changed while plotted by dead reckoning, losing those changes, as the analyst confirmed (decision, product owner, 14 Oct 2026). Without it such a change is refused, saying why.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })

    @field_validator('fix_time')
    def pattern_fix_time(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid fix_time format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid fix_time format: {v}"
            raise ValueError(err_msg)
        return v


class AnnotationFeature(ConfiguredBaseModel):
    """
    Shapes, labels and chart furniture as ordinary GeoJSON (CAP-03). An annotation with only a time has null geometry and shall give a time or a time range (CAP-04); chart furniture has null geometry and needs neither. A circle or an ellipse is a polygon approximating it, for other tools, with its centre and size as properties, which Debrief draws from.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: FeatureTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    geometry: Optional[Union[LineStringGeometry, PointGeometry, PolygonGeometry]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'PointGeometry'},
                    {'range': 'LineStringGeometry'},
                    {'range': 'PolygonGeometry'}],
         'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: AnnotationProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })


class AnnotationProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: AnnotationKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessage']} })
    style: AnnotationStyleEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'AnnotationProperties']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    text: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry']} })
    time: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'WebviewMessage']} })
    time_range: Optional[TimeRange] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'WebviewMessage']} })
    shape: Optional[AnnotationShapeEnum] = Field(default=None, description="""How it is drawn. Required for circles and ellipses; otherwise it may be left out and follows from the geometry.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    centre: Optional[conlist(min_length=2, max_length=2, item_type=float)] = Field(default=None, description="""The centre of a circle or an ellipse, [longitude, latitude] in WGS84 degrees. Its geometry is the polygon that approximates it.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 2}],
                   'exact_number_dimensions': 1},
         'domain_of': ['AnnotationProperties']} })
    radius: Optional[Length] = Field(default=None, description="""A circle's radius, along geodesics from its centre.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    semi_major: Optional[Length] = Field(default=None, description="""Half an ellipse's longer axis, along the geodesic from its centre.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    semi_minor: Optional[Length] = Field(default=None, description="""Half an ellipse's shorter axis, along the geodesic from its centre.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    orientation: Optional[Angle] = Field(default=None, description="""The direction of an ellipse's longer axis from its centre, true north, clockwise.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    furniture: Optional[ChartFurnitureEnum] = Field(default=None, description="""What chart furniture it is. Chart furniture has no geometry and needs no time.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties']} })
    appearance: Optional[AnnotationAppearance] = Field(default=None, description="""How it is drawn on the map. Left out, or any member of it left out, means Debrief's default for annotations. Content, like a track's colour: changing it is a recorded, undoable change (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    hidden: Optional[bool] = Field(default=None, description="""Not drawn on the map. Still listed, and still selectable, in the outline. Content: hiding is a recorded, undoable change (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'TimelineEntry']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
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


class AnnotationAppearance(ConfiguredBaseModel):
    """
    How an annotation is drawn: its line, its fill and its label. Data colours do not change with the theme (DEV-07). Widths and sizes are in screen pixels, so they are the same at every zoom.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    colour: Optional[str] = Field(default=None, description="""Its line's colour, and a label's or a marker's dot. Lower-case hex RGB, for example \"#c7820a\". Label text is drawn in the theme's text colour, so it stays readable on any map.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TimelineEntry']} })
    line_style: Optional[LineStyleEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationAppearance']} })
    line_width: Optional[int] = Field(default=None, description="""Width of its line in screen pixels.""", ge=1, le=10, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationAppearance']} })
    fill_colour: Optional[str] = Field(default=None, description="""Colour inside an area, circle or ellipse. Lower-case hex RGB. Left out, the line's colour.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationAppearance']} })
    fill_opacity: Optional[float] = Field(default=None, description="""How opaque the fill of an area, circle or ellipse is, from 0 (none) to 1 (solid). Left out, 0.25 with a fill colour, or else a faint tint of 0.05, so what lies inside stays clear.""", ge=0, le=1, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationAppearance']} })
    label_size: Optional[int] = Field(default=None, description="""Height of its label's text in screen pixels.""", ge=8, le=32, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationAppearance']} })
    label_position: Optional[LabelPositionEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationAppearance']} })

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

    @field_validator('fill_colour')
    def pattern_fill_colour(cls, v):
        pattern=re.compile(r"^#[0-9a-f]{6}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid fill_colour format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid fill_colour format: {v}"
            raise ValueError(err_msg)
        return v


class AnnotationSpec(ConfiguredBaseModel):
    """
    An annotation as the analyst describes it in a form, or an agent in a request: what is made into an annotation feature, recorded as one step in the plot's history (CAP-03, SUB-19). Positions are numbers here; forms read them in the analyst's notation and say what they mean.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    shape: AnnotationShapeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    text: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry']} })
    positions: Optional[conlist(min_length=1, item_type=conlist(min_length=2, max_length=2, item_type=float))] = Field(default=None, description="""[longitude, latitude] pairs: the line's positions, or the area's corners (not closed); one, the centre or position, for a circle, ellipse, label or marker; none for a note.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'minimum_cardinality': 1}, {'exact_cardinality': 2}],
                   'exact_number_dimensions': 2},
         'domain_of': ['AnnotationSpec']} })
    radius: Optional[Length] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    semi_major: Optional[Length] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    semi_minor: Optional[Length] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    orientation: Optional[Angle] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    time: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'WebviewMessage']} })
    time_range: Optional[TimeRange] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'WebviewMessage']} })
    appearance: Optional[AnnotationAppearance] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })

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


class NarrativeFeature(ConfiguredBaseModel):
    """
    One narrative entry (CAP-19, CAP-20, EXT-14): what a platform, a person or a document logged at a time. A feature of its own with null geometry, as a time-only annotation is, so other GeoJSON tools read it, and each entry added, changed or deleted is one small recorded, undoable step (SUB-19). Every narrative feature in a plot together makes the plot's narrative: one combined Zulu time axis, however many sources it came from, in the order narrative_order gives (time; then source, ignoring case; then the plot's order, so a log's own order at one time is kept).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: FeatureTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    geometry: Optional[PointGeometry] = Field(default=None, description="""Always null.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: NarrativeProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })


class NarrativeProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: NarrativeKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessage']} })
    time: str = Field(default=..., description="""When it was logged, to the millisecond, Zulu (SUB-01).""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'WebviewMessage']} })
    source: str = Field(default=..., description="""Who wrote it: the platform, person or document whose log it is (legacy Debrief's track name on an entry), such as \"BLUE ONE\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'WebviewMessage']} })
    entry_type: Optional[str] = Field(default=None, description="""What kind of entry, in the source's own words, such as legacy Debrief's GenComment, Posn, CSD or FCS. Free text: each source has its own types. Left out where the source gives none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties', 'NarrativeSpec', 'TimelineEntry']} })
    text: str = Field(default=..., description="""What was logged. May run to several lines.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry']} })
    track_id: Optional[str] = Field(default=None, description="""The track the entry belongs to, where one is known: by default the track named as its source. A track since deleted leaves the link, which is then ignored.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties', 'NarrativeSpec']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
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


class NarrativeSpec(ConfiguredBaseModel):
    """
    A narrative entry as the analyst describes it in a form, or an agent in a request (debrief/add_narrative, debrief/edit_narrative): made into a narrative feature as one recorded step (CAP-20).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    time: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'WebviewMessage']} })
    source: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'WebviewMessage']} })
    entry_type: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties', 'NarrativeSpec', 'TimelineEntry']} })
    text: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry']} })
    track_id: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties', 'NarrativeSpec']} })

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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    geometry: Optional[PointGeometry] = Field(default=None, description="""Always null.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: SensorObservationsProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })


class SensorObservationsProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: SensorObservationsKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessage']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    sensor_name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    host_track_id: str = Field(default=..., description="""The track carrying the sensor.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    observation_type: ObservationTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    time_range: TimeRange = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'WebviewMessage']} })
    observation_count: int = Field(default=..., ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    payload: PayloadRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    hidden: Optional[bool] = Field(default=None, description="""Not drawn on the map. Still listed, and still selectable, in the outline. Content: hiding is a recorded, undoable change (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'TimelineEntry']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'DebriefFeatureCollection']} })


class PayloadRef(ConfiguredBaseModel):
    """
    Envelope for data LinkML expresses badly (CON-02): the payload's format, a versioned reference to its inner schema, units, CRS and time reference.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    href: str = Field(default=..., description="""Path relative to the referencing file.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef', 'StacLink', 'StacAsset']} })
    format: PayloadFormatEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef', 'ImageExport', 'ImageRequest', 'RenderedImage']} })
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
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
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
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    quantity_kind: Optional[QuantityKindEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadColumn',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'MeasureDefinition']} })
    unit: Optional[str] = Field(default=None, description="""UCUM unit code, required when quantity_kind is given.""", json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn',
                       'MeasureValue']} })


class PlotFeature(ConfiguredBaseModel):
    """
    The whole plot: its own details, and its view (the island). At most one per plot. Geometry is always null, so the plot file stays plain GeoJSON for other tools.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: FeatureTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    geometry: Optional[PointGeometry] = Field(default=None, description="""Always null.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: PlotProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })


class PlotProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: PlotKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessage']} })
    title: Optional[str] = Field(default=None, description="""The plot's title. Content, like everything outside view.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    description: Optional[str] = Field(default=None, description="""What the plot is for. Content.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacItemProperties',
                       'StacCatalog',
                       'MeasureGroup']} })
    view: Optional[PlotView] = Field(default=None, description="""The island: how the plot is being viewed. Outside the plot's history (see the module description). Kept last, so it is easy to find and strip.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties']} })


class PlotView(ConfiguredBaseModel):
    """
    View state saved in the plot file: not content, so not undoable and not recorded in provenance (SUB-22). Two people changing it at once are told, not silently overwritten (SUB-28). Later view state joins here.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    time_window: Optional[TimeRange] = Field(default=None, description="""The plot's time window: the period shown, one for the whole plot (CAP-28, CAP-29). Start shall not be after end.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView']} })
    context_tracks: Optional[ContextTracksEnum] = Field(default=None, description="""How tracks outside the time window are drawn (CAP-29). Left out means visible.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView', 'WebviewMessage']} })
    tote: Optional[ToteView] = Field(default=None, description="""Which tracks the Tote compares, and through which measure group (CAP-06, CAP-07). View state, like the window: changing it is never a step in the history (decision, 14 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView', 'ImageExport', 'WebviewMessage']} })
    narrative_on_map: Optional[bool] = Field(default=None, description="""Whether the map shows the narrative entry current time is at in a small box beside its track, for ten minutes of plot time; left out means it does. Turned off and on in the Timeline. View state, like the Tote's lines: never a step in the history (decision, product owner, 15 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView', 'WebviewMessage']} })
    collation: Optional[CollationView] = Field(default=None, description="""What the analyst has said of catalogue items while collating (CAP-10, CAP-12): new data set aside for now, and revisions reviewed. View state: never a step in the history.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView']} })
    exports: Optional[list[ImageExport]] = Field(default=None, description="""The plot's export log: each image exported from it, with its ID, the revision exported, when, by whom, the view and the time, the format and the file's name (SUB-25; decision, product owner, 16 Oct 2026). View state: never a step, so an export changes neither the plot's revision nor any product that drew from it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView', 'ExportLog']} })


class CollationView(ConfiguredBaseModel):
    """
    The analyst's answers to collation's marks, each for one revision of an item, so a later revision is marked again.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    dismissed: Optional[list[ItemRevision]] = Field(default=None, description="""Items marked as new data for this plot that the analyst set aside (Not now), at the revision then (CAP-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['CollationView']} })
    reviewed: Optional[list[ItemRevision]] = Field(default=None, description="""Revised items this plot drew from that the analyst reviewed it against, clearing its review flag, at the revision reviewed (CAP-12).""", json_schema_extra = { "linkml_meta": {'domain_of': ['CollationView']} })


class ItemRevision(ConfiguredBaseModel):
    """
    One revision of a catalogue item; for an answer the analyst gave (Not now, Reviewed), who gave it and when, a light audit trail kept in the island (decision, product owner, 16 Oct 2026).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    catalogue: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    revision: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource']} })
    by: Optional[str] = Field(default=None, description="""Who gave the answer: the agent's name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision', 'ImageExport']} })
    at: Optional[str] = Field(default=None, description="""When the answer was given.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision', 'ImageExport']} })

    @field_validator('revision')
    def pattern_revision(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid revision format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid revision format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('at')
    def pattern_at(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid at format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid at format: {v}"
            raise ValueError(err_msg)
        return v


class NamedSet(ConfiguredBaseModel):
    """
    A saved, reusable selection (TL-11).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    schema_version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection', 'Delta', 'HistoryHead']} })
    features: list[Union[AnnotationFeature, NarrativeFeature, PlotFeature, SensorObservationsFeature, TrackFeature]] = Field(default=..., json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'NarrativeFeature'},
                    {'range': 'PlotFeature'}],
         'domain_of': ['DebriefFeatureCollection']} })
    named_sets: Optional[list[NamedSet]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'ToolResult',
                       'HistoryStep',
                       'Delta']} })
    provenance: list[ProvRecord] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'DebriefFeatureCollection']} })
    history: Optional[PlotHistory] = Field(default=None, description="""The plot's whole history: every step, with its provenance and whether it is applied, undone or abandoned, and the current step (SUB-19, SUB-21, decision 13 Oct). A GeoJSON foreign member, so other tools still read the file as GeoJSON. Not content: left out of every content hash. Last in the file. A plot sent to a view or a tool never carries it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection']} })

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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })


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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
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
    title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    description: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacItemProperties',
                       'StacCatalog',
                       'MeasureGroup']} })
    debrief_schema_version: str = Field(default=..., alias="debrief:schema_version", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties', 'StacCatalog']} })
    debrief_participants: Optional[list[str]] = Field(default=None, alias="debrief:participants", description="""Platform names, for catalogue search (SUB-16).""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties']} })
    created: Optional[str] = Field(default=None, description="""When the item came into the catalogue (STAC common metadata): by import, as a received plot file, or as a copy. Items that came in after a plot can be new data for it (CAP-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties', 'CoverageItem']} })
    debrief_revision: Optional[str] = Field(default=None, alias="debrief:revision", description="""The content hash of the item's plot, its whole-plot details included, so any recorded change to the item is a new revision (CAP-12). Derived at each change, never authoritative, as the extent is.""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties']} })
    debrief_coverage: Optional[list[TrackCoverage]] = Field(default=None, alias="debrief:coverage", description="""The periods each of the item's tracks has data for (CAP-08), so a catalogue's coverage is read from its items alone. Derived at each change, never authoritative.""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties']} })
    debrief_drawn_from: Optional[list[ItemRef]] = Field(default=None, alias="debrief:drawn_from", description="""The catalogue items the plot's tracks take data from now, each at every revision a period of it was read at (CAP-12), from its tracks' supplies. Derived at each change, never authoritative.""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties']} })
    debrief_imported: Optional[bool] = Field(default=None, alias="debrief:imported", description="""Whether the item came in by importing source files: its history starts with a record naming the files it read. Only such items can be new data for a plot (CAP-10; decision, product owner, 16 Oct 2026). Derived at each change, never authoritative.""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties']} })
    debrief_origin: Optional[str] = Field(default=None, alias="debrief:origin", description="""The step_hash of the first step of the item's history: items that share it are copies of one plot, forked where their histories part (CAP-10). Derived at each change, never authoritative.""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties']} })
    debrief_revisions: Optional[list[str]] = Field(default=None, alias="debrief:revisions", description="""Every revision the item's history has had, each as the 16 symbols an image ID names it by (the first 80 bits of the content hash after each step, in Crockford's base 32), so an exported image is traced to its plot from the catalogue's items alone, never reading a plot that never had its revision (SUB-25). Derived at each change, never authoritative.""", json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties']} })

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

    @field_validator('created')
    def pattern_created(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid created format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid created format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('debrief_revision')
    def pattern_debrief_revision(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid debrief_revision format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid debrief_revision format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('debrief_origin')
    def pattern_debrief_origin(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid debrief_origin format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid debrief_origin format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('debrief_revisions')
    def pattern_debrief_revisions(cls, v):
        pattern=re.compile(r"^[0-9A-HJKMNP-TV-Z]{16}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid debrief_revisions format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid debrief_revisions format: {v}"
            raise ValueError(err_msg)
        return v


class TrackCoverage(ConfiguredBaseModel):
    """
    The periods one track of an item has data for (CAP-05, CAP-08): from its first fix to its last, broken at each gap (a time between two fixes more than ten times the track's median time between fixes, and more than five minutes).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    track: str = Field(default=..., description="""The track's feature id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    fixes: int = Field(default=..., ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackCoverage', 'CoverageSource']} })
    spans: list[TimeRange] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackCoverage', 'CoverageSource']} })


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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    geometry: Optional[Union[LineStringGeometry, PointGeometry, PolygonGeometry]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'PointGeometry'},
                    {'range': 'LineStringGeometry'},
                    {'range': 'PolygonGeometry'}],
         'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    bbox: Optional[conlist(min_length=4, max_length=4, item_type=float)] = Field(default=None, description="""[west, south, east, north] in WGS84 degrees.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 4}],
                   'exact_number_dimensions': 1},
         'domain_of': ['StacItem', 'Viewport']} })
    properties: StacItemProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
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
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    description: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacItemProperties',
                       'StacCatalog',
                       'MeasureGroup']} })
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

    current: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState', 'FigureSource', 'PlotHistory', 'HistoryHead']} })
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

    plot: str = Field(default=..., description="""Href of the plot the selection belongs to.""", json_schema_extra = { "linkml_meta": {'domain_of': ['Selection', 'WebviewMessage']} })
    feature_ids: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NamedSet', 'Selection']} })


class Viewport(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    bbox: conlist(min_length=4, max_length=4, item_type=float) = Field(default=..., description="""[west, south, east, north] in WGS84 degrees, independent of display projection.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 4}],
                   'exact_number_dimensions': 1},
         'domain_of': ['StacItem', 'Viewport']} })


class SharedState(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    time: TimeState = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'WebviewMessage']} })
    selection: Selection = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange', 'WebviewMessage']} })
    viewport: Viewport = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'WebviewMessage']} })


class SharedStateChange(ConfiguredBaseModel):
    """
    A change to some or all of shared state, as set by a view or returned by a tool (TL-10, TL-11).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    time: Optional[TimeState] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'WebviewMessage']} })
    selection: Optional[Selection] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange', 'WebviewMessage']} })
    viewport: Optional[Viewport] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'WebviewMessage']} })
    save_window: Optional[bool] = Field(default=None, description="""From a tool whose purpose is to set the time window: save time's range as the plot's window. Honoured only when the analyst ran the tool by hand on this plot; otherwise, and without it, a range beyond the saved window is shown, never saved (CAP-28). Needs time.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SharedStateChange']} })


class ToolDeclaration(ConfiguredBaseModel):
    """
    How a tool describes itself to Debrief, agents and hooks (TL-04, TL-06).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., description="""Dotted, unique across loaded libraries, for example core.smooth_track.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToolRef', 'InnerSchemaRef', 'ToolDeclaration']} })
    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    explanation: str = Field(default=..., description="""Short user-facing explanation of what the tool does (CAP-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration', 'ParameterDeclaration', 'MeasureDefinition']} })
    judgement: Optional[str] = Field(default=None, description="""Any judgement the tool involves, shown on its form (CAP-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration']} })
    applies_to: list[str] = Field(default=..., description="""Feature kinds from the taxonomy, or \"*\" for any (TL-06). Debrief offers a tool only if every selected item matches (TL-08).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration']} })
    min_selected: Optional[int] = Field(default=1, ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration'], 'ifabsent': 'int(1)'} })
    max_selected: Optional[int] = Field(default=None, ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration']} })
    parameters: Optional[list[ParameterDeclaration]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'ToolDeclaration', 'WebviewMessage']} })
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
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    explanation: Optional[str] = Field(default=None, description="""Shown beside the field on the form (CAP-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration', 'ParameterDeclaration', 'MeasureDefinition']} })
    kind: ParameterKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessage']} })
    quantity_kind: Optional[QuantityKindEnum] = Field(default=None, description="""Required when kind is quantity.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadColumn',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'MeasureDefinition']} })
    required: Optional[bool] = Field(default=True, json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterDeclaration'], 'ifabsent': 'True'} })
    default: Optional[Union[Angle, AngularRate, Duration, Length, Speed, bool, float, str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'float'},
                    {'range': 'string'},
                    {'range': 'boolean'},
                    {'range': 'Length'},
                    {'range': 'Speed'},
                    {'range': 'Angle'},
                    {'range': 'Duration'},
                    {'range': 'AngularRate'}],
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

    new_features: Optional[list[Union[AnnotationFeature, NarrativeFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'NarrativeFeature'}],
         'domain_of': ['ToolResult']} })
    modified_features: Optional[list[Union[AnnotationFeature, NarrativeFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'NarrativeFeature'}],
         'domain_of': ['ToolResult']} })
    deleted_feature_ids: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ToolResult']} })
    non_spatial: Optional[list[NonSpatialResult]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ToolResult']} })
    named_sets: Optional[list[NamedSet]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'ToolResult',
                       'HistoryStep',
                       'Delta']} })
    state_change: Optional[SharedStateChange] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ToolResult']} })


class NonSpatialResult(ConfiguredBaseModel):
    """
    A number, table or graph (TL-13), held column by column. A number is one column with one value; a graph plots its first column against the rest.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
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
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    quantity_kind: Optional[QuantityKindEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadColumn',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'MeasureDefinition']} })
    unit: Optional[str] = Field(default=None, description="""UCUM unit code, required when quantity_kind is given.""", json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn',
                       'MeasureValue']} })
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


class MeasureDefinition(ConfiguredBaseModel):
    """
    One measure the Tote can show. The core measures are Debrief's own; a study may add more (CAP-07), each worked out in Python.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., description="""Unique among measures, such as range or relative_bearing.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    title: str = Field(default=..., description="""Its name in full, for hover text and screen readers.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    label: str = Field(default=..., description="""Its row heading in the Tote, before the unit, short enough for a narrow view.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark', 'MeasureDefinition']} })
    subject: MeasureSubjectEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['MeasureDefinition']} })
    quantity_kind: QuantityKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadColumn',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'MeasureDefinition']} })
    display: MeasureDisplayEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['MeasureDefinition']} })
    explanation: Optional[str] = Field(default=None, description="""How it is worked out, in a sentence.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration', 'ParameterDeclaration', 'MeasureDefinition']} })

    @field_validator('id')
    def pattern_id(cls, v):
        pattern=re.compile(r"^[a-z][a-z0-9_]*$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid id format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid id format: {v}"
            raise ValueError(err_msg)
        return v


class MeasureGroup(ConfiguredBaseModel):
    """
    A named, reusable set of measures tied to a mode of analysis (CAP-07), shown by the Tote in this order. Every group extends the shared core: extends names the group it adds to (core itself extends nothing). A study's own groups will be defined by its lead analyst and kept in the study catalogue, shared by every plot in the study.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    description: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacItemProperties',
                       'StacCatalog',
                       'MeasureGroup']} })
    extends: Optional[str] = Field(default=None, description="""The group whose measures come first, before this one's own; left out for core.""", json_schema_extra = { "linkml_meta": {'domain_of': ['MeasureGroup']} })
    measures: list[str] = Field(default=..., description="""The ids of the measures shown, in order, those of the group it extends included.""", json_schema_extra = { "linkml_meta": {'domain_of': ['MeasureGroup', 'ToteResult']} })

    @field_validator('id')
    def pattern_id(cls, v):
        pattern=re.compile(r"^[a-z][a-z0-9_-]*$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid id format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid id format: {v}"
            raise ValueError(err_msg)
        return v


class ToteView(ConfiguredBaseModel):
    """
    Which tracks the Tote compares, and through which measure group: view state in the plot's island, like the time window, so it travels with the plot file but is never a step in its history and never undone (SUB-22; decision, 14 Oct 2026). Ids of tracks no longer in the plot are shown as missing, not refused, because a change to content never changes the island.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    primary: Optional[str] = Field(default=None, description="""The track the others are measured from; left out until one is chosen.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteView', 'ToteResult']} })
    secondaries: Optional[list[str]] = Field(default=None, description="""The tracks measured from the primary, in the order shown.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteView']} })
    measure_group: Optional[str] = Field(default=None, description="""The measure group shown; left out means core.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteView']} })
    map_lines: Optional[bool] = Field(default=None, description="""Whether the map draws a thin line from the primary to each secondary at current time; left out means it does (decision, 14 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteView']} })


class MeasureValue(ConfiguredBaseModel):
    """
    One measure's value at current time; value left out where it cannot be worked out (no depth recorded, say).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    measure: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['MeasureValue']} })
    value: Optional[float] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'ParameterValue',
                       'MeasureValue']} })
    unit: Optional[str] = Field(default=None, description="""The UCUM unit of value, such as m, deg or m/s; formatted for people by the views (SUB-04).""", json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn',
                       'MeasureValue']} })


class ToteRow(ConfiguredBaseModel):
    """
    One track in the Tote at current time.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    track: str = Field(default=..., description="""The track's feature id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry']} })
    name: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    colour: Optional[str] = Field(default=None, description="""The track's colour, lower-case hex, to key the row to the map.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TimelineEntry']} })
    status: ToteRowStatusEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow']} })
    note: Optional[str] = Field(default=None, description="""Why there are no values, for the analyst, such as \"Starts 09:30:00Z\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag']} })
    values: Optional[list[MeasureValue]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries', 'LengthSeries', 'ToteRow']} })

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


class ToteResult(ConfiguredBaseModel):
    """
    The Tote at one time: the primary's own measures, and each secondary's measures relative to the primary and its own, as debrief/tote returns them and the Tote view shows them.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    time: str = Field(default=..., description="""The time the values are for.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'WebviewMessage']} })
    group: MeasureGroup = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToteResult']} })
    measures: list[MeasureDefinition] = Field(default=..., description="""The definitions of the group's measures, in its order.""", json_schema_extra = { "linkml_meta": {'domain_of': ['MeasureGroup', 'ToteResult']} })
    primary: Optional[ToteRow] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ToteView', 'ToteResult']} })
    note: Optional[str] = Field(default=None, description="""What the analyst should know about the Tote as a whole, such as a measure group chosen that this plot's study does not have (core is shown instead).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag']} })
    rows: list[ToteRow] = Field(default=..., description="""One per secondary, in the order chosen.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteResult']} })

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


class ToteTrack(ConfiguredBaseModel):
    """
    A track the analyst can put in the Tote, as the Tote view lists them.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    colour: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TimelineEntry']} })

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


class UserConfig(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    config_version: int = Field(default=..., description="""Version of this file's layout: 1 while it holds only stores; 2 once it holds track_import_mode; 3 once it holds narrative_import. An earlier Debrief cannot read a later layout.""", ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['UserConfig']} })
    stores: list[KnownStore] = Field(default=..., description="""Known stores, in the order the analyst sees them (SUB-17).""", json_schema_extra = { "linkml_meta": {'domain_of': ['UserConfig']} })
    track_import_mode: Optional[TrackImportModeEnum] = Field(default=None, description="""How tracks imported are plotted, over the ground or by dead reckoning: ask (the default, also when left out), or otg or dr once the analyst chose \"Use this choice for future imports\" (CAP-01). The analyst may clear it, to be asked again.""", json_schema_extra = { "linkml_meta": {'domain_of': ['UserConfig']} })
    narrative_import: Optional[list[NarrativeImportAnswers]] = Field(default=None, description="""The analyst's last answers to the questions asked before a Word or PDF narrative is read into a plot, one set for each dialect, so they are offered again next time and confirmed with one key (CAP-19; product owner, 15 Oct 2026). User state, kept here and never in a catalogue or a plot file; importers are given the answers.""", json_schema_extra = { "linkml_meta": {'domain_of': ['UserConfig']} })


class NarrativeImportAnswers(ConfiguredBaseModel):
    """
    What the analyst answered for documents of one dialect: the types not read (so a type not seen before is read), whether only entries within the plot's period, and the track each platform was said to be.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    dialect: str = Field(default=..., description="""The dialect, such as narrative-document or rider-narrative.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers']} })
    skip_types: Optional[list[str]] = Field(default=None, description="""Entry types the analyst chose not to read; \"\" for entries with no type.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers']} })
    within_period: Optional[bool] = Field(default=None, description="""Only the entries within the plot's tracks' period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers', 'NewDataMark']} })
    tracks: Optional[list[PlatformTrack]] = Field(default=None, description="""The track the analyst said each platform is, by the track's name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers', 'CoverageItem']} })

    @field_validator('dialect')
    def pattern_dialect(cls, v):
        pattern=re.compile(r"^[a-z][a-z0-9-]{0,63}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid dialect format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid dialect format: {v}"
            raise ValueError(err_msg)
        return v


class PlatformTrack(ConfiguredBaseModel):
    """
    A platform, as a document names it, and the track it was said to be.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    platform: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlatformTrack']} })
    track: Optional[str] = Field(default=None, description="""The track's name; left out, the platform belongs to no track.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry']} })


class KnownStore(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., description="""Unique within this file; stable when the store is renamed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    title: str = Field(default=..., description="""The name the analyst sees.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    kind: StoreKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessage']} })
    location: str = Field(default=..., description="""Absolute path to the folder holding catalog.json: a POSIX path, a Windows drive path or a UNC share.""", json_schema_extra = { "linkml_meta": {'domain_of': ['KnownStore']} })
    read_only: Optional[bool] = Field(default=None, description="""When true, Debrief offers no action that would write to the store. A courtesy, not access control: filesystem permissions decide that (SEC-01).""", json_schema_extra = { "linkml_meta": {'domain_of': ['KnownStore']} })

    @field_validator('id')
    def pattern_id(cls, v):
        pattern=re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid id format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid id format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('location')
    def pattern_location(cls, v):
        pattern=re.compile(r"^(/|[A-Za-z]:[\\/]|\\\\[^\\])")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid location format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid location format: {v}"
            raise ValueError(err_msg)
        return v


class CoverageReport(ConfiguredBaseModel):
    """
    Coverage for one plot (CAP-08, CAP-09): its platforms with every source of data for each, the items in the folder tree it draws from with their marks, and whether the plot itself may need review.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    catalogue: str = Field(default=..., description="""The plot's catalogue, by its own id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    item: str = Field(default=..., description="""The plot's item id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    start: Optional[str] = Field(default=None, description="""The earliest time any source shown has data.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry']} })
    end: Optional[str] = Field(default=None, description="""The latest time any source shown has data.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry']} })
    platforms: list[CoveragePlatform] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageReport', 'NewDataMark']} })
    items: list[CoverageItem] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageReport']} })
    review: Optional[ReviewFlag] = Field(default=None, description="""The plot drew from items since revised, so it may need review (CAP-12).""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageReport']} })
    note: Optional[str] = Field(default=None, description="""Anything the analyst should know about what is shown.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag']} })

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


class CoveragePlatform(ConfiguredBaseModel):
    """
    One of the plot's tracks, and every source of data for its platform.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    track: str = Field(default=..., description="""The track's feature id in the plot.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    colour: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TimelineEntry']} })
    sources: list[CoverageSource] = Field(default=..., description="""The plot's own data first, then items' tracks linked or proposed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoveragePlatform', 'CoveragePeriod']} })
    periods: list[CoveragePeriod] = Field(default=..., description="""The track's time cut where the sources with data change, in time order: each with the sources that have data then and the one that supplies it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoveragePlatform']} })

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


class CoverageSource(ConfiguredBaseModel):
    """
    A track in a catalogue item with data for the platform.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    catalogue: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    track: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry']} })
    name: str = Field(default=..., description="""The track's name in that item.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'TrackCoverage',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'CoverageSource']} })
    title: str = Field(default=..., description="""The item's title.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    link: CoverageLinkEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageSource']} })
    fixes: int = Field(default=..., ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackCoverage', 'CoverageSource']} })
    spans: list[TimeRange] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackCoverage', 'CoverageSource']} })
    revised: Optional[bool] = Field(default=None, description="""The plot took data from this item at a revision it no longer has.""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageSource', 'CoverageItem', 'ReviewFlag']} })


class CoveragePeriod(ConfiguredBaseModel):
    """
    A period in which the same sources have data for a platform.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    start: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry']} })
    end: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry']} })
    sources: list[int] = Field(default=..., description="""The platform's sources with data throughout the period, by their place in its list.""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoveragePlatform', 'CoveragePeriod']} })
    chosen: Optional[int] = Field(default=None, description="""The source supplying the period; left out where the plot has none of its data yet.""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoveragePeriod']} })

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


class CoverageItem(ConfiguredBaseModel):
    """
    A catalogue item in the folder tree the plot draws from.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    catalogue: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    role: CoverageItemRoleEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageItem']} })
    created: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties', 'CoverageItem']} })
    start: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry']} })
    end: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry']} })
    revision: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource']} })
    tracks: Optional[list[TrackCoverage]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers', 'CoverageItem']} })
    new_data: Optional[NewDataMark] = Field(default=None, description="""Marked as new data for the plot (CAP-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageItem']} })
    revised: Optional[bool] = Field(default=None, description="""The plot took data from this item at a revision it no longer has (CAP-12).""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageSource', 'CoverageItem', 'ReviewFlag']} })

    @field_validator('created')
    def pattern_created(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid created format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid created format: {v}"
            raise ValueError(err_msg)
        return v

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

    @field_validator('revision')
    def pattern_revision(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid revision format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid revision format: {v}"
            raise ValueError(err_msg)
        return v


class NewDataMark(ConfiguredBaseModel):
    """
    Why an item is marked as new data for a plot (CAP-10): it came in after the plot, through Debrief's import, within the folder tree the plot draws from, and has data for the plot's platforms or within its period; the plot has not taken it or set it aside at this revision.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    revision: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource']} })
    platforms: Optional[list[str]] = Field(default=None, description="""The plot's tracks it has data for.""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageReport', 'NewDataMark']} })
    within_period: Optional[bool] = Field(default=None, description="""It has data within the plot's period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers', 'NewDataMark']} })
    note: str = Field(default=..., description="""What the mark says, for its tooltip and screen readers.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag']} })

    @field_validator('revision')
    def pattern_revision(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid revision format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid revision format: {v}"
            raise ValueError(err_msg)
        return v


class ReviewFlag(ConfiguredBaseModel):
    """
    A product that drew from catalogue items since revised, so may need review (CAP-12), until the analyst clears it.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    catalogue: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    revised: list[ItemRef] = Field(default=..., description="""Each item revised since the product took data from it, at its revision now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageSource', 'CoverageItem', 'ReviewFlag']} })
    note: str = Field(default=..., description="""What the flag says, for its tooltip and screen readers.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag']} })


class ImageExport(ConfiguredBaseModel):
    """
    One image exported from a plot, as the plot's export log records it in its island: view state, never a step (decision, product owner, 16 Oct 2026). What the analyst exported, so the image can be traced and its view shown again.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., description="""The image's ID, in full.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    revision: str = Field(default=..., description="""The plot's revision exported (its content hash): the step it was exported at.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource']} })
    at: str = Field(default=..., description="""When it was exported.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision', 'ImageExport']} })
    by: Optional[str] = Field(default=None, description="""Who exported it: the agent's name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision', 'ImageExport']} })
    format: ImageFormatEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef', 'ImageExport', 'ImageRequest', 'RenderedImage']} })
    file: Optional[str] = Field(default=None, description="""The file's name, without its folder.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport']} })
    footer: bool = Field(default=..., description="""Whether the image shows its ID in a footer.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport']} })
    preset: Optional[ImagePresetEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'ImageRequest']} })
    theme: Optional[ImageThemeEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'ImageRequest']} })
    width: Optional[int] = Field(default=None, description="""Its width in pixels.""", ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'RenderedImage']} })
    height: Optional[int] = Field(default=None, description="""Its height in pixels.""", ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'RenderedImage']} })
    viewport: Optional[Viewport] = Field(default=None, description="""The area of the map exported.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'WebviewMessage']} })
    time: Optional[TimeState] = Field(default=None, description="""Current time and the time window when it was exported.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'WebviewMessage']} })
    tote: Optional[ToteView] = Field(default=None, description="""Which tracks the Tote compared when it was exported, so the plot traced from the image shows the Tote, and its lines on the map, as the figure did (decision, product owner, 16 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView', 'ImageExport', 'WebviewMessage']} })

    @field_validator('id')
    def pattern_id(cls, v):
        pattern=re.compile(r"^DBF1-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{16}-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid id format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid id format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('revision')
    def pattern_revision(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid revision format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid revision format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('at')
    def pattern_at(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid at format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid at format: {v}"
            raise ValueError(err_msg)
        return v


class ImageRequest(ConfiguredBaseModel):
    """
    What the host asks the map to draw for an export (export_image).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    format: ImageFormatEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef', 'ImageExport', 'ImageRequest', 'RenderedImage']} })
    preset: ImagePresetEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'ImageRequest']} })
    theme: ImageThemeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'ImageRequest']} })
    footer_text: Optional[str] = Field(default=None, description="""The image's ID in its short form, to draw in a corner; left out for no footer.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ImageRequest']} })

    @field_validator('footer_text')
    def pattern_footer_text(cls, v):
        pattern=re.compile(r"^DBF-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid footer_text format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid footer_text format: {v}"
            raise ValueError(err_msg)
        return v


class RenderedImage(ConfiguredBaseModel):
    """
    The image the map drew (image_rendered), before its ID goes into its metadata.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    format: ImageFormatEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef', 'ImageExport', 'ImageRequest', 'RenderedImage']} })
    data: str = Field(default=..., description="""A PNG as base 64, or an SVG as its text.""", json_schema_extra = { "linkml_meta": {'domain_of': ['RenderedImage']} })
    width: int = Field(default=..., ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'RenderedImage']} })
    height: int = Field(default=..., ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'RenderedImage']} })
    viewport: Optional[Viewport] = Field(default=None, description="""The area of the map drawn.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'WebviewMessage']} })
    notes: Optional[list[str]] = Field(default=None, description="""What the image leaves out that the map shows, for the analyst: reference tiles that could not be read, say.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'RenderedImage']} })


class RevisionShown(ConfiguredBaseModel):
    """
    The plot is shown as it was at an earlier revision, read-only: the one an image was exported at (show_plot).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    step: int = Field(default=..., description="""The step whose revision is shown.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown', 'FigureSource']} })
    latest: int = Field(default=..., description="""The plot's current step now.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown', 'HistoryHead']} })
    revision: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource']} })
    figure: Optional[str] = Field(default=None, description="""The image's ID, in its short form, when one was traced.""", json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown']} })

    @field_validator('revision')
    def pattern_revision(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid revision format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid revision format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('figure')
    def pattern_figure(cls, v):
        pattern=re.compile(r"^DBF-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid figure format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid figure format: {v}"
            raise ValueError(err_msg)
        return v


class FigureSource(ConfiguredBaseModel):
    """
    Where an image came from: a plot in one of the analyst's catalogues, at the revision the image was exported at (Find source of image).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    store: Optional[str] = Field(default=None, description="""The catalogue's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource']} })
    store_title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource']} })
    catalogue: str = Field(default=..., description="""The catalogue's own id, from its catalog.json.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'KnownStore',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource']} })
    revision: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource']} })
    step: int = Field(default=..., description="""The step at that revision.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown', 'FigureSource']} })
    current: int = Field(default=..., description="""The plot's current step now.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState', 'FigureSource', 'PlotHistory', 'HistoryHead']} })
    copied: Optional[bool] = Field(default=None, description="""The image's plot key names another plot: this is a copy of it with the same content at that revision (a colleague's, or one moved to another catalogue).""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource']} })
    export: Optional[ImageExport] = Field(default=None, description="""The export log entry for the image, where the plot's log or the analyst's own has one. A footer's short form may name several exports of one revision: each is a source of its own, to choose from.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource', 'LoggedExport']} })

    @field_validator('revision')
    def pattern_revision(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid revision format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid revision format: {v}"
            raise ValueError(err_msg)
        return v


class LoggedExport(ConfiguredBaseModel):
    """
    An export recorded in the analyst's own export log, beside their Debrief configuration, where the plot's could not be written (a read-only catalogue, say), so every export stays traceable (decision, product owner, 16 Oct 2026).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    catalogue: str = Field(default=..., description="""The catalogue's own id, from its catalog.json.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport']} })
    export: ImageExport = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource', 'LoggedExport']} })


class ExportLog(ConfiguredBaseModel):
    """
    The analyst's own export log, exports.json beside their Debrief configuration: the newest 2,000 exports their plots could not keep.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    exports: Optional[list[LoggedExport]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView', 'ExportLog']} })


class TimelineEntry(ConfiguredBaseModel):
    """
    One row of the Timeline (CAP-05, CAP-20): a narrative entry, a time-only annotation (a note or a period) or a comment on a track's fix, as the Timeline lists them, in one time order.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., description="""The narrative entry's or annotation's feature id, or fix:<track>:<time> for a fix's comment.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'MeasureDefinition',
                       'MeasureGroup',
                       'ToteTrack',
                       'KnownStore',
                       'ImageExport',
                       'TimelineEntry']} })
    kind: TimelineEntryKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessage']} })
    start: str = Field(default=..., description="""Its time, or the start of its period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry']} })
    end: Optional[str] = Field(default=None, description="""The end of its period; left out for a single time.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry']} })
    source: str = Field(default=..., description="""Who wrote a narrative entry; an annotation's name; the track a fix comment is on; the item supplying a period of data.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'WebviewMessage']} })
    entry_type: Optional[str] = Field(default=None, description="""A narrative entry's type, in its source's words.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties', 'NarrativeSpec', 'TimelineEntry']} })
    text: Optional[str] = Field(default=None, description="""Its text.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry']} })
    track: Optional[str] = Field(default=None, description="""The track it belongs to: a narrative entry's track, or a fix's.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry']} })
    colour: Optional[str] = Field(default=None, description="""That track's colour, lower-case hex RGB.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TimelineEntry']} })
    hidden: Optional[bool] = Field(default=None, description="""An annotation or track hidden on the map.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'TimelineEntry']} })

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


class WebviewMessage(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: WebviewMessageKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessage']} })
    plot: Optional[DebriefFeatureCollection] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['Selection', 'WebviewMessage']} })
    plot_title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    hidden_count: Optional[int] = Field(default=None, description="""How many of the plot's features are hidden on the map (SUB-22), so the map can say so.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    selection: Optional[Selection] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange', 'WebviewMessage']} })
    viewport: Optional[Viewport] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'WebviewMessage']} })
    time: Optional[TimeState] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'WebviewMessage']} })
    saved_window: Optional[TimeRange] = Field(default=None, description="""The time window as saved in the plot, so the time controller can say when the window shown differs from it (CAP-28).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    context_tracks: Optional[ContextTracksEnum] = Field(default=None, description="""How tracks outside the time window are drawn (CAP-29).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView', 'WebviewMessage']} })
    minimum_context_contrast: Optional[bool] = Field(default=None, description="""The analyst's setting that shows faint context tracks as visible, so the time controller can say so.""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    time_range: Optional[TimeRange] = Field(default=None, description="""The plot's period, so times can be entered as the analyst reads them (show_form) and the time window set within it (show_time); the time window to save (window_changed); or the period whose source the analyst chose (source_chosen).""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'WebviewMessage']} })
    current_time: Optional[str] = Field(default=None, description="""Current time from shared state, which a tool form offers for its time fields.""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    tool: Optional[ToolDeclaration] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'WebviewMessage']} })
    selected_names: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    tool_name: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    parameters: Optional[list[ParameterValue]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'ToolDeclaration', 'WebviewMessage']} })
    message: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    result_title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    result: Optional[ToolResult] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    annotation: Optional[AnnotationSpec] = Field(default=None, description="""An annotation as the form describes it (show_annotation_form, save_annotation), as drawn on the map (annotation_drawn), or as changed on the map (edit_annotation).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    feature_id: Optional[str] = Field(default=None, description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    track_edit: Optional[TrackEdit] = Field(default=None, description="""How the analyst moved, rotated, sheared or stretched a track, or moved one of its fixes, on the map (edit_track).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    fix_times: Optional[list[str]] = Field(default=None, description="""The times of the fixes the map rings (show_fixes).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    fix_time: Optional[str] = Field(default=None, description="""The time of the fix the analyst chose on the map (fix_chosen).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit', 'WebviewMessage']} })
    preview: Optional[LineStringGeometry] = Field(default=None, description="""A track as a change would leave it, one position per fix, drawn beside it until the analyst applies or cancels the change (show_fixes).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    tote: Optional[ToteResult] = Field(default=None, description="""The Tote's values at current time (show_tote).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView', 'ImageExport', 'WebviewMessage']} })
    tote_view: Optional[ToteView] = Field(default=None, description="""Which tracks the Tote compares, as saved in the plot (show_tote, set_tote) or as the analyst chose (tote_changed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    timeline_entries: Optional[list[TimelineEntry]] = Field(default=None, description="""The Timeline's rows, in its order (show_timeline).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    timeline_entry: Optional[TimelineEntry] = Field(default=None, description="""The narrative entry current time is at, to show on the map beside its track (set_narrative).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    plot_id: Optional[str] = Field(default=None, description="""Which plot is open, as its host knows it (show_timeline): a list read again for the same plot keeps the reader's place; another plot is read from current time.""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    narrative_on_map: Optional[bool] = Field(default=None, description="""Whether the map shows the narrative entry current time is at beside its track (show_timeline, narrative_on_map_changed): the plot's PlotView.narrative_on_map; left out means it does.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView', 'WebviewMessage']} })
    playing: Optional[bool] = Field(default=None, description="""Whether current time is playing (playing_changed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    timeline_tracks: Optional[list[ToteTrack]] = Field(default=None, description="""The plot's tracks, which a narrative entry can belong to (show_timeline).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    narrative: Optional[NarrativeSpec] = Field(default=None, description="""A narrative entry as the Timeline's form describes it (save_narrative).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    tote_tracks: Optional[list[ToteTrack]] = Field(default=None, description="""The plot's tracks, which the analyst can choose from for the Tote (show_tote).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    coverage: Optional[CoverageReport] = Field(default=None, description="""The open plot's coverage (show_coverage).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    source: Optional[SourceTrackRef] = Field(default=None, description="""A track in a catalogue item (source_chosen, link_changed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'WebviewMessage']} })
    linked: Optional[bool] = Field(default=None, description="""Whether the source is the track's platform (link_changed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    item_revision: Optional[ItemRevision] = Field(default=None, description="""The item, at the revision the analyst saw (take_asked, dismiss_asked).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    image_request: Optional[ImageRequest] = Field(default=None, description="""What image to draw, and how (export_image).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    image: Optional[RenderedImage] = Field(default=None, description="""The image the map drew (image_rendered).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    revision_shown: Optional[RevisionShown] = Field(default=None, description="""The plot shown is an earlier revision, read-only (show_plot).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })

    @field_validator('current_time')
    def pattern_current_time(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid current_time format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid current_time format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('fix_times')
    def pattern_fix_times(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid fix_times format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid fix_times format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('fix_time')
    def pattern_fix_time(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid fix_time format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid fix_time format: {v}"
            raise ValueError(err_msg)
        return v


class PlotHistory(ConfiguredBaseModel):
    """
    A plot's whole history, kept in its plot file as the top-level member history (decision 13 Oct). Steps are numbered from 1 with no gaps, in the order they were made.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    current: int = Field(default=..., description="""The step the plot's content reflects; 0 for none (an empty plot). Never an abandoned step.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState', 'FigureSource', 'PlotHistory', 'HistoryHead']} })
    head_hash: str = Field(default=..., description="""The last step's step_hash, or the starting value for a history with no steps, so a step removed from the end is noticed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotHistory']} })
    steps: list[HistoryStep] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotHistory']} })

    @field_validator('head_hash')
    def pattern_head_hash(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid head_hash format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid head_hash format: {v}"
            raise ValueError(err_msg)
        return v


class HistoryStep(ConfiguredBaseModel):
    """
    One recorded change to a plot, in its plot file's history.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    seq: int = Field(default=..., description="""Position in the plot's history, from 1, with no gaps.""", ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    state: StepStateEnum = Field(default=..., description="""Applied, undone or abandoned: what the after links and the history's current step say. Not part of step_hash, since undo changes it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep']} })
    after: int = Field(default=..., description="""The step this one was applied on top of (0 for the first). Replay follows these links back from a step to the first.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    records: list[ProvRecord] = Field(default=..., description="""The operation that made the change. Usually one; a baseline step, taken when a plot made outside Debrief is first opened, carries all the plot's earlier records.""", min_length=1, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    added: Optional[list[Union[AnnotationFeature, NarrativeFeature, PlotFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, description="""Features added. A whole-plot feature here never carries its view: the island is not content (SUB-22).""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'NarrativeFeature'},
                    {'range': 'PlotFeature'}],
         'domain_of': ['HistoryStep', 'Delta']} })
    modified: Optional[list[Union[AnnotationFeature, NarrativeFeature, PlotFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, description="""Features changed, in full, replacing those with the same id.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'NarrativeFeature'},
                    {'range': 'PlotFeature'}],
         'domain_of': ['HistoryStep', 'Delta']} })
    deleted_ids: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    named_sets: Optional[list[NamedSet]] = Field(default=None, description="""Named sets added or replaced, by id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'ToolResult',
                       'HistoryStep',
                       'Delta']} })
    deleted_named_set_ids: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    order: Optional[list[str]] = Field(default=None, description="""Feature ids in the order the plot holds them after this change, when that is not the natural order (features kept in place, added ones last).""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    result_hash: str = Field(default=..., description="""Hash of the plot's content after this step: the plot file with its island and its history left out, as Debrief writes it (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    step_hash: str = Field(default=..., description="""SHA-256 of this step's canonical JSON, without step_hash and state, followed by the previous step's step_hash (see the module description).""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep']} })

    @field_validator('result_hash')
    def pattern_result_hash(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid result_hash format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid result_hash format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('step_hash')
    def pattern_step_hash(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid step_hash format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid step_hash format: {v}"
            raise ValueError(err_msg)
        return v


class Delta(ConfiguredBaseModel):
    """
    One recorded change, in the earlier layout: a file of its own in the plot's history folder. Read only to move a history into its plot file.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    schema_version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection', 'Delta', 'HistoryHead']} })
    seq: int = Field(default=..., description="""Position in the plot's history, from 1, with no gaps.""", ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    after: int = Field(default=..., description="""The delta this one was applied on top of (0 for the first).""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    records: list[ProvRecord] = Field(default=..., description="""The operation that made the change.""", min_length=1, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    added: Optional[list[Union[AnnotationFeature, NarrativeFeature, PlotFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, description="""Features added, never with the whole-plot feature's view.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'NarrativeFeature'},
                    {'range': 'PlotFeature'}],
         'domain_of': ['HistoryStep', 'Delta']} })
    modified: Optional[list[Union[AnnotationFeature, NarrativeFeature, PlotFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, description="""Features changed, in full, replacing those with the same id.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'NarrativeFeature'},
                    {'range': 'PlotFeature'}],
         'domain_of': ['HistoryStep', 'Delta']} })
    deleted_ids: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    named_sets: Optional[list[NamedSet]] = Field(default=None, description="""Named sets added or replaced, by id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'ToolResult',
                       'HistoryStep',
                       'Delta']} })
    deleted_named_set_ids: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    order: Optional[list[str]] = Field(default=None, description="""Feature ids in the order the plot holds them after this change.""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })
    result_hash: str = Field(default=..., description="""Content hash of the plot file after this delta, island left out.""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta']} })

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

    @field_validator('result_hash')
    def pattern_result_hash(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid result_hash format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid result_hash format: {v}"
            raise ValueError(err_msg)
        return v


class HistoryHead(ConfiguredBaseModel):
    """
    Where a plot's history stood, in the earlier layout (history/head.json). Read only to move a history into its plot file.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    schema_version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection', 'Delta', 'HistoryHead']} })
    current: int = Field(default=..., description="""Sequence number of the last delta the plot reflects; 0 for none.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState', 'FigureSource', 'PlotHistory', 'HistoryHead']} })
    latest: int = Field(default=..., description="""Highest sequence number written.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown', 'HistoryHead']} })
    abandoned: Optional[list[int]] = Field(default=None, description="""Deltas undone and then superseded by a new change.""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryHead']} })
    plot_hash: str = Field(default=..., description="""Content hash the plot file has when it reflects current, island left out.""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryHead']} })

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

    @field_validator('plot_hash')
    def pattern_plot_hash(cls, v):
        pattern=re.compile(r"^sha256:[0-9a-f]{64}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid plot_hash format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid plot_hash format: {v}"
            raise ValueError(err_msg)
        return v


# Model rebuild
# see https://pydantic-docs.helpmanual.io/usage/models/#rebuilding-a-model
Length.model_rebuild()
Speed.model_rebuild()
Angle.model_rebuild()
Duration.model_rebuild()
AngularRate.model_rebuild()
SpeedSeries.model_rebuild()
AngleSeries.model_rebuild()
LengthSeries.model_rebuild()
TimeRange.model_rebuild()
ParameterValue.model_rebuild()
PointGeometry.model_rebuild()
LineStringGeometry.model_rebuild()
PolygonGeometry.model_rebuild()
ProvRecord.model_rebuild()
ToolRef.model_rebuild()
AgentRef.model_rebuild()
SourceRef.model_rebuild()
ItemRef.model_rebuild()
TrackFeature.model_rebuild()
TrackProperties.model_rebuild()
SourceTrackRef.model_rebuild()
TrackSupply.model_rebuild()
TrackStyle.model_rebuild()
FixMark.model_rebuild()
TrackEdit.model_rebuild()
AnnotationFeature.model_rebuild()
AnnotationProperties.model_rebuild()
AnnotationAppearance.model_rebuild()
AnnotationSpec.model_rebuild()
NarrativeFeature.model_rebuild()
NarrativeProperties.model_rebuild()
NarrativeSpec.model_rebuild()
SensorObservationsFeature.model_rebuild()
SensorObservationsProperties.model_rebuild()
PayloadRef.model_rebuild()
InnerSchemaRef.model_rebuild()
PayloadColumn.model_rebuild()
PlotFeature.model_rebuild()
PlotProperties.model_rebuild()
PlotView.model_rebuild()
CollationView.model_rebuild()
ItemRevision.model_rebuild()
NamedSet.model_rebuild()
DebriefFeatureCollection.model_rebuild()
StacLink.model_rebuild()
StacAsset.model_rebuild()
StacItemProperties.model_rebuild()
TrackCoverage.model_rebuild()
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
MeasureDefinition.model_rebuild()
MeasureGroup.model_rebuild()
ToteView.model_rebuild()
MeasureValue.model_rebuild()
ToteRow.model_rebuild()
ToteResult.model_rebuild()
ToteTrack.model_rebuild()
UserConfig.model_rebuild()
NarrativeImportAnswers.model_rebuild()
PlatformTrack.model_rebuild()
KnownStore.model_rebuild()
CoverageReport.model_rebuild()
CoveragePlatform.model_rebuild()
CoverageSource.model_rebuild()
CoveragePeriod.model_rebuild()
CoverageItem.model_rebuild()
NewDataMark.model_rebuild()
ReviewFlag.model_rebuild()
ImageExport.model_rebuild()
ImageRequest.model_rebuild()
RenderedImage.model_rebuild()
RevisionShown.model_rebuild()
FigureSource.model_rebuild()
LoggedExport.model_rebuild()
ExportLog.model_rebuild()
TimelineEntry.model_rebuild()
WebviewMessage.model_rebuild()
PlotHistory.model_rebuild()
HistoryStep.model_rebuild()
Delta.model_rebuild()
HistoryHead.model_rebuild()

# Classes that accept undeclared properties (extra_slots), added by the generator.
StacAsset.model_config["extra"] = "allow"
StacItemProperties.model_config["extra"] = "allow"
StacAsset.model_rebuild(force=True)
StacItemProperties.model_rebuild(force=True)
StacItem.model_rebuild(force=True)
