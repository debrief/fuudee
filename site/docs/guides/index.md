# Guides

Three guides keep Debrief consistent as it grows one pull request at a time.

| Guide | North Star (draft) | Owner |
| --- | --- | --- |
| All guides | An analyst who has learned one part of Debrief can predict the rest. | |
| [Style guide: language](style-guide/language.md) | Say what an analyst would say: plain British English, glossary terms, never software jargon. | Ian Mayo |
| [Style guide: theme and UI](style-guide/index.md) | Look native to VS Code; keep colour for what the data means. | Ian Mayo |
| [Interaction models](interaction-models/index.md) | Predictable and forgiving: the same gesture does the same thing everywhere, and nothing is silent or irreversible (SUB-21, SUB-28). | Ian Mayo |
| [Tool-author guide](tool-author/index.md) | A scientist's first tool should take an afternoon. | Ian Mayo |

The North Stars are drafts for the team to refine during Phase 0. Owners are provisional until the team is staffed.

## How the guides grow

- **A skeleton first.** Each guide's version 0 names every top-level section, including empty ones marked with the phase that will fill them. New material goes into a known place. Material that fits nowhere is flagged at review as either new territory or out of scope.
- **With the feature.** A guide is extended in the same pull request as the feature that needs it. The pull-request template asks.
- **Every entry cites what it serves.** An entry cites the principle or requirement behind it (for example PRN-08 or CAP-24). An entry that cannot cite one is a warning sign.
- **Read end to end at every phase exit.** Each owner reads their guide whole at the end of each phase, and resolves contradictions while they are few.

Automated checks for terminology and theme-token use arrive in Phase 1 (DEV-10).
