/* Energy balance of the energy flow widget.
 * Sign convention inside the widget: power that flows INTO the house bus is positive
 * (PV, battery discharging, grid import), power that leaves it is negative (consumers, charging, export). */
import { clamp } from '../core/format';

export type NodeKey = 'pv' | 'batt' | 'house' | 'wb' | 'extra' | 'grid';

/** Below this power (W) a line is idle: no dots, node dimmed */
export const IDLE_W = 10;

/** Raw readings in W (null = not configured or no value) */
export interface Readings {
    pv: number | null;
    /** + = discharging, - = charging */
    batt: number | null;
    /** + = import, - = export */
    grid: number | null;
    /** Measured house consumption (null = calculate from the balance) */
    house: number | null;
    /** true: the measured house value already contains wallbox and extra consumer */
    houseIncl: boolean;
    wb: number | null;
    extra: number | null;
}

export interface Flows {
    pv: number;
    batt: number;
    grid: number;
    /** Own consumption of the house (without wallbox and extra consumer) */
    house: number;
    wb: number;
    extra: number;
    /** Total consumption (house + wallbox + extra) */
    total: number;
    /** Share of the consumption covered without the grid, 0..1 */
    autarky: number | null;
    /** Share of the PV power used locally, 0..1 */
    selfUse: number | null;
    /** At least one value is available */
    hasData: boolean;
}

export function computeFlows(r: Readings): Flows {
    const pv = Math.max(0, r.pv ?? 0);
    const batt = r.batt ?? 0;
    const grid = r.grid ?? 0;
    const wb = Math.max(0, r.wb ?? 0);
    const extra = Math.max(0, r.extra ?? 0);
    let total: number;
    if (r.house !== null) {
        total = r.house + (r.houseIncl ? 0 : wb + extra);
    } else {
        total = pv + grid + batt;
    }
    total = Math.max(0, total);
    const house = Math.max(0, total - wb - extra);
    const hasData = [r.pv, r.batt, r.grid, r.house, r.wb, r.extra].some(v => v !== null);
    // grid noise below IDLE_W counts as nothing, like everywhere else in the widget
    const imp = grid >= IDLE_W ? grid : 0;
    const exp = grid <= -IDLE_W ? -grid : 0;
    let autarky: number | null = null;
    if (hasData) {
        autarky = total >= IDLE_W ? clamp(1 - imp / total, 0, 1) : imp >= IDLE_W ? 0 : 1;
    }
    const selfUse = pv >= IDLE_W ? clamp((pv - exp) / pv, 0, 1) : null;
    return { pv, batt, grid, house, wb, extra, total, autarky, selfUse, hasData };
}

/** Power a node feeds into the bus (positive) or takes from it (negative) */
export function injection(f: Flows, k: NodeKey): number {
    switch (k) {
        case 'pv':
            return f.pv;
        case 'batt':
            return f.batt;
        case 'grid':
            return f.grid;
        case 'house':
            return -f.house;
        case 'wb':
            return -f.wb;
        default:
            return -f.extra;
    }
}

export interface BusSegment {
    /** Power on the segment between order[i] and order[i+1]; positive = to the right */
    power: number;
    /** Node the energy on this segment comes from (for the color) */
    src: NodeKey;
}

/** Flows on a bus line with the nodes in `order` (row layout). Measurement errors are spread over both ends. */
export function busSegments(f: Flows, order: NodeKey[]): BusSegment[] {
    const inj = order.map(k => injection(f, k));
    const sum = inj.reduce((a, b) => a + b, 0);
    const out: BusSegment[] = [];
    let left = 0;
    for (let i = 0; i < order.length - 1; i++) {
        left += inj[i];
        const right = sum - left;
        const power = (left - right) / 2;
        let src: NodeKey | undefined;
        if (power > 0) {
            for (let j = i; j >= 0 && !src; j--) {
                if (inj[j] >= IDLE_W) {
                    src = order[j];
                }
            }
        } else {
            for (let j = i + 1; j < order.length && !src; j++) {
                if (inj[j] >= IDLE_W) {
                    src = order[j];
                }
            }
        }
        out.push({ power, src: src || (power > 0 ? order[i] : order[i + 1]) });
    }
    return out;
}
