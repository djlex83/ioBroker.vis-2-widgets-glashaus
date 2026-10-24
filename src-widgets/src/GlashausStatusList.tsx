/* Status list ("Meldungen"): up to 20 rows, each with an object ID, a condition and a kind (ok/warn/crit/info/idle).
 * Mode "all rows": every row with value and pill. Mode "only active": a feed of the rows whose condition is true,
 * "All good" when there is none. Header with title and "3 open". Optional time since the last change. */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { GhIcon, GhIconBox, GhPill, type GhPillKind } from './core/components';
import { clamp, fmtDate, fmtNum, localeOf, toBool, toNum } from './core/format';
import { ICON_NAMES } from './core/icons';
import { ensureWidgetCss } from './core/style';

type Condition = 'true' | 'false' | '>' | '<' | '=' | '!=' | 'always';

interface StatusListRxData {
    title: string;
    icon: string;
    iconCustom: string;
    mode: 'all' | 'active';
    count: number | string;
    showTime: boolean | string;
    sort: boolean | string;
    showCount: boolean | string;
    [key: `oid${number}`]: string;
    [key: `label${number}`]: string;
    [key: `icon${number}`]: string;
    [key: `condition${number}`]: Condition;
    [key: `value${number}`]: string | number;
    [key: `kind${number}`]: GhPillKind;
    [key: `textTrue${number}`]: string;
    [key: `textFalse${number}`]: string;
    [key: `unit${number}`]: string;
}

interface StatusListState extends VisRxWidgetState {
    now: number;
}

interface Row {
    idx: number;
    name: string;
    icon?: string;
    active: boolean;
    kind: GhPillKind;
    /** Formatted value with unit ('' for booleans) */
    value: string;
    /** 0..100 for a small bar (unit %) */
    pct: number | null;
    /** Text of the feed (mode "only active") */
    msg: string;
    pill: { kind: GhPillKind; text: string };
    lc?: number;
    noData: boolean;
}

const KINDS: GhPillKind[] = ['crit', 'warn', 'info', 'ok', 'idle'];
const CONDITIONS: Condition[] = ['true', 'false', '>', '<', '=', '!=', 'always'];
const MAX_ROWS = 20;

const CSS = `
.gh.gh-sl{container:gh-sl/inline-size;padding:20px 20px 8px}
.gh.gh-sl.gh-sl-badge{padding-bottom:24px}
.gh-sl .gh-h{margin-bottom:6px;flex-wrap:nowrap}
.gh-sl-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-sl-list{list-style:none;margin:0 -4px 0 0;padding:0 4px 0 0;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;
  scrollbar-width:thin;scrollbar-color:var(--gh-track) transparent;
  -webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 14px),transparent);
  mask-image:linear-gradient(to bottom,#000 calc(100% - 14px),transparent)}
.gh-sl-li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:start;padding:11px 0;
  border-bottom:1px solid var(--gh-track);font-size:13.5px;line-height:1.35;--gh-c:var(--gh-fg-2)}
.gh-sl-li:last-child{border-bottom:0}
.gh-sl-li.k-ok{--gh-c:var(--gh-ok)}
.gh-sl-li.k-warn{--gh-c:var(--gh-warn)}
.gh-sl-li.k-crit{--gh-c:var(--gh-crit)}
.gh-sl-li.k-info{--gh-c:var(--gh-home)}
.gh-sl-li.k-idle{--gh-c:var(--gh-fg-3)}
.gh-sl-d{width:8px;height:8px;border-radius:50%;margin:6px 4px 0;background:var(--gh-c)}
.gh-sl-i{display:grid;place-items:center;width:16px;height:16px;margin-top:1px;color:var(--gh-c)}
.gh-sl-i svg,.gh-sl-i img{width:16px;height:16px}
.gh-sl-m{min-width:0;overflow-wrap:anywhere}
.gh-sl-time{font-size:12px;color:var(--gh-fg-3);font-variant-numeric:tabular-nums;white-space:nowrap;padding-top:1px}
.gh-sl-all .gh-sl-li{grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;padding:9px 0}
.gh-sl-all .gh-sl-d,.gh-sl-all .gh-sl-i{margin-top:0}
.gh-sl-nm{display:block;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-sl-sm{display:block;font-size:12px;color:var(--gh-fg-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-sl-bar{display:block;height:5px;margin-top:6px;border-radius:4px;background:var(--gh-track);overflow:hidden;max-width:180px}
.gh-sl-bar i{display:block;height:100%;border-radius:4px;background:var(--gh-c);transition:width .8s var(--gh-ease)}
.gh-sl-v{text-align:right;font-variant-numeric:tabular-nums;color:var(--gh-fg-2);white-space:nowrap;max-width:9em;
  overflow:hidden;text-overflow:ellipsis}
.gh-sl-li.on .gh-sl-v{color:var(--gh-c);font-weight:600}
.gh-sl-li.k-ok .gh-sl-v,.gh-sl-li.k-idle .gh-sl-v{color:var(--gh-fg-2);font-weight:400}
.gh-sl-off{opacity:.55}
.gh-sl-p{display:flex;justify-content:flex-end;min-width:0}
.gh-sl-p .gh-pill{max-width:12em;overflow:hidden}
.gh-sl-pt{min-width:0;overflow:hidden;text-overflow:ellipsis}
.gh-sl-p .gh-pill::before{flex:none}
.gh-sl-empty{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;font-size:13.5px;color:var(--gh-fg-2)}
@container gh-sl (max-width:300px){
  .gh-sl-all .gh-sl-li{grid-template-columns:auto minmax(0,1fr) auto}
  .gh-sl-all .gh-sl-p{display:none}
  .gh-sl-li{gap:10px}
  .gh-sl-time{display:none}
  .gh-sl-sm.gh-sl-tm{display:block}
}
@container gh-sl (min-width:301px){.gh-sl-sm.gh-sl-tm{display:none}}
@container gh-sl (min-width:520px){
  .gh-sl-li{font-size:14px;padding:12px 0}
  .gh-sl-all .gh-sl-li{padding:10px 0}
  .gh-sl-bar{max-width:260px}
}
`;

const rtfCache: Record<string, Intl.RelativeTimeFormat> = {};

/** "vor 5 Min." / "5 min ago" / "gestern" … */
function ago(ts: number, now: number, lang: string): string {
    const loc = localeOf(lang);
    const rtf = (rtfCache[loc] ||= new Intl.RelativeTimeFormat(loc, { numeric: 'auto', style: 'short' }));
    const s = Math.round((ts - now) / 1000);
    const a = Math.abs(s);
    if (a < 60) {
        return rtf.format(0, 'second');
    }
    if (a < 3600) {
        return rtf.format(Math.round(s / 60), 'minute');
    }
    if (a < 86400) {
        return rtf.format(Math.round(s / 3600), 'hour');
    }
    if (a < 7 * 86400) {
        return rtf.format(Math.round(s / 86400), 'day');
    }
    return fmtDate(ts, lang, { day: 'numeric', month: 'short' });
}

/** Primitive value as text; objects give '' */
function text(v: unknown): string {
    if (typeof v === 'string') {
        return v;
    }
    return typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
}

/** Is the condition of a row true for this value? */
function evaluate(cond: Condition, raw: unknown, cmp: unknown): boolean {
    switch (cond) {
        case 'always':
            return true;
        case 'true':
            return toBool(raw);
        case 'false':
            return !toBool(raw);
        case '>':
        case '<': {
            const a = toNum(raw);
            const b = toNum(cmp);
            if (a === null || b === null) {
                return false;
            }
            return cond === '>' ? a > b : a < b;
        }
        default: {
            const a = toNum(raw);
            const b = toNum(cmp);
            let eq: boolean;
            if (typeof raw === 'boolean') {
                eq = raw === toBool(cmp);
            } else if (a !== null && b !== null) {
                eq = a === b;
            } else {
                eq = text(raw).trim().toLowerCase() === text(cmp).trim().toLowerCase();
            }
            return cond === '=' ? eq : !eq;
        }
    }
}

/** Value for display: numbers with unit, texts as they are, booleans (also 'true' / 'false') not at all */
function fmtValue(raw: unknown, unit: string, lang: string): string {
    if (raw === undefined || raw === null || typeof raw === 'boolean' || raw === 'true' || raw === 'false') {
        return '';
    }
    const n =
        typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && /^\s*-?\d+([.,]\d+)?\s*$/.test(raw)
              ? toNum(raw)
              : null;
    if (n !== null) {
        const dec = Number.isInteger(n) ? 0 : Math.abs(n) >= 100 ? 0 : 1;
        return `${fmtNum(n, dec, lang)}${unit ? ` ${unit}` : ''}`;
    }
    const t = text(raw);
    return t ? `${t}${unit ? ` ${unit}` : ''}` : '';
}

const rank = (k: GhPillKind): number => KINDS.indexOf(k);

/** Icon of a row, or a colored dot */
function renderMark(r: Row): React.JSX.Element {
    if (r.icon) {
        return (
            <span
                className="gh-sl-i"
                aria-hidden="true"
            >
                <GhIcon name={r.icon} />
            </span>
        );
    }
    return (
        <span
            className="gh-sl-d"
            aria-hidden="true"
        />
    );
}

/** Fills %s in a text with the value */
const fillValue = (text: string, value: string): string => text.replace(/%s/g, value);

export default class GlashausStatusList extends GlashausWidget<StatusListRxData, StatusListState> {
    private tick: ReturnType<typeof setInterval> | undefined;

    /** Reference time of the demo rows */
    private demoBase = Date.now();

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('statuslist', CSS);
        this.state = { ...this.state, now: Date.now() };
    }

    static getWidgetInfo(): RxWidgetInfo {
        const kindOptions = KINDS.map(k => ({ value: k, label: `sl_kind_${k}` }));
        const condLabels: Record<Condition, string> = {
            true: 'sl_cond_true',
            false: 'sl_cond_false',
            '>': 'sl_cond_gt',
            '<': 'sl_cond_lt',
            '=': 'sl_cond_eq',
            '!=': 'sl_cond_ne',
            always: 'sl_cond_always',
        };
        return {
            id: 'tplGlashausStatusList',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Status list',
            visWidgetLabel: 'statuslist_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields('bell'),
                        {
                            name: 'mode',
                            label: 'sl_mode',
                            type: 'select',
                            options: [
                                { value: 'active', label: 'sl_mode_active' },
                                { value: 'all', label: 'sl_mode_all' },
                            ],
                            default: 'active',
                        },
                        { name: 'count', label: 'sl_count', type: 'number', min: 1, max: MAX_ROWS, default: 3 },
                        { name: 'showCount', label: 'sl_show_count', type: 'checkbox', default: true },
                        { name: 'sort', label: 'sl_sort', type: 'checkbox', default: true },
                        { name: 'showTime', label: 'sl_show_time', type: 'checkbox', default: true },
                    ],
                },
                {
                    name: 'rows',
                    label: 'group_sl_row',
                    indexFrom: 1,
                    indexTo: 'count',
                    fields: [
                        {
                            name: 'oid',
                            label: 'oid',
                            type: 'id',
                            onChange: async (field, data, changeData, socket, index) => {
                                const id = data[field.name!];
                                if (!isOid(id) || index === undefined) {
                                    return;
                                }
                                const obj = await socket.getObject(id);
                                const common = obj?.common as ioBroker.StateCommon | undefined;
                                if (!common) {
                                    return;
                                }
                                let changed = false;
                                if (!data[`label${index}`]) {
                                    const n = common.name;
                                    data[`label${index}`] =
                                        typeof n === 'object'
                                            ? n[GlashausWidget.getLanguage()] || n.en
                                            : n || id.split('.').pop();
                                    changed = true;
                                }
                                if (!data[`unit${index}`] && common.unit) {
                                    data[`unit${index}`] = common.unit;
                                    changed = true;
                                }
                                if (changed) {
                                    changeData(data);
                                }
                            },
                        },
                        { name: 'label', label: 'sl_label' },
                        {
                            name: 'icon',
                            label: 'icon',
                            type: 'select',
                            noTranslation: true,
                            options: [{ value: '', label: '–' }, ...ICON_NAMES.map(n => ({ value: n, label: n }))],
                            default: '',
                        },
                        {
                            name: 'condition',
                            label: 'sl_condition',
                            type: 'select',
                            options: CONDITIONS.map(c => ({ value: c, label: condLabels[c] })),
                            default: 'true',
                        },
                        {
                            name: 'value',
                            label: 'sl_value',
                            hidden: (data: WidgetData, index?: number) =>
                                !['>', '<', '=', '!='].includes(data[`condition${index}`]),
                        },
                        { name: 'kind', label: 'sl_kind', type: 'select', options: kindOptions, default: 'warn' },
                        { name: 'textTrue', label: 'sl_text_true', tooltip: 'sl_text_tip' },
                        {
                            name: 'textFalse',
                            label: 'sl_text_false',
                            tooltip: 'sl_text_tip',
                            hidden: (data: WidgetData) => data.mode !== 'all',
                        },
                        { name: 'unit', label: 'unit' },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 380, height: 320, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_statuslist.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausStatusList.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        document.addEventListener('visibilitychange', this.onVisibility);
        this.startTicker();
    }

    componentWillUnmount(): void {
        this.stopTicker();
        document.removeEventListener('visibilitychange', this.onVisibility);
        super.componentWillUnmount();
    }

    onRxDataChanged(prev: StatusListRxData): void {
        if (isTrue(prev.showTime, true) !== isTrue(this.state.rxData.showTime, true)) {
            this.startTicker();
        }
    }

    /* "5 min ago" has to move on: every 30 s, paused while the page is hidden or no time is shown */

    private startTicker(): void {
        this.stopTicker();
        if (!document.hidden && isTrue(this.state.rxData.showTime, true)) {
            this.tick = setInterval(() => this.setState({ now: Date.now() }), 30000);
        }
    }

    private stopTicker(): void {
        if (this.tick) {
            clearInterval(this.tick);
            this.tick = undefined;
        }
    }

    private onVisibility = (): void => {
        if (document.hidden) {
            this.stopTicker();
        } else {
            this.setState({ now: Date.now() });
            this.startTicker();
        }
    };

    private rowCount(): number {
        return clamp(Math.round(toNum(this.state.rxData.count) ?? 3), 0, MAX_ROWS);
    }

    private isDemo(): boolean {
        const d = this.state.rxData;
        for (let i = 1; i <= this.rowCount(); i++) {
            if (isOid(d[`oid${i}`]) || d[`label${i}`] || d[`textTrue${i}`]) {
                return false;
            }
        }
        return true;
    }

    private buildRows(): Row[] {
        const d = this.state.rxData;
        const lang = this.ghLang();
        const rows: Row[] = [];
        const tr = GlashausWidget.tr;
        for (let i = 1; i <= this.rowCount(); i++) {
            const oid = d[`oid${i}`];
            const cond: Condition = CONDITIONS.includes(d[`condition${i}`]) ? d[`condition${i}`] : 'true';
            const label: string = d[`label${i}`] || '';
            const textTrue: string = d[`textTrue${i}`] || '';
            const textFalse: string = d[`textFalse${i}`] || '';
            if (!isOid(oid) && !(cond === 'always' && (label || textTrue))) {
                continue;
            }
            const kind: GhPillKind = KINDS.includes(d[`kind${i}`]) ? d[`kind${i}`] : 'warn';
            const unit: string = d[`unit${i}`] || '';
            const raw = isOid(oid) ? this.ghVal(oid) : undefined;
            const noData = isOid(oid) && (raw === undefined || raw === null || Number.isNaN(raw));
            const active = !noData && evaluate(cond, raw, d[`value${i}`]);
            const value = fmtValue(raw, unit, lang);
            const num = typeof raw === 'boolean' ? null : toNum(raw);
            const name = label || (isOid(oid) ? oid.split('.').pop() || oid : textTrue);
            const status = active ? (textTrue ? fillValue(textTrue, value) : '') : '';
            let msg: string;
            if (status) {
                msg = label ? `${label}: ${status}` : status;
            } else {
                msg = value ? `${name}: ${value}` : name;
            }
            const icon: string | undefined = d[`icon${i}`] || undefined;
            let pill: Row['pill'];
            if (noData) {
                pill = { kind: 'idle', text: tr('sl_no_value') };
            } else if (active) {
                pill = { kind, text: status || tr(`sl_kind_${kind}`) };
            } else {
                pill = {
                    kind: kind === 'warn' || kind === 'crit' ? 'ok' : 'idle',
                    text: textFalse ? fillValue(textFalse, value) : tr('status_ok'),
                };
            }
            // a text value next to an own status text would say the same twice: show numbers only then
            const ownText = active ? !!textTrue : !!textFalse;
            rows.push({
                idx: i,
                name,
                icon,
                active,
                kind,
                value: num === null && ownText ? '' : value,
                pct: unit === '%' && num !== null ? clamp(num, 0, 100) : null,
                msg,
                pill,
                lc: isOid(oid) ? this.ghLc(oid) : undefined,
                noData,
            });
        }
        return rows;
    }

    /** Invented example rows, shown while nothing is configured */
    private demoRows(): Row[] {
        const tr = GlashausWidget.tr;
        const lang = this.ghLang();
        const t = this.demoBase;
        const batt = `${fmtNum(8, 0, lang)} %`;
        const mk = (r: Partial<Row> & Pick<Row, 'idx' | 'name' | 'kind' | 'active'>): Row => ({
            value: '',
            pct: null,
            msg: r.name,
            pill: { kind: r.kind, text: tr(`sl_kind_${r.kind}`) },
            noData: false,
            ...r,
        });
        return [
            mk({
                idx: 1,
                name: tr('sl_demo_window'),
                icon: 'window',
                kind: 'warn',
                active: true,
                msg: `${tr('sl_demo_window')}: ${tr('sl_demo_open')}`,
                pill: { kind: 'warn', text: tr('sl_demo_open') },
                lc: t - 25 * 60000,
            }),
            mk({
                idx: 2,
                name: tr('sl_demo_motion'),
                icon: 'motion',
                kind: 'crit',
                active: true,
                value: batt,
                pct: 8,
                msg: `${tr('sl_demo_motion')}: ${tr('sl_demo_battery', batt)}`,
                pill: { kind: 'crit', text: tr('sl_demo_low') },
                lc: t - 2 * 3600000,
            }),
            mk({
                idx: 3,
                name: tr('sl_demo_washer'),
                icon: 'washer',
                kind: 'info',
                active: true,
                msg: `${tr('sl_demo_washer')}: ${tr('sl_demo_done')}`,
                pill: { kind: 'info', text: tr('sl_demo_done') },
                lc: t - 12 * 60000,
            }),
            mk({
                idx: 4,
                name: tr('sl_demo_garage'),
                icon: 'garage',
                kind: 'warn',
                active: false,
                pill: { kind: 'ok', text: tr('sl_demo_closed') },
                lc: t - 26 * 3600000,
            }),
            mk({
                idx: 5,
                name: tr('sl_demo_heating'),
                icon: 'flame',
                kind: 'crit',
                active: false,
                value: '58 °C',
                pill: { kind: 'ok', text: tr('status_ok') },
                lc: t - 3 * 86400000,
            }),
        ];
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const lang = this.ghLang();
        const tr = GlashausWidget.tr;
        const demo = this.isDemo();
        const mode = d.mode === 'all' ? 'all' : 'active';
        const showTime = isTrue(d.showTime, true);
        // state.now only triggers the re-render every 30 s
        const now = Date.now();
        let rows = demo ? this.demoRows() : this.buildRows();
        if (isTrue(d.sort, true)) {
            rows = [...rows].sort(
                (a, b) => (a.active ? rank(a.kind) : 10) - (b.active ? rank(b.kind) : 10) || a.idx - b.idx,
            );
        }
        const activeRows = rows.filter(r => r.active);
        const open = activeRows.filter(r => r.kind === 'crit' || r.kind === 'warn').length;
        const worst: GhPillKind = activeRows.reduce<GhPillKind>((w, r) => (rank(r.kind) < rank(w) ? r.kind : w), 'ok');
        const worstColor =
            worst === 'crit'
                ? 'var(--gh-crit)'
                : worst === 'warn'
                  ? 'var(--gh-warn)'
                  : worst === 'info'
                    ? 'var(--gh-home)'
                    : 'var(--gh-ok)';
        const title = d.title || tr('sl_default_title');
        const shown = mode === 'all' ? rows : activeRows;
        const time = (r: Row): string => (showTime && r.lc ? ago(r.lc, now, lang) : '');

        let headPill: React.JSX.Element | null = null;
        if (isTrue(d.showCount, true)) {
            if (open) {
                headPill = (
                    <GhPill kind={worst === 'crit' ? 'crit' : 'warn'}>{tr('sl_open', fmtNum(open, 0, lang))}</GhPill>
                );
            } else if (mode === 'all' && rows.length) {
                headPill = <GhPill kind="ok">{tr('sl_all_ok_short')}</GhPill>;
            }
        }

        return (
            <div className={this.ghClass(`gh-sl gh-sl-${mode}${demo && this.props.editMode ? ' gh-sl-badge' : ''}`)}>
                <div className="gh-h">
                    <h2 className="gh-title">
                        <GhIconBox
                            name={this.ghIcon()}
                            color={worstColor}
                        />
                        <span className="gh-sl-t">{title}</span>
                    </h2>
                    {headPill}
                </div>
                <ul
                    className="gh-sl-list"
                    aria-label={title}
                >
                    {mode === 'active' && !shown.length ? (
                        <li className="gh-sl-empty">
                            <span>{tr('sl_all_good')}</span>
                            <GhPill kind="ok">{tr('status_ok')}</GhPill>
                        </li>
                    ) : null}
                    {mode === 'active'
                        ? shown.map(r => (
                              <li
                                  key={r.idx}
                                  className={`gh-sl-li k-${r.kind}`}
                              >
                                  {renderMark(r)}
                                  <span className="gh-sl-m">
                                      {r.msg}
                                      {time(r) ? <span className="gh-sl-sm gh-sl-tm">{time(r)}</span> : null}
                                  </span>
                                  <time
                                      className="gh-sl-time"
                                      dateTime={r.lc ? new Date(r.lc).toISOString() : undefined}
                                  >
                                      {time(r)}
                                  </time>
                              </li>
                          ))
                        : shown.map(r => {
                              const k: GhPillKind = r.active ? r.kind : r.noData ? 'idle' : r.pill.kind;
                              return (
                                  <li
                                      key={r.idx}
                                      className={`gh-sl-li k-${k}${r.active ? ' on' : ''}${r.noData ? ' gh-sl-off' : ''}`}
                                  >
                                      {renderMark(r)}
                                      <span style={{ minWidth: 0 }}>
                                          <span className="gh-sl-nm">{r.name}</span>
                                          {time(r) ? <span className="gh-sl-sm">{time(r)}</span> : null}
                                          {r.pct !== null ? (
                                              <span className="gh-sl-bar">
                                                  <i style={{ width: `${r.pct}%` }} />
                                              </span>
                                          ) : null}
                                      </span>
                                      <span className="gh-sl-v">{r.noData ? '–' : r.value}</span>
                                      <span className="gh-sl-p">
                                          <GhPill
                                              kind={r.pill.kind}
                                              live={r.active && r.kind === 'crit'}
                                          >
                                              <span className="gh-sl-pt">{r.pill.text}</span>
                                          </GhPill>
                                      </span>
                                  </li>
                              );
                          })}
                </ul>
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}
