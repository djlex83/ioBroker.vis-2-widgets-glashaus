/* Minimal stand-in for vis-2 so that widgets can be developed and checked without ioBroker.
 * Provides window.visRxWidget (subset of VisRxWidget), a state store with simulated values,
 * a socket mock (getHistory, getObject, getState, subscribeState) and translations. */
import React from 'react';

import translations from '../src/translations';

const PREFIX = 'vis-2-widgets-glashaus_';

export const env = {
    lang: 'de' as ioBroker.Languages,
    themeType: 'light' as 'light' | 'dark',
};

/* ---------- State store ---------- */

type Listener = (id: string, state: ioBroker.State) => void;

/** Simulated object IDs. Numbers drift slowly so that animations can be seen. */
const generators: Record<string, (t: number) => ioBroker.StateValue> = {};
const values: Record<string, ioBroker.State> = {};
const listeners: Record<string, Set<Listener>> = {};
const objects: Record<string, { name: string; unit?: string; type?: string; role?: string }> = {};

function mkState(val: ioBroker.StateValue): ioBroker.State {
    const ts = Date.now();
    return { val, ack: true, ts, lc: ts, from: 'system.adapter.harness.0', q: 0 } as ioBroker.State;
}

export const store = {
    /** Defines a simulated object ID; `gen` is called every 2 s */
    define(
        id: string,
        val: ioBroker.StateValue | ((t: number) => ioBroker.StateValue),
        obj?: { name?: string; unit?: string; type?: string; role?: string },
    ): void {
        if (typeof val === 'function') {
            generators[id] = val;
            values[id] = mkState(val(Date.now()));
        } else {
            values[id] = mkState(val);
        }
        objects[id] = { name: obj?.name || id.split('.').pop() || id, ...obj };
    },
    get(id: string): ioBroker.State | undefined {
        return values[id];
    },
    set(id: string, val: ioBroker.StateValue): void {
        const old = values[id];
        const st = mkState(val);
        if (old && old.val === val) {
            st.lc = old.lc;
        }
        values[id] = st;
        delete generators[id];
        listeners[id]?.forEach(cb => cb(id, st));
        console.log(`[harness] setValue ${id} = ${JSON.stringify(val)}`);
    },
    subscribe(id: string, cb: Listener): void {
        (listeners[id] ||= new Set()).add(cb);
    },
    unsubscribe(id: string, cb: Listener): void {
        listeners[id]?.delete(cb);
    },
    objects,
};

setInterval(() => {
    const now = Date.now();
    for (const id of Object.keys(generators)) {
        const v = generators[id](now);
        const old = values[id];
        const st = mkState(v);
        if (old && old.val === v) {
            st.lc = old.lc;
        }
        values[id] = st;
        listeners[id]?.forEach(cb => cb(id, st));
    }
}, 2000);

/** Deterministic pseudo random 0..1 from a number */
function hash(n: number): number {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

/* ---------- Socket mock ---------- */

export const socket = {
    getObject: async (id: string): Promise<any> => {
        const o = objects[id];
        return o
            ? { _id: id, type: 'state', common: { name: o.name, unit: o.unit, type: o.type || 'number', role: o.role || 'value', read: true, write: true } }
            : null;
    },
    getState: async (id: string): Promise<ioBroker.State | null> => values[id] || null,
    subscribeState: async (id: string, cb: Listener): Promise<void> => {
        store.subscribe(id, cb);
        const st = values[id];
        if (st) {
            setTimeout(() => cb(id, st), 0);
        }
    },
    unsubscribeState: (id: string, cb: Listener): void => store.unsubscribe(id, cb),
    setState: async (id: string, val: any): Promise<void> => store.set(id, typeof val === 'object' && val ? val.val : val),
    /** Synthetic history: a smooth curve around the current value (or 0..100), aggregated like history adapters */
    getHistory: async (id: string, o: any): Promise<ioBroker.GetHistoryResult> => {
        await new Promise(r => setTimeout(r, 150));
        const start = o.start || Date.now() - 86400000;
        const end = o.end || Date.now();
        const step = o.step || Math.max(60000, Math.round((end - start) / (o.count || 200)));
        const cur = values[id]?.val;
        const base = typeof cur === 'number' ? cur : 50;
        const amp = Math.max(1, Math.abs(base) * 0.25);
        const seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
        const out: ioBroker.State[] = [];
        for (let t = start; t <= end; t += step) {
            const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
            let v: number;
            if (/pv|solar|sun/i.test(id)) {
                v = Math.max(0, Math.sin(((h - 6) / 14) * Math.PI)) * Math.max(base, 4000) * (0.75 + 0.25 * hash(seed + t / 3.6e6));
            } else if (/day|daily|total|kwh/i.test(id)) {
                const doy = (t - new Date(new Date(t).getFullYear(), 0, 1).getTime()) / 86400000;
                v = Math.max(0, (10 + 25 * Math.sin(((doy - 80) / 365) * 2 * Math.PI) + 10 * hash(seed + Math.floor(t / 86400000))));
            } else {
                v = base + amp * Math.sin(((h - 9) / 24) * 2 * Math.PI) + amp * 0.2 * (hash(seed + t / 9e5) - 0.5);
            }
            out.push({ ts: t, val: Math.round(v * 100) / 100, ack: true, from: '', q: 0, lc: t } as ioBroker.State);
        }
        return out as unknown as ioBroker.GetHistoryResult;
    },
};

/* ---------- Translations ---------- */

function tr(key: string, ...args: string[]): string {
    const k = key.startsWith(PREFIX) ? key.substring(PREFIX.length) : key;
    const words = translations as Record<string, Record<string, string> | boolean>;
    const dict = (words[env.lang] || words.en) as Record<string, string>;
    let text = dict[k] ?? (words.en as Record<string, string>)[k] ?? key;
    args.forEach(a => (text = text.replace('%s', a)));
    return text;
}

/* ---------- VisRxWidget stand-in ---------- */

interface MockProps {
    id: string;
    data: Record<string, any>;
    editMode: boolean;
    width: number;
    height: number;
    themeType: 'light' | 'dark';
    lang: ioBroker.Languages;
    context: any;
}

function collectIds(info: any, data: Record<string, any>): string[] {
    const ids = new Set<string>();
    (info.visAttrs || []).forEach((g: any) => {
        const from = g.indexFrom;
        const to = typeof g.indexTo === 'number' ? g.indexTo : parseInt(data[g.indexTo], 10) || 0;
        (g.fields || []).forEach((f: any) => {
            if (!['id', 'hid', 'history'].includes(f.type)) {
                return;
            }
            if (from !== undefined) {
                for (let i = from; i <= to; i++) {
                    const v = data[`${f.name}${i}`];
                    if (typeof v === 'string' && v && v !== 'nothing_selected') {
                        ids.add(v);
                    }
                }
            } else {
                const v = data[f.name];
                if (typeof v === 'string' && v && v !== 'nothing_selected') {
                    ids.add(v);
                }
            }
        });
    });
    // bindings like {harness.0.temp} in any text attribute
    Object.values(data).forEach(v => {
        if (typeof v === 'string') {
            for (const m of v.matchAll(/\{([a-zA-Z0-9_.\-]+)\}/g)) {
                ids.add(m[1]);
            }
        }
    });
    return [...ids];
}

function defaults(info: any, data: Record<string, any> = {}): Record<string, any> {
    const d: Record<string, any> = {};
    const groups: any[] = info.visAttrs || [];
    // plain fields first, so that indexTo can refer to an attribute (e.g. "count")
    groups
        .filter(g => g.indexFrom === undefined)
        .forEach(g =>
            (g.fields || []).forEach((f: any) => {
                if (f.default !== undefined) {
                    d[f.name] = f.default;
                }
            }),
        );
    groups
        .filter(g => g.indexFrom !== undefined)
        .forEach(g => {
            const from = g.indexFrom;
            const to =
                typeof g.indexTo === 'number'
                    ? g.indexTo
                    : parseInt(data[g.indexTo] ?? d[g.indexTo], 10) || from;
            (g.fields || []).forEach((f: any) => {
                if (f.default === undefined) {
                    return;
                }
                for (let i = from; i <= Math.max(to, from); i++) {
                    d[`${f.name}${i}`] = f.default;
                }
            });
        });
    return d;
}

/** Replaces {id} bindings in string attributes by the current value */
function bind(data: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
        out[k] =
            typeof v === 'string'
                ? v.replace(/\{([a-zA-Z0-9_.\-]+)\}/g, (_m, id: string) => String(values[id]?.val ?? ''))
                : v;
    }
    return out;
}

export class MockVisRxWidget extends React.Component<MockProps, any> {
    static t(key: string, ...args: string[]): string {
        return tr(key, ...args);
    }

    static getLanguage(): ioBroker.Languages {
        return env.lang;
    }

    static getI18nPrefix(): string {
        return '';
    }

    static getText(text: any): string {
        return typeof text === 'object' ? text[env.lang] || text.en : text;
    }

    private subs: { id: string; cb: Listener }[] = [];

    constructor(props: MockProps) {
        super(props);
        const info = (this as any).getWidgetInfo();
        const raw = { ...defaults(info, props.data), ...props.data };
        const vals: Record<string, any> = {};
        collectIds(info, raw).forEach(id => {
            const st = values[id];
            if (st) {
                vals[`${id}.val`] = st.val;
                vals[`${id}.lc`] = st.lc;
                vals[`${id}.ts`] = st.ts;
            }
        });
        this.state = {
            rxData: bind(raw),
            rxStyle: {},
            values: vals,
            editMode: props.editMode,
            visible: true,
            disabled: false,
            selected: false,
        };
    }

    get rawData(): Record<string, any> {
        return { ...defaults((this as any).getWidgetInfo(), this.props.data), ...this.props.data };
    }

    private onState = (id: string, st: ioBroker.State): void => {
        this.setState(
            (prev: any) => ({
                values: { ...prev.values, [`${id}.val`]: st.val, [`${id}.lc`]: st.lc, [`${id}.ts`]: st.ts },
                rxData: bind(this.rawData),
            }),
            () => (this as any).onStateUpdated?.(id, st),
        );
    };

    componentDidMount(): void {
        collectIds((this as any).getWidgetInfo(), this.rawData).forEach(id => {
            store.subscribe(id, this.onState);
            this.subs.push({ id, cb: this.onState });
        });
    }

    componentDidUpdate(prevProps: MockProps, _prevState: any): void {
        if (prevProps.data !== this.props.data) {
            const prev = this.state.rxData;
            this.subs.forEach(s => store.unsubscribe(s.id, s.cb));
            this.subs = [];
            this.componentDidMount();
            this.setState({ rxData: bind(this.rawData) }, () => (this as any).onRxDataChanged?.(prev));
        }
        if (prevProps.editMode !== this.props.editMode) {
            this.setState({ editMode: this.props.editMode });
        }
    }

    componentWillUnmount(): void {
        this.subs.forEach(s => store.unsubscribe(s.id, s.cb));
    }

    onRxDataChanged(_prev: any): void {}

    onStateUpdated(_id: string, _st: any): void {}

    renderWidgetBody(_props: any): any {
        return null;
    }

    render(): React.JSX.Element {
        const props = { id: this.props.id, style: {} as React.CSSProperties, className: 'vis-widget' };
        const body = this.renderWidgetBody(props);
        return (
            <div
                className={props.className}
                style={{ ...props.style, position: 'relative', width: this.props.width, height: this.props.height }}
            >
                {body}
            </div>
        );
    }
}

/** The `context` prop of vis-2, as far as the widgets use it */
export function makeContext(themeType: 'light' | 'dark', lang: ioBroker.Languages, onView?: (v: string) => void): any {
    return {
        themeType,
        lang,
        socket,
        setValue: (id: string, val: ioBroker.StateValue) => store.set(id, val),
        changeView: (view: string) => {
            console.log(`[harness] changeView ${view}`);
            onView?.(view);
        },
        toggleTheme: (name?: string) => console.log(`[harness] toggleTheme ${name}`),
        systemConfig: { common: { defaultHistory: 'history.0', language: lang } },
        views: {},
        activeView: 'Home',
        projectName: 'main',
        instance: 0,
        dateFormat: 'DD.MM.YYYY',
        editModeComponentStyle: {},
    };
}

(window as any).visRxWidget = MockVisRxWidget;
