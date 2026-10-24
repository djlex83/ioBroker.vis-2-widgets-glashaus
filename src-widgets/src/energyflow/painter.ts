/* Canvas painter of the energy flow: tracks, a thin colored line and glowing dots that run in the
 * direction of the energy. Speed and density follow the power. The loop stops when nothing moves,
 * when the tab is hidden or the widget is out of view, and runs no animation with prefers-reduced-motion. */
import { IDLE_W } from './model';
import type { Pt } from './layout';

export interface PaintPath {
    id: string;
    pts: Pt[];
    /** CSS color or `var(--gh-…)` */
    color: string;
    /** W, positive = from pts[0] to the last point */
    power: number;
}

export interface PaintStyle {
    track: number;
    line: number;
    dot: number;
}

interface Track extends PaintPath {
    cum: number[];
    len: number;
    rgb: string;
    /** Visibility of line and dots 0..1 */
    op: number;
    /** Offset of the dots in px, 0..sp */
    off: number;
    /** Distance between dots in px */
    sp: number;
}

const VAR_RE = /^var\((--[\w-]+)\)$/;

/** Target distance between dots: dense for high power */
function spacingFor(w: number): number {
    const kw = Math.abs(w) / 1000;
    return Math.max(20, Math.min(70, 70 / (0.55 + 0.35 * kw)));
}

/** Dot speed in px/s */
function speedFor(w: number): number {
    return Math.min(260, 24 + 52 * (Math.abs(w) / 1000));
}

export class FlowPainter {
    private readonly cv: HTMLCanvasElement;

    private readonly ctx: CanvasRenderingContext2D | null;

    private tracks = new Map<string, Track>();

    private style: PaintStyle = { track: 6, line: 2, dot: 3 };

    private trackColor = 'rgba(128,128,128,.12)';

    private w = 0;

    private h = 0;

    private dpr = 1;

    private raf = 0;

    private last = 0;

    private inView = true;

    private reduced: boolean;

    private readonly mql: MediaQueryList | null;

    private io: IntersectionObserver | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.cv = canvas;
        this.ctx = canvas.getContext('2d');
        this.mql = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        this.reduced = !!this.mql?.matches;
        this.mql?.addEventListener('change', this.onMotion);
        document.addEventListener('visibilitychange', this.onVisibility);
        if (typeof IntersectionObserver !== 'undefined') {
            this.io = new IntersectionObserver(entries => {
                this.inView = entries.some(e => e.isIntersecting);
                this.kick();
            });
            this.io.observe(canvas);
        }
    }

    destroy(): void {
        this.stop();
        this.mql?.removeEventListener('change', this.onMotion);
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.io?.disconnect();
        this.io = null;
        this.tracks.clear();
    }

    /** Canvas size in CSS px (device pixel ratio max. 2) */
    setSize(w: number, h: number): void {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (w === this.w && h === this.h && dpr === this.dpr) {
            return;
        }
        this.w = w;
        this.h = h;
        this.dpr = dpr;
        this.cv.width = Math.max(1, Math.round(w * dpr));
        this.cv.height = Math.max(1, Math.round(h * dpr));
        this.kick();
    }

    /** New geometry and/or new power values; also re-reads the colors (theme may have changed) */
    setPaths(paths: PaintPath[], style: PaintStyle): void {
        this.style = style;
        const cs = getComputedStyle(this.cv);
        const resolve = (c: string): string => {
            const m = VAR_RE.exec(c.trim());
            if (!m) {
                return c;
            }
            return cs.getPropertyValue(m[1]).trim() || '#888';
        };
        this.trackColor = cs.getPropertyValue('--gh-track').trim() || this.trackColor;
        const seen = new Set<string>();
        paths.forEach(p => {
            seen.add(p.id);
            const cum = [0];
            for (let i = 1; i < p.pts.length; i++) {
                const a = p.pts[i - 1];
                const b = p.pts[i];
                cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
            }
            const old = this.tracks.get(p.id);
            const on = Math.abs(p.power) >= IDLE_W;
            this.tracks.set(p.id, {
                ...p,
                cum,
                len: cum[cum.length - 1],
                rgb: resolve(p.color),
                op: old ? old.op : 0,
                off: old ? old.off : 0,
                sp: old ? old.sp : spacingFor(on ? p.power : 0),
            });
        });
        [...this.tracks.keys()].forEach(id => !seen.has(id) && this.tracks.delete(id));
        this.kick();
    }

    private onMotion = (): void => {
        this.reduced = !!this.mql?.matches;
        this.kick();
    };

    private onVisibility = (): void => {
        if (document.hidden) {
            this.stop();
        } else {
            this.kick();
        }
    };

    private stop(): void {
        if (this.raf) {
            cancelAnimationFrame(this.raf);
            this.raf = 0;
        }
    }

    /**
     * Draws the next frame (and keeps the loop running while something moves).
     * Out of view or in a hidden tab only one still frame is drawn, without animation.
     */
    private kick(): void {
        if (!this.ctx) {
            return;
        }
        if (document.hidden || !this.inView) {
            this.stop();
            this.draw(0, true);
            return;
        }
        if (this.raf) {
            return;
        }
        this.last = 0;
        this.raf = requestAnimationFrame(this.frame);
    }

    private frame = (t: number): void => {
        this.raf = 0;
        const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0;
        this.last = t;
        const busy = this.draw(dt);
        if (busy && !document.hidden && this.inView) {
            this.raf = requestAnimationFrame(this.frame);
        }
    };

    /** Point at distance s along a track */
    private static at(tr: Track, s: number): Pt {
        const { pts, cum } = tr;
        let i = 1;
        while (i < cum.length - 1 && cum[i] < s) {
            i++;
        }
        const seg = cum[i] - cum[i - 1] || 1;
        const f = (s - cum[i - 1]) / seg;
        const a = pts[i - 1];
        const b = pts[i];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }

    private stroke(tr: Track): void {
        const ctx = this.ctx!;
        ctx.beginPath();
        tr.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.stroke();
    }

    /** Returns true while something moves or fades; `still`: final state without motion */
    private draw(dt: number, still = this.reduced): boolean {
        const ctx = this.ctx;
        if (!ctx || !this.w || !this.h) {
            return false;
        }
        const st = this.style;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        let busy = false;
        // tracks first, so that dots are always on top
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.trackColor;
        ctx.lineWidth = st.track;
        this.tracks.forEach(tr => tr.len > 1 && this.stroke(tr));

        this.tracks.forEach(tr => {
            if (tr.len <= 1) {
                return;
            }
            const on = Math.abs(tr.power) >= IDLE_W;
            const target = on ? Math.min(1, Math.abs(tr.power) / 120) : 0;
            if (still) {
                tr.op = target;
            } else {
                tr.op += (target - tr.op) * Math.min(1, dt * 4);
                if (Math.abs(target - tr.op) > 0.01) {
                    busy = true;
                }
            }
            if (tr.op < 0.02) {
                return;
            }
            const dir = tr.power >= 0 ? 1 : -1;
            const spT = spacingFor(on ? tr.power : 0);
            if (!still) {
                tr.sp += (spT - tr.sp) * Math.min(1, dt * 2);
                tr.off += dt * speedFor(tr.power) * dir;
                busy = true;
            } else {
                tr.sp = spT;
            }
            tr.off = ((tr.off % tr.sp) + tr.sp) % tr.sp;

            ctx.globalAlpha = 0.35 * tr.op;
            ctx.strokeStyle = tr.rgb;
            ctx.lineWidth = st.line;
            this.stroke(tr);

            const R = st.dot;
            const trail = R * 1.3;
            const fade = Math.min(16, tr.len / 4);
            ctx.fillStyle = tr.rgb;
            // two passes: trails without glow, heads with glow
            for (let pass = 0; pass < 2; pass++) {
                if (pass) {
                    ctx.shadowColor = tr.rgb;
                    ctx.shadowBlur = R * 3.6;
                }
                for (let s = tr.off; s < tr.len + 4 * trail; s += tr.sp) {
                    for (let k = pass ? 0 : 1; k < (pass ? 1 : 4); k++) {
                        const pos = s - k * trail * dir;
                        if (pos < 0 || pos > tr.len) {
                            continue;
                        }
                        const edge = Math.min(1, Math.min(pos, tr.len - pos) / fade);
                        if (edge <= 0) {
                            continue;
                        }
                        const [x, y] = FlowPainter.at(tr, pos);
                        ctx.globalAlpha = tr.op * edge * (1 - k * 0.26);
                        ctx.beginPath();
                        ctx.arc(x, y, Math.max(0.6, R * (1 - k * 0.18)), 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
            ctx.shadowBlur = 0;
        });
        ctx.globalAlpha = 1;
        return busy;
    }
}
