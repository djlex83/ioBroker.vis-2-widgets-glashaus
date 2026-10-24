# Developing Glashaus widgets

This widget set is a normal ioBroker vis-2 widget adapter (React 19, TypeScript, vite + `@module-federation/vite`).
It follows the official template [ioBroker.vis-2-widgets-react-template](https://github.com/ioBroker/ioBroker.vis-2-widgets-react-template).

```
io-package.json              adapter description; common.visWidgets.vis2GlashausWidgets.components = list of widgets
tasks.ts                     npm run build: tsc + vite build of src-widgets/, copies the result to widgets/
src-widgets/
  vite.config.ts             reads the widget list from io-package.json and exposes src/<Name>.tsx for each
  src/core/                  shared code, used by every widget
    GlashausWidget.tsx       base class (extends window.visRxWidget)
    components.tsx           GhIcon, GhIconBox, GhNumber, GhRing, GhSpark (line chart), GhBars, GhPill
    glashaus.css             all styles, scoped to `.gh`; tokens --gh-*; `.gh-dark` switches to dark
    style.ts                 injects the CSS and the bundled fonts (Geist, Instrument Serif) once
    format.ts                toNum, toBool, fmtNum, fmtPower, fmtDuration, fmtTime, fmtDate, clamp
    icons.ts                 45 line icons (ICONS, ICON_NAMES)
  src/<Name>.tsx             one widget per file, default export
  src/i18n/<lang>.json       all texts, one file per language (en, de, ru, pt, nl, fr, it, es, pl, uk, zh-cn)
  src/translations.ts        loads the 11 files (missing keys fall back to English)
  public/img/                set icon and preview images (prev_<name>.png) of the palette
  dev/                       harness: every widget without ioBroker, with simulated values (npm run harness)
test/widgets.test.js         installs js-controller + web + vis-2, opens the editor and adds every widget
```

## Adding a widget

1. Add the name (e.g. `GlashausFoo`) to `common.visWidgets.vis2GlashausWidgets.components` in `io-package.json`.
2. Create `src-widgets/src/GlashausFoo.tsx`. Copy the structure of `GlashausValue.tsx`:
    - `export default class GlashausFoo extends GlashausWidget<FooRxData, FooState>`
    - `static getWidgetInfo()` with `id: 'tplGlashausFoo'`, `visSet: ADAPTER`, `visName`, `visWidgetLabel`, `visAttrs`,
      `visDefaultStyle`, `visPrev: 'widgets/vis-2-widgets-glashaus/img/prev_foo.png'`.
      The last group is always `GlashausWidget.designGroup()`.
    - `getWidgetInfo()` (instance) returns the static one.
    - `renderWidgetBody(props)` calls `this.ghRenderStart(props)` first and returns
      `<div className={this.ghClass()}>…</div>` (glass card, theme, fade-in).
3. Add all labels used in `visAttrs` and in the widget to `src-widgets/src/i18n/en.json` and `de.json`
   (keys with a short widget prefix, e.g. `foo_title`). The other languages fall back to English until translated.
4. Create `src-widgets/dev/scenarios/GlashausFoo.ts` (demo + realistic scenarios) and check it in the harness.
5. Create the preview `src-widgets/public/img/prev_foo.png` (see below).

## Rules

- **Generic.** Nothing in this repository refers to a real house, person, address, device ID or IP address.
  Object IDs are chosen by the user in the editor. Demo values and example texts are invented.
- **Demo values.** Every widget looks alive before IDs are configured: unset IDs show plausible demo values
  (`this.ghNum(id, demo)`), and `this.ghDemoBadge(true)` marks it in the editor.
- **Look.** Use only the `--gh-*` tokens and the classes of `glashaus.css` (`gh-h`, `gh-title`, `gh-ico`, `gh-num`,
  `gh-unit`, `gh-big`, `gh-muted`, `gh-small`, `gh-it`, `gh-eyebrow`, `gh-pill`, `gh-kv`, `gh-sep`, `gh-ink`,
  `gh-outline`, `gh-circ`, `gh-toggle`, `gh-on`, …). Widget-specific CSS goes into the widget file as a string that
  is injected once (id `gh-css-<name>`), with class names prefixed `gh-<name>-`. No MUI, no other UI library.
  Both themes must work: never hard-code a light-only color; for canvas drawing read colors from the theme
  (`this.ghDark()`) or with `getComputedStyle(el).getPropertyValue('--gh-…')`.
- **Accent colors** come from `GlashausWidget.accentFields()` / `this.ghAccent()` (CSS variables that follow the theme).
- **Icons** from `GlashausWidget.iconFields()` / `this.ghIcon()` and `<GhIcon>` / `<GhIconBox>`.
- **Values.** Attributes of type `id` are subscribed by vis-2; read them with `this.ghVal(id)` / `this.ghNum(id)`.
  IDs inside JSON or other text attributes must be subscribed with `this.ghSubscribe(ids, cb)` (released automatically).
  Write with `this.ghSet(id, value)` (does nothing in the editor). Numbers may arrive as strings, booleans as
  `'true'`: use `toNum`, `toBool`, `isTrue`.
- **History.** `this.ghHistory(id, { start, end, aggregate, step | count })` returns `[{ ts, val }]`. Offer an
  `instance` field (`type: 'instance', adapter: '_dataSources'`) named `history`. Refresh at most every few minutes.
  Catch errors and show `GlashausWidget.tr('no_data')`.
- **Resources.** Every timer, interval, `requestAnimationFrame`, observer and listener is removed in
  `componentWillUnmount`. Animations stop when nothing moves, when the tab is hidden, and respect
  `prefers-reduced-motion`. Canvas size follows the widget size (ResizeObserver) and the device pixel ratio (max 2).
- **Editor.** In `this.props.editMode` nothing is written and pointer gestures that would fight with the editor
  (dragging inside the widget) are off.
- **Texts.** Labels in `visAttrs` are i18n keys without prefix (vis-2 adds `vis-2-widgets-glashaus_`). Option lists:
  `options: [{ value, label: '<key>' }]` (translated) or `noTranslation: true`. In code use
  `GlashausWidget.tr('<key>')`. Field type `help` needs the full key `vis-2-widgets-glashaus_<key>` in `text`.
  Write English and German; the other languages fall back to English until translated.
- **Attribute names** are camelCase, unique per widget, and stay stable once released (they are stored in projects).
- **Size.** `visDefaultStyle` gives a sensible default size. The widget must look right from small to large
  sizes (use container-relative layout, `min-width: 0`, ellipsis for long texts).
- **Lint and types.** `npx tsc --noEmit -p tsconfig.json` and `npx eslint -c eslint.config.mjs src/` in `src-widgets`
  must pass (`--fix` handles formatting).

## Requirements

Node.js 22 or newer. Install the widget sources with **npm 11**: npm 10 stops in `src-widgets` with
"Cannot read properties of null (reading 'edgesOut')" (a bug with the optional peer dependencies of vite 8).

```bash
npm i                                # root: build tools, test helper (puppeteer downloads Chrome here)
cd src-widgets && npx npm@11 i       # widget sources
```

## Harness (no ioBroker needed)

```bash
cd src-widgets
npm run harness                     # http://127.0.0.1:5180/harness.html
```

`dev/mockVis.tsx` provides `window.visRxWidget`, simulated object IDs, a socket mock with synthetic history and the
translations. Every scenario of `dev/scenarios/*.ts` is shown in light and dark.
URL parameters: `w=<Widget>`, `s=<scenario>`, `theme=light|dark`, `edit=1` (editor mode), `lang=en`, `solo=1`.
`window.__harness.store.set(id, value)` changes a simulated value from the browser console.

Screenshots (puppeteer from the root `node_modules`):

```bash
node dev/shot.mjs "http://127.0.0.1:5180/harness.html?w=GlashausValue" out.png 3000 1500
# preview for the palette: one scenario, light, without labels, only the widget element
node dev/shot.mjs "http://127.0.0.1:5180/harness.html?w=GlashausValue&s=demo&theme=light&solo=1" public/img/prev_value.png 3000 900 ".sc .vis-widget"
```

`shot.mjs` prints console errors and exits with 1 if the page logged errors.

Several harness servers can run at the same time with `PORT=518x GH_CACHE=../node_modules/.vite-harness-x npm run harness`.

## Build and test in real vis-2

```bash
npm run build                       # widgets/vis-2-widgets-glashaus/
HEADLESS=true npm test              # installs ioBroker into tmp/, screenshots in tmp/screenshots/
```

The test helper (`@iobroker/vis-2-widgets-testing`) fails when the path of the repository contains a space.
Copy the repository (without `src-widgets/`) to a path without spaces and run the test there.

A local ioBroker with web, vis-2 and this widget set that keeps running (editor at `http://127.0.0.1:18082/vis-2/edit.html`):

```bash
npm run build && node test/devVis.js
```

`src-widgets/dev/visshot.mjs` takes screenshots of a vis-2 runtime page in light or dark (used for the README pictures).
The demo project lives in `examples/glashaus-demo/` (vis-views.json); `examples/glashaus-demo.zip` is the same as an
importable zip (files at the root of the archive).

To try it in your own ioBroker: `npm pack`, then install the `.tgz` with
`iobroker url /path/to/iobroker.vis-2-widgets-glashaus-x.y.z.tgz` and restart vis-2.
