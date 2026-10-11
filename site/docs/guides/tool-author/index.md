# Tool-author guide

**North Star:** a scientist's first tool should take an afternoon.

For scientists writing their own analysis tools (DEV-09, OUT-06). A tool is a Python file: it declares what it applies to and what parameters it needs, and Debrief builds its form and offers it when it applies, without being rebuilt (TL-05, NFR-08).

*Drafted in Phase 1 from the team's experience writing the first tools, and tested by a scientist building a real tool in Phase 5.* It will cover:

- **Tool declarations** (TL-04, TL-06): name, explanation, the feature kinds the tool applies to, its parameters and its outputs. The schema already defines these; see `schemas/linkml/tools.yaml`.
- **Debrief data types** (TL-09): tracks, annotations, sensor observations, quantities with units.
- **User-facing explanations** (CAP-24), following the [language section](../style-guide/language.md) of the style guide.
- **Results** (TL-11): new features, changes, non-spatial results and named sets.
- **Randomness and replay** (SUB-20): declare it, and Debrief records the seed.
- **Running in the browser** (CON-09): use pure-Python libraries, or ones in Pyodide.
