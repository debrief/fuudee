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
version = "0.0.13"


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


class StoreKindEnum(str, Enum):
    """
    How a store is reached. Only static file catalogues so far (SUB-15).
    """
    file = "file"
    """
    A static STAC catalogue in a local or shared folder.
    """


class WebviewMessageKindEnum(str, Enum):
    ready = "ready"
    """
    Webview to host: loaded and listening.
    """
    show_plot = "show_plot"
    """
    Host to map: draw this plot (plot, plot_title, selection, and current time and viewport if known, and how many features are hidden).
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
                       'ParameterValue']} })
    unit: LengthUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn']} })


class Speed(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'ParameterValue']} })
    unit: SpeedUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn']} })


class Angle(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'ParameterValue']} })
    unit: AngleUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn']} })


class Duration(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'ParameterValue']} })
    unit: DurationUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn']} })


class AngularRate(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    value: float = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'ParameterValue']} })
    unit: AngularRateUnitEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['Length',
                       'Speed',
                       'Angle',
                       'Duration',
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn']} })


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
                       'ResultColumn']} })
    values: list[float] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries', 'LengthSeries']} })


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
                       'ResultColumn']} })
    values: list[float] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries', 'LengthSeries']} })


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
                       'ResultColumn']} })
    values: list[float] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SpeedSeries', 'AngleSeries', 'LengthSeries']} })


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
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
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
                       'ParameterValue']} })

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
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'KnownStore']} })
    kind: ProvActivityKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'WebviewMessage']} })
    started_at: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    ended_at: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    tool: Optional[ToolRef] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'WebviewMessage']} })
    agent: AgentRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
    parameters: Optional[list[ParameterValue]] = Field(default=None, description="""Parameter values the operation ran with, so replay can repeat it (SUB-19).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord', 'ToolDeclaration', 'WebviewMessage']} })
    selected: Optional[list[str]] = Field(default=None, description="""Ids of the features the operation was applied to, in selection order, so replay can repeat it (SUB-19).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord']} })
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
                       'AnnotationSpec',
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
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'WebviewMessage']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'AnnotationSpec',
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
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'KnownStore']} })
    geometry: LineStringGeometry = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: TrackProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })


class TrackProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: TrackKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'WebviewMessage']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'AnnotationSpec',
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
    depths: Optional[LengthSeries] = Field(default=None, description="""Depth below the sea surface at each position, positive down. Absent where depth is not known.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties']} })
    style: Optional[TrackStyle] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'AnnotationProperties']} })
    hidden: Optional[bool] = Field(default=None, description="""Not drawn on the map. Still listed, and still selectable, in the outline. Content: hiding is a recorded, undoable change (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties']} })
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
    How a track is drawn. Data colours do not change with the theme (DEV-07). Colour is content: the analyst changing it (blue friendly to red enemy, say) is a recorded, undoable change (SUB-22).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    colour: str = Field(default=..., description="""Lower-case hex RGB, for example \"#e01c3e\".""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle', 'AnnotationAppearance']} })
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
    Shapes, labels and chart furniture as ordinary GeoJSON (CAP-03). An annotation with only a time has null geometry and shall give a time or a time range (CAP-04); chart furniture has null geometry and needs neither. A circle or an ellipse is a polygon approximating it, for other tools, with its centre and size as properties, which Debrief draws from.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    type: FeatureTypeEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PointGeometry',
                       'LineStringGeometry',
                       'PolygonGeometry',
                       'TrackFeature',
                       'AnnotationFeature',
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
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'KnownStore']} })
    geometry: Optional[Union[LineStringGeometry, PointGeometry, PolygonGeometry]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'PointGeometry'},
                    {'range': 'LineStringGeometry'},
                    {'range': 'PolygonGeometry'}],
         'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: AnnotationProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })


class AnnotationProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: AnnotationKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'WebviewMessage']} })
    style: AnnotationStyleEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties', 'AnnotationProperties']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    text: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    time: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SharedState',
                       'SharedStateChange',
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
                       'SensorObservationsProperties']} })
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


class AnnotationAppearance(ConfiguredBaseModel):
    """
    How an annotation is drawn: its line, its fill and its label. Data colours do not change with the theme (DEV-07). Widths and sizes are in screen pixels, so they are the same at every zoom.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    colour: Optional[str] = Field(default=None, description="""Its line's colour, and a label's or a marker's dot. Lower-case hex RGB, for example \"#c7820a\". Label text is drawn in the theme's text colour, so it stays readable on any map.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackStyle', 'AnnotationAppearance']} })
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
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    text: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    positions: Optional[conlist(min_length=1, item_type=conlist(min_length=2, max_length=2, item_type=float))] = Field(default=None, description="""[longitude, latitude] pairs: the line's positions, or the area's corners (not closed); one, the centre or position, for a circle, ellipse, label or marker; none for a note.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'minimum_cardinality': 1}, {'exact_cardinality': 2}],
                   'exact_number_dimensions': 2},
         'domain_of': ['AnnotationSpec']} })
    radius: Optional[Length] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    semi_major: Optional[Length] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    semi_minor: Optional[Length] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    orientation: Optional[Angle] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties', 'AnnotationSpec']} })
    time: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SharedState',
                       'SharedStateChange',
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
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'KnownStore']} })
    geometry: Optional[PointGeometry] = Field(default=None, description="""Always null.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: SensorObservationsProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })


class SensorObservationsProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: SensorObservationsKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'WebviewMessage']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'AnnotationSpec',
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
    time_range: TimeRange = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'WebviewMessage']} })
    observation_count: int = Field(default=..., ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    payload: PayloadRef = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SensorObservationsProperties']} })
    hidden: Optional[bool] = Field(default=None, description="""Not drawn on the map. Still listed, and still selectable, in the outline. Content: hiding is a recorded, undoable change (SUB-22).""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties']} })
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
                       'AnnotationSpec',
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
                       'AnnotationSpec',
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
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
                       'PayloadColumn',
                       'ResultColumn']} })


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
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'KnownStore']} })
    geometry: Optional[PointGeometry] = Field(default=None, description="""Always null.""", json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    properties: PlotProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })


class PlotProperties(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: PlotKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'WebviewMessage']} })
    title: Optional[str] = Field(default=None, description="""The plot's title. Content, like everything outside view.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'KnownStore']} })
    description: Optional[str] = Field(default=None, description="""What the plot is for. Content.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties', 'StacItemProperties', 'StacCatalog']} })
    view: Optional[PlotView] = Field(default=None, description="""The island: how the plot is being viewed. Outside the plot's history (see the module description). Kept last, so it is easy to find and strip.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties']} })


class PlotView(ConfiguredBaseModel):
    """
    View state saved in the plot file: not content, so not undoable and not recorded in provenance (SUB-22). Two people changing it at once are told, not silently overwritten (SUB-28). Later view state joins here.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    time_window: Optional[TimeRange] = Field(default=None, description="""The plot's time window: the period shown, one for the whole plot (CAP-28, CAP-29). Start shall not be after end.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView']} })
    context_tracks: Optional[ContextTracksEnum] = Field(default=None, description="""How tracks outside the time window are drawn (CAP-29). Left out means visible.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView', 'WebviewMessage']} })


class NamedSet(ConfiguredBaseModel):
    """
    A saved, reusable selection (TL-11).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'KnownStore']} })
    name: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ParameterValue',
                       'ToolRef',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'AnnotationSpec',
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
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    schema_version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection', 'Delta', 'HistoryHead']} })
    features: list[Union[AnnotationFeature, PlotFeature, SensorObservationsFeature, TrackFeature]] = Field(default=..., json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'PlotFeature'}],
         'domain_of': ['DebriefFeatureCollection']} })
    named_sets: Optional[list[NamedSet]] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['DebriefFeatureCollection',
                       'ToolResult',
                       'HistoryStep',
                       'Delta']} })
    provenance: list[ProvRecord] = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackProperties',
                       'AnnotationProperties',
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
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'KnownStore']} })


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
                       'PlotFeature',
                       'DebriefFeatureCollection',
                       'StacLink',
                       'StacAsset',
                       'StacItem',
                       'StacCatalog']} })
    title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'KnownStore']} })
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
    title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'KnownStore']} })
    description: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties', 'StacItemProperties', 'StacCatalog']} })
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
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'KnownStore']} })
    geometry: Optional[Union[LineStringGeometry, PointGeometry, PolygonGeometry]] = Field(default=None, json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'PointGeometry'},
                    {'range': 'LineStringGeometry'},
                    {'range': 'PolygonGeometry'}],
         'domain_of': ['TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'StacItem']} })
    bbox: Optional[conlist(min_length=4, max_length=4, item_type=float)] = Field(default=None, description="""[west, south, east, north] in WGS84 degrees.""", json_schema_extra = { "linkml_meta": {'array': {'dimensions': [{'exact_cardinality': 4}],
                   'exact_number_dimensions': 1},
         'domain_of': ['StacItem', 'Viewport']} })
    properties: StacItemProperties = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TrackFeature',
                       'AnnotationFeature',
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
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'KnownStore']} })
    title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'KnownStore']} })
    description: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties', 'StacItemProperties', 'StacCatalog']} })
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

    current: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState', 'PlotHistory', 'HistoryHead']} })
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

    time: TimeState = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SharedState',
                       'SharedStateChange',
                       'WebviewMessage']} })
    selection: Selection = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange', 'WebviewMessage']} })
    viewport: Viewport = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange', 'WebviewMessage']} })


class SharedStateChange(ConfiguredBaseModel):
    """
    A change to some or all of shared state, as set by a view or returned by a tool (TL-10, TL-11).
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    time: Optional[TimeState] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SharedState',
                       'SharedStateChange',
                       'WebviewMessage']} })
    selection: Optional[Selection] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange', 'WebviewMessage']} })
    viewport: Optional[Viewport] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange', 'WebviewMessage']} })
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
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    version: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ToolRef', 'InnerSchemaRef', 'ToolDeclaration']} })
    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'KnownStore']} })
    explanation: str = Field(default=..., description="""Short user-facing explanation of what the tool does (CAP-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration', 'ParameterDeclaration']} })
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
                       'AnnotationProperties',
                       'AnnotationSpec',
                       'SensorObservationsProperties',
                       'InnerSchemaRef',
                       'PayloadColumn',
                       'NamedSet',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'ResultColumn']} })
    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'KnownStore']} })
    explanation: Optional[str] = Field(default=None, description="""Shown beside the field on the form (CAP-24).""", json_schema_extra = { "linkml_meta": {'domain_of': ['ToolDeclaration', 'ParameterDeclaration']} })
    kind: ParameterKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'WebviewMessage']} })
    quantity_kind: Optional[QuantityKindEnum] = Field(default=None, description="""Required when kind is quantity.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PayloadColumn', 'ParameterDeclaration', 'ResultColumn']} })
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

    title: str = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'KnownStore']} })
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
                       'AnnotationSpec',
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
                       'AngularRate',
                       'SpeedSeries',
                       'AngleSeries',
                       'LengthSeries',
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


class UserConfig(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    config_version: int = Field(default=..., description="""Version of this file's layout. Currently 1.""", ge=1, json_schema_extra = { "linkml_meta": {'domain_of': ['UserConfig']} })
    stores: list[KnownStore] = Field(default=..., description="""Known stores, in the order the analyst sees them (SUB-17).""", json_schema_extra = { "linkml_meta": {'domain_of': ['UserConfig']} })


class KnownStore(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    id: str = Field(default=..., description="""Unique within this file; stable when the store is renamed.""", json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'TrackFeature',
                       'AnnotationFeature',
                       'SensorObservationsFeature',
                       'PlotFeature',
                       'NamedSet',
                       'StacItem',
                       'StacCatalog',
                       'KnownStore']} })
    title: str = Field(default=..., description="""The name the analyst sees.""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotProperties',
                       'StacLink',
                       'StacAsset',
                       'StacItemProperties',
                       'StacCatalog',
                       'ToolDeclaration',
                       'ParameterDeclaration',
                       'NonSpatialResult',
                       'KnownStore']} })
    kind: StoreKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
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


class WebviewMessage(ConfiguredBaseModel):
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    kind: WebviewMessageKindEnum = Field(default=..., json_schema_extra = { "linkml_meta": {'domain_of': ['ProvRecord',
                       'AgentRef',
                       'TrackProperties',
                       'AnnotationProperties',
                       'SensorObservationsProperties',
                       'PlotProperties',
                       'ParameterDeclaration',
                       'KnownStore',
                       'WebviewMessage']} })
    plot: Optional[DebriefFeatureCollection] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['Selection', 'WebviewMessage']} })
    plot_title: Optional[str] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    hidden_count: Optional[int] = Field(default=None, description="""How many of the plot's features are hidden on the map (SUB-22), so the map can say so.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    selection: Optional[Selection] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange', 'WebviewMessage']} })
    viewport: Optional[Viewport] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['SharedState', 'SharedStateChange', 'WebviewMessage']} })
    time: Optional[TimeState] = Field(default=None, json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
                       'AnnotationSpec',
                       'SharedState',
                       'SharedStateChange',
                       'WebviewMessage']} })
    saved_window: Optional[TimeRange] = Field(default=None, description="""The time window as saved in the plot, so the time controller can say when the window shown differs from it (CAP-28).""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    context_tracks: Optional[ContextTracksEnum] = Field(default=None, description="""How tracks outside the time window are drawn (CAP-29).""", json_schema_extra = { "linkml_meta": {'domain_of': ['PlotView', 'WebviewMessage']} })
    minimum_context_contrast: Optional[bool] = Field(default=None, description="""The analyst's setting that shows faint context tracks as visible, so the time controller can say so.""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })
    time_range: Optional[TimeRange] = Field(default=None, description="""The plot's period, so times can be entered as the analyst reads them (show_form) and the time window set within it (show_time); or the time window to save (window_changed).""", json_schema_extra = { "linkml_meta": {'domain_of': ['AnnotationProperties',
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
    feature_id: Optional[str] = Field(default=None, description="""The annotation a form changes or deletes, or the map asks to change.""", json_schema_extra = { "linkml_meta": {'domain_of': ['WebviewMessage']} })

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


class PlotHistory(ConfiguredBaseModel):
    """
    A plot's whole history, kept in its plot file as the top-level member history (decision 13 Oct). Steps are numbered from 1 with no gaps, in the order they were made.
    """
    linkml_meta: ClassVar[LinkMLMeta] = LinkMLMeta({'from_schema': 'https://debrief.info/schemas/debrief'})

    current: int = Field(default=..., description="""The step the plot's content reflects; 0 for none (an empty plot). Never an abandoned step.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState', 'PlotHistory', 'HistoryHead']} })
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
    added: Optional[list[Union[AnnotationFeature, PlotFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, description="""Features added. A whole-plot feature here never carries its view: the island is not content (SUB-22).""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'PlotFeature'}],
         'domain_of': ['HistoryStep', 'Delta']} })
    modified: Optional[list[Union[AnnotationFeature, PlotFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, description="""Features changed, in full, replacing those with the same id.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
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
    added: Optional[list[Union[AnnotationFeature, PlotFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, description="""Features added, never with the whole-plot feature's view.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
                    {'range': 'PlotFeature'}],
         'domain_of': ['HistoryStep', 'Delta']} })
    modified: Optional[list[Union[AnnotationFeature, PlotFeature, SensorObservationsFeature, TrackFeature]]] = Field(default=None, description="""Features changed, in full, replacing those with the same id.""", json_schema_extra = { "linkml_meta": {'any_of': [{'range': 'TrackFeature'},
                    {'range': 'AnnotationFeature'},
                    {'range': 'SensorObservationsFeature'},
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
    current: int = Field(default=..., description="""Sequence number of the last delta the plot reflects; 0 for none.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['TimeState', 'PlotHistory', 'HistoryHead']} })
    latest: int = Field(default=..., description="""Highest sequence number written.""", ge=0, json_schema_extra = { "linkml_meta": {'domain_of': ['HistoryHead']} })
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
TrackFeature.model_rebuild()
TrackProperties.model_rebuild()
TrackStyle.model_rebuild()
AnnotationFeature.model_rebuild()
AnnotationProperties.model_rebuild()
AnnotationAppearance.model_rebuild()
AnnotationSpec.model_rebuild()
SensorObservationsFeature.model_rebuild()
SensorObservationsProperties.model_rebuild()
PayloadRef.model_rebuild()
InnerSchemaRef.model_rebuild()
PayloadColumn.model_rebuild()
PlotFeature.model_rebuild()
PlotProperties.model_rebuild()
PlotView.model_rebuild()
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
UserConfig.model_rebuild()
KnownStore.model_rebuild()
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
