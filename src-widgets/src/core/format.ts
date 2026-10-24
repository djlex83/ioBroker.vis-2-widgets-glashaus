/* Number, time and duration formatting in the language of vis-2 */

/** Locale for Intl from an ioBroker language code */
export function localeOf(lang: string | undefined): string {
    if (!lang) {
        return 'en';
    }
    return lang === 'zh-cn' ? 'zh-CN' : lang;
}

/** Converts state values to a number (numbers, numeric strings, booleans); returns null otherwise */
export function toNum(v: unknown): number | null {
    if (typeof v === 'number') {
        return Number.isFinite(v) ? v : null;
    }
    if (typeof v === 'boolean') {
        return v ? 1 : 0;
    }
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v.replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/** Interprets typical "on" values: true, 1, "true", "on", "1", "an", "ein" */
export function toBool(v: unknown): boolean {
    if (typeof v === 'string') {
        return ['true', 'on', '1', 'an', 'ein', 'yes', 'open'].includes(v.trim().toLowerCase());
    }
    return !!v;
}

/** Formats a number with fixed decimals and grouping, e.g. 1234.5 → "1.234,5" (de) */
export function fmtNum(v: number | null | undefined, dec = 0, lang?: string): string {
    if (v === null || v === undefined || !Number.isFinite(v)) {
        return '–';
    }
    return new Intl.NumberFormat(localeOf(lang), { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
}

/** Watts → "850 W" or "2,4 kW" depending on size */
export function fmtPower(w: number | null | undefined, lang?: string): { v: string; unit: string } {
    if (w === null || w === undefined || !Number.isFinite(w)) {
        return { v: '–', unit: 'W' };
    }
    if (Math.abs(w) >= 1000) {
        return { v: fmtNum(w / 1000, Math.abs(w) >= 10000 ? 1 : 2, lang), unit: 'kW' };
    }
    return { v: fmtNum(w, 0, lang), unit: 'W' };
}

/** Minutes → "1 h 05 min" / "45 min" */
export function fmtDuration(min: number | null | undefined): string {
    if (min === null || min === undefined || !Number.isFinite(min) || min < 0) {
        return '–';
    }
    const m = Math.round(min);
    if (m < 60) {
        return `${m} min`;
    }
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Time of day "14:05" */
export function fmtTime(d: Date | number, lang?: string): string {
    return new Date(d).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' });
}

/** Date "Freitag, 23. Oktober" */
export function fmtDate(d: Date | number, lang?: string, opts?: Intl.DateTimeFormatOptions): string {
    return new Date(d).toLocaleDateString(localeOf(lang), opts || { weekday: 'long', day: 'numeric', month: 'long' });
}

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
