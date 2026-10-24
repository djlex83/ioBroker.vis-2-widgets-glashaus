/* Reading of an appliance: operation state, remaining time, progress, program and door from object values.
 * Pure functions, no React. */
import { toNum } from '../core/format';
import type { ApMode } from './figures';

/**
 * Default value lists; Home Connect values like "BSH.Common.EnumType.OperationState.Run" match by their last segment.
 * Program phases that other adapters report as state (Washing, Drying, …) count as running.
 */
export const DEFAULT_VALUES: Record<'run' | 'pause' | 'done' | 'off', string> = {
    run: 'Run,Running,DelayedStart,ActionRequired,Washing,Prewash,Rinse,Rinsing,Spin,Spinning,Drying,Cooling,läuft,Waschen,Spülen,Schleudern,Trocknen,on,an,true,1',
    pause: 'Pause,Paused,pausiert',
    done: 'Finished,Finish,End,Done,fertig,Ende',
    off: 'Ready,Inactive,Off,Idle,Standby,Aborting,aus,bereit,false,0',
};

/** Last segment of a dotted enum value: "BSH.Common.EnumType.OperationState.Run" → "Run" (numbers stay as they are) */
export function lastSegment(v: string): string {
    const t = v.trim();
    if (/\s/.test(t) || !t.includes('.') || /^-?\d+(\.\d+)?$/.test(t)) {
        return t;
    }
    const seg = t.split('.').pop();
    return seg || t;
}

/** Value as trimmed text (booleans and numbers included) */
function asText(v: unknown): string {
    if (typeof v === 'string') {
        return v.trim();
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
        return String(v);
    }
    return '';
}

/** Does a state value match one of the comma separated values (case-insensitive, full value or last segment)? */
export function matchesList(v: unknown, list: string): boolean {
    const t = asText(v).toLowerCase();
    if (!t) {
        return false;
    }
    const seg = lastSegment(t);
    return list
        .split(',')
        .map(x => x.trim().toLowerCase())
        .filter(Boolean)
        .some(x => x === t || x === seg);
}

/** Does a state value that matches no list look like a fault? */
export function isFault(v: unknown): boolean {
    return /^(error|fault|failure|fehler|störung)$/i.test(lastSegment(asText(v)));
}

/** Mode from a text/number state; null when the value matches no list */
export function modeFromState(
    v: unknown,
    lists: { run?: string; pause?: string; done?: string; off?: string },
): ApMode | null {
    const l = (k: keyof typeof DEFAULT_VALUES): string => (lists[k] ? lists[k] : DEFAULT_VALUES[k]);
    if (matchesList(v, l('run'))) {
        return 'run';
    }
    if (matchesList(v, l('pause'))) {
        return 'pause';
    }
    if (matchesList(v, l('done'))) {
        return 'done';
    }
    if (matchesList(v, l('off'))) {
        return 'off';
    }
    return null;
}

/** Door state: booleans, numbers and texts like "Open" / "BSH.Common.EnumType.DoorState.Open" / "offen" */
export function doorOpen(v: unknown): boolean {
    if (typeof v === 'boolean') {
        return v;
    }
    if (typeof v === 'number') {
        return v !== 0;
    }
    const t = lastSegment(asText(v)).toLowerCase();
    return ['open', 'opened', 'ajar', 'offen', 'auf', 'geöffnet', 'true', '1', 'on'].includes(t);
}

export type TimeUnit = 's' | 'min' | 'h';

/** Duration value → minutes. Numbers in `unit`, texts "1:05" (h:mm) or "1:05:30" (h:mm:ss) */
export function toMinutes(v: unknown, unit: TimeUnit): number | null {
    if (typeof v === 'string' && v.includes(':')) {
        if (!/^\d+:\d{1,2}(:\d{1,2})?$/.test(v.trim())) {
            return null;
        }
        const [h, m, sec = 0] = v.trim().split(':').map(Number);
        return h * 60 + m + sec / 60;
    }
    const n = toNum(v);
    if (n === null || n < 0) {
        return null;
    }
    return unit === 's' ? n / 60 : unit === 'h' ? n * 60 : n;
}

/** Program name: enum values like "LaundryCare.Washer.Program.Cotton" or "Dishcare.Dishwasher.Program.Eco50" → "Cotton" / "Eco 50" */
export function prettyProgram(v: unknown): string {
    const t = asText(v);
    if (!t) {
        return '';
    }
    if (/\s/.test(t) || !/^[\w-]+(\.[\w-]+)+$/.test(t)) {
        return t;
    }
    return lastSegment(t)
        .replace(/_/g, ' ')
        .replace(/([a-zäöü])([A-ZÄÖÜ0-9])/g, '$1 $2')
        .replace(/([0-9])([A-Za-z])/g, '$1 $2')
        .trim();
}

/** Remaining minutes as "h:mm" for the small device display */
export function displayTime(min: number): string {
    const m = Math.max(0, Math.ceil(min));
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
