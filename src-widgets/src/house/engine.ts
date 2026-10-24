/* Canvas engine of the isometric glass house: all floors as glass slabs with rooms and walls, exploded or stacked
 * (with roof), drag to rotate, room hit test and a smooth camera that fits the visible part.
 * It renders only while something moves (transitions, dragging, optional slow auto rotation) and stops otherwise.
 * The loop pauses while the page is hidden or the canvas is off screen; prefers-reduced-motion disables transitions
 * and auto rotation. Device markers and labels are DOM elements of the widget, placed in the onFrame callback. */
import type { HousePlan, HouseRoom } from './plan';
import { inPoly } from './plan';

export type RGB = [number, number, number];

export type HouseMode = 'exploded' | 'stacked';
export type AutoRotate = 'off' | 'sway' | 'spin';

export interface HouseInsets {
    t: number;
    r: number;
    b: number;
    l: number;
}

export interface HouseView {
    mode: HouseMode;
    /** Index of the focused floor, -1 = all */
    focus: number;
    /** Room view */
    room: HouseRoom | null;
    /** Wall height in the exploded view, fraction of the storey height */
    wallScale: number;
    roof: boolean;
    auto: AutoRotate;
    /** Start angles (radians) */
    yaw: number;
    tilt: number;
    interactive: boolean;
    insets: HouseInsets;
}

export interface HouseGlow {
    floor: number;
    room: HouseRoom | null;
    x: number;
    y: number;
}

/** States that change the drawing of rooms */
export interface HouseMarks {
    lit: Set<HouseRoom>;
    open: Set<HouseRoom>;
    glows: HouseGlow[];
}

export interface HouseCallbacks {
    onFrame: () => void;
    onRoomClick: (room: HouseRoom | null) => void;
    onHover: (room: HouseRoom | null, x: number, y: number) => void;
}

interface Anim {
    e: number;
    roof: number;
    ground: number;
    wall: number;
    rf: number;
    fa: number[];
}

type P3 = [number, number, number];

/** '#rrggbb', '#rgb' or 'rgb(a)(…)' → RGB */
export function parseRgb(s: string, def: RGB = [128, 128, 128]): RGB {
    const t = (s || '').trim();
    let m = /^#([0-9a-f]{6})$/i.exec(t);
    if (m) {
        const n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(t);
    if (m) {
        return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
    }
    m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(t);
    return m ? [+m[1], +m[2], +m[3]] : def;
}

const FULL_WALL = 0.93;

/** Bounding box of an outline */
const footBox = (foot: [number, number][]): [number, number, number, number] =>
    foot.reduce<[number, number, number, number]>(
        (b, q) => [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])],
        [Infinity, Infinity, -Infinity, -Infinity],
    );
const GRAY = (): RGB => [128, 128, 128];
const IDLE_MS = 6000;

export class HouseEngine {
    private readonly wrap: HTMLElement;

    private readonly cv: HTMLCanvasElement;

    private readonly ctx: CanvasRenderingContext2D | null;

    private readonly cb: HouseCallbacks;

    private plan: HousePlan | null = null;

    private marks: HouseMarks = { lit: new Set(), open: new Set(), glows: [] };

    private view: HouseView;

    private resolve: (name: string) => RGB = GRAY;

    private colorCache = new Map<string, RGB>();

    private w = 0;

    private h = 0;

    private dpr = 1;

    private S: Anim = { e: 1, roof: 0, ground: 0, wall: 0.4, rf: 0, fa: [] };

    private T: Anim = { e: 1, roof: 0, ground: 0, wall: 0.4, rf: 0, fa: [] };

    private yaw = -0.5;

    private elev = 0.66;

    private baseYaw = -0.5;

    private baseElev = 0.66;

    private scale = 0;

    private ox = 0;

    private oy = 0;

    private cam = { cs: 1, sn: 0, se: 0.6, ce: 0.8 };

    private cx = 0;

    private cy = 0;

    private gap = 3.4;

    private raf = 0;

    private lastT = 0;

    private lastDraw = 0;

    private snap = true;

    private dirty = true;

    private lastUser = -1e9;

    private hover: HouseRoom | null = null;

    /** Room that was shown last (for fading out of the room view) */
    private lastRoom: HouseRoom | null = null;

    private drag: { x: number; y: number; yaw: number; elev: number; moved: boolean; id: number } | null = null;

    private inView = true;

    private reduced: boolean;

    private readonly mql: MediaQueryList | null;

    private io: IntersectionObserver | null = null;

    private t0 = performance.now();

    constructor(wrap: HTMLElement, canvas: HTMLCanvasElement, view: HouseView, cb: HouseCallbacks) {
        this.wrap = wrap;
        this.cv = canvas;
        this.ctx = canvas.getContext('2d');
        this.cb = cb;
        this.view = view;
        this.baseYaw = this.yaw = view.yaw;
        this.baseElev = this.elev = view.tilt;
        this.mql = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        this.reduced = !!this.mql?.matches;
        this.mql?.addEventListener('change', this.onMotionPref);
        document.addEventListener('visibilitychange', this.onVisibility);
        if (typeof IntersectionObserver !== 'undefined') {
            this.io = new IntersectionObserver(entries => {
                this.inView = entries.some(e => e.isIntersecting);
                this.kick();
            });
            this.io.observe(canvas);
        }
        wrap.addEventListener('pointerdown', this.onDown);
        wrap.addEventListener('dblclick', this.onDbl);
        wrap.addEventListener('pointerleave', this.onLeave);
        window.addEventListener('pointermove', this.onMove);
        window.addEventListener('pointerup', this.onUp);
        window.addEventListener('pointercancel', this.onCancel);
    }

    destroy(): void {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.mql?.removeEventListener('change', this.onMotionPref);
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.io?.disconnect();
        this.io = null;
        this.wrap.removeEventListener('pointerdown', this.onDown);
        this.wrap.removeEventListener('dblclick', this.onDbl);
        this.wrap.removeEventListener('pointerleave', this.onLeave);
        window.removeEventListener('pointermove', this.onMove);
        window.removeEventListener('pointerup', this.onUp);
        window.removeEventListener('pointercancel', this.onCancel);
        this.wrap.classList.remove('drag');
    }

    /* ---------- inputs ---------- */

    setSize(w: number, h: number): void {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (w === this.w && h === this.h && dpr === this.dpr) {
            return;
        }
        const first = !this.w || !this.h;
        this.w = w;
        this.h = h;
        this.dpr = dpr;
        this.cv.width = Math.max(1, Math.round(w * dpr));
        this.cv.height = Math.max(1, Math.round(h * dpr));
        if (first) {
            this.snap = true;
        }
        this.adaptGap();
        this.dirty = true;
        this.kick();
    }

    setPlan(plan: HousePlan): void {
        if (plan === this.plan) {
            return;
        }
        const first = !this.plan;
        this.plan = plan;
        this.cx = (plan.box[0] + plan.box[2]) / 2;
        this.cy = (plan.box[1] + plan.box[3]) / 2;
        this.hover = null;
        this.lastRoom = null;
        const n = plan.floors.length;
        this.S.fa = Array.from({ length: n }, (_, i) => this.S.fa[i] ?? 1);
        this.applyTargets();
        this.adaptGap();
        if (first) {
            this.snap = true;
        }
        this.dirty = true;
        this.kick();
    }

    setMarks(m: HouseMarks): void {
        this.marks = m;
        this.dirty = true;
        this.kick();
    }

    /** Color resolver for names like 'fg', 'sun', 'home' or CSS colors; call again when the theme changes */
    setPalette(resolve: (name: string) => RGB): void {
        this.resolve = resolve;
        this.colorCache.clear();
        this.dirty = true;
        this.kick();
    }

    setView(v: HouseView): void {
        const old = this.view;
        this.view = v;
        if (v.yaw !== old.yaw || v.tilt !== old.tilt) {
            this.baseYaw = v.yaw;
            this.baseElev = v.tilt;
        }
        if (v.room) {
            this.lastRoom = v.room;
        }
        if (!v.interactive && this.drag) {
            this.drag = null;
            this.wrap.classList.remove('drag');
        }
        if (!v.interactive && this.hover) {
            this.hover = null;
            this.cb.onHover(null, 0, 0);
        }
        this.applyTargets();
        this.adaptGap();
        this.dirty = true;
        this.kick();
    }

    /**
     * Gap between the floors of the exploded house: as large as in the original for upright widgets,
     * smaller for wide ones so that the house fills the widget. Depends on the start angles, not on the
     * current rotation (the floors do not breathe while the house turns). Kept while a room is shown.
     */
    private adaptGap(): void {
        const plan = this.plan;
        const v = this.view;
        if (!plan || !this.w || !this.h || v.room) {
            return;
        }
        const n = plan.floors.length;
        const max = 1.26 * plan.hAvg;
        if (n < 2) {
            this.gap = max;
            return;
        }
        const aw = Math.max(30, this.w - v.insets.l - v.insets.r);
        const ah = Math.max(30, this.h - v.insets.t - v.insets.b);
        const cs = Math.cos(v.yaw);
        const sn = Math.sin(v.yaw);
        const se = Math.sin(v.tilt);
        const ce = Math.cos(v.tilt);
        let mnx = 1e9;
        let mxx = -1e9;
        let mny = 1e9;
        let mxy = -1e9;
        const wall = Math.max(0.05, Math.min(1, v.wallScale));
        plan.floors.forEach(f => {
            const [x0, y0, x1, y1] = f.box;
            for (const [x, y] of [
                [x0, y0],
                [x1, y0],
                [x1, y1],
                [x0, y1],
            ]) {
                const dx = x - this.cx;
                const dy = y - this.cy;
                const xr = dx * cs - dy * sn;
                const yr = dx * sn + dy * cs;
                for (const z of [f.z, f.z + wall * f.h]) {
                    const py = yr * se - z * ce;
                    mnx = Math.min(mnx, xr);
                    mxx = Math.max(mxx, xr);
                    mny = Math.min(mny, py);
                    mxy = Math.max(mxy, py);
                }
            }
        });
        const want = ((mxx - mnx) * ah) / aw - (mxy - mny);
        const g = want / ((n - 1) * Math.max(0.2, ce));
        this.gap = Math.max(0.35 * plan.hAvg, Math.min(max, g));
    }

    /** Back to the start angles */
    resetCamera(): void {
        this.baseYaw = this.view.yaw;
        this.baseElev = this.view.tilt;
        this.lastUser = -1e9;
        this.kick();
    }

    /* ---------- read access for the overlay ---------- */

    /** Screen position (CSS px) of a plan point at height z */
    project(x: number, y: number, z: number): [number, number] {
        const p = this.P(x, y, z);
        return [this.ox + p[0] * this.scale, this.oy + p[1] * this.scale];
    }

    floorZ(i: number): number {
        const f = this.plan?.floors[i];
        return f ? f.z + this.S.e * this.gap * i : 0;
    }

    floorAlpha(i: number): number {
        return this.S.fa[i] ?? 0;
    }

    /** 0 = stacked house, 1 = exploded */
    get explode(): number {
        return this.S.e;
    }

    /** Alpha of a room (dimmed around the room of the room view) */
    roomAlpha(r: HouseRoom): number {
        const sel = this.view.room || this.lastRoom;
        return sel && r !== sel ? 1 - 0.88 * this.S.rf : 1;
    }

    /** The camera has been fitted at least once */
    get ready(): boolean {
        return this.scale > 0;
    }

    /** Current scale of the drawing: CSS px per meter */
    get pxPerMeter(): number {
        return this.scale;
    }

    /* ---------- loop ---------- */

    private onMotionPref = (): void => {
        this.reduced = !!this.mql?.matches;
        this.kick();
    };

    private onVisibility = (): void => this.kick();

    /** A frame can be drawn (off-screen widgets still get single frames on changes, but no animation loop) */
    private canDraw(): boolean {
        return !document.hidden && this.w > 0 && this.h > 0 && !!this.plan && !!this.ctx;
    }

    private autoActive(): boolean {
        return this.view.auto !== 'off' && !this.reduced && !this.view.room;
    }

    /** Requests a frame (does nothing while a frame is pending) */
    kick(): void {
        if (!this.raf && this.canDraw()) {
            this.raf = requestAnimationFrame(this.frame);
        }
    }

    private applyTargets(): void {
        const v = this.view;
        const plan = this.plan;
        const n = plan ? plan.floors.length : 0;
        const room = v.room;
        const stacked = v.mode === 'stacked' && !room;
        const all = v.focus < 0 || v.focus >= n;
        this.T.e = v.mode === 'stacked' ? 0 : 1;
        this.T.roof = stacked && all && v.roof && !!plan?.roof ? 1 : 0;
        this.T.ground = stacked && all ? 1 : 0;
        this.T.wall = room || v.mode === 'stacked' ? FULL_WALL : Math.max(0.05, Math.min(1, v.wallScale));
        this.T.rf = room ? 1 : 0;
        this.T.fa = Array.from({ length: n }, (_, i) => {
            if (room) {
                return i === room.floor ? 1 : 0;
            }
            return all || i === v.focus ? 1 : v.mode === 'stacked' ? 0 : 0.07;
        });
    }

    private frame = (now: number): void => {
        this.raf = 0;
        if (!this.canDraw()) {
            this.lastT = 0;
            return;
        }
        // off screen: jump to the final state, draw once and do not loop
        const off = !this.inView;
        const dprNow = Math.min(2, window.devicePixelRatio || 1);
        if (dprNow !== this.dpr) {
            // moved to a screen with another pixel ratio
            this.dpr = dprNow;
            this.cv.width = Math.max(1, Math.round(this.w * dprNow));
            this.cv.height = Math.max(1, Math.round(this.h * dprNow));
            this.dirty = true;
        }
        const dt = this.lastT ? Math.min(0.05, (now - this.lastT) / 1000) : 0.016;
        this.lastT = now;
        const instant = this.snap || this.reduced || off;
        const S = this.S;
        const T = this.T;
        let moving = false;
        const k = instant ? 1 : 1 - Math.exp(-dt * 3.2);
        const step = (cur: number, tgt: number, eps = 0.002): number => {
            const d = tgt - cur;
            if (Math.abs(d) <= eps) {
                return tgt;
            }
            moving = true;
            return cur + d * k;
        };
        S.e = step(S.e, T.e);
        S.roof = step(S.roof, T.roof);
        S.ground = step(S.ground, T.ground);
        S.wall = step(S.wall, T.wall);
        S.rf = step(S.rf, T.rf);
        S.fa = T.fa.map((t, i) => step(S.fa[i] ?? t, t));
        if (S.rf === 0 && !this.view.room) {
            this.lastRoom = null;
        }

        // camera
        const idle = !this.drag && now - this.lastUser > IDLE_MS;
        const auto = this.autoActive();
        const autoOn = auto && idle;
        if (autoOn && this.view.auto === 'spin') {
            this.baseYaw += dt * 0.05;
            if (this.baseYaw > Math.PI * 4) {
                this.baseYaw -= Math.PI * 2;
                this.yaw -= Math.PI * 2;
            }
        }
        const t = (now - this.t0) / 1000;
        const yawT = this.baseYaw + (autoOn && this.view.auto === 'sway' ? 0.16 * Math.sin(t * 0.11) : 0);
        const ky = instant ? 1 : Math.min(1, dt * (autoOn ? 0.8 : 10));
        const camMoving = Math.abs(yawT - this.yaw) > 1e-4 || Math.abs(this.baseElev - this.elev) > 1e-4;
        this.yaw = Math.abs(yawT - this.yaw) <= 1e-4 ? yawT : this.yaw + (yawT - this.yaw) * ky;
        this.elev =
            Math.abs(this.baseElev - this.elev) <= 1e-4
                ? this.baseElev
                : this.elev + (this.baseElev - this.elev) * (instant ? 1 : Math.min(1, dt * 10));
        this.cam = {
            cs: Math.cos(this.yaw),
            sn: Math.sin(this.yaw),
            se: Math.sin(this.elev),
            ce: Math.cos(this.elev),
        };
        const F = this.fit();
        const kf = instant ? 1 : Math.min(1, dt * 4);
        const fitMoving =
            Math.abs(F.s - this.scale) > 0.005 || Math.abs(F.tx - this.ox) > 0.1 || Math.abs(F.ty - this.oy) > 0.1;
        if (fitMoving) {
            this.scale += (F.s - this.scale) * kf;
            this.ox += (F.tx - this.ox) * kf;
            this.oy += (F.ty - this.oy) * kf;
        } else {
            this.scale = F.s;
            this.ox = F.tx;
            this.oy = F.ty;
        }
        this.snap = false;

        const changing = moving || camMoving || fitMoving || !!this.drag?.moved;
        // auto rotation alone is drawn with about 30 fps
        if (changing || this.dirty) {
            if (!changing || !autoOn || moving || now - this.lastDraw >= 30) {
                this.draw();
                this.lastDraw = now;
                this.dirty = false;
                this.cb.onFrame();
            }
        }
        if ((changing || auto) && !off) {
            this.raf = requestAnimationFrame(this.frame);
        } else {
            this.lastT = 0;
        }
    };

    /* ---------- projection ---------- */

    private P(x: number, y: number, z: number): P3 {
        const c = this.cam;
        const dx = x - this.cx;
        const dy = y - this.cy;
        const xr = dx * c.cs - dy * c.sn;
        const yr = dx * c.sn + dy * c.cs;
        return [xr, yr * c.se - z * c.ce, yr * c.ce + z * c.se];
    }

    private proj(x: number, y: number, z: number): P3 {
        const p = this.P(x, y, z);
        return [this.ox + p[0] * this.scale, this.oy + p[1] * this.scale, p[2]];
    }

    private wallH(i: number): number {
        const f = this.plan!.floors[i];
        const h = this.S.wall * f.h;
        return f.attic ? Math.min(h, 0.9) : h;
    }

    /** Roof heights in the stacked house: eaves (k) and ridge (r) */
    private roofZ(): { k: number; r: number; x0: number; y0: number; x1: number; y1: number } | null {
        const plan = this.plan;
        const rf = plan?.roof;
        if (!plan || !rf) {
            return null;
        }
        const f = plan.floors[rf.base];
        const [x0, y0, x1, y1] = footBox(f.foot);
        const k = this.floorZ(rf.base) + rf.knee;
        const half = rf.ridge === 'x' ? (y1 - y0) / 2 : (x1 - x0) / 2;
        return { k, r: k + half * Math.tan(rf.pitch), x0, y0, x1, y1 };
    }

    private fit(): { s: number; tx: number; ty: number } {
        const plan = this.plan!;
        let mnx = 1e9;
        let mxx = -1e9;
        let mny = 1e9;
        let mxy = -1e9;
        const add = (x: number, y: number, z: number): void => {
            const p = this.P(x, y, z);
            mnx = Math.min(mnx, p[0]);
            mxx = Math.max(mxx, p[0]);
            mny = Math.min(mny, p[1]);
            mxy = Math.max(mxy, p[1]);
        };
        const room = this.view.room;
        if (room) {
            const z = this.floorZ(room.floor);
            const wh = FULL_WALL * plan.floors[room.floor].h;
            const [x0, y0, x1, y1] = room.box;
            const m = 0.35;
            for (const [x, y] of [
                [x0 - m, y0 - m],
                [x1 + m, y0 - m],
                [x1 + m, y1 + m],
                [x0 - m, y1 + m],
            ]) {
                add(x, y, z);
                add(x, y, z + wh);
            }
        } else {
            plan.floors.forEach((f, i) => {
                if ((this.S.fa[i] ?? 0) < 0.5) {
                    return;
                }
                const z = this.floorZ(i);
                const wh = this.wallH(i);
                const [x0, y0, x1, y1] = f.box;
                for (const [x, y] of [
                    [x0, y0],
                    [x1, y0],
                    [x1, y1],
                    [x0, y1],
                ]) {
                    add(x, y, z - 0.25);
                    add(x, y, z + wh);
                }
            });
            if (this.S.roof > 0.3) {
                const rz = this.roofZ();
                if (rz) {
                    add((rz.x0 + rz.x1) / 2, (rz.y0 + rz.y1) / 2, rz.r);
                }
            }
            if (mnx > mxx) {
                add(plan.box[0], plan.box[1], 0);
                add(plan.box[2], plan.box[3], 0);
            }
        }
        const ins = this.view.insets;
        const pad = Math.max(6, Math.min(26, Math.min(this.w, this.h) * 0.05));
        const aw = Math.max(30, this.w - ins.l - ins.r - pad * 2);
        const ah = Math.max(30, this.h - ins.t - ins.b - pad * 2);
        let s = Math.min(aw / Math.max(0.5, mxx - mnx), ah / Math.max(0.5, mxy - mny));
        if (room) {
            s = Math.min(s, 150);
        }
        return {
            s,
            tx: ins.l + pad + aw / 2 - ((mnx + mxx) / 2) * s,
            ty: ins.t + pad + ah / 2 - ((mny + mxy) / 2) * s,
        };
    }

    /* ---------- drawing ---------- */

    private rgb(name: string): RGB {
        let c = this.colorCache.get(name);
        if (!c) {
            c = this.resolve(name);
            this.colorCache.set(name, c);
        }
        return c;
    }

    private col(name: string, a: number): string {
        const c = this.rgb(name);
        return `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
    }

    private poly(pts: P3[], fill: string | null, stroke?: string | null, lw = 1, dash?: number[]): void {
        const ctx = this.ctx!;
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        if (stroke) {
            ctx.setLineDash(dash || []);
            ctx.lineWidth = lw;
            ctx.strokeStyle = stroke;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    private draw(): void {
        const ctx = this.ctx;
        const plan = this.plan;
        if (!ctx || !plan) {
            return;
        }
        const S = this.S;
        const dpr = this.dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        ctx.lineJoin = 'round';
        const sel = this.view.room || this.lastRoom;
        const lw = Math.max(0.6, Math.min(1.3, this.scale / 30));

        // ground around the house (stacked view)
        if (S.ground > 0.02) {
            const ga = S.ground;
            const z0 = this.floorZ(0) - 0.25;
            const [bx0, by0, bx1, by1] = plan.box;
            const m = 3;
            ctx.lineWidth = 1;
            ctx.strokeStyle = this.col('ok', 0.12 * ga);
            for (let y = by0 - m; y <= by1 + m + 0.01; y += 1.5) {
                const a = this.proj(bx0 - m, y, z0);
                const b = this.proj(bx1 + m, y, z0);
                ctx.beginPath();
                ctx.moveTo(a[0], a[1]);
                ctx.lineTo(b[0], b[1]);
                ctx.stroke();
            }
            this.poly(
                [
                    this.proj(bx0 - m, by0 - m, z0),
                    this.proj(bx1 + m, by0 - m, z0),
                    this.proj(bx1 + m, by1 + m, z0),
                    this.proj(bx0 - m, by1 + m, z0),
                ],
                this.col('ok', 0.06 * ga),
            );
        }

        plan.floors.forEach((f, i) => {
            const a = S.fa[i] ?? 0;
            if (a < 0.01) {
                return;
            }
            const z = this.floorZ(i);
            const wh = this.wallH(i);
            ctx.globalAlpha = a;

            // floor slab
            const top = f.foot.map(q => this.proj(q[0], q[1], z));
            const bot = f.foot.map(q => this.proj(q[0], q[1], z - 0.22));
            const sides: { d: number; q: P3[] }[] = [];
            for (let j = 0; j < f.foot.length; j++) {
                const n = (j + 1) % f.foot.length;
                sides.push({ d: (top[j][2] + top[n][2]) / 2, q: [top[j], top[n], bot[n], bot[j]] });
            }
            // the slab fades in the room view, the room stands alone
            ctx.globalAlpha = a * (1 - 0.8 * S.rf);
            sides
                .sort((x, y) => x.d - y.d)
                .forEach(q => this.poly(q.q, this.col('fg', 0.1), this.col('fg', 0.18), lw * 0.8));
            this.poly(top, this.col('bg', 0.62), this.col('fg', 0.3), lw * 1.2);

            // room floors
            f.rooms.forEach(r => {
                const ra = this.roomAlpha(r);
                ctx.globalAlpha = a * ra;
                const pts = r.p.map(q => this.proj(q[0], q[1], z + 0.02));
                const c = r.accent || 'fg';
                let fill =
                    r.kind === 'outside'
                        ? this.col('ok', 0.07)
                        : this.col(c, r.kind === 'stairs' ? 0.05 : r.accent ? 0.11 : 0.06);
                const lit = this.marks.lit.has(r);
                if (lit) {
                    fill = this.col('sun', 0.32);
                    ctx.shadowColor = this.col('sun', 0.8);
                    ctx.shadowBlur = 22 * dpr * Math.min(1.4, this.scale / 30);
                }
                if (r === this.hover || (r === sel && S.rf > 0.01)) {
                    fill = lit ? this.col('sun', 0.44) : this.col(c === 'fg' ? 'home' : c, 0.24);
                }
                this.poly(
                    pts,
                    fill,
                    r.kind === 'outside' ? this.col('fg', 0.35) : null,
                    lw,
                    r.kind === 'outside' ? [4, 4] : undefined,
                );
                ctx.shadowBlur = 0;
                if (r.kind === 'stairs') {
                    this.stairs(r, z);
                }
                if (this.marks.open.has(r)) {
                    this.poly(pts, null, this.col('warn', 0.9), lw * 1.8);
                }
            });
            ctx.globalAlpha = a;

            // light glows on the floor (clipped to the room)
            this.marks.glows.forEach(g => {
                if (g.floor !== i) {
                    return;
                }
                const ga = a * (g.room ? this.roomAlpha(g.room) : 1);
                ctx.save();
                ctx.globalAlpha = ga;
                if (g.room) {
                    ctx.beginPath();
                    g.room.p.forEach((q, n) => {
                        const p = this.proj(q[0], q[1], z);
                        if (n) {
                            ctx.lineTo(p[0], p[1]);
                        } else {
                            ctx.moveTo(p[0], p[1]);
                        }
                    });
                    ctx.closePath();
                    ctx.clip();
                }
                const p = this.proj(g.x, g.y, z + 0.03);
                const rad = Math.max(4, this.scale * 1.3);
                const gr = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
                gr.addColorStop(0, this.col('sun', 0.34));
                gr.addColorStop(1, this.col('sun', 0));
                ctx.fillStyle = gr;
                ctx.beginPath();
                ctx.arc(p[0], p[1], rad, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });

            // walls: room edges as glass, outer walls stronger (stacked view only); under the roof they follow it
            const walls: { d: number; q: P3[]; o: number; a: number; strong: boolean }[] = [];
            const cap = this.roofCap(i);
            f.rooms.forEach(r => {
                if (r.kind === 'outside') {
                    return;
                }
                const hh = r.kind === 'stairs' ? wh * 0.4 : wh;
                const ra = this.roomAlpha(r);
                for (let j = 0; j < r.p.length; j++) {
                    this.wallQuads(r.p[j], r.p[(j + 1) % r.p.length], z, hh, cap).forEach(q =>
                        walls.push({ d: (q[0][2] + q[1][2]) / 2, q, o: 0, a: ra, strong: r === sel }),
                    );
                }
            });
            if (S.e < 0.97) {
                for (let j = 0; j < f.foot.length; j++) {
                    this.wallQuads(f.foot[j], f.foot[(j + 1) % f.foot.length], z, wh + 0.15, cap).forEach(q =>
                        walls.push({
                            d: (q[0][2] + q[1][2]) / 2 + 0.01,
                            q,
                            o: 1,
                            a: (1 - S.e) * (1 - S.rf),
                            strong: false,
                        }),
                    );
                }
            }
            walls
                .sort((x, y) => x.d - y.d)
                .forEach(w => {
                    if (w.a < 0.01) {
                        return;
                    }
                    ctx.globalAlpha = a * w.a;
                    if (w.o) {
                        this.poly(w.q, this.col('fg', 0.07), this.col('fg', 0.32), lw * 1.2);
                        ctx.strokeStyle = this.col('fg', 0.5);
                        ctx.lineWidth = lw * 1.4;
                        ctx.beginPath();
                        ctx.moveTo(w.q[3][0], w.q[3][1]);
                        ctx.lineTo(w.q[2][0], w.q[2][1]);
                        ctx.stroke();
                    } else if (w.strong) {
                        this.poly(w.q, this.col('fg', 0.05), this.col('fg', 0.3), lw);
                    } else {
                        this.poly(w.q, this.col('fg', 0.035), this.col('fg', 0.14), lw * 0.8);
                    }
                });
            ctx.globalAlpha = a;

            // attic: roof section as dashed line
            if (f.attic && plan.roof && S.roof < 0.5) {
                this.atticLines(i, z);
            }
            ctx.globalAlpha = 1;
        });

        if (S.roof > 0.02) {
            this.drawRoof();
        }
        ctx.globalAlpha = 1;
    }

    private stairs(r: HouseRoom, z: number): void {
        const ctx = this.ctx!;
        const [x0, y0, x1, y1] = r.box;
        const alongY = y1 - y0 >= x1 - x0;
        const len = alongY ? y1 - y0 : x1 - x0;
        const n = Math.max(4, Math.min(18, Math.round(len / 0.26)));
        ctx.save();
        ctx.beginPath();
        r.p.forEach((q, i) => {
            const p = this.proj(q[0], q[1], z);
            if (i) {
                ctx.lineTo(p[0], p[1]);
            } else {
                ctx.moveTo(p[0], p[1]);
            }
        });
        ctx.closePath();
        ctx.clip();
        ctx.strokeStyle = this.col('fg', 0.25);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 1; k < n; k++) {
            const u = k / n;
            const A = alongY ? this.proj(x0, y0 + len * u, z + 0.03) : this.proj(x0 + len * u, y0, z + 0.03);
            const B = alongY ? this.proj(x1, y0 + len * u, z + 0.03) : this.proj(x0 + len * u, y1, z + 0.03);
            ctx.moveTo(A[0], A[1]);
            ctx.lineTo(B[0], B[1]);
        }
        ctx.stroke();
        ctx.restore();
    }

    /** Gable section of the roof drawn on the attic floor (exploded view) */
    private atticLines(i: number, z: number): void {
        const plan = this.plan!;
        const rf = plan.roof!;
        const f = plan.floors[i];
        const base = plan.floors[rf.base];
        const [bx0, by0, bx1, by1] = footBox(base.foot);
        const tan = Math.tan(rf.pitch);
        const half = rf.ridge === 'x' ? (by1 - by0) / 2 : (bx1 - bx0) / 2;
        const ridge = base.z + rf.knee + half * tan; // stacked height of the ridge
        const rise = ridge - f.z;
        if (rise <= 0.2) {
            return;
        }
        const hw = Math.min(half, rise / tan);
        const [fx0, fy0, fx1, fy1] = f.box;
        const ctx = this.ctx!;
        ctx.strokeStyle = this.col('fg', 0.35);
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 5]);
        const lines: P3[][] =
            rf.ridge === 'x'
                ? [fx0 + 0.02, fx1 - 0.02].map(x => [
                      this.proj(x, (by0 + by1) / 2 - hw, z),
                      this.proj(x, (by0 + by1) / 2, z + rise),
                      this.proj(x, (by0 + by1) / 2 + hw, z),
                  ])
                : [fy0 + 0.02, fy1 - 0.02].map(y => [
                      this.proj((bx0 + bx1) / 2 - hw, y, z),
                      this.proj((bx0 + bx1) / 2, y, z + rise),
                      this.proj((bx0 + bx1) / 2 + hw, y, z),
                  ]);
        lines.push(
            rf.ridge === 'x'
                ? [this.proj(fx0 + 0.02, (by0 + by1) / 2, z + rise), this.proj(fx1 - 0.02, (by0 + by1) / 2, z + rise)]
                : [this.proj((bx0 + bx1) / 2, fy0 + 0.02, z + rise), this.proj((bx0 + bx1) / 2, fy1 - 0.02, z + rise)],
        );
        lines.forEach(L => {
            ctx.beginPath();
            L.forEach((p, n) => (n ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            ctx.stroke();
        });
        ctx.setLineDash([]);
    }

    /** Height limit of walls under the roof (house view), or null when the roof does not cut this floor */
    private roofCap(i: number): ((x: number, y: number, hh: number) => number) | null {
        const plan = this.plan!;
        const rf = plan.roof;
        const S = this.S;
        if (!rf || S.roof < 0.01 || i < rf.base) {
            return null;
        }
        const base = plan.floors[rf.base];
        const [x0, y0, x1, y1] = footBox(base.foot);
        const alongX = rf.ridge === 'x';
        const mid = alongX ? (y0 + y1) / 2 : (x0 + x1) / 2;
        const half = alongX ? (y1 - y0) / 2 : (x1 - x0) / 2;
        const tan = Math.tan(rf.pitch);
        const eaves = base.z + rf.knee - plan.floors[i].z;
        return (x, y, hh) => {
            const dist = Math.abs((alongX ? y : x) - mid);
            const lim = Math.max(0.05, Math.min(hh, eaves + (half - dist) * tan));
            return hh + (lim - hh) * S.roof;
        };
    }

    /** One wall as quad(s); split at the ridge when its height follows the roof */
    private wallQuads(
        p: [number, number],
        q: [number, number],
        z: number,
        hh: number,
        cap: ((x: number, y: number, hh: number) => number) | null,
    ): P3[][] {
        const quad = (a: [number, number], b: [number, number]): P3[] => {
            const ha = cap ? cap(a[0], a[1], hh) : hh;
            const hb = cap ? cap(b[0], b[1], hh) : hh;
            return [
                this.proj(a[0], a[1], z),
                this.proj(b[0], b[1], z),
                this.proj(b[0], b[1], z + hb),
                this.proj(a[0], a[1], z + ha),
            ];
        };
        const rf = this.plan?.roof;
        if (cap && rf) {
            const [x0, y0, x1, y1] = footBox(this.plan!.floors[rf.base].foot);
            const k = rf.ridge === 'x' ? 1 : 0;
            const mid = k ? (y0 + y1) / 2 : (x0 + x1) / 2;
            if ((p[k] - mid) * (q[k] - mid) < 0) {
                const t = (mid - p[k]) / (q[k] - p[k]);
                const m: [number, number] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
                return [quad(p, m), quad(m, q)];
            }
        }
        return [quad(p, q)];
    }

    private drawRoof(): void {
        const rz = this.roofZ();
        const rf = this.plan?.roof;
        if (!rz || !rf) {
            return;
        }
        const ctx = this.ctx!;
        ctx.globalAlpha = this.S.roof;
        const { k, r, x0, y0, x1, y1 } = rz;
        const tan = Math.tan(rf.pitch);
        const ov = rf.overhang;
        const ze = k - ov * tan;
        const planes: { q: [number, number, number][]; g: boolean }[] = [];
        if (rf.ridge === 'x') {
            const ym = (y0 + y1) / 2;
            planes.push({
                q: [
                    [x0 - 0.4, y0 - ov, ze],
                    [x1 + 0.4, y0 - ov, ze],
                    [x1 + 0.4, ym, r],
                    [x0 - 0.4, ym, r],
                ],
                g: false,
            });
            planes.push({
                q: [
                    [x0 - 0.4, y1 + ov, ze],
                    [x1 + 0.4, y1 + ov, ze],
                    [x1 + 0.4, ym, r],
                    [x0 - 0.4, ym, r],
                ],
                g: false,
            });
            planes.push({
                q: [
                    [x0, y0, k],
                    [x0, y1, k],
                    [x0, ym, r],
                ],
                g: true,
            });
            planes.push({
                q: [
                    [x1, y0, k],
                    [x1, y1, k],
                    [x1, ym, r],
                ],
                g: true,
            });
        } else {
            const xm = (x0 + x1) / 2;
            planes.push({
                q: [
                    [x0 - ov, y0 - 0.4, ze],
                    [x0 - ov, y1 + 0.4, ze],
                    [xm, y1 + 0.4, r],
                    [xm, y0 - 0.4, r],
                ],
                g: false,
            });
            planes.push({
                q: [
                    [x1 + ov, y0 - 0.4, ze],
                    [x1 + ov, y1 + 0.4, ze],
                    [xm, y1 + 0.4, r],
                    [xm, y0 - 0.4, r],
                ],
                g: false,
            });
            planes.push({
                q: [
                    [x0, y0, k],
                    [x1, y0, k],
                    [xm, y0, r],
                ],
                g: true,
            });
            planes.push({
                q: [
                    [x0, y1, k],
                    [x1, y1, k],
                    [xm, y1, r],
                ],
                g: true,
            });
        }
        const lw = Math.max(0.6, Math.min(1.3, this.scale / 30));
        planes
            .map(p => {
                const P = p.q.map(v => this.proj(v[0], v[1], v[2]));
                return { P, g: p.g, d: P.reduce((s, v) => s + v[2], 0) / P.length };
            })
            .sort((a, b) => a.d - b.d)
            .forEach(p => this.poly(p.P, this.col('fg', p.g ? 0.08 : 0.13), this.col('fg', 0.4), lw * 1.1));
        ctx.globalAlpha = 1;
    }

    /* ---------- pointer ---------- */

    /** Topmost visible room under a point (CSS px relative to the canvas) */
    hit(x: number, y: number): HouseRoom | null {
        const plan = this.plan;
        if (!plan) {
            return null;
        }
        for (let i = plan.floors.length - 1; i >= 0; i--) {
            if ((this.S.fa[i] ?? 0) < 0.5) {
                continue;
            }
            if (this.view.room && i !== this.view.room.floor) {
                continue;
            }
            const z = this.floorZ(i);
            for (const r of plan.floors[i].rooms) {
                if (r.kind === 'stairs') {
                    continue;
                }
                const pts = r.p.map(q => {
                    const p = this.proj(q[0], q[1], z);
                    return [p[0], p[1]] as [number, number];
                });
                if (inPoly(x, y, pts)) {
                    return r;
                }
            }
        }
        return null;
    }

    private local(e: PointerEvent | MouseEvent): [number, number] {
        const b = this.cv.getBoundingClientRect();
        // the canvas may be scaled by a CSS transform (vis-2 zoom): map to CSS px of the canvas
        const sx = b.width ? this.w / b.width : 1;
        const sy = b.height ? this.h / b.height : 1;
        return [(e.clientX - b.left) * sx, (e.clientY - b.top) * sy];
    }

    private onDown = (e: PointerEvent): void => {
        if (!this.view.interactive || (e.pointerType === 'mouse' && e.button !== 0)) {
            return;
        }
        if ((e.target as HTMLElement | null)?.closest?.('button')) {
            return;
        }
        this.drag = {
            x: e.clientX,
            y: e.clientY,
            yaw: this.baseYaw,
            elev: this.baseElev,
            moved: false,
            id: e.pointerId,
        };
    };

    private onMove = (e: PointerEvent): void => {
        const d = this.drag;
        if (d && e.pointerId === d.id) {
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (d.moved || Math.hypot(dx, dy) > 5) {
                if (!d.moved) {
                    d.moved = true;
                    try {
                        this.wrap.setPointerCapture(e.pointerId);
                    } catch {
                        // ignore
                    }
                    this.wrap.classList.add('drag');
                    if (this.hover) {
                        this.hover = null;
                        this.cb.onHover(null, 0, 0);
                    }
                }
                this.baseYaw = d.yaw + dx * 0.006;
                if (e.pointerType === 'mouse') {
                    this.baseElev = Math.max(0.28, Math.min(1.4, d.elev + dy * 0.004));
                }
                this.lastUser = performance.now();
                this.kick();
                return;
            }
        }
        if (e.pointerType !== 'mouse' || !this.view.interactive || this.drag) {
            return;
        }
        const b = this.wrap.getBoundingClientRect();
        if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) {
            return;
        }
        const target = e.target as HTMLElement | null;
        const overUi = !!target?.closest?.('button') || !this.wrap.contains(target);
        const [x, y] = this.local(e);
        const r = overUi ? null : this.hit(x, y);
        if (r !== this.hover) {
            this.hover = r;
            this.dirty = true;
            this.kick();
        }
        this.cb.onHover(r, x, y);
    };

    private onUp = (e: PointerEvent): void => {
        const d = this.drag;
        if (!d || e.pointerId !== d.id) {
            return;
        }
        this.drag = null;
        this.wrap.classList.remove('drag');
        if (d.moved) {
            this.lastUser = performance.now();
            this.kick();
            return;
        }
        const [x, y] = this.local(e);
        this.cb.onRoomClick(this.hit(x, y));
    };

    private onCancel = (e: PointerEvent): void => {
        if (this.drag && e.pointerId === this.drag.id) {
            this.drag = null;
            this.wrap.classList.remove('drag');
        }
    };

    private onLeave = (e: PointerEvent): void => {
        if (e.pointerType === 'mouse' && this.hover && !this.drag) {
            this.hover = null;
            this.dirty = true;
            this.kick();
            this.cb.onHover(null, 0, 0);
        }
    };

    private onDbl = (): void => {
        if (this.view.interactive) {
            this.resetCamera();
        }
    };
}
