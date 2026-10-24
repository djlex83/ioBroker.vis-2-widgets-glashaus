/* Injects the Glashaus stylesheet and the bundled fonts once per page.
 * The fonts ship with the widget set (no request to Google Fonts), the CSS is scoped to `.gh`. */
import css from './glashaus.css?inline';
import geist400 from '@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff2?url';
import geist500 from '@fontsource/geist-sans/files/geist-sans-latin-500-normal.woff2?url';
import geist600 from '@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff2?url';
import serifItalic from '@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?url';
import serifItalicExt from '@fontsource/instrument-serif/files/instrument-serif-latin-ext-400-italic.woff2?url';
import serifNormal from '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url';

const STYLE_ID = 'glashaus-widgets-style';
const LATIN =
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
    'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

function face(family: string, url: string, weight: number, style: string, range: string): string {
    return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;src:url(${JSON.stringify(url)}) format('woff2');unicode-range:${range}}`;
}

/** Adds the stylesheet and the font-face rules to the document head (only the first call does something) */
export function ensureGlashausStyle(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const fonts = [
        face('Geist', geist400, 400, 'normal', LATIN),
        face('Geist', geist500, 500, 'normal', LATIN),
        face('Geist', geist600, 600, 'normal', LATIN),
        face('Instrument Serif', serifItalic, 400, 'italic', LATIN),
        face('Instrument Serif', serifItalicExt, 400, 'italic', LATIN_EXT),
        face('Instrument Serif', serifNormal, 400, 'normal', LATIN),
    ].join('\n');
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `${fonts}\n${css}`;
    document.head.appendChild(el);

    // Glass sheen follows the pointer
    window.addEventListener(
        'pointermove',
        e => {
            const t = e.target as HTMLElement | null;
            const g = t?.closest?.('.gh-glass') as HTMLElement | null;
            if (!g) {
                return;
            }
            const r = g.getBoundingClientRect();
            g.style.setProperty('--gh-mx', `${e.clientX - r.left}px`);
            g.style.setProperty('--gh-my', `${e.clientY - r.top}px`);
        },
        { passive: true },
    );
}

/** Injects the CSS of one widget once (element id `gh-css-<name>`) */
export function ensureWidgetCss(name: string, css: string): void {
    const id = `gh-css-${name}`;
    if (typeof document === 'undefined' || document.getElementById(id)) {
        return;
    }
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
}
