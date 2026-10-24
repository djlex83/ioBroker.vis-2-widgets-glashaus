/* Year skyline: daily values of the last 12 months (or several years as stripes) as a heatmap that rises
 * into an isometric 3D skyline. Hover shows the day, statistics in the corners or in a row below,
 * +/− compares earlier years, 2D/3D toggle. Data from the history of one object ID (one request per year,
 * step 1 day, several modes), from a JSON object ID, or invented demo values. */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { GhIconBox } from './core/components';
import { clamp, fmtNum, localeOf, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';
import {
    DAY,
    MAX_YEARS,
    aggregateDays,
    aggregateOf,
    buildModel,
    demoValues,
    firstDay,
    gridStart,
    localMidnight,
    parseJsonDays,
    stripEnd,
    today,
    type SkyCell,
    type SkyMode,
    type SkyModel,
    type SkyStats,
} from './skyline/data';
import { SkylineEngine, type SkyView } from './skyline/engine';

interface SkylineRxData {
    title: string;
    icon: string;
    iconCustom: string;
    accent: string;
    color: string;
    label: string;
    unit: string;
    decimals: number | string;
    view: SkyView;
    viewToggle: boolean | string;
    years: number | string;
    yearButtons: boolean | string;
    weekStart: '1' | '0';
    animate: boolean | string;
    oid: string;
    history: string;
    mode: SkyMode;
    factor: number | string;
    jsonOid: string;
    stats: 'auto' | 'row' | 'none';
    total: 'auto' | 'sum' | 'mean';
    totalLabel: string;
    streak: 'none' | 'above' | 'below';
    streakValue: number | string;
    streakLabel: string;
    legend: boolean | string;
}

interface SkylineState extends VisRxWidgetState {
    /** Size of the widget root (px) */
    rw: number;
    rh: number;
    /** Number of years chosen with +/− (null: attribute `years`) */
    shownYears: number | null;
    /** View chosen with the toggle (null: attribute `view`) */
    shownView: SkyView | null;
    /** Colors of the five levels, from the engine */
    swatches: string[];
    /** Changes whenever history data arrived */
    histVer: number;
    legendLevel: number;
    /** Size key at which the corner statistics did not fit next to the skyline (row instead) */
    cornersOff: string;
}

interface StatBlock {
    label: string;
    value: string;
    unit: string;
    sub: string;
}

interface HistCache {
    key: string;
    years: Map<number, Map<number, number>>;
    pending: Set<number>;
    meterBase: number | null;
    /** Years that have data (an empty older year limits +) */
    max: number;
    ver: number;
    error: boolean;
}

/** Smallest scale of the 3D skyline that is accepted to keep the corner statistics free (else: row) */
const MIN_FIT = 0.8;
const SUM_MODES: SkyMode[] = ['counter', 'meter', 'power', 'sum'];
const MODES: SkyMode[] = ['counter', 'meter', 'power', 'sum', 'average', 'max', 'min'];

const ICON_GRID = (
    <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden="true"
    >
        <rect
            x="1.5"
            y="1.5"
            width="5.5"
            height="5.5"
            rx="1"
            fill="currentColor"
        />
        <rect
            x="9"
            y="1.5"
            width="5.5"
            height="5.5"
            rx="1"
            fill="currentColor"
        />
        <rect
            x="1.5"
            y="9"
            width="5.5"
            height="5.5"
            rx="1"
            fill="currentColor"
        />
        <rect
            x="9"
            y="9"
            width="5.5"
            height="5.5"
            rx="1"
            fill="currentColor"
        />
    </svg>
);

const ICON_CUBE = (
    <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden="true"
    >
        <path
            d="M8 1.2 14.2 4.6v6.8L8 14.8 1.8 11.4V4.6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
        />
        <path
            d="M1.8 4.6 8 8l6.2-3.4M8 8v6.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
        />
    </svg>
);

const SKY_CSS = `
.gh-sky .gh-h{flex-wrap:wrap;margin-bottom:14px;row-gap:10px;flex:none}
.gh-sky .gh-title{flex:1 1 220px;font-weight:450}
.gh-sky-tt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-sky-tt b{font-weight:600;font-variant-numeric:tabular-nums}
.gh-sky-tt.gh-sky-own{font-weight:550}
.gh-sky-ctl{display:flex;align-items:center;gap:10px;flex:none;margin-left:auto}
.gh-sky-years{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--gh-fg-2);font-variant-numeric:tabular-nums}
.gh-sky-years .gh-circ{position:relative;width:30px;height:30px;font-size:17px;line-height:1}
.gh-sky-years .gh-circ:disabled{opacity:.3;cursor:default;background:transparent;color:inherit}
.gh-sky-years>span{min-width:54px;text-align:center;white-space:nowrap}
.gh-sky-toggle{position:relative;display:inline-flex;padding:3px;border-radius:10px;background:var(--gh-track)}
.gh-sky-knob{position:absolute;top:3px;bottom:3px;left:3px;width:34px;border-radius:8px;background:var(--gh-fg);transition:transform .5s cubic-bezier(.65,0,.35,1)}
.gh-sky[data-view="3d"] .gh-sky-knob{transform:translateX(100%)}
.gh-sky-years .gh-circ::after,.gh-sky-toggle button::after,.gh-sky-legend button::after{content:'';position:absolute;inset:-7px}
.gh-sky-toggle button::after{inset:-7px 0}
.gh-sky-legend button::after{inset:-10px -3px}
.gh-sky-toggle button{position:relative;z-index:1;width:34px;height:30px;border:0;padding:0;background:transparent;display:grid;place-items:center;color:var(--gh-fg-2);cursor:pointer;transition:color .5s}
.gh-sky-toggle button[aria-pressed="true"]{color:var(--gh-bg)}
.gh-sky-cmp{display:flex;flex-wrap:wrap;gap:4px 18px;margin:-4px 2px 12px;font-size:13px;color:var(--gh-fg-2);font-variant-numeric:tabular-nums;flex:none}
.gh-sky-cmp b{color:var(--gh-fg);font-weight:550;margin-right:4px}
.gh-sky-cmp em{font-style:normal;margin-left:4px}
.gh-sky-cmp em.up{color:var(--gh-sky-acc,var(--gh-ok))}
.gh-sky-frame{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;border-radius:20px;background:color-mix(in srgb,var(--gh-bg) 50%,transparent);box-shadow:inset 0 0 0 1px var(--gh-track)}
.gh-sky-pad{position:relative;flex:1 1 auto;min-height:0;padding:16px 16px 0;--gh-sky-p:16px}
.gh-sky-stage{position:relative;width:100%;height:100%;overflow:hidden;border-radius:12px}
.gh-sky-stage:has(canvas:focus-visible){outline:2px solid var(--gh-fg);outline-offset:4px}
.gh-sky-stage canvas{position:absolute;top:0;left:0;display:block;max-width:none;outline:none}
.gh-sky-empty{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;text-align:center;padding:0 12px}
.gh-sky-empty span{padding:7px 14px;border-radius:99px;font-size:13px;color:var(--gh-fg-2);background:color-mix(in srgb,var(--gh-bg) 88%,transparent);box-shadow:inset 0 0 0 1px var(--gh-track)}
.gh-sky-corner{position:absolute;display:flex;flex-direction:column;gap:18px;pointer-events:none;opacity:0;max-width:46%;transition:opacity .3s cubic-bezier(.65,0,.35,1),transform .3s cubic-bezier(.65,0,.35,1)}
.gh-sky-tr{top:4px;right:4px;align-items:flex-end;transform:translateY(-10px)}
.gh-sky-bl{bottom:4px;left:4px;align-items:flex-start;transform:translateY(10px)}
.gh-sky[data-corners="1"] .gh-sky-corner{opacity:1;transform:none;transition-duration:.6s}
.gh-sky[data-corners="1"] .gh-sky-tr{transition-delay:.75s}
.gh-sky[data-corners="1"] .gh-sky-bl{transition-delay:.9s}
.gh-sky-l{font-size:13px;color:var(--gh-fg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.gh-sky-vv{display:flex;align-items:flex-end;gap:8px;min-width:0;max-width:100%}
.gh-sky-vv b{font-size:var(--gh-sky-big,48px);line-height:.95;font-weight:600;letter-spacing:-.035em;color:var(--gh-sky-acc,var(--gh-fg));font-variant-numeric:tabular-nums;transition:color .5s;white-space:nowrap}
.gh-sky-vv>span{display:flex;flex-direction:column;padding-bottom:.12em;line-height:1.25;min-width:0}
.gh-sky-vv em{font-style:normal;font-size:15px;white-space:nowrap}
.gh-sky-vv small{font-size:12.5px;color:var(--gh-fg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-sky-stat{min-width:0;max-width:100%}
.gh-sky-stat.end{text-align:right}
.gh-sky-stat.end .gh-sky-vv{justify-content:flex-end}
.gh-sky-rowwrap{display:grid;grid-template-rows:0fr;opacity:0;flex:none;transition:grid-template-rows 1.4s cubic-bezier(.65,0,.35,1),opacity 1.4s cubic-bezier(.65,0,.35,1)}
.gh-sky-rowwrap[data-show="1"]{grid-template-rows:1fr;opacity:1}
.gh-sky-row{min-height:0;overflow:hidden}
.gh-sky-row-in{display:grid;grid-template-columns:repeat(var(--gh-sky-cols,4),minmax(0,1fr));gap:12px 16px;padding:14px 16px 2px}
.gh-sky-rv{display:flex;align-items:baseline;gap:5px;min-width:0;margin-top:2px}
.gh-sky-rv b{font-size:var(--gh-sky-rowbig,28px);line-height:1.05;font-weight:600;letter-spacing:-.03em;color:var(--gh-sky-acc,var(--gh-fg));font-variant-numeric:tabular-nums;white-space:nowrap}
.gh-sky-rv em{font-style:normal;font-size:13.5px;white-space:nowrap}
.gh-sky-stat.row small{display:block;font-size:12px;line-height:1.35;color:var(--gh-fg-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-sky-tip{position:absolute;top:var(--gh-sky-p);left:var(--gh-sky-p);z-index:5;pointer-events:none;white-space:nowrap;padding:8px 10px;border-radius:8px;font-size:12px;line-height:1;background:var(--gh-fg);color:var(--gh-bg);opacity:0;transition:opacity .15s;box-shadow:0 10px 24px -8px var(--gh-shadow)}
.gh-sky-tip strong{font-weight:600}
.gh-sky-tip i{position:absolute;top:100%;left:var(--gh-sky-arrow,50%);margin-left:-5px;border:5px solid transparent;border-top-color:var(--gh-fg)}
.gh-sky-tip[data-below="1"] i{top:auto;bottom:100%;border-top-color:transparent;border-bottom-color:var(--gh-fg)}
.gh-sky-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 16px;padding:10px 16px 12px;font-size:12px;color:var(--gh-fg-2);flex:none}
.gh-sky-hint{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-sky-legend{display:flex;align-items:center;gap:6px;margin-left:auto}
.gh-sky-legend button{position:relative;width:11px;height:11px;border-radius:3px;border:0;padding:0;cursor:pointer;background:var(--gh-track);transition:transform .3s,background-color .5s;box-shadow:inset 0 0 0 1px rgba(127,127,127,.15)}
.gh-sky-legend button:hover,.gh-sky-legend button[aria-pressed="true"]{transform:scale(1.3)}
.gh-sky-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);margin:0}
.gh-sky.gh-sky-xs{padding:14px}
.gh-sky.gh-sky-xs .gh-h{margin-bottom:8px;row-gap:6px}
.gh-sky.gh-sky-xs .gh-title{font-size:13.5px;gap:8px;flex-basis:120px}
.gh-sky.gh-sky-xs .gh-ico{width:28px;height:28px;border-radius:9px}
.gh-sky.gh-sky-xs .gh-ico svg{width:16px;height:16px}
.gh-sky.gh-sky-xs .gh-sky-frame{border-radius:14px}
.gh-sky.gh-sky-xs .gh-sky-pad{padding:8px 8px 8px;--gh-sky-p:8px}
.gh-sky.gh-sky-xs .gh-sky-ctl{gap:6px}
.gh-sky.gh-sky-xs .gh-sky-years .gh-circ{width:26px;height:26px;font-size:15px}
.gh-sky.gh-sky-xs .gh-sky-years>span{min-width:0}
.gh-sky.gh-sky-xs .gh-sky-toggle button{width:28px;height:26px}
.gh-sky.gh-sky-xs .gh-sky-knob{width:28px}
.gh-sky.gh-sky-nofoot .gh-sky-pad{padding-bottom:var(--gh-sky-p)}
`;

/** Number of 12-month stripes that a data set starting at `first` can fill */
function spanYears(first: number | null, endDay: number): number {
    if (first === null) {
        return 1;
    }
    return clamp(Math.ceil((endDay - first) / (365.25 * DAY) - 0.02), 1, MAX_YEARS);
}

export default class GlashausSkyline extends GlashausWidget<SkylineRxData, SkylineState> {
    private rootRef = React.createRef<HTMLDivElement>();

    private stageRef = React.createRef<HTMLDivElement>();

    private canvasRef = React.createRef<HTMLCanvasElement>();

    private tipRef = React.createRef<HTMLDivElement>();

    private srRef = React.createRef<HTMLParagraphElement>();

    private trRef = React.createRef<HTMLDivElement>();

    private blRef = React.createRef<HTMLDivElement>();

    /** Corner statistics shown in the last render, and the size key of that render */
    private cornersShown = false;

    private sizeKey = '';

    private fitTimer: ReturnType<typeof setTimeout> | undefined;

    private viewChangedAt = 0;

    private engine: SkylineEngine | null = null;

    private engineCanvas: HTMLCanvasElement | null = null;

    private ro: ResizeObserver | null = null;

    private roRaf = 0;

    private obsRoot: HTMLElement | null = null;

    private alive = false;

    private hist: HistCache = GlashausSkyline.emptyHist('');

    private histTimer: ReturnType<typeof setInterval> | undefined;

    private jsonCache: { raw: unknown; factor: number; map: Map<number, number> | null; ver: number } = {
        raw: undefined,
        factor: 1,
        map: null,
        ver: 0,
    };

    private memo: { key: string; model: SkyModel; maxYears: number } | null = null;

    /** Model handed to the engine last */
    private shownModel: SkyModel | null = null;

    private themeKey = '';

    private viewKey = '';

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('skyline', SKY_CSS);
        this.state = {
            ...this.state,
            rw: 0,
            rh: 0,
            shownYears: null,
            shownView: null,
            swatches: [],
            histVer: 0,
            legendLevel: -1,
            cornersOff: '',
        };
    }

    static emptyHist(key: string): HistCache {
        return { key, years: new Map(), pending: new Set(), meterBase: null, max: MAX_YEARS, ver: 0, error: false };
    }

    static getWidgetInfo(): RxWidgetInfo {
        const hasJson = (data: WidgetData): boolean => isOid(data.jsonOid);
        return {
            id: 'tplGlashausSkyline',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Skyline',
            visWidgetLabel: 'skyline_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'title', label: 'title', tooltip: 'sky_title_tip' },
                        ...GlashausWidget.iconFields(''),
                        ...GlashausWidget.accentFields('', 'sun'),
                        { name: 'label', label: 'sky_label', tooltip: 'sky_label_tip' },
                        { name: 'unit', label: 'unit' },
                        { name: 'decimals', label: 'decimals', type: 'number', min: 0, max: 3, default: 1 },
                        {
                            name: 'view',
                            label: 'sky_view',
                            type: 'select',
                            options: [
                                { value: '3d', label: 'sky_view_3d' },
                                { value: '2d', label: 'sky_view_2d' },
                            ],
                            default: '3d',
                        },
                        { name: 'viewToggle', label: 'sky_view_toggle', type: 'checkbox', default: true },
                        { name: 'years', label: 'sky_years', type: 'slider', min: 1, max: MAX_YEARS, default: 1 },
                        { name: 'yearButtons', label: 'sky_year_buttons', type: 'checkbox', default: true },
                        {
                            name: 'weekStart',
                            label: 'sky_week_start',
                            type: 'select',
                            options: [
                                { value: '1', label: 'sky_monday' },
                                { value: '0', label: 'sky_sunday' },
                            ],
                            default: '1',
                        },
                        { name: 'animate', label: 'sky_animate', type: 'checkbox', default: true },
                    ],
                },
                {
                    name: 'skyData',
                    label: 'sky_group_data',
                    fields: [
                        {
                            name: 'oid',
                            label: 'sky_oid',
                            type: 'id',
                            tooltip: 'sky_oid_tip',
                            onChange: async (field, data, changeData, socket) => {
                                const id = data[field.name!];
                                if (!isOid(id)) {
                                    return;
                                }
                                const obj = await socket.getObject(id);
                                const common = obj?.common as ioBroker.StateCommon | undefined;
                                if (!common) {
                                    return;
                                }
                                let changed = false;
                                if (!data.label) {
                                    const n = common.name;
                                    data.label =
                                        typeof n === 'object'
                                            ? n[GlashausWidget.getLanguage()] || n.en
                                            : n || id.split('.').pop();
                                    changed = true;
                                }
                                if (!data.unit && common.unit) {
                                    const u = common.unit.trim();
                                    if (u === 'W') {
                                        data.unit = 'kWh';
                                        data.mode = 'power';
                                    } else if (u === 'Wh' && (toNum(data.factor) ?? 1) === 1) {
                                        data.unit = 'kWh';
                                        data.factor = 0.001;
                                    } else {
                                        data.unit = u;
                                        if (/°|%/.test(u)) {
                                            data.mode = 'average';
                                        }
                                    }
                                    changed = true;
                                }
                                if (changed) {
                                    changeData(data);
                                }
                            },
                            hidden: hasJson,
                        },
                        {
                            name: 'history',
                            label: 'history',
                            type: 'instance',
                            adapter: '_dataSources',
                            hidden: hasJson,
                        },
                        {
                            name: 'mode',
                            label: 'sky_mode',
                            type: 'select',
                            tooltip: 'sky_mode_tip',
                            options: MODES.map(m => ({ value: m, label: `sky_mode_${m}` })),
                            default: 'counter',
                            hidden: hasJson,
                        },
                        { name: 'factor', label: 'sky_factor', type: 'number', default: 1, tooltip: 'sky_factor_tip' },
                        { name: 'jsonOid', label: 'sky_json_oid', type: 'id', tooltip: 'sky_json_tip' },
                    ],
                },
                {
                    name: 'skyStats',
                    label: 'sky_group_stats',
                    fields: [
                        {
                            name: 'stats',
                            label: 'sky_stats',
                            type: 'select',
                            options: [
                                { value: 'auto', label: 'sky_stats_auto' },
                                { value: 'row', label: 'sky_stats_row' },
                                { value: 'none', label: 'sky_stats_none' },
                            ],
                            default: 'auto',
                        },
                        {
                            name: 'total',
                            label: 'sky_total_kind',
                            type: 'select',
                            options: [
                                { value: 'auto', label: 'sky_total_auto' },
                                { value: 'sum', label: 'sky_total_sum' },
                                { value: 'mean', label: 'sky_total_mean' },
                            ],
                            default: 'auto',
                        },
                        { name: 'totalLabel', label: 'sky_total_label', tooltip: 'sky_total_label_tip' },
                        {
                            name: 'streak',
                            label: 'sky_streak',
                            type: 'select',
                            tooltip: 'sky_streak_tip',
                            options: [
                                { value: 'none', label: 'sky_streak_none' },
                                { value: 'above', label: 'sky_streak_above' },
                                { value: 'below', label: 'sky_streak_below' },
                            ],
                            default: 'none',
                        },
                        {
                            name: 'streakValue',
                            label: 'sky_streak_value',
                            type: 'number',
                            hidden: (data: WidgetData) => !data.streak || data.streak === 'none',
                        },
                        {
                            name: 'streakLabel',
                            label: 'sky_streak_label',
                            tooltip: 'sky_streak_label_tip',
                            hidden: (data: WidgetData) => !data.streak || data.streak === 'none',
                        },
                        { name: 'legend', label: 'sky_legend', type: 'checkbox', default: true },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 900, height: 500, position: 'absolute' },
            visDefaultGrid: { columns: 'full', rows: 9 },
            visPrev: `widgets/${ADAPTER}/img/prev_skyline.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausSkyline.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.alive = true;
        this.syncHistory();
        this.attach();
        void document.fonts?.ready.then(() => {
            if (this.alive) {
                this.engine?.retheme();
                this.measure();
                this.syncKeepOut();
            }
        });
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: SkylineState): void {
        super.componentDidUpdate(prevProps, prevState);
        if (prevState.shownYears !== this.state.shownYears) {
            this.syncHistory();
        }
        this.attach();
    }

    onRxDataChanged(prevRxData: typeof this.state.rxData): void {
        const d = this.state.rxData;
        if (prevRxData.years !== d.years) {
            this.setState({ shownYears: null });
        }
        if (prevRxData.view !== d.view) {
            this.setState({ shownView: null });
        }
        this.syncHistory();
    }

    componentWillUnmount(): void {
        this.alive = false;
        this.engine?.destroy();
        this.engine = null;
        this.engineCanvas = null;
        this.ro?.disconnect();
        this.ro = null;
        cancelAnimationFrame(this.roRaf);
        if (this.histTimer) {
            clearInterval(this.histTimer);
            this.histTimer = undefined;
        }
        if (this.fitTimer) {
            clearTimeout(this.fitTimer);
            this.fitTimer = undefined;
        }
        super.componentWillUnmount();
    }

    /* ---------- data ---------- */

    private source(): 'demo' | 'json' | 'history' {
        const d = this.state.rxData;
        if (isOid(d.jsonOid)) {
            return 'json';
        }
        return isOid(d.oid) ? 'history' : 'demo';
    }

    private mode(): SkyMode {
        const m = this.state.rxData.mode;
        return MODES.includes(m) ? m : 'counter';
    }

    private factor(): number {
        const f = toNum(this.state.rxData.factor);
        return f === null || f === 0 ? 1 : f;
    }

    private weekStart(): number {
        return String(this.state.rxData.weekStart) === '0' ? 0 : 1;
    }

    /** Years wanted by attribute or buttons (before limiting to the available data) */
    private wantedYears(): number {
        const s = this.state.shownYears;
        const a = toNum(this.state.rxData.years) ?? 1;
        return clamp(Math.round(s ?? a), 1, MAX_YEARS);
    }

    /** Loads the stripes of the history that are not there yet; resets everything when the source changed */
    private syncHistory(): void {
        const d = this.state.rxData;
        if (this.source() !== 'history') {
            if (this.hist.key) {
                this.hist = GlashausSkyline.emptyHist('');
            }
            if (this.histTimer) {
                clearInterval(this.histTimer);
                this.histTimer = undefined;
            }
            return;
        }
        const key = `${d.oid}|${this.ghHistoryInstance()}|${this.mode()}|${this.factor()}|${this.weekStart()}`;
        if (key !== this.hist.key) {
            this.hist = GlashausSkyline.emptyHist(key);
            if (this.histTimer) {
                clearInterval(this.histTimer);
            }
            // the current year is re-read every 15 minutes (today grows), older years stay
            this.histTimer = setInterval(() => this.fetchYear(0), 15 * 60000);
        }
        const n = Math.min(this.wantedYears(), this.hist.max);
        for (let k = 0; k < n; k++) {
            if (!this.hist.years.has(k) && !this.hist.pending.has(k)) {
                this.fetchYear(k);
            }
        }
    }

    /** One request per year: daily aggregates of stripe k (k = 0: the last 12 months) */
    private fetchYear(k: number): void {
        const h = this.hist;
        const d = this.state.rxData;
        if (!isOid(d.oid) || h.pending.has(k)) {
            return;
        }
        h.pending.add(k);
        const endDay = today();
        const se = stripEnd(endDay, k);
        const gs = gridStart(se, this.weekStart());
        // one day more in front: the meter mode needs the reading of the day before
        const start = localMidnight(gs - DAY);
        const end = k === 0 ? Date.now() : localMidnight(se + DAY) - 1;
        const mode = this.mode();
        const factor = this.factor();
        const oid = d.oid;
        this.ghHistory(oid, { start, end, aggregate: aggregateOf(mode), step: DAY })
            .then(pts => {
                if (!this.alive || this.hist !== h) {
                    return;
                }
                const agg = aggregateDays(pts, start, mode, factor, endDay);
                h.years.set(k, agg.map);
                if (k === 0) {
                    h.meterBase = agg.meterBase;
                    h.error = false;
                } else if (!agg.map.size) {
                    h.max = Math.min(h.max, k);
                }
                h.ver++;
                this.setState({ histVer: h.ver });
            })
            .catch((e: unknown) => {
                console.warn(`[Glashaus] Cannot read history of ${oid}: ${String(e)}`);
                if (!this.alive || this.hist !== h) {
                    return;
                }
                if (!h.years.has(k)) {
                    h.years.set(k, new Map());
                }
                if (k === 0) {
                    h.error = true;
                }
                h.ver++;
                this.setState({ histVer: h.ver });
            })
            .finally(() => h.pending.delete(k));
    }

    /** Daily values of the source, without today's live value */
    private baseValues(): { map: Map<number, number>; ver: string; maxYears: number; loading: boolean } {
        const endDay = today();
        const src = this.source();
        if (src === 'demo') {
            const map = demoValues(endDay);
            return { map, ver: `demo|${endDay}`, maxYears: spanYears(firstDay(map), endDay), loading: false };
        }
        if (src === 'json') {
            const raw: unknown = this.ghVal(this.state.rxData.jsonOid);
            const factor = this.factor();
            const jc = this.jsonCache;
            if (raw !== jc.raw || factor !== jc.factor) {
                jc.raw = raw;
                jc.factor = factor;
                jc.map = parseJsonDays(raw, factor);
                jc.ver++;
            }
            const map = jc.map || new Map<number, number>();
            return {
                map,
                ver: `json|${jc.ver}`,
                maxYears: spanYears(firstDay(map), endDay),
                loading: raw === undefined,
            };
        }
        const h = this.hist;
        const map = new Map<number, number>();
        // older stripes first, so that the newer data wins where stripes overlap
        [...h.years.keys()].sort((a, b) => b - a).forEach(k => h.years.get(k)!.forEach((v, day) => map.set(day, v)));
        return { map, ver: `hist|${h.key}|${h.ver}`, maxYears: h.max, loading: !h.years.has(0) };
    }

    /** Today's value from the live state (counter and meter modes) */
    private liveToday(): number | null {
        const d = this.state.rxData;
        if (this.source() !== 'history') {
            return null;
        }
        const mode = this.mode();
        const v = toNum(this.ghVal(d.oid));
        if (v === null) {
            return null;
        }
        if (mode === 'counter') {
            // a value that did not change since yesterday is yesterday's total (no reset yet)
            const lc = this.ghLc(d.oid);
            if (typeof lc === 'number' && lc < localMidnight(today())) {
                return null;
            }
            return v * this.factor();
        }
        if (mode === 'meter' && this.hist.meterBase !== null) {
            const x = v - this.hist.meterBase;
            return x >= 0 ? x * this.factor() : null;
        }
        return null;
    }

    private streakTest(): { test: ((v: number) => boolean) | null; label: string } {
        const d = this.state.rxData;
        const lim = toNum(d.streakValue);
        if ((d.streak !== 'above' && d.streak !== 'below') || lim === null) {
            return { test: null, label: '' };
        }
        const above = d.streak === 'above';
        const label =
            GlashausWidget.ghText(d.streakLabel) ||
            `${above ? '≥' : '<'} ${fmtNum(lim, Math.min(3, this.decimals()), this.ghLang())} ${this.unit()}`.trim();
        return { test: above ? (v: number) => v >= lim : (v: number) => v < lim, label };
    }

    private decimals(): number {
        return clamp(Math.round(toNum(this.state.rxData.decimals) ?? 1), 0, 3);
    }

    private unit(): string {
        return GlashausWidget.ghText(this.state.rxData.unit) || (this.source() === 'demo' ? 'kWh' : '');
    }

    /** Model of the grid (memoized: rebuilt only when data, years or settings changed) */
    private getModel(): { model: SkyModel; maxYears: number; loading: boolean } {
        const base = this.baseValues();
        const live = this.liveToday();
        const n = Math.min(this.wantedYears(), base.maxYears);
        const streak = this.streakTest();
        const d = this.state.rxData;
        const locale = localeOf(this.ghLang());
        const key = `${base.ver}|${live}|${n}|${this.weekStart()}|${locale}|${d.streak}|${d.streakValue}|${today()}`;
        if (!this.memo || this.memo.key !== key) {
            let map = base.map;
            if (live !== null) {
                map = new Map(map);
                map.set(today(), live);
            }
            const model = buildModel(map, {
                endDay: today(),
                years: n,
                weekStart: this.weekStart(),
                locale,
                streak: streak.test,
            });
            this.memo = { key, model, maxYears: base.maxYears };
        }
        return { model: this.memo.model, maxYears: base.maxYears, loading: base.loading };
    }

    /* ---------- engine ---------- */

    private view(): SkyView {
        const v = this.state.shownView || this.state.rxData.view;
        return v === '2d' ? '2d' : '3d';
    }

    /** Creates the engine when the canvas appeared (or was replaced) and hands over model, view and theme */
    private attach(): void {
        const root = this.rootRef.current;
        if (root && root !== this.obsRoot) {
            this.ro?.disconnect();
            this.obsRoot = root;
            if (typeof ResizeObserver !== 'undefined') {
                this.ro = new ResizeObserver(() => {
                    cancelAnimationFrame(this.roRaf);
                    this.roRaf = requestAnimationFrame(this.measure);
                });
                this.ro.observe(root);
            }
            this.measure();
        }
        const cv = this.canvasRef.current;
        const stage = this.stageRef.current;
        const tip = this.tipRef.current;
        if (cv && stage && tip && root && cv !== this.engineCanvas) {
            this.engine?.destroy();
            this.engine = new SkylineEngine(
                { root, stage, canvas: cv, tip, sr: this.srRef.current },
                {
                    view: this.view(),
                    rise: isTrue(this.state.rxData.animate, true) && !this.props.editMode,
                    interactive: !this.props.editMode,
                    tip: this.tipText,
                    describe: this.describe,
                    onPalette: this.onPalette,
                    onFit: this.onFit,
                },
            );
            this.engineCanvas = cv;
            this.shownModel = null;
            this.themeKey = '';
        }
        const eng = this.engine;
        if (!eng) {
            return;
        }
        eng.setInteractive(!this.props.editMode);
        const themeKey = `${this.ghDark()}|${this.ghAccent('', 'sun')}|${this.state.rxData.ghTheme}`;
        if (themeKey !== this.themeKey) {
            this.themeKey = themeKey;
            eng.retheme(this.ghAccent('', 'sun'));
        }
        const viewKey = this.view();
        if (viewKey !== this.viewKey) {
            if (this.viewKey) {
                this.viewChangedAt = Date.now();
            }
            this.viewKey = viewKey;
            eng.setView(viewKey);
        }
        const { model } = this.getModel();
        if (model !== this.shownModel) {
            const prev = this.shownModel;
            this.shownModel = model;
            eng.setTexts(this.tipText, this.describe);
            eng.setModel(model, !!prev && prev.cells.length === model.cells.length);
        }
        this.syncKeepOut();
    }

    /** Tells the engine which corners the statistics occupy, so that the 3D skyline keeps them free */
    private syncKeepOut(): void {
        const eng = this.engine;
        if (!eng) {
            return;
        }
        const tr = this.trRef.current;
        const bl = this.blRef.current;
        if (!this.cornersShown || !tr || !bl) {
            eng.setKeepOut(null);
            return;
        }
        eng.setKeepOut([
            { corner: 'tr', w: tr.offsetWidth, h: tr.offsetHeight, inset: 4 },
            { corner: 'bl', w: bl.offsetWidth, h: bl.offsetHeight, inset: 4 },
        ]);
    }

    /** The skyline would have to shrink too much for the corner statistics: show them in a row instead */
    private onFit = (k: number): void => {
        if (this.fitTimer) {
            clearTimeout(this.fitTimer);
            this.fitTimer = undefined;
        }
        if (!this.cornersShown || k >= MIN_FIT) {
            return;
        }
        const decide = (): void => {
            this.fitTimer = undefined;
            if (this.alive && this.cornersShown && this.state.cornersOff !== this.sizeKey) {
                this.setState({ cornersOff: this.sizeKey });
            }
        };
        // right after a switch 2D → 3D the stage height still animates (the row collapses): decide later
        const wait = this.viewChangedAt + 1600 - Date.now();
        if (wait > 0) {
            this.fitTimer = setTimeout(decide, wait);
        } else {
            decide();
        }
    };

    private measure = (): void => {
        const root = this.obsRoot;
        if (!root) {
            return;
        }
        const rw = root.clientWidth;
        const rh = root.clientHeight;
        if (rw !== this.state.rw || rh !== this.state.rh) {
            this.setState({ rw, rh });
        }
    };

    private onPalette = (colors: string[]): void => {
        if (!this.alive) {
            return;
        }
        if (colors.join() !== this.state.swatches.join()) {
            this.setState({ swatches: colors });
        }
    };

    private fmtValue(v: number | null): string {
        if (v === null) {
            return GlashausWidget.tr('sky_no_value');
        }
        const unit = this.unit();
        return `${fmtNum(v, this.decimals(), this.ghLang())}${unit ? ` ${unit}` : ''}`;
    }

    private tipText = (c: SkyCell): [string, string] => {
        const df = new Intl.DateTimeFormat(localeOf(this.ghLang()), {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
        });
        return [this.fmtValue(c.v), GlashausWidget.tr('sky_on', df.format(c.date))];
    };

    private describe = (c: SkyCell): string => {
        const df = new Intl.DateTimeFormat(localeOf(this.ghLang()), {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
        });
        return `${this.fmtValue(c.v)} ${GlashausWidget.tr('sky_on', df.format(c.date))}`;
    };

    private setLegend(level: number): void {
        if (level !== this.state.legendLevel) {
            this.setState({ legendLevel: level });
        }
        this.engine?.setLegendLevel(level);
    }

    /* ---------- texts ---------- */

    private isMean(): boolean {
        const t = this.state.rxData.total;
        if (t === 'sum' || t === 'mean') {
            return t === 'mean';
        }
        return this.source() === 'history' && !SUM_MODES.includes(this.mode());
    }

    private range(a: number | null, b: number | null, year: boolean): string {
        if (a === null || b === null) {
            return '–';
        }
        const df = new Intl.DateTimeFormat(localeOf(this.ghLang()), {
            day: 'numeric',
            month: 'short',
            ...(year ? { year: '2-digit' } : {}),
            timeZone: 'UTC',
        });
        return a === b ? df.format(a) : `${df.format(a)} – ${df.format(b)}`;
    }

    private totalOf(s: SkyStats): number | null {
        return this.isMean() ? s.mean : s.count ? s.total : null;
    }

    /** Big total value: no decimals from 100 on */
    private fmtTotal(v: number | null): string {
        if (v === null) {
            return '–';
        }
        const dec = this.isMean() || Math.abs(v) < 100 ? this.decimals() : 0;
        return fmtNum(v, dec, this.ghLang());
    }

    private statBlocks(m: SkyModel, streakLabel: string): StatBlock[] {
        const s = m.stats;
        const lang = this.ghLang();
        const dec = this.decimals();
        const unit = this.unit();
        const mean = this.isMean();
        const d = this.state.rxData;
        const days = (n: number): string => GlashausWidget.tr(n === 1 ? 'sky_day' : 'sky_days');
        const dfs = new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' });
        const blocks: StatBlock[] = [
            {
                label:
                    GlashausWidget.ghText(d.totalLabel) || GlashausWidget.tr(mean ? 'sky_stat_mean' : 'sky_stat_total'),
                value: this.fmtTotal(this.totalOf(s)),
                unit,
                sub: this.range(s.first, s.last, true),
            },
            {
                label: GlashausWidget.tr('sky_stat_best'),
                value: fmtNum(s.best, dec, lang),
                unit,
                sub: s.bestDate !== null ? dfs.format(s.bestDate) : '–',
            },
        ];
        if (streakLabel) {
            blocks.push(
                {
                    label: GlashausWidget.tr('sky_stat_longest'),
                    value: fmtNum(s.longest.days, 0, lang),
                    unit: days(s.longest.days),
                    sub: `${streakLabel} · ${this.range(s.longest.start, s.longest.end, false)}`,
                },
                {
                    label: GlashausWidget.tr('sky_stat_current'),
                    value: fmtNum(s.current.days, 0, lang),
                    unit: days(s.current.days),
                    sub: this.range(s.current.start, s.current.end, false),
                },
            );
        } else {
            blocks.push(
                mean
                    ? {
                          label: GlashausWidget.tr('sky_stat_low'),
                          value: fmtNum(s.low, dec, lang),
                          unit,
                          sub: s.lowDate !== null ? dfs.format(s.lowDate) : '–',
                      }
                    : {
                          label: GlashausWidget.tr('sky_stat_avg'),
                          value: fmtNum(s.mean, dec, lang),
                          unit,
                          sub: `${fmtNum(s.count, 0, lang)} ${days(s.count)}`,
                      },
            );
            const last = m.cells.filter(c => c.strip === 0).pop();
            blocks.push({
                label: GlashausWidget.tr('sky_stat_today'),
                value: fmtNum(last?.v ?? null, dec, lang),
                unit,
                sub: last
                    ? new Intl.DateTimeFormat(localeOf(lang), {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          timeZone: 'UTC',
                      }).format(last.date)
                    : '–',
            });
        }
        return blocks;
    }

    private static renderStat(b: StatBlock, cls: string, key: number): React.JSX.Element {
        if (cls === 'row') {
            // row below the grid: value and unit on one line, the description under it
            return (
                <div
                    className="gh-sky-stat row"
                    key={key}
                >
                    <div className="gh-sky-l">{b.label}</div>
                    <div className="gh-sky-rv">
                        <b>{b.value}</b>
                        <em>{b.unit}</em>
                    </div>
                    <small title={b.sub}>{b.sub}</small>
                </div>
            );
        }
        return (
            <div
                className={`gh-sky-stat ${cls}`}
                key={key}
            >
                <div className="gh-sky-l">{b.label}</div>
                <div className="gh-sky-vv">
                    <b>{b.value}</b>
                    <span>
                        <em>{b.unit}</em>
                        <small>{b.sub}</small>
                    </span>
                </div>
            </div>
        );
    }

    /* ---------- render ---------- */

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const src = this.source();
        const demo = src === 'demo';
        const { model, maxYears, loading } = this.getModel();
        const N = model.N;
        const view = this.view();
        const unit = this.unit();
        const mean = this.isMean();
        const streak = this.streakTest();
        const accent = this.ghAccent('', 'sun');
        const { rw, rh } = this.state;
        const xs = (rw > 0 && rw < 440) || (rh > 0 && rh < 300);

        // layout decisions by size
        const showFoot = isTrue(d.legend, true) && rh >= 300;
        const showHint = rw >= 620 && !this.props.editMode;
        // one line per year in the comparison row (about 165 px each), or room for a second line
        const showCmp = N > 1 && rh >= 280 && (rw - 40 >= N * 165 || rh >= 420);
        const statsMode = d.stats === 'row' || d.stats === 'none' ? d.stats : 'auto';
        const cols = rw >= 680 ? 4 : 2;
        const rowFits = rh >= (cols === 4 ? 380 : 500);
        const cornersFit = rw >= 640 && rh >= 380;
        const sizeKey = `${rw}x${rh}|${N}|${this.ghLang()}`;
        const corners = statsMode === 'auto' && view === '3d' && cornersFit && this.state.cornersOff !== sizeKey;
        this.sizeKey = sizeKey;
        this.cornersShown = corners;
        const row = statsMode !== 'none' && !corners && rowFits;
        const blocks = statsMode === 'none' ? [] : this.statBlocks(model, streak.label);

        const label = GlashausWidget.ghText(d.label) || (demo ? GlashausWidget.tr('sky_demo_label') : '');
        const ownTitle = GlashausWidget.ghText(d.title);
        const total = this.totalOf(model.stats);
        const titleText = ownTitle ? (
            ownTitle
        ) : (
            <>
                <b>
                    {mean ? 'Ø ' : ''}
                    {this.fmtTotal(total)}
                    {unit ? ` ${unit}` : ''}
                </b>{' '}
                {label} {GlashausWidget.tr(mean ? 'sky_per_day' : 'sky_last_12')}
            </>
        );

        const yearsLabel = `${N} ${GlashausWidget.tr(N === 1 ? 'sky_year' : 'sky_years_n')}`;
        const big = clamp(Math.round(rw * 0.042), 26, 54);
        const rowBig = clamp(Math.round(rw * 0.03), 20, 28);
        const swatches = this.state.swatches;
        const style = {
            '--gh-sky-acc': swatches[4] || accent,
            '--gh-sky-big': `${big}px`,
            '--gh-sky-rowbig': `${rowBig}px`,
            '--gh-sky-cols': cols,
        } as React.CSSProperties;
        const levelNames = ['sky_lvl_0', 'sky_lvl_1', 'sky_lvl_2', 'sky_lvl_3', 'sky_lvl_4'];
        // small tiles: the controls would wrap below the title and leave no room for the skyline
        const showYears = isTrue(d.yearButtons, true) && maxYears > 1 && (rw >= 420 || rh >= 300);
        const showToggle = isTrue(d.viewToggle, true) && (rw >= 230 || rh >= 220);
        const failed = src === 'history' && this.hist.error;

        const cls = ['gh-sky'];
        if (xs) {
            cls.push('gh-sky-xs');
        }
        if (!showFoot) {
            cls.push('gh-sky-nofoot');
        }

        return (
            <div
                ref={this.rootRef}
                className={this.ghClass(cls.join(' '))}
                style={style}
                data-view={view}
                data-corners={corners ? '1' : '0'}
            >
                <div className="gh-h">
                    <h2 className="gh-title">
                        <GhIconBox
                            name={this.ghIcon()}
                            color={accent}
                        />
                        <span className={ownTitle ? 'gh-sky-tt gh-sky-own' : 'gh-sky-tt'}>{titleText}</span>
                    </h2>
                    {showYears || showToggle ? (
                        <div className="gh-sky-ctl">
                            {showYears ? (
                                <div className="gh-sky-years">
                                    <button
                                        type="button"
                                        className="gh-circ"
                                        disabled={N <= 1}
                                        aria-label={GlashausWidget.tr('sky_year_less')}
                                        title={GlashausWidget.tr('sky_year_less')}
                                        onClick={() => this.setState({ shownYears: Math.max(1, N - 1) })}
                                    >
                                        −
                                    </button>
                                    <span>{yearsLabel}</span>
                                    <button
                                        type="button"
                                        className="gh-circ"
                                        disabled={N >= maxYears}
                                        aria-label={GlashausWidget.tr('sky_year_more')}
                                        title={GlashausWidget.tr('sky_year_more')}
                                        onClick={() => this.setState({ shownYears: Math.min(maxYears, N + 1) })}
                                    >
                                        +
                                    </button>
                                </div>
                            ) : null}
                            {showToggle ? (
                                <div
                                    className="gh-sky-toggle"
                                    role="group"
                                    aria-label={GlashausWidget.tr('sky_view')}
                                >
                                    <span
                                        className="gh-sky-knob"
                                        aria-hidden="true"
                                    />
                                    <button
                                        type="button"
                                        aria-pressed={view === '2d'}
                                        aria-label={GlashausWidget.tr('sky_view_2d')}
                                        title={GlashausWidget.tr('sky_view_2d')}
                                        onClick={() => this.setState({ shownView: '2d' })}
                                    >
                                        {ICON_GRID}
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={view === '3d'}
                                        aria-label={GlashausWidget.tr('sky_view_3d')}
                                        title={GlashausWidget.tr('sky_view_3d')}
                                        onClick={() => this.setState({ shownView: '3d' })}
                                    >
                                        {ICON_CUBE}
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
                {showCmp ? (
                    <div
                        className="gh-sky-cmp"
                        aria-live="polite"
                    >
                        {model.strips.map((st, k) => {
                            const v = this.totalOf(st.stats);
                            const p = model.strips[k + 1];
                            const pv = p ? this.totalOf(p.stats) : null;
                            const diff = v !== null && pv ? Math.round((v / pv - 1) * 100) : null;
                            return (
                                <span key={st.label + k}>
                                    <b>{st.label}</b>
                                    {mean ? 'Ø ' : ''}
                                    {this.fmtTotal(v)}
                                    {unit ? ` ${unit}` : ''}
                                    {diff !== null ? (
                                        <em className={diff >= 0 ? 'up' : 'dn'}>
                                            {diff > 0 ? '+' : diff < 0 ? '−' : '±'}
                                            {Math.abs(diff)} %
                                        </em>
                                    ) : null}
                                </span>
                            );
                        })}
                    </div>
                ) : null}
                <div className="gh-sky-frame">
                    <div className="gh-sky-pad">
                        <div
                            className="gh-sky-stage"
                            ref={this.stageRef}
                        >
                            <canvas
                                ref={this.canvasRef}
                                tabIndex={this.props.editMode ? -1 : 0}
                                role="img"
                                aria-label={`${label}: ${this.fmtTotal(total)} ${unit}, ${this.range(
                                    model.stats.first,
                                    model.stats.last,
                                    true,
                                )}. ${GlashausWidget.tr('sky_aria_keys')}`}
                            />
                            {statsMode === 'auto' && cornersFit && blocks.length ? (
                                <>
                                    <div
                                        className="gh-sky-corner gh-sky-tr"
                                        ref={this.trRef}
                                    >
                                        {blocks.slice(0, 2).map((b, i) => GlashausSkyline.renderStat(b, 'end', i))}
                                    </div>
                                    <div
                                        className="gh-sky-corner gh-sky-bl"
                                        ref={this.blRef}
                                    >
                                        {blocks.slice(2, 4).map((b, i) => GlashausSkyline.renderStat(b, 'start', i))}
                                    </div>
                                </>
                            ) : null}
                            {failed || (model.empty && !loading) ? (
                                <div className="gh-sky-empty">
                                    <span>{GlashausWidget.tr(failed ? 'sky_error' : 'no_data')}</span>
                                </div>
                            ) : null}
                        </div>
                        <div
                            className="gh-sky-tip"
                            role="tooltip"
                            ref={this.tipRef}
                        />
                    </div>
                    {statsMode !== 'none' && rowFits ? (
                        <div
                            className="gh-sky-rowwrap"
                            data-show={row ? '1' : '0'}
                        >
                            <div className="gh-sky-row">
                                <div className="gh-sky-row-in">
                                    {blocks.map((b, i) => GlashausSkyline.renderStat(b, 'row', i))}
                                </div>
                            </div>
                        </div>
                    ) : null}
                    {showFoot ? (
                        <div className="gh-sky-foot">
                            {showHint ? (
                                <span className="gh-sky-hint">
                                    {GlashausWidget.tr(view === '3d' ? 'sky_hint_3d' : 'sky_hint_2d')}
                                </span>
                            ) : null}
                            <div
                                className="gh-sky-legend"
                                onMouseLeave={() => this.setLegend(-1)}
                            >
                                <span>{GlashausWidget.tr('sky_less')}</span>
                                {levelNames.map((n, i) => (
                                    <button
                                        type="button"
                                        key={n}
                                        title={GlashausWidget.tr(n)}
                                        aria-label={GlashausWidget.tr(n)}
                                        aria-pressed={this.state.legendLevel === i}
                                        style={swatches[i] ? { background: swatches[i] } : undefined}
                                        onMouseEnter={() => this.setLegend(i)}
                                        onFocus={() => this.setLegend(i)}
                                        onBlur={() => this.setLegend(-1)}
                                        onClick={() => this.setLegend(this.state.legendLevel === i ? -1 : i)}
                                    />
                                ))}
                                <span>{GlashausWidget.tr('sky_more')}</span>
                            </div>
                        </div>
                    ) : null}
                </div>
                <p
                    className="gh-sky-sr"
                    aria-live="polite"
                    ref={this.srRef}
                />
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}
