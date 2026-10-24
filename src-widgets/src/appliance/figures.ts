/* Animated illustrations of the appliance widget: washing machine, dryer and dishwasher.
 * The markup is plain SVG text (ids prefixed per widget instance, no brand names). A Figure moves drum, laundry,
 * water, spray arms, heat and steam; the widget calls step() from requestAnimationFrame while something moves. */

export type ApType = 'washer' | 'dryer' | 'dishwasher';
export type ApMode = 'run' | 'pause' | 'done' | 'off';
/** Body color: 'auto' = washer dark, dryer white, dishwasher with a light front */
export type ApFinish = 'auto' | 'white' | 'dark';

export interface FigState {
    mode: ApMode;
    /** 0..1, null when unknown */
    progress: number | null;
    /** Door is open */
    door: boolean;
    /** Text of the device display, e.g. "0:58" */
    display: string;
    /** Program name (display and knob position) */
    program: string;
}

export interface Figure {
    /** Takes over a new state (display texts, target speeds) */
    apply(s: FigState): void;
    /**
     * Advances the animation by dt seconds (t = seconds since start). `still` = reduced motion: no rotation.
     * Returns true while something still moves.
     */
    step(dt: number, t: number, still: boolean): boolean;
}

const f1 = (n: number): string => n.toFixed(1);
const ease = (cur: number, target: number, k: number): number => cur + (target - cur) * Math.min(1, k);
/** Easing factor of one frame; with reduced motion every change happens at once */
const rate = (dt: number, r: number, still: boolean): number => (still ? 1 : dt * r);

/** Three shapes of a piece of laundry, centered on 0,0 */
const CLOTH = [
    'M-11,-6 C-5,-13 8,-11 12,-3 C14,6 4,12 -5,10 C-12,8 -15,0 -11,-6Z',
    'M-9,-8 C0,-12 11,-6 10,2 C9,10 -2,12 -8,6 C-13,1 -14,-5 -9,-8Z',
    'M-13,-3 C-8,-10 6,-9 12,-4 C15,2 9,9 0,8 C-8,9 -15,4 -13,-3Z',
];

const FONT = 'style="font-family:var(--gh-font)"';

/** Short text for the small device display */
function clip(s: string, n: number): string {
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

function esc(s: string): string {
    return s.replace(/[&<>"]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

/* ------------------------------------------------------------------ washing machine */

const WM = { CX: 110, CY: 178, RG: 72 };

interface WasherPal {
    b1: string;
    b2: string;
    edge: string;
    top: string;
    feet: string;
    frame: string;
    ring: string;
    open: string;
    deco: string;
    drawer: string;
    drawer2: string;
}

const WASHER_PAL: Record<'white' | 'dark', WasherPal> = {
    dark: {
        b1: '#2c2d30',
        b2: '#1d1e21',
        edge: 'rgba(255,255,255,.07)',
        top: '#0f1012',
        feet: '#111',
        frame: '#232427',
        ring: '#f2f2ef',
        open: '#1d1e21',
        deco: 'rgba(255,255,255,.1)',
        drawer: '#141517',
        drawer2: '#26272a',
    },
    white: {
        b1: '#f7f7f5',
        b2: '#e1e2e0',
        edge: 'rgba(0,0,0,.1)',
        top: '#1c1d20',
        feet: '#9a9c9f',
        frame: '#e6e7e8',
        ring: '#a3a7ac',
        open: '#cfd1d4',
        deco: 'rgba(0,0,0,.08)',
        drawer: '#dcdddd',
        drawer2: '#c9cbcd',
    },
};

function washerMarkup(p: string, finish: ApFinish): string {
    const { CX, CY, RG } = WM;
    const c = WASHER_PAL[finish === 'white' ? 'white' : 'dark'];
    let holes = '';
    for (const [r, n] of [
        [58, 30],
        [47, 24],
        [36, 18],
    ]) {
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            holes += `<circle cx="${f1(CX + r * Math.cos(a))}" cy="${f1(CY + r * Math.sin(a))}" r="1.5"/>`;
        }
    }
    const lift = `<path d="M${CX},${CY - 66} l-7,13 q7,5 14,0 Z" fill="#2a2b2e"/>`;
    const cols = ['#5f7fae', '#d8c7a4', '#9aa0a8', '#b0604f', '#e9e6df', '#6b8f72'];
    let laundry = '';
    for (let i = 0; i < 6; i++) {
        laundry += `<path d="${CLOTH[i % 3]}" fill="${cols[i]}" opacity=".92"/>`;
    }
    let wave = `M${CX - RG - 80},0`;
    for (let x = 0; x < 2 * RG + 160; x += 20) {
        wave += ' q5,-3 10,0 t10,0';
    }
    wave += ` V${2 * RG + 20} H${CX - RG - 80}Z`;
    let foam = '';
    for (let i = 0; i < 14; i++) {
        foam += `<circle cx="${f1(CX - 50 + i * 7.5 + (i % 3) * 2)}" cy="${f1(-2 - (i % 4) * 2.2)}" r="${f1(2 + ((i * 7) % 5) * 0.7)}" fill="#fff" opacity=".8"/>`;
    }
    return (
        `<defs><linearGradient id="${p}B" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.b1}"/><stop offset="1" stop-color="${c.b2}"/></linearGradient>` +
        `<radialGradient id="${p}K" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fbfbfb"/><stop offset=".5" stop-color="#b9bcc0"/><stop offset="1" stop-color="#6e7277"/></radialGradient>` +
        `<radialGradient id="${p}G" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></radialGradient>` +
        `<clipPath id="${p}C"><circle cx="${CX}" cy="${CY}" r="${RG}"/></clipPath></defs>` +
        `<rect x="24" y="306" width="14" height="6" rx="2" fill="${c.feet}"/><rect x="182" y="306" width="14" height="6" rx="2" fill="${c.feet}"/>` +
        `<rect x="0" y="0" width="220" height="308" rx="7" fill="url(#${p}B)" stroke="${c.edge}"/>` +
        `<rect x="0" y="0" width="220" height="34" rx="7" fill="${c.top}"/><rect x="0" y="27" width="220" height="7" fill="${c.top}"/>` +
        '<line x1="74" y1="0" x2="74" y2="34" stroke="rgba(255,255,255,.06)"/><line x1="0" y1="34.5" x2="220" y2="34.5" stroke="rgba(255,255,255,.12)"/>' +
        '<rect x="12" y="10" width="30" height="3.4" rx="1.7" fill="#e9e9e6" opacity=".85"/><rect x="12" y="18" width="46" height="1.8" rx=".9" fill="#5b5e62"/><rect x="12" y="22.5" width="34" height="1.8" rx=".9" fill="#45484c"/>' +
        `<rect x="10" y="37" width="52" height="14" rx="2" fill="${c.drawer}"/><rect x="14" y="39" width="44" height="3" rx="1" fill="${c.drawer2}"/>` +
        `<g class="gh-ap-knob"><circle cx="98" cy="16" r="11.5" fill="url(#${p}K)"/><path d="M98 6v4" stroke="#55595e" stroke-width="1.2" stroke-linecap="round"/></g>` +
        `<g ${FONT}><rect x="129" y="13.3" width=".9" height="5.4" fill="#4fd1c5"/>` +
        '<rect x="132" y="7" width="22" height="1.4" rx=".7" fill="#3c3f43"/><rect x="132" y="22.6" width="16" height="1.4" rx=".7" fill="#3c3f43"/>' +
        '<text class="gh-ap-dprog" x="132" y="18" font-size="5.6" fill="#fff"></text>' +
        '<text class="gh-ap-dtime" x="196" y="18" font-size="6" font-weight="600" fill="#fff" text-anchor="end"></text></g>' +
        '<circle cx="207" cy="11" r="3.2" fill="none" stroke="#c9cbce" stroke-width=".8"/><path d="M205.6 21.5l3 2-3 2z" fill="#c9cbce"/>' +
        `<circle cx="185" cy="283" r="17" fill="none" stroke="${c.deco}"/>` +
        /* opening with the drum stays in the body, the door swings open at the left hinge */
        `<circle cx="${CX}" cy="${CY}" r="${RG + 12}" fill="${c.open}"/><circle cx="${CX}" cy="${CY}" r="${RG + 6}" fill="#151618"/>` +
        `<g clip-path="url(#${p}C)"><rect x="${CX - RG}" y="${CY - RG}" width="${2 * RG}" height="${2 * RG}" fill="#0a0b0c"/>` +
        `<g class="gh-ap-drum"><circle cx="${CX}" cy="${CY}" r="66" fill="#1b1c1f"/><g fill="#0d0e10">${holes}</g><circle cx="${CX}" cy="${CY}" r="14" fill="#232427"/>` +
        `${lift}<g transform="rotate(120 ${CX} ${CY})">${lift}</g><g transform="rotate(240 ${CX} ${CY})">${lift}</g></g>` +
        `<g class="gh-ap-laundry">${laundry}</g>` +
        `<g class="gh-ap-water" style="transform:translateY(${CY + RG + 4}px)"><g class="gh-ap-foam">${foam}</g>` +
        `<path class="gh-ap-wave gh-ap-wave2" d="${wave}" fill="rgba(120,175,225,.28)"/><path class="gh-ap-wave" d="${wave}" fill="rgba(140,190,235,.32)"/></g>` +
        `<circle cx="${CX}" cy="${CY}" r="${RG}" fill="url(#${p}G)"/></g>` +
        `<g class="gh-ap-door" style="transform-origin:20px ${CY}px"><circle cx="${CX}" cy="${CY}" r="85" fill="none" stroke="${c.frame}" stroke-width="14"/>` +
        `<circle cx="${CX}" cy="${CY}" r="92" fill="none" stroke="${c.ring}" stroke-width="1.8"/>` +
        `<circle class="gh-ap-glow" cx="${CX}" cy="${CY}" r="92" fill="none" stroke="var(--gh-ok)" stroke-width="4"/>` +
        `<g clip-path="url(#${p}C)"><circle class="gh-ap-glass" cx="${CX}" cy="${CY}" r="${RG + 6}" fill="rgba(150,170,190,.05)"/>` +
        `<path d="M${CX - 52},${CY - 34} A62,62 0 0 1 ${CX + 14},${CY - 62}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="5" stroke-linecap="round"/></g></g>`
    );
}

type WasherMode = 'wash' | 'rinse' | 'spin' | 'hold' | 'still';
const WM_LEVEL: Record<'wash' | 'rinse' | 'spin', number> = { wash: 0.36, rinse: 0.44, spin: 0.02 };

class WasherFigure implements Figure {
    private readonly wrap: HTMLElement;

    private readonly drum: SVGGElement | null;

    private readonly water: SVGGElement | null;

    private readonly foam: SVGGElement | null;

    private readonly laundry: SVGGElement | null;

    private readonly items: SVGElement[];

    private readonly dprog: SVGTextElement | null;

    private readonly dtime: SVGTextElement | null;

    private readonly knob: SVGGElement | null;

    private mode: WasherMode = 'still';

    private phase: 'wash' | 'rinse' | 'spin' = 'wash';

    private door = false;

    private a = 0;

    private v = 0;

    private blend = 0;

    private lvl = -1;

    constructor(svg: SVGSVGElement, wrap: HTMLElement) {
        this.wrap = wrap;
        this.drum = svg.querySelector('.gh-ap-drum');
        this.water = svg.querySelector('.gh-ap-water');
        this.foam = svg.querySelector('.gh-ap-foam');
        this.laundry = svg.querySelector('.gh-ap-laundry');
        this.items = this.laundry ? (Array.from(this.laundry.children) as SVGElement[]) : [];
        this.dprog = svg.querySelector('.gh-ap-dprog');
        this.dtime = svg.querySelector('.gh-ap-dtime');
        this.knob = svg.querySelector('.gh-ap-knob');
    }

    apply(s: FigState): void {
        const p = s.progress;
        this.phase = p === null || p < 0.55 ? 'wash' : p < 0.86 ? 'rinse' : 'spin';
        this.mode = s.mode === 'run' ? this.phase : s.mode === 'pause' ? 'hold' : 'still';
        this.door = s.door;
        if (this.dprog) {
            this.dprog.textContent = clip(s.program, 11);
        }
        if (this.dtime) {
            this.dtime.textContent = s.display;
        }
        if (this.knob) {
            this.knob.style.transform = `rotate(${s.program ? (hash(s.program) % 240) - 120 : 0}deg)`;
        }
    }

    step(dt: number, t: number, still: boolean): boolean {
        const { CX, CY, RG } = WM;
        let vt = 0;
        if (this.mode === 'wash') {
            vt = 150 * Math.cos(t * 0.9);
        } else if (this.mode === 'rinse') {
            vt = 110 * Math.cos(t * 0.7);
        } else if (this.mode === 'spin') {
            vt = 1500;
        }
        if (still) {
            vt = 0;
        }
        const lt = this.door
            ? 0
            : this.mode === 'still'
              ? 0
              : this.mode === 'hold'
                ? WM_LEVEL[this.phase]
                : WM_LEVEL[this.mode];
        if (this.lvl < 0) {
            this.lvl = lt;
            this.v = vt;
        }
        this.v = ease(this.v, vt, rate(dt, this.mode === 'spin' ? 0.8 : 2.5, still));
        this.a = (this.a + this.v * dt) % 360;
        this.drum?.setAttribute('transform', `rotate(${this.a.toFixed(1)} ${CX} ${CY})`);
        const press = this.mode === 'spin' && this.v > 500 ? 1 : 0;
        this.blend = ease(this.blend, press, rate(dt, 2, still));
        const wob = Math.min(1, Math.abs(this.v) / 60);
        const n = this.items.length;
        this.items.forEach((it, i) => {
            const off = i / n;
            const th1 = Math.PI / 2 + (off - 0.5) * 1.6 + 0.35 * wob * Math.sin(t * 1.6 + i * 1.7) + this.v / 700;
            const r1 = 36 + 9 * wob * Math.sin(t * 1.3 + i * 2.3) + (1 - wob) * 10;
            const th2 = (this.a * Math.PI) / 180 + off * Math.PI * 2;
            const th = th1 + (th2 - th1) * this.blend;
            const r = r1 + (56 - r1) * this.blend;
            const rot = (th * 57.3 + t * 30 * (1 - this.blend) * wob) % 360;
            it.setAttribute(
                'transform',
                `translate(${f1(CX + r * Math.cos(th))} ${f1(CY + r * Math.sin(th))}) rotate(${rot.toFixed(0)})`,
            );
        });
        this.laundry?.classList.toggle('gh-ap-blur', this.v > 700);
        this.wrap.classList.toggle('gh-ap-shake', this.v > 1000 && !still);
        this.lvl = ease(this.lvl, lt, rate(dt, 0.8, still));
        if (this.water) {
            this.water.style.transform = `translateY(${f1(CY + RG + 4 - this.lvl * 2 * RG)}px)`;
        }
        if (this.foam) {
            this.foam.style.opacity =
                this.phase === 'wash' && (this.mode === 'wash' || this.mode === 'hold') ? '1' : '0';
        }
        const active = this.mode === 'wash' || this.mode === 'rinse' || this.mode === 'spin';
        this.wrap.dataset.move = active && !still ? '1' : '0';
        return (
            (active && !still) ||
            Math.abs(this.v - vt) > 0.5 ||
            Math.abs(this.lvl - lt) > 0.003 ||
            Math.abs(this.blend - press) > 0.003
        );
    }
}

/* ------------------------------------------------------------------ dryer */

const DR = { CX: 110, CY: 152, RG: 66 };

interface DryerPal {
    b1: string;
    b2: string;
    edge: string;
    line: string;
    feet: string;
    text: string;
    open: string;
    inner: string;
    outer: string;
    grille: string;
}

const DRYER_PAL: Record<'white' | 'dark', DryerPal> = {
    white: {
        b1: '#f6f6f4',
        b2: '#e3e4e2',
        edge: 'rgba(0,0,0,.09)',
        line: 'rgba(0,0,0,.08)',
        feet: '#9a9c9f',
        text: '#a9acb0',
        open: '#cfd1d4',
        inner: '#d9dbdd',
        outer: 'rgba(0,0,0,.14)',
        grille: '#c4c6c9',
    },
    dark: {
        b1: '#2c2d30',
        b2: '#1d1e21',
        edge: 'rgba(255,255,255,.07)',
        line: 'rgba(255,255,255,.08)',
        feet: '#111',
        text: '#5e6166',
        open: '#3a3b3e',
        inner: '#46484c',
        outer: 'rgba(255,255,255,.12)',
        grille: '#46484c',
    },
};

function dryerMarkup(p: string, finish: ApFinish): string {
    const { CX, CY, RG } = DR;
    const c = DRYER_PAL[finish === 'dark' ? 'dark' : 'white'];
    let holes = '';
    for (let x = -60; x <= 60; x += 6.5) {
        for (let y = -60; y <= 60; y += 6.5) {
            if (x * x + y * y < 3600 && x * x + y * y > 169) {
                holes += `<circle cx="${f1(CX + x + (Math.round(y / 6.5) % 2 ? 3.2 : 0))}" cy="${f1(CY + y)}" r="1.3"/>`;
            }
        }
    }
    let ribs = '';
    for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + 0.3;
        const pt = (r: number, d: number): string => `${f1(CX + r * Math.cos(a + d))},${f1(CY + r * Math.sin(a + d))}`;
        ribs += `<polygon points="${pt(11, -0.5)} ${pt(64, -0.1)} ${pt(64, 0.1)} ${pt(11, 0.5)}" fill="url(#${p}R)" stroke="#9fa3a8" stroke-width=".6"/>`;
    }
    const cols = ['#c9b391', '#6a86b3', '#e8e3d8', '#9c5a4c', '#7d8f7a', '#d3d6da'];
    let laundry = '';
    for (let i = 0; i < 6; i++) {
        laundry += `<path d="${CLOTH[i % 3]}" fill="${cols[i]}"/>`;
    }
    let steam = '';
    for (let i = 0; i < 9; i++) {
        steam += `<circle cx="${CX - 36 + i * 9}" cy="${CY + 30 - (i % 3) * 6}" r="${f1(2.2 + (i % 3))}" fill="#fff" style="animation-delay:${(i * 0.37).toFixed(2)}s"/>`;
    }
    let lines = '';
    for (let i = 0; i < 5; i++) {
        lines += `<rect x="66" y="${10 + i * 5}" width="${14 + ((i * 7) % 9)}" height="1.3" rx=".6" fill="${c.text}"/>`;
        lines += `<rect x="${118 - ((i * 5) % 8)}" y="${10 + i * 5}" width="${14 + ((i * 5) % 8)}" height="1.3" rx=".6" fill="${c.text}"/>`;
    }
    let grille = '';
    for (let x = -16; x <= 16; x += 3.2) {
        for (let y = -16; y <= 16; y += 3.2) {
            if (x * x + y * y < 256) {
                grille += `<circle cx="${f1(188 + x)}" cy="${f1(275 + y)}" r=".9"/>`;
            }
        }
    }
    return (
        `<defs><linearGradient id="${p}B" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.b1}"/><stop offset="1" stop-color="${c.b2}"/></linearGradient>` +
        `<linearGradient id="${p}C" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#9da1a6"/><stop offset=".7" stop-color="#e9eaec"/><stop offset="1" stop-color="#8e9297"/></linearGradient>` +
        `<radialGradient id="${p}D" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#f1f2f3"/><stop offset=".7" stop-color="#b8bcc1"/><stop offset="1" stop-color="#7b8086"/></radialGradient>` +
        `<linearGradient id="${p}R" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbfbfb"/><stop offset="1" stop-color="#c3c6ca"/></linearGradient>` +
        `<radialGradient id="${p}W" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#ff9a4a" stop-opacity=".55"/><stop offset="1" stop-color="#ff9a4a" stop-opacity="0"/></radialGradient>` +
        `<radialGradient id="${p}Q" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#7fb8ff" stop-opacity=".5"/><stop offset="1" stop-color="#7fb8ff" stop-opacity="0"/></radialGradient>` +
        `<radialGradient id="${p}G" cx=".5" cy=".5" r=".5"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>` +
        `<clipPath id="${p}X"><circle cx="${CX}" cy="${CY}" r="${RG}"/></clipPath></defs>` +
        `<rect x="16" y="294" width="14" height="6" rx="2" fill="${c.feet}"/><rect x="190" y="294" width="14" height="6" rx="2" fill="${c.feet}"/>` +
        `<rect x="0" y="0" width="220" height="296" rx="6" fill="url(#${p}B)" stroke="${c.edge}"/>` +
        `<line x1="0" y1="42" x2="220" y2="42" stroke="${c.line}"/><line x1="0" y1="256" x2="220" y2="256" stroke="${c.line}"/>` +
        `<rect x="8" y="14" width="50" height="11" rx="1.6" fill="#2a2b2d"/><rect x="11" y="16" width="44" height="1.3" rx=".6" fill="#c8cbcf"/><rect x="22" y="19.6" width="22" height="2.2" rx="1.1" fill="#e9e9e6" opacity=".8"/>${
            lines
        }<g class="gh-ap-knob"><circle cx="100" cy="22" r="10" fill="url(#${p}C)"/><circle cx="100" cy="22" r="6.3" fill="#3a3c3f"/><circle cx="100" cy="15" r=".9" fill="#e44"/></g>` +
        `<rect x="140" y="11" width="72" height="26" rx="2" fill="#121314"/><g ${FONT}>` +
        `<text class="gh-ap-dprog" x="144" y="17" font-size="2.8" fill="#9a9da1"></text><rect x="144" y="18.5" width="17" height=".6" fill="#e33"/>` +
        `<rect x="144" y="30.4" width="26" height="1.2" rx=".6" fill="#55585c"/>` +
        `<text class="gh-ap-dtime" x="207" y="28" font-size="9" font-weight="500" fill="#fff" text-anchor="end"></text></g>` +
        /* opening with the drum stays in the body, the door (chrome ring + glass) swings open at the left hinge */
        `<circle cx="${CX}" cy="${CY}" r="${RG + 9}" fill="${c.open}" stroke="${c.outer}"/><circle cx="${CX}" cy="${CY}" r="${RG + 3}" fill="#55595e"/>` +
        `<g clip-path="url(#${p}X)"><g class="gh-ap-drum"><circle cx="${CX}" cy="${CY}" r="66" fill="url(#${p}D)"/><g fill="#6f7479" opacity=".55">${holes}</g>${ribs}` +
        `<circle cx="${CX}" cy="${CY}" r="12" fill="url(#${p}C)" stroke="#8a8e93" stroke-width=".8"/><circle cx="${CX}" cy="${CY}" r="4.5" fill="#6d7176"/></g>` +
        `<rect class="gh-ap-warm" x="${CX - RG}" y="${CY - RG}" width="${2 * RG}" height="${2 * RG}" fill="url(#${p}W)" opacity="0"/>` +
        `<rect class="gh-ap-cool" x="${CX - RG}" y="${CY - RG}" width="${2 * RG}" height="${2 * RG}" fill="url(#${p}Q)" opacity="0"/>` +
        `<g class="gh-ap-laundry">${laundry}</g><g class="gh-ap-steam" opacity="0">${steam}</g>` +
        `<circle cx="${CX}" cy="${CY}" r="${RG}" fill="url(#${p}G)"/></g>` +
        `<g class="gh-ap-door" style="transform-origin:24px ${CY}px"><circle cx="${CX}" cy="${CY}" r="77.5" fill="none" stroke="url(#${p}C)" stroke-width="17"/>` +
        `<circle cx="${CX}" cy="${CY}" r="73" fill="none" stroke="${c.inner}" stroke-width="8"/>` +
        `<circle cx="${CX}" cy="${CY}" r="86" fill="none" stroke="${c.outer}"/>` +
        `<circle class="gh-ap-glow" cx="${CX}" cy="${CY}" r="86" fill="none" stroke="var(--gh-ok)" stroke-width="4"/>` +
        `<circle cx="${CX}" cy="${CY}" r="${RG + 1.5}" fill="none" stroke="#55595e" stroke-width="3"/>` +
        `<g clip-path="url(#${p}X)"><circle class="gh-ap-glass" cx="${CX}" cy="${CY}" r="${RG}" fill="rgba(70,74,80,.18)"/>` +
        `<path d="M${CX - 50},${CY - 30} A60,60 0 0 1 ${CX + 10},${CY - 60}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="5" stroke-linecap="round"/>` +
        `<line x1="${CX - 40}" y1="${CY + 30}" x2="${CX + 40}" y2="${CY + 30}" stroke="#fff" stroke-opacity=".5" stroke-width=".7"/></g></g>` +
        `<g fill="${c.grille}">${grille}</g><circle cx="188" cy="275" r="18" fill="none" stroke="${c.line}"/>`
    );
}

type DryerMode = 'dry' | 'cool' | 'hold' | 'still';

class DryerFigure implements Figure {
    private readonly wrap: HTMLElement;

    private readonly drum: SVGGElement | null;

    private readonly warm: SVGElement | null;

    private readonly cool: SVGElement | null;

    private readonly steam: SVGGElement | null;

    private readonly items: SVGElement[];

    private readonly dprog: SVGTextElement | null;

    private readonly dtime: SVGTextElement | null;

    private readonly knob: SVGGElement | null;

    private mode: DryerMode = 'still';

    private progress = 0;

    private a = 0;

    private v = 0;

    private ph = 0;

    private warmO = -1;

    private coolO = 0;

    private steamO = 0;

    constructor(svg: SVGSVGElement, wrap: HTMLElement) {
        this.wrap = wrap;
        this.drum = svg.querySelector('.gh-ap-drum');
        this.warm = svg.querySelector('.gh-ap-warm');
        this.cool = svg.querySelector('.gh-ap-cool');
        this.steam = svg.querySelector('.gh-ap-steam');
        const l = svg.querySelector('.gh-ap-laundry');
        this.items = l ? (Array.from(l.children) as SVGElement[]) : [];
        this.dprog = svg.querySelector('.gh-ap-dprog');
        this.dtime = svg.querySelector('.gh-ap-dtime');
        this.knob = svg.querySelector('.gh-ap-knob');
    }

    apply(s: FigState): void {
        this.progress = s.progress ?? 0.4;
        this.mode = s.mode === 'run' ? (this.progress < 0.86 ? 'dry' : 'cool') : s.mode === 'pause' ? 'hold' : 'still';
        if (this.dprog) {
            this.dprog.textContent = clip(s.program, 22);
        }
        if (this.dtime) {
            this.dtime.textContent = s.display;
        }
        if (this.knob) {
            this.knob.style.transform = `rotate(${s.program ? (hash(s.program) % 120) - 60 : 0}deg)`;
        }
    }

    step(dt: number, t: number, still: boolean): boolean {
        const { CX, CY } = DR;
        const dir = Math.sin(t * 0.16) >= 0 ? 1 : -1;
        const active = this.mode === 'dry' || this.mode === 'cool';
        const vt = active && !still ? 62 * dir : 0;
        this.v = ease(this.v, vt, rate(dt, 1.5, still));
        this.a = (this.a + this.v * dt) % 360;
        this.drum?.setAttribute('transform', `rotate(${this.a.toFixed(1)} ${CX} ${CY})`);
        const moving = Math.min(1, Math.abs(this.v) / 40);
        const sg = this.v >= 0 ? 1 : -1;
        this.ph += dt * 0.42 * moving;
        const rest = 1 - Math.min(1, moving / 0.3);
        const n = this.items.length;
        this.items.forEach((it, i) => {
            const off = i / n;
            const cyc = (((this.ph + off) % 1) + 1) % 1;
            let x: number;
            let y: number;
            if (cyc < 0.68) {
                const th = Math.PI / 2 - sg * (cyc / 0.68) * 1.9 * moving;
                x = CX + 52 * Math.cos(th);
                y = CY + 52 * Math.sin(th);
            } else {
                const k = (cyc - 0.68) / 0.32;
                const th = Math.PI / 2 - sg * 1.9 * moving;
                const x0 = CX + 52 * Math.cos(th);
                const y0 = CY + 52 * Math.sin(th);
                const x1 = CX + (off - 0.5) * 34;
                const y1 = CY + 40;
                x = x0 + (x1 - x0) * k;
                y = y0 + (y1 - y0) * k * k;
            }
            const rx = CX + (off - 0.5) * 70;
            const ry = CY + 42 - Math.abs(off - 0.5) * 16;
            x += (rx - x) * rest;
            y += (ry - y) * rest;
            const rot = ((t * 45 + i * 60) * moving + i * 47) % 360;
            it.setAttribute('transform', `translate(${f1(x)} ${f1(y)}) rotate(${rot.toFixed(0)})`);
        });
        const wt = this.mode === 'dry' ? 0.9 : 0;
        const ct = this.mode === 'cool' ? 0.8 : 0;
        const st = this.mode === 'dry' ? Math.max(0.15, 1 - this.progress / 0.86) : 0;
        if (this.warmO < 0) {
            this.warmO = wt;
            this.coolO = ct;
            this.steamO = st;
        }
        this.warmO = ease(this.warmO, wt, rate(dt, 1, still));
        this.coolO = ease(this.coolO, ct, rate(dt, 1, still));
        this.steamO = ease(this.steamO, st, rate(dt, 1, still));
        this.warm?.setAttribute('opacity', this.warmO.toFixed(2));
        this.cool?.setAttribute('opacity', this.coolO.toFixed(2));
        this.steam?.setAttribute('opacity', this.steamO.toFixed(2));
        this.wrap.dataset.move = active && !still ? '1' : '0';
        return (
            (active && !still) ||
            Math.abs(this.v) > 0.5 ||
            Math.abs(this.warmO - wt) > 0.005 ||
            Math.abs(this.coolO - ct) > 0.005 ||
            Math.abs(this.steamO - st) > 0.005
        );
    }
}

/* ------------------------------------------------------------------ dishwasher */

function dishwasherMarkup(p: string, finish: ApFinish): string {
    const front = finish === 'dark' ? '#2a2b2e' : finish === 'white' ? '#f4f4f2' : '#ece7de';
    const X0 = 20;
    const X1 = 200;
    let plates = '';
    for (let i = 0; i < 9; i++) {
        const x = 34 + i * 17;
        const tl = i % 2 ? -4 : 3;
        plates += `<ellipse cx="${x}" cy="190" rx="4.2" ry="${i % 3 === 1 ? 22 : 26}" fill="#fbfbfa" stroke="#c9ccd0" stroke-width=".8" transform="rotate(${tl} ${x} 210)"/>`;
    }
    plates +=
        '<path d="M150,206 h34 a3,3 0 0 1 3,3 v10 h-40 v-10 a3,3 0 0 1 3,-3z" fill="#6f7a86"/><rect x="146" y="200" width="42" height="7" rx="2" fill="#808b97"/>';
    let glasses = '';
    for (let i = 0; i < 5; i++) {
        const x = 34 + i * 22;
        glasses += `<path d="M${x - 7},78 h14 l-2,32 h-10 z" fill="rgba(210,230,245,.55)" stroke="#aebfcc" stroke-width=".8"/><ellipse cx="${x}" cy="110" rx="5" ry="1.4" fill="rgba(180,205,225,.6)"/>`;
    }
    for (let i = 0; i < 3; i++) {
        const x = 148 + i * 18;
        glasses += `<rect x="${x - 7}" y="92" width="14" height="18" rx="2.5" fill="${['#d9cdb8', '#9fb4c9', '#e5e2dc'][i]}"/><path d="M${x + 7},98 q6,0 6,5 q0,5 -6,5" fill="none" stroke="#b8b1a5" stroke-width="1.6"/>`;
    }
    let cutlery = '';
    for (let i = 0; i < 16; i++) {
        const x = 30 + i * 10.5;
        cutlery += `<line x1="${f1(x)}" y1="28" x2="${f1(x + 6)}" y2="36" stroke="#a7abb0" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    const rack = (y0: number, y1: number): string => {
        let g = `<rect x="26" y="${y0}" width="168" height="${y1 - y0}" rx="3" fill="none" stroke="#8d9298" stroke-width="1.4"/>`;
        for (let x = 34; x < 194; x += 8) {
            g += `<line x1="${x}" y1="${y1 - 12}" x2="${x}" y2="${y1}" stroke="#9aa0a6" stroke-width=".8"/>`;
        }
        return g;
    };
    let drops = '';
    for (let i = 0; i < 26; i++) {
        drops += `<circle cx="${32 + ((i * 37) % 156)}" cy="${84 + ((i * 53) % 140)}" r="${f1(0.9 + (i % 3) * 0.4)}" fill="#fff" opacity=".85"/>`;
    }
    let steam = '';
    for (let i = 0; i < 10; i++) {
        steam += `<circle cx="${40 + i * 15}" cy="${150 - (i % 3) * 30}" r="${f1(2.5 + (i % 3))}" fill="#fff" style="animation-delay:${(i * 0.31).toFixed(2)}s"/>`;
    }
    let jets = '';
    for (let i = 0; i < 70; i++) {
        jets += '<circle r="1.1" fill="#bfe0ff" opacity="0"/>';
    }
    return (
        `<defs><linearGradient id="${p}T" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9bec4"/><stop offset=".25" stop-color="#e7e9ec"/><stop offset=".75" stop-color="#e7e9ec"/><stop offset="1" stop-color="#b9bec4"/></linearGradient>` +
        `<radialGradient id="${p}H" cx=".5" cy=".6" r=".7"><stop offset="0" stop-color="#ffb36b" stop-opacity=".45"/><stop offset="1" stop-color="#ffb36b" stop-opacity="0"/></radialGradient>` +
        `<filter id="${p}F" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="2.2"/></filter>` +
        `<clipPath id="${p}C"><rect x="${X0}" y="16" width="${X1 - X0}" height="226" rx="4"/></clipPath></defs>` +
        '<rect x="0" y="0" width="220" height="10" rx="2" fill="#c9b28f"/><rect x="0" y="9" width="220" height="2" fill="rgba(0,0,0,.12)"/>' +
        `<rect x="${X0 - 6}" y="12" width="${X1 - X0 + 12}" height="236" rx="3" fill="#d4d6d9"/>` +
        `<g clip-path="url(#${p}C)"><rect x="${X0}" y="16" width="${X1 - X0}" height="226" fill="url(#${p}T)"/>` +
        `<rect class="gh-ap-heat" x="${X0}" y="16" width="${X1 - X0}" height="226" fill="url(#${p}H)" opacity="0"/>` +
        `<rect x="26" y="24" width="168" height="15" rx="2" fill="none" stroke="#8d9298" stroke-width="1.2"/>${rack(70, 116)}${rack(150, 226)}` +
        `<g class="gh-ap-dishes">${cutlery}${glasses}${plates}<g class="gh-ap-drops">${drops}</g></g>` +
        '<g class="gh-ap-arm1"><rect x="40" y="124" width="140" height="4" rx="2" fill="#7f868d"/></g>' +
        '<g class="gh-ap-arm2"><rect x="30" y="230" width="160" height="5" rx="2.5" fill="#7f868d"/></g>' +
        '<circle cx="110" cy="126" r="4" fill="#5f666d"/><circle cx="110" cy="232.5" r="5" fill="#5f666d"/>' +
        `<g class="gh-ap-jets">${jets}</g><g class="gh-ap-steam" opacity="0">${steam}</g>` +
        '<path d="M20,240 q10,-2 20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 V244 H20Z" fill="rgba(120,175,225,.45)"/></g>' +
        `<rect class="gh-ap-front" x="${X0 - 6}" y="12" width="${X1 - X0 + 12}" height="236" rx="3" fill="${front}" stroke="rgba(0,0,0,.12)"/>` +
        `<rect x="${X0 - 6}" y="248" width="${X1 - X0 + 12}" height="14" fill="#2d2e30"/>` +
        '<rect x="0" y="262" width="220" height="38" fill="rgba(0,0,0,.05)"/>' +
        `<g class="gh-ap-tl"><ellipse class="gh-ap-tlglow" cx="110" cy="281" rx="52" ry="10" opacity=".35" filter="url(#${p}F)"/>` +
        `<g transform="translate(110 288) scale(1 .55)"><text class="gh-ap-dtime" text-anchor="middle" font-size="30" font-weight="500" ${FONT}></text></g></g>`
    );
}

type DishMode = 'spray' | 'hot' | 'dry' | 'hold' | 'still';

interface Jet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    top: number;
}

class DishwasherFigure implements Figure {
    private readonly wrap: HTMLElement;

    private readonly arm1: SVGGElement | null;

    private readonly arm2: SVGGElement | null;

    private readonly jetEls: SVGElement[];

    private readonly jets: Jet[];

    private readonly heat: SVGElement | null;

    private readonly steam: SVGGElement | null;

    private readonly drops: SVGGElement | null;

    private readonly dtime: SVGTextElement | null;

    private mode: DishMode = 'still';

    private ui: ApMode = 'off';

    private phaseF = 0;

    private ang = 0;

    private heatO = -1;

    private steamO = 0;

    private dropsO = 1;

    constructor(svg: SVGSVGElement, wrap: HTMLElement) {
        this.wrap = wrap;
        this.arm1 = svg.querySelector('.gh-ap-arm1');
        this.arm2 = svg.querySelector('.gh-ap-arm2');
        const j = svg.querySelector('.gh-ap-jets');
        this.jetEls = j ? (Array.from(j.children) as SVGElement[]) : [];
        this.jets = this.jetEls.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, top: 0 }));
        this.heat = svg.querySelector('.gh-ap-heat');
        this.steam = svg.querySelector('.gh-ap-steam');
        this.drops = svg.querySelector('.gh-ap-drops');
        this.dtime = svg.querySelector('.gh-ap-dtime');
    }

    apply(s: FigState): void {
        /* phases of an eco program: pre-rinse, clean (hot), rinse, final rinse, dry */
        const p = s.progress ?? 0.3;
        const PH = [0.077, 0.436, 0.564, 0.744];
        const i = PH.findIndex(x => p < x);
        const ph: DishMode = i === 1 ? 'hot' : i === -1 ? 'dry' : 'spray';
        this.phaseF = i === -1 ? (p - 0.744) / 0.256 : 0;
        this.ui = s.mode;
        this.mode = s.mode === 'run' ? ph : s.mode === 'pause' ? 'hold' : 'still';
        if (this.dtime) {
            this.dtime.textContent = s.display;
        }
    }

    step(dt: number, _t: number, still: boolean): boolean {
        const spraying = (this.mode === 'spray' || this.mode === 'hot') && !still;
        if (spraying) {
            this.ang += dt * 5.5;
        }
        const k1 = Math.abs(Math.cos(this.ang));
        const k2 = Math.abs(Math.cos(this.ang * 0.8 + 1));
        this.arm1?.setAttribute(
            'transform',
            `translate(110 0) scale(${(0.12 + 0.88 * k1).toFixed(3)} 1) translate(-110 0)`,
        );
        this.arm2?.setAttribute(
            'transform',
            `translate(110 0) scale(${(0.12 + 0.88 * k2).toFixed(3)} 1) translate(-110 0)`,
        );
        let alive = false;
        this.jets.forEach((q, i) => {
            if (q.life <= 0 && spraying && Math.random() < 0.35) {
                const low = i % 2 === 0;
                const L = (low ? 80 : 70) * (low ? k2 : k1);
                q.x = 110 + (Math.random() * 2 - 1) * L;
                q.y = low ? 229 : 123;
                q.vx = (Math.random() - 0.5) * 40;
                q.vy = -(90 + Math.random() * 90);
                q.life = 0.55 + Math.random() * 0.3;
                q.top = low ? 150 : 72;
            }
            if (q.life > 0) {
                q.life = still ? 0 : q.life - dt;
                q.vy += 260 * dt;
                q.x += q.vx * dt;
                q.y += q.vy * dt;
                if (q.y < q.top) {
                    q.life = 0;
                }
            }
            if (q.life > 0) {
                alive = true;
            }
            const e = this.jetEls[i];
            e.setAttribute('cx', f1(q.x));
            e.setAttribute('cy', f1(q.y));
            e.setAttribute('opacity', q.life > 0 ? Math.min(0.9, q.life * 2).toFixed(2) : '0');
        });
        const ht = this.mode === 'hot' ? 0.9 : this.mode === 'dry' ? 0.55 : 0;
        const st = this.mode === 'dry' || this.mode === 'hot' ? 0.8 : 0;
        const dtg =
            this.ui === 'off' || this.ui === 'done' ? 0 : this.mode === 'dry' ? Math.max(0, 1 - this.phaseF * 1.4) : 1;
        if (this.heatO < 0) {
            this.heatO = ht;
            this.steamO = st;
            this.dropsO = dtg;
        }
        this.heatO = ease(this.heatO, ht, rate(dt, 0.8, still));
        this.steamO = ease(this.steamO, st, rate(dt, 0.7, still));
        this.dropsO = ease(this.dropsO, dtg, rate(dt, 0.6, still));
        this.heat?.setAttribute('opacity', this.heatO.toFixed(2));
        this.steam?.setAttribute('opacity', this.steamO.toFixed(2));
        this.drops?.setAttribute('opacity', this.dropsO.toFixed(2));
        const active = this.mode === 'spray' || this.mode === 'hot' || this.mode === 'dry';
        this.wrap.dataset.move = active && !still ? '1' : '0';
        return (
            spraying ||
            alive ||
            Math.abs(this.heatO - ht) > 0.005 ||
            Math.abs(this.steamO - st) > 0.005 ||
            Math.abs(this.dropsO - dtg) > 0.005
        );
    }
}

/* ------------------------------------------------------------------ factory */

/** viewBox of each illustration */
export const VIEWBOX: Record<ApType, string> = {
    washer: '0 0 220 312',
    dryer: '0 0 220 300',
    dishwasher: '0 0 220 300',
};

/** SVG content of an illustration; `p` prefixes all ids (unique per widget instance) */
export function figureMarkup(type: ApType, p: string, finish: ApFinish = 'auto'): string {
    const safe = esc(p);
    if (type === 'dryer') {
        return dryerMarkup(safe, finish);
    }
    if (type === 'dishwasher') {
        return dishwasherMarkup(safe, finish);
    }
    return washerMarkup(safe, finish);
}

/** Animation controller for an illustration that is already in the DOM */
export function createFigure(type: ApType, svg: SVGSVGElement, wrap: HTMLElement): Figure {
    if (type === 'dryer') {
        return new DryerFigure(svg, wrap);
    }
    if (type === 'dishwasher') {
        return new DishwasherFigure(svg, wrap);
    }
    return new WasherFigure(svg, wrap);
}
