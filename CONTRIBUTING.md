# Contributing

Thanks for helping with the Glashaus widgets. The project is actively developed – issues and pull requests are welcome.

## Issues

- **Bug:** use the bug report template. Tell us the vis-2 version, the widget, what you did, what you expected and
  what happened. A screenshot helps a lot.
- **Idea or new widget:** use the feature request template. Describe what you want to see and which data it uses.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Follow [`DEVELOPMENT.md`](DEVELOPMENT.md): structure, rules, harness, tests.
3. Check your change in the harness in light and dark, in the editor mode and at small and large sizes.
4. `npm run lint`, type check (`cd src-widgets && npx tsc --noEmit -p tsconfig.json`) and `npm run build` must pass.
5. Open the pull request with a short description and screenshots (light and dark) of every visible change.

### How pull requests are reviewed

The maintainer reviews every pull request, supported by an AI review: function, code quality, tests, privacy,
licence and design consistency. A pull request can be merged as is, merged after changes, or declined.
The decision is the maintainer's.

### The design stays consistent

All widgets must look like one set:

- only the shared tokens and classes from `src-widgets/src/core/glashaus.css` (`--gh-*`, `gh-glass`, `gh-pill`, …),
  no hard-coded colours, no other fonts, no MUI or other UI libraries, no external resources;
- every widget extends `GlashausWidget`, has the "Design" group, works in light and dark and shows demo values
  while no object ID is set;
- shared looks go into `core/`, not into one widget;
- existing attribute names are not renamed (users' projects store them).

Changes that alter the overall look of the set will not be merged. Your own styling belongs in your vis-2 project CSS.

### Please do not

- add personal data: real names, addresses, floor plans of real houses, IP addresses, device IDs, tokens, passwords;
- add code with an unclear or incompatible licence (the project is MIT);
- commit the built `widgets/` folder (it is created by the build).
