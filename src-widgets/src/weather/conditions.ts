/* Weather conditions of GlashausWeather: WMO codes, OpenWeatherMap condition IDs and icon codes and common
 * keywords (de + en) are mapped to one of a few kinds; every kind has a label and an icon description. */

export type WxKind =
    | 'clear'
    | 'mostly'
    | 'partly'
    | 'cloudy'
    | 'overcast'
    | 'fog'
    | 'drizzle'
    | 'rain'
    | 'heavy'
    | 'showers'
    | 'thunder'
    | 'snow'
    | 'sleet'
    | 'hail'
    | 'wind';

export interface WxCondition {
    kind: WxKind;
    /** Night hint from the source (OpenWeatherMap "01n", "clear-night"), undefined if the source does not tell */
    night?: boolean;
    /** Human text of the source (shown instead of the translated label) */
    text?: string;
}

/** WMO weather code (present weather, 0..99; Open-Meteo uses a subset) → kind */
function wmoKind(n: number): WxKind {
    if (n === 0) {
        return 'clear';
    }
    if (n === 1) {
        return 'mostly';
    }
    if (n === 2) {
        return 'partly';
    }
    if (n === 3) {
        return 'overcast';
    }
    if (n <= 12 || (n >= 40 && n <= 49)) {
        return 'fog';
    }
    if (n === 13 || n === 17 || n >= 91) {
        return n === 96 || n === 99 ? 'hail' : 'thunder';
    }
    if (n <= 16) {
        // precipitation in sight, not here
        return 'cloudy';
    }
    if (n <= 19 || (n >= 30 && n <= 35)) {
        return 'wind';
    }
    if (n <= 29) {
        return 'cloudy';
    }
    if (n <= 39) {
        return 'snow';
    }
    if (n <= 55 || n === 58 || n === 59) {
        return 'drizzle';
    }
    if (n <= 57 || (n >= 66 && n <= 69) || n === 83 || n === 84) {
        return 'sleet';
    }
    if (n <= 65) {
        return n >= 64 ? 'heavy' : 'rain';
    }
    if (n <= 79 || n === 85 || n === 86) {
        return 'snow';
    }
    if (n <= 81) {
        return 'showers';
    }
    if (n === 82) {
        return 'heavy';
    }
    return 'hail';
}

const OWM_CLOUDS: Record<number, WxKind> = {
    800: 'clear',
    801: 'mostly',
    802: 'partly',
    803: 'cloudy',
    804: 'overcast',
};

/** OpenWeatherMap condition ID (200..804) → kind */
function owmIdKind(n: number): WxKind | null {
    if (n >= 200 && n < 300) {
        return 'thunder';
    }
    if (n >= 300 && n < 400) {
        return 'drizzle';
    }
    if (n >= 500 && n < 600) {
        if (n === 511) {
            return 'sleet';
        }
        if (n >= 520) {
            return 'showers';
        }
        return n >= 502 ? 'heavy' : 'rain';
    }
    if (n >= 600 && n < 700) {
        return n >= 611 && n <= 616 ? 'sleet' : 'snow';
    }
    if (n >= 700 && n < 800) {
        return n === 771 || n === 781 ? 'wind' : 'fog';
    }
    return OWM_CLOUDS[n] ?? null;
}

/** Numeric code: WMO weather code (0..99) or OpenWeatherMap condition ID (200..804) */
function codeKind(c: number): WxKind | null {
    const n = Math.round(c);
    if (n >= 0 && n <= 99) {
        return wmoKind(n);
    }
    return owmIdKind(n);
}

const OWM: Record<string, WxKind> = {
    '01': 'clear',
    '02': 'partly',
    '03': 'cloudy',
    '04': 'overcast',
    '09': 'showers',
    10: 'rain',
    11: 'thunder',
    13: 'snow',
    50: 'fog',
};

/** Keyword rules, the first match wins (order: specific before general) */
const RULES: [RegExp, WxKind][] = [
    [/gewitter|thunder|blitz|lightning/, 'thunder'],
    [/hagel|hail|graupel/, 'hail'],
    [
        /schneeregen|sleet|freezing|gefrier|eisregen|regen und schnee|schnee und regen|rain and snow|snow and rain/,
        'sleet',
    ],
    [/schnee|snow|flurr/, 'snow'],
    [/starkregen|heavy rain|wolkenbruch|torrential|kräftiger regen/, 'heavy'],
    [/schauer|shower/, 'showers'],
    [/niesel|drizzle|sprühregen/, 'drizzle'],
    [/regen|rain/, 'rain'],
    [/nebel|fog|mist|dunst|haze|smog/, 'fog'],
    [/wind|sturm|böig|böen|gust|breez/, 'wind'],
    [/bedeckt|overcast|trüb/, 'overcast'],
    [
        /teils|partly|partial|wechselnd|aufgelockert|leicht bewölkt|heiter bis wolkig|sonne und wolken|sun and clouds|few clouds|scattered|vereinzelt/,
        'partly',
    ],
    [/heiter|mostly sunny|mostly clear|mainly clear|überwiegend sonnig|überwiegend klar|fair/, 'mostly'],
    [/wolkenlos|cloudless/, 'clear'],
    [/bewölkt|wolkig|wolken|cloud|broken/, 'cloudy'],
    [/klar|clear|sonn|sun/, 'clear'],
];

/** Interprets a state value or forecast field: WMO code, OWM condition ID or icon code, keyword or free text */
export function parseCondition(v: unknown): WxCondition | null {
    if (typeof v === 'number') {
        const kind = Number.isFinite(v) ? codeKind(v) : null;
        return kind ? { kind } : null;
    }
    if (typeof v !== 'string') {
        return null;
    }
    const s = v.trim();
    // empty, or the text vis-2 / scripts leave for a missing value
    if (!s || s === 'undefined' || s === 'null') {
        return null;
    }
    if (/^\d{1,3}(\.0)?$/.test(s)) {
        const kind = codeKind(Number(s));
        return kind ? { kind } : null;
    }
    const owm = /^(\d\d)([dn])$/.exec(s);
    if (owm && OWM[owm[1]]) {
        return { kind: OWM[owm[1]], night: owm[2] === 'n' };
    }
    const low = s.toLowerCase();
    // "partly-cloudy-day", "mostly_clear" → "partly cloudy day", "mostly clear"
    const words = low.replace(/[-_]+/g, ' ');
    let night: boolean | undefined;
    if (/night|nacht/.test(words)) {
        night = true;
    } else if (/(^|\s)day$/.test(words)) {
        night = false;
    }
    // A single lower-case token ("rain", "partly-cloudy-day", "regen") is a machine keyword → translated label;
    // anything else ("Leicht bewölkt", "Light rain") is shown as it is
    const machine = /^[a-zäöüß0-9_-]+$/.test(low) && low === s;
    for (const [re, kind] of RULES) {
        if (re.test(words)) {
            return { kind, night, text: machine ? undefined : s };
        }
    }
    return { kind: 'cloudy', night, text: machine ? undefined : s };
}

/** Icon description of a kind */
export interface WxArt {
    /** Sun (day) or moon (night) */
    sky: 'full' | 'peek' | null;
    clouds: 0 | 1 | 2;
    /** Darker cloud */
    dark?: boolean;
    rain?: 0 | 1 | 2 | 3;
    snow?: boolean;
    bolt?: boolean;
    hail?: boolean;
    fog?: boolean;
    wind?: boolean;
}

export function artOf(kind: WxKind): WxArt {
    switch (kind) {
        case 'clear':
            return { sky: 'full', clouds: 0 };
        case 'mostly':
            return { sky: 'full', clouds: 1 };
        case 'partly':
            return { sky: 'peek', clouds: 1 };
        case 'cloudy':
            return { sky: null, clouds: 2 };
        case 'overcast':
            return { sky: null, clouds: 2, dark: true };
        case 'fog':
            return { sky: null, clouds: 0, fog: true };
        case 'drizzle':
            return { sky: null, clouds: 1, rain: 1 };
        case 'rain':
            return { sky: null, clouds: 1, dark: true, rain: 2 };
        case 'heavy':
            return { sky: null, clouds: 1, dark: true, rain: 3 };
        case 'showers':
            return { sky: 'peek', clouds: 1, rain: 2 };
        case 'thunder':
            return { sky: null, clouds: 1, dark: true, rain: 1, bolt: true };
        case 'snow':
            return { sky: null, clouds: 1, snow: true };
        case 'sleet':
            return { sky: null, clouds: 1, rain: 1, snow: true };
        case 'hail':
            return { sky: null, clouds: 1, dark: true, hail: true, bolt: true };
        case 'wind':
            return { sky: null, clouds: 1, wind: true };
        default:
            return { sky: null, clouds: 1 };
    }
}

/** i18n key of the label of a kind (clear and mostly differ between day and night) */
export function labelKey(kind: WxKind, night: boolean): string {
    if (night && (kind === 'clear' || kind === 'mostly')) {
        return `wx_k_${kind}_night`;
    }
    return `wx_k_${kind}`;
}

/** Icon box of the header: sun / moon / cloud and its accent */
export function headerIcon(kind: WxKind | null, night: boolean): { icon: string; accent: string } {
    if (kind === 'clear' || kind === 'mostly' || kind === 'partly') {
        return night ? { icon: 'moon', accent: 'var(--gh-fg-2)' } : { icon: 'sun', accent: 'var(--gh-sun)' };
    }
    if (kind && ['drizzle', 'rain', 'heavy', 'showers', 'snow', 'sleet', 'hail'].includes(kind)) {
        return { icon: 'cloud', accent: 'var(--gh-cool)' };
    }
    return { icon: 'cloud', accent: 'var(--gh-fg-2)' };
}

/** Compass direction from degrees (8 points) */
export function compass(deg: number, lang: string): string {
    const de = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
    const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
    return (lang === 'de' ? de : en)[i];
}

/** i18n key of the UV index category */
export function uvKey(uv: number): string {
    if (uv < 3) {
        return 'wx_uv_low';
    }
    if (uv < 6) {
        return 'wx_uv_moderate';
    }
    if (uv < 8) {
        return 'wx_uv_high';
    }
    if (uv < 11) {
        return 'wx_uv_very_high';
    }
    return 'wx_uv_extreme';
}
