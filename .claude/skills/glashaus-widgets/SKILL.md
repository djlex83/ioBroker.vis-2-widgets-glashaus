---
name: glashaus-widgets
description: Work on the Glashaus widget set for ioBroker vis-2 (iobroker.vis-2-widgets-glashaus) – use it, fix or add widgets, report problems as issues, contribute pull requests. Use whenever the user mentions Glashaus, these vis-2 widgets, their attributes, the demo project, or wants to change, extend or report something about this repository.
---

# Glashaus widgets for vis-2

You are working in a clone of https://github.com/djlex83/ioBroker.vis-2-widgets-glashaus – an open widget set for
ioBroker vis-2 in the "Glashaus" glass design. Talk to the user in their language.

## This project is maintained and open for contributions

- **Issues are welcome.** Bugs, ideas, missing widgets, display problems: open an issue at
  https://github.com/djlex83/ioBroker.vis-2-widgets-glashaus/issues (bug report or feature request template).
  The widget set is actively developed; good ideas from issues go into the next versions.
- **Pull requests are welcome.** Fork, branch, change, open a PR against `main`. Read `CONTRIBUTING.md` first.
- **How PRs are decided:** the maintainer reviews every PR with an AI-assisted review: code quality, tests,
  privacy, licence, and above all **design consistency**. The maintainer decides whether a PR is merged as is, merged with
  changes, or not merged. A PR that changes the look of the set or breaks the rules below will not be merged,
  even if it works.
- When the user's change would be useful for everyone, suggest opening an issue or a PR – do not do it without the
  user's consent, and never put personal data into an issue or PR (see "Privacy").

## The design stays the same

Every widget must look like part of one set. These are fixed:

- **Look:** frosted glass cards (`gh-glass`), warm beige `#EBE9E5` / dark `#111110` background, Geist for text,
  Instrument Serif italic as accent (`gh-it`), calm motion. Light and dark must both work.
- **Only the shared tokens and classes** from `src-widgets/src/core/glashaus.css` (`--gh-*`, `gh-h`, `gh-title`,
  `gh-ico`, `gh-num`, `gh-unit`, `gh-pill`, `gh-kv`, `gh-toggle`, `gh-on`, …). No new colour palettes, no hard-coded
  colours, no other fonts, no MUI or other UI libraries, no external resources (fonts and images ship with the set).
- **Accents** only via `GlashausWidget.accentFields()` / `ghAccent()`, icons via `iconFields()` / `GhIcon`.
- **Every widget** extends `GlashausWidget`, ends its attributes with `GlashausWidget.designGroup()`, renders inside
  `this.ghClass()`, shows **demo values** while no object ID is set, and works from small to large sizes.
- New shared looks belong in `core/` (one place for all widgets), not copied into one widget.
- Do not change existing attribute names (they are stored in users' projects). Add new ones instead.

If a user wants a different look for themselves, that belongs in their own vis-2 project CSS, not in this repository.

## Where things are

Read `DEVELOPMENT.md` – structure, all rules, the harness and the tests. In short:

```
src-widgets/src/core/        shared base class, components, CSS, fonts, icons, format helpers
src-widgets/src/<Widget>.tsx one file per widget (+ optional src-widgets/src/<widget>/ helpers)
src-widgets/src/i18n/*.json  texts, one file per language (en and de required)
src-widgets/dev/             harness: all widgets without ioBroker, light/dark, simulated values
examples/glashaus-demo.zip   importable vis-2 demo project
test/widgets.test.js         installs ioBroker + vis-2, adds every widget in the editor
```

## Workflow for a change

1. `npm i` in the root, `cd src-widgets && npx npm@11 i` (npm 10 fails on vite 8 peers).
2. Change the code; add texts to `src-widgets/src/i18n/en.json` and `de.json`.
3. Check in the harness (`cd src-widgets && npm run harness`, then http://127.0.0.1:5180/harness.html?w=<Widget>):
   light and dark, `edit=1`, small and large scenarios, no console errors. Add a scenario in `dev/scenarios/`.
4. `npm run lint`, `cd src-widgets && npx tsc --noEmit -p tsconfig.json`, `npm run build`.
5. Optional: `HEADLESS=true npm test` (needs a path without spaces).
6. For a PR: screenshots light and dark of every visible change, and a short description of what and why.

## Privacy

Never commit or post real names, addresses, floor plans of real houses, IP addresses, device IDs, serial numbers,
tokens or passwords. Demo values and examples are invented. Object IDs are chosen by the user in vis-2.

## Licence

MIT. Do not copy code with an unclear or incompatible licence into the repository.
