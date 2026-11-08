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
version = "0.0.24"


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
    sensor = "sensor"
    """
    A sensor carried by a track, such as a bow sonar or a towed array: its name, its host track, its colour (CAP-22).
    """
    sensor_cut = "sensor_cut"
    """
    One cut of a sensor: a bearing (perhaps with its ambiguous twin) at a time, drawn from the host track's position then (CAP-22).
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


class SensorKindEnum(str, Enum):
    sensor = "sensor"


class SensorCutKindEnum(str, Enum):
    sensor_cut = "sensor_cut"


class ArrayModeEnum(str, Enum):
    """
    How a towed array's position follows the ship (CAP-22; product owner, 24 Oct 2026), legacy Debrief's array centre modes.
    """
    worm_in_hole = "worm_in_hole"
    """
    The array is its offset back along the ship's own past track, so it lags through a turn (legacy Worm in hole, its default). Before the track's first fix, astern along the first fix's course.
    """
    plain = "plain"
    """
    The array is its offset straight astern of the ship's position, along its course at that time (legacy Plain).
    """


class SensorCutKeptEnum(str, Enum):
    """
    Which of an ambiguous cut's two recorded bearings the analyst kept (CAP-22): the side resolved. Recorded as the bearing kept, not as port or starboard, because which side a bearing is on depends on the host track's course at the cut's time, which a later edit of the track (a move, dead reckoning) can change; what the analyst judged is which bearing was the target's. Debrief says it as port or starboard.
    """
    bearing = "bearing"
    """
    The bearing recorded first (bearing) is the target's; the other was its mirror image.
    """
    ambiguous_bearing = "ambiguous_bearing"
    """
    The ambiguous bearing (ambiguous_bearing) is the target's: the cut is drawn along it.
    """


class AmbiguityKeepEnum(str, Enum):
    """
    What the analyst asks of ambiguous cuts (CAP-22): keep the bearing to port or to starboard of the host track's course at each cut's time, as legacy Debrief's Keep port bearing and Keep starboard bearing decide it (by the side of the bearing recorded first); keep the bearing recorded first, or its ambiguous twin, as the analyst clicked it on the map; or make the cuts ambiguous again.
    """
    port = "port"
    """
    Keep the bearing to port of the host's course.
    """
    starboard = "starboard"
    """
    Keep the bearing to starboard of the host's course.
    """
    bearing = "bearing"
    """
    Keep the bearing recorded first.
    """
    ambiguous_bearing = "ambiguous_bearing"
    """
    Keep the ambiguous bearing.
    """
    ambiguous = "ambiguous"
    """
    Undo the resolution: both bearings again, unresolved.
    """


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


class SideEnum(str, Enum):
    """
    Which side of the host's course a bearing is on (CAP-22).
    """
    port = "port"
    starboard = "starboard"


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
    """
    Every webview message's kind. Each has one class below, which says what the message is for and which members it carries.
    """
    ready = "ready"
    show_plot = "show_plot"
    set_selection = "set_selection"
    selection_changed = "selection_changed"
    set_time = "set_time"
    time_changed = "time_changed"
    set_viewport = "set_viewport"
    viewport_changed = "viewport_changed"
    show_hidden = "show_hidden"
    show_form = "show_form"
    run_tool = "run_tool"
    cancel = "cancel"
    form_busy = "form_busy"
    form_error = "form_error"
    show_results = "show_results"
    show_time = "show_time"
    window_changed = "window_changed"
    context_changed = "context_changed"
    set_context = "set_context"
    show_annotation_form = "show_annotation_form"
    save_annotation = "save_annotation"
    delete_annotation = "delete_annotation"
    edit_annotation = "edit_annotation"
    annotation_drawn = "annotation_drawn"
    edit_track = "edit_track"
    show_fixes = "show_fixes"
    show_tote = "show_tote"
    tote_changed = "tote_changed"
    set_tote = "set_tote"
    show_timeline = "show_timeline"
    narrative_on_map_changed = "narrative_on_map_changed"
    playing_changed = "playing_changed"
    timeline_chosen = "timeline_chosen"
    save_narrative = "save_narrative"
    delete_narrative = "delete_narrative"
    open_narrative_form = "open_narrative_form"
    narrative_saved = "narrative_saved"
    set_narrative = "set_narrative"
    undo_asked = "undo_asked"
    redo_asked = "redo_asked"
    fix_chosen = "fix_chosen"
    show_coverage = "show_coverage"
    source_chosen = "source_chosen"
    link_changed = "link_changed"
    take_asked = "take_asked"
    dismiss_asked = "dismiss_asked"
    review_cleared = "review_cleared"
    export_image = "export_image"
    image_rendered = "image_rendered"
    latest_asked = "latest_asked"
    resolve_asked = "resolve_asked"
    cut_chosen = "cut_chosen"
    show_tma = "show_tma"
    tma_chosen = "tma_chosen"
    tma_create = "tma_create"
    tma_guess = "tma_guess"
    tma_guessed = "tma_guessed"
    tma_preview = "tma_preview"
    tma_exclude = "tma_exclude"
    tma_split = "tma_split"
    tma_time_asked = "tma_time_asked"
    tma_select = "tma_select"
    tma_menu = "tma_menu"
    tma_resolve = "tma_resolve"
    tma_cut_off = "tma_cut_off"
    tma_plot_drawn = "tma_plot_drawn"
    tma_panes = "tma_panes"
    tma_made = "tma_made"


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


class DuplicatesEnum(str, Enum):
    """
    What to do with a file's entries the plot has already.
    """
    skip = "skip"
    """
    Read only the entries not in the plot.
    """
    add = "add"
    """
    Read them all again.
    """


class ExportLoggedEnum(str, Enum):
    """
    Where an export is recorded.
    """
    plot = "plot"
    """
    The plot's export log, in its island.
    """
    user = "user"
    """
    The analyst's own export log, where the plot's could not be written.
    """


class HostRequestKindEnum(str, Enum):
    """
    What the service asks of a host (VS Code).
    """
    export_image = "export_image"
    """
    An agent's export, for the open map to draw.
    """


class MatchedByEnum(str, Enum):
    """
    How a file's track name was matched to one of the plot's tracks.
    """
    name = "name"
    """
    By its name, ignoring case.
    """
    prefix = "prefix"
    """
    By its first six letters: to be confirmed.
    """


class SplitSideEnum(str, Enum):
    """
    Which side of the fix at the time given a split falls.
    """
    before = "before"
    """
    The fix starts the new leg.
    """
    after = "after"
    """
    The fix ends the earlier leg.
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
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    end: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })

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
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    kind: ProvActivityKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
    started_at: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    ended_at: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    tool: Optional[ToolRef] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'ShowFormMessage',
                       'ShowResultsMessage',
                       'ListedStep']} })
    agent: AgentRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })
    parameters: Optional[list[ParameterValue]] = Field(default=None, description="""Parameter values the operation ran with, so replay can repeat it (SUB-19).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'ToolDeclaration', 'RunToolMessage']} })
    selected: Optional[list[str]] = Field(default=None, description="""Ids of the features the operation was applied to, in selection order, so replay can repeat it (SUB-19).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    used: Optional[list[SourceRef]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'TmaResidualRow']} })
    seed: Optional[int] = Field(default=None, description="""Random seed, for operations that use randomness (SUB-20).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    notes: Optional[list[str]] = Field(default=None, description="""Free-text notes such as truncations or omitted content (EXT-14, EXT-15).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })
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
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
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
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    model: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AgentRef']} })


class SourceRef(ConfiguredBaseModel):
    """
    An immutable source file read by an operation (SUB-10, SUB-11).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'class_uri': 'prov:Entity',
         'from_schema': 'https://debrief.info/schemas/debrief'})

    href: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef', 'StacLink', 'StacAsset']} })
    content_hash: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef', 'NarrativePreview', 'SensorPreview']} })

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
                       'LoggedExport',
                       'ItemAsked']} })
    item: str = Field(default=..., description="""The item's id in that catalogue.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    revision: str = Field(default=..., description="""The item's revision when it was read: the content hash of its plot (its whole-plot details included), so any recorded change to the item, of data or details, is a new revision.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })

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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    geometry: LineStringGeometry = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: TrackProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    platform_class: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    times: list[str] = Field(default=..., description="""One per position, non-decreasing.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'RemoveJumpsParams']} })
    speeds: Optional[SpeedSeries] = Field(default=None, description="""Speed over ground at each position.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'TmaSolutionRow', 'TmaOwnship']} })
    courses: Optional[AngleSeries] = Field(default=None, description="""Course over ground at each position, true north, clockwise.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'TmaSolutionRow', 'TmaOwnship']} })
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
         'domain_of': ['TrackProperties', 'SetTrackFrequenciesParams']} })
    symbol_interval: Optional[Union[Duration, FixIntervalAllEnum, FixIntervalOffEnum]] = Field(default=None, description="""How often a small symbol in the track's colour marks where it was (CAP-32): aligned and bounded as label_interval, or at every fix (\"all\"). Left out, none.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'Duration'},
                    {'range': 'FixIntervalOffEnum'},
                    {'range': 'FixIntervalAllEnum'}],
         'domain_of': ['TrackProperties', 'SetTrackFrequenciesParams']} })
    arrow_interval: Optional[Union[Duration, FixIntervalOffEnum]] = Field(default=None, description="""How often a chevron on the line shows the track's direction of travel (CAP-32): aligned and bounded as label_interval. Left out, Debrief's default: a few along the track in the time window.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'Duration'}, {'range': 'FixIntervalOffEnum'}],
         'domain_of': ['TrackProperties', 'SetTrackFrequenciesParams']} })
    hidden: Optional[bool] = Field(default=None, description="""Not drawn on the map. Still listed, and still selectable, in the outline. Content: hiding is a recorded, undoable change (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'TmaCut',
                       'TmaResiduals',
                       'TimelineEntry',
                       'SetHiddenParams',
                       'SensorCutRow',
                       'SensorRow']} })
    supplies: Optional[list[TrackSupply]] = Field(default=None, description="""Which catalogue item supplies each period of the track (CAP-09): where two items have data for the platform over the same period, the analyst chooses which supplies it, and the track is stitched from the chosen periods. In time order, not overlapping, each from its first fix to its last. Left out, the plot itself supplies the whole track, as imported. Content: each change is a recorded, undoable step (SUB-22), naming the items and periods.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    platform_links: Optional[list[SourceTrackRef]] = Field(default=None, description="""Tracks in other catalogue items the analyst confirmed, or linked by hand, as this track's platform (CAP-09; decision, product owner, 16 Oct 2026). Tracks whose names match this one's, ignoring case and spaces, are proposed until confirmed or refused. Each change is a recorded, undoable step.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    platform_unlinks: Optional[list[SourceTrackRef]] = Field(default=None, description="""Tracks in other catalogue items whose names match this one's but which the analyst said are another platform: no longer proposed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    tma: Optional[TmaSolution] = Field(default=None, description="""The track is a TMA solution of a contact, rooted in a period of bearing cuts (CAP-21; product owner, 24 Oct 2026). Otherwise an ordinary track, plotted by dead reckoning, so every track operation works on it unchanged; this says which cuts its bearing residuals are worked out against, its legs, and the cuts left out of its RMS error. Content: each change is a recorded, undoable step (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'ShowTmaMessage']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, description="""Feature-level provenance where needed (SUB-18).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
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


class TmaSolution(ConfiguredBaseModel):
    """
    What makes a track a TMA solution (CAP-21; product owner, 24 Oct 2026): the contact it is a solution of, and the period of bearing cuts it is rooted in, named by the cuts' ids (a sensor's id changes when its track is split; a cut's does not). Its residuals are each rooted cut's bearing less the bearing from where the cut was taken (its origin) to where the solution was at the cut's time. Its legs start at leg_starts: each is dragged on its own, the later ones following on by dead reckoning, so they stay joined.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    contact: str = Field(default=..., description="""The contact the solution is of, as the analyst names it, such as \"Contact 1\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution', 'TmaRequest', 'TmaSolutionRow']} })
    sensor_ids: list[str] = Field(default=..., description="""The sensors whose cuts it was rooted in when it was made, as their ids were then: what the analyst chose. The cuts themselves are in cut_ids.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'SensorsParams',
                       'SetArrayOffsetParams']} })
    cut_ids: list[str] = Field(default=..., description="""The cuts it is rooted in, by feature id, in time order: every cut of the rooted period on the sensors chosen. Its fixes fall at their times when Debrief makes it. A legacy solution whose sensor the plot does not have has none, and the import says so.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'TmaFocus',
                       'TmaExcludeMessage',
                       'CutsParams',
                       'TmaExcludeCutParams']} })
    period: TimeRange = Field(default=..., description="""The period of bearings it is rooted in, ends included.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    leg_starts: Optional[list[str]] = Field(default=None, description="""When each leg after the first starts, in time order: the solution split into legs (product owner, 24 Oct 2026). A fix exactly at a time starts the later leg, as a split does. Left out, one leg.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution', 'TmaSolutionRow']} })
    excluded_cut_ids: Optional[list[str]] = Field(default=None, description="""Rooted cuts the analyst left out of the RMS error, such as wild bearings (product owner, 24 Oct 2026): still listed and drawn in the bearing view, not counted. Each change is one step.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution']} })

    @field_validator('leg_starts')
    def pattern_leg_starts(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid leg_starts format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid leg_starts format: {v}"
            raise ValueError(err_msg)
        return v


class TmaRequest(ConfiguredBaseModel):
    """
    A TMA solution asked for (CAP-21; product owner, 24 Oct 2026), from the bearing view's form, two clicks on the map, or an agent (debrief/tma_create): the cuts to root it in (sensor_ids and a period, or cut_ids), and a first guess, either by form (a range on the first cut's bearing, a course and a speed) or by two positions (on the first cut's line and on the last's; the course and speed follow). Made as one recorded, undoable step.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    sensor_ids: Optional[list[str]] = Field(default=None, description="""The sensors whose cuts in the period it is rooted in.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'SensorsParams',
                       'SetArrayOffsetParams']} })
    period: Optional[TimeRange] = Field(default=None, description="""The cuts whose times fall in it, ends included, of the sensors named.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    cut_ids: Optional[list[str]] = Field(default=None, description="""Or the cuts to root it in, by feature id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'TmaFocus',
                       'TmaExcludeMessage',
                       'CutsParams',
                       'TmaExcludeCutParams']} })
    contact: Optional[str] = Field(default=None, description="""The contact's name; left out, the next of \"Contact 1\", \"Contact 2\"...""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution', 'TmaRequest', 'TmaSolutionRow']} })
    name: Optional[str] = Field(default=None, description="""The solution track's name; left out, the contact's with \"solution\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    colour: Optional[str] = Field(default=None, description="""The solution track's colour, lower-case hex RGB; left out, Debrief's TMA colour.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    range: Optional[Length] = Field(default=None, description="""First guess by form: how far along the first cut's bearing, from where it was taken, the solution starts.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest', 'SensorCutProperties', 'TimeState']} })
    first_bearing: Optional[SensorCutKeptEnum] = Field(default=None, description="""First guess by form, where the first cut is ambiguous and unresolved: which of its bearings the range is along. Left out, the one kept, else the bearing recorded first.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest']} })
    course: Optional[Angle] = Field(default=None, description="""First guess by form: the solution's course.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest', 'TrackEdit', 'SensorCutProperties']} })
    speed: Optional[Speed] = Field(default=None, description="""First guess by form: the solution's speed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest', 'TrackEdit', 'Jump']} })
    first_position: Optional[conlist(min_length=2, max_length=2, item_type=float)] = Field(default=None, description="""First guess by two clicks: [longitude, latitude] clicked on, or near, the first cut's line: the solution starts on the line, level with it.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 2}],
                   'exact_number_dimensions': 1},
         'domain_of': ['TmaRequest']} })
    last_position: Optional[conlist(min_length=2, max_length=2, item_type=float)] = Field(default=None, description="""First guess by two clicks: [longitude, latitude] clicked on, or near, the last cut's line; the course and speed are those from the first position, on the first cut's line, to this one, on the last's.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 2}],
                   'exact_number_dimensions': 1},
         'domain_of': ['TmaRequest']} })

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
                       'LoggedExport',
                       'ItemAsked']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    track: str = Field(default=..., description="""The track's feature id in that item.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry',
                       'SensorInFile']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })


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
                       'LoggedExport',
                       'ItemAsked']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    track: str = Field(default=..., description="""The supplying track's feature id in that item.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry',
                       'SensorInFile']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    revision: Optional[str] = Field(default=None, description="""The item's revision when the period was taken from it; left out where the plot supplies it itself.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })
    start: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    end: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })

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

    colour: str = Field(default=..., description="""Lower-case hex RGB, for example \"#e01c3e\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    legacy_symbology: Optional[str] = Field(default=None, description="""The REP symbology code the colour came from, such as \"@C\", kept for export.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle', 'SensorProperties']} })

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
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    colour: Optional[str] = Field(default=None, description="""The fix's own colour, lower-case hex RGB: its marker and the line from it to the next fix are drawn in it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    label: Optional[str] = Field(default=None, description="""Text drawn on the map beside the fix.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'SensorCutProperties',
                       'MeasureDefinition',
                       'TmaCut',
                       'SensorCutRow',
                       'FixMarkChanges']} })
    comment: Optional[str] = Field(default=None, description="""Free text about the fix, shown when the analyst points at it and in the Timeline.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'SensorCutProperties',
                       'SensorCutRow',
                       'FixMarkChanges']} })
    show_label: Optional[bool] = Field(default=None, description="""The fix always shows its time label, as the track's label_interval draws them, whatever that interval is and at any zoom (CAP-32; decision, product owner, 15 Oct 2026: force on only, so true when given). Never drawn twice where the interval falls on the same time.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark', 'FixMarkChanges']} })
    show_symbol: Optional[bool] = Field(default=None, description="""The fix always shows its symbol, as the track's symbol_interval draws them, whatever that interval is and at any zoom (CAP-32); true when given.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark', 'FixMarkChanges']} })

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
    period: Optional[TimeRange] = Field(default=None, description="""The fixes to change: those whose times fall in it, ends included. Left out, the whole track.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    distance: Optional[Length] = Field(default=None, description="""How far a move takes each fix, a shear drags the end that is not held, or a single fix is moved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    bearing: Optional[Angle] = Field(default=None, description="""Which way a move takes each fix, a shear drags the end that is not held, or a single fix is moved, true, clockwise from north.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit', 'SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    angle: Optional[Angle] = Field(default=None, description="""How far a rotation turns the fixes about the pivot; positive is clockwise.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    pivot: Optional[list[float]] = Field(default=None, description="""[longitude, latitude] of the position a rotation turns about. Left out, the fix nearest current time in the period, or the period's first fix.""", min_length=2, max_length=2, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    anchor: Optional[TrackEditAnchorEnum] = Field(default=None, description="""The end of the period a shear or a stretch holds fixed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit']} })
    course: Optional[Angle] = Field(default=None, description="""The course made good a shear gives the period: the true bearing, at its first fix, of the geodesic from its first fix to its last. With speed, instead of a distance and a bearing for the dragged end.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest', 'TrackEdit', 'SensorCutProperties']} })
    speed: Optional[Speed] = Field(default=None, description="""The speed made good a shear or a stretch gives the period: the geodesic range from its first fix to its last over the time between.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest', 'TrackEdit', 'Jump']} })
    fix_time: Optional[str] = Field(default=None, description="""The time of the one fix a move_fix moves: the fix is found by its time, as a mark is (where two fixes share a time, the first).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit', 'FixChosenMessage']} })
    position: Optional[list[float]] = Field(default=None, description="""[longitude, latitude] a move_fix puts the fix at, instead of a distance and a bearing from where it is.""", min_length=2, max_length=2, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit', 'Jump']} })
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    geometry: Optional[Union[LineStringGeometry, PointGeometry, PolygonGeometry]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'PointGeometry'},
                    {'range': 'LineStringGeometry'},
                    {'range': 'PolygonGeometry'}],
         'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: AnnotationProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
    style: AnnotationStyleEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'AnnotationProperties']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    text: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'NarrativeParams',
                       'NarrativeRow']} })
    time: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    time_range: Optional[TimeRange] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'ShowFormMessage',
                       'ShowTimeMessage',
                       'WindowChangedMessage',
                       'ShowAnnotationFormMessage',
                       'SourceChosenMessage']} })
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
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'TmaCut',
                       'TmaResiduals',
                       'TimelineEntry',
                       'SetHiddenParams',
                       'SensorCutRow',
                       'SensorRow']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
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

    colour: Optional[str] = Field(default=None, description="""Its line's colour, and a label's or a marker's dot. Lower-case hex RGB, for example \"#c7820a\". Label text is drawn in the theme's text colour, so it stays readable on any map.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
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
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    text: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'NarrativeParams',
                       'NarrativeRow']} })
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
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    time_range: Optional[TimeRange] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'ShowFormMessage',
                       'ShowTimeMessage',
                       'WindowChangedMessage',
                       'ShowAnnotationFormMessage',
                       'SourceChosenMessage']} })
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    geometry: Optional[PointGeometry] = Field(default=None, description="""Always null.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: NarrativeProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
    time: str = Field(default=..., description="""When it was logged, to the millisecond, Zulu (SUB-01).""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    source: str = Field(default=..., description="""Who wrote it: the platform, person or document whose log it is (legacy Debrief's track name on an entry), such as \"BLUE ONE\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'NarrativeRow',
                       'TakeNewDataParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams',
                       'DismissNewDataParams']} })
    entry_type: Optional[str] = Field(default=None, description="""What kind of entry, in the source's own words, such as legacy Debrief's GenComment, Posn, CSD or FCS. Free text: each source has its own types. Left out where the source gives none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'NarrativeRow']} })
    text: str = Field(default=..., description="""What was logged. May run to several lines.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'NarrativeParams',
                       'NarrativeRow']} })
    track_id: Optional[str] = Field(default=None, description="""The track the entry belongs to, where one is known: by default the track named as its source. A track since deleted leaves the link, which is then ignored.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'PreviewSource',
                       'NarrativeRow']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
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
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    source: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'NarrativeRow',
                       'TakeNewDataParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams',
                       'DismissNewDataParams']} })
    entry_type: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'NarrativeRow']} })
    text: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'NarrativeParams',
                       'NarrativeRow']} })
    track_id: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'PreviewSource',
                       'NarrativeRow']} })

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


class SensorFeature(ConfiguredBaseModel):
    """
    A sensor carried by a track (CAP-22): a bow sonar, a towed array, the bearings read from a narrative. Its cuts are features of their own (SensorCutFeature), each naming it, so resolving one cut, or the cuts of a period, is one small recorded step (SUB-19), as each narrative entry is a feature of its own. Geometry is null: a cut is drawn from where the host track was at its time, so a track edited (moved, sheared, plotted by dead reckoning) carries its cuts with it, and a TMA solution (CAP-21) can be rooted in the cuts' times.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: FeatureTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    geometry: Optional[PointGeometry] = Field(default=None, description="""Always null.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: SensorProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })


class SensorProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: SensorKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
    name: str = Field(default=..., description="""The sensor's name, as its source gives it, such as \"Towed array\" or \"2087\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    host_track_id: str = Field(default=..., description="""The track carrying the sensor (ownship): its cuts are drawn from that track's position at each cut's time (or its array's, astern). A track split: the cuts from the split on go with the second part, as a sensor of its own (a new id) where the sensor had cuts before it too; cuts between the parts' fixes keep the position they were drawn from. Tracks merged: sensors of one name are one again, the merged track's.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorProperties',
                       'SensorObservationsProperties',
                       'SensorInFile',
                       'SensorRow']} })
    colour: str = Field(default=..., description="""The colour its cuts are drawn in, lower-case hex RGB, unless a cut has its own. Content, like a track's colour: each change is a recorded, undoable step (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    legacy_symbology: Optional[str] = Field(default=None, description="""The REP symbology code its colour came from, such as \"@A\", kept for export.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle', 'SensorProperties']} })
    array_offset: Optional[Length] = Field(default=None, description="""How far astern of the ship the sensor is (a towed array), so its cuts are drawn, and port and starboard told, from the array's position, not the ship's (product owner, 24 Oct 2026). Left out, the sensor is at the ship. Set by the analyst as a recorded, undoable step, or read from a legacy plot (its Offset, astern).""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorProperties']} })
    array_mode: Optional[ArrayModeEnum] = Field(default=None, description="""How the array follows the ship: back along its past track (worm in the hole, the default, as legacy's) or straight astern (plain). Only with array_offset.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorProperties', 'SensorRow']} })
    hidden: Optional[bool] = Field(default=None, description="""None of its cuts drawn on the map. Still listed, and still selectable, in the outline, under its track. Content: hiding is a recorded, undoable change (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'TmaCut',
                       'TmaResiduals',
                       'TimelineEntry',
                       'SetHiddenParams',
                       'SensorCutRow',
                       'SensorRow']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorObservationsProperties',
                       'DebriefFeatureCollection']} })

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


class SensorCutFeature(ConfiguredBaseModel):
    """
    One cut of a sensor (CAP-22): a bearing from the host track at a time, perhaps with the ambiguous bearing a towed array cannot tell it from, and which of the two the analyst kept. Geometry is null: the cut is drawn from the host track's position at its time (as the map places tracks, along the geodesic between fixes), or from the position recorded with it, along the geodesic at its bearing to its range, or else past the edge of the map's view (twice the view's larger side, at most 5 degrees of arc, 300 nmi, as legacy Debrief draws it). Frequency is never imported (CAP-22, EXT-03). A bearing error is not held yet: no legacy format defines what one means (product owner, 24 Oct 2026); an optional bearing_error here is the way to add it, and wedges with it.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: FeatureTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    geometry: Optional[PointGeometry] = Field(default=None, description="""Always null.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: SensorCutProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })


class SensorCutProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: SensorCutKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
    sensor_id: str = Field(default=..., description="""The sensor the cut is from, a sensor feature in the plot.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'TmaView']} })
    time: str = Field(default=..., description="""When the cut was taken, to the millisecond, Zulu (SUB-01).""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    bearing: Angle = Field(default=..., description="""The bearing to the target, true, clockwise from north, from 0 up to 360 degrees.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit', 'SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    ambiguous_bearing: Optional[Angle] = Field(default=None, description="""A towed array's ambiguous bearing: the mirror image of bearing about the array, on the other side of the host's course. Left out for a cut that was never ambiguous.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    resolved: Optional[SensorCutKeptEnum] = Field(default=None, description="""Which of the two bearings the analyst kept, for a cut with an ambiguous bearing; left out while it is unresolved, when both are drawn. Each resolution, of one cut or of every cut in a period, is one recorded, undoable step with provenance (product owner, 24 Oct 2026), and can be undone or reset to ambiguous.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow', 'SensorRow']} })
    range: Optional[Length] = Field(default=None, description="""How far the target was, where the source says: the cut is drawn to that range. Left out, drawn past the edge of the view. A range of 0 (a ;SENSOR2: or ;SENSOR3: line's, as legacy read it) is drawn as a point where the cut was taken, as legacy drew it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest', 'SensorCutProperties', 'TimeState']} })
    origin: Optional[conlist(min_length=2, max_length=2, item_type=float)] = Field(default=None, description="""[longitude, latitude] of the sensor, where the source recorded it with the cut (legacy Debrief's absolute origin): the cut is drawn from there instead of from the host track. Left out, from the host track's position at the cut's time. Where origin_derived is true, Debrief worked it out (where the sensor was, pinned when its track was split) and the source did not record it.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 2}],
                   'exact_number_dimensions': 1},
         'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    origin_derived: Optional[bool] = Field(default=None, description="""True where origin is not recorded by the source but derived by Debrief: where the sensor (its array astern, if it has one) was before its track was split, pinned so the cut is drawn, and its side told, as before (round 3 review, 24 Oct 2026). A TMA residual can tell a recorded origin from a derived one by it. Only with origin.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    course: Optional[Angle] = Field(default=None, description="""The course, true, the cut's port and starboard are told by, pinned with a derived origin when its track was split (the course logged where the sensor was then). Left out, the host's logged course at the cut's time. Only with origin.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest', 'TrackEdit', 'SensorCutProperties']} })
    bearing_accuracy: Optional[str] = Field(default=None, description="""The bearing accuracy a ;SENSOR3: line gives, kept exactly as written: no format says what it means (a standard deviation, a half-width), so it is not drawn (product owner, 24 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties']} })
    label: Optional[str] = Field(default=None, description="""Text the source gives the cut, such as legacy Debrief's label.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'SensorCutProperties',
                       'MeasureDefinition',
                       'TmaCut',
                       'SensorCutRow',
                       'FixMarkChanges']} })
    comment: Optional[str] = Field(default=None, description="""Free text about the cut.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'SensorCutProperties',
                       'SensorCutRow',
                       'FixMarkChanges']} })
    colour: Optional[str] = Field(default=None, description="""The cut's own colour, lower-case hex RGB; left out, its sensor's, as legacy Debrief lets a cut take its sensor's colour.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    hidden: Optional[bool] = Field(default=None, description="""Not drawn on the map. Content, like hiding any feature (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'TmaCut',
                       'TmaResiduals',
                       'TimelineEntry',
                       'SetHiddenParams',
                       'SensorCutRow',
                       'SensorRow']} })

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


class AmbiguityResolution(ConfiguredBaseModel):
    """
    Ambiguous cuts resolved, or made ambiguous again, as the map, a menu or an agent asks (CAP-22): one recorded, undoable step (product owner, 24 Oct 2026). The cuts are those named, or else the cuts of the sensors named within a period (the time window, as the analyst sets it). Cuts with no ambiguous bearing are left as they are, and the step says how many.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    keep: AmbiguityKeepEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['AmbiguityResolution', 'ResolveAskedMessage']} })
    cut_ids: Optional[list[str]] = Field(default=None, description="""The cuts to resolve, by feature id. Or give sensor_ids, and perhaps a period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'TmaFocus',
                       'TmaExcludeMessage',
                       'CutsParams',
                       'TmaExcludeCutParams']} })
    sensor_ids: Optional[list[str]] = Field(default=None, description="""Sensors whose cuts in the period are resolved; every cut of each, without a period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'SensorsParams',
                       'SetArrayOffsetParams']} })
    period: Optional[TimeRange] = Field(default=None, description="""The cuts whose times fall in it, ends included, of the sensors named.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    other_cut_ids: Optional[list[str]] = Field(default=None, description="""With keep bearing or ambiguous_bearing: cuts kept on their other bearing in the same step, so one step keeps some cuts' first bearings and others' twins, as a box drawn over the Bearings plot with Select bearings on asks (product owner, 28 Oct 2026). A cut named here and in cut_ids was boxed on both sides: it is left as it is, and the step says so. Hidden cuts are left as they are.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AmbiguityResolution']} })
    clear_cut_ids: Optional[list[str]] = Field(default=None, description="""With keep bearing or ambiguous_bearing: resolved cuts made ambiguous again in the same step, as a box drawn over their kept bearings with Select bearings on asks (product owner, 28 Oct 2026); one not resolved is left. Given (even empty), with other_cut_ids, the step is named for a box: \"Kept 12 Towed array cuts to starboard and made 15 ambiguous again\". Hidden cuts are left as they are.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AmbiguityResolution']} })


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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    geometry: Optional[PointGeometry] = Field(default=None, description="""Always null.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: SensorObservationsProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    sensor_name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    host_track_id: str = Field(default=..., description="""The track carrying the sensor.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorProperties',
                       'SensorObservationsProperties',
                       'SensorInFile',
                       'SensorRow']} })
    observation_type: ObservationTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    time_range: TimeRange = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'ShowFormMessage',
                       'ShowTimeMessage',
                       'WindowChangedMessage',
                       'ShowAnnotationFormMessage',
                       'SourceChosenMessage']} })
    observation_count: int = Field(default=..., ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    payload: PayloadRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    hidden: Optional[bool] = Field(default=None, description="""Not drawn on the map. Still listed, and still selectable, in the outline. Content: hiding is a recorded, undoable change (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'TmaCut',
                       'TmaResiduals',
                       'TimelineEntry',
                       'SetHiddenParams',
                       'SensorCutRow',
                       'SensorRow']} })
    provenance: Optional[list[ProvRecord]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorObservationsProperties',
                       'DebriefFeatureCollection']} })


class PayloadRef(ConfiguredBaseModel):
    """
    Envelope for data LinkML expresses badly (CON-02): the payload's format, a versioned reference to its inner schema, units, CRS and time reference.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    href: str = Field(default=..., description="""Path relative to the referencing file.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef', 'StacLink', 'StacAsset']} })
    format: PayloadFormatEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef',
                       'ImageExport',
                       'ImageRequest',
                       'RenderedImage',
                       'NarrativePreview',
                       'ExportImageParams',
                       'HostRequest']} })
    inner_schema: InnerSchemaRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef']} })
    columns: list[PayloadColumn] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef', 'NonSpatialResult']} })
    crs: str = Field(default=..., description="""Coordinate reference system of any positions in the payload.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef']} })
    time_reference: str = Field(default=..., description="""Time scale of any times in the payload. Always UTC (SUB-01).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef']} })
    content_hash: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef', 'NarrativePreview', 'SensorPreview']} })

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
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
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
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    geometry: Optional[PointGeometry] = Field(default=None, description="""Always null.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: PlotProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    description: Optional[str] = Field(default=None, description="""What the plot is for. Content.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacItemProperties',
                       'StacCatalog',
                       'MeasureGroup']} })
    view: Optional[PlotView] = Field(default=None, description="""The island: how the plot is being viewed. Outside the plot's history (see the module description). Kept last, so it is easy to find and strip.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'IslandReply',
                       'IslandChangeReply',
                       'SetViewParams']} })


class PlotView(ConfiguredBaseModel):
    """
    View state saved in the plot file: not content, so not undoable and not recorded in provenance (SUB-22). Two people changing it at once are told, not silently overwritten (SUB-28). Later view state joins here.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    time_window: Optional[TimeRange] = Field(default=None, description="""The plot's time window: the period shown, one for the whole plot (CAP-28, CAP-29). Start shall not be after end.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView']} })
    context_tracks: Optional[ContextTracksEnum] = Field(default=None, description="""How tracks outside the time window are drawn (CAP-29). Left out means visible.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ShowPlotMessage',
                       'ShowTimeMessage',
                       'ContextChangedMessage',
                       'SetContextMessage']} })
    tote: Optional[ToteView] = Field(default=None, description="""Which tracks the Tote compares, and through which measure group (CAP-06, CAP-07). View state, like the window: changing it is never a step in the history (decision, 14 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ImageExport',
                       'ShowToteMessage',
                       'ToteParams',
                       'ExportImageParams']} })
    narrative_on_map: Optional[bool] = Field(default=None, description="""Whether the map shows the narrative entry current time is at in a small box beside its track, for ten minutes of plot time; left out means it does. Turned off and on in the Timeline. View state, like the Tote's lines: never a step in the history (decision, product owner, 15 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ShowTimelineMessage',
                       'NarrativeOnMapChangedMessage']} })
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
                       'LoggedExport',
                       'ItemAsked']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    revision: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })
    by: Optional[str] = Field(default=None, description="""Who gave the answer: the agent's name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision', 'ImageExport', 'EarlierRead']} })
    at: Optional[str] = Field(default=None, description="""When the answer was given.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision',
                       'ImageExport',
                       'EarlierRead',
                       'ListedStep',
                       'NarrativeParams',
                       'TmaSplitLegParams',
                       'SplitTrackParams']} })

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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
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
                       'SensorFeature',
                       'SensorCutFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    schema_version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection', 'Delta', 'HistoryHead']} })
    features: list[Union[AnnotationFeature, NarrativeFeature, PlotFeature, SensorCutFeature, SensorFeature, SensorObservationsFeature, TrackFeature]] = Field(default=..., json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'SensorFeature'},
                    {'range': 'SensorCutFeature'},
                    {'range': 'NarrativeFeature'},
                    {'range': 'PlotFeature'}],
         'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    named_sets: Optional[list[NamedSet]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'ToolResult',
                       'HistoryStep',
                       'Delta']} })
    provenance: list[ProvRecord] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })


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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
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
                       'TimelineEntry',
                       'SensorInFile']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    fixes: int = Field(default=..., ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackCoverage',
                       'CoverageSource',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview']} })
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    geometry: Optional[Union[LineStringGeometry, PointGeometry, PolygonGeometry]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'PointGeometry'},
                    {'range': 'LineStringGeometry'},
                    {'range': 'PolygonGeometry'}],
         'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    bbox: Optional[conlist(min_length=4, max_length=4, item_type=float)] = Field(default=None, description="""[west, south, east, north] in WGS84 degrees.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 4}],
                   'exact_number_dimensions': 1},
         'domain_of': ['StacItem', 'Viewport']} })
    properties: StacItemProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
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

    current: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState',
                       'FigureSource',
                       'PlotHistory',
                       'HistoryHead',
                       'PlotBase',
                       'NarrativeReply',
                       'OpenRevisionReply']} })
    range: TimeRange = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest', 'SensorCutProperties', 'TimeState']} })

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

    plot: str = Field(default=..., description="""Href of the plot the selection belongs to.""", json_schema_extra = { "linkml_meta": {'domain_of': ['Selection',
                       'ShowPlotMessage',
                       'OpenReply',
                       'OpenRevisionReply']} })
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
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    selection: Selection = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ShowPlotMessage',
                       'SetSelectionMessage',
                       'SelectionChangedMessage']} })
    viewport: Viewport = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'ShowPlotMessage',
                       'SetViewportMessage',
                       'ViewportChangedMessage',
                       'ExportImageParams']} })


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
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    selection: Optional[Selection] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ShowPlotMessage',
                       'SetSelectionMessage',
                       'SelectionChangedMessage']} })
    viewport: Optional[Viewport] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'ShowPlotMessage',
                       'SetViewportMessage',
                       'ViewportChangedMessage',
                       'ExportImageParams']} })
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
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    explanation: str = Field(default=..., description="""Short user-facing explanation of what the tool does (CAP-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration', 'ParameterDeclaration', 'MeasureDefinition']} })
    judgement: Optional[str] = Field(default=None, description="""Any judgement the tool involves, shown on its form (CAP-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration']} })
    applies_to: list[str] = Field(default=..., description="""Feature kinds from the taxonomy, or \"*\" for any (TL-06). Debrief offers a tool only if every selected item matches (TL-08).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration']} })
    min_selected: Optional[int] = Field(default=1, ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration'], 'ifabsent': 'int(1)'} })
    max_selected: Optional[int] = Field(default=None, ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration']} })
    parameters: Optional[list[ParameterDeclaration]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'ToolDeclaration', 'RunToolMessage']} })
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
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    explanation: Optional[str] = Field(default=None, description="""Shown beside the field on the form (CAP-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration', 'ParameterDeclaration', 'MeasureDefinition']} })
    kind: ParameterKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
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

    new_features: Optional[list[Union[AnnotationFeature, NarrativeFeature, SensorCutFeature, SensorFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'SensorFeature'},
                    {'range': 'SensorCutFeature'},
                    {'range': 'NarrativeFeature'}],
         'domain_of': ['ToolResult']} })
    modified_features: Optional[list[Union[AnnotationFeature, NarrativeFeature, SensorCutFeature, SensorFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'SensorFeature'},
                    {'range': 'SensorCutFeature'},
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
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
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    label: str = Field(default=..., description="""Its row heading in the Tote, before the unit, short enough for a narrow view.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'SensorCutProperties',
                       'MeasureDefinition',
                       'TmaCut',
                       'SensorCutRow',
                       'FixMarkChanges']} })
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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    description: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacItemProperties',
                       'StacCatalog',
                       'MeasureGroup']} })
    extends: Optional[str] = Field(default=None, description="""The group whose measures come first, before this one's own; left out for core.""", json_schema_extra = { "linkml_meta": {'domain_of': ['MeasureGroup']} })
    measures: list[str] = Field(default=..., description="""The ids of the measures shown, in order, those of the group it extends included.""", json_schema_extra = { "linkml_meta": {'domain_of': ['MeasureGroup', 'ToteResult', 'MeasureGroupsReply']} })

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
                       'TimelineEntry',
                       'SensorInFile']} })
    name: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    colour: Optional[str] = Field(default=None, description="""The track's colour, lower-case hex, to key the row to the map.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    status: ToteRowStatusEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow', 'ListedStep']} })
    note: Optional[str] = Field(default=None, description="""Why there are no values, for the analyst, such as \"Starts 09:30:00Z\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag',
                       'StampedImage',
                       'ExportedImage']} })
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
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    group: MeasureGroup = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToteResult']} })
    measures: list[MeasureDefinition] = Field(default=..., description="""The definitions of the group's measures, in its order.""", json_schema_extra = { "linkml_meta": {'domain_of': ['MeasureGroup', 'ToteResult', 'MeasureGroupsReply']} })
    primary: Optional[ToteRow] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ToteView', 'ToteResult']} })
    note: Optional[str] = Field(default=None, description="""What the analyst should know about the Tote as a whole, such as a measure group chosen that this plot's study does not have (core is shown instead).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag',
                       'StampedImage',
                       'ExportedImage']} })
    rows: list[ToteRow] = Field(default=..., description="""One per secondary, in the order chosen.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteResult', 'TmaResiduals']} })

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
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    colour: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })

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
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'annotations': {'newest_config_version': {'tag': 'newest_config_version',
                                                   'value': 4}},
         'from_schema': 'https://debrief.info/schemas/debrief'})

    config_version: int = Field(default=..., description="""Version of this file's layout: 1 while it holds only stores; 2 once it holds track_import_mode; 3 once it holds narrative_import; 4 once it holds tma_error_cut_off. An earlier Debrief cannot read a later layout.""", ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['UserConfig']} })
    stores: list[KnownStore] = Field(default=..., description="""Known stores, in the order the analyst sees them (SUB-17).""", json_schema_extra = { "linkml_meta": {'domain_of': ['UserConfig', 'StoresReply']} })
    track_import_mode: Optional[TrackImportModeEnum] = Field(default=None, description="""How tracks imported are plotted, over the ground or by dead reckoning: ask (the default, also when left out), or otg or dr once the analyst chose \"Use this choice for future imports\" (CAP-01). The analyst may clear it, to be asked again.""", json_schema_extra = { "linkml_meta": {'domain_of': ['UserConfig']} })
    narrative_import: Optional[list[NarrativeImportAnswers]] = Field(default=None, description="""The analyst's last answers to the questions asked before a Word or PDF narrative is read into a plot, one set for each dialect, so they are offered again next time and confirmed with one key (CAP-19; product owner, 15 Oct 2026). User state, kept here and never in a catalogue or a plot file; importers are given the answers.""", json_schema_extra = { "linkml_meta": {'domain_of': ['UserConfig']} })
    tma_error_cut_off: Optional[float] = Field(default=None, description="""The Bearings view's error cut-off, degrees (CAP-21; product owner, 25 Oct 2026): its Error pane is green while every residual counted is within it and pink otherwise, as legacy Debrief's Stacked Dots shaded it. Left out, 3 degrees, legacy's default. The analyst's preference, kept here and never in a catalogue or a plot file.""", ge=0.01, le=180, json_schema_extra = { "linkml_meta": {'domain_of': ['UserConfig']} })


class NarrativeImportAnswers(ConfiguredBaseModel):
    """
    What the analyst answered for documents of one dialect: the types not read (so a type not seen before is read), whether only entries within the plot's period, and the track each platform was said to be.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    dialect: str = Field(default=..., description="""The dialect, such as narrative-document or rider-narrative.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers', 'NarrativePreview']} })
    skip_types: Optional[list[str]] = Field(default=None, description="""Entry types the analyst chose not to read; \"\" for entries with no type.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers']} })
    within_period: Optional[bool] = Field(default=None, description="""Only the entries within the plot's tracks' period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers', 'NewDataMark', 'NarrativeChoices']} })
    tracks: Optional[list[PlatformTrack]] = Field(default=None, description="""The track the analyst said each platform is, by the track's name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers',
                       'CoverageItem',
                       'NarrativeChoices',
                       'ImportReply',
                       'RepTracksReply',
                       'SensorPreview']} })

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

    platform: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlatformTrack', 'NarrativeChoices', 'NarrativePreview']} })
    track: Optional[str] = Field(default=None, description="""The track's name; left out, the platform belongs to no track.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry',
                       'SensorInFile']} })


class KnownStore(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., description="""Unique within this file; stable when the store is renamed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    kind: StoreKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
    location: str = Field(default=..., description="""Absolute path to the folder holding catalog.json: a POSIX path, a Windows drive path or a UNC share.""", json_schema_extra = { "linkml_meta": {'domain_of': ['KnownStore', 'CreateCatalogueParams']} })
    read_only: Optional[bool] = Field(default=None, description="""When true, Debrief offers no action that would write to the store. A courtesy, not access control: filesystem permissions decide that (SEC-01).""", json_schema_extra = { "linkml_meta": {'domain_of': ['KnownStore', 'TmaView', 'StoreListed', 'OpenParams']} })

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
                       'LoggedExport',
                       'ItemAsked']} })
    item: str = Field(default=..., description="""The plot's item id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    start: Optional[str] = Field(default=None, description="""The earliest time any source shown has data.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    end: Optional[str] = Field(default=None, description="""The latest time any source shown has data.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    platforms: list[CoveragePlatform] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageReport', 'NewDataMark']} })
    items: list[CoverageItem] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageReport']} })
    review: Optional[ReviewFlag] = Field(default=None, description="""The plot drew from items since revised, so it may need review (CAP-12).""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageReport']} })
    note: Optional[str] = Field(default=None, description="""Anything the analyst should know about what is shown.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag',
                       'StampedImage',
                       'ExportedImage']} })

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
                       'TimelineEntry',
                       'SensorInFile']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    colour: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    sources: list[CoverageSource] = Field(default=..., description="""The plot's own data first, then items' tracks linked or proposed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoveragePlatform',
                       'CoveragePeriod',
                       'NarrativePreview',
                       'NarrativeImportReply',
                       'NarrativeParams',
                       'NarrativeReply',
                       'TracedImage']} })
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
                       'LoggedExport',
                       'ItemAsked']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    track: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry',
                       'SensorInFile']} })
    name: str = Field(default=..., description="""The track's name in that item.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    link: CoverageLinkEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageSource']} })
    fixes: int = Field(default=..., ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackCoverage',
                       'CoverageSource',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview']} })
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
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    end: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    sources: list[int] = Field(default=..., description="""The platform's sources with data throughout the period, by their place in its list.""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoveragePlatform',
                       'CoveragePeriod',
                       'NarrativePreview',
                       'NarrativeImportReply',
                       'NarrativeParams',
                       'NarrativeReply',
                       'TracedImage']} })
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
                       'LoggedExport',
                       'ItemAsked']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    role: CoverageItemRoleEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageItem']} })
    created: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['StacItemProperties', 'CoverageItem']} })
    start: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    end: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    revision: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })
    tracks: Optional[list[TrackCoverage]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers',
                       'CoverageItem',
                       'NarrativeChoices',
                       'ImportReply',
                       'RepTracksReply',
                       'SensorPreview']} })
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
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })
    platforms: Optional[list[str]] = Field(default=None, description="""The plot's tracks it has data for.""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageReport', 'NewDataMark']} })
    within_period: Optional[bool] = Field(default=None, description="""It has data within the plot's period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers', 'NewDataMark', 'NarrativeChoices']} })
    note: str = Field(default=..., description="""What the mark says, for its tooltip and screen readers.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag',
                       'StampedImage',
                       'ExportedImage']} })

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
                       'LoggedExport',
                       'ItemAsked']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    revised: list[ItemRef] = Field(default=..., description="""Each item revised since the product took data from it, at its revision now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageSource', 'CoverageItem', 'ReviewFlag']} })
    note: str = Field(default=..., description="""What the flag says, for its tooltip and screen readers.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag',
                       'StampedImage',
                       'ExportedImage']} })


class ImageExport(ConfiguredBaseModel):
    """
    One image exported from a plot, as the plot's export log records it in its island: view state, never a step (decision, product owner, 16 Oct 2026). What the analyst exported, so the image can be traced and its view shown again.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., description="""The image's ID, in full.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    revision: str = Field(default=..., description="""The plot's revision exported (its content hash): the step it was exported at.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })
    at: str = Field(default=..., description="""When it was exported.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision',
                       'ImageExport',
                       'EarlierRead',
                       'ListedStep',
                       'NarrativeParams',
                       'TmaSplitLegParams',
                       'SplitTrackParams']} })
    by: Optional[str] = Field(default=None, description="""Who exported it: the agent's name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision', 'ImageExport', 'EarlierRead']} })
    format: ImageFormatEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef',
                       'ImageExport',
                       'ImageRequest',
                       'RenderedImage',
                       'NarrativePreview',
                       'ExportImageParams',
                       'HostRequest']} })
    file: Optional[str] = Field(default=None, description="""The file's name, without its folder.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ExportImageParams',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'HostRequest']} })
    footer: bool = Field(default=..., description="""Whether the image shows its ID in a footer.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'ExportImageParams', 'HostRequest']} })
    preset: Optional[ImagePresetEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ImageRequest',
                       'ExportImageParams',
                       'HostRequest']} })
    theme: Optional[ImageThemeEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ImageRequest',
                       'ExportImageParams',
                       'HostRequest']} })
    width: Optional[int] = Field(default=None, description="""Its width in pixels.""", ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'RenderedImage', 'ExportImageParams']} })
    height: Optional[int] = Field(default=None, description="""Its height in pixels.""", ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'RenderedImage', 'ExportImageParams']} })
    viewport: Optional[Viewport] = Field(default=None, description="""The area of the map exported.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'ShowPlotMessage',
                       'SetViewportMessage',
                       'ViewportChangedMessage',
                       'ExportImageParams']} })
    time: Optional[TimeState] = Field(default=None, description="""Current time and the time window when it was exported.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    tote: Optional[ToteView] = Field(default=None, description="""Which tracks the Tote compared when it was exported, so the plot traced from the image shows the Tote, and its lines on the map, as the figure did (decision, product owner, 16 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ImageExport',
                       'ShowToteMessage',
                       'ToteParams',
                       'ExportImageParams']} })

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

    format: ImageFormatEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef',
                       'ImageExport',
                       'ImageRequest',
                       'RenderedImage',
                       'NarrativePreview',
                       'ExportImageParams',
                       'HostRequest']} })
    preset: ImagePresetEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ImageRequest',
                       'ExportImageParams',
                       'HostRequest']} })
    theme: ImageThemeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ImageRequest',
                       'ExportImageParams',
                       'HostRequest']} })
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

    format: ImageFormatEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef',
                       'ImageExport',
                       'ImageRequest',
                       'RenderedImage',
                       'NarrativePreview',
                       'ExportImageParams',
                       'HostRequest']} })
    data: str = Field(default=..., description="""A PNG as base 64, or an SVG as its text.""", json_schema_extra = { "linkml_meta": {'domain_of': ['RenderedImage']} })
    width: int = Field(default=..., ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'RenderedImage', 'ExportImageParams']} })
    height: int = Field(default=..., ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'RenderedImage', 'ExportImageParams']} })
    viewport: Optional[Viewport] = Field(default=None, description="""The area of the map drawn.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'ShowPlotMessage',
                       'SetViewportMessage',
                       'ViewportChangedMessage',
                       'ExportImageParams']} })
    notes: Optional[list[str]] = Field(default=None, description="""What the image leaves out that the map shows, for the analyst: reference tiles that could not be read, say.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })


class RevisionShown(ConfiguredBaseModel):
    """
    The plot is shown as it was at an earlier revision, read-only: the one an image was exported at (show_plot).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    step: int = Field(default=..., description="""The step whose revision is shown.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'FigureSource',
                       'EarlierRead',
                       'GotoParams',
                       'TakeNewDataReply',
                       'OpenRevisionReply']} })
    latest: int = Field(default=..., description="""The plot's current step now.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })
    revision: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })
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

    store: Optional[str] = Field(default=None, description="""The catalogue's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
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
                       'LoggedExport',
                       'ItemAsked']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    revision: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })
    step: int = Field(default=..., description="""The step at that revision.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'FigureSource',
                       'EarlierRead',
                       'GotoParams',
                       'TakeNewDataReply',
                       'OpenRevisionReply']} })
    current: int = Field(default=..., description="""The plot's current step now.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState',
                       'FigureSource',
                       'PlotHistory',
                       'HistoryHead',
                       'PlotBase',
                       'NarrativeReply',
                       'OpenRevisionReply']} })
    copied: Optional[bool] = Field(default=None, description="""The image's plot key names another plot: this is a copy of it with the same content at that revision (a colleague's, or one moved to another catalogue).""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource']} })
    export: Optional[ImageExport] = Field(default=None, description="""The export log entry for the image, where the plot's log or the analyst's own has one. A footer's short form may name several exports of one revision: each is a source of its own, to choose from.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource', 'LoggedExport', 'OpenRevisionReply']} })

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
                       'LoggedExport',
                       'ItemAsked']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    export: ImageExport = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource', 'LoggedExport', 'OpenRevisionReply']} })


class ExportLog(ConfiguredBaseModel):
    """
    The analyst's own export log, exports.json beside their Debrief configuration: the newest 2,000 exports their plots could not keep.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    exports: Optional[list[LoggedExport]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView', 'ExportLog']} })


class TmaSensorRow(ConfiguredBaseModel):
    """
    A sensor whose cuts the bearing view can list.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    host: Optional[str] = Field(default=None, description="""The name of the track carrying it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow', 'SensorInFile', 'SensorRow']} })
    colour: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    cuts: int = Field(default=..., description="""How many cuts it has.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaView',
                       'SensorInFile',
                       'SensorPreview',
                       'SensorsParams',
                       'SensorRow',
                       'SensorImportReply']} })
    ambiguous: Optional[int] = Field(default=None, description="""How many of them are still ambiguous.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow', 'SensorInFile', 'SensorRow']} })

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


class TmaCut(ConfiguredBaseModel):
    """
    One cut, as the bearing view lists it.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., description="""The cut's feature id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    sensor_id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'TmaView']} })
    sensor: Optional[str] = Field(default=None, description="""Its sensor's name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaCut', 'SensorInFile']} })
    colour: Optional[str] = Field(default=None, description="""The colour it is drawn in (its own, or its sensor's).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    time: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    bearing: float = Field(default=..., description="""The bearing recorded first, degrees true.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit', 'SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    ambiguous_bearing: Optional[float] = Field(default=None, description="""Its ambiguous twin, degrees true, where it has one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    resolved: Optional[SensorCutKeptEnum] = Field(default=None, description="""Which bearing the analyst kept, if resolved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow', 'SensorRow']} })
    side: Optional[SideEnum] = Field(default=None, description="""The side of the host's course its first bearing is on, where it has a twin and the side can be told.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaCut', 'SensorCutRow', 'TmaSplitLegParams']} })
    origin: Optional[conlist(min_length=2, max_length=2, item_type=float)] = Field(default=None, description="""[longitude, latitude] it was taken from: its own origin, else its sensor's position at its time (its array's, astern); left out outside its host's fixes, where it gives no residual.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 2}],
                   'exact_number_dimensions': 1},
         'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    origin_derived: Optional[bool] = Field(default=None, description="""Its origin was worked out by Debrief (pinned when its track was split), not recorded by the source (round 3 review, 24 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    label: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'SensorCutProperties',
                       'MeasureDefinition',
                       'TmaCut',
                       'SensorCutRow',
                       'FixMarkChanges']} })
    hidden: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'TmaCut',
                       'TmaResiduals',
                       'TimelineEntry',
                       'SetHiddenParams',
                       'SensorCutRow',
                       'SensorRow']} })

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


class TmaResidualRow(TmaCut):
    """
    One rooted cut's residual: its measured bearing less the bearing from its origin to where the solution was at its time, within plus or minus 180 degrees, as legacy Doublet.calculateBearingError.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    measured: Optional[float] = Field(default=None, description="""The bearing measured: the one kept, the cut's only one, or, for an ambiguous cut not yet resolved, the one nearer the solution (nearer_side), which the view says.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResidualRow']} })
    used: Optional[SensorCutKeptEnum] = Field(default=None, description="""Which of the cut's bearings measured is.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'TmaResidualRow']} })
    nearer_side: Optional[bool] = Field(default=None, description="""True for an ambiguous cut not yet resolved: measured is the bearing nearer the solution, chosen afresh as it moves (product owner, 24 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResidualRow', 'TmaResiduals']} })
    calculated: Optional[float] = Field(default=None, description="""The bearing from its origin to the solution at its time, along the geodesic.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResidualRow']} })
    residual: Optional[float] = Field(default=None, description="""measured less calculated, degrees, within (-180, 180]; left out where there is none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResidualRow']} })
    other_residual: Optional[float] = Field(default=None, description="""An ambiguous cut not yet resolved: its other bearing (the one not measured) less calculated, degrees, within (-180, 180]. Drawn faint and never counted, so the analyst can pick a side from the plot (product owner, 25 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResidualRow']} })
    excluded: Optional[bool] = Field(default=None, description="""Left out of the RMS error by the analyst.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResidualRow',
                       'TmaResiduals',
                       'TmaExcludeMessage',
                       'TmaExcludeCutParams']} })
    leg: Optional[int] = Field(default=None, description="""Which leg of the solution it falls in, from 1.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResidualRow']} })
    id: str = Field(default=..., description="""The cut's feature id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    sensor_id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'TmaView']} })
    sensor: Optional[str] = Field(default=None, description="""Its sensor's name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaCut', 'SensorInFile']} })
    colour: Optional[str] = Field(default=None, description="""The colour it is drawn in (its own, or its sensor's).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    time: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    bearing: float = Field(default=..., description="""The bearing recorded first, degrees true.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit', 'SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    ambiguous_bearing: Optional[float] = Field(default=None, description="""Its ambiguous twin, degrees true, where it has one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    resolved: Optional[SensorCutKeptEnum] = Field(default=None, description="""Which bearing the analyst kept, if resolved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow', 'SensorRow']} })
    side: Optional[SideEnum] = Field(default=None, description="""The side of the host's course its first bearing is on, where it has a twin and the side can be told.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaCut', 'SensorCutRow', 'TmaSplitLegParams']} })
    origin: Optional[conlist(min_length=2, max_length=2, item_type=float)] = Field(default=None, description="""[longitude, latitude] it was taken from: its own origin, else its sensor's position at its time (its array's, astern); left out outside its host's fixes, where it gives no residual.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 2}],
                   'exact_number_dimensions': 1},
         'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    origin_derived: Optional[bool] = Field(default=None, description="""Its origin was worked out by Debrief (pinned when its track was split), not recorded by the source (round 3 review, 24 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    label: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'SensorCutProperties',
                       'MeasureDefinition',
                       'TmaCut',
                       'SensorCutRow',
                       'FixMarkChanges']} })
    hidden: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'TmaCut',
                       'TmaResiduals',
                       'TimelineEntry',
                       'SetHiddenParams',
                       'SensorCutRow',
                       'SensorRow']} })

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


class TmaResiduals(ConfiguredBaseModel):
    """
    A solution's bearing residuals (debrief/tma_residuals): a row per rooted cut in time order, and the RMS error of those counted.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    solution_id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResiduals', 'TmaView']} })
    rows: list[TmaResidualRow] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToteResult', 'TmaResiduals']} })
    rms: Optional[float] = Field(default=None, description="""The root mean square of the residuals counted (degrees): every rooted cut with a residual, less those left out. Left out when none is counted.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResiduals']} })
    counted: int = Field(default=..., description="""How many residuals the RMS counts.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResiduals']} })
    excluded: int = Field(default=..., description="""How many cuts the analyst left out.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResidualRow',
                       'TmaResiduals',
                       'TmaExcludeMessage',
                       'TmaExcludeCutParams']} })
    without: int = Field(default=..., description="""How many rooted cuts give no residual: outside their host's fixes, or outside the solution's, or no longer in the plot.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResiduals']} })
    nearer_side: Optional[int] = Field(default=None, description="""How many ambiguous cuts use the bearing nearer the solution.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResidualRow', 'TmaResiduals']} })
    derived_origins: Optional[int] = Field(default=None, description="""How many cuts are taken from an origin Debrief worked out.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResiduals']} })
    hidden: Optional[int] = Field(default=None, description="""How many rooted cuts are hidden on the map: left out of the residuals and the RMS until shown again (legacy's \"only plot visible data\"; product owner, 25 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'TmaCut',
                       'TmaResiduals',
                       'TimelineEntry',
                       'SetHiddenParams',
                       'SensorCutRow',
                       'SensorRow']} })


class TmaSolutionRow(ConfiguredBaseModel):
    """
    A TMA solution in the plot, as the bearing view lists it and draws it.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    contact: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution', 'TmaRequest', 'TmaSolutionRow']} })
    colour: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    period: TimeRange = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    times: Optional[list[str]] = Field(default=None, description="""Its fixes' times, for the view to place it as a drag moves it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'RemoveJumpsParams']} })
    leg_starts: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution', 'TmaSolutionRow']} })
    cuts: int = Field(default=..., description="""How many cuts it is rooted in.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaView',
                       'SensorInFile',
                       'SensorPreview',
                       'SensorsParams',
                       'SensorRow',
                       'SensorImportReply']} })
    courses: Optional[list[float]] = Field(default=None, description="""Its course at each fix, degrees true: its DR legs' courses, for the Bearings view's Course/Speed pane (product owner, 25 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'TmaSolutionRow', 'TmaOwnship']} })
    speeds: Optional[list[float]] = Field(default=None, description="""Its speed at each fix, metres a second, for the Course/Speed pane.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'TmaSolutionRow', 'TmaOwnship']} })

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

    @field_validator('leg_starts')
    def pattern_leg_starts(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid leg_starts format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid leg_starts format: {v}"
            raise ValueError(err_msg)
        return v


class TmaOwnship(ConfiguredBaseModel):
    """
    A track carrying the solution's sensors (ownship): its course over the period the Bearings view shows, for the Course/Speed pane (product owner, 25 Oct 2026). Its courses as logged at its fixes, thinned to at most a few thousand.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., description="""The track's feature id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    colour: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    times: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'RemoveJumpsParams']} })
    courses: list[float] = Field(default=..., description="""Its course at each of those times, degrees true: as logged, else as its fixes imply (product owner, 28 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'TmaSolutionRow', 'TmaOwnship']} })
    speeds: Optional[list[float]] = Field(default=None, description="""Its speed at each of those times, metres a second: as logged, else as its fixes imply (product owner, 28 Oct 2026), for the Course/Speed pane's ownship speed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'TmaSolutionRow', 'TmaOwnship']} })

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


class TmaView(ConfiguredBaseModel):
    """
    What the host sends the bearing view (show_tma): the plot's sensors and solutions; the cuts of the sensor chosen, in time order; and, for the solution shown, its residuals. The view follows the Outline's selection (product owner, 27 Oct 2026): a solution, one of its legs or fixes shows the solution; a sensor, or some of its cuts, the sensor's coverage.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    title: Optional[str] = Field(default=None, description="""What is shown, in one line, as the host says it (product owner, 27 Oct 2026): \"Contact 1 solution, leg 2, fix at 10:38:00Z\", \"Towed array on BLUE ONE: 102 cuts\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    plot_id: Optional[str] = Field(default=None, description="""Which plot is open, as its host knows it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'ShowTimelineMessage']} })
    read_only: Optional[bool] = Field(default=None, description="""An earlier revision is shown read-only, so nothing can be changed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['KnownStore', 'TmaView', 'StoreListed', 'OpenParams']} })
    sensors: Optional[list[TmaSensorRow]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'SensorPreview', 'SensorsReply', 'SensorImportReply']} })
    sensor_id: Optional[str] = Field(default=None, description="""The sensor whose cuts are listed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'TmaView']} })
    cuts: Optional[list[TmaCut]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaView',
                       'SensorInFile',
                       'SensorPreview',
                       'SensorsParams',
                       'SensorRow',
                       'SensorImportReply']} })
    solutions: Optional[list[TmaSolutionRow]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView']} })
    solution_id: Optional[str] = Field(default=None, description="""The solution shown: the one selected on the map or in the Outline, or chosen in the view.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResiduals', 'TmaView']} })
    residuals: Optional[TmaResiduals] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'TmaResidualsReply', 'TmaChangeReply']} })
    coverage: Optional[list[TmaCut]] = Field(default=None, description="""With a solution shown, every cut of its sensors shown on the map, in time order, rooted or not: the Bearing pane plots each measured bearing over the sensors' whole coverage, the calculated bearings and errors only where the solution is (product owner, 25 Oct 2026). Cuts hidden on the map are left out.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'ShowCoverageMessage', 'CoverageReply']} })
    ownship: Optional[list[TmaOwnship]] = Field(default=None, description="""The tracks carrying the solution's sensors, with their courses, for the Course/Speed pane.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView']} })
    error_cut_off: Optional[float] = Field(default=None, description="""The analyst's error cut-off, degrees, from their Debrief configuration (tma_error_cut_off; 3 by default): the Error pane is green while every residual counted is within it, pink otherwise.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'TmaCutOffMessage']} })
    focus: Optional[TmaFocus] = Field(default=None, description="""Something to choose in the view once, as a command or a walkthrough's step asks (CAP-25): a cut, a period and its first guess, or the cut with the largest residual. Not kept: the view shows it and the analyst carries on from there.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView']} })


class TmaFocus(ConfiguredBaseModel):
    """
    What the bearing view chooses for the analyst, once (show_tma's focus): the cut at or nearest cut_time, current time moved to it; or the cuts in period, or cut_ids, the first guess's form opened for them if make; or, with a solution shown, the counted cut with the largest residual (largest), current time moved to it. The plot then has the keyboard (the form, if opened).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    cut_time: Optional[str] = Field(default=None, description="""Choose the cut at or nearest this time.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaFocus']} })
    period: Optional[TimeRange] = Field(default=None, description="""Choose the cuts in this period, ends included, as the period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    make: Optional[bool] = Field(default=None, description="""With period or cut_ids, open the first guess's form (TMA solution from cuts…).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaFocus']} })
    cut_ids: Optional[list[str]] = Field(default=None, description="""With make, the cuts the solution is to be rooted in, exactly: a run of cuts selected in the Outline (product owner, 27 Oct 2026).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'TmaFocus',
                       'TmaExcludeMessage',
                       'CutsParams',
                       'TmaExcludeCutParams']} })
    largest: Optional[bool] = Field(default=None, description="""Choose the cut counted in the RMS with the largest residual.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaFocus', 'SmoothingSummary']} })

    @field_validator('cut_time')
    def pattern_cut_time(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid cut_time format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid cut_time format: {v}"
            raise ValueError(err_msg)
        return v


class TimelineEntry(ConfiguredBaseModel):
    """
    One row of the Timeline (CAP-05, CAP-20): a narrative entry, a time-only annotation (a note or a period) or a comment on a track's fix, as the Timeline lists them, in one time order.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., description="""The narrative entry's or annotation's feature id, or fix:<track>:<time> for a fix's comment.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    kind: TimelineEntryKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
    start: str = Field(default=..., description="""Its time, or the start of its period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    end: Optional[str] = Field(default=None, description="""The end of its period; left out for a single time.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    source: str = Field(default=..., description="""Who wrote a narrative entry; an annotation's name; the track a fix comment is on; the item supplying a period of data.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'NarrativeRow',
                       'TakeNewDataParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams',
                       'DismissNewDataParams']} })
    entry_type: Optional[str] = Field(default=None, description="""A narrative entry's type, in its source's words.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'NarrativeRow']} })
    text: Optional[str] = Field(default=None, description="""Its text.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'NarrativeParams',
                       'NarrativeRow']} })
    track: Optional[str] = Field(default=None, description="""The track it belongs to: a narrative entry's track, or a fix's.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry',
                       'SensorInFile']} })
    colour: Optional[str] = Field(default=None, description="""That track's colour, lower-case hex RGB.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    hidden: Optional[bool] = Field(default=None, description="""An annotation or track hidden on the map.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'TmaCut',
                       'TmaResiduals',
                       'TimelineEntry',
                       'SetHiddenParams',
                       'SensorCutRow',
                       'SensorRow']} })

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


class WebviewMessageBase(ConfiguredBaseModel):
    """
    What every webview message has: its kind. Each kind's class below is one of these; the generator makes WebviewMessage, their union told apart by kind, in JSON Schema, Pydantic and TypeScript.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'abstract': True,
         'annotations': {'discriminator': {'tag': 'discriminator', 'value': 'kind'},
                         'union': {'tag': 'union', 'value': 'WebviewMessage'}},
         'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: WebviewMessageKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })


class ReadyMessage(WebviewMessageBase):
    """
    Webview to host: loaded and listening.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'ready', 'name': 'kind'}}})

    kind: Literal["ready"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'ready'} })


class ShowPlotMessage(WebviewMessageBase):
    """
    Host to map: draw this plot (plot, plot_title, selection, and current time and viewport if known, and how many features are hidden); with revision_shown, an earlier revision of the plot, shown read-only.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'show_plot', 'name': 'kind'},
                        'plot': {'name': 'plot', 'required': True},
                        'plot_title': {'name': 'plot_title', 'required': True},
                        'selection': {'name': 'selection', 'required': True}}})

    plot: DebriefFeatureCollection = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Selection',
                       'ShowPlotMessage',
                       'OpenReply',
                       'OpenRevisionReply']} })
    plot_title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ShowPlotMessage']} })
    selection: Selection = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ShowPlotMessage',
                       'SetSelectionMessage',
                       'SelectionChangedMessage']} })
    time: Optional[TimeState] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    viewport: Optional[Viewport] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'ShowPlotMessage',
                       'SetViewportMessage',
                       'ViewportChangedMessage',
                       'ExportImageParams']} })
    hidden_count: Optional[int] = Field(default=None, description="""How many of the plot's features are hidden on the map (SUB-22), so the map can say so.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['ShowPlotMessage']} })
    context_tracks: Optional[ContextTracksEnum] = Field(default=None, description="""How tracks outside the time window are drawn (CAP-29).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ShowPlotMessage',
                       'ShowTimeMessage',
                       'ContextChangedMessage',
                       'SetContextMessage']} })
    revision_shown: Optional[RevisionShown] = Field(default=None, description="""The plot shown is an earlier revision, read-only (show_plot).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowPlotMessage']} })
    kind: Literal["show_plot"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'show_plot'} })


class SetSelectionMessage(WebviewMessageBase):
    """
    Host to map: the selection changed elsewhere (selection).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'set_selection', 'name': 'kind'},
                        'selection': {'name': 'selection', 'required': True}}})

    selection: Selection = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ShowPlotMessage',
                       'SetSelectionMessage',
                       'SelectionChangedMessage']} })
    kind: Literal["set_selection"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'set_selection'} })


class SelectionChangedMessage(WebviewMessageBase):
    """
    Map to host: the analyst changed the selection (selection).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'selection_changed', 'name': 'kind'},
                        'selection': {'name': 'selection', 'required': True}}})

    selection: Selection = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ShowPlotMessage',
                       'SetSelectionMessage',
                       'SelectionChangedMessage']} })
    kind: Literal["selection_changed"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'selection_changed'} })


class SetTimeMessage(WebviewMessageBase):
    """
    Host to map: current time changed elsewhere (time).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'set_time', 'name': 'kind'},
                        'time': {'name': 'time', 'required': True}}})

    time: TimeState = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    kind: Literal["set_time"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'set_time'} })


class TimeChangedMessage(WebviewMessageBase):
    """
    Map to host: the analyst moved current time (time).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'time_changed', 'name': 'kind'},
                        'time': {'name': 'time', 'required': True}}})

    time: TimeState = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    kind: Literal["time_changed"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'time_changed'} })


class SetViewportMessage(WebviewMessageBase):
    """
    Host to map: show this area (viewport).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'set_viewport', 'name': 'kind'},
                        'viewport': {'name': 'viewport', 'required': True}}})

    viewport: Viewport = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'ShowPlotMessage',
                       'SetViewportMessage',
                       'ViewportChangedMessage',
                       'ExportImageParams']} })
    kind: Literal["set_viewport"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'set_viewport'} })


class ViewportChangedMessage(WebviewMessageBase):
    """
    Map to host: the analyst panned or zoomed (viewport).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'viewport_changed', 'name': 'kind'},
                        'viewport': {'name': 'viewport', 'required': True}}})

    viewport: Viewport = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'ShowPlotMessage',
                       'SetViewportMessage',
                       'ViewportChangedMessage',
                       'ExportImageParams']} })
    kind: Literal["viewport_changed"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'viewport_changed'} })


class ShowHiddenMessage(WebviewMessageBase):
    """
    Map to host: show every feature hidden on the map (no members).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'show_hidden', 'name': 'kind'}}})

    kind: Literal["show_hidden"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'show_hidden'} })


class ShowFormMessage(WebviewMessageBase):
    """
    Host to form: show this tool's form (tool, selected_names, time_range of the plot, and current time if known).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'show_form', 'name': 'kind'},
                        'selected_names': {'name': 'selected_names', 'required': True},
                        'tool': {'name': 'tool', 'required': True}}})

    tool: ToolDeclaration = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'ShowFormMessage',
                       'ShowResultsMessage',
                       'ListedStep']} })
    selected_names: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ShowFormMessage']} })
    time_range: Optional[TimeRange] = Field(default=None, description="""The plot's period, so times can be entered as the analyst reads them (show_form) and the time window set within it (show_time); the time window to save (window_changed); or the period whose source the analyst chose (source_chosen).""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'ShowFormMessage',
                       'ShowTimeMessage',
                       'WindowChangedMessage',
                       'ShowAnnotationFormMessage',
                       'SourceChosenMessage']} })
    current_time: Optional[str] = Field(default=None, description="""Current time from shared state, which a tool form offers for its time fields.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowFormMessage',
                       'ShowAnnotationFormMessage',
                       'TmaSplitMessage',
                       'TmaTimeAskedMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'EditTrackParams']} })
    kind: Literal["show_form"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'show_form'} })

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


class RunToolMessage(WebviewMessageBase):
    """
    Form to host: run the tool with these values (tool_name, parameters).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'run_tool', 'name': 'kind'},
                        'parameters': {'name': 'parameters', 'required': True},
                        'tool_name': {'name': 'tool_name', 'required': True}}})

    tool_name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['RunToolMessage']} })
    parameters: list[ParameterValue] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'ToolDeclaration', 'RunToolMessage']} })
    kind: Literal["run_tool"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'run_tool'} })


class CancelMessage(WebviewMessageBase):
    """
    Form to host: close without running.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'cancel', 'name': 'kind'}}})

    kind: Literal["cancel"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'cancel'} })


class FormBusyMessage(WebviewMessageBase):
    """
    Host to form: the tool is running (message).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'form_busy', 'name': 'kind'},
                        'message': {'name': 'message', 'required': True}}})

    message: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FormBusyMessage',
                       'FormErrorMessage',
                       'ShowFixesMessage',
                       'NarrativeSavedMessage',
                       'ShowCoverageMessage',
                       'ImageRenderedMessage',
                       'TmaMadeMessage',
                       'TakeNewDataReply']} })
    kind: Literal["form_busy"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'form_busy'} })


class FormErrorMessage(WebviewMessageBase):
    """
    Host to form: the run failed or a value was refused (message).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'form_error', 'name': 'kind'},
                        'message': {'name': 'message', 'required': True}}})

    message: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FormBusyMessage',
                       'FormErrorMessage',
                       'ShowFixesMessage',
                       'NarrativeSavedMessage',
                       'ShowCoverageMessage',
                       'ImageRenderedMessage',
                       'TmaMadeMessage',
                       'TakeNewDataReply']} })
    kind: Literal["form_error"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'form_error'} })


class ShowResultsMessage(WebviewMessageBase):
    """
    Host to results: show a tool's result (tool, result_title, result).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'show_results', 'name': 'kind'},
                        'result': {'name': 'result', 'required': True},
                        'result_title': {'name': 'result_title', 'required': True},
                        'tool': {'name': 'tool', 'required': True}}})

    tool: ToolDeclaration = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'ShowFormMessage',
                       'ShowResultsMessage',
                       'ListedStep']} })
    result_title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ShowResultsMessage']} })
    result: ToolResult = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ShowResultsMessage', 'HostAnswerParams']} })
    kind: Literal["show_results"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'show_results'} })


class ShowTimeMessage(WebviewMessageBase):
    """
    Host to time controller: current time, its range being the time window shown (time), the plot's whole period (time_range), the window as saved in the plot (saved_window), how tracks outside the window are drawn (context_tracks) and whether the analyst's setting shows faint as visible (minimum_context_contrast); none when no plot is open.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'show_time', 'name': 'kind'}}})

    time: Optional[TimeState] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    time_range: Optional[TimeRange] = Field(default=None, description="""The plot's period, so times can be entered as the analyst reads them (show_form) and the time window set within it (show_time); the time window to save (window_changed); or the period whose source the analyst chose (source_chosen).""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'ShowFormMessage',
                       'ShowTimeMessage',
                       'WindowChangedMessage',
                       'ShowAnnotationFormMessage',
                       'SourceChosenMessage']} })
    saved_window: Optional[TimeRange] = Field(default=None, description="""The time window as saved in the plot, so the time controller can say when the window shown differs from it (CAP-28).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowTimeMessage']} })
    context_tracks: Optional[ContextTracksEnum] = Field(default=None, description="""How tracks outside the time window are drawn (CAP-29).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ShowPlotMessage',
                       'ShowTimeMessage',
                       'ContextChangedMessage',
                       'SetContextMessage']} })
    minimum_context_contrast: Optional[bool] = Field(default=None, description="""The analyst's setting that shows faint context tracks as visible, so the time controller can say so.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowTimeMessage']} })
    kind: Literal["show_time"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'show_time'} })


class WindowChangedMessage(WebviewMessageBase):
    """
    Time controller to host: the analyst let go of the time window, or chose Keep; save it in the plot (time_range).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'window_changed', 'name': 'kind'},
                        'time_range': {'name': 'time_range', 'required': True}}})

    time_range: TimeRange = Field(default=..., description="""The plot's period, so times can be entered as the analyst reads them (show_form) and the time window set within it (show_time); the time window to save (window_changed); or the period whose source the analyst chose (source_chosen).""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'ShowFormMessage',
                       'ShowTimeMessage',
                       'WindowChangedMessage',
                       'ShowAnnotationFormMessage',
                       'SourceChosenMessage']} })
    kind: Literal["window_changed"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'window_changed'} })


class ContextChangedMessage(WebviewMessageBase):
    """
    Time controller to host: the analyst chose how tracks outside the window are drawn; save it in the plot (context_tracks).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'context_tracks': {'name': 'context_tracks', 'required': True},
                        'kind': {'equals_string': 'context_changed', 'name': 'kind'}}})

    context_tracks: ContextTracksEnum = Field(default=..., description="""How tracks outside the time window are drawn (CAP-29).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ShowPlotMessage',
                       'ShowTimeMessage',
                       'ContextChangedMessage',
                       'SetContextMessage']} })
    kind: Literal["context_changed"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'context_changed'} })


class SetContextMessage(WebviewMessageBase):
    """
    Host to map: draw tracks outside the window this way (context_tracks), the analyst's setting already applied.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'context_tracks': {'name': 'context_tracks', 'required': True},
                        'kind': {'equals_string': 'set_context', 'name': 'kind'}}})

    context_tracks: ContextTracksEnum = Field(default=..., description="""How tracks outside the time window are drawn (CAP-29).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ShowPlotMessage',
                       'ShowTimeMessage',
                       'ContextChangedMessage',
                       'SetContextMessage']} })
    kind: Literal["set_context"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'set_context'} })


class ShowAnnotationFormMessage(WebviewMessageBase):
    """
    Host to annotation form: add an annotation, or change the one given (annotation and feature_id); the plot's period (time_range) and current time if known.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'show_annotation_form',
                                 'name': 'kind'}}})

    annotation: Optional[AnnotationSpec] = Field(default=None, description="""An annotation as the form describes it (show_annotation_form, save_annotation), as drawn on the map (annotation_drawn), or as changed on the map (edit_annotation).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'EditAnnotationMessage',
                       'AnnotationDrawnMessage',
                       'AddAnnotationParams',
                       'EditAnnotationParams']} })
    feature_id: Optional[str] = Field(default=None, description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    time_range: Optional[TimeRange] = Field(default=None, description="""The plot's period, so times can be entered as the analyst reads them (show_form) and the time window set within it (show_time); the time window to save (window_changed); or the period whose source the analyst chose (source_chosen).""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'ShowFormMessage',
                       'ShowTimeMessage',
                       'WindowChangedMessage',
                       'ShowAnnotationFormMessage',
                       'SourceChosenMessage']} })
    current_time: Optional[str] = Field(default=None, description="""Current time from shared state, which a tool form offers for its time fields.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowFormMessage',
                       'ShowAnnotationFormMessage',
                       'TmaSplitMessage',
                       'TmaTimeAskedMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'EditTrackParams']} })
    kind: Literal["show_annotation_form"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'show_annotation_form'} })

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


class SaveAnnotationMessage(WebviewMessageBase):
    """
    Annotation form to host: add this annotation, or change the one named (annotation, and feature_id when changing one).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'annotation': {'name': 'annotation', 'required': True},
                        'kind': {'equals_string': 'save_annotation', 'name': 'kind'}}})

    annotation: AnnotationSpec = Field(default=..., description="""An annotation as the form describes it (show_annotation_form, save_annotation), as drawn on the map (annotation_drawn), or as changed on the map (edit_annotation).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'EditAnnotationMessage',
                       'AnnotationDrawnMessage',
                       'AddAnnotationParams',
                       'EditAnnotationParams']} })
    feature_id: Optional[str] = Field(default=None, description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    kind: Literal["save_annotation"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'save_annotation'} })


class DeleteAnnotationMessage(WebviewMessageBase):
    """
    Annotation form to host: delete this annotation (feature_id).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'delete_annotation', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    kind: Literal["delete_annotation"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'delete_annotation'} })


class EditAnnotationMessage(WebviewMessageBase):
    """
    Map to host: the analyst asked to change this annotation (feature_id): by double-clicking it, which opens its form; or, with annotation, by dragging or nudging it on the map, which changes it so as one recorded step.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'edit_annotation', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    annotation: Optional[AnnotationSpec] = Field(default=None, description="""An annotation as the form describes it (show_annotation_form, save_annotation), as drawn on the map (annotation_drawn), or as changed on the map (edit_annotation).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'EditAnnotationMessage',
                       'AnnotationDrawnMessage',
                       'AddAnnotationParams',
                       'EditAnnotationParams']} })
    kind: Literal["edit_annotation"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'edit_annotation'} })


class AnnotationDrawnMessage(WebviewMessageBase):
    """
    Map to host: the analyst finished drawing an annotation on the map (annotation, its name empty); open the annotation form with it, to name it and add it as one step.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'annotation': {'name': 'annotation', 'required': True},
                        'kind': {'equals_string': 'annotation_drawn', 'name': 'kind'}}})

    annotation: AnnotationSpec = Field(default=..., description="""An annotation as the form describes it (show_annotation_form, save_annotation), as drawn on the map (annotation_drawn), or as changed on the map (edit_annotation).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'EditAnnotationMessage',
                       'AnnotationDrawnMessage',
                       'AddAnnotationParams',
                       'EditAnnotationParams']} })
    kind: Literal["annotation_drawn"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'annotation_drawn'} })


class EditTrackMessage(WebviewMessageBase):
    """
    Map to host: the analyst let go of a track's move, rotate, shear or stretch handle or one of its fixes, or stopped nudging one (feature_id, track_edit); change it so, as one recorded step.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'edit_track', 'name': 'kind'},
                        'track_edit': {'name': 'track_edit', 'required': True}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    track_edit: TrackEdit = Field(default=..., description="""How the analyst moved, rotated, sheared or stretched a track, or moved one of its fixes, on the map (edit_track).""", json_schema_extra = { "linkml_meta": {'domain_of': ['EditTrackMessage']} })
    kind: Literal["edit_track"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'edit_track'} })


class ShowFixesMessage(WebviewMessageBase):
    """
    Host to map: ring these fixes of a track for the analyst to check (feature_id, fix_times), such as jumps found before they are removed, and perhaps draw the track as a change would leave it (preview), with a note (message); with no feature_id, take them away.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'show_fixes', 'name': 'kind'}}})

    feature_id: Optional[str] = Field(default=None, description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    fix_times: Optional[list[str]] = Field(default=None, description="""The times of the fixes the map rings (show_fixes).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowFixesMessage']} })
    preview: Optional[LineStringGeometry] = Field(default=None, description="""A track as a change would leave it, one position per fix, drawn beside it until the analyst applies or cancels the change (show_fixes).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowFixesMessage',
                       'TmaPreviewMessage',
                       'SmoothingPreviewReply']} })
    message: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FormBusyMessage',
                       'FormErrorMessage',
                       'ShowFixesMessage',
                       'NarrativeSavedMessage',
                       'ShowCoverageMessage',
                       'ImageRenderedMessage',
                       'TmaMadeMessage',
                       'TakeNewDataReply']} })
    kind: Literal["show_fixes"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'show_fixes'} })

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


class ShowToteMessage(WebviewMessageBase):
    """
    Host to Tote: the tracks that can be chosen (tote_tracks), which are chosen (tote_view) and the values at current time (tote), any of them; none when no plot is open.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'show_tote', 'name': 'kind'}}})

    tote_tracks: Optional[list[ToteTrack]] = Field(default=None, description="""The plot's tracks, which the analyst can choose from for the Tote (show_tote).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowToteMessage']} })
    tote_view: Optional[ToteView] = Field(default=None, description="""Which tracks the Tote compares, as saved in the plot (show_tote, set_tote) or as the analyst chose (tote_changed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowToteMessage', 'ToteChangedMessage', 'SetToteMessage']} })
    tote: Optional[ToteResult] = Field(default=None, description="""The Tote's values at current time (show_tote).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ImageExport',
                       'ShowToteMessage',
                       'ToteParams',
                       'ExportImageParams']} })
    kind: Literal["show_tote"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'show_tote'} })


class ToteChangedMessage(WebviewMessageBase):
    """
    Tote to host: the analyst chose a primary, added or removed a secondary, chose a measure group, or turned the map's lines on or off; save it in the plot (tote_view).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'tote_changed', 'name': 'kind'},
                        'tote_view': {'name': 'tote_view', 'required': True}}})

    tote_view: ToteView = Field(default=..., description="""Which tracks the Tote compares, as saved in the plot (show_tote, set_tote) or as the analyst chose (tote_changed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowToteMessage', 'ToteChangedMessage', 'SetToteMessage']} })
    kind: Literal["tote_changed"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tote_changed'} })


class SetToteMessage(WebviewMessageBase):
    """
    Host to map: which tracks the Tote compares (tote_view), for a thin line from the primary to each secondary at current time unless its map_lines is false; none when nothing is chosen.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'set_tote', 'name': 'kind'}}})

    tote_view: Optional[ToteView] = Field(default=None, description="""Which tracks the Tote compares, as saved in the plot (show_tote, set_tote) or as the analyst chose (tote_changed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowToteMessage', 'ToteChangedMessage', 'SetToteMessage']} })
    kind: Literal["set_tote"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'set_tote'} })


class ShowTimelineMessage(WebviewMessageBase):
    """
    Host to Timeline: what the Timeline lists (timeline_entries, in its order), the tracks a narrative entry can belong to (timeline_tracks), current time with the window shown (time), which plot it is (plot_id, so another plot is told from the same one changed) and whether the map shows the narrative entry at current time (narrative_on_map, left out meaning it does); none when no plot is open.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'show_timeline', 'name': 'kind'}}})

    timeline_entries: Optional[list[TimelineEntry]] = Field(default=None, description="""The Timeline's rows, in its order (show_timeline).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowTimelineMessage']} })
    timeline_tracks: Optional[list[ToteTrack]] = Field(default=None, description="""The plot's tracks, which a narrative entry can belong to (show_timeline).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowTimelineMessage']} })
    time: Optional[TimeState] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    plot_id: Optional[str] = Field(default=None, description="""Which plot is open, as its host knows it (show_timeline): a list read again for the same plot keeps the reader's place; another plot is read from current time.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'ShowTimelineMessage']} })
    narrative_on_map: Optional[bool] = Field(default=None, description="""Whether the map shows the narrative entry current time is at beside its track (show_timeline, narrative_on_map_changed): the plot's PlotView.narrative_on_map; left out means it does.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ShowTimelineMessage',
                       'NarrativeOnMapChangedMessage']} })
    kind: Literal["show_timeline"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'show_timeline'} })


class NarrativeOnMapChangedMessage(WebviewMessageBase):
    """
    Timeline to host: the analyst turned the narrative box on the map on or off (narrative_on_map); save it in the plot's island.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'narrative_on_map_changed',
                                 'name': 'kind'},
                        'narrative_on_map': {'name': 'narrative_on_map',
                                             'required': True}}})

    narrative_on_map: bool = Field(default=..., description="""Whether the map shows the narrative entry current time is at beside its track (show_timeline, narrative_on_map_changed): the plot's PlotView.narrative_on_map; left out means it does.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ShowTimelineMessage',
                       'NarrativeOnMapChangedMessage']} })
    kind: Literal["narrative_on_map_changed"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'narrative_on_map_changed'} })


class PlayingChangedMessage(WebviewMessageBase):
    """
    Time controller to host, and host to Timeline: current time started or stopped playing (playing). The Timeline follows current time again when playing starts.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'playing_changed', 'name': 'kind'},
                        'playing': {'name': 'playing', 'required': True}}})

    playing: bool = Field(default=..., description="""Whether current time is playing (playing_changed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlayingChangedMessage']} })
    kind: Literal["playing_changed"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'playing_changed'} })


class TimelineChosenMessage(WebviewMessageBase):
    """
    Timeline to host: the analyst chose an entry (feature_id, the entry's id): move current time to it.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'timeline_chosen', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    kind: Literal["timeline_chosen"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'timeline_chosen'} })


class SaveNarrativeMessage(WebviewMessageBase):
    """
    Timeline to host: add this narrative entry, or change the one named (narrative, and feature_id when changing one), as one recorded step.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'save_narrative', 'name': 'kind'},
                        'narrative': {'name': 'narrative', 'required': True}}})

    narrative: NarrativeSpec = Field(default=..., description="""A narrative entry as the Timeline's form describes it (save_narrative).""", json_schema_extra = { "linkml_meta": {'domain_of': ['SaveNarrativeMessage']} })
    feature_id: Optional[str] = Field(default=None, description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    kind: Literal["save_narrative"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'save_narrative'} })


class DeleteNarrativeMessage(WebviewMessageBase):
    """
    Timeline to host: delete this narrative entry (feature_id), as one recorded step.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'delete_narrative', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    kind: Literal["delete_narrative"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'delete_narrative'} })


class OpenNarrativeFormMessage(WebviewMessageBase):
    """
    Host to Timeline: open the form to add a narrative entry, or to change the one named (feature_id), as a command or an agent asked.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'open_narrative_form',
                                 'name': 'kind'}}})

    feature_id: Optional[str] = Field(default=None, description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    kind: Literal["open_narrative_form"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'open_narrative_form'} })


class NarrativeSavedMessage(WebviewMessageBase):
    """
    Host to Timeline: the entry was added or changed (feature_id), so the form closes and the list shows it; or, with message, why it was not.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'narrative_saved', 'name': 'kind'}}})

    feature_id: Optional[str] = Field(default=None, description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    message: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FormBusyMessage',
                       'FormErrorMessage',
                       'ShowFixesMessage',
                       'NarrativeSavedMessage',
                       'ShowCoverageMessage',
                       'ImageRenderedMessage',
                       'TmaMadeMessage',
                       'TakeNewDataReply']} })
    kind: Literal["narrative_saved"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'narrative_saved'} })


class SetNarrativeMessage(WebviewMessageBase):
    """
    Host to map: the narrative entry current time is at, where it belongs to a track (timeline_entry), to show beside that track's marker; none to take it away.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'set_narrative', 'name': 'kind'}}})

    timeline_entry: Optional[TimelineEntry] = Field(default=None, description="""The narrative entry current time is at, to show on the map beside its track (set_narrative).""", json_schema_extra = { "linkml_meta": {'domain_of': ['SetNarrativeMessage']} })
    kind: Literal["set_narrative"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'set_narrative'} })


class UndoAskedMessage(WebviewMessageBase):
    """
    Timeline to host: the analyst pressed Undo (Ctrl+Z; Cmd+Z on macOS) with focus in the Timeline but not in a text box: undo the plot's last step, as the map, Outline and History do (decision, product owner, 15 Oct 2026).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'undo_asked', 'name': 'kind'}}})

    kind: Literal["undo_asked"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'undo_asked'} })


class RedoAskedMessage(WebviewMessageBase):
    """
    Timeline to host: the analyst pressed Redo (Ctrl+Shift+Z or Ctrl+Y; Cmd+Shift+Z on macOS) with focus in the Timeline but not in a text box: redo the step last undone.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'redo_asked', 'name': 'kind'}}})

    kind: Literal["redo_asked"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'redo_asked'} })


class FixChosenMessage(WebviewMessageBase):
    """
    Map to host: the analyst asked to colour, label or comment on a fix (feature_id, fix_time), by right-clicking it or pressing Enter on a fix chosen with the keyboard.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature_id': {'name': 'feature_id', 'required': True},
                        'fix_time': {'name': 'fix_time', 'required': True},
                        'kind': {'equals_string': 'fix_chosen', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    fix_time: str = Field(default=..., description="""The time of the fix the analyst chose on the map (fix_chosen).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit', 'FixChosenMessage']} })
    kind: Literal["fix_chosen"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'fix_chosen'} })

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


class ShowCoverageMessage(WebviewMessageBase):
    """
    Host to Coverage: the open plot's coverage (coverage) and current time (time); none when no plot is open; or, with message alone, why what the analyst asked for was not done, leaving what is shown.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'show_coverage', 'name': 'kind'}}})

    coverage: Optional[CoverageReport] = Field(default=None, description="""The open plot's coverage (show_coverage).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'ShowCoverageMessage', 'CoverageReply']} })
    time: Optional[TimeState] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    message: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FormBusyMessage',
                       'FormErrorMessage',
                       'ShowFixesMessage',
                       'NarrativeSavedMessage',
                       'ShowCoverageMessage',
                       'ImageRenderedMessage',
                       'TmaMadeMessage',
                       'TakeNewDataReply']} })
    kind: Literal["show_coverage"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'show_coverage'} })


class SourceChosenMessage(WebviewMessageBase):
    """
    Coverage to host: the analyst chose which source supplies a period of a track (feature_id, time_range, source), as one recorded step (CAP-09).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'source_chosen', 'name': 'kind'},
                        'source': {'name': 'source', 'required': True},
                        'time_range': {'name': 'time_range', 'required': True}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    time_range: TimeRange = Field(default=..., description="""The plot's period, so times can be entered as the analyst reads them (show_form) and the time window set within it (show_time); the time window to save (window_changed); or the period whose source the analyst chose (source_chosen).""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'ShowFormMessage',
                       'ShowTimeMessage',
                       'WindowChangedMessage',
                       'ShowAnnotationFormMessage',
                       'SourceChosenMessage']} })
    source: SourceTrackRef = Field(default=..., description="""A track in a catalogue item (source_chosen, link_changed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'NarrativeRow',
                       'TakeNewDataParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams',
                       'DismissNewDataParams']} })
    kind: Literal["source_chosen"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'source_chosen'} })


class LinkChangedMessage(WebviewMessageBase):
    """
    Coverage to host: the analyst confirmed or linked (linked true), or refused or unlinked (linked false), a track in another item as the platform of the plot's track (feature_id, source), as one recorded step.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'link_changed', 'name': 'kind'},
                        'linked': {'name': 'linked', 'required': True},
                        'source': {'name': 'source', 'required': True}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    source: SourceTrackRef = Field(default=..., description="""A track in a catalogue item (source_chosen, link_changed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'NarrativeRow',
                       'TakeNewDataParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams',
                       'DismissNewDataParams']} })
    linked: bool = Field(default=..., description="""Whether the source is the track's platform (link_changed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['LinkChangedMessage', 'LinkTracksParams']} })
    kind: Literal["link_changed"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'link_changed'} })


class TakeAskedMessage(WebviewMessageBase):
    """
    Coverage to host: take the new data in this item into the plot (item_revision), as one recorded step (CAP-11).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'item_revision': {'name': 'item_revision', 'required': True},
                        'kind': {'equals_string': 'take_asked', 'name': 'kind'}}})

    item_revision: ItemRevision = Field(default=..., description="""The item, at the revision the analyst saw (take_asked, dismiss_asked).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TakeAskedMessage', 'DismissAskedMessage']} })
    kind: Literal["take_asked"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'take_asked'} })


class DismissAskedMessage(WebviewMessageBase):
    """
    Coverage to host: set this item's new data aside for now (item_revision): its mark clears until it is revised (CAP-10).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'item_revision': {'name': 'item_revision', 'required': True},
                        'kind': {'equals_string': 'dismiss_asked', 'name': 'kind'}}})

    item_revision: ItemRevision = Field(default=..., description="""The item, at the revision the analyst saw (take_asked, dismiss_asked).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TakeAskedMessage', 'DismissAskedMessage']} })
    kind: Literal["dismiss_asked"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'dismiss_asked'} })


class ReviewClearedMessage(WebviewMessageBase):
    """
    Coverage to host: the analyst reviewed the plot against the items revised since it drew from them; clear its review flag (CAP-12).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'review_cleared', 'name': 'kind'}}})

    kind: Literal["review_cleared"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'review_cleared'} })


class ExportImageMessage(WebviewMessageBase):
    """
    Host to map: draw the map as an image (image_request), as the analyst sees it, at the size, in the theme and with the footer asked for (SUB-25).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'image_request': {'name': 'image_request', 'required': True},
                        'kind': {'equals_string': 'export_image', 'name': 'kind'}}})

    image_request: ImageRequest = Field(default=..., description="""What image to draw, and how (export_image).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ExportImageMessage']} })
    kind: Literal["export_image"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'export_image'} })


class ImageRenderedMessage(WebviewMessageBase):
    """
    Map to host: the image drawn (image), for its ID to go into its metadata; or, with message alone, why it could not be drawn.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'image_rendered', 'name': 'kind'}}})

    image: Optional[RenderedImage] = Field(default=None, description="""The image the map drew (image_rendered).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ImageRenderedMessage', 'ExportImageParams', 'StampedImage']} })
    message: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FormBusyMessage',
                       'FormErrorMessage',
                       'ShowFixesMessage',
                       'NarrativeSavedMessage',
                       'ShowCoverageMessage',
                       'ImageRenderedMessage',
                       'TmaMadeMessage',
                       'TakeNewDataReply']} })
    kind: Literal["image_rendered"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'image_rendered'} })


class LatestAskedMessage(WebviewMessageBase):
    """
    Map to host: the analyst asked to leave the earlier revision shown read-only and go to the plot's latest (no members).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'latest_asked', 'name': 'kind'}}})

    kind: Literal["latest_asked"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'latest_asked'} })


class ResolveAskedMessage(WebviewMessageBase):
    """
    Map to host: the analyst Alt-clicked one of an ambiguous cut's two lines (feature_id, the cut), keeping that bearing (keep: bearing or ambiguous_bearing), or chose a Keep or Make ambiguous again button in the popover a plain click on the cut shows (keep: bearing, ambiguous_bearing or ambiguous), as one recorded step (CAP-22; product owner, 24 Oct 2026: a plain click only selects).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature_id': {'name': 'feature_id', 'required': True},
                        'keep': {'name': 'keep', 'required': True},
                        'kind': {'equals_string': 'resolve_asked', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    keep: AmbiguityKeepEnum = Field(default=..., description="""Which of an ambiguous cut's bearings the analyst clicked, to keep (resolve_asked).""", json_schema_extra = { "linkml_meta": {'domain_of': ['AmbiguityResolution', 'ResolveAskedMessage']} })
    kind: Literal["resolve_asked"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'resolve_asked'} })


class CutChosenMessage(WebviewMessageBase):
    """
    Map to host: the analyst asked for a cut's menu (feature_id, the cut), by right-clicking it or pressing and holding it on a touch screen: keep port, keep starboard, ambiguous again, or select it.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'cut_chosen', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    kind: Literal["cut_chosen"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'cut_chosen'} })


class ShowTmaMessage(WebviewMessageBase):
    """
    Host to bearing view: the plot's sensors and TMA solutions, the cuts of the sensor chosen, and the residuals of the solution shown (tma); none when no plot is open (CAP-21).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'show_tma', 'name': 'kind'}}})

    tma: Optional[TmaView] = Field(default=None, description="""What the bearing view shows (show_tma).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'ShowTmaMessage']} })
    kind: Literal["show_tma"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'show_tma'} })


class TmaChosenMessage(WebviewMessageBase):
    """
    Bearing view to host: the analyst chose a sensor, to list its cuts, or a solution, to show its residuals (feature_id).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'tma_chosen', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    kind: Literal["tma_chosen"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_chosen'} })


class TmaCreateMessage(WebviewMessageBase):
    """
    Bearing view to host: make a TMA solution as asked (tma_request: the cuts, and a first guess by form), as one recorded step (CAP-21; product owner, 24 Oct 2026).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'tma_create', 'name': 'kind'},
                        'tma_request': {'name': 'tma_request', 'required': True}}})

    tma_request: TmaRequest = Field(default=..., description="""A TMA solution asked for (tma_create, tma_guess, tma_guessed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaCreateMessage', 'TmaGuessMessage', 'TmaGuessedMessage']} })
    kind: Literal["tma_create"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_create'} })


class TmaGuessMessage(WebviewMessageBase):
    """
    Host to map: the analyst asked to make a TMA solution by two clicks (tma_request: the cuts), one on the first cut's line and one on the last's; with no tma_request, stop asking.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'tma_guess', 'name': 'kind'}}})

    tma_request: Optional[TmaRequest] = Field(default=None, description="""A TMA solution asked for (tma_create, tma_guess, tma_guessed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaCreateMessage', 'TmaGuessMessage', 'TmaGuessedMessage']} })
    kind: Literal["tma_guess"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_guess'} })


class TmaGuessedMessage(WebviewMessageBase):
    """
    Map to host: the two clicks made (tma_request, with first_position and last_position), so the solution is made as one recorded step; with no tma_request, the analyst cancelled.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'tma_guessed', 'name': 'kind'}}})

    tma_request: Optional[TmaRequest] = Field(default=None, description="""A TMA solution asked for (tma_create, tma_guess, tma_guessed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaCreateMessage', 'TmaGuessMessage', 'TmaGuessedMessage']} })
    kind: Literal["tma_guessed"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_guessed'} })


class TmaPreviewMessage(WebviewMessageBase):
    """
    Map to host, and host to bearing view: a TMA solution as a drag on the map now leaves it (feature_id, preview: one position per fix), so its residuals are worked out again as it moves; with no preview, the drag ended or was put back.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'tma_preview', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    preview: Optional[LineStringGeometry] = Field(default=None, description="""A track as a change would leave it, one position per fix, drawn beside it until the analyst applies or cancels the change (show_fixes).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowFixesMessage',
                       'TmaPreviewMessage',
                       'SmoothingPreviewReply']} })
    kind: Literal["tma_preview"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_preview'} })


class TmaExcludeMessage(WebviewMessageBase):
    """
    Bearing view to host: leave these rooted cuts out of the solution's RMS error (excluded true), or count them again (excluded false) (feature_id, the solution; cut_ids), as one recorded step.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'cut_ids': {'name': 'cut_ids', 'required': True},
                        'excluded': {'name': 'excluded', 'required': True},
                        'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'tma_exclude', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    cut_ids: list[str] = Field(default=..., description="""The rooted cuts left out of a solution's RMS error, or counted again (tma_exclude).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'TmaFocus',
                       'TmaExcludeMessage',
                       'CutsParams',
                       'TmaExcludeCutParams']} })
    excluded: bool = Field(default=..., description="""Whether the cuts are left out (tma_exclude).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResidualRow',
                       'TmaResiduals',
                       'TmaExcludeMessage',
                       'TmaExcludeCutParams']} })
    kind: Literal["tma_exclude"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_exclude'} })


class TmaSplitMessage(WebviewMessageBase):
    """
    Bearing view to host: split the solution into legs at this time (feature_id, the solution; current_time), as one recorded step.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'current_time': {'name': 'current_time', 'required': True},
                        'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'tma_split', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    current_time: str = Field(default=..., description="""Current time from shared state, which a tool form offers for its time fields.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowFormMessage',
                       'ShowAnnotationFormMessage',
                       'TmaSplitMessage',
                       'TmaTimeAskedMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'EditTrackParams']} })
    kind: Literal["tma_split"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_split'} })

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


class TmaTimeAskedMessage(WebviewMessageBase):
    """
    Bearing view to host: move current time to this cut's time (current_time), so the map emphasises it.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'current_time': {'name': 'current_time', 'required': True},
                        'kind': {'equals_string': 'tma_time_asked', 'name': 'kind'}}})

    current_time: str = Field(default=..., description="""Current time from shared state, which a tool form offers for its time fields.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowFormMessage',
                       'ShowAnnotationFormMessage',
                       'TmaSplitMessage',
                       'TmaTimeAskedMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'EditTrackParams']} })
    kind: Literal["tma_time_asked"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_time_asked'} })

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


class TmaSelectMessage(WebviewMessageBase):
    """
    Bearing view to host: the analyst clicked a dot in the Bearings view's plot: select this feature (feature_id: the cut, or the solution for one of its fixes) in the Outline and on the map, and move current time to it (current_time) (product owner, 25 Oct 2026).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'current_time': {'name': 'current_time', 'required': True},
                        'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'tma_select', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    current_time: str = Field(default=..., description="""Current time from shared state, which a tool form offers for its time fields.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowFormMessage',
                       'ShowAnnotationFormMessage',
                       'TmaSplitMessage',
                       'TmaTimeAskedMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'EditTrackParams']} })
    kind: Literal["tma_select"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_select'} })

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


class TmaMenuMessage(WebviewMessageBase):
    """
    Bearing view to host: the analyst right-clicked a dot in the Bearings view's plot: the Outline's menu for it (feature_id: the cut, or the solution for one of its fixes; current_time: the dot's time), whose entries include splitting the solution there and selecting it (product owner, 29 Oct 2026).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'current_time': {'name': 'current_time', 'required': True},
                        'feature_id': {'name': 'feature_id', 'required': True},
                        'kind': {'equals_string': 'tma_menu', 'name': 'kind'}}})

    feature_id: str = Field(default=..., description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    current_time: str = Field(default=..., description="""Current time from shared state, which a tool form offers for its time fields.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowFormMessage',
                       'ShowAnnotationFormMessage',
                       'TmaSplitMessage',
                       'TmaTimeAskedMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'EditTrackParams']} })
    kind: Literal["tma_menu"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_menu'} })

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


class TmaResolveMessage(WebviewMessageBase):
    """
    Bearing view to host: keep the sides of the cuts boxed in the Bearing pane with Select bearings on (resolution: keep bearing, cut_ids and other_cut_ids), as one recorded step, as debrief/resolve_ambiguity does (product owner, 28 Oct 2026).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'tma_resolve', 'name': 'kind'},
                        'resolution': {'name': 'resolution', 'required': True}}})

    resolution: AmbiguityResolution = Field(default=..., description="""The sides of the cuts boxed in the Bearings plot to keep (tma_resolve).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResolveMessage']} })
    kind: Literal["tma_resolve"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_resolve'} })


class TmaCutOffMessage(WebviewMessageBase):
    """
    Bearing view to host: the analyst set their error cut-off (error_cut_off, degrees): remember it in their Debrief configuration (product owner, 25 Oct 2026).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'error_cut_off': {'name': 'error_cut_off', 'required': True},
                        'kind': {'equals_string': 'tma_cut_off', 'name': 'kind'}}})

    error_cut_off: float = Field(default=..., description="""The analyst's error cut-off, degrees (tma_cut_off).""", ge=0.01, le=180, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'TmaCutOffMessage']} })
    kind: Literal["tma_cut_off"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_cut_off'} })


class TmaPlotDrawnMessage(WebviewMessageBase):
    """
    Bearing view to host: the plot as last drawn, CSS pixels (plot_height; pane_widths, left to right), so the host knows whether it is big enough to read; the integration suite asserts it in VS Code's panel (product owner, 25 Oct 2026).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'tma_plot_drawn', 'name': 'kind'},
                        'pane_widths': {'name': 'pane_widths', 'required': True},
                        'plot_height': {'name': 'plot_height', 'required': True}}})

    plot_height: int = Field(default=..., description="""The height of the Bearings view's plot, its panes' time axis, CSS pixels (tma_plot_drawn).""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaPlotDrawnMessage']} })
    pane_widths: list[int] = Field(default=..., description="""The width of each pane the Bearings view's plot shows, left to right, CSS pixels (tma_plot_drawn).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaPlotDrawnMessage']} })
    kind: Literal["tma_plot_drawn"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_plot_drawn'} })


class TmaPanesMessage(WebviewMessageBase):
    """
    Bearing view to host: which of the plot's panes show (panes_shown: bearing, error, course), when the page starts and when the analyst toggles one, so the same panes show wherever Bearings is next opened: in the panel or popped out into an editor tab or window of its own (product owner, 28 Oct 2026).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'tma_panes', 'name': 'kind'},
                        'panes_shown': {'name': 'panes_shown', 'required': True}}})

    panes_shown: list[str] = Field(default=..., description="""The panes the Bearings view's plot shows, of bearing, error and course (tma_panes).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaPanesMessage']} })
    kind: Literal["tma_panes"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_panes'} })


class TmaMadeMessage(WebviewMessageBase):
    """
    Host to bearing view: the solution asked for was made (feature_id), so the first guess's form closes; or, with message alone, why it was not, the form left open.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'kind': {'equals_string': 'tma_made', 'name': 'kind'}}})

    feature_id: Optional[str] = Field(default=None, description="""The narrative entry the Timeline chose, changes or deletes, the annotation a form changes or deletes, the annotation or track the map asks to change, or the track whose fixes it rings or the analyst chose.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'DeleteAnnotationMessage',
                       'EditAnnotationMessage',
                       'EditTrackMessage',
                       'ShowFixesMessage',
                       'TimelineChosenMessage',
                       'SaveNarrativeMessage',
                       'DeleteNarrativeMessage',
                       'OpenNarrativeFormMessage',
                       'NarrativeSavedMessage',
                       'FixChosenMessage',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'ResolveAskedMessage',
                       'CutChosenMessage',
                       'TmaChosenMessage',
                       'TmaPreviewMessage',
                       'TmaExcludeMessage',
                       'TmaSplitMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'TmaMadeMessage']} })
    message: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FormBusyMessage',
                       'FormErrorMessage',
                       'ShowFixesMessage',
                       'NarrativeSavedMessage',
                       'ShowCoverageMessage',
                       'ImageRenderedMessage',
                       'TmaMadeMessage',
                       'TakeNewDataReply']} })
    kind: Literal["tma_made"] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest'],
         'equals_string': 'tma_made'} })


class PlotHistory(ConfiguredBaseModel):
    """
    A plot's whole history, kept in its plot file as the top-level member history (decision 13 Oct). Steps are numbered from 1 with no gaps, in the order they were made.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    current: int = Field(default=..., description="""The step the plot's content reflects; 0 for none (an empty plot). Never an abandoned step.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState',
                       'FigureSource',
                       'PlotHistory',
                       'HistoryHead',
                       'PlotBase',
                       'NarrativeReply',
                       'OpenRevisionReply']} })
    head_hash: str = Field(default=..., description="""The last step's step_hash, or the starting value for a history with no steps, so a step removed from the end is noticed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotHistory']} })
    steps: list[HistoryStep] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotHistory', 'AddPlotFileReply', 'HistoryReply']} })

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

    seq: int = Field(default=..., description="""Position in the plot's history, from 1, with no gaps.""", ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta', 'ListedStep']} })
    state: StepStateEnum = Field(default=..., description="""Applied, undone or abandoned: what the after links and the history's current step say. Not part of step_hash, since undo changes it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep']} })
    after: int = Field(default=..., description="""The step this one was applied on top of (0 for the first). Replay follows these links back from a step to the first.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta', 'ListedStep']} })
    records: list[ProvRecord] = Field(default=..., description="""The operation that made the change. Usually one; a baseline step, taken when a plot made outside Debrief is first opened, carries all the plot's earlier records.""", min_length=1, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta', 'ListedStep']} })
    added: Optional[list[Union[AnnotationFeature, NarrativeFeature, PlotFeature, SensorCutFeature, SensorFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, description="""Features added. A whole-plot feature here never carries its view: the island is not content (SUB-22).""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'SensorFeature'},
                    {'range': 'SensorCutFeature'},
                    {'range': 'NarrativeFeature'},
                    {'range': 'PlotFeature'}],
         'domain_of': ['HistoryStep', 'Delta']} })
    modified: Optional[list[Union[AnnotationFeature, NarrativeFeature, PlotFeature, SensorCutFeature, SensorFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, description="""Features changed, in full, replacing those with the same id.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'SensorFeature'},
                    {'range': 'SensorCutFeature'},
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
    seq: int = Field(default=..., description="""Position in the plot's history, from 1, with no gaps.""", ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta', 'ListedStep']} })
    after: int = Field(default=..., description="""The delta this one was applied on top of (0 for the first).""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta', 'ListedStep']} })
    records: list[ProvRecord] = Field(default=..., description="""The operation that made the change.""", min_length=1, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta', 'ListedStep']} })
    added: Optional[list[Union[AnnotationFeature, NarrativeFeature, PlotFeature, SensorCutFeature, SensorFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, description="""Features added, never with the whole-plot feature's view.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'SensorFeature'},
                    {'range': 'SensorCutFeature'},
                    {'range': 'NarrativeFeature'},
                    {'range': 'PlotFeature'}],
         'domain_of': ['HistoryStep', 'Delta']} })
    modified: Optional[list[Union[AnnotationFeature, NarrativeFeature, PlotFeature, SensorCutFeature, SensorFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, description="""Features changed, in full, replacing those with the same id.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'SensorFeature'},
                    {'range': 'SensorCutFeature'},
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
    current: int = Field(default=..., description="""Sequence number of the last delta the plot reflects; 0 for none.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState',
                       'FigureSource',
                       'PlotHistory',
                       'HistoryHead',
                       'PlotBase',
                       'NarrativeReply',
                       'OpenRevisionReply']} })
    latest: int = Field(default=..., description="""Highest sequence number written.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })
    abandoned: Optional[list[int]] = Field(default=None, description="""Deltas undone and then superseded by a new change.""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryHead']} })
    plot_hash: str = Field(default=..., description="""Content hash the plot file has when it reflects current, island left out.""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryHead', 'PlotBase']} })

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


class NoParams(ConfiguredBaseModel):
    """
    The parameters of a method that takes none.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    pass


class EmptyReply(ConfiguredBaseModel):
    """
    A method's reply that says nothing more than that it was done: {}.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    pass


class NameMap(ConfiguredBaseModel):
    """
    A name mapped to an id, or to null for none: a platform's track, a track name's host track, a track's plotting mode.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'extra_slots': {'range_expression': {'range': 'string'}},
         'from_schema': 'https://debrief.info/schemas/debrief'})

    pass


class PlotBase(ConfiguredBaseModel):
    """
    Where a plot's history stands: passed back with the next change, so a change made meanwhile elsewhere is never overwritten (SUB-28).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    current: int = Field(default=..., description="""The current step.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState',
                       'FigureSource',
                       'PlotHistory',
                       'HistoryHead',
                       'PlotBase',
                       'NarrativeReply',
                       'OpenRevisionReply']} })
    plot_hash: str = Field(default=..., description="""The content hash of the plot at that step.""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryHead', 'PlotBase']} })

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


class PlotParams(ConfiguredBaseModel):
    """
    A method on one plot, inside its history (SUB-21).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'abstract': True, 'from_schema': 'https://debrief.info/schemas/debrief'})

    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: Optional[AgentRef] = Field(default=None, description="""Who is asking; a method that changes the plot records it (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class PlotChangeParams(PlotParams):
    """
    A method that changes one plot, recorded with who made it (SUB-24).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'abstract': True,
         'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'agent': {'description': 'Who made the change, recorded in '
                                                 'provenance (SUB-24).',
                                  'name': 'agent',
                                  'required': True}}})

    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class PlotReply(ConfiguredBaseModel):
    """
    What every method on one plot answers, besides its own members.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'abstract': True, 'from_schema': 'https://debrief.info/schemas/debrief'})

    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class PlotChangeReply(PlotReply):
    """
    A change to one plot: whether it changed, the feature it made or changed, and what the step's record says beyond its name.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    changed: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply']} })
    feature: Optional[str] = Field(default=None, description="""The feature made or changed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    features: Optional[list[str]] = Field(default=None, description="""The features made (the parts of a split track).""", json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    notes: Optional[list[str]] = Field(default=None, description="""What the step's record says beyond its name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class IslandReply(PlotReply):
    """
    The plot's view (its island, SUB-22) and its hash, which a change to the view is checked against.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    view: Optional[PlotView] = Field(default=None, description="""The view; null if the plot has none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'IslandReply',
                       'IslandChangeReply',
                       'SetViewParams']} })
    view_hash: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['IslandReply', 'IslandChangeReply']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class IslandChangeReply(PlotChangeReply):
    """
    A change to the plot's island, never a step, and the view as it now is.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    view: Optional[PlotView] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'IslandReply',
                       'IslandChangeReply',
                       'SetViewParams']} })
    view_hash: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['IslandReply', 'IslandChangeReply']} })
    changed: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply']} })
    feature: Optional[str] = Field(default=None, description="""The feature made or changed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    features: Optional[list[str]] = Field(default=None, description="""The features made (the parts of a split track).""", json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    notes: Optional[list[str]] = Field(default=None, description="""What the step's record says beyond its name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class ToolsForSelectionParams(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kinds: list[str] = Field(default=..., description="""The selection's feature kinds.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolsForSelectionParams']} })


class ToolsForSelectionReply(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    tools: list[str] = Field(default=..., description="""The tools on offer, by name, in the order declared (TL-08).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolsForSelectionReply']} })


class StoreListed(ConfiguredBaseModel):
    """
    A store in the analyst's configuration.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    read_only: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['KnownStore', 'TmaView', 'StoreListed', 'OpenParams']} })


class StoresReply(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    stores: list[StoreListed] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['UserConfig', 'StoresReply']} })


class CreateCatalogueParams(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    location: str = Field(default=..., description="""An empty folder, or one holding a catalogue.""", json_schema_extra = { "linkml_meta": {'domain_of': ['KnownStore', 'CreateCatalogueParams']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })


class CreateCatalogueReply(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    store: str = Field(default=..., description="""The new store's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })


class NarrativeChoices(ConfiguredBaseModel):
    """
    The analyst's choices before a narrative is read, as legacy Debrief asked them (debrief_io.Choices).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief', 'mixin': True})

    types: Optional[list[str]] = Field(default=None, description="""The entry types to read; \"\" for entries with none. Left out: all.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeChoices',
                       'NarrativePreview',
                       'NarrativeParams',
                       'NarrativeReply']} })
    within_period: Optional[bool] = Field(default=None, description="""Only entries within the plot's tracks' period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers', 'NewDataMark', 'NarrativeChoices']} })
    tracks: Optional[NameMap] = Field(default=None, description="""A platform's track: its id, or null for none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers',
                       'CoverageItem',
                       'NarrativeChoices',
                       'ImportReply',
                       'RepTracksReply',
                       'SensorPreview']} })
    platform: Optional[str] = Field(default=None, description="""The source of entries whose document names none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlatformTrack', 'NarrativeChoices', 'NarrativePreview']} })
    duplicates: Optional[DuplicatesEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeChoices']} })


class ImportParams(NarrativeChoices):
    """
    A REP file, a legacy plot file or a Word or PDF document imported as a new plot.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'mixins': ['NarrativeChoices']})

    store: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    path: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImportParams',
                       'AddPlotFileParams',
                       'RepTracksParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ImportNarrativeParams',
                       'ImportSensorParams']} })
    agent: AgentRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })
    allow_newer_schema: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    modes: Optional[Union[NameMap, str]] = Field(default=None, description="""How a REP file's tracks are plotted, otg or dr, one for all or by track name.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'string'}, {'range': 'NameMap'}],
         'domain_of': ['ImportParams']} })
    remembered: Optional[str] = Field(default=None, description="""The words saying how to change a remembered choice.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ImportParams']} })
    track_name: Optional[str] = Field(default=None, description="""An ASW document's track.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ImportParams']} })
    types: Optional[list[str]] = Field(default=None, description="""The entry types to read; \"\" for entries with none. Left out: all.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeChoices',
                       'NarrativePreview',
                       'NarrativeParams',
                       'NarrativeReply']} })
    within_period: Optional[bool] = Field(default=None, description="""Only entries within the plot's tracks' period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers', 'NewDataMark', 'NarrativeChoices']} })
    tracks: Optional[NameMap] = Field(default=None, description="""A platform's track: its id, or null for none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers',
                       'CoverageItem',
                       'NarrativeChoices',
                       'ImportReply',
                       'RepTracksReply',
                       'SensorPreview']} })
    platform: Optional[str] = Field(default=None, description="""The source of entries whose document names none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlatformTrack', 'NarrativeChoices', 'NarrativePreview']} })
    duplicates: Optional[DuplicatesEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeChoices']} })


class ImportReply(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    tracks: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers',
                       'CoverageItem',
                       'NarrativeChoices',
                       'ImportReply',
                       'RepTracksReply',
                       'SensorPreview']} })
    fixes: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackCoverage',
                       'CoverageSource',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview']} })
    annotations: Optional[int] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImportReply']} })
    narrative_entries: Optional[int] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImportReply']} })
    omitted: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'NarrativeImportReply',
                       'SensorImportReply']} })
    notes: Optional[list[str]] = Field(default=None, description="""How each track is plotted, and how to change a remembered choice.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })


class AddPlotFileParams(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    store: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    path: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImportParams',
                       'AddPlotFileParams',
                       'RepTracksParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ImportNarrativeParams',
                       'ImportSensorParams']} })
    agent: AgentRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })
    allow_newer_schema: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })


class AddPlotFileReply(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    steps: int = Field(default=..., description="""How many steps came with it, the step recording its arrival included.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotHistory', 'AddPlotFileReply', 'HistoryReply']} })


class RepTracksParams(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    path: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImportParams',
                       'AddPlotFileParams',
                       'RepTracksParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ImportNarrativeParams',
                       'ImportSensorParams']} })


class RepTracksReply(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    tracks: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers',
                       'CoverageItem',
                       'NarrativeChoices',
                       'ImportReply',
                       'RepTracksReply',
                       'SensorPreview']} })


class PreviewNarrativeParams(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    path: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImportParams',
                       'AddPlotFileParams',
                       'RepTracksParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ImportNarrativeParams',
                       'ImportSensorParams']} })
    agent: Optional[AgentRef] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })
    store: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: Optional[str] = Field(default=None, description="""Given, its period and tracks are taken into account.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })


class EarlierRead(ConfiguredBaseModel):
    """
    A step in the plot now that read a file with the same content, under any name.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    step: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'FigureSource',
                       'EarlierRead',
                       'GotoParams',
                       'TakeNewDataReply',
                       'OpenRevisionReply']} })
    at: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision',
                       'ImageExport',
                       'EarlierRead',
                       'ListedStep',
                       'NarrativeParams',
                       'TmaSplitLegParams',
                       'SplitTrackParams']} })
    by: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision', 'ImageExport', 'EarlierRead']} })
    how: str = Field(default=..., description="""The step's name, as the History view has it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['EarlierRead']} })
    name: str = Field(default=..., description="""The file's name then.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })

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


class PreviewCount(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    count: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PreviewCount', 'PreviewSource']} })


class PreviewSource(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    count: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PreviewCount', 'PreviewSource']} })
    track_id: Optional[str] = Field(default=None, description="""The track it would belong to; null for none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'PreviewSource',
                       'NarrativeRow']} })


class NarrativePreview(ConfiguredBaseModel):
    """
    What a narrative file holds, before it is read (CAP-19).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    format: str = Field(default=..., description="""rep, docx, doc or pdf.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef',
                       'ImageExport',
                       'ImageRequest',
                       'RenderedImage',
                       'NarrativePreview',
                       'ExportImageParams',
                       'HostRequest']} })
    dialect: Optional[str] = Field(default=None, description="""A document's dialect; null for REP.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers', 'NarrativePreview']} })
    described: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativePreview']} })
    entries: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativePreview',
                       'NarrativeImportReply',
                       'NarrativeTally',
                       'NarrativeReply']} })
    fixes: int = Field(default=..., description="""ASW data: positions of a track, not narrative.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackCoverage',
                       'CoverageSource',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview']} })
    types: list[PreviewCount] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeChoices',
                       'NarrativePreview',
                       'NarrativeParams',
                       'NarrativeReply']} })
    sources: list[PreviewSource] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['CoveragePlatform',
                       'CoveragePeriod',
                       'NarrativePreview',
                       'NarrativeImportReply',
                       'NarrativeParams',
                       'NarrativeReply',
                       'TracedImage']} })
    unnamed: int = Field(default=..., description="""Entries whose document names no platform.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativePreview']} })
    platform: Optional[str] = Field(default=None, description="""The source those entries will have.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlatformTrack', 'NarrativeChoices', 'NarrativePreview']} })
    start: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    end: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    plot_start: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativePreview']} })
    plot_end: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativePreview']} })
    outside: int = Field(default=..., description="""Entries outside the plot's tracks' period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativePreview']} })
    omitted: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'NarrativeImportReply',
                       'SensorImportReply']} })
    notes: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })
    content_hash: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef', 'NarrativePreview', 'SensorPreview']} })
    earlier: Optional[list[EarlierRead]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativePreview', 'SensorPreview']} })
    already: Optional[int] = Field(default=None, description="""Entries the plot has already: the same time, source and text.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativePreview']} })

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

    @field_validator('plot_start')
    def pattern_plot_start(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid plot_start format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid plot_start format: {v}"
            raise ValueError(err_msg)
        return v

    @field_validator('plot_end')
    def pattern_plot_end(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid plot_end format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid plot_end format: {v}"
            raise ValueError(err_msg)
        return v

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


class PreviewSensorParams(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    path: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImportParams',
                       'AddPlotFileParams',
                       'RepTracksParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ImportNarrativeParams',
                       'ImportSensorParams']} })
    agent: Optional[AgentRef] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })
    store: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })


class SensorInFile(ConfiguredBaseModel):
    """
    A sensor a file's lines hold, by track and name.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    track: str = Field(default=..., description="""The track name the lines give.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SourceTrackRef',
                       'TrackSupply',
                       'TrackCoverage',
                       'ToteRow',
                       'PlatformTrack',
                       'CoveragePlatform',
                       'CoverageSource',
                       'TimelineEntry',
                       'SensorInFile']} })
    sensor: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaCut', 'SensorInFile']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    cuts: int = Field(default=..., description="""Its cuts with a bearing.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaView',
                       'SensorInFile',
                       'SensorPreview',
                       'SensorsParams',
                       'SensorRow',
                       'SensorImportReply']} })
    ambiguous: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow', 'SensorInFile', 'SensorRow']} })
    lines: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorInFile']} })
    start: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    end: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    host_track_id: Optional[str] = Field(default=None, description="""The plot's track that would carry it; null: ask.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SensorProperties',
                       'SensorObservationsProperties',
                       'SensorInFile',
                       'SensorRow']} })
    host: Optional[str] = Field(default=None, description="""That track's name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow', 'SensorInFile', 'SensorRow']} })
    matched_by: Optional[MatchedByEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorInFile']} })

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


class TrackListed(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })


class SensorPreview(ConfiguredBaseModel):
    """
    What a .dsf or REP file's sensor lines hold, before they are read (CAP-22).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    sensors: list[SensorInFile] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'SensorPreview', 'SensorsReply', 'SensorImportReply']} })
    cuts: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaView',
                       'SensorInFile',
                       'SensorPreview',
                       'SensorsParams',
                       'SensorRow',
                       'SensorImportReply']} })
    fixes: int = Field(default=..., description="""Position lines: the file holds a track too.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackCoverage',
                       'CoverageSource',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview']} })
    tracks: list[TrackListed] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers',
                       'CoverageItem',
                       'NarrativeChoices',
                       'ImportReply',
                       'RepTracksReply',
                       'SensorPreview']} })
    omitted: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'NarrativeImportReply',
                       'SensorImportReply']} })
    notes: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })
    content_hash: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SourceRef', 'PayloadRef', 'NarrativePreview', 'SensorPreview']} })
    earlier: list[EarlierRead] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativePreview', 'SensorPreview']} })

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


class ToteParams(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    store: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    time: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    tote: Optional[ToteView] = Field(default=None, description="""Which tracks; left out, the plot's island says.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ImageExport',
                       'ShowToteMessage',
                       'ToteParams',
                       'ExportImageParams']} })
    revision: Optional[str] = Field(default=None, description="""An earlier revision shown read-only.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })

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


class MeasureGroupsReply(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    groups: list[MeasureGroup] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['MeasureGroupsReply']} })
    measures: list[MeasureDefinition] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['MeasureGroup', 'ToteResult', 'MeasureGroupsReply']} })


class ReviewFlagListed(ReviewFlag):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    store: Optional[str] = Field(default=None, description="""The store it is in; null if none in the configuration holds it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    catalogue: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'ItemAsked']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
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
                       'FigureSource',
                       'TmaView',
                       'StoreListed',
                       'CreateCatalogueParams',
                       'AddPlotFileReply']} })
    revised: list[ItemRef] = Field(default=..., description="""Each item revised since the product took data from it, at its revision now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['CoverageSource', 'CoverageItem', 'ReviewFlag']} })
    note: str = Field(default=..., description="""What the flag says, for its tooltip and screen readers.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag',
                       'StampedImage',
                       'ExportedImage']} })


class ReviewFlagsReply(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    flags: list[ReviewFlagListed] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ReviewFlagsReply']} })


class OpenParams(PlotParams):
    """
    Given agent, a retired presentation.json is made a recorded step.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    read_only: Optional[bool] = Field(default=None, description="""Shown read-only: an interrupted change is not recovered.""", json_schema_extra = { "linkml_meta": {'domain_of': ['KnownStore', 'TmaView', 'StoreListed', 'OpenParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: Optional[AgentRef] = Field(default=None, description="""Who is asking; a method that changes the plot records it (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class OpenReply(IslandReply):
    """
    The plot made whole, its base and its view.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'recovered': {'any_of': [{'multivalued': True,
                                                  'range': 'string'},
                                                 {'range': 'boolean'}],
                                      'description': 'What opening repaired, for the '
                                                     'analyst; false, not a list, when '
                                                     'it was opened read-only and '
                                                     'nothing was recovered (as sent '
                                                     'since 16 Oct 2026).',
                                      'multivalued': False,
                                      'name': 'recovered'}}})

    migrated: Optional[bool] = Field(default=None, description="""A retired presentation.json was made one recorded step.""", json_schema_extra = { "linkml_meta": {'domain_of': ['OpenReply']} })
    plot: Optional[DebriefFeatureCollection] = Field(default=None, description="""The plot with a retired presentation.json applied in memory, where it could not be migrated.""", json_schema_extra = { "linkml_meta": {'domain_of': ['Selection',
                       'ShowPlotMessage',
                       'OpenReply',
                       'OpenRevisionReply']} })
    view: Optional[PlotView] = Field(default=None, description="""The view; null if the plot has none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'IslandReply',
                       'IslandChangeReply',
                       'SetViewParams']} })
    view_hash: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['IslandReply', 'IslandChangeReply']} })
    recovered: Union[bool, str] = Field(default=..., description="""What opening repaired, for the analyst; false, not a list, when it was opened read-only and nothing was recovered (as sent since 16 Oct 2026).""", json_schema_extra = { "linkml_meta": {'any_of': [{'multivalued': True, 'range': 'string'}, {'range': 'boolean'}],
         'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class HistoryParams(PlotParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: Optional[AgentRef] = Field(default=None, description="""Who is asking; a method that changes the plot records it (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class ListedStep(ConfiguredBaseModel):
    """
    A step as the History panel lists it (SUB-21).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    seq: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta', 'ListedStep']} })
    status: StepStateEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow', 'ListedStep']} })
    kind: ProvActivityKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
    tool: Optional[str] = Field(default=None, description="""The tool that made it; null for an edit made without one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'ShowFormMessage',
                       'ShowResultsMessage',
                       'ListedStep']} })
    agent: str = Field(default=..., description="""Who made it: each of its records' agents, once.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })
    at: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision',
                       'ImageExport',
                       'EarlierRead',
                       'ListedStep',
                       'NarrativeParams',
                       'TmaSplitLegParams',
                       'SplitTrackParams']} })
    records: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta', 'ListedStep']} })
    notes: list[str] = Field(default=..., description="""The first record's notes: they name an edit made without a tool.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })
    after: Optional[int] = Field(default=None, description="""The step it was made after: what undoing it goes back to.""", json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryStep', 'Delta', 'ListedStep']} })
    records_only: bool = Field(default=..., description="""It changes only the plot's records, so undo takes it with the step before.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ListedStep']} })

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


class HistoryReply(PlotReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    steps: list[ListedStep] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotHistory', 'AddPlotFileReply', 'HistoryReply']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class MoveParams(PlotParams):
    """
    Undo or redo.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    allow_newer_schema: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: Optional[AgentRef] = Field(default=None, description="""Who is asking; a method that changes the plot records it (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class GotoParams(MoveParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    step: int = Field(default=..., ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'FigureSource',
                       'EarlierRead',
                       'GotoParams',
                       'TakeNewDataReply',
                       'OpenRevisionReply']} })
    allow_newer_schema: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: Optional[AgentRef] = Field(default=None, description="""Who is asking; a method that changes the plot records it (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class SetColourParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    features: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    colour: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    colour_name: Optional[str] = Field(default=None, description="""The colour's name, for the step's name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SetColourParams', 'MarkFixParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class SetHiddenParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    features: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    hidden: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'TmaCut',
                       'TmaResiduals',
                       'TimelineEntry',
                       'SetHiddenParams',
                       'SensorCutRow',
                       'SensorRow']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class SetTrackFrequenciesParams(PlotChangeParams):
    """
    Each interval given is a duration, \"off\", or null for Debrief's default (CAP-32).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    features: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    label_interval: Optional[Union[Duration, float, str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'Duration'}, {'range': 'float'}, {'range': 'string'}],
         'domain_of': ['TrackProperties', 'SetTrackFrequenciesParams']} })
    symbol_interval: Optional[Union[Duration, float, str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'Duration'}, {'range': 'float'}, {'range': 'string'}],
         'domain_of': ['TrackProperties', 'SetTrackFrequenciesParams']} })
    arrow_interval: Optional[Union[Duration, float, str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'Duration'}, {'range': 'float'}, {'range': 'string'}],
         'domain_of': ['TrackProperties', 'SetTrackFrequenciesParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class SetViewParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    view: Optional[PlotView] = Field(default=None, description="""The view; null to clear it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'IslandReply',
                       'IslandChangeReply',
                       'SetViewParams']} })
    hash: str = Field(default=..., description="""The view's hash as last read.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SetViewParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class AddAnnotationParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    annotation: AnnotationAsked = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'EditAnnotationMessage',
                       'AnnotationDrawnMessage',
                       'AddAnnotationParams',
                       'EditAnnotationParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class AnnotationAsked(ConfiguredBaseModel):
    """
    An annotation as a request gives it: an AnnotationSpec, or, to change one, only the members that change; its positions numbers, or text in any notation the analyst types. Left open here: the catalogue reads it and says what is wrong in its own words.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'extra_slots': {'allowed': True},
         'from_schema': 'https://debrief.info/schemas/debrief'})

    pass


class EditAnnotationParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    annotation: AnnotationAsked = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ShowAnnotationFormMessage',
                       'SaveAnnotationMessage',
                       'EditAnnotationMessage',
                       'AnnotationDrawnMessage',
                       'AddAnnotationParams',
                       'EditAnnotationParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class DeleteFeaturesParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    features: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class SetNorthArrowParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    shown: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SetNorthArrowParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class AddNarrativeParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    entry: NarrativeSpec = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['AddNarrativeParams', 'EditNarrativeParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class EditNarrativeParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    entry: NarrativeSpec = Field(default=..., description="""The members to change; null clears one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AddNarrativeParams', 'EditNarrativeParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class ImportNarrativeParams(NarrativeChoices, PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'mixins': ['NarrativeChoices']})

    path: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImportParams',
                       'AddPlotFileParams',
                       'RepTracksParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ImportNarrativeParams',
                       'ImportSensorParams']} })
    types: Optional[list[str]] = Field(default=None, description="""The entry types to read; \"\" for entries with none. Left out: all.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeChoices',
                       'NarrativePreview',
                       'NarrativeParams',
                       'NarrativeReply']} })
    within_period: Optional[bool] = Field(default=None, description="""Only entries within the plot's tracks' period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers', 'NewDataMark', 'NarrativeChoices']} })
    tracks: Optional[NameMap] = Field(default=None, description="""A platform's track: its id, or null for none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeImportAnswers',
                       'CoverageItem',
                       'NarrativeChoices',
                       'ImportReply',
                       'RepTracksReply',
                       'SensorPreview']} })
    platform: Optional[str] = Field(default=None, description="""The source of entries whose document names none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlatformTrack', 'NarrativeChoices', 'NarrativePreview']} })
    duplicates: Optional[DuplicatesEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeChoices']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class NarrativeImportReply(PlotChangeReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    entries: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativePreview',
                       'NarrativeImportReply',
                       'NarrativeTally',
                       'NarrativeReply']} })
    sources: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['CoveragePlatform',
                       'CoveragePeriod',
                       'NarrativePreview',
                       'NarrativeImportReply',
                       'NarrativeParams',
                       'NarrativeReply',
                       'TracedImage']} })
    omitted: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'NarrativeImportReply',
                       'SensorImportReply']} })
    changed: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply']} })
    feature: Optional[str] = Field(default=None, description="""The feature made or changed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    features: Optional[list[str]] = Field(default=None, description="""The features made (the parts of a split track).""", json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    notes: Optional[list[str]] = Field(default=None, description="""What the step's record says beyond its name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class NarrativeParams(PlotParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    text: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'NarrativeParams',
                       'NarrativeRow']} })
    offset: Optional[int] = Field(default=None, ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeParams', 'NarrativeReply', 'SetArrayOffsetParams']} })
    limit: Optional[int] = Field(default=None, ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeParams']} })
    sources: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['CoveragePlatform',
                       'CoveragePeriod',
                       'NarrativePreview',
                       'NarrativeImportReply',
                       'NarrativeParams',
                       'NarrativeReply',
                       'TracedImage']} })
    types: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeChoices',
                       'NarrativePreview',
                       'NarrativeParams',
                       'NarrativeReply']} })
    start: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    end: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    at: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision',
                       'ImageExport',
                       'EarlierRead',
                       'ListedStep',
                       'NarrativeParams',
                       'TmaSplitLegParams',
                       'SplitTrackParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: Optional[AgentRef] = Field(default=None, description="""Who is asking; a method that changes the plot records it (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })

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


class NarrativeRow(ConfiguredBaseModel):
    """
    An entry as debrief/narrative lists it.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    time: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    source: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'NarrativeRow',
                       'TakeNewDataParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams',
                       'DismissNewDataParams']} })
    entry_type: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'NarrativeRow']} })
    text: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'NarrativeParams',
                       'NarrativeRow']} })
    track_id: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'PreviewSource',
                       'NarrativeRow']} })

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


class NarrativeTally(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    entries: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativePreview',
                       'NarrativeImportReply',
                       'NarrativeTally',
                       'NarrativeReply']} })


class NarrativeReply(PlotReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    entries: list[NarrativeRow] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativePreview',
                       'NarrativeImportReply',
                       'NarrativeTally',
                       'NarrativeReply']} })
    total: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeReply']} })
    offset: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeParams', 'NarrativeReply', 'SetArrayOffsetParams']} })
    sources: list[NarrativeTally] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['CoveragePlatform',
                       'CoveragePeriod',
                       'NarrativePreview',
                       'NarrativeImportReply',
                       'NarrativeParams',
                       'NarrativeReply',
                       'TracedImage']} })
    types: list[NarrativeTally] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeChoices',
                       'NarrativePreview',
                       'NarrativeParams',
                       'NarrativeReply']} })
    current: Optional[str] = Field(default=None, description="""The entry current time is at, among those matching; null if none.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState',
                       'FigureSource',
                       'PlotHistory',
                       'HistoryHead',
                       'PlotBase',
                       'NarrativeReply',
                       'OpenRevisionReply']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class SensorsParams(PlotParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    sensor_ids: Optional[list[str]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'SensorsParams',
                       'SetArrayOffsetParams']} })
    cuts: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaView',
                       'SensorInFile',
                       'SensorPreview',
                       'SensorsParams',
                       'SensorRow',
                       'SensorImportReply']} })
    period: Optional[TimeRange] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: Optional[AgentRef] = Field(default=None, description="""Who is asking; a method that changes the plot records it (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class SensorCutRow(ConfiguredBaseModel):
    """
    A cut as debrief/sensors lists it.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    time: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    bearing: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackEdit', 'SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    origin: Optional[list[float]] = Field(default=None, description="""[longitude, latitude] it is drawn from; null outside its host's span.""", min_length=2, max_length=2, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    origin_derived: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    ambiguous_bearing: Optional[float] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow']} })
    resolved: Optional[SensorCutKeptEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow', 'SensorRow']} })
    side: Optional[SideEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaCut', 'SensorCutRow', 'TmaSplitLegParams']} })
    range_m: Optional[float] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutRow']} })
    label: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'SensorCutProperties',
                       'MeasureDefinition',
                       'TmaCut',
                       'SensorCutRow',
                       'FixMarkChanges']} })
    comment: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'SensorCutProperties',
                       'SensorCutRow',
                       'FixMarkChanges']} })
    hidden: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'TmaCut',
                       'TmaResiduals',
                       'TimelineEntry',
                       'SetHiddenParams',
                       'SensorCutRow',
                       'SensorRow']} })

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


class SensorRow(ConfiguredBaseModel):
    """
    A sensor as debrief/sensors lists it.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    host_track_id: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorProperties',
                       'SensorObservationsProperties',
                       'SensorInFile',
                       'SensorRow']} })
    host: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow', 'SensorInFile', 'SensorRow']} })
    colour: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    hidden: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'TmaCut',
                       'TmaResiduals',
                       'TimelineEntry',
                       'SetHiddenParams',
                       'SensorCutRow',
                       'SensorRow']} })
    array_offset_m: Optional[float] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorRow']} })
    array_mode: Optional[ArrayModeEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorProperties', 'SensorRow']} })
    cuts: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaView',
                       'SensorInFile',
                       'SensorPreview',
                       'SensorsParams',
                       'SensorRow',
                       'SensorImportReply']} })
    ambiguous: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow', 'SensorInFile', 'SensorRow']} })
    resolved: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorCutProperties', 'TmaCut', 'SensorCutRow', 'SensorRow']} })
    start: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    end: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeRange',
                       'TrackSupply',
                       'CoverageReport',
                       'CoveragePeriod',
                       'CoverageItem',
                       'TimelineEntry',
                       'NarrativePreview',
                       'SensorInFile',
                       'NarrativeParams',
                       'SensorRow']} })
    cut_list: Optional[list[SensorCutRow]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorRow']} })

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


class SensorsReply(PlotReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    sensors: list[SensorRow] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'SensorPreview', 'SensorsReply', 'SensorImportReply']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class ResolveAmbiguityParams(PlotChangeParams, AmbiguityResolution):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'mixins': ['AmbiguityResolution']})

    keep: AmbiguityKeepEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['AmbiguityResolution', 'ResolveAskedMessage']} })
    cut_ids: Optional[list[str]] = Field(default=None, description="""The cuts to resolve, by feature id. Or give sensor_ids, and perhaps a period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'TmaFocus',
                       'TmaExcludeMessage',
                       'CutsParams',
                       'TmaExcludeCutParams']} })
    sensor_ids: Optional[list[str]] = Field(default=None, description="""Sensors whose cuts in the period are resolved; every cut of each, without a period.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'SensorsParams',
                       'SetArrayOffsetParams']} })
    period: Optional[TimeRange] = Field(default=None, description="""The cuts whose times fall in it, ends included, of the sensors named.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    other_cut_ids: Optional[list[str]] = Field(default=None, description="""With keep bearing or ambiguous_bearing: cuts kept on their other bearing in the same step, so one step keeps some cuts' first bearings and others' twins, as a box drawn over the Bearings plot with Select bearings on asks (product owner, 28 Oct 2026). A cut named here and in cut_ids was boxed on both sides: it is left as it is, and the step says so. Hidden cuts are left as they are.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AmbiguityResolution']} })
    clear_cut_ids: Optional[list[str]] = Field(default=None, description="""With keep bearing or ambiguous_bearing: resolved cuts made ambiguous again in the same step, as a box drawn over their kept bearings with Select bearings on asks (product owner, 28 Oct 2026); one not resolved is left. Given (even empty), with other_cut_ids, the step is named for a box: \"Kept 12 Towed array cuts to starboard and made 15 ambiguous again\". Hidden cuts are left as they are.""", json_schema_extra = { "linkml_meta": {'domain_of': ['AmbiguityResolution']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class ImportSensorParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    path: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImportParams',
                       'AddPlotFileParams',
                       'RepTracksParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ImportNarrativeParams',
                       'ImportSensorParams']} })
    hosts: Optional[NameMap] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImportSensorParams']} })
    again: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImportSensorParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class SensorImportReply(PlotChangeReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    sensors: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'SensorPreview', 'SensorsReply', 'SensorImportReply']} })
    cuts: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaView',
                       'SensorInFile',
                       'SensorPreview',
                       'SensorsParams',
                       'SensorRow',
                       'SensorImportReply']} })
    omitted: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'NarrativeImportReply',
                       'SensorImportReply']} })
    changed: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply']} })
    feature: Optional[str] = Field(default=None, description="""The feature made or changed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    features: Optional[list[str]] = Field(default=None, description="""The features made (the parts of a split track).""", json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    notes: Optional[list[str]] = Field(default=None, description="""What the step's record says beyond its name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class SetArrayOffsetParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    sensor_ids: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'SensorsParams',
                       'SetArrayOffsetParams']} })
    offset: Optional[Length] = Field(default=None, description="""Distance astern; null for at the ship.""", json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeParams', 'NarrativeReply', 'SetArrayOffsetParams']} })
    mode: Optional[ArrayModeEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SetArrayOffsetParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class CutsParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    cut_ids: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'TmaFocus',
                       'TmaExcludeMessage',
                       'CutsParams',
                       'TmaExcludeCutParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class TmaResidualsParams(PlotParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: Optional[AgentRef] = Field(default=None, description="""Who is asking; a method that changes the plot records it (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class TmaResidualsReply(PlotReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    residuals: TmaResiduals = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'TmaResidualsReply', 'TmaChangeReply']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class TmaCreateParams(PlotChangeParams, TmaRequest):
    """
    A TmaRequest, in request or as the parameters themselves.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'mixins': ['TmaRequest']})

    request: Optional[TmaRequest] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaCreateParams']} })
    sensor_ids: Optional[list[str]] = Field(default=None, description="""The sensors whose cuts in the period it is rooted in.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'SensorsParams',
                       'SetArrayOffsetParams']} })
    period: Optional[TimeRange] = Field(default=None, description="""The cuts whose times fall in it, ends included, of the sensors named.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    cut_ids: Optional[list[str]] = Field(default=None, description="""Or the cuts to root it in, by feature id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'TmaFocus',
                       'TmaExcludeMessage',
                       'CutsParams',
                       'TmaExcludeCutParams']} })
    contact: Optional[str] = Field(default=None, description="""The contact's name; left out, the next of \"Contact 1\", \"Contact 2\"...""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution', 'TmaRequest', 'TmaSolutionRow']} })
    name: Optional[str] = Field(default=None, description="""The solution track's name; left out, the contact's with \"solution\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    colour: Optional[str] = Field(default=None, description="""The solution track's colour, lower-case hex RGB; left out, Debrief's TMA colour.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    range: Optional[Length] = Field(default=None, description="""First guess by form: how far along the first cut's bearing, from where it was taken, the solution starts.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest', 'SensorCutProperties', 'TimeState']} })
    first_bearing: Optional[SensorCutKeptEnum] = Field(default=None, description="""First guess by form, where the first cut is ambiguous and unresolved: which of its bearings the range is along. Left out, the one kept, else the bearing recorded first.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest']} })
    course: Optional[Angle] = Field(default=None, description="""First guess by form: the solution's course.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest', 'TrackEdit', 'SensorCutProperties']} })
    speed: Optional[Speed] = Field(default=None, description="""First guess by form: the solution's speed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest', 'TrackEdit', 'Jump']} })
    first_position: Optional[conlist(min_length=2, max_length=2, item_type=float)] = Field(default=None, description="""First guess by two clicks: [longitude, latitude] clicked on, or near, the first cut's line: the solution starts on the line, level with it.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 2}],
                   'exact_number_dimensions': 1},
         'domain_of': ['TmaRequest']} })
    last_position: Optional[conlist(min_length=2, max_length=2, item_type=float)] = Field(default=None, description="""First guess by two clicks: [longitude, latitude] clicked on, or near, the last cut's line; the course and speed are those from the first position, on the first cut's line, to this one, on the last's.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 2}],
                   'exact_number_dimensions': 1},
         'domain_of': ['TmaRequest']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })

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


class TmaChangeReply(PlotChangeReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    residuals: Optional[TmaResiduals] = Field(default=None, description="""The solution's residuals after the change.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'TmaResidualsReply', 'TmaChangeReply']} })
    changed: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply']} })
    feature: Optional[str] = Field(default=None, description="""The feature made or changed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    features: Optional[list[str]] = Field(default=None, description="""The features made (the parts of a split track).""", json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    notes: Optional[list[str]] = Field(default=None, description="""What the step's record says beyond its name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class TmaCreateReply(TmaChangeReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'slot_usage': {'feature': {'name': 'feature', 'required': True},
                        'residuals': {'name': 'residuals', 'required': True}}})

    residuals: TmaResiduals = Field(default=..., description="""The solution's residuals after the change.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'TmaResidualsReply', 'TmaChangeReply']} })
    changed: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply']} })
    feature: str = Field(default=..., description="""The feature made or changed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    features: Optional[list[str]] = Field(default=None, description="""The features made (the parts of a split track).""", json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    notes: Optional[list[str]] = Field(default=None, description="""What the step's record says beyond its name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class TmaSplitLegParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    at: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision',
                       'ImageExport',
                       'EarlierRead',
                       'ListedStep',
                       'NarrativeParams',
                       'TmaSplitLegParams',
                       'SplitTrackParams']} })
    join: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSplitLegParams']} })
    side: Optional[SplitSideEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaCut', 'SensorCutRow', 'TmaSplitLegParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })

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


class TmaExcludeCutParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    cut_ids: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'AmbiguityResolution',
                       'TmaFocus',
                       'TmaExcludeMessage',
                       'CutsParams',
                       'TmaExcludeCutParams']} })
    excluded: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaResidualRow',
                       'TmaResiduals',
                       'TmaExcludeMessage',
                       'TmaExcludeCutParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class EditTrackParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    edit: TrackEdit = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['EditTrackParams']} })
    current_time: Optional[str] = Field(default=None, description="""A rotation's default pivot.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ShowFormMessage',
                       'ShowAnnotationFormMessage',
                       'TmaSplitMessage',
                       'TmaTimeAskedMessage',
                       'TmaSelectMessage',
                       'TmaMenuMessage',
                       'EditTrackParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })

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


class SplitTrackParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    at: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRevision',
                       'ImageExport',
                       'EarlierRead',
                       'ListedStep',
                       'NarrativeParams',
                       'TmaSplitLegParams',
                       'SplitTrackParams']} })
    names: Optional[list[str]] = Field(default=None, min_length=2, max_length=2, json_schema_extra = { "linkml_meta": {'domain_of': ['SplitTrackParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })

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


class MergeTracksParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    features: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    name: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'TmaRequest',
                       'SourceTrackRef',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorProperties',
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
                       'CoverageSource',
                       'TmaSensorRow',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'EarlierRead',
                       'PreviewCount',
                       'PreviewSource',
                       'NarrativePreview',
                       'SensorInFile',
                       'TrackListed',
                       'SensorPreview',
                       'NarrativeTally',
                       'SensorRow',
                       'MergeTracksParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class FindJumpsParams(PlotParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    period: Optional[TimeRange] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    threshold: Optional[Speed] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FindJumpsParams', 'JumpsReply', 'RemoveJumpsParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: Optional[AgentRef] = Field(default=None, description="""Who is asking; a method that changes the plot records it (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class Jump(ConfiguredBaseModel):
    """
    A fix reached faster than the threshold.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    time: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    position: conlist(min_length=2, max_length=2, item_type=float) = Field(default=..., json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 2}],
                   'exact_number_dimensions': 1},
         'domain_of': ['TrackEdit', 'Jump']} })
    speed: Optional[Speed] = Field(default=None, description="""null when at the same time as the fix before, somewhere else.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest', 'TrackEdit', 'Jump']} })
    since: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Jump']} })
    logged: Optional[bool] = Field(default=None, description="""A dead-reckoned track's jump: its logged speed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['Jump', 'StampedImage']} })

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

    @field_validator('since')
    def pattern_since(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid since format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid since format: {v}"
            raise ValueError(err_msg)
        return v


class JumpsReply(PlotReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    threshold: Speed = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FindJumpsParams', 'JumpsReply', 'RemoveJumpsParams']} })
    median_speed: Optional[Speed] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['JumpsReply']} })
    jumps: list[Jump] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['JumpsReply']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class RemoveJumpsParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    times: list[str] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'RemoveJumpsParams']} })
    threshold: Optional[Speed] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FindJumpsParams', 'JumpsReply', 'RemoveJumpsParams']} })
    period: Optional[TimeRange] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class SmoothingPreviewParams(PlotParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    window: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SmoothingPreviewParams', 'SmoothTrackParams']} })
    period: Optional[TimeRange] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: Optional[AgentRef] = Field(default=None, description="""Who is asking; a method that changes the plot records it (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class SmoothTrackParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    window: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SmoothingPreviewParams', 'SmoothTrackParams']} })
    period: Optional[TimeRange] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class SmoothingSummary(ConfiguredBaseModel):
    """
    What smoothing did, or would do.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief', 'mixin': True})

    moved: Optional[int] = Field(default=None, description="""How many fixes moved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SmoothingSummary']} })
    largest: Optional[Length] = Field(default=None, description="""The most any moved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaFocus', 'SmoothingSummary']} })
    largest_time: Optional[str] = Field(default=None, description="""When; null if none moved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SmoothingSummary']} })
    summary: Optional[str] = Field(default=None, description="""The words for it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SmoothingSummary']} })

    @field_validator('largest_time')
    def pattern_largest_time(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid largest_time format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid largest_time format: {v}"
            raise ValueError(err_msg)
        return v


class SmoothingPreviewReply(SmoothingSummary, PlotReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'mixins': ['SmoothingSummary'],
         'slot_usage': {'largest': {'name': 'largest', 'required': True},
                        'moved': {'name': 'moved', 'required': True},
                        'summary': {'name': 'summary', 'required': True}}})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    preview: LineStringGeometry = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ShowFixesMessage',
                       'TmaPreviewMessage',
                       'SmoothingPreviewReply']} })
    moved: int = Field(default=..., description="""How many fixes moved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SmoothingSummary']} })
    largest: Length = Field(default=..., description="""The most any moved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaFocus', 'SmoothingSummary']} })
    largest_time: Optional[str] = Field(default=None, description="""When; null if none moved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SmoothingSummary']} })
    summary: str = Field(default=..., description="""The words for it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SmoothingSummary']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })

    @field_validator('largest_time')
    def pattern_largest_time(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid largest_time format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid largest_time format: {v}"
            raise ValueError(err_msg)
        return v


class SmoothingReply(SmoothingSummary, PlotChangeReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief',
         'mixins': ['SmoothingSummary']})

    moved: Optional[int] = Field(default=None, description="""How many fixes moved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SmoothingSummary']} })
    largest: Optional[Length] = Field(default=None, description="""The most any moved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaFocus', 'SmoothingSummary']} })
    largest_time: Optional[str] = Field(default=None, description="""When; null if none moved.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SmoothingSummary']} })
    summary: Optional[str] = Field(default=None, description="""The words for it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['SmoothingSummary']} })
    changed: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply']} })
    feature: Optional[str] = Field(default=None, description="""The feature made or changed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    features: Optional[list[str]] = Field(default=None, description="""The features made (the parts of a split track).""", json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    notes: Optional[list[str]] = Field(default=None, description="""What the step's record says beyond its name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })

    @field_validator('largest_time')
    def pattern_largest_time(cls, v):
        pattern=re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid largest_time format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid largest_time format: {v}"
            raise ValueError(err_msg)
        return v


class FixMarkChanges(ConfiguredBaseModel):
    """
    A fix's own colour, label or comment; null or \"\" takes one away.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    colour: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TmaRequest',
                       'TrackStyle',
                       'FixMark',
                       'AnnotationAppearance',
                       'SensorProperties',
                       'SensorCutProperties',
                       'ToteRow',
                       'ToteTrack',
                       'CoveragePlatform',
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'SetColourParams',
                       'SensorRow',
                       'FixMarkChanges']} })
    label: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'SensorCutProperties',
                       'MeasureDefinition',
                       'TmaCut',
                       'SensorCutRow',
                       'FixMarkChanges']} })
    comment: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'SensorCutProperties',
                       'SensorCutRow',
                       'FixMarkChanges']} })
    show_label: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark', 'FixMarkChanges']} })
    show_symbol: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark', 'FixMarkChanges']} })


class MarkFixParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    time: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    changes: FixMarkChanges = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['MarkFixParams']} })
    colour_name: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SetColourParams', 'MarkFixParams']} })
    period: Optional[TimeRange] = Field(default=None, description="""Read as cleaning's other methods read it; unused.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })

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


class CoverageParams(PlotParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: Optional[AgentRef] = Field(default=None, description="""Who is asking; a method that changes the plot records it (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class CoverageReply(PlotReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    coverage: CoverageReport = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaView', 'ShowCoverageMessage', 'CoverageReply']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class ItemAsked(ConfiguredBaseModel):
    """
    A catalogue item, by its catalogue's own id, and the revision the analyst saw.
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
                       'LoggedExport',
                       'ItemAsked']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    revision: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })


class TakeNewDataParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    source: ItemAsked = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'NarrativeRow',
                       'TakeNewDataParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams',
                       'DismissNewDataParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class TakeNewDataReply(PlotChangeReply):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    step: Optional[int] = Field(default=None, description="""The step taking it.""", json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'FigureSource',
                       'EarlierRead',
                       'GotoParams',
                       'TakeNewDataReply',
                       'OpenRevisionReply']} })
    message: Optional[str] = Field(default=None, description="""Why nothing was taken.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FormBusyMessage',
                       'FormErrorMessage',
                       'ShowFixesMessage',
                       'NarrativeSavedMessage',
                       'ShowCoverageMessage',
                       'ImageRenderedMessage',
                       'TmaMadeMessage',
                       'TakeNewDataReply']} })
    changed: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply']} })
    feature: Optional[str] = Field(default=None, description="""The feature made or changed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    features: Optional[list[str]] = Field(default=None, description="""The features made (the parts of a split track).""", json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'PlotChangeReply',
                       'SetColourParams',
                       'SetHiddenParams',
                       'SetTrackFrequenciesParams',
                       'DeleteFeaturesParams',
                       'MergeTracksParams']} })
    notes: Optional[list[str]] = Field(default=None, description="""What the step's record says beyond its name.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'RenderedImage',
                       'PlotChangeReply',
                       'ImportReply',
                       'NarrativePreview',
                       'SensorPreview',
                       'ListedStep']} })
    recovered: list[str] = Field(default=..., description="""What opening the plot had to repair after a crash, for the analyst (NFR-10).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotReply']} })
    base: PlotBase = Field(default=..., description="""Where the plot's history stands now.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    latest: int = Field(default=..., description="""How many steps the history holds.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })


class SetSourcePreferenceParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    period: TimeRange = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TmaSolution',
                       'TmaRequest',
                       'TrackEdit',
                       'AmbiguityResolution',
                       'TmaSolutionRow',
                       'TmaFocus',
                       'SensorsParams',
                       'FindJumpsParams',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'MarkFixParams',
                       'SetSourcePreferenceParams']} })
    source: SourceTrackRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'NarrativeRow',
                       'TakeNewDataParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams',
                       'DismissNewDataParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class LinkTracksParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    feature: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeReply',
                       'EditAnnotationParams',
                       'EditNarrativeParams',
                       'TmaResidualsParams',
                       'TmaSplitLegParams',
                       'TmaExcludeCutParams',
                       'EditTrackParams',
                       'SplitTrackParams',
                       'FindJumpsParams',
                       'JumpsReply',
                       'RemoveJumpsParams',
                       'SmoothingPreviewParams',
                       'SmoothTrackParams',
                       'SmoothingPreviewReply',
                       'MarkFixParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams']} })
    source: SourceTrackRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'NarrativeRow',
                       'TakeNewDataParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams',
                       'DismissNewDataParams']} })
    linked: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['LinkChangedMessage', 'LinkTracksParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class DismissNewDataParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    source: ItemRevision = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['NarrativeProperties',
                       'NarrativeSpec',
                       'TimelineEntry',
                       'SourceChosenMessage',
                       'LinkChangedMessage',
                       'NarrativeRow',
                       'TakeNewDataParams',
                       'SetSourcePreferenceParams',
                       'LinkTracksParams',
                       'DismissNewDataParams']} })
    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class ClearReviewFlagParams(PlotChangeParams):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    allow_newer_schema: Optional[bool] = Field(default=None, description="""The analyst agreed to writing a newer schema into the catalogue (SUB-35).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    store: str = Field(default=..., description="""The store's id in the analyst's configuration.""", json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., description="""The plot's id.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    base: Optional[PlotBase] = Field(default=None, description="""The base the caller last saw; left out, the change is not checked against one.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotParams', 'PlotReply']} })
    agent: AgentRef = Field(default=..., description="""Who made the change, recorded in provenance (SUB-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })


class FigureIdParams(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    store: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    revision: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })

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


class FigureIdReply(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    short: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureIdReply', 'StampedImage', 'ExportedImage', 'TracedImage']} })
    revision: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })

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

    @field_validator('short')
    def pattern_short(cls, v):
        pattern=re.compile(r"^DBF-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid short format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid short format: {v}"
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


class ExportImageParams(ConfiguredBaseModel):
    """
    A host's image to stamp and log (image given), or an agent's export for an open map to draw (no image; file the full path to write).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    store: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    agent: AgentRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })
    allow_newer_schema: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotChangeParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'MoveParams',
                       'ExportImageParams']} })
    id: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    image: Optional[str] = Field(default=None, description="""A PNG as base 64, or an SVG's text.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ImageRenderedMessage', 'ExportImageParams', 'StampedImage']} })
    file: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ExportImageParams',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'HostRequest']} })
    format: Optional[ImageFormatEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef',
                       'ImageExport',
                       'ImageRequest',
                       'RenderedImage',
                       'NarrativePreview',
                       'ExportImageParams',
                       'HostRequest']} })
    footer: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'ExportImageParams', 'HostRequest']} })
    overwrite: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ExportImageParams', 'HostRequest']} })
    preset: Optional[ImagePresetEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ImageRequest',
                       'ExportImageParams',
                       'HostRequest']} })
    theme: Optional[ImageThemeEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ImageRequest',
                       'ExportImageParams',
                       'HostRequest']} })
    width: Optional[int] = Field(default=None, ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'RenderedImage', 'ExportImageParams']} })
    height: Optional[int] = Field(default=None, ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'RenderedImage', 'ExportImageParams']} })
    viewport: Optional[Viewport] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState',
                       'SharedStateChange',
                       'ImageExport',
                       'RenderedImage',
                       'ShowPlotMessage',
                       'SetViewportMessage',
                       'ViewportChangedMessage',
                       'ExportImageParams']} })
    time: Optional[TimeState] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FixMark',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'NarrativeProperties',
                       'NarrativeSpec',
                       'SensorCutProperties',
                       'SharedState',
                       'SharedStateChange',
                       'ToteResult',
                       'ImageExport',
                       'TmaCut',
                       'ShowPlotMessage',
                       'SetTimeMessage',
                       'TimeChangedMessage',
                       'ShowTimeMessage',
                       'ShowTimelineMessage',
                       'ShowCoverageMessage',
                       'ToteParams',
                       'NarrativeRow',
                       'SensorCutRow',
                       'Jump',
                       'MarkFixParams',
                       'ExportImageParams']} })
    tote: Optional[ToteView] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView',
                       'ImageExport',
                       'ShowToteMessage',
                       'ToteParams',
                       'ExportImageParams']} })

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


class StampedImage(ConfiguredBaseModel):
    """
    A host's image stamped with its ID and the export recorded, given back to write.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    short: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureIdReply', 'StampedImage', 'ExportedImage', 'TracedImage']} })
    revision: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })
    image: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImageRenderedMessage', 'ExportImageParams', 'StampedImage']} })
    recorded: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['StampedImage', 'ExportedImage']} })
    logged: Optional[ExportLoggedEnum] = Field(default=None, description="""Where the export is recorded; null for nowhere.""", json_schema_extra = { "linkml_meta": {'domain_of': ['Jump', 'StampedImage']} })
    note: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag',
                       'StampedImage',
                       'ExportedImage']} })

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

    @field_validator('short')
    def pattern_short(cls, v):
        pattern=re.compile(r"^DBF-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid short format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid short format: {v}"
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


class ExportedImage(ConfiguredBaseModel):
    """
    What exporting an image said, as the host answers an agent's export.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    file: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ExportImageParams',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'HostRequest']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    short: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureIdReply', 'StampedImage', 'ExportedImage', 'TracedImage']} })
    revision: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })
    recorded: bool = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['StampedImage', 'ExportedImage']} })
    note: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ToteRow',
                       'ToteResult',
                       'CoverageReport',
                       'NewDataMark',
                       'ReviewFlag',
                       'StampedImage',
                       'ExportedImage']} })

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

    @field_validator('short')
    def pattern_short(cls, v):
        pattern=re.compile(r"^DBF-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid short format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid short format: {v}"
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


class FindImageSourceParams(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    file: Optional[str] = Field(default=None, description="""An image, or a Word or PowerPoint file of them.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ExportImageParams',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'HostRequest']} })
    id: Optional[str] = Field(default=None, description="""An ID typed from a footer, in full or short.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })


class TracedImage(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., description="""The ID as read, or as typed from a footer, in full or its short form.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'FigureId'}, {'range': 'ShortFigureId'}],
         'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    short: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureIdReply', 'StampedImage', 'ExportedImage', 'TracedImage']} })
    where: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TracedImage', 'SkippedPicture']} })
    sources: list[FigureSource] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['CoveragePlatform',
                       'CoveragePeriod',
                       'NarrativePreview',
                       'NarrativeImportReply',
                       'NarrativeParams',
                       'NarrativeReply',
                       'TracedImage']} })

    @field_validator('short')
    def pattern_short(cls, v):
        pattern=re.compile(r"^DBF-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$")
        if isinstance(v, list):
            for element in v:
                if isinstance(element, str) and not pattern.search(element):
                    err_msg = f"Invalid short format: {element}"
                    raise ValueError(err_msg)
        elif isinstance(v, str) and not pattern.search(v):
            err_msg = f"Invalid short format: {v}"
            raise ValueError(err_msg)
        return v


class SkippedPicture(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    where: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TracedImage', 'SkippedPicture']} })
    why: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SkippedPicture']} })


class ImageSources(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    images: list[TracedImage] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImageSources']} })
    skipped: Optional[list[SkippedPicture]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageSources']} })
    problem: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageSources', 'HostAnswerParams']} })


class OpenRevisionParams(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    store: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    revision: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })
    id: Optional[str] = Field(default=None, description="""The image whose export log entry to give.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })

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


class OpenRevisionReply(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    plot: DebriefFeatureCollection = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Selection',
                       'ShowPlotMessage',
                       'OpenReply',
                       'OpenRevisionReply']} })
    step: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'FigureSource',
                       'EarlierRead',
                       'GotoParams',
                       'TakeNewDataReply',
                       'OpenRevisionReply']} })
    current: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState',
                       'FigureSource',
                       'PlotHistory',
                       'HistoryHead',
                       'PlotBase',
                       'NarrativeReply',
                       'OpenRevisionReply']} })
    latest: int = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['RevisionShown',
                       'HistoryHead',
                       'PlotReply',
                       'OpenRevisionReply']} })
    revision: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageItem',
                       'NewDataMark',
                       'ImageExport',
                       'RevisionShown',
                       'FigureSource',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'FigureIdReply',
                       'StampedImage',
                       'ExportedImage',
                       'OpenRevisionParams',
                       'OpenRevisionReply']} })
    export: Optional[ImageExport] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource', 'LoggedExport', 'OpenRevisionReply']} })

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


class HostPollParams(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    wait_s: Optional[float] = Field(default=None, description="""Seconds to wait for a request.""", json_schema_extra = { "linkml_meta": {'domain_of': ['HostPollParams']} })


class HostRequest(ConfiguredBaseModel):
    """
    An agent's export, asked of the open map by the service.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    kind: HostRequestKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'NarrativeProperties',
                       'SensorProperties',
                       'SensorCutProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'TimelineEntry',
                       'WebviewMessageBase',
                       'ListedStep',
                       'HostRequest']} })
    store: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['FigureSource',
                       'PlotParams',
                       'CreateCatalogueReply',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ReviewFlagListed',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    item: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ItemRef',
                       'SourceTrackRef',
                       'TrackSupply',
                       'ItemRevision',
                       'CoverageReport',
                       'CoverageSource',
                       'CoverageItem',
                       'ReviewFlag',
                       'FigureSource',
                       'LoggedExport',
                       'PlotParams',
                       'ImportReply',
                       'AddPlotFileReply',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ToteParams',
                       'ItemAsked',
                       'FigureIdParams',
                       'ExportImageParams',
                       'OpenRevisionParams',
                       'HostRequest']} })
    file: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ExportImageParams',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'HostRequest']} })
    format: ImageFormatEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadRef',
                       'ImageExport',
                       'ImageRequest',
                       'RenderedImage',
                       'NarrativePreview',
                       'ExportImageParams',
                       'HostRequest']} })
    agent: AgentRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'PlotParams',
                       'ImportParams',
                       'AddPlotFileParams',
                       'PreviewNarrativeParams',
                       'PreviewSensorParams',
                       'ListedStep',
                       'ExportImageParams',
                       'HostRequest']} })
    preset: Optional[ImagePresetEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ImageRequest',
                       'ExportImageParams',
                       'HostRequest']} })
    theme: Optional[ImageThemeEnum] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport',
                       'ImageRequest',
                       'ExportImageParams',
                       'HostRequest']} })
    footer: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageExport', 'ExportImageParams', 'HostRequest']} })
    overwrite: Optional[bool] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ExportImageParams', 'HostRequest']} })


class HostPollReply(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    requests: list[HostRequest] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['HostPollReply']} })


class HostAnswerParams(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'NarrativeFeature',
                       'SensorFeature',
                       'SensorCutFeature',
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
                       'TmaSensorRow',
                       'TmaCut',
                       'TmaSolutionRow',
                       'TmaOwnship',
                       'TimelineEntry',
                       'StoreListed',
                       'TrackListed',
                       'NarrativeRow',
                       'SensorCutRow',
                       'SensorRow',
                       'FigureIdReply',
                       'ExportImageParams',
                       'StampedImage',
                       'ExportedImage',
                       'FindImageSourceParams',
                       'TracedImage',
                       'OpenRevisionParams',
                       'HostRequest',
                       'HostAnswerParams']} })
    result: Optional[ExportedImage] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ShowResultsMessage', 'HostAnswerParams']} })
    problem: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ImageSources', 'HostAnswerParams']} })


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
TmaSolution.model_rebuild()
TmaRequest.model_rebuild()
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
SensorFeature.model_rebuild()
SensorProperties.model_rebuild()
SensorCutFeature.model_rebuild()
SensorCutProperties.model_rebuild()
AmbiguityResolution.model_rebuild()
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
TmaSensorRow.model_rebuild()
TmaCut.model_rebuild()
TmaResidualRow.model_rebuild()
TmaResiduals.model_rebuild()
TmaSolutionRow.model_rebuild()
TmaOwnship.model_rebuild()
TmaView.model_rebuild()
TmaFocus.model_rebuild()
TimelineEntry.model_rebuild()
WebviewMessageBase.model_rebuild()
ReadyMessage.model_rebuild()
ShowPlotMessage.model_rebuild()
SetSelectionMessage.model_rebuild()
SelectionChangedMessage.model_rebuild()
SetTimeMessage.model_rebuild()
TimeChangedMessage.model_rebuild()
SetViewportMessage.model_rebuild()
ViewportChangedMessage.model_rebuild()
ShowHiddenMessage.model_rebuild()
ShowFormMessage.model_rebuild()
RunToolMessage.model_rebuild()
CancelMessage.model_rebuild()
FormBusyMessage.model_rebuild()
FormErrorMessage.model_rebuild()
ShowResultsMessage.model_rebuild()
ShowTimeMessage.model_rebuild()
WindowChangedMessage.model_rebuild()
ContextChangedMessage.model_rebuild()
SetContextMessage.model_rebuild()
ShowAnnotationFormMessage.model_rebuild()
SaveAnnotationMessage.model_rebuild()
DeleteAnnotationMessage.model_rebuild()
EditAnnotationMessage.model_rebuild()
AnnotationDrawnMessage.model_rebuild()
EditTrackMessage.model_rebuild()
ShowFixesMessage.model_rebuild()
ShowToteMessage.model_rebuild()
ToteChangedMessage.model_rebuild()
SetToteMessage.model_rebuild()
ShowTimelineMessage.model_rebuild()
NarrativeOnMapChangedMessage.model_rebuild()
PlayingChangedMessage.model_rebuild()
TimelineChosenMessage.model_rebuild()
SaveNarrativeMessage.model_rebuild()
DeleteNarrativeMessage.model_rebuild()
OpenNarrativeFormMessage.model_rebuild()
NarrativeSavedMessage.model_rebuild()
SetNarrativeMessage.model_rebuild()
UndoAskedMessage.model_rebuild()
RedoAskedMessage.model_rebuild()
FixChosenMessage.model_rebuild()
ShowCoverageMessage.model_rebuild()
SourceChosenMessage.model_rebuild()
LinkChangedMessage.model_rebuild()
TakeAskedMessage.model_rebuild()
DismissAskedMessage.model_rebuild()
ReviewClearedMessage.model_rebuild()
ExportImageMessage.model_rebuild()
ImageRenderedMessage.model_rebuild()
LatestAskedMessage.model_rebuild()
ResolveAskedMessage.model_rebuild()
CutChosenMessage.model_rebuild()
ShowTmaMessage.model_rebuild()
TmaChosenMessage.model_rebuild()
TmaCreateMessage.model_rebuild()
TmaGuessMessage.model_rebuild()
TmaGuessedMessage.model_rebuild()
TmaPreviewMessage.model_rebuild()
TmaExcludeMessage.model_rebuild()
TmaSplitMessage.model_rebuild()
TmaTimeAskedMessage.model_rebuild()
TmaSelectMessage.model_rebuild()
TmaMenuMessage.model_rebuild()
TmaResolveMessage.model_rebuild()
TmaCutOffMessage.model_rebuild()
TmaPlotDrawnMessage.model_rebuild()
TmaPanesMessage.model_rebuild()
TmaMadeMessage.model_rebuild()
PlotHistory.model_rebuild()
HistoryStep.model_rebuild()
Delta.model_rebuild()
HistoryHead.model_rebuild()
NoParams.model_rebuild()
EmptyReply.model_rebuild()
NameMap.model_rebuild()
PlotBase.model_rebuild()
PlotParams.model_rebuild()
PlotChangeParams.model_rebuild()
PlotReply.model_rebuild()
PlotChangeReply.model_rebuild()
IslandReply.model_rebuild()
IslandChangeReply.model_rebuild()
ToolsForSelectionParams.model_rebuild()
ToolsForSelectionReply.model_rebuild()
StoreListed.model_rebuild()
StoresReply.model_rebuild()
CreateCatalogueParams.model_rebuild()
CreateCatalogueReply.model_rebuild()
NarrativeChoices.model_rebuild()
ImportParams.model_rebuild()
ImportReply.model_rebuild()
AddPlotFileParams.model_rebuild()
AddPlotFileReply.model_rebuild()
RepTracksParams.model_rebuild()
RepTracksReply.model_rebuild()
PreviewNarrativeParams.model_rebuild()
EarlierRead.model_rebuild()
PreviewCount.model_rebuild()
PreviewSource.model_rebuild()
NarrativePreview.model_rebuild()
PreviewSensorParams.model_rebuild()
SensorInFile.model_rebuild()
TrackListed.model_rebuild()
SensorPreview.model_rebuild()
ToteParams.model_rebuild()
MeasureGroupsReply.model_rebuild()
ReviewFlagListed.model_rebuild()
ReviewFlagsReply.model_rebuild()
OpenParams.model_rebuild()
OpenReply.model_rebuild()
HistoryParams.model_rebuild()
ListedStep.model_rebuild()
HistoryReply.model_rebuild()
MoveParams.model_rebuild()
GotoParams.model_rebuild()
SetColourParams.model_rebuild()
SetHiddenParams.model_rebuild()
SetTrackFrequenciesParams.model_rebuild()
SetViewParams.model_rebuild()
AddAnnotationParams.model_rebuild()
AnnotationAsked.model_rebuild()
EditAnnotationParams.model_rebuild()
DeleteFeaturesParams.model_rebuild()
SetNorthArrowParams.model_rebuild()
AddNarrativeParams.model_rebuild()
EditNarrativeParams.model_rebuild()
ImportNarrativeParams.model_rebuild()
NarrativeImportReply.model_rebuild()
NarrativeParams.model_rebuild()
NarrativeRow.model_rebuild()
NarrativeTally.model_rebuild()
NarrativeReply.model_rebuild()
SensorsParams.model_rebuild()
SensorCutRow.model_rebuild()
SensorRow.model_rebuild()
SensorsReply.model_rebuild()
ResolveAmbiguityParams.model_rebuild()
ImportSensorParams.model_rebuild()
SensorImportReply.model_rebuild()
SetArrayOffsetParams.model_rebuild()
CutsParams.model_rebuild()
TmaResidualsParams.model_rebuild()
TmaResidualsReply.model_rebuild()
TmaCreateParams.model_rebuild()
TmaChangeReply.model_rebuild()
TmaCreateReply.model_rebuild()
TmaSplitLegParams.model_rebuild()
TmaExcludeCutParams.model_rebuild()
EditTrackParams.model_rebuild()
SplitTrackParams.model_rebuild()
MergeTracksParams.model_rebuild()
FindJumpsParams.model_rebuild()
Jump.model_rebuild()
JumpsReply.model_rebuild()
RemoveJumpsParams.model_rebuild()
SmoothingPreviewParams.model_rebuild()
SmoothTrackParams.model_rebuild()
SmoothingSummary.model_rebuild()
SmoothingPreviewReply.model_rebuild()
SmoothingReply.model_rebuild()
FixMarkChanges.model_rebuild()
MarkFixParams.model_rebuild()
CoverageParams.model_rebuild()
CoverageReply.model_rebuild()
ItemAsked.model_rebuild()
TakeNewDataParams.model_rebuild()
TakeNewDataReply.model_rebuild()
SetSourcePreferenceParams.model_rebuild()
LinkTracksParams.model_rebuild()
DismissNewDataParams.model_rebuild()
ClearReviewFlagParams.model_rebuild()
FigureIdParams.model_rebuild()
FigureIdReply.model_rebuild()
ExportImageParams.model_rebuild()
StampedImage.model_rebuild()
ExportedImage.model_rebuild()
FindImageSourceParams.model_rebuild()
TracedImage.model_rebuild()
SkippedPicture.model_rebuild()
ImageSources.model_rebuild()
OpenRevisionParams.model_rebuild()
OpenRevisionReply.model_rebuild()
HostPollParams.model_rebuild()
HostRequest.model_rebuild()
HostPollReply.model_rebuild()
HostAnswerParams.model_rebuild()

# Classes that accept undeclared properties (extra_slots), added by the generator.
AnnotationAsked.model_config["extra"] = "allow"
NameMap.model_config["extra"] = "allow"
StacAsset.model_config["extra"] = "allow"
StacItemProperties.model_config["extra"] = "allow"
AnnotationAsked.model_rebuild(force=True)
AddAnnotationParams.model_rebuild(force=True)
EditAnnotationParams.model_rebuild(force=True)
NameMap.model_rebuild(force=True)
ImportParams.model_rebuild(force=True)
ImportSensorParams.model_rebuild(force=True)
NarrativeChoices.model_rebuild(force=True)
StacAsset.model_rebuild(force=True)
StacItemProperties.model_rebuild(force=True)
StacItem.model_rebuild(force=True)

from typing import Annotated as _Annotated  # noqa: E402


# Any of WebviewMessageBase's classes, told apart by kind; added by the generator.
class WebviewMessage(
    RootModel[
        _Annotated[
            Union[
                ReadyMessage,
                ShowPlotMessage,
                SetSelectionMessage,
                SelectionChangedMessage,
                SetTimeMessage,
                TimeChangedMessage,
                SetViewportMessage,
                ViewportChangedMessage,
                ShowHiddenMessage,
                ShowFormMessage,
                RunToolMessage,
                CancelMessage,
                FormBusyMessage,
                FormErrorMessage,
                ShowResultsMessage,
                ShowTimeMessage,
                WindowChangedMessage,
                ContextChangedMessage,
                SetContextMessage,
                ShowAnnotationFormMessage,
                SaveAnnotationMessage,
                DeleteAnnotationMessage,
                EditAnnotationMessage,
                AnnotationDrawnMessage,
                EditTrackMessage,
                ShowFixesMessage,
                ShowToteMessage,
                ToteChangedMessage,
                SetToteMessage,
                ShowTimelineMessage,
                NarrativeOnMapChangedMessage,
                PlayingChangedMessage,
                TimelineChosenMessage,
                SaveNarrativeMessage,
                DeleteNarrativeMessage,
                OpenNarrativeFormMessage,
                NarrativeSavedMessage,
                SetNarrativeMessage,
                UndoAskedMessage,
                RedoAskedMessage,
                FixChosenMessage,
                ShowCoverageMessage,
                SourceChosenMessage,
                LinkChangedMessage,
                TakeAskedMessage,
                DismissAskedMessage,
                ReviewClearedMessage,
                ExportImageMessage,
                ImageRenderedMessage,
                LatestAskedMessage,
                ResolveAskedMessage,
                CutChosenMessage,
                ShowTmaMessage,
                TmaChosenMessage,
                TmaCreateMessage,
                TmaGuessMessage,
                TmaGuessedMessage,
                TmaPreviewMessage,
                TmaExcludeMessage,
                TmaSplitMessage,
                TmaTimeAskedMessage,
                TmaSelectMessage,
                TmaMenuMessage,
                TmaResolveMessage,
                TmaCutOffMessage,
                TmaPlotDrawnMessage,
                TmaPanesMessage,
                TmaMadeMessage,
            ],
            Field(discriminator="kind"),
        ]
    ]
):
    """Any of WebviewMessageBase's classes, told apart by kind."""
