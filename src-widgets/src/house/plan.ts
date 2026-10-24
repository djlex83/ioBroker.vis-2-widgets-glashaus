/* House model data: the example house, the JSON formats of the attributes "plan" and "devices",
 * parsing/validation into normalized structures and small geometry helpers.
 * All coordinates are meters on the floor plan: x to the right (east), y downwards (south). */

export type Pt = [number, number];
export type RoomKind = 'room' | 'outside' | 'stairs';
export type DeviceType = 'light' | 'motion' | 'window' | 'thermostat' | 'plug' | 'temperature' | 'shutter';

export const DEVICE_TYPES: DeviceType[] = ['light', 'plug', 'motion', 'window', 'thermostat', 'temperature', 'shutter'];

/** Icon and accent color per device type */
export const DEVICE_LOOK: Record<DeviceType, { icon: string; accent: string }> = {
    light: { icon: 'bulb', accent: 'sun' },
    plug: { icon: 'plug', accent: 'home' },
    motion: { icon: 'motion', accent: 'ok' },
    window: { icon: 'window', accent: 'cool' },
    thermostat: { icon: 'thermo', accent: 'heat' },
    temperature: { icon: 'thermo', accent: 'heat' },
    shutter: { icon: 'garage', accent: 'fg' },
};

export interface HouseRoom {
    id: string;
    /** Unique key `<floor index>:<room index>` (React keys) */
    key: string;
    name: string;
    kind: RoomKind;
    /** Accent name (home, grid, …) or CSS color; '' = neutral */
    accent: string;
    p: Pt[];
    /** Label position (inside the polygon) */
    c: Pt;
    box: [number, number, number, number];
    /** Area in m² */
    area: number;
    /** Index of the floor */
    floor: number;
}

export interface HouseFloor {
    id: string;
    name: string;
    short: string;
    /** Storey height (m) */
    h: number;
    /** Height of the floor above the lowest one (m) */
    z: number;
    foot: Pt[];
    rooms: HouseRoom[];
    attic: boolean;
    index: number;
    /** Bounding box of outline and all rooms */
    box: [number, number, number, number];
}

export interface HouseRoof {
    /** Index of the floor the roof sits on */
    base: number;
    /** Pitch in radians */
    pitch: number;
    /** Direction of the ridge */
    ridge: 'x' | 'y';
    /** Height of the eaves above the base floor (m) */
    knee: number;
    overhang: number;
}

export interface HousePlan {
    floors: HouseFloor[];
    roof: HouseRoof | null;
    box: [number, number, number, number];
    /** Average storey height */
    hAvg: number;
}

export interface HouseDevice {
    id: string;
    type: DeviceType;
    floor: number;
    room: HouseRoom | null;
    x: number;
    y: number;
    oid: string;
    oidSet: string;
    label: string;
    unit: string;
    dec: number;
    icon: string;
    accent: string;
    /** Demo value generator (example devices only) */
    demo?: (s: number) => ioBroker.StateValue;
    demoSet?: (s: number) => ioBroker.StateValue;
}

/* ---------- geometry ---------- */

export function bbox(pts: Pt[]): [number, number, number, number] {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    pts.forEach(([x, y]) => {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
    });
    return [x0, y0, x1, y1];
}

export function polyArea(p: Pt[]): number {
    let a = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
    }
    return Math.abs(a / 2);
}

/** Point-in-polygon test (even-odd rule) */
export function inPoly(x: number, y: number, p: Pt[]): boolean {
    let ins = false;
    for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
        const [xa, ya] = p[a];
        const [xb, yb] = p[b];
        if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) {
            ins = !ins;
        }
    }
    return ins;
}

/** A point inside the polygon for the label: area centroid, else box center, else vertex average */
function labelPoint(p: Pt[], box: [number, number, number, number]): Pt {
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const f = p[j][0] * p[i][1] - p[i][0] * p[j][1];
        a += f;
        cx += (p[j][0] + p[i][0]) * f;
        cy += (p[j][1] + p[i][1]) * f;
    }
    if (Math.abs(a) > 1e-6) {
        const c: Pt = [cx / (3 * a), cy / (3 * a)];
        if (inPoly(c[0], c[1], p)) {
            return c;
        }
    }
    const bc: Pt = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
    if (inPoly(bc[0], bc[1], p)) {
        return bc;
    }
    return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
}

/* ---------- example house (invented, 12.0 × 10.4 m, three storeys and an attic) ---------- */

interface RawRoom {
    id?: unknown;
    name?: unknown;
    p?: unknown;
    kind?: unknown;
    accent?: unknown;
}
interface RawFloor {
    id?: unknown;
    name?: unknown;
    short?: unknown;
    h?: unknown;
    foot?: unknown;
    rooms?: unknown;
    attic?: unknown;
}
interface RawPlan {
    floors?: unknown;
    roof?: unknown;
}

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
];
const rm = (id: string, name: string, p: Pt[], kind?: RoomKind, accent?: string): RawRoom => ({
    id,
    name,
    p,
    kind,
    accent,
});

/** Names are i18n keys (house_r_…, house_f_…) that are translated when the example is used */
export const EXAMPLE_PLAN: RawPlan = {
    roof: { base: 'upper', pitch: 38, ridge: 'x', knee: 1, overhang: 0.5 },
    floors: [
        {
            id: 'basement',
            name: 'f_basement',
            short: 'fs_basement',
            h: 2.7,
            foot: rect(0, 0, 12, 10.4),
            rooms: [
                rm('heating', 'r_heating', rect(0, 0, 3.23, 2.77)),
                rm('storage1', 'r_storage1', rect(3.23, 0, 6.46, 2.77)),
                rm('laundry', 'r_laundry', rect(6.46, 0, 9.23, 2.77)),
                rm('storeroom', 'r_storeroom', rect(9.23, 0, 12, 2.77)),
                rm('storage2', 'r_storage2', rect(0, 2.77, 5.54, 5.08)),
                rm('hall_b', 'r_hall', rect(5.54, 2.77, 9.23, 5.08)),
                rm('wc_b', 'r_wc', rect(9.23, 2.77, 12, 5.08)),
                rm('garage', 'r_garage', rect(0, 5.08, 5.54, 10.4)),
                rm('stairs_b', 'r_stairs', rect(5.54, 5.08, 6.65, 7.86), 'stairs'),
                rm('hobby', 'r_hobby', [
                    [6.65, 5.08],
                    [12, 5.08],
                    [12, 10.4],
                    [5.54, 10.4],
                    [5.54, 7.86],
                    [6.65, 7.86],
                ]),
                rm('carport', 'r_carport', rect(-3.51, 5.36, -0.18, 10.91), 'outside'),
                rm('terrace_b', 'r_terrace', rect(8.31, 10.4, 12, 12.02), 'outside'),
            ],
        },
        {
            id: 'ground',
            name: 'f_ground',
            short: 'fs_ground',
            h: 2.7,
            foot: rect(0, 0, 12, 10.4),
            rooms: [
                rm('living', 'r_living_dining', rect(0, 0, 6, 4.81), 'room', 'home'),
                rm('kitchen', 'r_kitchen', rect(0, 4.81, 3.69, 7.86), 'room', 'home'),
                rm(
                    'hall',
                    'r_hall',
                    [
                        [3.69, 4.81],
                        [5.72, 4.81],
                        [5.72, 10.4],
                        [2.03, 10.4],
                        [2.03, 7.86],
                        [3.69, 7.86],
                    ],
                    'room',
                    'home',
                ),
                rm('wc', 'r_wc', rect(0, 7.86, 2.03, 10.4), 'room', 'home'),
                rm('stairs_a', 'r_stairs', rect(5.72, 4.81, 6.74, 7.95), 'stairs', 'home'),
                rm('porch', 'r_porch', rect(5.72, 7.95, 7.38, 10.4)),
                rm('stairs_a2', 'r_stairs', rect(6.74, 4.81, 7.75, 7.95), 'stairs', 'grid'),
                rm('living_b', 'r_living', rect(6, 0, 9.23, 4.81), 'room', 'grid'),
                rm(
                    'hall_b2',
                    'r_hall',
                    [
                        [7.75, 4.81],
                        [9.23, 4.81],
                        [9.23, 10.4],
                        [7.38, 10.4],
                        [7.38, 7.95],
                        [7.75, 7.95],
                    ],
                    'room',
                    'grid',
                ),
                rm('kitchen_b', 'r_kitchen', rect(9.23, 0, 12, 3.33), 'room', 'grid'),
                rm('bath_b', 'r_bath', rect(9.23, 3.33, 12, 5.92), 'room', 'grid'),
                rm('bedroom_b', 'r_bedroom', rect(9.23, 5.92, 12, 10.4), 'room', 'grid'),
                rm('terrace_w', 'r_terrace', rect(0.46, -2.03, 4.25, 0), 'outside'),
                rm('terrace', 'r_terrace', rect(4.25, -2.4, 7.75, 0), 'outside'),
                rm('terrace_e', 'r_terrace', rect(7.75, -2.03, 11.54, 0), 'outside'),
                rm('entrance', 'r_entrance', rect(5.72, 10.4, 7.38, 11.65), 'outside'),
            ],
        },
        {
            id: 'upper',
            name: 'f_upper',
            short: 'fs_upper',
            h: 2.7,
            foot: rect(0, 0, 12, 10.4),
            rooms: [
                rm('office', 'r_office', rect(0, 0, 3.69, 3.33), 'room', 'home'),
                rm('bedroom', 'r_bedroom', rect(3.69, 0, 6.92, 3.33), 'room', 'home'),
                rm('balcony_w', 'r_balcony', rect(-1.29, 0.46, 0, 2.77), 'outside'),
                rm('child1', 'r_child1', rect(0, 3.33, 3.69, 6.84), 'room', 'home'),
                rm('child2', 'r_child2', rect(0, 6.84, 3.69, 10.4), 'room', 'home'),
                rm('hall_u', 'r_hall', rect(3.69, 3.33, 5.17, 8.32), 'room', 'home'),
                rm('bath', 'r_bath', rect(3.69, 8.32, 6, 10.4), 'room', 'home'),
                rm('stairs_u', 'r_stairs', rect(5.17, 4.81, 6.09, 7.95), 'stairs', 'home'),
                rm('stairs_u2', 'r_stairs', rect(6.28, 4.81, 7.2, 7.95), 'stairs', 'grid'),
                rm('guest', 'r_guest', rect(6.92, 0, 12, 3.33), 'room', 'grid'),
                rm('hall_u2', 'r_hall', rect(7.2, 3.33, 8.77, 8.32), 'room', 'grid'),
                rm('bath_u2', 'r_bath', rect(8.77, 3.33, 12, 5.92), 'room', 'grid'),
                rm('study', 'r_study', rect(8.77, 5.92, 12, 10.4), 'room', 'grid'),
                rm('balcony_ne', 'r_balcony', rect(12, 1.85, 13.29, 5.55), 'outside'),
                rm('balcony_e', 'r_balcony', rect(12, 6.47, 13.29, 9.24), 'outside'),
            ],
        },
        {
            id: 'attic',
            name: 'f_attic',
            short: 'fs_attic',
            h: 2.7,
            attic: true,
            foot: rect(0.28, 2.77, 11.72, 7.67),
            rooms: [rm('attic', 'r_attic', rect(0.37, 2.87, 11.63, 7.58))],
        },
    ],
};

interface RawDevice {
    id?: unknown;
    type?: unknown;
    floor?: unknown;
    room?: unknown;
    uv?: unknown;
    at?: unknown;
    oid?: unknown;
    oidSet?: unknown;
    label?: unknown;
    unit?: unknown;
    dec?: unknown;
    icon?: unknown;
    accent?: unknown;
}

const slot = (s: number, len: number): number => Math.floor(s / len);
const wave = (s: number, base: number, amp: number, per: number): number =>
    Math.round((base + amp * Math.sin(s / per)) * 10) / 10;

/** Demo devices of the example house; labels are i18n keys (house_d_…) */
export const EXAMPLE_DEVICES: (RawDevice & {
    demo: (s: number) => ioBroker.StateValue;
    demoSet?: (s: number) => ioBroker.StateValue;
})[] = [
    { id: 'kitchen_light', type: 'light', room: 'kitchen', uv: [0.55, 0.5], label: 'd_ceiling', demo: () => true },
    {
        id: 'kitchen_window',
        type: 'window',
        room: 'kitchen',
        uv: [0.35, 0.95],
        label: 'd_window',
        demo: s => slot(s, 7) % 4 === 1,
    },
    {
        id: 'kitchen_shutter',
        type: 'shutter',
        room: 'kitchen',
        uv: [0.08, 0.2],
        label: 'd_shutter',
        demo: () => 100,
    },
    { id: 'living_lamp', type: 'light', room: 'living', uv: [0.3, 0.12], label: 'd_floorlamp', demo: () => true },
    {
        id: 'living_dining',
        type: 'light',
        room: 'living',
        uv: [0.2, 0.74],
        label: 'd_dining',
        demo: s => slot(s, 9) % 3 !== 0,
    },
    {
        id: 'living_door',
        type: 'window',
        room: 'living',
        uv: [0.72, 0.05],
        label: 'd_terrace_door',
        demo: () => false,
    },
    {
        id: 'living_temp',
        type: 'temperature',
        room: 'living',
        uv: [0.86, 0.5],
        label: 'd_temp',
        demo: s => wave(s, 21.6, 0.3, 40),
    },
    {
        id: 'hall_motion',
        type: 'motion',
        room: 'hall',
        uv: [0.5, 0.7],
        label: 'd_motion',
        demo: s => slot(s, 4) % 3 === 0,
    },
    { id: 'hall_light', type: 'light', room: 'hall', uv: [0.55, 0.3], label: 'd_light', demo: () => false },
    {
        id: 'living_b_temp',
        type: 'thermostat',
        room: 'living_b',
        uv: [0.5, 0.1],
        label: 'd_radiator',
        demo: s => wave(s, 21.2, 0.2, 55),
        demoSet: () => 21.5,
    },
    { id: 'living_b_light', type: 'light', room: 'living_b', uv: [0.5, 0.55], label: 'd_light', demo: () => false },
    {
        id: 'kitchen_b_window',
        type: 'window',
        room: 'kitchen_b',
        uv: [0.95, 0.5],
        label: 'd_window',
        demo: () => false,
    },
    {
        id: 'terrace_light',
        type: 'light',
        room: 'terrace',
        uv: [0.7, 0.75],
        label: 'd_terrace_light',
        demo: s => slot(s, 11) % 3 === 2,
    },
    {
        id: 'child1_light',
        type: 'light',
        room: 'child1',
        uv: [0.5, 0.5],
        label: 'd_ceiling',
        demo: s => slot(s, 8) % 3 !== 1,
    },
    {
        id: 'child1_radiator',
        type: 'thermostat',
        room: 'child1',
        uv: [0.06, 0.84],
        label: 'd_radiator',
        demo: s => wave(s, 22.5, 0.2, 30),
        demoSet: () => 23,
    },
    {
        id: 'child1_motion',
        type: 'motion',
        room: 'child1',
        uv: [0.9, 0.1],
        label: 'd_motion',
        demo: s => slot(s, 5) % 4 === 2,
    },
    {
        id: 'child1_window',
        type: 'window',
        room: 'child1',
        uv: [0.03, 0.4],
        label: 'd_window',
        demo: () => false,
    },
    { id: 'child2_light', type: 'light', room: 'child2', uv: [0.5, 0.5], label: 'd_ceiling', demo: () => false },
    {
        id: 'child2_radiator',
        type: 'thermostat',
        room: 'child2',
        uv: [0.06, 0.4],
        label: 'd_radiator',
        demo: () => 21,
        demoSet: () => 21,
    },
    {
        id: 'office_radiator',
        type: 'thermostat',
        room: 'office',
        uv: [0.55, 0.06],
        label: 'd_radiator',
        demo: s => wave(s, 20.4, 0.2, 45),
        demoSet: () => 21,
    },
    {
        id: 'office_window',
        type: 'window',
        room: 'office',
        uv: [0.03, 0.5],
        label: 'd_roof_window',
        demo: s => slot(s, 13) % 2 === 1,
    },
    { id: 'office_plug', type: 'plug', room: 'office', uv: [0.82, 0.6], label: 'd_desk', demo: () => true },
    { id: 'laundry_plug', type: 'plug', room: 'laundry', uv: [0.35, 0.35], label: 'd_washer', demo: () => true },
    {
        id: 'garage_motion',
        type: 'motion',
        room: 'garage',
        uv: [0.5, 0.85],
        label: 'd_motion',
        demo: s => slot(s, 6) % 5 === 3,
    },
    {
        id: 'attic_temp',
        type: 'temperature',
        room: 'attic',
        uv: [0.5, 0.5],
        label: 'd_temp',
        demo: s => wave(s, 14.2, 0.4, 70),
    },
];

/* ---------- parsing ---------- */

const str = (v: unknown, def = ''): string =>
    typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : def;
const num = (v: unknown, def: number): number => {
    const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
    return typeof n === 'number' && Number.isFinite(n) ? n : def;
};

function toPts(v: unknown): Pt[] | null {
    if (!Array.isArray(v)) {
        return null;
    }
    const pts: Pt[] = [];
    for (const q of v) {
        if (!Array.isArray(q) || q.length < 2) {
            return null;
        }
        const x = num(q[0], NaN);
        const y = num(q[1], NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }
        pts.push([x, y]);
    }
    return pts.length >= 3 ? pts : null;
}

const isJson = (v: string): boolean => {
    try {
        JSON.parse(v);
        return true;
    } catch {
        return false;
    }
};

/**
 * Text of a JSON attribute from the text stored in the project and the text after vis-2 applied bindings.
 * vis-2 takes every `{…}` in a text attribute for a binding unless it starts with `"` or `{` (e.g. `{ "id": …}` of
 * pretty-printed JSON, or a label "{name}") and replaces it, so the stored text is used when it is valid JSON.
 * Otherwise the attribute is a real binding: a binding to one state (e.g. `{0_userdata.0.plan}`) takes the value
 * of the state directly (`valueOf`), because vis-2 also turns every "}}" of the inserted JSON into "}"; other
 * bindings take the bound text. A binding without value yet counts as empty. For other invalid text the stored
 * text is kept, so that the error message refers to what the user wrote.
 */
export function pickJson(stored: unknown, bound: unknown, valueOf?: (id: string) => unknown): unknown {
    if (typeof stored !== 'string' || isJson(stored)) {
        return typeof stored === 'string' ? stored : bound;
    }
    const b = bound === 'undefined' || bound === 'null' || bound === stored ? '' : bound;
    const single = /^\s*\{([^{}";:]+)\}\s*$/.exec(stored);
    if (single) {
        return valueOf?.(single[1].trim().replace(/\.val$/, '')) ?? b;
    }
    return typeof b !== 'string' || isJson(b) ? b : stored;
}

/** JSON text (or an already parsed value) of an attribute; '' / undefined = not set */
function readJson(raw: unknown): { value: unknown; error: string } {
    if (raw === undefined || raw === null) {
        return { value: undefined, error: '' };
    }
    if (typeof raw !== 'string') {
        return { value: raw, error: '' };
    }
    const t = raw.trim();
    if (!t) {
        return { value: undefined, error: '' };
    }
    try {
        return { value: JSON.parse(t), error: '' };
    } catch (e) {
        return { value: undefined, error: e instanceof Error ? e.message : String(e) };
    }
}

export interface ParsedPlan {
    plan: HousePlan;
    isExample: boolean;
    error: string;
}

/** Plan attribute → normalized plan; falls back to the example house when empty or invalid */
export function parsePlan(raw: unknown, tr: (key: string, ...args: string[]) => string): ParsedPlan {
    const { value, error } = readJson(raw);
    let src: RawPlan | undefined;
    let err = error;
    if (value !== undefined) {
        const v = (Array.isArray(value) ? { floors: value } : value) as RawPlan;
        if (v && typeof v === 'object' && Array.isArray(v.floors) && v.floors.length) {
            src = v;
        } else if (!err) {
            err = tr('house_err_no_floors');
        }
    }
    const isExample = !src;
    const t = (s: string): string => (isExample ? tr(`house_${s}`) : s);
    const floors: HouseFloor[] = [];
    let z = 0;
    let skipped = 0;
    ((src || EXAMPLE_PLAN).floors as RawFloor[]).forEach((rf, fi) => {
        if (!rf || typeof rf !== 'object') {
            skipped++;
            return;
        }
        const index = floors.length;
        const id = str(rf.id, `f${fi}`);
        const name = str(rf.name) ? t(str(rf.name)) : id;
        const h = Math.max(0.5, num(rf.h, 2.7));
        const rooms: HouseRoom[] = [];
        (Array.isArray(rf.rooms) ? (rf.rooms as RawRoom[]) : []).forEach((rr, ri) => {
            const p = rr && typeof rr === 'object' ? toPts(rr.p) : null;
            if (!p) {
                skipped++;
                return;
            }
            const kindRaw = str(rr.kind);
            const kind: RoomKind = kindRaw === 'outside' || kindRaw === 'stairs' ? kindRaw : 'room';
            const box = bbox(p);
            const rid = str(rr.id, `${id}_${ri}`);
            rooms.push({
                id: rid,
                key: `${index}:${ri}`,
                name: str(rr.name) ? t(str(rr.name)) : rid,
                kind,
                accent: str(rr.accent),
                p,
                c: labelPoint(p, box),
                box,
                area: Math.round(polyArea(p) * 100) / 100,
                floor: index,
            });
        });
        let foot = toPts(rf.foot);
        const all = [...(foot || []), ...rooms.flatMap(r => r.p)];
        if (!all.length) {
            skipped++;
            return;
        }
        if (!foot) {
            const b = bbox(rooms.filter(r => r.kind !== 'outside').flatMap(r => r.p));
            foot = Number.isFinite(b[0]) ? rect(b[0], b[1], b[2], b[3]) : rect(...bbox(all));
        }
        floors.push({
            id,
            name,
            // without "short" the button shows the whole name (cut with an ellipsis when it is too long)
            short: str(rf.short) ? t(str(rf.short)) : name,
            h,
            z,
            foot,
            rooms,
            attic: rf.attic === true || rf.attic === 'true',
            index,
            box: bbox([...foot, ...rooms.flatMap(r => r.p)]),
        });
        z += h;
    });
    if (!floors.length) {
        return { ...parsePlan('', tr), error: err || tr('house_err_no_floors') };
    }
    if (!err && skipped) {
        err = tr('house_err_skipped', String(skipped));
    }
    let roof: HouseRoof | null = null;
    const rr = (src || EXAMPLE_PLAN).roof as Record<string, unknown> | undefined;
    if (rr && typeof rr === 'object') {
        const b = str(rr.base);
        let base = floors.findIndex(f => f.id === b);
        if (base < 0) {
            base = floors.length - 1;
            for (let i = floors.length - 1; i > 0 && floors[i].attic; i--) {
                base = i - 1;
            }
        }
        roof = {
            base,
            pitch: (Math.min(70, Math.max(5, num(rr.pitch, 38))) * Math.PI) / 180,
            ridge: rr.ridge === 'y' ? 'y' : 'x',
            knee: Math.max(0, num(rr.knee, 1)),
            overhang: Math.max(0, Math.min(2, num(rr.overhang, 0.5))),
        };
    }
    const box = bbox(floors.flatMap(f => [[f.box[0], f.box[1]] as Pt, [f.box[2], f.box[3]] as Pt]));
    return {
        plan: { floors, roof, box, hAvg: floors.reduce((s, f) => s + f.h, 0) / floors.length },
        isExample,
        error: err,
    };
}

export interface ParsedDevices {
    devices: HouseDevice[];
    /** No devices configured: demo devices of the example house */
    isDemo: boolean;
    error: string;
}

function findRoom(plan: HousePlan, roomId: string, floorId: string): HouseRoom | null {
    const floors = floorId ? plan.floors.filter(f => f.id === floorId) : plan.floors;
    for (const f of floors) {
        const r = f.rooms.find(x => x.id === roomId);
        if (r) {
            return r;
        }
    }
    return null;
}

/** Devices attribute → devices with positions on the plan; demo devices when empty and the plan is the example */
export function parseDevices(
    raw: unknown,
    parsed: ParsedPlan,
    tr: (key: string, ...args: string[]) => string,
): ParsedDevices {
    const { value, error } = readJson(raw);
    let list: RawDevice[] = [];
    let isDemo = false;
    let err = error;
    if (value !== undefined) {
        const v = value as { devices?: unknown };
        const arr = Array.isArray(value) ? value : Array.isArray(v?.devices) ? v.devices : null;
        if (arr) {
            list = arr as RawDevice[];
        } else if (!err) {
            err = tr('house_err_array');
        }
    } else if (!err && parsed.isExample) {
        list = EXAMPLE_DEVICES;
        isDemo = true;
    }
    const plan = parsed.plan;
    const devices: HouseDevice[] = [];
    let skipped = 0;
    list.forEach((d, i) => {
        if (!d || typeof d !== 'object') {
            skipped++;
            return;
        }
        const typeRaw = str(d.type) as DeviceType;
        const type: DeviceType = DEVICE_TYPES.includes(typeRaw) ? typeRaw : 'light';
        const floorId = str(d.floor);
        const room = str(d.room) ? findRoom(plan, str(d.room), floorId) : null;
        let floor = room ? room.floor : plan.floors.findIndex(f => f.id === floorId);
        if (floor < 0 && /^\d+$/.test(floorId)) {
            floor = Math.min(plan.floors.length - 1, parseInt(floorId, 10));
        }
        if (floor < 0) {
            skipped++;
            return;
        }
        let x: number;
        let y: number;
        const at = Array.isArray(d.at) ? d.at : null;
        const uv = Array.isArray(d.uv) ? d.uv : null;
        if (at && Number.isFinite(num(at[0], NaN)) && Number.isFinite(num(at[1], NaN))) {
            x = num(at[0], 0);
            y = num(at[1], 0);
        } else {
            const b = room ? room.box : plan.floors[floor].box;
            const u = Math.max(0, Math.min(1, uv ? num(uv[0], 0.5) : 0.5));
            const w = Math.max(0, Math.min(1, uv ? num(uv[1], 0.5) : 0.5));
            x = b[0] + (b[2] - b[0]) * u;
            y = b[1] + (b[3] - b[1]) * w;
        }
        const look = DEVICE_LOOK[type];
        const label = str(d.label);
        const ex = isDemo ? (d as (typeof EXAMPLE_DEVICES)[number]) : null;
        devices.push({
            id: str(d.id, `d${i}`),
            type,
            floor,
            room,
            x,
            y,
            oid: str(d.oid),
            oidSet: str(d.oidSet),
            label: label ? (isDemo ? tr(`house_${label}`) : label) : room?.name || type,
            unit: str(d.unit, type === 'shutter' ? '%' : type === 'thermostat' || type === 'temperature' ? '°C' : ''),
            dec: Math.max(0, Math.min(3, Math.round(num(d.dec, type === 'shutter' ? 0 : 1)))),
            icon: str(d.icon) || look.icon,
            accent: str(d.accent) || look.accent,
            demo: ex?.demo,
            demoSet: ex?.demoSet,
        });
    });
    // unique ids (used as React keys)
    const seen = new Set<string>();
    devices.forEach((d, i) => {
        if (seen.has(d.id)) {
            d.id = `${d.id}_${i}`;
        }
        seen.add(d.id);
    });
    if (!err && skipped) {
        err = tr('house_err_dev_skipped', String(skipped));
    }
    return { devices, isDemo, error: err };
}
