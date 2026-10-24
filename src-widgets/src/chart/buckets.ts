/* Time buckets of the bar mode of GlashausChart (calendar aligned: hour, day, week from Monday, month),
 * grouping of history points into buckets and deterministic demo data. */
import type { HistoryPoint } from '../core/GlashausWidget';
import { fmtDate } from '../core/format';

export type BarStep = 'hour' | 'day' | 'week' | 'month';
export type BarValue = 'total' | 'max' | 'average' | 'diff';

export interface Bucket {
    start: number;
    end: number;
}

export const H = 3600000;
const D = 86400000;

/** Nominal length of a step in ms (only used to count buckets) */
export const NOMINAL: Record<BarStep, number> = { hour: H, day: D, week: 7 * D, month: 30.44 * D };

/** More bars than this are not drawn (the oldest are dropped) */
export const MAX_BARS = 400;

/** Picks a sensible bar step for a time range */
export function autoStep(rangeMs: number): BarStep {
    if (rangeMs <= 2 * D) {
        return 'hour';
    }
    if (rangeMs <= 45 * D) {
        return 'day';
    }
    if (rangeMs <= 120 * D) {
        return 'week';
    }
    return 'month';
}

/** Start of the bucket that contains `t` (local time) */
export function bucketStart(t: number, step: BarStep): number {
    const d = new Date(t);
    if (step === 'hour') {
        d.setMinutes(0, 0, 0);
    } else {
        d.setHours(0, 0, 0, 0);
        if (step === 'week') {
            d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        } else if (step === 'month') {
            d.setDate(1);
        }
    }
    return d.getTime();
}

/** Moves a bucket start by n steps (calendar aware for day, week and month) */
export function addStep(t: number, step: BarStep, n: number): number {
    if (step === 'hour') {
        return t + n * H;
    }
    const d = new Date(t);
    if (step === 'day') {
        d.setDate(d.getDate() + n);
    } else if (step === 'week') {
        d.setDate(d.getDate() + 7 * n);
    } else {
        d.setMonth(d.getMonth() + n);
    }
    return d.getTime();
}

/** The buckets that cover the last `rangeMs`, the newest one contains `now` */
export function makeBuckets(rangeMs: number, step: BarStep, now = Date.now()): Bucket[] {
    const n = Math.max(1, Math.min(MAX_BARS, Math.round(rangeMs / NOMINAL[step])));
    const last = bucketStart(now, step);
    const out: Bucket[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const start = addStep(last, step, -i);
        out.push({ start, end: addStep(start, step, 1) });
    }
    return out;
}

/** Step of the history request: buckets are filled from these smaller, aligned slices */
export function subStep(step: BarStep, rangeMs: number): number {
    if (step === 'hour') {
        return H;
    }
    if (step === 'day') {
        return rangeMs <= 40 * D ? H : 3 * H;
    }
    return D;
}

/** Aggregate of the history adapter that is requested for a bar value */
export function requestAggregate(v: BarValue): string {
    return v === 'diff' ? 'minmax' : v;
}

/** Start of the history request: "diff" also reads the bucket before, as the start reading of the first bar */
export function requestStart(buckets: Bucket[], step: BarStep, how: BarValue): number {
    return how === 'diff' ? addStep(buckets[0].start, step, -1) : buckets[0].start;
}

/**
 * Sorts history points into buckets and combines them: sum, max, mean or the increase of a counter.
 * The increase is measured from the reading at the end of the bucket before (max − previous max), so that the
 * consumption between two readings is not lost; the first bar or a counter reset falls back to max − min.
 */
export function fillBuckets(buckets: Bucket[], pts: HistoryPoint[], how: BarValue): (number | null)[] {
    const groups: number[][] = buckets.map(() => []);
    /** Counter reading before the first bucket */
    let before: number | null = null;
    let b = 0;
    for (const p of pts) {
        if (buckets.length && p.ts < buckets[0].start) {
            before = before === null ? p.val : Math.max(before, p.val);
            continue;
        }
        while (b < buckets.length && p.ts >= buckets[b].end) {
            b++;
        }
        if (b >= buckets.length) {
            break;
        }
        if (p.ts >= buckets[b].start) {
            groups[b].push(p.val);
        }
    }
    let prev = before;
    return groups.map(g => {
        if (!g.length) {
            return null;
        }
        switch (how) {
            case 'max':
                return Math.max(...g);
            case 'average':
                return g.reduce((a, v) => a + v, 0) / g.length;
            case 'diff': {
                const max = Math.max(...g);
                const inc = prev !== null && max >= prev ? max - prev : max - Math.min(...g);
                prev = max;
                return inc;
            }
            default:
                return g.reduce((a, v) => a + v, 0);
        }
    });
}

/** ISO 8601 week number */
function isoWeek(t: number): number {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d.getTime() - w1.getTime()) / D - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

/** Short label below a bar and the longer one for the hover read-out */
export function bucketLabels(
    buckets: Bucket[],
    step: BarStep,
    lang: string,
    weekPrefix: string,
): { short: string[]; long: string[] } {
    const strip = (s: string): string => s.replace(/\.$/, '');
    const short: string[] = [];
    const long: string[] = [];
    for (const b of buckets) {
        const t = b.start;
        switch (step) {
            case 'hour': {
                const h = String(new Date(t).getHours()).padStart(2, '0');
                short.push(h);
                long.push(`${fmtDate(t, lang, { weekday: 'short', day: 'numeric', month: 'short' })} ${h}:00`);
                break;
            }
            case 'day':
                short.push(
                    buckets.length <= 8
                        ? strip(fmtDate(t, lang, { weekday: 'short' }))
                        : fmtDate(t, lang, { day: 'numeric', month: 'numeric' }),
                );
                long.push(fmtDate(t, lang, { weekday: 'short', day: 'numeric', month: 'short' }));
                break;
            case 'week':
                short.push(`${weekPrefix}${isoWeek(t)}`);
                long.push(`${weekPrefix}${isoWeek(t)} · ${fmtDate(t, lang, { day: 'numeric', month: 'short' })}`);
                break;
            default:
                short.push(strip(fmtDate(t, lang, { month: 'short' })));
                long.push(fmtDate(t, lang, { month: 'long', year: 'numeric' }));
        }
    }
    return { short, long };
}

/* ---------- Demo data ---------- */

function hash(n: number): number {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

const bump = (h: number, at: number, w: number): number => Math.exp(-(((h - at) / w) ** 2));

/** Demo curve of series `i` (0..3): PV, house load, battery, heat pump in kW (repeats every day) */
function demoValue(i: number, t: number): number {
    const d = new Date(t);
    const h = d.getHours() + d.getMinutes() / 60;
    const pv = Math.max(0, Math.sin((Math.PI * (h - 6.8)) / 12.4)) * 3.7 * (0.84 + 0.16 * Math.sin(t / 3.1e6));
    const home = 0.34 + 0.75 * bump(h, 7.2, 0.9) + 1.0 * bump(h, 12.6, 1.1) + 0.95 * bump(h, 19.2, 1.6);
    switch (i) {
        case 0:
            return pv;
        case 1:
            return home;
        case 2:
            return Math.max(-2.2, Math.min(2.2, pv - home));
        default:
            return 0.45 + 0.35 * Math.cos((Math.PI * (h - 5)) / 12);
    }
}

/** Demo line of series `i` over [from, to] */
export function demoLine(i: number, from: number, to: number): [number, number][] {
    const n = 144;
    const pts: [number, number][] = [];
    for (let k = 0; k <= n; k++) {
        const t = from + ((to - from) * k) / n;
        pts.push([t, Math.round(demoValue(i, t) * 100) / 100]);
    }
    return pts;
}

/** Demo bar values of series `i`: energy per bucket in kWh */
export function demoBars(i: number, buckets: Bucket[], step: BarStep): (number | null)[] {
    const base: Record<BarStep, number> = { hour: 0.9, day: 11, week: 74, month: 310 };
    const scale = [1, 0.72, 0.45, 0.6][i] ?? 0.5;
    return buckets.map(b => {
        if (step === 'hour') {
            const v = demoValue(i, b.start + 1800000);
            return Math.round(Math.abs(v) * 100) / 100;
        }
        const r = hash(Math.floor(b.start / NOMINAL[step]) + i * 17.3);
        return Math.round(base[step] * scale * (0.62 + 0.76 * r) * 10) / 10;
    });
}
