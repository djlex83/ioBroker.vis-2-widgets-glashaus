import type { Scenario } from '../scenario';

/* Simulated snapshot: an invented garden scene as SVG data URI, the sun and a clock move with the harness time */
function garden(t: number): string {
    const d = new Date(t);
    const p = (n: number): string => String(n).padStart(2, '0');
    const sx = 80 + ((t / 1000) % 60) * 8;
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">' +
        '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9c4dc"/><stop offset="1" stop-color="#ece6d8"/></linearGradient></defs>' +
        '<rect width="640" height="200" fill="url(#s)"/>' +
        `<circle cx="${sx.toFixed(0)}" cy="70" r="22" fill="#fff3c9"/>` +
        '<path d="M0 170 Q120 120 240 160 T480 150 T640 160 V360 H0Z" fill="#8ea676"/>' +
        '<path d="M0 230 Q160 205 320 225 T640 220 V360 H0Z" fill="#7b955f"/>' +
        '<rect x="420" y="120" width="120" height="80" fill="#ece7de"/><path d="M410 124 L480 84 L550 124Z" fill="#b9654a"/>' +
        '<rect x="440" y="140" width="22" height="20" fill="#5d6c78"/><rect x="496" y="140" width="22" height="20" fill="#5d6c78"/>' +
        '<g fill="#5f7a4c"><circle cx="90" cy="190" r="34"/><circle cx="130" cy="176" r="28"/><circle cx="300" cy="196" r="24"/></g>' +
        '<rect x="0" y="300" width="640" height="60" fill="#a9a398"/>' +
        `<text x="22" y="34" font-family="monospace" font-size="15" font-weight="600" fill="#fff">${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}</text>` +
        '<text x="618" y="342" font-family="monospace" font-size="13" font-weight="600" fill="#fff" text-anchor="end">CAM 2</text>' +
        '</svg>';
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default [
    { widget: 'GlashausCamera', name: 'demo', w: 480, h: 330 },
    {
        widget: 'GlashausCamera',
        name: 'oid-motion',
        w: 480,
        h: 330,
        data: {
            title: 'Garten',
            oid: 'harness.0.cam.garden.image',
            oidMotion: 'harness.0.cam.garden.motion',
            accent: 'batt',
        },
        states: {
            'harness.0.cam.garden.image': { val: t => garden(t), type: 'string' },
            'harness.0.cam.garden.motion': { val: t => Math.floor(t / 8000) % 2 === 0, type: 'boolean' },
        },
    },
    {
        widget: 'GlashausCamera',
        name: 'url-refresh-contain',
        w: 420,
        h: 300,
        data: {
            title: 'Hof',
            url: '{harness.0.cam.yard.url}',
            refresh: 3,
            fit: 'contain',
        },
        states: {
            'harness.0.cam.yard.url': { val: t => garden(Math.floor(t / 10000) * 10000), type: 'string' },
        },
    },
    {
        widget: 'GlashausCamera',
        name: 'error',
        w: 360,
        h: 250,
        data: { title: 'Haustür', url: '/harness.html', refresh: 10 },
    },
    {
        widget: 'GlashausCamera',
        name: 'offline',
        w: 300,
        h: 200,
        data: { title: 'Terrasse', oid: 'harness.0.cam.missing.image' },
    },
    {
        widget: 'GlashausCamera',
        name: 'small',
        w: 220,
        h: 130,
        data: {},
    },
    {
        widget: 'GlashausCamera',
        name: 'large-motion',
        w: 760,
        h: 470,
        data: {
            title: 'Einfahrt',
            oidMotion: 'harness.0.cam.drive.motion',
            refresh: 0,
            showTime: true,
        },
        states: {
            'harness.0.cam.drive.motion': { val: true, type: 'boolean' },
        },
    },
] satisfies Scenario[];
