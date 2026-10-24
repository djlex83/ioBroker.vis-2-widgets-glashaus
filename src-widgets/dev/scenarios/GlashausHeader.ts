import type { Scenario } from '../scenario';

const de1 = (v: number): string => v.toFixed(1).replace('.', ',');

export default [
    // no attributes at all: greeting, example second line, example text and buttons
    { widget: 'GlashausHeader', name: 'demo', w: 840, h: 270 },
    {
        widget: 'GlashausHeader',
        name: 'live',
        w: 1100,
        h: 320,
        data: {
            eyebrow: 'text_date',
            eyebrowText: 'Familie',
            name: '{harness.0.hdr_name}',
            line2: '{harness.0.hdr_mood}',
            lede: 'Die Sonne liefert <b>{harness.0.hdr_pv} kW</b>. Batterie bei <b>{harness.0.hdr_soc} %</b>, Garage <b>zu</b>, Waschmaschine noch <b>{harness.0.hdr_wash} min</b>.',
            btnLabel1: 'Szenen öffnen',
            btnView1: 'Scenes',
            btnLabel2: 'Zur Energie',
            btnView2: 'Energy',
        },
        states: {
            'harness.0.hdr_name': { val: 'Sam', type: 'string' },
            'harness.0.hdr_mood': {
                val: t => (Math.floor(t / 6000) % 2 ? 'das Haus ist ruhig.' : 'alles im Fluss.'),
                type: 'string',
            },
            'harness.0.hdr_pv': { val: t => de1(2.4 + 0.6 * Math.sin(t / 9000)), type: 'string' },
            'harness.0.hdr_soc': { val: t => String(Math.round(80 + 15 * Math.sin(t / 30000))), type: 'string' },
            'harness.0.hdr_wash': { val: t => String(42 - (Math.floor(t / 2000) % 40)), type: 'string' },
        },
    },
    {
        widget: 'GlashausHeader',
        name: 'stacked-center',
        w: 640,
        h: 470,
        data: {
            layout: 'stacked',
            align: 'center',
            clock: 'time_date',
            eyebrow: 'none',
            name: 'Sam',
            greetEnd: '.',
            line2: 'Das Haus ist ruhig.',
            lede: 'Alle Fenster <b>zu</b>, Heizung im <b>Eco-Modus</b>.',
            btnCount: 1,
            btnLabel1: 'Zur Übersicht',
            btnView1: 'Home',
        },
    },
    {
        // very small, name bound to an ID without value, no text and no buttons
        widget: 'GlashausHeader',
        name: 'small-missing',
        w: 340,
        h: 170,
        data: {
            name: '{harness.0.hdr_missing}',
            lede: '',
            btnCount: 0,
        },
    },
    {
        // far too small: the headline shrinks to its minimum, the rest is clipped
        widget: 'GlashausHeader',
        name: 'tiny',
        w: 260,
        h: 96,
        data: { name: 'Alexandra', btnCount: 1, btnLabel1: 'Öffnen', btnView1: 'Home' },
    },
    {
        widget: 'GlashausHeader',
        name: 'fixed-right',
        w: 900,
        h: 240,
        data: {
            layout: 'stacked',
            align: 'right',
            headSize: 'fixed',
            headPx: 64,
            headMode: 'text',
            headline: 'Energie',
            line2: 'heute 12,1 kWh erzeugt.',
            eyebrow: 'text',
            eyebrowText: 'Übersicht',
            lede: '',
            btnCount: 0,
        },
    },
    {
        widget: 'GlashausHeader',
        name: 'large-clock',
        w: 1600,
        h: 460,
        data: {
            ghGlass: true,
            clock: 'time',
            eyebrow: 'text_date',
            eyebrowText: 'Zuhause',
            headMode: 'text',
            headline: 'Willkommen zu Hause',
            line2: 'alles im Fluss.',
            lede: 'Die Sonne liefert <b>{harness.0.hdr_pv} kW</b>. Batterie bei <b>{harness.0.hdr_soc} %</b>.',
            btnLabel1: 'Szenen öffnen',
            btnView1: 'Scenes',
            btnLabel2: 'Zur Energie',
            btnView2: 'Energy',
        },
    },
] satisfies Scenario[];
