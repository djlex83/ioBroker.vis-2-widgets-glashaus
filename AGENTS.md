# Notes for AI coding assistants

This repository is the Glashaus widget set for ioBroker vis-2. Before you change anything, read
[`.claude/skills/glashaus-widgets/SKILL.md`](.claude/skills/glashaus-widgets/SKILL.md) and [`DEVELOPMENT.md`](DEVELOPMENT.md).

The short version:

- The project is maintained. Problems and ideas go into an **issue**, code into a **pull request** against `main`
  (see [`CONTRIBUTING.md`](CONTRIBUTING.md)). Ask the user before opening either.
- The maintainer reviews every pull request (AI-assisted) and decides whether it is merged.
- **The design must stay the same** across all widgets: shared tokens and classes from
  `src-widgets/src/core/glashaus.css`, glass cards, Geist + Instrument Serif, light and dark, demo values,
  no other UI libraries or external resources. Pull requests that change the look are not merged.
- Never add personal data (names, addresses, IPs, device IDs, tokens) to code, issues or pull requests.
