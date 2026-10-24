/* Geometry of the energy flow widget: node positions and line paths for the available space.
 * "cross": PV on top, grid left, battery below, consumers right, a hub in the middle (like a star).
 * "row": all nodes in one line, the lines between them form a bus (for wide, low widgets).
 * "column": the same bus from top to bottom with the texts right of the discs (for narrow, tall widgets). */
import { clamp } from '../core/format';
import type { NodeKey } from './model';

export type Pt = [number, number];

export type LayoutMode = 'cross' | 'row' | 'column';

export interface LNode {
    key: NodeKey;
    /** Center of the disc */
    x: number;
    y: number;
    /** Width of the text below the disc (column: right of the disc) */
    w: number;
    /** row: text above the disc (every second node when the texts are wider than a slot) */
    up?: boolean;
}

export interface LPath {
    id: string;
    pts: Pt[];
}

export interface FlowLayout {
    mode: LayoutMode;
    /** Disc diameter */
    d: number;
    /** Hub diameter (cross only) */
    hubD: number;
    hub: { x: number; y: number } | null;
    /** Font size of the values */
    fs: number;
    /** Show the values (false only when nothing fits: the discs alone) */
    values: boolean;
    /** Show the small labels below the values */
    labels: boolean;
    /** Line widths and dot radius for the canvas */
    track: number;
    line: number;
    dot: number;
    nodes: LNode[];
    /**
     * cross: one path per node (id = node key, direction node→hub for sources, hub→node for consumers);
     * row/column: one path per bus segment (id = `s<i>`, from order[i] to order[i+1])
     */
    paths: LPath[];
    order: NodeKey[];
}

/** Order of the nodes in the row layout (left → right) */
export const ROW_ORDER: NodeKey[] = ['batt', 'pv', 'house', 'wb', 'extra', 'grid'];
/** Order of the nodes in the column layout (top → bottom) */
const COLUMN_ORDER: NodeKey[] = ['pv', 'batt', 'house', 'wb', 'extra', 'grid'];
/** Order of the consumers in the right column of the cross layout (top → bottom) */
const RIGHT: NodeKey[] = ['extra', 'house', 'wb'];

const LABEL_LH = 15;
/** Distance between line end and disc edge (room for the rings) */
const PAD = 9;
/** Shortest bus line between two discs */
const MIN_LINE = 12;
/** column: space between disc and text (room for the pulse around the disc) */
export const COLUMN_GAP = 14;

/** Height of value + label below a disc */
export function textBlock(fs: number, labels: boolean): number {
    return 6 + Math.ceil(fs * 1.15) + (labels ? LABEL_LH : 0);
}

/** Width a value like "1,25 kW" needs at font size fs */
function valueWidth(fs: number): number {
    return Math.ceil(fs * 3.3 + 6);
}

function bezier(p0: Pt, c1: Pt, c2: Pt, p1: Pt, n = 24): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        const a = u * u * u;
        const b = 3 * u * u * t;
        const c = 3 * u * t * t;
        const e = t * t * t;
        out.push([a * p0[0] + b * c1[0] + c * c2[0] + e * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + e * p1[1]]);
    }
    return out;
}

/** Bus lines between neighboring discs (row and column) */
function busPaths(nodes: LNode[], d: number, vertical: boolean): LPath[] {
    const paths: LPath[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        const r = d / 2 + PAD;
        paths.push({
            id: `s${i}`,
            pts: vertical
                ? [
                      [a.x, a.y + r],
                      [b.x, b.y - r],
                  ]
                : [
                      [a.x + r, a.y],
                      [b.x - r, b.y],
                  ],
        });
    }
    return paths;
}

function cross(fullW: number, H: number, keys: Set<NodeKey>, d: number): FlowLayout | null {
    // very wide areas: keep the star compact in the middle instead of stretching the lines
    const W = Math.min(fullW, Math.round(H * 1.8));
    const ox = (fullW - W) / 2;
    const fs = clamp(Math.round(d * 0.29), 13, 21);
    const tb = textBlock(fs, true);
    const blk = d + tb;
    const hubD = Math.round(d * 1.08);
    const gap = Math.max(24, d * 0.6);
    const nodeW = clamp(Math.round(d * 1.75), 72, 124);
    if (W < 3 * nodeW + 8) {
        return null;
    }
    const hx = ox + W / 2;
    const gx = ox + nodeW / 2;
    const rx = ox + W - nodeW / 2;
    if (hx - hubD / 2 - PAD - (gx + d / 2 + PAD) < gap) {
        return null;
    }
    const hasPv = keys.has('pv');
    const hasBatt = keys.has('batt');
    const pvY = d / 2;
    const pvBottom = hasPv ? blk : 0;
    const battY = H - tb - d / 2;
    const battTop = hasBatt ? battY - d / 2 : H - tb;
    if (d / 2 > H - d / 2 - tb) {
        return null;
    }
    const midY = clamp((pvBottom + battTop) / 2, Math.max(d, hubD) / 2, H - d / 2 - tb);
    if (hasPv && midY - hubD / 2 - PAD - (pvBottom + 4) < gap) {
        return null;
    }
    if (hasBatt && battY - d / 2 - PAD - (midY + hubD / 2 + PAD) < gap) {
        return null;
    }

    const right = RIGHT.filter(k => keys.has(k));
    const n = right.length;
    const rowGap = 10;
    if (n * blk + (n - 1) * rowGap > H) {
        return null;
    }
    const sp = blk + rowGap;
    let y0 = Math.max(d / 2, midY - ((n - 1) / 2) * sp);
    const over = y0 + (n - 1) * sp + d / 2 + tb - H;
    if (over > 0) {
        y0 -= over;
    }
    if (y0 < d / 2 - 0.5) {
        return null;
    }

    const nodes: LNode[] = [];
    const paths: LPath[] = [];
    const hr = hubD / 2 + PAD;
    if (hasPv) {
        nodes.push({ key: 'pv', x: hx, y: pvY, w: nodeW });
        paths.push({
            id: 'pv',
            pts: [
                [hx, pvBottom + 4],
                [hx, midY - hr],
            ],
        });
    }
    if (keys.has('grid')) {
        nodes.push({ key: 'grid', x: gx, y: midY, w: nodeW });
        paths.push({
            id: 'grid',
            pts: [
                [gx + d / 2 + PAD, midY],
                [hx - hr, midY],
            ],
        });
    }
    if (hasBatt) {
        nodes.push({ key: 'batt', x: hx, y: battY, w: nodeW });
        paths.push({
            id: 'batt',
            pts: [
                [hx, midY + hr],
                [hx, battY - d / 2 - PAD],
            ],
        });
    }
    right.forEach((k, i) => {
        const y = n === 1 ? midY : y0 + i * sp;
        nodes.push({ key: k, x: rx, y, w: nodeW });
        const p1: Pt = [rx - d / 2 - PAD, y];
        if (Math.abs(y - midY) < 1) {
            paths.push({ id: k, pts: [[hx + hr, midY], p1] });
            return;
        }
        const a = clamp(Math.atan2(y - midY, rx - hx), -0.62, 0.62);
        const p0: Pt = [hx + Math.cos(a) * hr, midY + Math.sin(a) * hr];
        const k2 = Math.max(10, (p1[0] - p0[0]) * 0.5);
        paths.push({
            id: k,
            pts: bezier(p0, [p0[0] + Math.cos(a) * k2, p0[1] + Math.sin(a) * k2], [p1[0] - k2, p1[1]], p1),
        });
    });

    return {
        mode: 'cross',
        d,
        hubD,
        hub: { x: hx, y: midY },
        fs,
        values: true,
        labels: true,
        track: clamp(Math.round(d * 0.11), 4, 8),
        line: 2,
        dot: clamp(d * 0.05, 2.4, 3.4),
        nodes,
        paths,
        order: [],
    };
}

function row(W: number, H: number, keys: Set<NodeKey>, d: number, force = false): FlowLayout | null {
    const order = ROW_ORDER.filter(k => keys.has(k));
    const n = order.length;
    const slot = W / n;
    let fs = clamp(Math.round(d * 0.36), 12, 18);
    // texts wider than a slot: every second node shows its text above the disc
    const stagger = n > 2 && slot - 6 < valueWidth(fs);
    const spacing = stagger ? 2 * slot : slot;
    if (force) {
        // forced into a small area: smaller values (down to 9 px) before they are left out
        fs = Math.min(fs, Math.max(9, Math.floor((spacing - 6) / 3.3)));
    }
    const nodeW = Math.max(30, Math.min(spacing - 6, 112));
    const rows = stagger ? 2 : 1;
    let labels = true;
    let tb = textBlock(fs, true);
    if (d + rows * tb > H) {
        labels = false;
        tb = textBlock(fs, false);
    }
    const values = d + rows * tb <= H && (force ? spacing : nodeW) >= valueWidth(fs);
    if (!force && (!values || slot - d - 2 * PAD < MIN_LINE)) {
        return null;
    }
    if (!values) {
        // even smaller: discs only, instead of texts on top of each other
        labels = false;
        tb = 0;
    }
    const top = Math.max(0, (H - d - rows * tb) / 2);
    const y = top + (stagger ? tb : 0) + d / 2;
    const nodes: LNode[] = order.map((key, i) => ({
        key,
        x: slot * (i + 0.5),
        y,
        w: nodeW,
        up: values && stagger && i % 2 === 1,
    }));
    return {
        mode: 'row',
        d,
        hubD: 0,
        hub: null,
        fs,
        values,
        labels,
        track: 3,
        line: 1.5,
        dot: clamp(d * 0.055, 2.2, 3),
        nodes,
        paths: busPaths(nodes, d, false),
        order,
    };
}

function column(W: number, H: number, keys: Set<NodeKey>, d: number, force = false): FlowLayout | null {
    const order = COLUMN_ORDER.filter(k => keys.has(k));
    const n = order.length;
    const slot = H / n;
    let fs = clamp(Math.round(d * 0.36), 12, 18);
    // 8 px left of the disc: ring around the battery disc
    const textW = Math.min(170, W - d - COLUMN_GAP - 8);
    if (force) {
        fs = Math.min(fs, Math.max(9, Math.floor((textW - 6) / 3.3)));
    }
    const values = textW >= valueWidth(fs) && fs * 1.15 <= slot;
    const labels = values && Math.ceil(fs * 1.15) + LABEL_LH <= slot - 4;
    if (!force && (slot - d - 2 * PAD < MIN_LINE || !values)) {
        return null;
    }
    const x0 = Math.max(0, (W - (8 + d + (values ? COLUMN_GAP + textW : 0))) / 2);
    const x = x0 + 8 + d / 2;
    const nodes: LNode[] = order.map((key, i) => ({ key, x, y: slot * (i + 0.5), w: Math.max(0, textW) }));
    return {
        mode: 'column',
        d,
        hubD: 0,
        hub: null,
        fs,
        values,
        labels,
        track: 3,
        line: 1.5,
        dot: clamp(d * 0.055, 2.2, 3),
        nodes,
        paths: busPaths(nodes, d, true),
        order,
    };
}

/**
 * Layout for a flow area of W × H px.
 *
 * @param W width of the flow area (px)
 * @param H height of the flow area (px)
 * @param keys nodes to show
 * @param mode attribute "layout"
 * @param prefer in mode "auto": the layout that suits the shape of the widget
 */
export function computeLayout(
    W: number,
    H: number,
    keys: Set<NodeKey>,
    mode: 'auto' | LayoutMode,
    prefer: LayoutMode,
): FlowLayout {
    const n = ROW_ORDER.filter(k => keys.has(k)).length;
    const tries: Record<LayoutMode, () => FlowLayout | null> = {
        cross: () => {
            for (let d = Math.min(76, Math.floor(Math.min(W, H) * 0.2)); d >= 34; d -= 2) {
                const l = cross(W, H, keys, d);
                if (l) {
                    return l;
                }
            }
            return null;
        },
        row: () => {
            for (let d = Math.floor(Math.min(64, (W / n) * 0.55, H * 0.55)); d >= 22; d -= 2) {
                const l = row(W, H, keys, d);
                if (l) {
                    return l;
                }
            }
            return null;
        },
        column: () => {
            for (let d = Math.floor(Math.min(64, (H / n) * 0.55, W * 0.3)); d >= 22; d -= 2) {
                const l = column(W, H, keys, d);
                if (l) {
                    return l;
                }
            }
            return null;
        },
    };
    // the chosen layout first, then the one that suits the shape (a forced cross in a tall widget becomes a column)
    const first = mode === 'auto' ? prefer : mode;
    const seq = new Set<LayoutMode>([first, prefer, 'cross', 'row', 'column']);
    for (const m of seq) {
        const l = tries[m]();
        if (l) {
            return l;
        }
    }
    // nothing fits: smallest discs in the direction with more room
    return W >= H
        ? row(W, H, keys, clamp(Math.floor(Math.min(W / n - 2 * PAD - 4, H * 0.5)), 14, 22), true)!
        : column(W, H, keys, clamp(Math.floor(Math.min(H / n - 2 * PAD - 4, W * 0.3)), 14, 22), true)!;
}
