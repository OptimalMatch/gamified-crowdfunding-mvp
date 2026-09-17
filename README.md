# Gamified crowdfunding: a draw anybody can recompute, and a crowd that ships: build kit

This folder is everything Claude Code needs to build a demo of this design on one machine.

1. Put the Unidatum release archive in this folder: `unidatum-<version>-linux-amd64.tar.gz` (or the zip), from your evaluation licence at https://www.unidatum.ie/en/pricing#evaluation.
2. Open this folder in Claude Code.
3. Say: **build it**.

Claude Code reads `CLAUDE.md`, asks the open questions once, and builds the MVP sheet section by section, one commit per section, with the checks as the tests and the demo script as the README of the repo it makes.

| File | What it is |
| --- | --- |
| `CLAUDE.md` | The prompt for the MVP on one machine with docker-compose |
| `CLAUDE-FULL.md` | The prompt for the real deployment, for later |
| `design.json` | The design, every level and the process view; open it in the studio at https://www.unidatum.ie/en/architect with Load JSON |
| `BUILD-SHEET.md` | The runbook for the real deployment |
| `MVP-SHEET.md` | The same design on one machine: services, scale, seed data, the demo script, the checks |
| `docker-compose.yml` | The draft from the MVP sheet, to edit |
| `checks/` | One stub per check in the MVP sheet |

Made by the Unidatum Design studio. Unidatum Integrated Products Limited, Ireland.
