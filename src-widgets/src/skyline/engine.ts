/* Year skyline engine: daily values as a heatmap that rises into an isometric skyline.
 * One canvas, one camera: 2D is the grid seen from above, 3D the same grid seen from the corner.
 * Hover/tap shows the day, arrow keys walk through the grid, dragging in 3D orbits the camera,
 * double click resets it. New data lets the bars glide to their new height.
 * TypeScript port of the Glashaus "Jahres-Skyline" (MIT), scoped to one widget element, without globals.
 * The loop only runs while something moves, pauses when the tab is hidden or the widget is out of view,
 * and skips all animations with prefers-reduced-motion. */
import type { SkyCell, SkyModel } from './data';

export type RGB = [number, number, number];

const clamp01 = (v: number): number => (v > 0 ? (v < 1 ? v : 1) : 0);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeIO = (x: number): number => {
    const t = clamp01(x);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const easeOut = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3);
const smooth = (a: number, b: number, x: number): number => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
};

/** Share of the rise animation used by the wave from the first to the last week */
const WAVE = 0.42;
const DEG = Math.PI / 180;
const YAW3 = Math.PI / 4;
const ELEV3 = 34 * DEG;
const YAWR: [number, number] = [8 * DEG, 82 * DEG];
const ELEVR: [number, number] = [18 * DEG, 62 * DEG];

interface Cam {
    cs: number;
    sn: number;
    se: number;
    ce: number;
}

function camera(e: number, dY = 0, dE = 0): Cam {
    const yaw = Math.min(YAWR[1], Math.max(0, lerp(0, YAW3 + dY, e)));
    const elev = lerp(Math.PI / 2, Math.min(ELEVR[1], Math.max(ELEVR[0], ELEV3 + dE)), e);
    return { cs: Math.cos(yaw), sn: Math.sin(yaw), se: Math.sin(elev), ce: Math.cos(elev) };
}

const project = (c: Cam, x: number, y: number, z: number): [number, number] => [
    x * c.cs - y * c.sn,
    (x * c.sn + y * c.cs) * c.se - z * c.ce,
];

export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
];
const lum = (c: RGB): number => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const rgbS = (r: number, g: number, b: number): string => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
const rgbaS = (c: RGB, a: number): string =>
    `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`;

/** Height of a bar in grid units */
const barHeight = (v: number | null, lo: number, max: number, s: number): number => {
    if (v === null) {
        return 0.2;
    }
    const x = v - lo;
    if (x > 0 && max > 0) {
        return 0.4 + Math.pow(x / max, 0.85) * 7.2 * s;
    }
    // lifted base (negative values): the lowest value is a value, not an empty day
    return lo < 0 ? 0.4 : 0.2;
};

let probe: CanvasRenderingContext2D | null = null;

/** Any CSS color → RGB (via a 1×1 canvas), `fb` when it cannot be read */
export function toRGB(color: string, fb: RGB): RGB {
    if (!color) {
        return fb;
    }
    if (!probe) {
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        probe = c.getContext('2d', { willReadFrequently: true });
    }
    if (!probe) {
        return fb;
    }
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = 'rgba(0,0,0,0)';
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    return d[3] < 8 ? fb : [d[0], d[1], d[2]];
}

/** Five colors (no value, little … most) for an accent color in the current theme */
export function paletteFor(accent: RGB, fg: RGB, bg: RGB, dark: boolean): RGB[] {
    const white: RGB = [255, 255, 255];
    const black: RGB = [0, 0, 0];
    const empty = mixRGB(bg, fg, dark ? 0.11 : 0.08);
    if (dark) {
        return [empty, mixRGB(accent, black, 0.68), mixRGB(accent, black, 0.4), accent, mixRGB(accent, white, 0.45)];
    }
    return [empty, mixRGB(accent, white, 0.62), mixRGB(accent, white, 0.3), accent, mixRGB(accent, black, 0.35)];
}

/** Is (x, y) inside the convex quad at offset `o` of `p`? */
function inQuad(p: Float32Array, o: number, x: number, y: number): boolean {
    let sign = 0;
    for (let k = 0; k < 4; k++) {
        const ax = p[o + k * 2];
        const ay = p[o + k * 2 + 1];
        const bx = p[o + ((k + 1) % 4) * 2];
        const by = p[o + ((k + 1) % 4) * 2 + 1];
        const cr = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
        if (Math.abs(cr) < 1e-9) {
            continue;
        }
        const s = cr > 0 ? 1 : -1;
        if (sign === 0) {
            sign = s;
        } else if (s !== sign) {
            return false;
        }
    }
    return sign !== 0;
}

function quadPath(ctx: CanvasRenderingContext2D, p: Float32Array, o: number, r: number): void {
    if (r < 0.3) {
        ctx.moveTo(p[o], p[o + 1]);
        ctx.lineTo(p[o + 2], p[o + 3]);
        ctx.lineTo(p[o + 4], p[o + 5]);
        ctx.lineTo(p[o + 6], p[o + 7]);
        ctx.closePath();
        return;
    }
    ctx.moveTo((p[o + 6] + p[o]) / 2, (p[o + 7] + p[o + 1]) / 2);
    for (let k = 0; k < 4; k++) {
        const b = (k + 1) % 4;
        ctx.arcTo(p[o + k * 2], p[o + k * 2 + 1], p[o + b * 2], p[o + b * 2 + 1], r);
    }
    ctx.closePath();
}

export type SkyView = '2d' | '3d';

/** Area in a corner of the stage that the 3D skyline should keep free (e.g. statistics) */
export interface SkyKeepOut {
    corner: 'tr' | 'bl';
    w: number;
    h: number;
    /** Distance from the stage edges (px) */
    inset: number;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface Fit {
    s: number;
    ox: number;
    oy: number;
}

export interface SkylineElements {
    /** Element that carries the --gh-* tokens and the font (widget root) */
    root: HTMLElement;
    /** Sized container of the canvas (the canvas fills it) */
    stage: HTMLElement;
    canvas: HTMLCanvasElement;
    /** Tooltip, absolutely positioned with its origin at the top left corner of the stage */
    tip: HTMLElement;
    /** Live region that reads the day selected with the keyboard */
    sr?: HTMLElement | null;
}

export interface SkylineOptions {
    view: SkyView;
    /** Rise from the flat heatmap when the widget is shown for the first time */
    rise: boolean;
    /** Orbit by dragging and pin by click (off in the vis-2 editor) */
    interactive: boolean;
    /** Tooltip text of a day: bold part and rest */
    tip: (c: SkyCell) => [string, string];
    /** Spoken text of a day */
    describe: (c: SkyCell) => string;
    /** Colors of the five levels changed (CSS colors), e.g. for the legend */
    onPalette?: (colors: string[]) => void;
    /** Result of the keep-out fit: scale factor 0.3..1 the 3D skyline needs to keep the corners free */
    onFit?: (k: number) => void;
}

export class SkylineEngine {
    private readonly el: SkylineElements;

    private readonly ctx: CanvasRenderingContext2D | null;

    private opts: SkylineOptions;

    private model: SkyModel | null = null;

    private view: SkyView;

    private accentCss = 'var(--gh-fg)';

    private legendLevel = -1;

    private reduced: boolean;

    private readonly reduceMq: MediaQueryList | null;

    private io: IntersectionObserver | null = null;

    private ro: ResizeObserver | null = null;

    private inView = true;

    private entered = false;

    private t = 0;

    private target = 0;

    private readonly duration = 1400;

    private yaw = 0;

    private elev = 0;

    private yawGoal = 0;

    private elevGoal = 0;

    private W = 0;

    private H = 0;

    private dpr = 1;

    private gutter = 30;

    private labelW = 30;

    private font = '500 10.5px sans-serif';

    private readonly col = new Float32Array(15);

    private readonly colGoal = new Float32Array(15);

    private colReady = false;

    private fg: RGB = [23, 23, 23];

    private bg: RGB = [255, 255, 255];

    private n = 0;

    private weeks = 0;

    private rows = 7;

    private wk = new Float32Array(0);

    private dy = new Float32Array(0);

    private lv = new Uint8Array(0);

    private hgt = new Float32Array(0);

    private hFrom = new Float32Array(0);

    private hTo = new Float32Array(0);

    private zs = new Float32Array(0);

    private hover = new Float32Array(0);

    private dim = new Float32Array(0);

    private polys = new Float32Array(0);

    private faces = new Uint8Array(0);

    private order: number[] = [];

    private orderKey = NaN;

    private blend = 1;

    /** Index of today's cell (last cell of the most recent stripe) */
    private endIdx = -1;

    private keepOut: SkyKeepOut[] | null = null;

    /** Scale factor of the 3D skyline that keeps the keep-out areas free */
    private fitK = 1;

    private hovered = -1;

    private pinned = -1;

    private activeIdx = -1;

    private raf = 0;

    private last = 0;

    private drag: {
        id: number;
        x: number;
        y: number;
        yaw: number;
        elev: number;
        moved: boolean;
        orbit: boolean;
        mouse: boolean;
    } | null = null;

    private tipText: HTMLElement;

    private tipRest: Text;

    private destroyed = false;

    constructor(el: SkylineElements, opts: SkylineOptions) {
        this.el = el;
        this.opts = opts;
        this.view = opts.view;
        this.ctx = el.canvas.getContext('2d');
        this.reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        this.reduced = !!this.reduceMq?.matches;

        // tooltip content: <span><strong/> rest</span><i/>
        el.tip.textContent = '';
        const span = document.createElement('span');
        this.tipText = document.createElement('strong');
        this.tipRest = document.createTextNode('');
        span.append(this.tipText, this.tipRest);
        el.tip.append(span, document.createElement('i'));
        el.tip.setAttribute('aria-hidden', 'true');

        // no rise wanted: show the final picture at once
        if (!opts.rise || this.reduced) {
            this.entered = true;
            this.t = this.goal();
            this.target = this.t;
        }

        const c = el.canvas;
        c.addEventListener('pointerdown', this.onDown);
        c.addEventListener('pointermove', this.onMove);
        c.addEventListener('pointerup', this.onUp);
        c.addEventListener('pointercancel', this.onCancel);
        c.addEventListener('pointerleave', this.onLeave);
        c.addEventListener('dblclick', this.onDbl);
        c.addEventListener('keydown', this.onKey);
        c.addEventListener('blur', this.onBlur);
        this.reduceMq?.addEventListener('change', this.onMotion);
        document.addEventListener('visibilitychange', this.onVisibility);

        if (typeof ResizeObserver !== 'undefined') {
            this.ro = new ResizeObserver(() => {
                const w = Math.round(el.stage.clientWidth);
                const h = Math.round(el.stage.clientHeight);
                if (w !== this.W || h !== this.H) {
                    this.relayout();
                }
            });
            this.ro.observe(el.stage);
        }
        if (typeof IntersectionObserver !== 'undefined') {
            this.io = new IntersectionObserver(this.onIntersect, { threshold: 0 });
            this.io.observe(el.stage);
        } else {
            this.enter();
        }
        this.updateCursor();
    }

    destroy(): void {
        this.destroyed = true;
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        const c = this.el.canvas;
        c.removeEventListener('pointerdown', this.onDown);
        c.removeEventListener('pointermove', this.onMove);
        c.removeEventListener('pointerup', this.onUp);
        c.removeEventListener('pointercancel', this.onCancel);
        c.removeEventListener('pointerleave', this.onLeave);
        c.removeEventListener('dblclick', this.onDbl);
        c.removeEventListener('keydown', this.onKey);
        c.removeEventListener('blur', this.onBlur);
        this.reduceMq?.removeEventListener('change', this.onMotion);
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.ro?.disconnect();
        this.ro = null;
        this.io?.disconnect();
        this.io = null;
    }

    /* ---------- public API ---------- */

    /** New data. `animate`: bars glide from their current to the new height (same grid only) */
    setModel(model: SkyModel, animate: boolean): void {
        const prevN = this.n;
        this.model = model;
        const n = model.cells.length;
        this.n = n;
        this.weeks = model.weeks;
        this.rows = model.rows || 7;
        if (this.wk.length !== n) {
            this.wk = new Float32Array(n);
            this.dy = new Float32Array(n);
            this.lv = new Uint8Array(n);
            this.hgt = new Float32Array(n);
            this.hFrom = new Float32Array(n);
            this.hTo = new Float32Array(n);
            this.zs = new Float32Array(n);
            this.hover = new Float32Array(n);
            this.dim = new Float32Array(n);
            this.polys = new Float32Array(n * 24);
            this.faces = new Uint8Array(n);
            this.order = Array.from({ length: n }, (_, i) => i);
            this.orderKey = NaN;
        }
        const glide = animate && prevN === n && !this.reduced;
        const hs = model.N > 1 ? 0.7 : 1;
        for (let i = 0; i < n; i++) {
            const c = model.cells[i];
            this.wk[i] = c.week;
            this.dy[i] = c.day;
            this.lv[i] = c.level;
            const h = barHeight(c.v, model.lo, model.max, hs);
            this.hFrom[i] = glide ? this.hgt[i] : h;
            this.hTo[i] = h;
            if (!glide) {
                this.hgt[i] = h;
            }
        }
        this.blend = glide ? 0 : 1;
        this.endIdx = n - 1;
        for (let i = 0; i < n; i++) {
            if (model.cells[i].strip === 0) {
                this.endIdx = i;
            }
        }
        if (this.pinned >= n) {
            this.pinned = -1;
        }
        if (this.hovered >= n) {
            this.hovered = -1;
        }
        this.activeIdx = -2; // force the tooltip text to be rebuilt
        this.measureLabels();
        this.updateFit();
        this.refreshActive();
        if (!this.W) {
            this.relayout();
        }
        this.kick();
    }

    setView(view: SkyView): void {
        if (view === this.view) {
            return;
        }
        this.view = view;
        this.updateTarget();
        this.updateCursor();
    }

    setInteractive(on: boolean): void {
        if (on === this.opts.interactive) {
            return;
        }
        this.opts = { ...this.opts, interactive: on };
        if (!on) {
            this.pinned = -1;
            this.drag = null;
            this.refreshActive();
        }
        this.updateCursor();
    }

    /** Texts of tooltip and screen reader (e.g. after a language change) */
    setTexts(tip: SkylineOptions['tip'], describe: SkylineOptions['describe']): void {
        this.opts = { ...this.opts, tip, describe };
    }

    /** Dims all cells except the given level (-1 = none) */
    setLegendLevel(level: number): void {
        if (level === this.legendLevel) {
            return;
        }
        this.legendLevel = level;
        this.kick();
    }

    /** Corner areas that the 3D skyline keeps free (null: none); the needed scale is reported with onFit */
    setKeepOut(areas: SkyKeepOut[] | null): void {
        const next = areas && areas.length ? areas : null;
        // (the fit also depends on stage size and data: relayout() and setModel() recompute it)
        if (JSON.stringify(next) !== JSON.stringify(this.keepOut)) {
            this.keepOut = next;
            this.updateFit();
            this.kick();
        }
    }

    /** Re-reads the theme tokens and the accent color (CSS color or `var(--gh-…)`) */
    retheme(accentCss?: string): void {
        if (accentCss) {
            this.accentCss = accentCss;
        }
        const cs = getComputedStyle(this.el.root);
        const tok = (name: string): string => cs.getPropertyValue(name).trim();
        this.fg = toRGB(tok('--gh-fg') || cs.color, [23, 23, 23]);
        this.bg = toRGB(tok('--gh-bg'), lum(this.fg) > 0.5 ? [17, 17, 16] : [235, 233, 229]);
        const dark = lum(this.bg) < 0.45;
        const m = /^var\((--[\w-]+)\)$/.exec(this.accentCss.trim());
        const accent = toRGB(m ? tok(m[1]) : this.accentCss, this.fg);
        const all = paletteFor(accent, this.fg, this.bg, dark);
        for (let k = 0; k < 5; k++) {
            for (let ch = 0; ch < 3; ch++) {
                this.colGoal[k * 3 + ch] = all[k][ch];
            }
        }
        if (!this.colReady || this.reduced || !this.inView) {
            this.col.set(this.colGoal);
            this.colReady = true;
        }
        this.font = `500 10.5px ${cs.fontFamily || 'sans-serif'}`;
        this.measureLabels();
        this.updateFit();
        this.opts.onPalette?.(all.map(c => rgbS(c[0], c[1], c[2])));
        this.kick();
    }

    /** Size of the stage changed (also called by the own ResizeObserver) */
    relayout(): void {
        const w = Math.round(this.el.stage.clientWidth);
        const h = Math.round(this.el.stage.clientHeight);
        this.W = w;
        this.H = h;
        if (!w || !h) {
            return;
        }
        this.gutter = w < 520 ? 0 : this.labelW;
        this.dpr = Math.min(2, window.devicePixelRatio || 1);
        const c = this.el.canvas;
        c.width = Math.max(1, Math.round(w * this.dpr));
        c.height = Math.max(1, Math.round(h * this.dpr));
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
        this.updateFit();
        this.draw();
    }

    /* ---------- internals ---------- */

    private goal(): number {
        return this.view === '3d' ? 1 : 0;
    }

    private enter(): void {
        if (this.entered) {
            return;
        }
        this.entered = true;
        this.t = 0;
        this.updateTarget();
    }

    private updateTarget(): void {
        if (!this.entered) {
            return;
        }
        const goal = this.goal();
        if (goal !== this.target) {
            this.target = goal;
            if (goal === 0) {
                this.yawGoal = 0;
                this.elevGoal = 0;
            }
        }
        this.kick();
    }

    private updateCursor(): void {
        const c = this.el.canvas;
        c.style.cursor = this.opts.interactive && this.target === 1 ? 'grab' : 'default';
        c.style.touchAction = this.opts.interactive && this.target === 1 ? 'pan-y' : 'auto';
    }

    private measureLabels(): void {
        const ctx = this.ctx;
        const m = this.model;
        if (!ctx || !m) {
            return;
        }
        ctx.font = this.font;
        const widths = [20];
        m.weekdayRows.forEach(r => widths.push(ctx.measureText(r.label).width));
        if (m.N > 1) {
            m.strips.forEach(s => widths.push(ctx.measureText(s.label).width));
        }
        this.labelW = Math.ceil(Math.max(...widths)) + 8;
        if (this.W) {
            this.gutter = this.W < 520 ? 0 : this.labelW;
        }
    }

    private riseAt(t: number, i: number): number {
        const weeks = this.weeks;
        const rows = this.rows;
        const w = weeks > 1 ? this.wk[i] / (weeks - 1) : 0;
        const d = rows > 1 ? this.dy[i] / (rows - 1) : 0;
        return easeOut((t - (w * 0.36 + d * 0.06)) / (1 - WAVE));
    }

    private extent(cam: Cam, e: number, zs: Float32Array): { minx: number; maxx: number; miny: number; maxy: number } {
        const w = lerp(0.78, 0.9, e);
        const off = (1 - w) / 2;
        let minx = Infinity;
        let maxx = -Infinity;
        let miny = Infinity;
        let maxy = -Infinity;
        const add = (x: number, y: number, z: number): void => {
            const p = project(cam, x, y, z);
            if (p[0] < minx) {
                minx = p[0];
            }
            if (p[0] > maxx) {
                maxx = p[0];
            }
            if (p[1] < miny) {
                miny = p[1];
            }
            if (p[1] > maxy) {
                maxy = p[1];
            }
        };
        for (let i = 0; i < this.n; i++) {
            const x0 = this.wk[i] + off;
            const y0 = this.dy[i] + off;
            const z = zs[i];
            add(x0, y0, z);
            add(x0 + w, y0, z);
            add(x0, y0 + w, z);
            add(x0 + w, y0 + w, 0);
            add(x0, y0 + w, 0);
            add(x0 + w, y0, 0);
        }
        const R = this.rows;
        add(0, R + 1.5 * e, 0);
        add(this.weeks, R + 1.5 * e, 0);
        if (this.model && this.model.N > 1) {
            // room for the year labels on the left
            for (const st of this.model.strips) {
                add(-3 * e, st.y + 3.5, 0);
            }
        }
        return { minx, maxx, miny, maxy };
    }

    /** Scale and offset that center the bounding box `b` in the stage, scaled by `k` */
    private fit(b: { minx: number; maxx: number; miny: number; maxy: number }, e: number, k: number): Fit {
        const pad = lerp(2, 20, e);
        const left = pad + this.gutter * (1 - e);
        const top = pad + 20 * (1 - e);
        const aw = Math.max(1, this.W - left - pad);
        const ah = Math.max(1, this.H - top - pad);
        const bw = Math.max(1e-6, b.maxx - b.minx);
        const bh = Math.max(1e-6, b.maxy - b.miny);
        const s = Math.min(aw / bw, ah / bh) * k;
        return { s, ox: left + (aw - bw * s) / 2 - b.minx * s, oy: top + (ah - bh * s) / 2 - b.miny * s };
    }

    /** Finds the largest scale (0.3..1) at which the final 3D skyline and its labels leave the keep-out areas free */
    private updateFit(): void {
        const m = this.model;
        const ctx = this.ctx;
        const { W, H, n } = this;
        if (!this.keepOut || !m || !ctx || !W || !H || !n) {
            this.fitK = 1;
            return;
        }
        const margin = 8;
        const rects: Rect[] = this.keepOut.map(a => ({
            x: (a.corner === 'tr' ? W - a.inset - a.w : a.inset) - margin,
            y: (a.corner === 'tr' ? a.inset : H - a.inset - a.h) - margin,
            w: a.w + 2 * margin,
            h: a.h + 2 * margin,
        }));
        const cam = camera(1);
        const b = this.extent(cam, 1, this.hTo);
        const w = 0.9;
        const off = 0.05;
        const R = this.rows;
        ctx.font = this.font;
        const monthW = m.months.map(mo => ctx.measureText(mo.label).width);
        const stripW = m.strips.map(st => ctx.measureText(st.label).width);
        const hitBox = (x: number, y: number, bw: number, bh: number): boolean =>
            rects.some(r => x < r.x + r.w && x + bw > r.x && y < r.y + r.h && y + bh > r.y);
        const overlaps = (k: number): boolean => {
            const { s, ox, oy } = this.fit(b, 1, k);
            const px = (x: number, y: number): number => ox + (x * cam.cs - y * cam.sn) * s;
            const py = (x: number, y: number, z: number): number =>
                oy + ((x * cam.sn + y * cam.cs) * cam.se - z * cam.ce) * s;
            const inside = (x: number, y: number): boolean =>
                rects.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
            for (let i = 0; i < n; i++) {
                const x0 = this.wk[i] + off;
                const y0 = this.dy[i] + off;
                const z = this.hTo[i];
                if (
                    inside(px(x0, y0), py(x0, y0, z)) ||
                    inside(px(x0 + w, y0), py(x0 + w, y0, z)) ||
                    inside(px(x0, y0 + w), py(x0, y0 + w, z)) ||
                    inside(px(x0 + w, y0 + w), py(x0 + w, y0 + w, 0)) ||
                    inside(px(x0, y0 + w), py(x0, y0 + w, 0)) ||
                    inside(px(x0 + w, y0), py(x0 + w, y0, 0))
                ) {
                    return true;
                }
            }
            for (let j = 0; j < m.months.length; j++) {
                const mo = m.months[j];
                if (hitBox(px(mo.week + 0.5, R + 0.3), py(mo.week + 0.5, R + 0.3, 0) + 2, monthW[j], 12)) {
                    return true;
                }
            }
            if (m.N > 1) {
                for (let j = 0; j < m.strips.length; j++) {
                    const st = m.strips[j];
                    const x = px(-0.6, st.y + 3.5);
                    if (hitBox(x - stripW[j], py(-0.6, st.y + 3.5, 0) - 7, stripW[j], 14)) {
                        return true;
                    }
                }
            }
            return false;
        };
        let k = 1;
        if (overlaps(1)) {
            let lo = 0.3;
            let hi = 1;
            for (let it = 0; it < 9; it++) {
                const mid = (lo + hi) / 2;
                if (overlaps(mid)) {
                    hi = mid;
                } else {
                    lo = mid;
                }
            }
            k = lo;
        }
        this.fitK = k;
        this.opts.onFit?.(k);
    }

    private draw(): void {
        const ctx = this.ctx;
        const m = this.model;
        const { W, H, n } = this;
        if (!ctx || !m || !W || !H) {
            return;
        }
        const dpr = this.dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (!n) {
            return;
        }
        const e = easeIO(this.t);
        const cam = camera(e, this.yaw, this.elev);
        for (let i = 0; i < n; i++) {
            this.zs[i] = this.riseAt(this.t, i) * this.hgt[i];
        }
        const b = this.extent(cam, e, this.zs);
        const { s, ox, oy } = this.fit(b, e, this.keepOut ? lerp(1, this.fitK, e) : 1);
        const { cs, sn, se, ce } = cam;
        const px = (x: number, y: number): number => ox + (x * cs - y * sn) * s;
        const py = (x: number, y: number, z: number): number => oy + ((x * sn + y * cs) * se - z * ce) * s;

        // painter's order: back to front (only re-sorted when the camera turns)
        const key = Math.round(sn * 1e4) * 1e5 + Math.round(cs * 1e4);
        if (key !== this.orderKey) {
            const wk = this.wk;
            const dy = this.dy;
            this.order.sort(
                (a, c) => (wk[a] + 0.5) * sn + (dy[a] + 0.5) * cs - ((wk[c] + 0.5) * sn + (dy[c] + 0.5) * cs),
            );
            this.orderKey = key;
        }
        const w = lerp(0.78, 0.9, e);
        const off = (1 - w) / 2;
        const radius = lerp(0.17, 0.03, e) * s;
        const outline = (1 - e) * 0.07;
        const lift = 0.7 * e;
        const col = this.col;
        const fg = this.fg;
        const ex = col[0];
        const ey = col[1];
        const ez = col[2];
        const polys = this.polys;
        const outlineCss = outline > 0.004 ? rgbaS(fg, outline) : '';
        for (let k = 0; k < n; k++) {
            const i = this.order[k];
            const x0 = this.wk[i] + off;
            const y0 = this.dy[i] + off;
            const x1 = x0 + w;
            const y1 = y0 + w;
            const hv = this.hover[i];
            const z = this.zs[i] + hv * lift;
            const o = i * 24;
            // top face
            polys[o] = px(x0, y0);
            polys[o + 1] = py(x0, y0, z);
            polys[o + 2] = px(x1, y0);
            polys[o + 3] = py(x1, y0, z);
            polys[o + 4] = px(x1, y1);
            polys[o + 5] = py(x1, y1, z);
            polys[o + 6] = px(x0, y1);
            polys[o + 7] = py(x0, y1, z);
            // front face (y1)
            polys[o + 8] = px(x0, y1);
            polys[o + 9] = py(x0, y1, 0);
            polys[o + 10] = px(x1, y1);
            polys[o + 11] = py(x1, y1, 0);
            polys[o + 12] = polys[o + 4];
            polys[o + 13] = polys[o + 5];
            polys[o + 14] = polys[o + 6];
            polys[o + 15] = polys[o + 7];
            // side face (x1)
            polys[o + 16] = px(x1, y0);
            polys[o + 17] = py(x1, y0, 0);
            polys[o + 18] = polys[o + 10];
            polys[o + 19] = polys[o + 11];
            polys[o + 20] = polys[o + 4];
            polys[o + 21] = polys[o + 5];
            polys[o + 22] = polys[o + 2];
            polys[o + 23] = polys[o + 3];
            const tall = z * ce * s;
            let f = 0;
            if (tall > 0.35 && w * cs * s > 0.35) {
                f |= 1;
            }
            if (tall > 0.35 && w * sn * s > 0.35) {
                f |= 2;
            }
            this.faces[i] = f;
            const L = this.lv[i] * 3;
            let r = col[L];
            let g = col[L + 1];
            let bl = col[L + 2];
            const d = this.dim[i];
            if (d > 0.002) {
                r += (ex - r) * 0.72 * d;
                g += (ey - g) * 0.72 * d;
                bl += (ez - bl) * 0.72 * d;
            }
            if (hv > 0.002) {
                const mm = 0.16 * hv;
                r += (fg[0] - r) * mm;
                g += (fg[1] - g) * mm;
                bl += (fg[2] - bl) * mm;
            }
            if (f & 1) {
                ctx.beginPath();
                quadPath(ctx, polys, o + 8, 0);
                ctx.fillStyle = rgbS(r * 0.84, g * 0.84, bl * 0.84);
                ctx.fill();
            }
            if (f & 2) {
                ctx.beginPath();
                quadPath(ctx, polys, o + 16, 0);
                ctx.fillStyle = rgbS(r * 0.68, g * 0.68, bl * 0.68);
                ctx.fill();
            }
            ctx.beginPath();
            quadPath(ctx, polys, o, radius);
            ctx.fillStyle = rgbS(r, g, bl);
            ctx.fill();
            if (outlineCss) {
                ctx.strokeStyle = outlineCss;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            if (hv > 0.02) {
                ctx.strokeStyle = rgbaS(fg, 0.85 * hv);
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }

        // labels: months on top and weekdays / years on the left in 2D, months along the front edge in 3D
        const muted = mixRGB(this.bg, fg, 0.55);
        ctx.font = this.font;
        // right-aligned year labels: skipped where they would overlap (small skyline, several years)
        const placed: Rect[] = [];
        const roomFor = (label: string, x: number, y: number): boolean => {
            const tw = ctx.measureText(label).width;
            const r = { x: x - tw - 2, y: y - 7, w: tw + 4, h: 14 };
            if (placed.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)) {
                return false;
            }
            placed.push(r);
            return true;
        };
        // a tiny skyline (cells of less than 3.5 px) gets no month and weekday labels: they would cover it
        const tiny = s < 3.5;
        const a2 = 1 - smooth(0, 0.4, e);
        const a3 = smooth(0.62, 1, e);
        if (a2 > 0.004) {
            ctx.fillStyle = rgbaS(muted, a2);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            let edge = -Infinity;
            for (const mo of tiny ? [] : m.months) {
                const x = px(mo.week + off, -0.3);
                const tw = ctx.measureText(mo.label).width;
                if (x < edge || x + tw > W) {
                    continue;
                }
                ctx.fillText(mo.label, x, py(mo.week + off, -0.3, 0) - 3);
                edge = x + tw + 6;
            }
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            if (this.gutter > 0) {
                for (const r of tiny ? [] : m.weekdayRows) {
                    ctx.fillText(r.label, px(0, r.day + 0.5) - 6, py(0, r.day + 0.5, 0));
                }
                if (m.N > 1) {
                    for (const st of m.strips) {
                        const lx = px(0, st.y + 3.5) - 6;
                        const ly = py(0, st.y + 3.5, 0);
                        if (roomFor(st.label, lx, ly)) {
                            ctx.fillText(st.label, lx, ly);
                        }
                    }
                }
            }
        }
        if (a3 > 0.004) {
            ctx.fillStyle = rgbaS(muted, a3);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            let edge = -Infinity;
            const R = this.rows;
            for (const mo of tiny ? [] : m.months) {
                const x = px(mo.week + 0.5, R + 0.3);
                const tw = ctx.measureText(mo.label).width;
                if (x < edge || x + tw > W) {
                    continue;
                }
                ctx.fillText(mo.label, x, py(mo.week + 0.5, R + 0.3, 0) + 2);
                edge = x + tw + 10;
            }
            if (m.N > 1) {
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                // halo in the background color: the labels stay readable in front of tall bars
                ctx.lineJoin = 'round';
                ctx.lineWidth = 4;
                ctx.strokeStyle = rgbaS(this.bg, 0.85 * a3);
                placed.length = 0;
                for (const st of m.strips) {
                    const lx = px(-0.6, st.y + 3.5);
                    const ly = py(-0.6, st.y + 3.5, 0);
                    if (roomFor(st.label, lx, ly)) {
                        ctx.strokeText(st.label, lx, ly);
                        ctx.fillText(st.label, lx, ly);
                    }
                }
            }
        }

        // tooltip above the active cell
        const ai = this.activeIdx;
        if (ai >= 0 && ai < n) {
            const z = this.zs[ai] + this.hover[ai] * lift;
            const tx = px(this.wk[ai] + 0.5, this.dy[ai] + 0.5);
            const x0 = this.wk[ai] + off;
            const y0 = this.dy[ai] + off;
            const ty = Math.min(py(x0, y0, z), py(x0 + w, y0, z), py(x0, y0 + w, z));
            const tip = this.el.tip;
            const tw = tip.offsetWidth;
            const half = tw / 2;
            const cx = Math.min(W - half - 2, Math.max(half + 2, tx));
            // below the cell when there is no room above
            const above = ty - 8 - tip.offsetHeight > -12;
            const yy = above ? ty - 8 : py(x0, y0 + w, 0) + 10;
            tip.style.transform = `translate(${(cx - half).toFixed(1)}px,${yy.toFixed(1)}px)${above ? ' translateY(-100%)' : ''}`;
            tip.dataset.below = above ? '0' : '1';
            tip.style.setProperty('--gh-sky-arrow', `${(tx - cx + half).toFixed(1)}px`);
        }
    }

    private tick = (now: number): void => {
        this.raf = 0;
        if (this.destroyed) {
            return;
        }
        if (document.hidden || !this.inView) {
            // nobody sees it: finish all motion and draw the final picture once
            this.settle();
            this.draw();
            return;
        }
        const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
        this.last = now;
        let moving = false;
        const reduced = this.reduced;
        if (this.t !== this.target) {
            const step = reduced ? 1 : (dt * 1000) / this.duration;
            this.t = this.target > this.t ? Math.min(this.target, this.t + step) : Math.max(this.target, this.t - step);
            moving = true;
            if (this.t === this.target) {
                this.updateCursor();
            }
        }
        if (this.blend < 1) {
            this.blend = reduced ? 1 : Math.min(1, this.blend + dt / 0.75);
            const k = easeIO(this.blend);
            for (let i = 0; i < this.n; i++) {
                this.hgt[i] = lerp(this.hFrom[i], this.hTo[i], k);
            }
            moving = true;
        }
        const ko = reduced ? 1 : 1 - Math.exp(-dt * 12);
        this.yaw += (this.yawGoal - this.yaw) * ko;
        this.elev += (this.elevGoal - this.elev) * ko;
        if (Math.abs(this.yawGoal - this.yaw) > 1e-4 || Math.abs(this.elevGoal - this.elev) > 1e-4) {
            moving = true;
        } else {
            this.yaw = this.yawGoal;
            this.elev = this.elevGoal;
        }
        const kc = reduced ? 1 : 1 - Math.exp(-dt * 7);
        for (let k = 0; k < 15; k++) {
            const d = this.colGoal[k] - this.col[k];
            if (Math.abs(d) > 0.4) {
                this.col[k] += d * kc;
                moving = true;
            } else {
                this.col[k] = this.colGoal[k];
            }
        }
        const kh = reduced ? 1 : 1 - Math.exp(-dt * 16);
        const kd = reduced ? 1 : 1 - Math.exp(-dt * 10);
        const ll = this.legendLevel;
        for (let i = 0; i < this.n; i++) {
            const hg = i === this.activeIdx ? 1 : 0;
            const dg = ll >= 0 && this.lv[i] !== ll ? 1 : 0;
            const h = this.hover[i];
            const d = this.dim[i];
            if (h !== hg) {
                this.hover[i] = Math.abs(hg - h) < 0.003 ? hg : h + (hg - h) * kh;
                moving = true;
            }
            if (d !== dg) {
                this.dim[i] = Math.abs(dg - d) < 0.003 ? dg : d + (dg - d) * kd;
                moving = true;
            }
        }
        this.draw();
        if (moving) {
            this.raf = requestAnimationFrame(this.tick);
        }
    };

    /** Jumps to the end of every running animation */
    private settle(): void {
        this.t = this.target;
        if (this.blend < 1) {
            this.blend = 1;
            this.hgt.set(this.hTo);
        }
        this.yaw = this.yawGoal;
        this.elev = this.elevGoal;
        this.col.set(this.colGoal);
        const ll = this.legendLevel;
        for (let i = 0; i < this.n; i++) {
            this.hover[i] = i === this.activeIdx ? 1 : 0;
            this.dim[i] = ll >= 0 && this.lv[i] !== ll ? 1 : 0;
        }
        this.updateCursor();
    }

    private kick(): void {
        if (this.raf || this.destroyed) {
            return;
        }
        if (document.hidden || !this.inView) {
            this.settle();
            this.draw();
            return;
        }
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.tick);
    }

    private refreshActive(): void {
        const next = this.hovered >= 0 ? this.hovered : this.pinned;
        if (next === this.activeIdx) {
            return;
        }
        this.activeIdx = next;
        const tip = this.el.tip;
        tip.style.opacity = next >= 0 ? '1' : '0';
        tip.setAttribute('aria-hidden', next >= 0 ? 'false' : 'true');
        if (next >= 0 && this.model) {
            const [strong, rest] = this.opts.tip(this.model.cells[next]);
            this.tipText.textContent = strong;
            this.tipRest.textContent = rest ? ` ${rest}` : '';
        }
        this.kick();
    }

    private hit(x: number, y: number): number {
        const polys = this.polys;
        for (let k = this.n - 1; k >= 0; k--) {
            const i = this.order[k];
            const o = i * 24;
            if (
                inQuad(polys, o, x, y) ||
                (this.faces[i] & 1 && inQuad(polys, o + 8, x, y)) ||
                (this.faces[i] & 2 && inQuad(polys, o + 16, x, y))
            ) {
                return i;
            }
        }
        return -1;
    }

    private local(ev: PointerEvent): [number, number] {
        const r = this.el.canvas.getBoundingClientRect();
        // the widget may be scaled by vis-2 (CSS transform): map to canvas pixels
        const sx = r.width ? this.W / r.width : 1;
        const sy = r.height ? this.H / r.height : 1;
        return [(ev.clientX - r.left) * sx, (ev.clientY - r.top) * sy];
    }

    private onIntersect = (entries: IntersectionObserverEntry[]): void => {
        this.inView = entries.some(x => x.isIntersecting);
        if (!this.entered) {
            if (this.inView) {
                this.enter();
            } else {
                // not visible yet: show the final picture, the rise plays when it scrolls into view
                this.t = this.goal();
                this.target = this.t;
                this.draw();
            }
        }
        this.kick();
    };

    private onVisibility = (): void => {
        if (!document.hidden) {
            this.kick();
        }
    };

    private onMotion = (): void => {
        this.reduced = !!this.reduceMq?.matches;
        this.kick();
    };

    private onDown = (ev: PointerEvent): void => {
        if (ev.button !== 0) {
            return;
        }
        const orbit = this.opts.interactive && this.target === 1;
        this.drag = {
            id: ev.pointerId,
            x: ev.clientX,
            y: ev.clientY,
            yaw: this.yawGoal,
            elev: this.elevGoal,
            moved: false,
            orbit,
            mouse: ev.pointerType === 'mouse',
        };
        if (orbit) {
            try {
                this.el.canvas.setPointerCapture(ev.pointerId);
            } catch {
                // ignore
            }
        }
    };

    private onMove = (ev: PointerEvent): void => {
        const drag = this.drag;
        if (drag && drag.orbit && ev.pointerId === drag.id) {
            const dx = ev.clientX - drag.x;
            const dyy = ev.clientY - drag.y;
            if (drag.moved || Math.hypot(dx, dyy) > 4) {
                drag.moved = true;
                this.yawGoal = Math.min(YAWR[1] - YAW3, Math.max(YAWR[0] - YAW3, drag.yaw + dx * 0.006));
                if (drag.mouse) {
                    this.elevGoal = Math.min(ELEVR[1] - ELEV3, Math.max(ELEVR[0] - ELEV3, drag.elev + dyy * 0.004));
                }
                this.el.canvas.style.cursor = 'grabbing';
                this.hovered = -1;
                this.refreshActive();
                this.kick();
                return;
            }
        }
        if (ev.pointerType !== 'mouse') {
            return;
        }
        const [x, y] = this.local(ev);
        const i = this.hit(x, y);
        if (i !== this.hovered) {
            this.hovered = i;
            this.refreshActive();
        }
        if (this.opts.interactive) {
            this.el.canvas.style.cursor = this.target === 1 ? 'grab' : i >= 0 ? 'pointer' : 'default';
        }
    };

    private onUp = (ev: PointerEvent): void => {
        const drag = this.drag;
        if (!drag || ev.pointerId !== drag.id) {
            return;
        }
        this.drag = null;
        const c = this.el.canvas;
        if (c.hasPointerCapture(ev.pointerId)) {
            c.releasePointerCapture(ev.pointerId);
        }
        this.updateCursor();
        if (drag.moved || !this.opts.interactive) {
            return;
        }
        const [x, y] = this.local(ev);
        const i = this.hit(x, y);
        this.pinned = i === this.pinned ? -1 : i;
        if (ev.pointerType !== 'mouse') {
            this.hovered = -1;
        }
        this.refreshActive();
    };

    private onCancel = (): void => {
        this.drag = null;
    };

    private onLeave = (): void => {
        if (this.drag) {
            return;
        }
        this.hovered = -1;
        this.refreshActive();
    };

    private onDbl = (): void => {
        this.yawGoal = 0;
        this.elevGoal = 0;
        this.kick();
    };

    /**
     * Arrow keys walk through the days of one year (left/right: week, up/down: day), Home/End jump to its first/last
     * day, PageUp/PageDown to the same day one year earlier/later, Escape closes the tooltip.
     */
    private onKey = (ev: KeyboardEvent): void => {
        const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Escape'];
        const m = this.model;
        const n = this.n;
        if (!keys.includes(ev.key) || !n || !m) {
            return;
        }
        const cur = this.pinned >= 0 ? this.pinned : this.activeIdx;
        if (ev.key === 'Escape') {
            if (cur >= 0) {
                ev.preventDefault();
                this.pinned = -1;
                this.hovered = -1;
                this.refreshActive();
            }
            return;
        }
        ev.preventDefault();
        let i = this.endIdx;
        if (cur >= 0) {
            // all stripes (years) have the same number of days, the most recent one comes first
            const len = Math.max(1, Math.round(n / m.N));
            let strip = Math.floor(cur / len);
            let pos = cur - strip * len;
            if (ev.key === 'ArrowLeft') {
                pos = pos >= 7 ? pos - 7 : pos;
            } else if (ev.key === 'ArrowRight') {
                pos = Math.min(len - 1, pos + 7);
            } else if (ev.key === 'ArrowUp') {
                pos = Math.max(0, pos - 1);
            } else if (ev.key === 'ArrowDown') {
                pos = Math.min(len - 1, pos + 1);
            } else if (ev.key === 'Home') {
                pos = 0;
            } else if (ev.key === 'End') {
                pos = len - 1;
            } else if (ev.key === 'PageUp') {
                strip = Math.min(m.N - 1, strip + 1);
            } else {
                strip = Math.max(0, strip - 1);
            }
            i = strip * len + pos;
        }
        this.pinned = Math.max(0, Math.min(n - 1, i));
        this.hovered = -1;
        this.refreshActive();
        if (this.el.sr) {
            this.el.sr.textContent = this.opts.describe(m.cells[this.pinned]);
        }
    };

    private onBlur = (): void => {
        this.pinned = -1;
        this.refreshActive();
    };
}
