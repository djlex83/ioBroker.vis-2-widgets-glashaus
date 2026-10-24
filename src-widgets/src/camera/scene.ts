/* Demo picture of the camera widget: a calm, invented view from under a carport roof over a paved driveway to the
 * street, a house across the street and the sky. Drawn into a canvas and returned as data URL (no external image).
 * Day palette in the light theme, night palette (lit windows, lamp) in the dark theme. */
import { localeOf } from '../core/format';

const W = 640;
const H = 360;

interface Pal {
    sky0: string;
    sky1: string;
    cloud: string;
    far: string;
    roof: string;
    wall: string;
    win: string;
    winFrame: string;
    hedge1: string;
    hedge2: string;
    lawn: string;
    street: string;
    dash: string;
    curb: string;
    pave: string;
    joint: string;
    post: string;
    postEdge: string;
    beam: string;
    glow: string;
    glowR: number;
    car: string;
    hood: string;
    grain: number;
}

const DAY: Pal = {
    sky0: '#b9cde0',
    sky1: '#e9e4d9',
    cloud: 'rgba(255,255,255,.62)',
    far: '#93a383',
    roof: '#b9654a',
    wall: '#ece7de',
    win: '#5d6c78',
    winFrame: '#ffffff',
    hedge1: '#5f7a4c',
    hedge2: '#6f8a58',
    lawn: '#8c9f72',
    street: '#55585c',
    dash: 'rgba(255,255,255,.55)',
    curb: '#9b968d',
    pave: '#a9a398',
    joint: 'rgba(70,62,52,.22)',
    post: '#f3f1ec',
    postEdge: '#c9c4ba',
    beam: '#2b2a28',
    glow: 'rgba(255,190,110,.28)',
    glowR: 220,
    car: '#3d5f94',
    hood: '#3a4048',
    grain: 0.06,
};

const NIGHT: Pal = {
    sky0: '#0f1522',
    sky1: '#2a2f3b',
    cloud: 'rgba(160,170,190,.12)',
    far: '#1b221c',
    roof: '#3b2c27',
    wall: '#56534d',
    win: '#e8b964',
    winFrame: '#6d6a63',
    hedge1: '#1e291b',
    hedge2: '#243120',
    lawn: '#20291d',
    street: '#25272b',
    dash: 'rgba(255,255,255,.22)',
    curb: '#4b4943',
    pave: '#57534b',
    joint: 'rgba(0,0,0,.32)',
    post: '#77746d',
    postEdge: '#4d4a44',
    beam: '#121211',
    glow: 'rgba(255,186,100,.5)',
    glowR: 260,
    car: '#2c4570',
    hood: '#1d2127',
    grain: 0.09,
};

/** Small deterministic random generator */
function rng(seed: number): () => number {
    let s = seed >>> 0 || 1;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function poly(g: CanvasRenderingContext2D, pts: [number, number][], fill?: string, stroke?: string, lw = 1): void {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    if (fill) {
        g.fillStyle = fill;
        g.fill();
    }
    if (stroke) {
        g.strokeStyle = stroke;
        g.lineWidth = lw;
        g.stroke();
    }
}

function car(g: CanvasRenderingContext2D, x: number, y: number, s: number, p: Pal, night: boolean): void {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath();
    g.ellipse(0, 30, 66, 10, 0, 0, 7);
    g.fill();
    g.fillStyle = p.car;
    g.beginPath();
    g.roundRect(-62, -10, 124, 40, 12);
    g.fill();
    g.beginPath();
    g.moveTo(-44, -10);
    g.lineTo(-30, -42);
    g.lineTo(30, -42);
    g.lineTo(44, -10);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(25,32,40,.85)';
    g.beginPath();
    g.moveTo(-38, -12);
    g.lineTo(-26, -38);
    g.lineTo(26, -38);
    g.lineTo(38, -12);
    g.closePath();
    g.fill();
    g.fillStyle = night ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.25)';
    g.beginPath();
    g.moveTo(-26, -38);
    g.lineTo(-6, -38);
    g.lineTo(-22, -14);
    g.lineTo(-34, -14);
    g.closePath();
    g.fill();
    g.fillStyle = '#1c1d20';
    g.fillRect(-56, 22, 18, 12);
    g.fillRect(38, 22, 18, 12);
    for (const sx of [-46, 46]) {
        g.fillStyle = night ? '#8f8b80' : '#d9d4c8';
        g.beginPath();
        g.ellipse(sx, 2, 11, 6, 0, 0, 7);
        g.fill();
    }
    g.fillStyle = night ? '#bdbab2' : '#f4f4f0';
    g.fillRect(-20, 12, 40, 11);
    g.fillStyle = '#24408f';
    g.fillRect(-20, 12, 5, 11);
    g.restore();
}

function scene(g: CanvasRenderingContext2D, p: Pal, night: boolean, seed: number): void {
    const r = rng(7);
    /* sky */
    const sky = g.createLinearGradient(0, 0, 0, 140);
    sky.addColorStop(0, p.sky0);
    sky.addColorStop(1, p.sky1);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, 150);
    if (night) {
        for (let i = 0; i < 40; i++) {
            g.fillStyle = `rgba(255,255,255,${(0.25 + r() * 0.5).toFixed(2)})`;
            g.fillRect(r() * W, 20 + r() * 70, 1.2, 1.2);
        }
        g.fillStyle = 'rgba(240,236,220,.9)';
        g.beginPath();
        g.arc(268, 44, 9, 0, 7);
        g.fill();
    }
    /* clouds drift a little between pictures */
    const drift = (seed % 600) / 20;
    for (const [cx, cy, s] of [
        [110, 52, 1],
        [250, 36, 0.8],
        [470, 24, 0.7],
    ] as [number, number, number][]) {
        g.fillStyle = p.cloud;
        for (let k = 0; k < 5; k++) {
            g.beginPath();
            g.ellipse(cx + drift + (k - 2) * 16 * s, cy + (k % 2) * 4 * s, 22 * s, 10 * s, 0, 0, 7);
            g.fill();
        }
    }
    /* trees on the horizon */
    for (let i = 0; i < 18; i++) {
        g.fillStyle = p.far;
        g.beginPath();
        g.arc(10 + i * 17, 92 - Math.abs(Math.sin(i * 1.3)) * 14, 12 + (i % 3) * 4, 0, 7);
        g.fill();
    }
    /* house across the street */
    poly(
        g,
        [
            [300, 30],
            [640, 6],
            [640, 34],
            [300, 44],
        ],
        p.roof,
    );
    g.fillStyle = p.wall;
    g.fillRect(300, 42, 340, 40);
    for (const x of [360, 440, 520, 600]) {
        g.fillStyle = p.win;
        g.fillRect(x, 50, 26, 22);
        g.strokeStyle = p.winFrame;
        g.lineWidth = 2;
        g.strokeRect(x, 50, 26, 22);
        if (night) {
            const wg = g.createRadialGradient(x + 13, 61, 2, x + 13, 61, 34);
            wg.addColorStop(0, 'rgba(255,200,110,.35)');
            wg.addColorStop(1, 'rgba(255,200,110,0)');
            g.fillStyle = wg;
            g.fillRect(x - 24, 26, 74, 70);
        }
    }
    /* hedge */
    for (let i = 0; i < 26; i++) {
        g.beginPath();
        g.arc(420 + i * 9, 80 + Math.sin(i * 1.7) * 4, 9 + (i % 3) * 2, 0, 7);
        g.fillStyle = i % 2 ? p.hedge1 : p.hedge2;
        g.fill();
    }
    /* street, center line, curb */
    poly(
        g,
        [
            [230, 100],
            [640, 76],
            [640, 124],
            [212, 140],
        ],
        p.street,
    );
    g.strokeStyle = p.dash;
    g.lineWidth = 1.2;
    g.setLineDash([14, 12]);
    g.beginPath();
    g.moveTo(240, 120);
    g.lineTo(640, 100);
    g.stroke();
    g.setLineDash([]);
    poly(
        g,
        [
            [212, 140],
            [640, 124],
            [640, 128],
            [212, 144],
        ],
        p.curb,
    );
    poly(
        g,
        [
            [0, 104],
            [230, 100],
            [212, 144],
            [0, 236],
        ],
        p.lawn,
    );
    /* driveway with pavers */
    poly(
        g,
        [
            [212, 144],
            [640, 128],
            [640, 360],
            [0, 360],
            [0, 236],
        ],
        p.pave,
    );
    for (let row = 0; row < 14; row++) {
        const y = 150 + Math.pow(row / 13, 1.6) * 210;
        const s = 0.25 + (y - 140) / 220;
        const x0 = lerp(212, 0, (y - 144) / 216) - 20;
        for (let x = x0 + (row % 2) * 14 * s; x < 660; x += 28 * s) {
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + 7 * s, y - 4 * s);
            g.lineTo(x + 17 * s, y - 4 * s);
            g.lineTo(x + 24 * s, y);
            g.lineTo(x + 17 * s, y + 4 * s);
            g.lineTo(x + 7 * s, y + 4 * s);
            g.closePath();
            g.strokeStyle = p.joint;
            g.lineWidth = 0.8;
            g.stroke();
        }
    }
    /* drain cover */
    g.beginPath();
    g.ellipse(470, 226, 24, 7, -0.05, 0, 7);
    g.strokeStyle = night ? 'rgba(0,0,0,.4)' : 'rgba(60,55,48,.45)';
    g.lineWidth = 1.5;
    g.stroke();
    /* parked car */
    car(g, 300, 236, 0.9, p, night);
    /* carport post on the right, roof beam on top */
    poly(
        g,
        [
            [590, 0],
            [640, 0],
            [640, 360],
            [598, 360],
        ],
        p.post,
        p.postEdge,
    );
    for (let y = 40; y < 360; y += 30) {
        g.strokeStyle = 'rgba(0,0,0,.08)';
        g.beginPath();
        g.moveTo(598, y);
        g.lineTo(640, y - 2);
        g.stroke();
    }
    poly(
        g,
        [
            [0, 0],
            [640, 0],
            [640, 8],
            [0, 26],
        ],
        p.beam,
    );
    g.fillStyle = p.beam;
    g.fillRect(0, 0, 16, 360);
    /* warm lamp light */
    const gl = g.createRadialGradient(70, 330, 10, 70, 330, p.glowR);
    gl.addColorStop(0, p.glow);
    gl.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = gl;
    g.fillRect(0, 100, 340, 260);
    /* hood of the own car in the lower left corner */
    g.beginPath();
    g.moveTo(0, 268);
    g.bezierCurveTo(70, 272, 140, 296, 180, 360);
    g.lineTo(0, 360);
    g.closePath();
    g.fillStyle = p.hood;
    g.fill();
    g.beginPath();
    g.moveTo(0, 282);
    g.bezierCurveTo(60, 286, 112, 304, 142, 340);
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 3;
    g.stroke();
}

function osd(g: CanvasRenderingContext2D, now: number, label: string, lang: string): void {
    const d = new Date(now);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const txt = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}  ${d.toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;
    g.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    g.lineJoin = 'round';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.fillStyle = '#fff';
    g.textAlign = 'left';
    g.strokeText(txt, 30, 48);
    g.fillText(txt, 30, 48);
    if (label) {
        // camera names on the picture are short: a long title is cut
        const name = label.length > 24 ? `${label.slice(0, 23).trimEnd()}…` : label;
        g.textAlign = 'right';
        g.strokeText(name, 578, 344);
        g.fillText(name, 578, 344);
    }
}

let shared: HTMLCanvasElement | null = null;

/**
 * Draws the demo picture with `width` device pixels (16:9) and returns it as JPEG data URL.
 * `seed` changes the sensor noise and the cloud position, `now` is shown as on-screen time.
 */
export function demoPicture(width: number, night: boolean, now: number, label: string, lang: string): string {
    if (typeof document === 'undefined') {
        return '';
    }
    shared ||= document.createElement('canvas');
    const cv = shared;
    const w = Math.max(320, Math.min(1920, Math.round(width)));
    const h = Math.round((w * 9) / 16);
    if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
    }
    const g = cv.getContext('2d');
    if (!g) {
        return '';
    }
    const p = night ? NIGHT : DAY;
    const seed = Math.floor(now / 1000);
    g.setTransform(w / W, 0, 0, w / W, 0, 0);
    scene(g, p, night, seed);
    /* sensor noise */
    const r = rng(seed);
    for (let i = 0; i < 260; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${p.grain})` : `rgba(0,0,0,${p.grain})`;
        g.fillRect(r() * W, r() * H, 1.4, 1.4);
    }
    osd(g, now, label, lang);
    g.setTransform(1, 0, 0, 1, 0, 0);
    try {
        return cv.toDataURL('image/jpeg', 0.86);
    } catch {
        return '';
    }
}
