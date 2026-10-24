/* Year skyline data: day grid (53 weeks × 7 days per year, several years as stripes), statistics, month labels,
 * demo values, daily aggregation of history values and parsing of JSON day lists.
 * Days are stored as "UTC midnight of the local calendar date" (ms), so that day arithmetic ignores daylight saving. */
import { toNum } from '../core/format';

export const DAY = 86400000;
export const MAX_YEARS = 4;

/** How a daily value is made out of the history of one object */
export type SkyMode = 'counter' | 'meter' | 'power' | 'average' | 'max' | 'min' | 'sum';

/** Day (UTC midnight of the local date) of a timestamp */
export function dayOfTs(ts: number): number {
    const d = new Date(ts);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Today as day */
export function today(): number {
    return dayOfTs(Date.now());
}

/** Local midnight (ms) of a day */
export function localMidnight(day: number): number {
    const d = new Date(day);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
}

/** First day of the grid that ends with `endDay`: 364 days back, then back to the start of the week */
export function gridStart(endDay: number, weekStart: number): number {
    const start = endDay - 364 * DAY;
    return start - ((new Date(start).getUTCDay() - weekStart + 7) % 7) * DAY;
}

/** Last day of stripe k (k = 0: the most recent 12 months). 364 days = 52 weeks keep the weekdays aligned. */
export function stripEnd(endDay: number, k: number): number {
    return endDay - k * 364 * DAY;
}

/* ---------- Model ---------- */

export interface SkyCell {
    /** Day (UTC midnight of the local date) */
    date: number;
    /** Value of the day, null when there is none */
    v: number | null;
    /** Color level 0..4 */
    level: number;
    week: number;
    /** Row: weekday, plus 8 per older stripe */
    day: number;
    /** Stripe: 0 = most recent 12 months */
    strip: number;
}

export interface SkyRun {
    days: number;
    start: number | null;
    end: number | null;
}

export interface SkyStats {
    total: number;
    /** Days with a value */
    count: number;
    mean: number | null;
    best: number | null;
    bestDate: number | null;
    low: number | null;
    lowDate: number | null;
    first: number;
    last: number;
    longest: SkyRun;
    current: SkyRun;
}

export interface SkyStrip {
    /** First row of the stripe */
    y: number;
    /** e.g. "25/26" */
    label: string;
    stats: SkyStats;
}

export interface SkyModel {
    cells: SkyCell[];
    weeks: number;
    rows: number;
    /** Number of stripes (years) */
    N: number;
    /** Largest value above `lo` */
    max: number;
    /** Base of the bars: 0, or the lowest value when there are negative values */
    lo: number;
    months: { week: number; label: string }[];
    weekdayRows: { day: number; label: string }[];
    strips: SkyStrip[];
    /** Statistics of the most recent 12 months */
    stats: SkyStats;
    /** No value at all */
    empty: boolean;
}

export interface ModelOptions {
    endDay: number;
    years: number;
    /** 0 = Sunday, 1 = Monday */
    weekStart: number;
    locale: string;
    /** Condition of a "streak" day, or null */
    streak: ((v: number) => boolean) | null;
}

const levelOf = (v: number, busy: number): number =>
    v <= 0 ? 0 : busy <= 0 ? 4 : 1 + Math.min(3, Math.floor((v / busy) * 4));

function statsOf(cells: SkyCell[], streak: ((v: number) => boolean) | null): SkyStats {
    let total = 0;
    let count = 0;
    let best: number | null = null;
    let bestDate: number | null = null;
    let low: number | null = null;
    let lowDate: number | null = null;
    let run = 0;
    let runStart: number | null = null;
    let longest: SkyRun = { days: 0, start: null, end: null };
    const ok = (c: SkyCell): boolean => !!streak && c.v !== null && streak(c.v);
    for (const c of cells) {
        if (c.v !== null) {
            total += c.v;
            count++;
            if (best === null || c.v > best) {
                best = c.v;
                bestDate = c.date;
            }
            if (low === null || c.v < low) {
                low = c.v;
                lowDate = c.date;
            }
        }
        if (ok(c)) {
            if (run === 0) {
                runStart = c.date;
            }
            run++;
            if (run > longest.days) {
                longest = { days: run, start: runStart, end: c.date };
            }
        } else {
            run = 0;
        }
    }
    // current streak: today may not be complete yet, so it may end yesterday
    let j = cells.length - 1;
    if (j >= 0 && !ok(cells[j])) {
        j--;
    }
    const endAt = j;
    while (j >= 0 && ok(cells[j])) {
        j--;
    }
    const cd = endAt - j;
    const current: SkyRun =
        cd > 0 ? { days: cd, start: cells[j + 1].date, end: cells[endAt].date } : { days: 0, start: null, end: null };
    return {
        total,
        count,
        mean: count ? total / count : null,
        best,
        bestDate,
        low,
        lowDate,
        first: cells.length ? cells[0].date : 0,
        last: cells.length ? cells[cells.length - 1].date : 0,
        longest,
        current,
    };
}

function buildGrid(
    values: Map<number, number>,
    endDay: number,
    weekStart: number,
    strip: number,
    streak: ((v: number) => boolean) | null,
): { cells: SkyCell[]; weeks: number; stats: SkyStats } {
    const start = gridStart(endDay, weekStart);
    const cells: SkyCell[] = [];
    for (let ms = start, i = 0; ms <= endDay; ms += DAY, i++) {
        const v = values.get(ms);
        cells.push({
            date: ms,
            v: v === undefined || !Number.isFinite(v) ? null : v,
            level: 0,
            week: Math.floor(i / 7),
            day: i % 7,
            strip,
        });
    }
    return { cells, weeks: cells.length ? cells[cells.length - 1].week + 1 : 0, stats: statsOf(cells, streak) };
}

function monthLabels(cells: SkyCell[], weeks: number, locale: string): { week: number; label: string }[] {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    const out: { week: number; label: string }[] = [];
    let prev = -1;
    for (let w = 0; w < weeks; w++) {
        const c = cells[w * 7];
        if (!c) {
            break;
        }
        const m = new Date(c.date).getUTCMonth();
        if (m !== prev) {
            out.push({ week: w, label: fmt.format(c.date).replace('.', '') });
        }
        prev = m;
    }
    if (out.length > 1 && out[1].week - out[0].week < 3) {
        out.shift();
    }
    return out;
}

/** The whole grid: `years` stripes of 12 months each, the most recent one in front */
export function buildModel(values: Map<number, number>, o: ModelOptions): SkyModel {
    const N = Math.max(1, Math.min(MAX_YEARS, Math.round(o.years) || 1));
    const gs = [];
    for (let k = 0; k < N; k++) {
        gs.push(buildGrid(values, stripEnd(o.endDay, k), o.weekStart, k, o.streak));
    }
    const cells: SkyCell[] = [];
    gs.forEach((g, k) => g.cells.forEach(c => cells.push({ ...c, day: c.day + (N - 1 - k) * 8 })));

    // common levels and heights for all stripes; negative values (e.g. temperatures) lift the base
    let lo = 0;
    const vals: number[] = [];
    for (const c of cells) {
        if (c.v !== null) {
            vals.push(c.v);
            if (c.v < lo) {
                lo = c.v;
            }
        }
    }
    const nz = vals
        .map(v => v - lo)
        .filter(v => v > 0)
        .sort((a, b) => a - b);
    const busy = nz.length ? nz[Math.floor(0.95 * (nz.length - 1))] : 0;
    for (const c of cells) {
        // with a lifted base (negative values) the lowest value is still a value: at least level 1
        c.level = c.v === null ? 0 : Math.max(lo < 0 ? 1 : 0, levelOf(c.v - lo, busy));
    }

    const g0 = gs[0];
    const weekdayRows: { day: number; label: string }[] = [];
    if (N === 1) {
        const wf = new Intl.DateTimeFormat(o.locale, { weekday: 'short', timeZone: 'UTC' });
        for (let d = 0; d < 7 && d < g0.cells.length; d++) {
            const dow = new Date(g0.cells[d].date).getUTCDay();
            if (dow === 1 || dow === 3 || dow === 5) {
                weekdayRows.push({ day: d, label: wf.format(g0.cells[d].date).replace('.', '') });
            }
        }
    }
    const yy = (ms: number): string => String(new Date(ms).getUTCFullYear()).slice(2);
    return {
        cells,
        weeks: Math.max(...gs.map(g => g.weeks)),
        rows: N * 8 - 1,
        N,
        max: nz.length ? nz[nz.length - 1] : 0,
        lo,
        months: monthLabels(g0.cells, g0.weeks, o.locale),
        weekdayRows,
        strips: gs.map((g, k) => ({
            y: (N - 1 - k) * 8,
            label: g.cells.length ? `${yy(g.stats.first)}/${yy(g.stats.last)}` : '',
            stats: g.stats,
        })),
        stats: g0.stats,
        empty: vals.length === 0,
    };
}

/* ---------- Demo values ---------- */

/** Small deterministic random generator */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let demoCache: { end: number; map: Map<number, number> } | null = null;

/** Invented daily PV yield (kWh) of a ~10 kWp roof: seasonal curve with weather, from 1 January three years ago */
export function demoValues(endDay: number): Map<number, number> {
    if (demoCache && demoCache.end === endDay) {
        return demoCache.map;
    }
    const first = Date.UTC(new Date(endDay).getUTCFullYear() - 3, 0, 1);
    const r = rng(21);
    const map = new Map<number, number>();
    let cloud = 0.5;
    for (let ms = first; ms <= endDay; ms += DAY) {
        const d = new Date(ms);
        const doy = (ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY;
        const s = (1 - Math.cos((2 * Math.PI * (doy - 172)) / 365)) / 2;
        cloud = cloud * 0.55 + r() * 0.45;
        const w = Math.min(1, Math.max(0.05, 1.12 - cloud * 1.15));
        const pv = Math.max(0, (64 - 54 * s) * w * (0.94 + 0.12 * r()));
        map.set(ms, Math.round(pv * 10) / 10);
    }
    demoCache = { end: endDay, map };
    return map;
}

/* ---------- History ---------- */

/** History aggregate to request for a mode */
export function aggregateOf(mode: SkyMode): string {
    switch (mode) {
        case 'counter':
        case 'meter':
        case 'max':
            return 'max';
        case 'min':
            return 'min';
        case 'sum':
            return 'total';
        default:
            return 'average';
    }
}

export interface DayAggregate {
    /** Daily values (factor applied) */
    map: Map<number, number>;
    /** Meter mode: raw reading at the end of the last day before `endDay` (base for today's live value) */
    meterBase: number | null;
}

/**
 * Day of each point of a daily aggregation that was requested from local midnight `reqStart`.
 * history and sql aggregate in 24 h buckets from the requested start and stamp the middle of the bucket.
 * InfluxDB aggregates in UTC days and stamps their start (InfluxQL), their middle (Flux mean/sum) or the time
 * of the selected value (Flux max/min, e.g. a meter reading at 00:59 local time that closes the UTC day before).
 * Points on the local half-day grid belong to the local bucket they fall into; all others to the local day
 * that holds the middle of their UTC day.
 */
function dayAssigner(points: { ts: number }[], reqStart: number): (ts: number) => number {
    const half = DAY / 2;
    const onLocalGrid = points.filter(p => (((p.ts - reqStart) % half) + half) % half === 0).length;
    if (onLocalGrid * 2 >= points.length) {
        const firstDay = dayOfTs(reqStart);
        return ts => firstDay + Math.floor((ts - reqStart) / DAY) * DAY;
    }
    return ts => dayOfTs(Math.floor(ts / DAY) * DAY + half);
}

/** Turns history points (one request, step 1 day, starting at local midnight `reqStart`) into daily values */
export function aggregateDays(
    points: { ts: number; val: number }[],
    reqStart: number,
    mode: SkyMode,
    factor: number,
    endDay: number,
): DayAggregate {
    const firstDay = dayOfTs(reqStart);
    const dayIn = dayAssigner(points, reqStart);
    const acc = new Map<number, { sum: number; n: number; max: number; min: number }>();
    for (const p of points) {
        const day = dayIn(p.ts);
        // the adapter may add the last value before the requested range
        if (day < firstDay) {
            continue;
        }
        const a = acc.get(day);
        if (a) {
            a.sum += p.val;
            a.n++;
            a.max = Math.max(a.max, p.val);
            a.min = Math.min(a.min, p.val);
        } else {
            acc.set(day, { sum: p.val, n: 1, max: p.val, min: p.val });
        }
    }
    const map = new Map<number, number>();
    const days = [...acc.keys()].sort((a, b) => a - b);
    let meterBase: number | null = null;
    if (mode === 'meter') {
        // consumption of a day = reading at its end − reading at the end of the day before (a reset counts as 0)
        let prev: number | null = null;
        for (const day of days) {
            const m = acc.get(day)!.max;
            if (prev !== null) {
                map.set(day, Math.max(0, m - prev) * factor);
            }
            if (day < endDay) {
                meterBase = m;
            }
            prev = m;
        }
        return { map, meterBase };
    }
    for (const day of days) {
        const a = acc.get(day)!;
        let v: number;
        switch (mode) {
            case 'counter':
            case 'max':
                v = a.max;
                break;
            case 'min':
                v = a.min;
                break;
            case 'sum':
                v = a.sum;
                break;
            case 'power':
                v = ((a.sum / a.n) * 24) / 1000;
                break;
            default:
                v = a.sum / a.n;
        }
        map.set(day, v * factor);
    }
    return { map, meterBase };
}

/* ---------- JSON ---------- */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

function dayOf(key: unknown): number | null {
    if (typeof key === 'number' && Number.isFinite(key)) {
        // seconds or milliseconds
        return dayOfTs(key < 1e11 ? key * 1000 : key);
    }
    if (typeof key === 'string') {
        const m = ISO_DAY.exec(key.trim());
        if (m) {
            return Date.UTC(+m[1], +m[2] - 1, +m[3]);
        }
        if (/^\d+$/.test(key.trim())) {
            return dayOf(Number(key));
        }
        const t = Date.parse(key);
        return Number.isFinite(t) ? dayOfTs(t) : null;
    }
    return null;
}

/**
 * Daily values from a JSON value: `{"2026-01-31": 12.3, …}`, `[[timestamp, value], …]`, `[["2026-01-31", 12.3], …]`
 * or `[{date|ts, value|val}, …]`. Several entries of the same day are added up. Returns null if nothing is usable.
 */
export function parseJsonDays(raw: unknown, factor: number): Map<number, number> | null {
    let data: unknown = raw;
    if (typeof raw === 'string') {
        if (!raw.trim()) {
            return null;
        }
        try {
            data = JSON.parse(raw);
        } catch {
            return null;
        }
    }
    if (!data || typeof data !== 'object') {
        return null;
    }
    const map = new Map<number, number>();
    const add = (k: unknown, v: unknown): void => {
        const day = dayOf(k);
        const n = toNum(v);
        if (day !== null && n !== null) {
            map.set(day, (map.get(day) || 0) + n * factor);
        }
    };
    if (Array.isArray(data)) {
        for (const e of data) {
            if (Array.isArray(e)) {
                add(e[0], e[1]);
            } else if (e && typeof e === 'object') {
                const o = e as Record<string, unknown>;
                add(o.date ?? o.ts ?? o.t ?? o.day, o.value ?? o.val ?? o.v);
            }
        }
    } else {
        for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
            add(k, v);
        }
    }
    return map.size ? map : null;
}

/** First day with a value */
export function firstDay(map: Map<number, number>): number | null {
    let first: number | null = null;
    for (const k of map.keys()) {
        if (first === null || k < first) {
            first = k;
        }
    }
    return first;
}
