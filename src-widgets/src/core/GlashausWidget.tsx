/* Base class of all Glashaus widgets.
 * Adds to VisRxWidget: the Glashaus look (glass card, light/dark), value helpers with demo values,
 * history reading and manual subscriptions for IDs that are not plain `id` attributes (e.g. inside JSON). */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfoAttributesField,
    RxWidgetInfoGroup,
    VisRxWidgetProps,
    VisRxWidgetState,
} from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import { ensureGlashausStyle } from './style';
import { toNum } from './format';
import { ICON_NAMES } from './icons';

export const ADAPTER = 'vis-2-widgets-glashaus';
export const SET_COLOR = '#bf7a14';

/** Attributes of the "Design" group that every Glashaus widget has */
export interface GhDesignRxData {
    ghTheme?: 'vis' | 'light' | 'dark' | 'system';
    ghGlass?: boolean | 'true' | 'false';
    ghRise?: boolean | 'true' | 'false';
}

export interface HistoryPoint {
    ts: number;
    val: number;
}

export interface HistoryOptions {
    /** Start of the range (ms) */
    start: number;
    /** End of the range (ms), default now */
    end?: number;
    /** 'minmax' | 'average' | 'min' | 'max' | 'total' | 'count' | 'none' | 'onchange' | … (default 'average') */
    aggregate?: string;
    /** Step in ms for aggregation */
    step?: number;
    /** Maximal count of points (used when no step is given) */
    count?: number;
    /** History instance, default: widget attribute `history` or system default */
    instance?: string;
}

/** Accent colors of the Glashaus palette (CSS variables that switch with the theme) */
export const ACCENTS = [
    'fg',
    'sun',
    'batt',
    'grid',
    'home',
    'heat',
    'cool',
    'teal',
    'rose',
    'ok',
    'warn',
    'crit',
] as const;
export type GhAccent = (typeof ACCENTS)[number] | 'custom';

/** CSS color for an accent name, or the own color for 'custom' */
export function accentColor(accent: unknown, own?: unknown, def: GhAccent = 'fg'): string {
    const a = (typeof accent === 'string' && accent ? accent : def) as GhAccent;
    if (a === 'custom') {
        return typeof own === 'string' && own ? own : 'var(--gh-fg)';
    }
    return `var(--gh-${a})`;
}

/** Attribute name with an optional prefix in camelCase: ('', 'accent') → 'accent', ('wb', 'accent') → 'wbAccent' */
export function attrName(prefix: string, base: string): string {
    return prefix ? `${prefix}${base[0].toUpperCase()}${base.substring(1)}` : base;
}

/** `true` for attribute values like true / 'true' / 1 */
export function isTrue(v: unknown, def = false): boolean {
    if (v === undefined || v === null || v === '') {
        return def;
    }
    return v === true || v === 'true' || v === 1 || v === '1';
}

/** A usable object ID (vis-2 writes 'nothing_selected' for empty ID fields) */
export function isOid(id: unknown): id is string {
    return typeof id === 'string' && id !== '' && id !== 'nothing_selected' && !id.includes('{');
}

export default class GlashausWidget<
    TRxData extends Record<string, any>,
    TState extends Partial<VisRxWidgetState> = VisRxWidgetState,
> extends (window.visRxWidget as typeof VisRxWidget)<TRxData & GhDesignRxData, TState> {
    static adapter: string = ADAPTER;

    /** Subscriptions made with ghSubscribe(), released on unmount */
    private ghSubs: { id: string; cb: ioBroker.StateChangeHandler }[] = [];

    private ghMql: MediaQueryList | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureGlashausStyle();
    }

    static getI18nPrefix(): string {
        return `${ADAPTER}_`;
    }

    /** Translates a key of this widget set (without prefix) */
    static tr(key: string, ...args: string[]): string {
        return GlashausWidget.t(key, ...args);
    }

    /** The "Design" attribute group: theme, glass card, fade-in animation */
    static designGroup(opts: { glass?: boolean; rise?: boolean } = {}): RxWidgetInfoGroup {
        const fields: RxWidgetInfoAttributesField[] = [
            {
                name: 'ghTheme',
                label: 'theme',
                type: 'select',
                options: [
                    { value: 'vis', label: 'theme_vis' },
                    { value: 'light', label: 'theme_light' },
                    { value: 'dark', label: 'theme_dark' },
                    { value: 'system', label: 'theme_system' },
                ],
                default: 'vis',
            },
            {
                name: 'ghGlass',
                label: 'glass',
                type: 'checkbox',
                default: opts.glass !== false,
            },
            {
                name: 'ghRise',
                label: 'rise',
                type: 'checkbox',
                default: opts.rise !== false,
            },
        ];
        return { name: 'glashaus_design', label: 'group_design', fields };
    }

    /** Fields "accent color" (+ own color) for a group; `prefix` allows several accents per widget */
    static accentFields(prefix = '', def: GhAccent = 'fg', label = 'accent'): RxWidgetInfoAttributesField[] {
        return [
            {
                name: attrName(prefix, 'accent'),
                label,
                type: 'select',
                options: [...ACCENTS, 'custom'].map(a => ({ value: a, label: `accent_${a}` })),
                default: def,
            },
            {
                name: attrName(prefix, 'color'),
                label: 'color',
                type: 'color',
                hidden: `data["${attrName(prefix, 'accent')}"] !== "custom"`,
            },
        ];
    }

    /** Fields "icon" (Glashaus icon) and "own icon" (vis-2 icon picker) */
    static iconFields(def = '', prefix = ''): RxWidgetInfoAttributesField[] {
        return [
            {
                name: attrName(prefix, 'icon'),
                label: 'icon',
                type: 'select',
                noTranslation: true,
                options: [{ value: '', label: '–' }, ...ICON_NAMES.map(n => ({ value: n, label: n }))],
                default: def,
            },
            {
                name: attrName(prefix, 'iconCustom'),
                label: 'icon_custom',
                type: 'icon64',
            },
        ];
    }

    /** Icon to show: own icon if set, else the Glashaus icon */
    ghIcon(prefix = ''): string | undefined {
        const d = this.state.rxData as Record<string, unknown>;
        const own = d[attrName(prefix, 'iconCustom')];
        if (typeof own === 'string' && own) {
            return own;
        }
        const n = d[attrName(prefix, 'icon')];
        return typeof n === 'string' && n ? n : undefined;
    }

    /** Accent color of this widget (attributes `accent`/`color`, with a prefix e.g. `wbAccent`/`wbColor`) */
    ghAccent(prefix = '', def: GhAccent = 'fg'): string {
        const d = this.state.rxData as Record<string, unknown>;
        return accentColor(d[attrName(prefix, 'accent')], d[attrName(prefix, 'color')], def);
    }

    componentDidMount(): void {
        super.componentDidMount();
        if (this.state.rxData.ghTheme === 'system') {
            this.watchSystemTheme(true);
        }
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: any): void {
        super.componentDidUpdate(prevProps, prevState);
        const sys = this.state.rxData.ghTheme === 'system';
        if (sys !== !!this.ghMql) {
            this.watchSystemTheme(sys);
        }
    }

    componentWillUnmount(): void {
        this.watchSystemTheme(false);
        this.ghUnsubscribeAll();
        super.componentWillUnmount();
    }

    private onSystemTheme = (): void => this.forceUpdate();

    private watchSystemTheme(on: boolean): void {
        if (on && !this.ghMql) {
            this.ghMql = window.matchMedia('(prefers-color-scheme: dark)');
            this.ghMql.addEventListener('change', this.onSystemTheme);
        } else if (!on && this.ghMql) {
            this.ghMql.removeEventListener('change', this.onSystemTheme);
            this.ghMql = null;
        }
    }

    /** Resolved theme of this widget */
    ghDark(): boolean {
        const mode = this.state.rxData.ghTheme || 'vis';
        if (mode === 'dark') {
            return true;
        }
        if (mode === 'light') {
            return false;
        }
        if (mode === 'system') {
            return window.matchMedia?.('(prefers-color-scheme: dark)').matches;
        }
        return this.props.context?.themeType === 'dark';
    }

    /** Class names of the widget root: `gh`, dark tokens, glass card, fade-in */
    ghClass(extra = '', opts: { tile?: boolean } = {}): string {
        const d = this.state.rxData;
        const cls = ['gh'];
        if (this.ghDark()) {
            cls.push('gh-dark');
        }
        if (isTrue(d.ghGlass, true)) {
            cls.push('gh-glass');
        } else {
            cls.push('gh-plain');
        }
        if (opts.tile !== false) {
            cls.push('gh-tile');
        }
        if (isTrue(d.ghRise, true) && !this.props.editMode) {
            cls.push('gh-rise');
        }
        if (extra) {
            cls.push(extra);
        }
        return cls.join(' ');
    }

    /** Current language of vis-2 */
    ghLang(): ioBroker.Languages {
        return this.props.context?.lang || GlashausWidget.getLanguage();
    }

    /** Text attribute without the literal "undefined"/"null" that vis-2 leaves for a binding without value */
    static ghText(v: unknown): string {
        if (typeof v === 'number' || typeof v === 'boolean') {
            return String(v);
        }
        if (typeof v !== 'string') {
            return '';
        }
        return v === 'undefined' || v === 'null' ? '' : v;
    }

    /** Raw value of an object ID (subscribed automatically when the ID is an `id` attribute) */
    ghVal(id: unknown): any {
        if (!isOid(id)) {
            return undefined;
        }
        return this.state.values[`${id}.val`];
    }

    /** Numeric value of an object ID, or the demo value when no ID is configured */
    ghNum(id: unknown, demo: number | null = null): number | null {
        if (!isOid(id)) {
            return demo;
        }
        return toNum(this.ghVal(id));
    }

    /** Timestamp of the last change of an object ID */
    ghLc(id: unknown): number | undefined {
        return isOid(id) ? this.state.values[`${id}.lc`] : undefined;
    }

    /** Writes a value (ignored in the editor) */
    ghSet(id: unknown, value: ioBroker.StateValue): void {
        if (!isOid(id) || this.props.editMode) {
            return;
        }
        this.props.context.setValue(id, value);
    }

    /** History instance for reading charts: attribute `history`, else system default */
    ghHistoryInstance(): string {
        const own = (this.state.rxData as Record<string, unknown>).history;
        if (typeof own === 'string' && own) {
            return own;
        }
        return this.props.context?.systemConfig?.common?.defaultHistory || 'history.0';
    }

    /** Reads history values of one object ID; returns sorted points without null values */
    async ghHistory(id: string, o: HistoryOptions): Promise<HistoryPoint[]> {
        const end = o.end || Date.now();
        const options: Record<string, any> = {
            instance: o.instance || this.ghHistoryInstance(),
            start: o.start,
            end,
            aggregate: o.aggregate || 'average',
            from: false,
            ack: false,
            q: false,
            addId: false,
            ignoreNull: true,
        };
        if (o.step) {
            options.step = o.step;
        } else if (o.count) {
            options.count = o.count;
        }
        const res: any = await this.props.context.socket.getHistory(id, options as ioBroker.GetHistoryOptions);
        const rows: any[] = Array.isArray(res) ? res : res?.values || [];
        const pts: HistoryPoint[] = [];
        for (const r of rows) {
            const v = toNum(r?.val);
            if (v !== null && typeof r.ts === 'number') {
                pts.push({ ts: r.ts, val: v });
            }
        }
        pts.sort((a, b) => a.ts - b.ts);
        return pts;
    }

    /** Subscribes to IDs that vis-2 does not know about (e.g. IDs in a JSON attribute) */
    ghSubscribe(ids: string[], cb: (id: string, state: ioBroker.State | null | undefined) => void): void {
        const socket = this.props.context?.socket;
        if (!socket) {
            return;
        }
        ids.filter(isOid).forEach(id => {
            if (this.ghSubs.find(s => s.id === id)) {
                return;
            }
            const handler: ioBroker.StateChangeHandler = (sid, state) => cb(sid, state);
            this.ghSubs.push({ id, cb: handler });
            void socket.subscribeState(id, handler);
        });
    }

    /** Releases all subscriptions made with ghSubscribe() */
    ghUnsubscribeAll(): void {
        const socket = this.props.context?.socket;
        this.ghSubs.forEach(s => socket?.unsubscribeState(s.id, s.cb));
        this.ghSubs = [];
    }

    /** Shows "Demo" in the editor while no object ID is configured */
    ghDemoBadge(show: boolean): React.JSX.Element | null {
        if (!show || !this.props.editMode) {
            return null;
        }
        return <span className="gh-demo-badge">{GlashausWidget.tr('demo')}</span>;
    }

    /** Must be called first in renderWidgetBody of every widget */
    ghRenderStart(props: RxRenderWidgetProps): void {
        super.renderWidgetBody(props);
    }
}
