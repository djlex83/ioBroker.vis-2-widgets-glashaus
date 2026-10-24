/* Line drawings for the particle background (ported from the Glashaus dashboard, MIT).
 * Every motif draws onto a transparent canvas of 2000 × 800 pixels (narrow widgets: 1300 × 1080, the middle
 * part of the drawing) in the ink colors of the theme. The particle engine samples this canvas.
 * The houses and plans are an invented example house. */

export type Pt = [number, number];

/** Colors of one drawing */
export interface ArtOpts {
    dark: boolean;
    /** Lines */
    ink: string;
    /** Secondary lines */
    soft: string;
    /** Background color, covers lines behind clouds, the dormer and the moon */
    bg: string;
}

export type DrawFn = (g: CanvasRenderingContext2D, o: ArtOpts) => void;

export type MotifName = 'house' | 'energy' | 'heating' | 'appliances' | 'driveway' | 'plan';
export type PlanFloor = 'basement' | 'ground' | 'upper';
export type WeatherKind = 'sun' | 'fair' | 'clouds' | 'rain' | 'storm' | 'snow' | 'fog' | 'wind';

/** Weather in the house drawing */
export interface Weather {
    sky?: 'sun' | 'moon';
    clouds?: number;
    rain?: boolean;
    snow?: boolean;
    storm?: boolean;
    fog?: boolean;
    wind?: boolean;
    night?: boolean;
}

/** Ink colors of the drawings (the same as --gh-ink / --gh-ink-soft) */
export function artOpts(dark: boolean, bg?: string): ArtOpts {
    return {
        dark,
        ink: dark ? '#ece6da' : '#25241f',
        soft: dark ? '#a9a296' : '#7d776c',
        bg: bg || (dark ? '#111110' : '#ebe9e5'),
    };
}

type LineFn = (
    pts: Pt[],
    w?: number,
    col?: string,
    a?: number,
    close?: boolean,
    fill?: string | null,
    fa?: number,
) => void;

/** Deterministic random numbers (the drawings look the same every time) */
function seeded(seed: number): () => number {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function kit(g: CanvasRenderingContext2D, o: ArtOpts): { L: LineFn; rnd: () => number } {
    const L: LineFn = (pts, w = 4, col = o.ink, a = 1, close = false, fill = null, fa = 1) => {
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        if (close) {
            g.closePath();
        }
        if (fill) {
            g.globalAlpha = fa;
            g.fillStyle = fill;
            g.fill();
        }
        if (w > 0) {
            g.globalAlpha = a;
            g.lineWidth = w;
            g.strokeStyle = col;
            g.lineJoin = 'round';
            g.lineCap = 'round';
            g.stroke();
        }
        g.globalAlpha = 1;
    };
    return { L, rnd: seeded(7) };
}

/* ================= Weather ================= */

const WX: Record<string, Weather> = {
    sun: { sky: 'sun' },
    fair: { sky: 'sun', clouds: 1 },
    clouds: { clouds: 3 },
    rain: { clouds: 3, rain: true },
    storm: { clouds: 3, rain: true, storm: true },
    snow: { clouds: 2, snow: true },
    fog: { fog: true },
    wind: { clouds: 2, wind: true },
    sun_night: { sky: 'moon', night: true },
    fair_night: { sky: 'moon', clouds: 1, night: true },
};

/** Weather of the drawing for a kind (null = no weather) and day/night */
export function weatherOf(kind: WeatherKind | null, night: boolean): Weather | null {
    if (!kind) {
        return night ? { night: true } : null;
    }
    const k = night && WX[`${kind}_night`] ? `${kind}_night` : kind;
    const b = WX[k] || WX.fair;
    return { ...b, night: !!(b.night || night) };
}

/** OpenWeatherMap condition codes (200…804) */
function owmWeather(c: number): WeatherKind | null {
    if (c < 300) {
        return 'storm';
    }
    if (c < 600) {
        return 'rain';
    }
    if (c < 700) {
        return 'snow';
    }
    if (c === 771 || c === 781) {
        return 'wind';
    }
    if (c < 800) {
        return 'fog';
    }
    if (c === 800) {
        return 'sun';
    }
    return c <= 802 ? 'fair' : c <= 804 ? 'clouds' : null;
}

/**
 * Reads a weather value: keywords (English, German), WMO weather codes 0…99 (e.g. Open-Meteo `weather_code`)
 * or OpenWeatherMap condition codes 200…804
 */
export function parseWeather(v: unknown): WeatherKind | null {
    if (typeof v === 'number' || (typeof v === 'string' && /^\s*\d+\s*$/.test(v))) {
        const c = Number(v);
        if (c >= 200 && c <= 804) {
            return owmWeather(c);
        }
        if (c > 99) {
            return null;
        }
        if (c === 0) {
            return 'sun';
        }
        if (c === 1 || c === 2) {
            return 'fair';
        }
        if (c === 3) {
            return 'clouds';
        }
        if (c === 45 || c === 48) {
            return 'fog';
        }
        if ((c >= 71 && c <= 77) || c === 85 || c === 86) {
            return 'snow';
        }
        if (c >= 95) {
            return 'storm';
        }
        if ((c >= 50 && c <= 67) || (c >= 80 && c <= 82)) {
            return 'rain';
        }
        return null;
    }
    if (typeof v !== 'string') {
        return null;
    }
    const s = v
        .toLowerCase()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/[^a-z]/g, '');
    if (!s) {
        return null;
    }
    const has = (...words: string[]): boolean => words.some(w => s.includes(w));
    if (has('thunder', 'storm', 'gewitter', 'lightning', 'blitz')) {
        return 'storm';
    }
    if (has('snow', 'schnee', 'sleet', 'flurr', 'hail', 'hagel')) {
        return 'snow';
    }
    if (has('rain', 'regen', 'shower', 'schauer', 'drizzle', 'niesel')) {
        return 'rain';
    }
    if (has('fog', 'nebel', 'mist', 'haze', 'dunst')) {
        return 'fog';
    }
    if (has('wind', 'sturm', 'gust', 'boee')) {
        return 'wind';
    }
    if (has('fair', 'partly', 'heiter', 'leicht', 'mostlysun', 'teilweise', 'few', 'scattered')) {
        return 'fair';
    }
    if (has('cloud', 'wolk', 'overcast', 'bedeckt', 'bewoelkt')) {
        return 'clouds';
    }
    if (has('sun', 'sonn', 'clear', 'klar')) {
        return 'sun';
    }
    return null;
}

type MapFn = (x: number, y: number) => Pt;

interface WxZones {
    left: Pt;
    right: Pt;
    roof: Pt;
    roofTop: number;
    top: number;
    snow: Pt[][];
}

/** Free sky left/right of the house and above the roof, snow edges (house coordinates in meters) */
const ZU_WX: WxZones = {
    left: [-9, -4.6],
    right: [14.8, 21],
    roof: [-0.5, 13.5],
    roofTop: 10.3,
    top: 13,
    snow: [
        [
            [-0.5, 6.2],
            [0.6, 10.3],
            [12.4, 10.3],
            [13.5, 6.2],
        ],
        [
            [8.4, 8.9],
            [11.8, 8.9],
        ],
        [
            [11.9, 11.3],
            [12.4, 11.3],
        ],
        [
            [-4.35, 3.15],
            [0, 3.15],
        ],
        [
            [8.2, 3.9],
            [12.4, 3.9],
        ],
        [
            [6.2, 2.45],
            [8, 2.45],
        ],
    ],
};

function wxLayer(
    g: CanvasRenderingContext2D,
    o: ArtOpts,
    M: MapFn,
    s: number,
    L: LineFn,
    wx: Weather,
    phase: 'back' | 'front',
    Z: WxZones,
): void {
    const rnd = seeded(11);
    const sun = o.dark ? '#f0b453' : '#d8921f';
    const rainc = o.dark ? '#79b8e8' : '#3681bf';
    const snowc = o.dark ? '#f4f1ea' : '#ffffff';
    const snowEdge = o.dark ? '#cfd8e3' : '#9fb3c8';
    const circ = (x: number, y: number, r: number, fill: string, a: number): void => {
        const p = M(x, y);
        g.beginPath();
        g.arc(p[0], p[1], r * s, 0, 7);
        g.globalAlpha = a;
        g.fillStyle = fill;
        g.fill();
        g.globalAlpha = 1;
    };
    /* Cloud: arcs on top, straight at the bottom, filled with the background */
    const cloud = (x: number, y: number, w: number, dark: boolean): { x: number; y: number; w: number } => {
        const p = M(x, y);
        const W = w * s;
        const H = W * 0.34;
        g.beginPath();
        g.moveTo(p[0] - W / 2, p[1]);
        g.arc(p[0] - W * 0.32, p[1] - H * 0.5, H * 0.62, Math.PI * 0.95, Math.PI * 1.75);
        g.arc(p[0] - W * 0.03, p[1] - H * 0.8, H * 0.82, Math.PI * 1.15, Math.PI * 1.9);
        g.arc(p[0] + W * 0.27, p[1] - H * 0.5, H * 0.66, Math.PI * 1.3, Math.PI * 0.05);
        g.lineTo(p[0] + W / 2, p[1]);
        g.closePath();
        g.fillStyle = dark ? (o.dark ? '#1c1c1b' : '#d9d6d0') : o.bg;
        g.fill();
        g.lineWidth = 4;
        g.strokeStyle = o.ink;
        g.globalAlpha = 0.9;
        g.lineJoin = 'round';
        g.stroke();
        g.globalAlpha = 1;
        for (let i = 1; i < 3; i++) {
            L([M(x - w * 0.3 + i * 0.5, y + 0.12), M(x - w * 0.3 + i * 0.5 + w * 0.25, y + 0.12)], 2, o.soft, 0.6);
        }
        return { x, y, w };
    };
    if (phase === 'back') {
        const sx = 17.9;
        const sy = 10.4;
        if (wx.sky === 'sun') {
            circ(sx, sy, 0.78, sun, 0.95);
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * 6.283;
                const r0 = 1.05;
                const r1 = 1.45 + (i % 2) * 0.35;
                L(
                    [M(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0), M(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1)],
                    3.5,
                    sun,
                    0.85,
                );
            }
        }
        if (wx.sky === 'moon') {
            circ(sx, sy, 0.78, o.dark ? '#ece6da' : '#5b6474', 0.95);
            const p = M(sx + 0.38, sy + 0.22);
            g.beginPath();
            g.arc(p[0], p[1], 0.7 * s, 0, 7);
            g.fillStyle = o.bg;
            g.fill();
        }
        if (wx.night) {
            for (let i = 0; i < 34; i++) {
                const zone = rnd() < 0.5 ? Z.left : Z.right;
                const x = zone[0] + rnd() * (zone[1] - zone[0]);
                const y = 6.8 + rnd() * (Z.top - 6.8);
                if (wx.sky === 'moon' && Math.hypot(x - sx, y - sy) < 1.6) {
                    continue;
                }
                const p = M(x, y);
                const r = 1.6 + rnd() * 2.2;
                g.globalAlpha = 0.55 + rnd() * 0.4;
                g.fillStyle = o.ink;
                g.fillRect(p[0] - r / 2, p[1] - r / 2, r, r);
                g.globalAlpha = 1;
            }
        }
        const cl: { x: number; y: number; w: number }[] = [];
        const spots: [number, number, number][] = [
            [-6.4, 10.1, 4.4],
            [16.4, 10.7, 3.9],
            [4.2, 11.3, 2.8],
        ];
        spots
            .slice(0, wx.clouds || 0)
            .forEach(([x, y, w]) => cl.push(cloud(x + (wx.wind ? 0.8 : 0), y, w, !!(wx.rain || wx.storm))));
        if (wx.rain) {
            cl.forEach(c => {
                const top = c.y - 0.25;
                const bottom = c.y > 11 ? Z.roofTop + 0.25 : 0.2;
                for (let i = 0; i < Math.round(c.w * 5); i++) {
                    const x = c.x - c.w * 0.42 + rnd() * c.w * 0.84;
                    for (let y = top - rnd() * 0.6; y > bottom; y -= 1.1 + rnd() * 0.4) {
                        L([M(x + (top - y) * 0.18, y), M(x + (top - y) * 0.18 + 0.12, y - 0.5)], 2.2, rainc, 0.75);
                    }
                }
            });
        }
        if (wx.storm && cl[0]) {
            const x = cl[0].x + 0.4;
            const y = cl[0].y - 0.3;
            L(
                [
                    M(x, y),
                    M(x - 0.55, y - 1.6),
                    M(x + 0.05, y - 1.55),
                    M(x - 0.5, y - 3.3),
                    M(x + 0.9, y - 1.2),
                    M(x + 0.25, y - 1.25),
                    M(x + 0.7, y),
                ],
                3,
                o.ink,
                1,
                true,
                sun,
                0.95,
            );
        }
        if (wx.snow) {
            for (let i = 0; i < 70; i++) {
                const zone = [Z.left, Z.right, Z.roof][i % 3];
                const x = zone[0] + rnd() * (zone[1] - zone[0]);
                const y = zone === Z.roof ? Z.roofTop + 0.5 + rnd() * (Z.top - Z.roofTop - 0.7) : 0.6 + rnd() * 9.5;
                const p = M(x, y);
                const r = 4 + rnd() * 5;
                g.globalAlpha = 0.85;
                g.strokeStyle = o.dark ? '#e9eef5' : '#7d8ea3';
                g.lineWidth = 1.8;
                for (let k = 0; k < 3; k++) {
                    const a = (k * Math.PI) / 3;
                    g.beginPath();
                    g.moveTo(p[0] - Math.cos(a) * r, p[1] - Math.sin(a) * r);
                    g.lineTo(p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r);
                    g.stroke();
                }
                g.globalAlpha = 1;
            }
        }
        if (wx.wind) {
            for (let i = 0; i < 6; i++) {
                const zone = i % 2 ? Z.left : Z.right;
                const x = zone[0] + 0.3 + rnd() * (zone[1] - zone[0] - 3);
                const y = 4.5 + rnd() * 5;
                const p = M(x, y);
                const q = M(x + 2.4, y);
                g.beginPath();
                g.moveTo(p[0], p[1]);
                g.bezierCurveTo(p[0] + 40, p[1] - 14, q[0] - 50, q[1] + 16, q[0], q[1] - 10);
                g.arc(q[0], q[1] - 22, 12, Math.PI / 2, -Math.PI * 0.6, true);
                g.lineWidth = 2.4;
                g.strokeStyle = o.soft;
                g.globalAlpha = 0.8;
                g.stroke();
                g.globalAlpha = 1;
            }
        }
    } else {
        if (wx.snow) {
            Z.snow.forEach(pl => {
                L(
                    pl.map(([x, y]) => M(x, y + 0.1)),
                    9,
                    snowEdge,
                    0.9,
                );
                L(
                    pl.map(([x, y]) => M(x, y + 0.12)),
                    6,
                    snowc,
                    1,
                );
            });
            L([M(-9, 0.1), M(21, 0.1)], 10, snowEdge, 0.8);
            L([M(-9, 0.12), M(21, 0.12)], 7, snowc, 1);
        }
        if (wx.fog) {
            for (let i = 0; i < 9; i++) {
                const y = 0.5 + i * 0.62;
                const off = (i % 3) * 1.3;
                g.setLineDash([60 + i * 6, 22 + i * 3]);
                L([M(-9 + off, y), M(21, y)], 5 - i * 0.3, o.soft, 0.5 - i * 0.035);
                g.setLineDash([]);
            }
        }
    }
}

/* ================= Motifs ================= */

/** South view of the example house: gable roof with dormer and PV, carport on the left, two trees */
export function drawHouse(
    g: CanvasRenderingContext2D,
    o: ArtOpts,
    cx = 1000,
    s = 56,
    gy = 735,
    wx: Weather | null = null,
): { M: MapFn; L: LineFn; s: number } {
    const { L, rnd } = kit(g, o);
    const M: MapFn = (x, y) => [cx + (x - 6.5) * s, gy - y * s];
    const R = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        w: number,
        c: string,
        a: number,
        f: string | null = null,
        fa = 1,
    ): void => L([M(x0, y0), M(x1, y0), M(x1, y1), M(x0, y1)], w, c, a, true, f, fa);
    const glass = o.dark ? '#8fb6d6' : '#5d8fb8';
    const pv = o.dark ? '#4f74b0' : '#2b4a78';
    const tile = o.dark ? '#f08a5d' : '#c4532c';
    const lit = !!wx?.night;
    const warmw = o.dark ? '#f0b453' : '#d8921f';
    if (wx) {
        wxLayer(g, o, M, s, L, wx, 'back', ZU_WX);
    }
    const win = (x0: number, x1: number, y0: number, y1: number, parts: number): void => {
        R(x0, y0, x1, y1, 4, o.ink, 0.9, lit ? warmw : glass, lit ? 0.32 : 0.18);
        for (let i = 1; i < parts; i++) {
            const x = x0 + ((x1 - x0) * i) / parts;
            L([M(x, y0), M(x, y1)], 3, o.ink, 0.8);
        }
    };
    L([M(-9, 0), M(21, 0)], 5, o.ink, 0.75);
    for (let x = -8; x < 21; x += 1.1) {
        L([M(x, -0.45), M(x + 0.5, -0.43)], 3, o.soft, 0.5);
    }
    /* Gable roof: tile hatching, PV field, dormer, chimney */
    for (let x = -0.3; x < 13.3; x += 0.3) {
        L([M(x, 6.3), M(x + 0.9, 10.2)], 2, tile, 0.35);
    }
    L([M(-0.5, 6.2), M(0.6, 10.3), M(12.4, 10.3), M(13.5, 6.2)], 5, o.ink, 1, true);
    for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 2; j++) {
            R(
                0.9 + i * 0.9 + j * 0.25,
                6.9 + j * 1.45,
                1.72 + i * 0.9 + j * 0.25,
                8.2 + j * 1.45,
                2.4,
                o.dark ? '#7d9bd0' : '#3d5f94',
                0.9,
                pv,
                0.6,
            );
        }
    }
    R(8.6, 6.6, 11.6, 8.9, 4, o.ink, 1, o.bg, 1);
    L([M(8.4, 8.9), M(11.8, 8.9)], 5, o.ink, 1);
    win(9.0, 11.2, 6.9, 8.5, 3);
    R(11.9, 9.6, 12.4, 11.3, 4, o.ink, 0.9);
    /* Wall, floor bands, windows */
    R(0, 0, 13, 6.2, 5, o.ink, 1);
    for (const y of [2.7, 5.4]) {
        L([M(0, y), M(13, y)], 2, o.soft, 0.35);
    }
    win(0.9, 2.5, 3.3, 4.8, 2);
    win(3.2, 4.8, 3.3, 4.8, 2);
    win(6.2, 7.2, 3.5, 4.8, 1);
    win(8.4, 12.2, 3.3, 4.8, 3);
    /* Balcony in front of the big window */
    R(8.2, 2.75, 12.4, 3.25, 3, o.ink, 0.9);
    for (let x = 8.35; x < 12.4; x += 0.28) {
        L([M(x, 3.25), M(x, 3.9)], 1.8, o.ink, 0.65);
    }
    L([M(8.2, 3.9), M(12.4, 3.9)], 3, o.ink, 0.9);
    /* Ground floor: garage door, front door with canopy, windows */
    R(0.6, 0, 5.6, 2.25, 5, o.ink, 1);
    for (let y = 0.45; y < 2.2; y += 0.45) {
        L([M(0.7, y), M(5.5, y)], 2, o.soft, 0.7);
    }
    R(6.6, 0, 7.6, 2.2, 4, o.ink, 1, glass, 0.1);
    L([M(6.75, 1.1), M(6.75, 1.4)], 3, o.ink, 0.9);
    R(6.2, 2.3, 8.0, 2.45, 4, o.ink, 1);
    L([M(6.3, 2.3), M(6.3, 1.9)], 2, o.soft, 0.8);
    L([M(7.9, 2.3), M(7.9, 1.9)], 2, o.soft, 0.8);
    win(8.6, 10.6, 0.9, 2.0, 2);
    win(11.1, 12.3, 0.9, 2.0, 1);
    /* Carport with flat roof */
    L([M(-4.1, 0), M(-4.1, 2.85)], 5, o.ink, 1);
    L([M(-0.35, 0), M(-0.35, 2.85)], 5, o.ink, 1);
    R(-4.35, 2.85, 0, 3.15, 4, o.ink, 1);
    /* Trees */
    const tree = (x: number, r: number, h: number): void => {
        L([M(x, 0), M(x, h)], 6, o.ink, 0.9);
        for (let i = 0; i < 46; i++) {
            const a = rnd() * 6.28;
            const d = Math.sqrt(rnd()) * r;
            const c = M(x + Math.cos(a) * d, h + 1.2 + Math.sin(a) * d * 0.9);
            g.beginPath();
            g.arc(c[0], c[1], (0.25 + rnd() * 0.35) * s, 0, 7);
            g.lineWidth = 2;
            g.strokeStyle = o.soft;
            g.globalAlpha = 0.55;
            g.stroke();
            g.globalAlpha = 1;
        }
    };
    tree(-7.2, 1.9, 2.8);
    tree(17.4, 2.2, 3.0);
    if (wx) {
        wxLayer(g, o, M, s, L, wx, 'front', ZU_WX);
    }
    return { M, L, s };
}

/** Energy: PV field, sun, cables to the inverter, the battery tower and the grid */
function drawEnergy(g: CanvasRenderingContext2D, o: ArtOpts): void {
    const { L } = kit(g, o);
    const sun = o.dark ? '#f0b453' : '#d8921f';
    const pv = o.dark ? '#4f74b0' : '#2b4a78';
    const green = o.dark ? '#6be38a' : '#2c9c4f';
    const c: Pt = [1480, 230];
    g.beginPath();
    g.arc(c[0], c[1], 88, 0, 7);
    g.globalAlpha = 0.9;
    g.fillStyle = sun;
    g.fill();
    g.globalAlpha = 1;
    for (let i = 0; i < 28; i++) {
        const a = (i / 28) * 6.283;
        const r0 = 112;
        const r1 = 150 + (i % 2) * 34;
        L(
            [
                [c[0] + Math.cos(a) * r0, c[1] + Math.sin(a) * r0],
                [c[0] + Math.cos(a) * r1, c[1] + Math.sin(a) * r1],
            ],
            4,
            sun,
            0.85,
        );
    }
    const P = (u: number, v: number): Pt => [380 + u * 120 + v * 70, 640 - v * 92 - u * 18];
    for (let u = 0; u < 7; u++) {
        for (let v = 0; v < 4; v++) {
            const q = [P(u, v), P(u + 0.94, v), P(u + 0.94, v + 0.92), P(u, v + 0.92)];
            L(q, 3, o.dark ? '#7d9bd0' : '#3d5f94', 0.9, true, pv, 0.62);
            L([P(u + 0.47, v), P(u + 0.47, v + 0.92)], 1.4, o.soft, 0.5);
        }
    }
    L([P(-0.2, -0.1), P(7.2, -0.1)], 5, o.ink, 0.9);
    L([P(-0.2, -0.1), P(-0.2, 4.1)], 4, o.ink, 0.7);
    for (let i = 0; i < 9; i++) {
        const t0 = i / 9;
        const p = P(1 + t0 * 6, 3.6);
        L(
            [
                [c[0] - 120, c[1] + 60 + i * 6],
                [p[0], p[1]],
            ],
            1.6,
            sun,
            0.3,
        );
    }
    /* Inverter */
    const iv = [1290, 470, 150, 190];
    L(
        [
            [iv[0], iv[1]],
            [iv[0] + iv[2], iv[1]],
            [iv[0] + iv[2], iv[1] + iv[3]],
            [iv[0], iv[1] + iv[3]],
        ],
        5,
        o.ink,
        1,
        true,
    );
    L(
        [
            [iv[0] + 104, iv[1] + 18],
            [iv[0] + 134, iv[1] + 18],
            [iv[0] + 134, iv[1] + 36],
            [iv[0] + 104, iv[1] + 36],
        ],
        3,
        '#1f5ba8',
        1,
        true,
        '#1f5ba8',
        0.9,
    );
    L(
        [
            [iv[0] + 90, iv[1] + 160],
            [iv[0] + 136, iv[1] + 160],
        ],
        6,
        green,
        1,
    );
    /* Battery tower: head, three modules, base */
    const tw = [1560, 400, 120];
    L(
        [
            [tw[0], tw[1]],
            [tw[0] + tw[2], tw[1]],
            [tw[0] + tw[2], tw[1] + 60],
            [tw[0], tw[1] + 60],
        ],
        5,
        o.ink,
        1,
        true,
        o.soft,
        0.45,
    );
    for (let m = 0; m < 3; m++) {
        const y = tw[1] + 66 + m * 78;
        L(
            [
                [tw[0], y],
                [tw[0] + tw[2], y],
                [tw[0] + tw[2], y + 72],
                [tw[0], y + 72],
            ],
            5,
            o.ink,
            1,
            true,
        );
        L(
            [
                [tw[0] + 14, y + 72 - 20 - m * 6],
                [tw[0] + tw[2] - 14, y + 72 - 20 - m * 6],
            ],
            4,
            green,
            0.8,
        );
    }
    L(
        [
            [tw[0] - 4, tw[1] + 302],
            [tw[0] + tw[2] + 4, tw[1] + 302],
            [tw[0] + tw[2] + 4, tw[1] + 322],
            [tw[0] - 4, tw[1] + 322],
        ],
        5,
        o.ink,
        1,
        true,
        o.soft,
        0.45,
    );
    const cab = (pts: Pt[], col: string): void => {
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        g.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
        g.lineWidth = 4;
        g.strokeStyle = col;
        g.globalAlpha = 0.85;
        g.stroke();
        g.globalAlpha = 1;
    };
    cab([P(7, 0.5), [1050, 600], [1180, 720], [iv[0] + 30, iv[1] + iv[3]]], sun);
    cab(
        [
            [iv[0] + 80, iv[1] + iv[3]],
            [iv[0] + 90, 760],
            [tw[0] - 60, 760],
            [tw[0] + 20, tw[1] + 322],
        ],
        green,
    );
    cab(
        [
            [iv[0] + 130, iv[1] + iv[3]],
            [iv[0] + 150, 740],
            [1820, 740],
            [1880, 700],
        ],
        o.dark ? '#a49ef0' : '#6760c4',
    );
    /* Grid mast */
    L(
        [
            [1840, 560],
            [1880, 700],
            [1920, 560],
        ],
        4,
        o.ink,
        0.9,
    );
    L(
        [
            [1852, 600],
            [1908, 600],
        ],
        3,
        o.ink,
        0.8,
    );
}

/** Heating: storage tank in section, solar collectors, burner, radiator, shower */
function drawHeating(g: CanvasRenderingContext2D, o: ArtOpts): void {
    const { L } = kit(g, o);
    const heat = o.dark ? '#f08a5d' : '#c4532c';
    const cool = o.dark ? '#79b8e8' : '#3681bf';
    const solar = o.dark ? '#ffcf7a' : '#c47f1a';
    const T = [920, 110, 160, 580];
    g.save();
    g.beginPath();
    g.roundRect(T[0], T[1], T[2], T[3], 80);
    g.clip();
    const gr = g.createLinearGradient(0, T[1], 0, T[1] + T[3]);
    gr.addColorStop(0, heat);
    gr.addColorStop(0.55, o.dark ? '#d8a07c' : '#b98a6a');
    gr.addColorStop(1, cool);
    g.globalAlpha = 0.55;
    g.fillStyle = gr;
    g.fillRect(T[0], T[1], T[2], T[3]);
    g.globalAlpha = 1;
    for (let y = T[1] + 70; y < T[1] + T[3]; y += 52) {
        L(
            [
                [T[0], y],
                [T[0] + T[2], y],
            ],
            2,
            o.soft,
            0.35,
        );
    }
    const coil = (y0: number, n: number, col: string): void => {
        for (let i = 0; i < n; i++) {
            const y = y0 + i * 22;
            g.beginPath();
            g.ellipse(T[0] + T[2] / 2, y, 56, 9, 0, 0, 7);
            g.lineWidth = 4;
            g.strokeStyle = col;
            g.globalAlpha = 0.9;
            g.stroke();
            g.globalAlpha = 1;
        }
    };
    coil(T[1] + 430, 5, solar);
    coil(T[1] + 250, 4, heat);
    g.restore();
    g.beginPath();
    g.roundRect(T[0], T[1], T[2], T[3], 80);
    g.lineWidth = 6;
    g.strokeStyle = o.ink;
    g.stroke();
    for (const [x, y, a] of [
        [960, 520, -1],
        [1040, 360, 1],
    ]) {
        g.beginPath();
        g.arc(x, y, 34, a > 0 ? 3.6 : 0.5, a > 0 ? 5.8 : 2.7);
        g.lineWidth = 3;
        g.setLineDash([8, 8]);
        g.strokeStyle = o.ink;
        g.globalAlpha = 0.6;
        g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
    }
    /* Solar collectors */
    for (let n = 0; n < 3; n++) {
        const x = 180 + n * 150;
        const q: Pt[] = [
            [x, 300],
            [x + 132, 270],
            [x + 132, 130],
            [x, 160],
        ];
        L(q, 4, o.ink, 1, true, o.dark ? '#2a2d33' : '#1e2126', 0.8);
        for (let k = 1; k < 8; k++) {
            L(
                [
                    [x + k * 16.5, 300 - k * 3.75],
                    [x + k * 16.5, 160 - k * 3.75],
                ],
                1.6,
                o.soft,
                0.7,
            );
        }
    }
    const pipe = (pts: Pt[], col: string): void => L(pts, 6, col, 0.9);
    pipe(
        [
            [640, 250],
            [760, 250],
            [760, 560],
            [T[0], 560],
        ],
        solar,
    );
    pipe(
        [
            [640, 300],
            [720, 300],
            [720, 600],
            [T[0], 600],
        ],
        cool,
    );
    /* Burner with flame */
    const bx = 1260;
    const by = 520;
    L(
        [
            [bx, by],
            [bx + 150, by],
            [bx + 150, by + 160],
            [bx, by + 160],
        ],
        5,
        o.ink,
        1,
        true,
    );
    g.beginPath();
    g.moveTo(bx + 75, by + 128);
    g.bezierCurveTo(bx + 30, by + 100, bx + 60, by + 70, bx + 75, by + 40);
    g.bezierCurveTo(bx + 92, by + 70, bx + 120, by + 100, bx + 75, by + 128);
    g.globalAlpha = 0.9;
    g.fillStyle = heat;
    g.fill();
    g.globalAlpha = 1;
    pipe(
        [
            [bx, by + 40],
            [1180, by + 40],
            [1180, 380],
            [T[0] + T[2], 380],
        ],
        heat,
    );
    pipe(
        [
            [bx, by + 120],
            [1140, by + 120],
            [1140, 430],
            [T[0] + T[2], 430],
        ],
        cool,
    );
    /* Radiator */
    const rx = 1500;
    const ry = 220;
    for (let i = 0; i < 9; i++) {
        L(
            [
                [rx + i * 34, ry],
                [rx + i * 34 + 22, ry],
                [rx + i * 34 + 22, ry + 200],
                [rx + i * 34, ry + 200],
            ],
            3.5,
            o.ink,
            0.9,
            true,
        );
    }
    pipe(
        [
            [T[0] + T[2], 200],
            [1440, 200],
            [1440, 250],
            [rx, 250],
        ],
        heat,
    );
    pipe(
        [
            [rx, 400],
            [1420, 400],
            [1420, 470],
            [T[0] + T[2], 470],
        ],
        cool,
    );
    /* Shower */
    pipe(
        [
            [T[0] + 80, T[1]],
            [T[0] + 80, 70],
            [1700, 70],
            [1700, 110],
        ],
        heat,
    );
    L(
        [
            [1660, 110],
            [1740, 110],
            [1720, 135],
            [1680, 135],
        ],
        4,
        o.ink,
        1,
        true,
    );
    for (let i = 0; i < 9; i++) {
        L(
            [
                [1675 + i * 6, 145],
                [1668 + i * 7.5, 200 + (i % 3) * 14],
            ],
            2,
            cool,
            0.7,
        );
    }
}

/** Appliances: garage, washing machine, dryer, dishwasher, smart speaker */
function drawAppliances(g: CanvasRenderingContext2D, o: ArtOpts): void {
    const { L } = kit(g, o);
    const gy = 700;
    const blue = o.dark ? '#79b8e8' : '#3681bf';
    const heat = o.dark ? '#f08a5d' : '#c4532c';
    const home = o.dark ? '#a49ef0' : '#6760c4';
    const C = (cx: number, cy: number, r: number, w: number, col: string, a: number, fill?: string, fa = 1): void => {
        g.beginPath();
        g.arc(cx, cy, r, 0, 7);
        if (fill) {
            g.globalAlpha = fa;
            g.fillStyle = fill;
            g.fill();
        }
        if (w) {
            g.globalAlpha = a;
            g.lineWidth = w;
            g.strokeStyle = col;
            g.stroke();
        }
        g.globalAlpha = 1;
    };
    const box = (x: number, w: number, h: number, lw = 5): void =>
        L(
            [
                [x, gy],
                [x + w, gy],
                [x + w, gy - h],
                [x, gy - h],
            ],
            lw,
            o.ink,
            1,
            true,
        );
    L(
        [
            [60, gy],
            [1940, gy],
        ],
        4,
        o.soft,
        0.7,
    );
    for (let x = 80; x < 1930; x += 66) {
        L(
            [
                [x, gy + 14],
                [x + 30, gy + 14],
            ],
            3,
            o.soft,
            0.45,
        );
    }
    /* Garage with sectional door */
    L(
        [
            [110, gy],
            [110, gy - 300],
            [280, gy - 400],
            [450, gy - 300],
            [450, gy],
        ],
        5,
        o.ink,
        1,
    );
    L(
        [
            [160, gy],
            [160, gy - 250],
            [400, gy - 250],
            [400, gy],
        ],
        4,
        o.ink,
        0.9,
    );
    for (let i = 1; i < 6; i++) {
        L(
            [
                [164, gy - 250 + i * 41.5],
                [396, gy - 250 + i * 41.5],
            ],
            2.4,
            o.soft,
            0.8,
        );
    }
    L(
        [
            [170, gy - 266],
            [390, gy - 266],
        ],
        7,
        o.dark ? '#f0b453' : '#d8921f',
        0.8,
    );
    /* Washing machine */
    const wx = 560;
    const w = 270;
    const hh = 360;
    box(wx, w, hh);
    L(
        [
            [wx, gy - hh + 66],
            [wx + w, gy - hh + 66],
        ],
        3,
        o.ink,
        0.8,
    );
    L(
        [
            [wx + 18, gy - hh + 18],
            [wx + 92, gy - hh + 18],
            [wx + 92, gy - hh + 48],
            [wx + 18, gy - hh + 48],
        ],
        3,
        o.ink,
        0.8,
        true,
    );
    C(wx + w - 42, gy - hh + 33, 16, 3, o.ink, 0.9);
    const wc: Pt = [wx + w / 2, gy - 148];
    C(wc[0], wc[1], 100, 7, o.ink, 1);
    C(wc[0], wc[1], 80, 3, o.soft, 0.8, blue, 0.14);
    g.save();
    g.beginPath();
    g.arc(wc[0], wc[1], 79, 0, 7);
    g.clip();
    g.beginPath();
    g.moveTo(wc[0] - 82, wc[1] + 22);
    for (let x = -82; x <= 82; x += 8) {
        g.lineTo(wc[0] + x, wc[1] + 22 + Math.sin(x / 13) * 7);
    }
    g.lineTo(wc[0] + 82, wc[1] + 90);
    g.lineTo(wc[0] - 82, wc[1] + 90);
    g.closePath();
    g.globalAlpha = 0.4;
    g.fillStyle = blue;
    g.fill();
    g.globalAlpha = 1;
    for (const [dx, dy, r] of [
        [-30, 0, 26],
        [18, 14, 30],
        [-6, -30, 20],
    ]) {
        C(wc[0] + dx, wc[1] + dy, r, 2.4, o.soft, 0.8);
    }
    g.restore();
    /* Dryer */
    const dx = 865;
    const dh = 360;
    box(dx, w, dh);
    L(
        [
            [dx, gy - dh + 66],
            [dx + w, gy - dh + 66],
        ],
        3,
        o.ink,
        0.8,
    );
    L(
        [
            [dx + 100, gy - dh + 20],
            [dx + 200, gy - dh + 20],
            [dx + 200, gy - dh + 46],
            [dx + 100, gy - dh + 46],
        ],
        3,
        o.ink,
        0.9,
        true,
        o.dark ? '#2a2d33' : '#1e2126',
        0.85,
    );
    L(
        [
            [dx + 18, gy - dh + 22],
            [dx + 76, gy - dh + 22],
            [dx + 76, gy - dh + 44],
            [dx + 18, gy - dh + 44],
        ],
        3,
        o.ink,
        0.8,
        true,
    );
    const dc: Pt = [dx + w / 2, gy - 150];
    C(dc[0], dc[1], 100, 7, o.ink, 1);
    C(dc[0], dc[1], 80, 3, o.soft, 0.8, heat, 0.1);
    for (let i = 0; i < 18; i++) {
        const a = (i / 18) * 6.283;
        L(
            [
                [dc[0] + Math.cos(a) * 40, dc[1] + Math.sin(a) * 40],
                [dc[0] + Math.cos(a) * 76, dc[1] + Math.sin(a) * 76],
            ],
            1.6,
            o.soft,
            0.6,
        );
    }
    for (let k = 0; k < 3; k++) {
        g.beginPath();
        const x0 = dc[0] - 36 + k * 36;
        g.moveTo(x0, dc[1] - 112);
        g.bezierCurveTo(x0 - 16, dc[1] - 132, x0 + 16, dc[1] - 152, x0, dc[1] - 172);
        g.lineWidth = 3;
        g.strokeStyle = heat;
        g.globalAlpha = 0.55;
        g.stroke();
        g.globalAlpha = 1;
    }
    /* Dishwasher, fully integrated, x-ray view with the light on the floor */
    const sx = 1170;
    const sh = 380;
    box(sx, w, sh);
    L(
        [
            [sx, gy - 42],
            [sx + w, gy - 42],
        ],
        3,
        o.ink,
        0.8,
    );
    L(
        [
            [sx + 30, gy - sh + 26],
            [sx + w - 30, gy - sh + 26],
        ],
        6,
        o.ink,
        0.9,
    );
    g.setLineDash([9, 8]);
    for (const y of [gy - 250, gy - 130]) {
        L(
            [
                [sx + 24, y],
                [sx + w - 24, y],
                [sx + w - 30, y + 70],
                [sx + 30, y + 70],
            ],
            2.6,
            o.soft,
            0.8,
            true,
        );
    }
    g.setLineDash([]);
    for (let i = 0; i < 9; i++) {
        L(
            [
                [sx + 46 + i * 22, gy - 182],
                [sx + 46 + i * 22, gy - 246],
            ],
            2.2,
            o.soft,
            0.7,
        );
    }
    for (let i = 0; i < 4; i++) {
        C(sx + 70 + i * 44, gy - 90, 18, 2.2, o.soft, 0.7);
    }
    L(
        [
            [sx + 60, gy - 196],
            [sx + w - 60, gy - 196],
        ],
        4,
        blue,
        0.6,
    );
    g.beginPath();
    g.ellipse(sx + w / 2, gy + 26, 70, 9, 0, 0, 7);
    g.globalAlpha = 0.5;
    g.fillStyle = blue;
    g.fill();
    g.globalAlpha = 1;
    /* Smart speaker with light ring and sound arcs */
    const ex = 1640;
    const eh = 190;
    const ew = 120;
    L(
        [
            [ex, gy],
            [ex, gy - eh],
            [ex + ew, gy - eh],
            [ex + ew, gy],
        ],
        5,
        o.ink,
        1,
    );
    g.beginPath();
    g.ellipse(ex + ew / 2, gy - eh, ew / 2, 14, 0, 0, 7);
    g.lineWidth = 6;
    g.strokeStyle = blue;
    g.globalAlpha = 0.9;
    g.stroke();
    g.globalAlpha = 1;
    for (let y = gy - eh + 34; y < gy - 12; y += 16) {
        L(
            [
                [ex + 14, y],
                [ex + ew - 14, y],
            ],
            1.6,
            o.soft,
            0.55,
        );
    }
    for (let k = 1; k <= 3; k++) {
        g.beginPath();
        g.arc(ex + ew / 2, gy - eh - 10, 40 + k * 34, -2.4, -0.74);
        g.lineWidth = 3;
        g.strokeStyle = home;
        g.globalAlpha = 0.75 - k * 0.15;
        g.stroke();
        g.globalAlpha = 1;
    }
}

/** Driveway: the house view, in front of it the carport with car and wall box, a camera, paving and street */
function drawDriveway(g: CanvasRenderingContext2D, o: ArtOpts, wx: Weather | null): void {
    const { M, L } = drawHouse(g, o, 1060, 50, 662, wx);
    const warm = o.dark ? '#f0b453' : '#d8921f';
    const red = o.dark ? '#ff6b5a' : '#c4532c';
    const green = o.dark ? '#6be38a' : '#2c9c4f';
    const glass = o.dark ? '#8fb6d6' : '#5d8fb8';
    const R = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        w: number,
        c = o.ink,
        a = 1,
        f: string | null = null,
        fa = 1,
    ): void => L([M(x0, y0), M(x1, y0), M(x1, y1), M(x0, y1)], w, c, a, true, f, fa);
    /* Light under the carport */
    const t = M(-4.1, 2.85);
    const b = M(-0.35, 0);
    const gr = g.createLinearGradient(0, t[1], 0, b[1]);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, warm);
    g.globalAlpha = 0.26;
    g.fillStyle = gr;
    g.fillRect(t[0] + 4, t[1] + 4, b[0] - t[0] - 8, b[1] - t[1] - 4);
    g.globalAlpha = 1;
    /* Car from behind */
    const cx = -2.25;
    const hw = 0.92;
    R(cx - hw + 0.06, 0, cx - hw + 0.32, 0.22, 0, o.ink, 0, o.ink, 0.8);
    R(cx + hw - 0.32, 0, cx + hw - 0.06, 0.22, 0, o.ink, 0, o.ink, 0.8);
    L(
        [
            M(cx - hw, 0.2),
            M(cx - hw, 0.82),
            M(cx - hw + 0.2, 0.9),
            M(cx - 0.66, 1.42),
            M(cx + 0.66, 1.42),
            M(cx + hw - 0.2, 0.9),
            M(cx + hw, 0.82),
            M(cx + hw, 0.2),
        ],
        4,
        o.ink,
        1,
        true,
    );
    L(
        [M(cx - 0.58, 0.98), M(cx - 0.5, 1.33), M(cx + 0.5, 1.33), M(cx + 0.58, 0.98)],
        2.6,
        o.ink,
        0.9,
        true,
        glass,
        0.18,
    );
    L([M(cx - hw, 0.45), M(cx + hw, 0.45)], 2, o.soft, 0.8);
    R(cx - hw + 0.06, 0.62, cx - hw + 0.42, 0.74, 0, red, 0, red, 0.9);
    R(cx + hw - 0.42, 0.62, cx + hw - 0.06, 0.74, 0, red, 0, red, 0.9);
    R(cx - 0.26, 0.5, cx + 0.26, 0.62, 2, o.ink, 0.9);
    /* Wall box on the post, cable to the car */
    R(-3.95, 0.95, -3.6, 1.45, 3, o.ink, 1, o.soft, 0.2);
    L([M(-3.88, 1.32), M(-3.67, 1.32)], 3, green, 1);
    const c0 = M(-3.78, 0.95);
    const c1 = M(-3.8, 0.35);
    const c2 = M(-3.4, 0.3);
    const c3 = M(cx - hw, 0.62);
    g.beginPath();
    g.moveTo(c0[0], c0[1]);
    g.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], c3[0], c3[1]);
    g.lineWidth = 2.4;
    g.strokeStyle = o.ink;
    g.globalAlpha = 0.85;
    g.stroke();
    g.globalAlpha = 1;
    /* Camera under the carport roof, field of view to the street */
    R(-0.95, 2.6, -0.55, 2.82, 3, o.ink, 1);
    const ck = M(-0.62, 2.71);
    g.beginPath();
    g.arc(ck[0], ck[1], 4.5, 0, 7);
    g.fillStyle = red;
    g.fill();
    g.setLineDash([7, 9]);
    L([M(-0.75, 2.6), M(-3.2, -1.3)], 2, red, 0.55);
    L([M(-0.75, 2.6), M(4.0, -1.3)], 2, red, 0.55);
    g.setLineDash([]);
    /* Paving in front of carport and garage, curb and street */
    for (let r = 0; r < 2; r++) {
        for (let x = -4.3 + (r % 2) * 0.42; x < 5.7; x += 0.84) {
            const y = -0.32 - r * 0.42;
            L(
                [
                    M(x, y),
                    M(x + 0.17, y + 0.15),
                    M(x + 0.55, y + 0.15),
                    M(x + 0.72, y),
                    M(x + 0.55, y - 0.15),
                    M(x + 0.17, y - 0.15),
                ],
                1.4,
                o.soft,
                0.4,
                true,
            );
        }
    }
    L([M(-9, -1.5), M(21, -1.5)], 3, o.ink, 0.6);
}

/* ================= Floor plans of the example house (meters) ================= */

interface PlanRoom {
    /** H = family, O = second household, S = shared, X = outside */
    u: 'H' | 'O' | 'S' | 'X';
    p: Pt[];
    stair?: boolean;
}

const Rp = (a: number, b: number, c: number, d: number): Pt[] => [
    [a, b],
    [c, b],
    [c, d],
    [a, d],
];
const room = (u: PlanRoom['u'], p: Pt[], stair = false): PlanRoom => ({ u, p, stair });

/** Basement, ground floor, upper floor; drawn 13 × 11.25 m, scaled like the original plan to 12 × 10.4 */
const PLAN: { foot: Pt[]; rooms: PlanRoom[] }[] = [
    {
        foot: Rp(0, 0, 13, 11.25),
        rooms: [
            room('S', Rp(0, 0, 3.5, 3)),
            room('S', Rp(3.5, 0, 7, 3)),
            room('S', Rp(7, 0, 10, 3)),
            room('S', Rp(10, 0, 13, 3)),
            room('S', Rp(0, 3, 6, 5.5)),
            room('S', Rp(6, 3, 10, 5.5)),
            room('S', Rp(10, 3, 13, 5.5)),
            room('S', Rp(0, 5.5, 6, 11.25)),
            room('S', Rp(6, 5.5, 7.2, 8.5), true),
            room('S', [
                [7.2, 5.5],
                [13, 5.5],
                [13, 11.25],
                [6, 11.25],
                [6, 8.5],
                [7.2, 8.5],
            ]),
            room('X', Rp(-3.8, 5.8, -0.2, 11.8)),
            room('X', Rp(9, 11.25, 13, 13)),
        ],
    },
    {
        foot: Rp(0, 0, 13, 11.25),
        rooms: [
            room('H', Rp(0, 0, 6.5, 5.2)),
            room('H', Rp(0, 5.2, 4, 8.5)),
            room('H', [
                [4, 5.2],
                [6.2, 5.2],
                [6.2, 11.25],
                [2.2, 11.25],
                [2.2, 8.5],
                [4, 8.5],
            ]),
            room('H', Rp(0, 8.5, 2.2, 11.25)),
            room('H', Rp(6.2, 5.2, 7.3, 8.6), true),
            room('S', Rp(6.2, 8.6, 8, 11.25)),
            room('O', Rp(7.3, 5.2, 8.4, 8.6), true),
            room('O', Rp(6.5, 0, 10, 5.2)),
            room('O', [
                [8.4, 5.2],
                [10, 5.2],
                [10, 11.25],
                [8, 11.25],
                [8, 8.6],
                [8.4, 8.6],
            ]),
            room('O', Rp(10, 0, 13, 3.6)),
            room('O', Rp(10, 3.6, 13, 6.4)),
            room('O', Rp(10, 6.4, 13, 11.25)),
            room('X', Rp(0.5, -2.2, 4.6, 0)),
            room('X', Rp(4.6, -2.6, 8.4, 0)),
            room('X', Rp(8.4, -2.2, 12.5, 0)),
            room('X', Rp(6.2, 11.25, 8, 12.6)),
        ],
    },
    {
        foot: Rp(0, 0, 13, 11.25),
        rooms: [
            room('H', Rp(0, 0, 4, 3.6)),
            room('H', Rp(4, 0, 7.5, 3.6)),
            room('X', Rp(-1.4, 0.5, 0, 3)),
            room('H', Rp(0, 3.6, 4, 7.4)),
            room('H', Rp(0, 7.4, 4, 11.25)),
            room('H', Rp(4, 3.6, 5.6, 9)),
            room('H', Rp(4, 9, 6.5, 11.25)),
            room('H', Rp(5.6, 5.2, 6.6, 8.6), true),
            room('O', Rp(6.8, 5.2, 7.8, 8.6), true),
            room('O', Rp(7.5, 0, 13, 3.6)),
            room('O', Rp(7.8, 3.6, 9.5, 9)),
            room('O', Rp(9.5, 3.6, 13, 6.4)),
            room('O', Rp(9.5, 6.4, 13, 11.25)),
            room('X', Rp(13, 2, 14.4, 6)),
            room('X', Rp(13, 7, 14.4, 10)),
        ],
    },
];

const planScale = ([x, y]: Pt): Pt => [(x / 13) * 12, (y / 11.25) * 10.4];

/** Floor plan from above with north arrow; the ground floor shows the awning over the terrace */
function drawPlan(g: CanvasRenderingContext2D, o: ArtOpts, floor: PlanFloor): void {
    const fi = floor === 'basement' ? 0 : floor === 'upper' ? 2 : 1;
    const { L } = kit(g, o);
    const s = 52;
    const x0 = 1000 - 6.5 * s;
    const y0 = 400 - 5.625 * s;
    const M = (p: Pt): Pt => [x0 + p[0] * s, y0 + p[1] * s];
    const fl = PLAN[fi];
    L(
        [
            [x0 - 8 * s, y0 + 13.6 * s],
            [x0 + 21 * s, y0 + 13.4 * s],
        ],
        4,
        o.soft,
        0.7,
    );
    for (let x = -7; x < 20; x += 1.2) {
        L(
            [
                [x0 + x * s, y0 + 14.0 * s],
                [x0 + (x + 0.55) * s, y0 + 14.0 * s],
            ],
            3,
            o.soft,
            0.5,
        );
    }
    L(fl.foot.map(planScale).map(M), 10, o.ink, 1, true);
    fl.rooms.forEach(r => {
        const p = r.p.map(planScale);
        if (r.u === 'X') {
            g.setLineDash([10, 9]);
            L(p.map(M), 3, o.soft, 0.8, true);
            g.setLineDash([]);
            return;
        }
        const fill =
            r.u === 'H' ? (o.dark ? '#78aee8' : '#2d6bb0') : r.u === 'O' ? (o.dark ? '#a49ef0' : '#6760c4') : null;
        L(p.map(M), 4, o.ink, 0.85, true, fill, 0.08);
        if (r.stair) {
            const [a0, a1, a2, a3] = p;
            for (let n = 1; n < 12; n++) {
                const u = n / 12;
                L(
                    [
                        M([a0[0] + (a3[0] - a0[0]) * u, a0[1] + (a3[1] - a0[1]) * u]),
                        M([a1[0] + (a2[0] - a1[0]) * u, a1[1] + (a2[1] - a1[1]) * u]),
                    ],
                    2,
                    o.ink,
                    0.6,
                );
            }
        }
    });
    /* North arrow */
    const n: Pt = [x0 + 15 * s, y0 + 1 * s];
    L(
        [
            [n[0], n[1] + 70],
            [n[0], n[1] - 10],
        ],
        4,
        o.ink,
        0.9,
    );
    L(
        [
            [n[0] - 16, n[1] + 14],
            [n[0], n[1] - 14],
            [n[0] + 16, n[1] + 14],
        ],
        4,
        o.ink,
        0.9,
    );
    g.font = '600 34px Geist, sans-serif';
    g.fillStyle = o.ink;
    g.textAlign = 'center';
    g.fillText('N', n[0], n[1] + 110);
    /* Awning over the middle terrace */
    if (fi === 1) {
        const mx0 = 4.6;
        const mx1 = 8.4;
        const my0 = 0;
        const my1 = -2.6;
        for (let i = 0; i <= 10; i++) {
            const x = mx0 + ((mx1 - mx0) * i) / 10;
            L([M(planScale([x, my0])), M(planScale([x, my1]))], i % 2 ? 2 : 3.5, o.dark ? '#f08a5d' : '#c4532c', 0.7);
        }
        L([M(planScale([mx0, my1])), M(planScale([mx1, my1]))], 4, o.ink, 0.9);
    }
}

/** Drawing function of a motif */
export function motifDraw(motif: MotifName, opts: { weather?: Weather | null; floor?: PlanFloor } = {}): DrawFn {
    switch (motif) {
        case 'energy':
            return drawEnergy;
        case 'heating':
            return drawHeating;
        case 'appliances':
            return drawAppliances;
        case 'driveway':
            return (g, o) => drawDriveway(g, o, opts.weather || null);
        case 'plan':
            return (g, o) => drawPlan(g, o, opts.floor || 'ground');
        case 'house':
        default:
            return (g, o) => {
                drawHouse(g, o, undefined, undefined, undefined, opts.weather || null);
            };
    }
}

/** Renders a motif onto a new canvas: 2000 × 800, or for narrow widgets the middle part on 1300 × 1080 */
export function renderArt(draw: DrawFn, o: ArtOpts, mobile: boolean): HTMLCanvasElement {
    const W = mobile ? 1300 : 2000;
    const H = mobile ? 1080 : 800;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    if (!g) {
        return c;
    }
    if (mobile) {
        const s = 1300 / 1500;
        g.translate(-250 * s, (H - 800 * s) / 2);
        g.scale(s, s);
    }
    draw(g, o);
    return c;
}

export type ImageColors = 'original' | 'ink' | 'lines';

/**
 * Puts an own image onto a canvas of about the same pixel area as a motif.
 * `ink` recolors it with the ink of the theme, `lines` turns dark pixels into ink (for drawings on white).
 */
export function renderImage(img: HTMLImageElement, mode: ImageColors, o: ArtOpts): HTMLCanvasElement {
    let iw = img.naturalWidth;
    let ih = img.naturalHeight;
    if (!iw || !ih) {
        // SVG without width/height
        iw = 1600;
        ih = 1000;
    }
    const k = Math.sqrt((2000 * 800) / (iw * ih));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(iw * k));
    c.height = Math.max(1, Math.round(ih * k));
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) {
        return c;
    }
    g.drawImage(img, 0, 0, c.width, c.height);
    if (mode === 'original') {
        return c;
    }
    try {
        const data = g.getImageData(0, 0, c.width, c.height);
        const d = data.data;
        const ink = parseInt(o.ink.slice(1), 16);
        const r = (ink >> 16) & 255;
        const gg = (ink >> 8) & 255;
        const b = ink & 255;
        for (let i = 0; i < d.length; i += 4) {
            if (mode === 'lines') {
                const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
                d[i + 3] = Math.round(d[i + 3] * Math.max(0, Math.min(1, (0.92 - lum) / 0.7)));
            }
            d[i] = r;
            d[i + 1] = gg;
            d[i + 2] = b;
        }
        g.putImageData(data, 0, 0);
    } catch {
        // image of another origin without CORS: keep its colors
    }
    return c;
}
