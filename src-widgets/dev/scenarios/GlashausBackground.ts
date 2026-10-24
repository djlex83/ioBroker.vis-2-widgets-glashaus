import type { Scenario } from '../scenario';

const KINDS = ['sun', 'fair', 'clouds', 'rain', 'storm', 'snow', 'fog', 'wind'];

/** Line drawing on a white background, for the "lines" image mode */
const SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 200"><rect width="500" height="200" fill="#fff"/>` +
        `<path d="M10 180 L120 60 L170 110 L240 30 L330 150 L380 110 L490 180" fill="none" stroke="#000" stroke-width="5" stroke-linejoin="round"/>` +
        `<circle cx="420" cy="55" r="26" fill="none" stroke="#000" stroke-width="5"/>` +
        `<path d="M10 180 H490" stroke="#000" stroke-width="3"/></svg>`,
)}`;

export default [
    { widget: 'GlashausBackground', name: 'demo', w: 700, h: 420 },
    {
        widget: 'GlashausBackground',
        name: 'live',
        w: 700,
        h: 420,
        data: { weatherOid: 'harness.0.weather', night: '{harness.0.night}', ambient: true },
        states: {
            'harness.0.weather': { val: t => KINDS[Math.floor(t / 6000) % KINDS.length], type: 'string', name: 'Weather' },
            'harness.0.night': { val: t => Math.floor(t / 12000) % 2 === 1, type: 'boolean', name: 'Night' },
        },
    },
    { widget: 'GlashausBackground', name: 'energy', w: 700, h: 380, data: { motif: 'energy', ambient: true } },
    { widget: 'GlashausBackground', name: 'heating', w: 700, h: 380, data: { motif: 'heating', bandTop: 4, bandBottom: 70 } },
    { widget: 'GlashausBackground', name: 'appliances', w: 700, h: 380, data: { motif: 'appliances' } },
    {
        widget: 'GlashausBackground',
        name: 'plan',
        w: 700,
        h: 380,
        data: { motif: 'plan', planFloor: 'upper', bandTop: 4, bandBottom: 90, text: 'Obergeschoss' },
    },
    { widget: 'GlashausBackground', name: 'image', w: 700, h: 320, data: { motif: 'image', image: SVG, imageColors: 'lines', text: 'Berge' } },
    { widget: 'GlashausBackground', name: 'phone', w: 390, h: 640, data: { weather: 'rain', bandTop: 4, bandBottom: 52 } },
    {
        widget: 'GlashausBackground',
        name: 'small-offline',
        w: 240,
        h: 150,
        data: { weatherOid: 'harness.0.weather_offline', density: 'low' },
    },
    { widget: 'GlashausBackground', name: 'system-theme', w: 480, h: 260, data: { motif: 'heating', ghTheme: 'system' } },
    { widget: 'GlashausBackground', name: 'word-only', w: 480, h: 160, data: { motif: 'none', text: 'Guten Abend', bg: 'transparent' } },
    {
        widget: 'GlashausBackground',
        name: 'long-texts',
        w: 360,
        h: 420,
        data: {
            motif: 'image',
            image: SVG,
            imageColors: 'lines',
            text: 'Donaudampfschifffahrt',
            hint: 'Mit dem Finger über die Berge streichen, dann formen sie sich neu',
        },
    },
    {
        widget: 'GlashausBackground',
        name: 'large',
        w: 700,
        h: 1000,
        data: { motif: 'driveway', weather: 'snow', night: true, density: 'high', bandTop: 5, bandBottom: 45 },
    },
] satisfies Scenario[];
