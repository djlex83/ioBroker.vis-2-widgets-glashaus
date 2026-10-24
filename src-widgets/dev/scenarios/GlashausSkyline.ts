import type { Scenario } from '../scenario';

const DAY = 86400000;

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

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const todayUtc = (): number => {
    const d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};
/** 0 in mid-winter … 1 in mid-summer */
const season = (ms: number): number => {
    const d = new Date(ms);
    const doy = (ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY;
    return (1 - Math.cos((2 * Math.PI * (doy - 15)) / 365)) / 2;
};

/** Outdoor temperature, daily average (°C) for 14 months, as {"YYYY-MM-DD": value} – includes frost days */
function temperatureJson(): string {
    const r = rng(11);
    const end = todayUtc();
    const out: Record<string, number> = {};
    let drift = 0;
    for (let ms = end - 425 * DAY; ms <= end; ms += DAY) {
        drift = drift * 0.7 + (r() - 0.5) * 5;
        out[iso(ms)] = Math.round((-1 + 20 * season(ms) + drift) * 10) / 10;
    }
    return JSON.stringify(out);
}

/** Heating energy (kWh per day) for three years and a bit, as [[timestamp, value], …] */
function heatingJson(): string {
    const r = rng(5);
    const end = todayUtc();
    const out: [number, number][] = [];
    for (let ms = end - 3 * 365 * DAY - 40 * DAY; ms <= end; ms += DAY) {
        const cold = 1 - season(ms);
        const y = new Date(ms).getUTCFullYear();
        // every winter a bit less (better insulation), summer only hot water
        const v = Math.max(3, (8 + 70 * Math.pow(cold, 1.6)) * (1 - (y - 2023) * 0.05) * (0.8 + 0.4 * r()));
        out.push([ms + 12 * 3600000, Math.round(v * 10) / 10]);
    }
    return JSON.stringify(out);
}

/** A few weeks only, with gaps (sensor offline) */
function sparseJson(): string {
    const r = rng(3);
    const end = todayUtc();
    const out: Record<string, number> = {};
    for (let ms = end - 40 * DAY; ms <= end; ms += DAY) {
        if (r() > 0.25) {
            out[iso(ms)] = Math.round(r() * 120) / 10;
        }
    }
    return JSON.stringify(out);
}

const TEMPERATURE = temperatureJson();
const HEAT = heatingJson();
const SPARSE = sparseJson();

export default [
    { widget: 'GlashausSkyline', name: 'demo', w: 900, h: 500 },
    {
        widget: 'GlashausSkyline',
        name: 'live',
        w: 740,
        h: 500,
        data: {
            oid: 'harness.0.sky.energy_daily',
            label: 'Sonnenertrag',
            unit: 'kWh',
            mode: 'counter',
            accent: 'sun',
            years: 2,
            totalLabel: 'Jahresertrag',
            streak: 'above',
            streakValue: 25,
            streakLabel: 'über 25 kWh',
        },
        states: {
            // daily counter: grows during the day, resets at midnight
            'harness.0.sky.energy_daily': {
                val: t => Math.round((6 + ((t / 1000) % 3600) / 150) * 100) / 100,
                unit: 'kWh',
                name: 'PV energy today',
            },
        },
    },
    {
        widget: 'GlashausSkyline',
        name: 'json-2d',
        w: 700,
        h: 380,
        data: {
            title: 'Außentemperatur',
            icon: 'thermo',
            jsonOid: 'harness.0.sky.temp_json',
            label: 'Außentemperatur',
            unit: '°C',
            total: 'mean',
            accent: 'cool',
            view: '2d',
            stats: 'row',
            yearButtons: false,
        },
        states: { 'harness.0.sky.temp_json': { val: TEMPERATURE, type: 'string', name: 'Outdoor temperature per day' } },
    },
    {
        widget: 'GlashausSkyline',
        name: 'small',
        w: 340,
        h: 220,
        data: {
            jsonOid: 'harness.0.sky.sparse_json',
            label: 'Wasser',
            unit: 'm³',
            accent: 'home',
            legend: false,
        },
        states: { 'harness.0.sky.sparse_json': { val: SPARSE, type: 'string', name: 'Water per day' } },
    },
    {
        widget: 'GlashausSkyline',
        name: 'offline',
        w: 480,
        h: 300,
        data: {
            title: 'Wärmepumpe',
            icon: 'fan',
            jsonOid: 'harness.0.sky.offline_json',
            unit: 'kWh',
            accent: 'heat',
        },
        states: { 'harness.0.sky.offline_json': { val: '', type: 'string', name: 'Heat pump per day' } },
    },
    {
        widget: 'GlashausSkyline',
        name: 'large',
        w: 1300,
        h: 760,
        data: {
            jsonOid: 'harness.0.sky.heat_json',
            label: 'Heizenergie',
            unit: 'kWh',
            decimals: 0,
            accent: 'grid',
            years: 3,
            totalLabel: 'Heizenergie',
            streak: 'below',
            streakValue: 10,
            streakLabel: 'unter 10 kWh',
        },
        states: { 'harness.0.sky.heat_json': { val: HEAT, type: 'string', name: 'Heating energy per day' } },
    },
] satisfies Scenario[];
