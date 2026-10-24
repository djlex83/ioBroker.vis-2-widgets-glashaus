/* Particle engine of the Glashaus background (own Canvas 2D implementation, ported from the dashboard, MIT).
 * A line drawing is sampled into particles. The pointer pushes them aside, then they spring back to their place.
 * When everything rests (also a pointer that stopped moving), the animation stops and the last frame stays.
 * Works on one stage element: size from a ResizeObserver, only pointers inside the stage rectangle push,
 * paused when the stage is off screen or the page is hidden, a static image with prefers-reduced-motion.
 * Everything is released by destroy(). */

/** A drawing for the engine. A new key loads a new drawing; the particles flow from the old one. */
export interface ArtSource {
    key: string;
    /** Draws the motif; `mobile` = narrow stage (taller cut-out). Null: nothing to show. */
    render(mobile: boolean): HTMLCanvasElement | null | Promise<HTMLCanvasElement | null>;
    /** Keep the whole drawing inside the stage, also when it is narrow (own images are not cut at the sides) */
    fit?: boolean;
}

export type Density = 'low' | 'normal' | 'high';

export interface SculptureSettings {
    /** Upper edge of the band for the drawing, 0..1 of the stage height */
    bandTop: number;
    /** Lower edge of the band, 0..1 */
    bandBottom: number;
    /** Pointer pushes the particles */
    interactive: boolean;
    /** Slow breathing of the shape, 0 = off, 1 = strong */
    ambient: number;
    density: Density;
}

export interface SculptureParts {
    /** Element that defines the size, position: relative or absolute */
    stage: HTMLElement;
    canvas: HTMLCanvasElement;
    /** Big word behind the drawing (sized to the width) */
    word?: () => HTMLElement | null;
    /** "Swipe over the drawing", placed under the drawing, hidden after the first touch */
    hint?: () => HTMLElement | null;
}

interface Particles {
    n: number;
    /** Home position, relative 0..1 in the drawing */
    hx: Float32Array;
    hy: Float32Array;
    /** Current position and speed in CSS pixels of the stage */
    x: Float32Array;
    y: Float32Array;
    vx: Float32Array;
    vy: Float32Array;
    /** RGBA */
    c: Uint8ClampedArray;
    /** Phase for breathing */
    ph: Float32Array;
}

interface Box {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

const MOBILE_W = 640;
const MAX_PARTICLES = 60000;
const MAX_STEP = 24;
/** Distance of the particles on screen in CSS pixels (the original look: about 2 px) */
const SPACING: Record<Density, number> = { low: 2.8, normal: 2.2, high: 1.7 };
/**
 * A pointer that has not moved for this long stops pushing: the particles close the gap and the loop stops
 * (the swirl around a resting pointer would never settle)
 */
const PTR_REST = 2500;

export default class Sculpture {
    private readonly stage: HTMLElement;

    private readonly canvas: HTMLCanvasElement;

    private readonly g: CanvasRenderingContext2D | null;

    private readonly parts: SculptureParts;

    private settings: SculptureSettings = {
        bandTop: 0.08,
        bandBottom: 0.58,
        interactive: true,
        ambient: 0,
        density: 'normal',
    };

    private source: ArtSource | null = null;

    private art: HTMLCanvasElement | null = null;

    private artMobile = false;

    /** The current drawing must not be wider than the stage */
    private artFit = false;

    private loadId = 0;

    /** Cut-out (narrow or wide) of the drawing that is loading, null when nothing loads */
    private pendingMobile: boolean | null = null;

    private P: Particles | null = null;

    /** Sampling step of the current particles */
    private step = 0;

    private aspect = 2.5;

    /** Lower edge of the ink in the drawing, 0..1 (the hint goes below it) */
    private inkBottom = 1;

    private rect = { x: 0, y: 0, w: 0, h: 0 };

    private w = 0;

    private h = 0;

    private dpr = 1;

    private buf: ImageData | null = null;

    /** Pixels of the last frame in `buf` (cleared before the next frame) */
    private box: Box | null = null;

    /** The canvas shows something that is not in `buf` (static image): clear it before the next frame */
    private wipe = false;

    private raf = 0;

    private readonly ptr = { x: 0, y: 0, on: false, t: 0 };

    private readonly t0 = performance.now();

    private lastFrame = 0;

    private visible = true;

    private isStatic = false;

    private listening = false;

    private destroyed = false;

    private resampleTimer: ReturnType<typeof setTimeout> | undefined;

    private readonly ro: ResizeObserver;

    private readonly io: IntersectionObserver | null;

    private readonly rm: MediaQueryList | null;

    constructor(parts: SculptureParts) {
        this.parts = parts;
        this.stage = parts.stage;
        this.canvas = parts.canvas;
        this.g = this.canvas.getContext('2d');
        this.rm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        this.rm?.addEventListener('change', this.onMotionPref);
        document.addEventListener('visibilitychange', this.onVisibility);
        this.ro = new ResizeObserver(() => this.onResize());
        this.ro.observe(this.stage);
        this.io =
            typeof IntersectionObserver === 'function'
                ? new IntersectionObserver(entries => {
                      const e = entries[entries.length - 1];
                      this.visible = !!e?.isIntersecting;
                      if (this.visible) {
                          this.wake();
                      }
                  })
                : null;
        this.io?.observe(this.stage);
        this.measure();
        void document.fonts?.ready.then(() => !this.destroyed && this.place());
    }

    /** Changes settings; only what changed is applied */
    set(s: Partial<SculptureSettings>): void {
        const old = this.settings;
        this.settings = { ...old, ...s };
        const n = this.settings;
        if (n.interactive !== old.interactive || !this.listening) {
            this.listen(n.interactive);
        }
        if (n.bandTop !== old.bandTop || n.bandBottom !== old.bandBottom) {
            this.place();
            this.scheduleResample();
        }
        if (n.density !== old.density) {
            this.resample(false);
        }
        if (n.ambient !== old.ambient) {
            this.wake();
        }
    }

    /** Shows another drawing (same key: nothing happens) */
    setArt(src: ArtSource | null): void {
        if ((src?.key ?? null) === (this.source?.key ?? null)) {
            return;
        }
        this.source = src;
        this.load();
    }

    /** Places drawing, word and hint again (after a change of the size, the word or the band) */
    place(): void {
        if (this.destroyed) {
            return;
        }
        this.layout();
        if (this.isStatic) {
            this.drawStatic();
            return;
        }
        const P = this.P;
        if (!P) {
            return;
        }
        if (!this.raf) {
            // resting: jump to the new place
            this.home(P);
        }
        this.wake(true);
    }

    destroy(): void {
        this.destroyed = true;
        if (this.raf) {
            cancelAnimationFrame(this.raf);
            this.raf = 0;
        }
        clearTimeout(this.resampleTimer);
        this.listen(false);
        this.ro.disconnect();
        this.io?.disconnect();
        this.rm?.removeEventListener('change', this.onMotionPref);
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.P = null;
        this.buf = null;
        this.art = null;
        this.source = null;
    }

    /* ---------- Size and layout ---------- */

    private reduced(): boolean {
        return !!this.rm?.matches;
    }

    private isMobile(): boolean {
        return this.w > 0 && this.w < MOBILE_W;
    }

    /** Reads the stage size and sizes the canvas; true if something changed */
    private measure(): boolean {
        const w = this.stage.clientWidth;
        const h = this.stage.clientHeight;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const changed = w !== this.w || h !== this.h || dpr !== this.dpr;
        this.w = w;
        this.h = h;
        this.dpr = dpr;
        const cw = Math.max(1, Math.round(w * dpr));
        const ch = Math.max(1, Math.round(h * dpr));
        if (this.canvas.width !== cw || this.canvas.height !== ch) {
            this.canvas.width = cw;
            this.canvas.height = ch;
            this.buf = null;
            this.box = null;
            this.wipe = false;
        }
        return changed;
    }

    private onResize(): void {
        if (this.destroyed || !this.measure() || !this.w || !this.h) {
            return;
        }
        const target = this.pendingMobile ?? (this.art ? this.artMobile : null);
        if (this.source && target !== this.isMobile()) {
            // first size, or the narrow/wide cut-out changed
            this.load();
            return;
        }
        this.place();
        this.scheduleResample();
    }

    /** Rectangle of the drawing inside the band, size of the word, position of the hint */
    private layout(): void {
        const { w, h } = this;
        if (!w || !h) {
            return;
        }
        const s = this.settings;
        const t = Math.max(0, Math.min(1, Math.min(s.bandTop, s.bandBottom)));
        const b = Math.max(0, Math.min(1, Math.max(s.bandTop, s.bandBottom)));
        const top = h * t;
        const bh = Math.max(Math.min(120, h - top), h * (b - t));
        // the narrow cut-out of a motif may bleed out at the sides, an own image always fits
        const rw = Math.min(w * (this.artMobile && !this.artFit ? 1.15 : 0.94), bh * this.aspect);
        const rh = rw / this.aspect;
        this.rect = { x: (w - rw) / 2, y: top + (bh - rh) / 2, w: rw, h: rh };

        const word = this.parts.word?.();
        if (word) {
            word.style.fontSize = '100px';
            const tw = word.offsetWidth;
            const chars = Math.max(1, (word.textContent || '').length);
            const byWidth = tw > 0 ? (w * 0.88 * 100) / tw : (w * 0.92) / (chars * 0.56);
            word.style.fontSize = `${Math.max(8, Math.min(bh * 0.95, byWidth))}px`;
            word.style.top = `${top + bh / 2}px`;
        }
        const hint = this.parts.hint?.();
        if (hint) {
            // horizontally centered by CSS (the drawing is centered as well)
            const below = this.rect.y + this.rect.h * (this.isStatic ? 1 : this.inkBottom) + 8;
            hint.style.top = `${Math.min(below, h - 22)}px`;
            const empty = !this.art || this.P?.n === 0;
            hint.style.visibility = w < 260 || h < 180 || empty ? 'hidden' : '';
        }
    }

    /* ---------- Drawing and particles ---------- */

    private load(): void {
        const id = ++this.loadId;
        const src = this.source;
        this.pendingMobile = null;
        if (!src) {
            this.art = null;
            this.P = null;
            this.clear();
            this.layout();
            return;
        }
        if (!this.w || !this.h) {
            // invisible for now; loads on the first size
            this.art = null;
            return;
        }
        const mobile = this.isMobile();
        this.pendingMobile = mobile;
        const done = (c: HTMLCanvasElement | null): void => {
            if (id !== this.loadId || this.destroyed) {
                return;
            }
            this.pendingMobile = null;
            this.art = c;
            this.artMobile = mobile;
            this.artFit = !!src.fit;
            if (c && c.width && c.height) {
                this.aspect = c.width / c.height;
            }
            this.resample(true);
        };
        let res: ReturnType<ArtSource['render']>;
        try {
            res = src.render(mobile);
        } catch (e) {
            console.warn(`[Glashaus] Cannot draw the background: ${String(e)}`);
            res = null;
        }
        if (res && typeof (res as Promise<HTMLCanvasElement | null>).then === 'function') {
            (res as Promise<HTMLCanvasElement | null>).then(done, e => {
                console.warn(`[Glashaus] Cannot load the background image: ${String(e)}`);
                done(null);
            });
        } else {
            done(res as HTMLCanvasElement | null);
        }
    }

    private scheduleResample(): void {
        if (!this.P || !this.art || this.isStatic) {
            return;
        }
        clearTimeout(this.resampleTimer);
        this.resampleTimer = setTimeout(() => {
            if (this.P && this.art && this.stepFor(this.art) !== this.step) {
                this.resample(false);
            }
        }, 220);
    }

    /** Sampling step in pixels of the drawing, so that the particles keep the same distance on screen */
    private stepFor(art: HTMLCanvasElement): number {
        if (this.rect.w <= 0) {
            return 4;
        }
        const step = Math.round((SPACING[this.settings.density] * art.width) / this.rect.w);
        return Math.max(2, Math.min(step, MAX_STEP));
    }

    /** Samples the drawing into particles. `flow`: the new particles start where the old ones are. */
    private resample(flow: boolean): void {
        clearTimeout(this.resampleTimer);
        if (this.destroyed) {
            return;
        }
        this.layout();
        const art = this.art;
        if (!art || !this.w || !this.h) {
            this.P = null;
            this.setStatic(false);
            this.clear();
            return;
        }
        if (this.reduced()) {
            this.P = null;
            this.setStatic(true);
            this.drawStatic();
            return;
        }
        try {
            this.sample(art, this.stepFor(art), flow);
            this.setStatic(false);
        } catch {
            // e.g. an image of another origin: show it without particles
            this.P = null;
            this.setStatic(true);
            this.drawStatic();
            return;
        }
        this.wake(true);
    }

    /**
     * One particle per block of step × step pixels: the most opaque pixel of the block, so that thin lines
     * are never skipped. Returns the byte offsets of the chosen pixels.
     */
    private static pool(d: Uint8ClampedArray, W: number, H: number, st: number): Int32Array {
        const bw = Math.ceil(W / st);
        const bh = Math.ceil(H / st);
        const out = new Int32Array(bw * bh);
        let n = 0;
        for (let by = 0; by < bh; by++) {
            const y0 = by * st;
            const y1 = Math.min(H, y0 + st);
            for (let bx = 0; bx < bw; bx++) {
                const x0 = bx * st;
                const x1 = Math.min(W, x0 + st);
                let best = -1;
                let ba = 59;
                for (let y = y0; y < y1; y++) {
                    let k = (y * W + x0) * 4 + 3;
                    for (let x = x0; x < x1; x++, k += 4) {
                        if (d[k] > ba) {
                            ba = d[k];
                            best = k - 3;
                        }
                    }
                }
                if (best >= 0) {
                    out[n++] = best;
                }
            }
        }
        return out.subarray(0, n);
    }

    private sample(art: HTMLCanvasElement, step: number, flow: boolean): void {
        const ctx = art.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
            throw new Error('no 2d context');
        }
        const W = art.width;
        const H = art.height;
        const d = ctx.getImageData(0, 0, W, H).data;
        let st = step;
        let picks = Sculpture.pool(d, W, H, st);
        while (picks.length > MAX_PARTICLES && st < MAX_STEP) {
            st++;
            picks = Sculpture.pool(d, W, H, st);
        }
        const n = picks.length;
        const P: Particles = {
            n,
            hx: new Float32Array(n),
            hy: new Float32Array(n),
            x: new Float32Array(n),
            y: new Float32Array(n),
            vx: new Float32Array(n),
            vy: new Float32Array(n),
            c: new Uint8ClampedArray(n * 4),
            ph: new Float32Array(n),
        };
        let bottom = 0;
        for (let i = 0; i < n; i++) {
            const k = picks[i];
            const px = (k >> 2) % W;
            const py = Math.floor((k >> 2) / W);
            P.hx[i] = px / W;
            P.hy[i] = py / H;
            if (py > bottom) {
                bottom = py;
            }
            P.c[i * 4] = d[k];
            P.c[i * 4 + 1] = d[k + 1];
            P.c[i * 4 + 2] = d[k + 2];
            P.c[i * 4 + 3] = d[k + 3];
            P.ph[i] = Math.random() * 6.283;
        }
        const old = this.P;
        this.step = step;
        this.P = P;
        this.inkBottom = n ? Math.min(1, (bottom + 1) / H) : 1;
        this.layout();
        if (flow && old && old.n && this.visible && !document.hidden) {
            this.flowFrom(old, P, st / W, st / H);
        } else {
            this.home(P);
        }
    }

    /**
     * The new drawing forms out of the old particles: a particle whose place was already taken keeps
     * its position (unchanged parts stay still), the others fly in from the parts that disappeared
     */
    private flowFrom(old: Particles, P: Particles, cw: number, ch: number): void {
        const gw = Math.max(1, Math.ceil(1 / (cw * 2)));
        const gh = Math.max(1, Math.ceil(1 / (ch * 2)));
        const cell = (x: number, y: number): number =>
            Math.min(gh - 1, Math.max(0, Math.floor(y * gh))) * gw + Math.min(gw - 1, Math.max(0, Math.floor(x * gw)));
        const head = new Int32Array(gw * gh).fill(-1);
        const next = new Int32Array(old.n);
        for (let j = 0; j < old.n; j++) {
            const c = cell(old.hx[j], old.hy[j]);
            next[j] = head[c];
            head[c] = j;
        }
        const used = new Uint8Array(old.n);
        const lost: number[] = [];
        for (let k = 0; k < P.n; k++) {
            const c = cell(P.hx[k], P.hy[k]);
            const j = head[c];
            if (j < 0) {
                lost.push(k);
                continue;
            }
            head[c] = next[j];
            used[j] = 1;
            P.x[k] = old.x[j];
            P.y[k] = old.y[j];
            P.vx[k] = old.vx[j];
            P.vy[k] = old.vy[j];
        }
        if (!lost.length) {
            return;
        }
        const free: number[] = [];
        for (let j = 0; j < old.n; j++) {
            if (!used[j]) {
                free.push(j);
            }
        }
        const r = this.rect;
        lost.forEach((k, i) => {
            if (free.length) {
                const j = free[Math.floor((i * free.length) / lost.length)];
                P.x[k] = old.x[j];
                P.y[k] = old.y[j];
            } else {
                // nothing disappeared: rise from below the new place
                P.x[k] = r.x + P.hx[k] * r.w + (Math.random() - 0.5) * 40;
                P.y[k] = r.y + P.hy[k] * r.h + 30 + Math.random() * 40;
            }
            P.vx[k] = 0;
            P.vy[k] = 0;
        });
    }

    /** Puts all particles to their place, without speed */
    private home(P: Particles): void {
        const r = this.rect;
        for (let k = 0; k < P.n; k++) {
            P.x[k] = r.x + P.hx[k] * r.w;
            P.y[k] = r.y + P.hy[k] * r.h;
            P.vx[k] = 0;
            P.vy[k] = 0;
        }
    }

    private setStatic(on: boolean): void {
        this.isStatic = on;
        if (on) {
            this.stage.dataset.static = '1';
            if (this.raf) {
                cancelAnimationFrame(this.raf);
                this.raf = 0;
            }
        } else {
            delete this.stage.dataset.static;
        }
    }

    /** The drawing as a plain image (reduced motion, or the image cannot be read) */
    private drawStatic(): void {
        const g = this.g;
        if (!g) {
            return;
        }
        g.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.wipe = true;
        const art = this.art;
        if (!art || !this.rect.w) {
            return;
        }
        const r = this.rect;
        const d = this.dpr;
        try {
            g.drawImage(art, r.x * d, r.y * d, r.w * d, r.h * d);
        } catch {
            // nothing to show
        }
    }

    private clear(): void {
        if (this.raf) {
            cancelAnimationFrame(this.raf);
            this.raf = 0;
        }
        this.g?.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.buf = null;
        this.box = null;
        this.wipe = false;
    }

    /** Starts the animation loop if it is not running. `force`: draw at least one frame */
    private wake(force = false): void {
        if (this.raf || this.destroyed || this.isStatic || !this.P) {
            return;
        }
        if (force || (this.visible && !document.hidden)) {
            this.raf = requestAnimationFrame(this.frame);
        }
    }

    private radius(): number {
        const R = Math.max(50, Math.min(150, this.rect.w * 0.125));
        return R * (this.artMobile ? 0.7 : 1);
    }

    private frame = (now: number): void => {
        this.raf = 0;
        const P = this.P;
        const g = this.g;
        if (!P || !g || this.destroyed || this.isStatic || !this.w || !this.h) {
            return;
        }
        const live = this.visible && !document.hidden;
        if (!live) {
            // off screen: settle at once, draw once, then wait for visibility
            this.home(P);
        }
        const amb = live ? this.settings.ambient : 0;
        // breathing amplitude in pixels, smaller for small drawings
        const ampl = 2.2 * amb * Math.max(0.35, Math.min(1, this.rect.w / 1200));
        if (amb && !this.ptr.on && now - this.ptr.t > 1500 && now - this.lastFrame < 30) {
            // breathing alone: about 30 frames per second are enough
            this.raf = requestAnimationFrame(this.frame);
            return;
        }
        this.lastFrame = now;
        const W = this.canvas.width;
        const H = this.canvas.height;
        if (!this.buf || this.buf.width !== W || this.buf.height !== H) {
            this.buf = g.createImageData(W, H);
            this.box = null;
            g.clearRect(0, 0, W, H);
        } else if (this.wipe) {
            g.clearRect(0, 0, W, H);
        }
        const d = this.buf.data;
        const pb = this.box;
        if (pb) {
            for (let y = pb.y0; y <= pb.y1; y++) {
                d.fill(0, (y * W + pb.x0) * 4, (y * W + pb.x1 + 1) * 4);
            }
        }
        const t = (now - this.t0) / 1000;
        const R = this.radius();
        const R2 = R * R;
        const r = this.rect;
        const dpr = this.dpr;
        const ptrOn = live && this.ptr.on && this.settings.interactive && now - this.ptr.t < PTR_REST;
        const px0 = this.ptr.x;
        const py0 = this.ptr.y;
        const { hx: HX, hy: HY, x: X, y: Y, vx: VX, vy: VY, c: C, ph: PH } = P;
        let moving = 0;
        let pushed = 0;
        let bx0 = W;
        let by0 = H;
        let bx1 = -1;
        let by1 = -1;
        for (let n = 0; n < P.n; n++) {
            let hx = r.x + HX[n] * r.w;
            let hy = r.y + HY[n] * r.h;
            if (amb) {
                hx += Math.sin(t * 0.7 + PH[n]) * ampl;
                hy += Math.cos(t * 0.6 + PH[n] * 1.3) * ampl;
            }
            let ax = (hx - X[n]) * 0.045;
            let ay = (hy - Y[n]) * 0.045;
            if (ptrOn) {
                const dx = X[n] - px0;
                const dy = Y[n] - py0;
                const q = dx * dx + dy * dy;
                if (q < R2 && q > 0.01) {
                    const f = ((1 - q / R2) * 3.2) / Math.sqrt(q);
                    ax += dx * f + dy * f * 0.35;
                    ay += dy * f - dx * f * 0.35;
                    pushed++;
                }
            }
            VX[n] = (VX[n] + ax) * 0.86;
            VY[n] = (VY[n] + ay) * 0.86;
            X[n] += VX[n];
            Y[n] += VY[n];
            if (Math.abs(VX[n]) + Math.abs(VY[n]) > 0.05) {
                moving++;
            }
            const px = (X[n] * dpr) | 0;
            const py = (Y[n] * dpr) | 0;
            if (px < 0 || py < 0 || px >= W - 1 || py >= H - 1) {
                continue;
            }
            if (px < bx0) {
                bx0 = px;
            }
            if (px + 1 > bx1) {
                bx1 = px + 1;
            }
            if (py < by0) {
                by0 = py;
            }
            if (py + 1 > by1) {
                by1 = py + 1;
            }
            const c = n * 4;
            const k0 = (py * W + px) * 4;
            const k1 = k0 + W * 4;
            d[k0] = d[k0 + 4] = d[k1] = d[k1 + 4] = C[c];
            d[k0 + 1] = d[k0 + 5] = d[k1 + 1] = d[k1 + 5] = C[c + 1];
            d[k0 + 2] = d[k0 + 6] = d[k1 + 2] = d[k1 + 6] = C[c + 2];
            d[k0 + 3] = d[k0 + 7] = d[k1 + 3] = d[k1 + 7] = C[c + 3];
        }
        const nb: Box | null = bx1 >= bx0 ? { x0: bx0, y0: by0, x1: bx1, y1: by1 } : null;
        if (this.wipe) {
            this.wipe = false;
            if (nb) {
                g.putImageData(this.buf, 0, 0, nb.x0, nb.y0, nb.x1 - nb.x0 + 1, nb.y1 - nb.y0 + 1);
            }
        } else {
            const u0 = pb && nb ? Math.min(pb.x0, nb.x0) : (pb || nb)?.x0;
            const v0 = pb && nb ? Math.min(pb.y0, nb.y0) : (pb || nb)?.y0;
            const u1 = pb && nb ? Math.max(pb.x1, nb.x1) : (pb || nb)?.x1;
            const v1 = pb && nb ? Math.max(pb.y1, nb.y1) : (pb || nb)?.y1;
            if (u0 !== undefined && v0 !== undefined && u1 !== undefined && v1 !== undefined) {
                g.putImageData(this.buf, 0, 0, u0, v0, u1 - u0 + 1, v1 - v0 + 1);
            }
        }
        this.box = nb;
        // a pointer that pushes keeps the loop alive until it rests, so that the gap always closes afterwards
        if (live && (moving > 0 || amb > 0 || pushed > 0)) {
            this.raf = requestAnimationFrame(this.frame);
        }
    };

    /* ---------- Pointer, visibility ---------- */

    private listen(on: boolean): void {
        if (on === this.listening) {
            return;
        }
        this.listening = on;
        const opt: AddEventListenerOptions = { passive: true };
        const root = document.documentElement;
        if (on) {
            window.addEventListener('pointermove', this.onMove, opt);
            window.addEventListener('pointerdown', this.onPointer, opt);
            window.addEventListener('pointerup', this.onUp, opt);
            window.addEventListener('pointercancel', this.onCancel, opt);
            root.addEventListener('pointerleave', this.onCancel);
        } else {
            window.removeEventListener('pointermove', this.onMove);
            window.removeEventListener('pointerdown', this.onPointer);
            window.removeEventListener('pointerup', this.onUp);
            window.removeEventListener('pointercancel', this.onCancel);
            root.removeEventListener('pointerleave', this.onCancel);
            this.ptr.on = false;
        }
    }

    private onMove = (e: PointerEvent): void => {
        if (e.pointerType === 'touch' && e.buttons === 0 && e.pressure === 0) {
            return;
        }
        this.onPointer(e);
    };

    /** Pointer position relative to the stage (also when the view is scaled); only inside the stage it pushes */
    private onPointer = (e: PointerEvent): void => {
        if (!this.P || this.isStatic || !this.w) {
            return;
        }
        const b = this.stage.getBoundingClientRect();
        const sx = b.width / this.w || 1;
        const sy = b.height / this.h || 1;
        const x = (e.clientX - b.left) / sx;
        const y = (e.clientY - b.top) / sy;
        if (x < 0 || y < 0 || x > this.w || y > this.h) {
            if (this.ptr.on) {
                this.ptr.on = false;
                this.wake();
            }
            return;
        }
        this.ptr.x = x;
        this.ptr.y = y;
        this.ptr.on = true;
        this.ptr.t = performance.now();
        const hint = this.parts.hint?.();
        if (hint) {
            hint.dataset.touched = '1';
        }
        this.wake();
    };

    private onUp = (e: PointerEvent): void => {
        if (e.pointerType === 'touch' && this.ptr.on) {
            this.ptr.on = false;
            this.wake();
        }
    };

    private onCancel = (): void => {
        if (this.ptr.on) {
            this.ptr.on = false;
            this.wake();
        }
    };

    private onVisibility = (): void => {
        if (!document.hidden) {
            this.wake();
        }
    };

    private onMotionPref = (): void => {
        if (this.art) {
            this.resample(false);
        }
    };
}
