/* Snapshot loader of the camera widget: preloads an image (URL or data URI) in the background and reports it only
 * when it has loaded, so the tile never flickers. Reloads every `interval` seconds (optionally with a cache-busting
 * parameter), skips reloads while the page is hidden or the tile is out of view, and never stacks requests. */

/** Turns a state value into an image source: URL, data URI, or raw base64 (JPEG/PNG/GIF/WebP/SVG) */
export function toImageSrc(v: unknown): string | null {
    if (typeof v !== 'string') {
        return null;
    }
    const t = v.trim();
    if (!t) {
        return null;
    }
    if (/^data:/i.test(t) || /^(https?:)?\/\//i.test(t) || /^(blob:|\/|\.\.?\/)/i.test(t)) {
        return t;
    }
    if (t.length > 64 && /^[A-Za-z0-9+/=\r\n]+$/.test(t)) {
        const b = t.replace(/\s/g, '');
        const type = b.startsWith('/9j/')
            ? 'jpeg'
            : b.startsWith('iVBORw0KGgo')
              ? 'png'
              : b.startsWith('R0lGOD')
                ? 'gif'
                : b.startsWith('UklGR')
                  ? 'webp'
                  : b.startsWith('PHN2Zy') || b.startsWith('PD94bW')
                    ? 'svg+xml'
                    : 'jpeg';
        return `data:image/${type};base64,${b}`;
    }
    return t;
}

/** URL with a cache-busting parameter (not for data URIs) */
function bustUrl(src: string, now = Date.now()): string {
    if (/^(data:|blob:)/i.test(src)) {
        return src;
    }
    const hash = src.indexOf('#');
    const base = hash >= 0 ? src.slice(0, hash) : src;
    const tail = hash >= 0 ? src.slice(hash) : '';
    return `${base}${base.includes('?') ? '&' : '?'}_gh=${now}${tail}`;
}

export interface SnapEvents {
    /** The image `src` has loaded completely */
    onLoad: (src: string, at: number) => void;
    /** The image could not be loaded */
    onError: (at: number) => void;
}

export class SnapLoader {
    private src: string | null = null;

    private interval = 0;

    private bust = true;

    private timer: ReturnType<typeof setInterval> | undefined;

    private img: HTMLImageElement | null = null;

    private started = 0;

    private seq = 0;

    private active = true;

    /** A reload was skipped while inactive: load as soon as it is active again */
    private due = false;

    constructor(private readonly ev: SnapEvents) {}

    /** New source / settings; loads at once when something changed */
    set(src: string | null, intervalS: number, bust: boolean): void {
        const iv = intervalS > 0 ? Math.max(0.5, intervalS) : 0;
        if (src === this.src && iv === this.interval && bust === this.bust) {
            return;
        }
        const srcChanged = src !== this.src;
        this.src = src;
        this.interval = iv;
        this.bust = bust;
        this.clearTimer();
        if (!src) {
            this.cancel();
            return;
        }
        if (srcChanged) {
            this.cancel();
            this.load();
        }
        if (iv > 0) {
            this.timer = setInterval(() => this.tick(), iv * 1000);
        }
    }

    /** Page visible and tile in view: reloads run; otherwise they wait */
    setActive(active: boolean): void {
        if (active === this.active) {
            return;
        }
        this.active = active;
        if (active && this.due) {
            this.due = false;
            this.load();
        }
    }

    /** Loads once more now (e.g. when the large view opens) */
    reload(): void {
        if (this.src) {
            this.load(true);
        }
    }

    destroy(): void {
        this.clearTimer();
        this.cancel();
        this.src = null;
    }

    private tick(): void {
        if (!this.active) {
            this.due = true;
            return;
        }
        this.load();
    }

    private clearTimer(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    private cancel(): void {
        if (this.img) {
            this.img.onload = null;
            this.img.onerror = null;
            this.img = null;
        }
        this.seq++;
    }

    private load(force = false): void {
        const src = this.src;
        if (!src) {
            return;
        }
        // a slow camera: do not stack requests, but give up on a request after three intervals (min. 15 s)
        if (this.img && !force && Date.now() - this.started < Math.max(15000, this.interval * 3000)) {
            return;
        }
        this.cancel();
        const n = this.seq;
        const url = this.bust ? bustUrl(src) : src;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
            if (n !== this.seq) {
                return;
            }
            this.img = null;
            this.ev.onLoad(url, Date.now());
        };
        img.onerror = () => {
            if (n !== this.seq) {
                return;
            }
            this.img = null;
            this.ev.onError(Date.now());
        };
        this.img = img;
        this.started = Date.now();
        img.src = url;
    }
}
