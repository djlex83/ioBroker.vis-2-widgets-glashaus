/* Forecast input of GlashausWeather: a state with JSON. Accepted formats:
 *   - array of objects: [{ time|date, temp | tmin/tmax, code|icon|text, rain }, ...]
 *   - object with an array inside: { hourly: [...] }, { daily: [...] }, { list: [...] }, { data: [...] }
 *   - Open-Meteo columns: { hourly: { time: [...], temperature_2m: [...], weather_code: [...], ... }, daily: {...} }
 * Times may be ISO strings, dates ("2026-10-23", "23.10.2026"), "HH:MM" or timestamps in ms or s.
 * Rain is a probability in % (OpenWeatherMap "pop" 0..1 is converted; amounts in mm are not used). */
import { toNum } from '../core/format';
import { parseCondition, type WxCondition } from './conditions';

export interface WxHour {
    t: number | null;
    temp: number | null;
    cond: WxCondition | null;
    rain: number | null;
}

export interface WxDay {
    t: number | null;
    min: number | null;
    max: number | null;
    cond: WxCondition | null;
    rain: number | null;
}

type Obj = Record<string, unknown>;

const K_TIME = ['time', 'date', 'datetime', 'dt', 'ts', 't', 'timestamp', 'day', 'hour', 'valid_time', 'startTime'];
const K_TEMP = ['temp', 'temperature', 'temperature_2m', 't2m', 'value', 'temp_c', 'air_temperature'];
const K_MIN = ['tmin', 'min', 'temp_min', 'temperature_2m_min', 'minTemp', 'min_temp', 'low', 'tempMin'];
const K_MAX = ['tmax', 'max', 'temp_max', 'temperature_2m_max', 'maxTemp', 'max_temp', 'high', 'tempMax'];
const K_CODE = [
    'code',
    'weather_code',
    'weathercode',
    'wmo',
    'icon',
    'symbol',
    'condition',
    'state',
    'text',
    'summary',
    'description',
    'weather',
];
const K_TEXT = ['text', 'label', 'summary', 'description'];
/** Probability keys first: OpenWeatherMap has "rain" too, but as amount in mm ({ "1h": 0.3 } or a number) */
const K_RAIN = [
    'pop',
    'precipitation_probability',
    'precipitation_probability_max',
    'precipProbability',
    'precip_prob',
    'rainProb',
    'rain',
    'regen',
];
/** Keys with a probability 0..1 instead of % */
const K_RAIN_01 = ['pop', 'precipProbability'];

/** Parses a time: ms, s, ISO, date only (local noon), "HH:MM" (today) */
export function parseTime(v: unknown, base = Date.now()): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) {
        if (v > 1e12) {
            return v;
        }
        if (v > 1e9) {
            return v * 1000;
        }
        return null;
    }
    if (typeof v !== 'string' || !v.trim()) {
        return null;
    }
    const s = v.trim();
    if (/^\d{9,13}$/.test(s)) {
        return parseTime(Number(s), base);
    }
    const hm = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(s);
    if (hm) {
        const d = new Date(base);
        d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
        return d.getTime();
    }
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (day) {
        return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12).getTime();
    }
    // German date "23.10.2026", "Fr, 23.10.2026" or "23.10.2026 14:00"
    const de = /^(?:\p{L}{2,3}\.?,?\s*)?(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?$/u.exec(s);
    if (de) {
        const d = new Date(Number(de[3]), Number(de[2]) - 1, Number(de[1]), 12);
        if (de[4] !== undefined) {
            d.setHours(Number(de[4]), Number(de[5]), 0, 0);
        }
        return d.getTime();
    }
    // Date.parse also accepts "1" or "12" (as a year 2001 date): only texts with a 4-digit year count
    if (!/\d{4}/.test(s)) {
        return null;
    }
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
}

function pick(o: Obj, keys: string[]): unknown {
    for (const k of keys) {
        if (o[k] !== undefined && o[k] !== null && o[k] !== '') {
            return o[k];
        }
    }
    return undefined;
}

/** Nested values like OpenWeatherMap { main: { temp }, weather: [{ icon }] } */
function flatten(o: Obj): Obj {
    const out: Obj = { ...o };
    const main = o.main;
    if (main && typeof main === 'object' && !Array.isArray(main)) {
        Object.assign(out, main);
    }
    const temp = o.temp;
    if (temp && typeof temp === 'object' && !Array.isArray(temp)) {
        const t = temp as Obj;
        out.temp = t.day ?? t.max;
        out.tmin = t.min;
        out.tmax = t.max;
    }
    const w = o.weather;
    if (Array.isArray(w) && w[0] && typeof w[0] === 'object') {
        const w0 = w[0] as Obj;
        out.icon = w0.icon ?? w0.id;
        out.description = w0.description ?? w0.main;
        delete out.weather;
    }
    return out;
}

function rainOf(o: Obj): number | null {
    for (const k of K_RAIN) {
        const v = toNum(o[k]);
        if (v !== null) {
            return K_RAIN_01.includes(k) && v <= 1 ? Math.round(v * 100) : v;
        }
    }
    return null;
}

function condOf(o: Obj): WxCondition | null {
    const c = parseCondition(pick(o, K_CODE));
    const text = pick(o, K_TEXT);
    if (c && typeof text === 'string' && text.trim() && !c.text && text !== pick(o, K_CODE)) {
        // code and a separate human text: icon from the code, text from the text
        const t = parseCondition(text);
        return { ...c, text: t?.text };
    }
    return c;
}

/** Columns { time: [...], temperature_2m: [...] } → rows */
function columnsToRows(o: Obj): Obj[] | null {
    const time = o.time;
    if (!Array.isArray(time)) {
        return null;
    }
    return time.map((t, i) => {
        const row: Obj = { time: t };
        for (const [k, v] of Object.entries(o)) {
            if (Array.isArray(v)) {
                row[k] = v[i];
            }
        }
        return row;
    });
}

/** Finds the list of entries in a parsed JSON value */
function rowsOf(v: unknown, prefer: string[]): Obj[] {
    let data = v;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return [];
        }
    }
    if (Array.isArray(data)) {
        return data.filter((x): x is Obj => !!x && typeof x === 'object').map(flatten);
    }
    if (!data || typeof data !== 'object') {
        return [];
    }
    const o = data as Obj;
    for (const k of prefer) {
        const x = o[k];
        if (Array.isArray(x)) {
            return rowsOf(x, prefer);
        }
        if (x && typeof x === 'object') {
            const rows = columnsToRows(x as Obj);
            if (rows) {
                return rows.map(flatten);
            }
        }
    }
    const rows = columnsToRows(o);
    return rows ? rows.map(flatten) : [];
}

/** Hourly forecast from a JSON state value (entries without any value are dropped) */
export function parseHours(v: unknown): WxHour[] {
    return rowsOf(v, ['hourly', 'hours', 'list', 'data', 'forecast', 'weather'])
        .map(o => ({
            t: parseTime(pick(o, K_TIME)),
            temp: toNum(pick(o, K_TEMP)),
            cond: condOf(o),
            rain: rainOf(o),
        }))
        .filter(h => h.temp !== null || h.cond || h.rain !== null);
}

/** Daily forecast from a JSON state value (entries without any value are dropped) */
export function parseDays(v: unknown): WxDay[] {
    return rowsOf(v, ['daily', 'days', 'list', 'data', 'forecast'])
        .map(o => {
            const temp = toNum(pick(o, K_TEMP));
            return {
                t: parseTime(pick(o, K_TIME)),
                min: toNum(pick(o, K_MIN)) ?? temp,
                max: toNum(pick(o, K_MAX)) ?? temp,
                cond: condOf(o),
                rain: rainOf(o),
            };
        })
        .filter(d => d.min !== null || d.max !== null || d.cond || d.rain !== null);
}

/** Start of the local day */
export function dayStart(t: number): number {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/* ---------- Sun times ---------- */

/**
 * Sunrise and sunset (ms) of the day of `t`, approximated for 50° latitude and the standard meridian of
 * the browser's time zone. Only used when no sunrise / sunset state is configured.
 */
export function approxSun(t: number): { rise: number; set: number } {
    const d = new Date(t);
    const start = new Date(d.getFullYear(), 0, 1).getTime();
    const doy = Math.floor((dayStart(t) - start) / 86400000) + 1;
    const decl = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + doy)) / 365);
    const lat = (50 * Math.PI) / 180;
    const cosW = Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl)));
    const half = ((Math.acos(cosW) * 180) / Math.PI / 15) * 3600000;
    // solar noon ≈ 12:00 standard time; getTimezoneOffset includes daylight saving time
    const jan = new Date(d.getFullYear(), 0, 1).getTimezoneOffset();
    const jul = new Date(d.getFullYear(), 6, 1).getTimezoneOffset();
    const dst = (Math.max(jan, jul) - d.getTimezoneOffset()) * 60000;
    const noon = dayStart(t) + 12 * 3600000 + dst;
    return { rise: noon - half, set: noon + half };
}
