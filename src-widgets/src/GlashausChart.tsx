/* Chart: history of up to four object IDs, as lines (GhSpark, with hover read-out) or as columns per
 * hour / day / week / month (sum, maximum, average or the difference of a counter). Legend with current values,
 * loading state, "no data yet" and demo curves while no object ID is set. */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    RxWidgetInfoAttributesField,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, {
    ACCENTS,
    ADAPTER,
    SET_COLOR,
    accentColor,
    isOid,
    isTrue,
    type HistoryPoint,
} from './core/GlashausWidget';
import { GhIconBox, GhSpark, type GhSeries } from './core/components';
import { clamp, fmtNum, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';
import { ChartBars } from './chart/ChartBars';
import {
    H,
    autoStep,
    bucketLabels,
    demoBars,
    demoLine,
    fillBuckets,
    makeBuckets,
    requestAggregate,
    requestStart,
    subStep,
    type BarStep,
    type BarValue,
    type Bucket,
} from './chart/buckets';

const MAX_SERIES = 4;
/** Default accent of series 1..4 when "automatic" is selected */
const AUTO_ACCENTS = ['sun', 'home', 'batt', 'heat'];
const RANGES: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24, '48h': 48, '7d': 168, '30d': 720, '365d': 8760 };
const AGGREGATES = ['average', 'minmax', 'max', 'min', 'total', 'onchange'];
/** Aggregates whose current value can be appended to the line as the newest point */
const LIVE_AGGREGATES = ['average', 'minmax', 'max', 'min', 'onchange'];

interface ChartRxData {
    title: string;
    icon: string;
    iconCustom: string;
    count: number | string;
    mode: 'lines' | 'bars';
    range: string;
    hours: number | string;
    history: string;
    aggregate: string;
    barStep: 'auto' | BarStep;
    barValue: BarValue;
    barValues: boolean | string;
    unit: string;
    decimals: number | string;
    zero: boolean | string;
    legend: boolean | string;
    refresh: number | string;
    [key: string]: unknown;
}

interface ChartResult {
    key: string;
    /** End of the requested range (ms) */
    end: number;
    /** History points per series (index = series number − 1) */
    lines: HistoryPoint[][];
    buckets: Bucket[];
    bars: (number | null)[][];
}

interface ChartState extends VisRxWidgetState {
    /** null while loading (or in demo mode) */
    res: ChartResult | null;
    pw: number;
    ph: number;
}

interface SeriesCfg {
    /** Series number 1..4 */
    idx: number;
    oid: string | null;
    label: string;
    color: string;
    fill: boolean;
    dash: boolean;
    steps: boolean;
    factor: number;
}

/* The root is a size container (compact header on small tiles). overflow:visible lets the hover read-out of the
 * lines (GhSpark, one line for all series) stand out over the card edge: with several series it is wider than a
 * small card. The read-out of the bars stays inside the card by itself.
 * Module-level name CHART_CSS: a const named CSS would shadow the global CSS (CSS.supports, CSS.escape). */
const CHART_CSS = `
.gh.gh-chart{padding:0;container:gh-chart/size;overflow:visible}
.gh-chart-box{flex:1;min-height:0;display:flex;flex-direction:column;padding:22px}
.gh-chart .gh-h{margin-bottom:14px;row-gap:8px;flex-wrap:wrap}
.gh-chart .gh-title{flex:0 1 auto;min-width:0}
.gh-chart-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-chart-legend{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px 14px;margin-left:auto;min-width:0;max-width:100%;
  font-size:12.5px;color:var(--gh-fg-2)}
.gh-chart-lg{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;min-width:0;max-width:100%;font-variant-numeric:tabular-nums}
.gh-chart-lg>span{overflow:hidden;text-overflow:ellipsis}
.gh-chart-lg i{flex:none;width:14px;height:3px;border-radius:2px;background:var(--gh-c)}
.gh-chart-lg i.d{background:repeating-linear-gradient(90deg,var(--gh-c) 0 4px,transparent 4px 7px)}
.gh-chart-lg i.b{width:9px;height:9px;border-radius:3px}
.gh-chart-lg b{color:var(--gh-fg);font-weight:600}
.gh-chart-plot{flex:1;min-height:0;position:relative;padding-bottom:4px}
.gh-chart-plot>.gh-spark{min-height:0}
.gh-chart .gh-spark>svg{animation:gh-chart-reveal 1.6s var(--gh-ease) backwards}
@keyframes gh-chart-reveal{from{clip-path:inset(-20px 100% -20px -20px)}to{clip-path:inset(-20px -20px -20px -20px)}}
.gh-chart-empty{position:absolute;inset:0;display:grid;place-items:center;text-align:center}
.gh-chart-load{display:inline-flex;gap:6px}
.gh-chart-load i{width:6px;height:6px;border-radius:50%;background:var(--gh-fg-3);animation:gh-chart-dot 1.2s ease-in-out infinite}
.gh-chart-load i:nth-child(2){animation-delay:.15s}
.gh-chart-load i:nth-child(3){animation-delay:.3s}
@keyframes gh-chart-dot{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
.gh-chart-bars{position:absolute;inset:0 0 4px 0;display:flex;flex-direction:column}
.gh-chart-area{position:relative;flex:1;min-height:0;display:flex}
.gh-chart-area:focus-visible{border-radius:8px}
.gh-chart-slot{flex:1;min-width:0;height:100%;display:flex;gap:2px;justify-content:center}
.gh-chart-cw{position:relative;flex:1;max-width:34px;height:100%}
.gh-chart-col{position:absolute;left:0;right:0;border-radius:7px 7px 3px 3px;opacity:.85;transform-origin:50% 100%;
  transition:height .9s var(--gh-ease),bottom .9s var(--gh-ease),top .9s var(--gh-ease),opacity .25s;
  animation:gh-chart-grow .9s var(--gh-ease) backwards}
.gh-chart-col.neg{border-radius:3px 3px 7px 7px;transform-origin:50% 0}
@keyframes gh-chart-grow{from{transform:scaleY(0)}}
.gh-chart-hov .gh-chart-col{opacity:.45}
.gh-chart-hov .gh-chart-slot.on .gh-chart-col{opacity:1}
.gh-chart-v{position:absolute;left:50%;transform:translateX(-50%);font-size:10.5px;line-height:12px;color:var(--gh-fg-2);
  white-space:nowrap;font-variant-numeric:tabular-nums;pointer-events:none}
.gh-chart-zero{position:absolute;left:0;right:0;height:1px;background:var(--gh-track)}
.gh-chart-labels{display:flex;flex:none;align-items:flex-end}
.gh-chart-labels span{flex:1;min-width:0;text-align:center;font-size:10.5px;line-height:1;color:var(--gh-fg-2);white-space:nowrap;
  font-variant-numeric:tabular-nums}
.gh-chart-labels span.on{color:var(--gh-fg)}
.gh-chart-tip{position:absolute;left:0;top:0;z-index:2;padding:4px 8px;border-radius:8px;font-size:12px;font-weight:550;
  white-space:nowrap;background:var(--gh-fg);color:var(--gh-bg);pointer-events:none;font-variant-numeric:tabular-nums}
.gh-chart-tip.multi{display:flex;flex-direction:column;gap:1px;padding:5px 9px}
.gh-chart-tip-r{display:flex;align-items:center;gap:6px;font-weight:450}
.gh-chart-tip-r i{flex:none;width:8px;height:8px;border-radius:2px;background:var(--gh-c)}
.gh-chart-tip-r b{font-weight:600}
@container gh-chart (max-width:420px){
  .gh-chart-legend{justify-content:flex-start;margin-left:0}
}
@container gh-chart (max-height:220px){
  /* one line: series that do not fit wrap into the hidden second line instead of being cut */
  .gh-chart-legend{max-height:1.45em;overflow:hidden;gap:0 10px}
  .gh-chart-multi .gh-chart-lg>span{display:none}
}
@container gh-chart (max-width:280px) or (max-height:190px){
  .gh-chart-box{padding:14px}
  .gh-chart .gh-h{margin-bottom:8px}
  .gh-chart .gh-ico{width:26px;height:26px;border-radius:8px}
  .gh-chart .gh-ico svg{width:15px;height:15px}
  .gh-chart .gh-title{font-size:13.5px;gap:8px}
  .gh-chart-legend{font-size:11.5px;gap:2px 10px}
}
@container gh-chart (max-height:120px){
  .gh-chart .gh-h{display:none}
}
`;

const isBars = (data: WidgetData): boolean => data.mode === 'bars';

export default class GlashausChart extends GlashausWidget<ChartRxData, ChartState> {
    private plotRef = React.createRef<HTMLDivElement>();

    private ro: ResizeObserver | null = null;

    private roEl: HTMLDivElement | null = null;

    private roRaf = 0;

    private timer: ReturnType<typeof setInterval> | undefined;

    private timerMs = 0;

    private loadKey = '';

    private lastLoad = 0;

    private seq = 0;

    private dead = false;

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('chart', CHART_CSS);
        this.state = { ...this.state, res: null, pw: 0, ph: 0 };
    }

    static getWidgetInfo(): RxWidgetInfo {
        const seriesFields: RxWidgetInfoAttributesField[] = [
            {
                name: 'oid',
                label: 'oid',
                type: 'hid',
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
                            typeof n === 'object' ? n[GlashausWidget.getLanguage()] || n.en : n || id.split('.').pop();
                        changed = true;
                    }
                    if (!data.unit && common.unit) {
                        data.unit = common.unit;
                        changed = true;
                    }
                    if (changed) {
                        changeData(data);
                    }
                },
            },
            { name: 'label', label: 'chart_label' },
            {
                name: 'accent',
                label: 'accent',
                type: 'select',
                options: [
                    { value: '', label: 'chart_accent_auto' },
                    ...[...ACCENTS, 'custom'].map(a => ({ value: a, label: `accent_${a}` })),
                ],
                default: '',
            },
            {
                name: 'color',
                label: 'color',
                type: 'color',
                hidden: (data: WidgetData, index?: number) => data[`accent${index}`] !== 'custom',
            },
            { name: 'fill', label: 'chart_fill', type: 'checkbox', default: true, hidden: isBars },
            { name: 'dash', label: 'chart_dash', type: 'checkbox', default: false, hidden: isBars },
            { name: 'steps', label: 'chart_steps', type: 'checkbox', default: false, hidden: isBars },
            { name: 'factor', label: 'chart_factor', type: 'number', default: 1, tooltip: 'chart_factor_tip' },
        ];
        return {
            id: 'tplGlashausChart',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Chart',
            visWidgetLabel: 'chart_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields('chart'),
                        { name: 'count', label: 'chart_count', type: 'number', min: 1, max: MAX_SERIES, default: 1 },
                        {
                            name: 'mode',
                            label: 'chart_mode',
                            type: 'select',
                            options: [
                                { value: 'lines', label: 'chart_mode_lines' },
                                { value: 'bars', label: 'chart_mode_bars' },
                            ],
                            default: 'lines',
                        },
                        {
                            name: 'range',
                            label: 'chart_range',
                            type: 'select',
                            options: [...Object.keys(RANGES), 'custom'].map(r => ({
                                value: r,
                                label: `chart_range_${r}`,
                            })),
                            default: '24h',
                        },
                        {
                            name: 'hours',
                            label: 'chart_hours',
                            type: 'number',
                            min: 1,
                            max: 8784,
                            default: 24,
                            hidden: (data: WidgetData) => data.range !== 'custom',
                        },
                        { name: 'history', label: 'history', type: 'instance', adapter: '_dataSources' },
                        {
                            name: 'aggregate',
                            label: 'chart_aggregate',
                            type: 'select',
                            options: AGGREGATES.map(a => ({ value: a, label: `chart_agg_${a}` })),
                            default: 'average',
                            hidden: isBars,
                        },
                        {
                            name: 'barStep',
                            label: 'chart_bar_step',
                            type: 'select',
                            options: ['auto', 'hour', 'day', 'week', 'month'].map(s => ({
                                value: s,
                                label: `chart_step_${s}`,
                            })),
                            default: 'auto',
                            hidden: (data: WidgetData) => !isBars(data),
                        },
                        {
                            name: 'barValue',
                            label: 'chart_bar_value',
                            type: 'select',
                            options: ['total', 'max', 'average', 'diff'].map(v => ({
                                value: v,
                                label: `chart_bv_${v}`,
                            })),
                            default: 'total',
                            hidden: (data: WidgetData) => !isBars(data),
                        },
                        {
                            name: 'barValues',
                            label: 'chart_bar_values',
                            type: 'checkbox',
                            default: true,
                            hidden: (data: WidgetData) => !isBars(data),
                        },
                        { name: 'unit', label: 'unit' },
                        { name: 'decimals', label: 'decimals', type: 'number', min: 0, max: 4, default: 1 },
                        { name: 'zero', label: 'chart_zero', type: 'checkbox', default: false, hidden: isBars },
                        { name: 'legend', label: 'chart_legend', type: 'checkbox', default: true },
                        {
                            name: 'refresh',
                            label: 'chart_refresh',
                            type: 'number',
                            min: 1,
                            max: 1440,
                            default: 5,
                            tooltip: 'chart_refresh_tip',
                        },
                    ],
                },
                {
                    name: 'series',
                    label: 'group_chart_series',
                    indexFrom: 1,
                    indexTo: 'count',
                    fields: seriesFields,
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 520, height: 280, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_chart.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausChart.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.dead = false;
        document.addEventListener('visibilitychange', this.onVisibility);
        this.attachObserver();
        this.load();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: ChartState): void {
        super.componentDidUpdate(prevProps, prevState);
        this.attachObserver();
    }

    onRxDataChanged(): void {
        this.load();
    }

    componentWillUnmount(): void {
        this.dead = true;
        document.removeEventListener('visibilitychange', this.onVisibility);
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        this.ro?.disconnect();
        this.ro = null;
        this.roEl = null;
        cancelAnimationFrame(this.roRaf);
        super.componentWillUnmount();
    }

    /* ---------- Size ---------- */

    private attachObserver(): void {
        const el = this.plotRef.current;
        if (!el || el === this.roEl) {
            return;
        }
        this.ro?.disconnect();
        this.roEl = el;
        if (typeof ResizeObserver !== 'undefined') {
            this.ro = new ResizeObserver(() => {
                cancelAnimationFrame(this.roRaf);
                this.roRaf = requestAnimationFrame(this.measure);
            });
            this.ro.observe(el);
        }
        this.measure();
    }

    private measure = (): void => {
        const el = this.roEl;
        if (!el) {
            return;
        }
        const pw = el.clientWidth;
        const ph = el.clientHeight;
        if (pw !== this.state.pw || ph !== this.state.ph) {
            this.setState({ pw, ph });
        }
    };

    /* ---------- Configuration ---------- */

    private rangeHours(): number {
        const d = this.state.rxData;
        if (d.range === 'custom') {
            return clamp(toNum(d.hours) || 24, 1, 8784);
        }
        return RANGES[d.range] ?? 24;
    }

    private barStep(): BarStep {
        const s = this.state.rxData.barStep;
        return s && s !== 'auto' ? s : autoStep(this.rangeHours() * H);
    }

    private count(): number {
        return clamp(Math.round(toNum(this.state.rxData.count) ?? 1), 1, MAX_SERIES);
    }

    private isDemo(): boolean {
        const d = this.state.rxData;
        for (let i = 1; i <= this.count(); i++) {
            if (isOid(d[`oid${i}`])) {
                return false;
            }
        }
        return true;
    }

    private series(demo: boolean): SeriesCfg[] {
        const d = this.state.rxData;
        const count = this.count();
        const out: SeriesCfg[] = [];
        for (let i = 1; i <= count; i++) {
            const oid = d[`oid${i}`];
            if (!demo && !isOid(oid)) {
                continue;
            }
            const accent = d[`accent${i}`];
            const label = GlashausWidget.ghText(d[`label${i}`]);
            const factor = d[`factor${i}`];
            out.push({
                idx: i,
                oid: isOid(oid) ? oid : null,
                label: label || (demo ? GlashausWidget.tr(`chart_demo_s${i}`) : ''),
                color: accentColor(
                    typeof accent === 'string' && accent ? accent : AUTO_ACCENTS[i - 1],
                    d[`color${i}`],
                    'fg',
                ),
                fill: isTrue(d[`fill${i}`], true),
                dash: isTrue(d[`dash${i}`], false),
                steps: isTrue(d[`steps${i}`], false),
                factor: factor === '' || factor === undefined || factor === null ? 1 : (toNum(factor) ?? 1),
            });
        }
        return out;
    }

    private dataKey(series: SeriesCfg[]): string {
        const d = this.state.rxData;
        // with the series number: the results are stored per series
        const ids = series.map(s => `${s.idx}:${s.oid || ''}`).join(',');
        const hours = this.rangeHours();
        if (d.mode === 'bars') {
            return `B|${hours}|${this.barStep()}|${d.barValue || 'total'}|${d.history || ''}|${ids}`;
        }
        return `L|${hours}|${d.aggregate || 'average'}|${d.history || ''}|${ids}`;
    }

    /** 1 min … 1 day: a larger delay would overflow setInterval (32 bit) and fire all the time */
    private refreshMs(): number {
        return clamp(toNum(this.state.rxData.refresh) || 5, 1, 1440) * 60000;
    }

    /* ---------- Loading ---------- */

    private onVisibility = (): void => {
        if (!document.hidden && !this.isDemo() && Date.now() - this.lastLoad > this.refreshMs()) {
            this.load(true);
        }
    };

    private onTimer = (): void => {
        // nothing is read while the page is hidden; onVisibility catches up
        if (!document.hidden) {
            this.load(true);
        }
    };

    private load(force = false): void {
        const demo = this.isDemo();
        const series = this.series(demo);
        const key = demo ? 'demo' : this.dataKey(series);
        const ms = this.refreshMs();
        if (!demo && (ms !== this.timerMs || !this.timer)) {
            if (this.timer) {
                clearInterval(this.timer);
            }
            this.timerMs = ms;
            this.timer = setInterval(this.onTimer, ms);
        } else if (demo && this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        if (!force && key === this.loadKey) {
            return;
        }
        const changed = key !== this.loadKey;
        this.loadKey = key;
        const seq = ++this.seq;
        if (demo) {
            if (this.state.res) {
                this.setState({ res: null });
            }
            return;
        }
        if (changed && this.state.res) {
            this.setState({ res: null });
        }
        this.lastLoad = Date.now();
        const d = this.state.rxData;
        const end = Date.now();
        const rangeMs = this.rangeHours() * H;
        const bars = d.mode === 'bars';
        const step = this.barStep();
        const how: BarValue = d.barValue || 'total';
        const buckets = bars ? makeBuckets(rangeMs, step, end) : [];
        const aggregate = d.aggregate || 'average';
        // the same ID in several series is read once
        const reads = new Map<string, Promise<HistoryPoint[]>>();
        const read = (oid: string): Promise<HistoryPoint[]> => {
            const done = reads.get(oid);
            if (done) {
                return done;
            }
            const start = bars ? requestStart(buckets, step, how) : end - rangeMs;
            const p = bars
                ? this.ghHistory(oid, {
                      start,
                      end,
                      aggregate: requestAggregate(how),
                      step: subStep(step, end - start),
                  })
                : this.ghHistory(oid, {
                      start,
                      end,
                      aggregate,
                      count: aggregate === 'onchange' ? 2000 : 240,
                  });
            const safe = p.catch(e => {
                console.warn(`[Glashaus] Cannot read history of ${oid}: ${e}`);
                return [] as HistoryPoint[];
            });
            reads.set(oid, safe);
            return safe;
        };
        void Promise.all(series.map(s => (s.oid ? read(s.oid) : Promise.resolve([] as HistoryPoint[])))).then(
            results => {
                if (this.dead || seq !== this.seq) {
                    return;
                }
                const lines: HistoryPoint[][] = [];
                const barVals: (number | null)[][] = [];
                series.forEach((s, i) => {
                    lines[s.idx - 1] = bars ? [] : results[i];
                    barVals[s.idx - 1] = bars ? fillBuckets(buckets, results[i], how) : [];
                });
                this.setState({ res: { key, end, lines, buckets, bars: barVals } });
            },
        );
    }

    /* ---------- Rendering ---------- */

    private renderLegend(
        series: SeriesCfg[],
        values: (number | null)[],
        prefix: string,
        unit: string,
        dec: number,
        bars: boolean,
    ): React.JSX.Element {
        const lang = this.ghLang();
        return (
            <div className="gh-chart-legend">
                {series.map((s, i) => (
                    <span
                        className="gh-chart-lg"
                        key={s.idx}
                        style={{ '--gh-c': s.color } as React.CSSProperties}
                    >
                        <i className={bars ? 'b' : s.dash ? 'd' : undefined} />
                        {s.label ? <span>{s.label}</span> : null}
                        <b>
                            {prefix}
                            {fmtNum(values[i], dec, lang)}
                        </b>
                        {unit && values[i] !== null ? unit : ''}
                    </span>
                ))}
            </div>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const lang = this.ghLang();
        const demo = this.isDemo();
        const series = this.series(demo);
        const bars = d.mode === 'bars';
        const dec = clamp(Math.round(toNum(d.decimals) ?? 1), 0, 4);
        const unit = GlashausWidget.ghText(d.unit) || (demo ? (bars ? 'kWh' : 'kW') : '');
        const rangeMs = this.rangeHours() * H;
        const res = this.state.res && this.state.res.key === this.loadKey ? this.state.res : null;
        const loading = !demo && !res && series.length > 0;
        const title =
            GlashausWidget.ghText(d.title) ||
            (demo ? GlashausWidget.tr(bars ? 'chart_demo_title_bars' : 'chart_demo_title') : '');
        const icon = this.ghIcon();
        const showLegend = isTrue(d.legend, true) && series.length > 0;
        const { pw, ph } = this.state;

        let plot: React.JSX.Element | null = null;
        let legendVals: (number | null)[] = [];
        let legendPrefix = '';

        if (bars) {
            const step = this.barStep();
            const how: BarValue = d.barValue || 'total';
            const buckets = demo || !res ? makeBuckets(rangeMs, step) : res.buckets;
            const vals = series.map(s => {
                const raw = demo ? demoBars(s.idx - 1, buckets, step) : res?.bars[s.idx - 1] || [];
                return buckets.map((_b, k) => {
                    const v = raw[k];
                    return v === null || v === undefined ? null : v * (demo ? 1 : s.factor);
                });
            });
            const { short, long } = bucketLabels(buckets, step, lang, GlashausWidget.tr('chart_week_prefix'));
            legendPrefix = how === 'average' ? 'Ø ' : how === 'max' ? '↑ ' : 'Σ ';
            legendVals = vals.map(v => {
                const nums = v.filter((x): x is number => x !== null);
                if (!nums.length) {
                    return null;
                }
                if (how === 'max') {
                    return Math.max(...nums);
                }
                const sum = nums.reduce((a, x) => a + x, 0);
                return how === 'average' ? sum / nums.length : sum;
            });
            if (!loading) {
                plot = (
                    <ChartBars
                        labels={short}
                        tips={long}
                        series={series.map((s, i) => ({ label: s.label, color: s.color, vals: vals[i] }))}
                        width={pw}
                        height={ph}
                        dec={dec}
                        unit={unit}
                        lang={lang}
                        values={isTrue(d.barValues, true)}
                        empty={GlashausWidget.tr('no_data')}
                        keyboard={!this.props.editMode}
                        label={title}
                    />
                );
            }
        } else {
            const now = Date.now();
            const aggregate = d.aggregate || 'average';
            const end = demo || !res ? now : Math.max(res.end, now);
            const from = end - rangeMs;
            const lines: GhSeries[] = series.map(s => {
                let pts: [number, number][];
                if (demo) {
                    pts = demoLine(s.idx - 1, from, end);
                } else {
                    pts = (res?.lines[s.idx - 1] || []).map(p => [p.ts, p.val * s.factor]);
                    const cur = this.ghNum(s.oid);
                    const last = pts[pts.length - 1];
                    if (cur !== null && LIVE_AGGREGATES.includes(aggregate) && pts.length && last[0] < now - 60000) {
                        pts.push([now, cur * s.factor]);
                    }
                    pts = pts.filter(p => p[0] >= from);
                }
                return {
                    pts,
                    color: s.color,
                    label: series.length > 1 ? s.label : undefined,
                    fill: s.fill,
                    dash: s.dash,
                    step: s.steps,
                };
            });
            legendVals = series.map((s, i) => {
                if (demo) {
                    const pts = lines[i].pts;
                    return pts.length ? pts[pts.length - 1][1] : null;
                }
                const cur = this.ghNum(s.oid);
                return cur === null ? null : cur * s.factor;
            });
            if (!loading) {
                plot = (
                    <GhSpark
                        series={lines}
                        unit={unit}
                        dec={dec}
                        lang={lang}
                        from={from}
                        to={end}
                        zero={isTrue(d.zero, false)}
                        labels={ph >= 64}
                        height="100%"
                        empty={series.length ? GlashausWidget.tr('no_data') : GlashausWidget.tr('chart_no_ids')}
                    />
                );
            }
        }

        const header =
            title || icon || showLegend ? (
                <div className="gh-h">
                    {title || icon ? (
                        <h2 className="gh-title">
                            <GhIconBox
                                name={icon}
                                color={series[0]?.color}
                            />
                            {title ? <span className="gh-chart-t">{title}</span> : null}
                        </h2>
                    ) : null}
                    {showLegend ? this.renderLegend(series, legendVals, legendPrefix, unit, dec, bars) : null}
                </div>
            ) : null;

        return (
            <div className={this.ghClass(series.length > 1 ? 'gh-chart gh-chart-multi' : 'gh-chart')}>
                <div className="gh-chart-box">
                    {header}
                    <div
                        className="gh-chart-plot"
                        ref={this.plotRef}
                    >
                        {loading ? (
                            <div className="gh-chart-empty">
                                <span
                                    className="gh-chart-load"
                                    role="status"
                                    aria-label={GlashausWidget.tr('chart_loading')}
                                >
                                    <i />
                                    <i />
                                    <i />
                                </span>
                            </div>
                        ) : (
                            plot
                        )}
                    </div>
                </div>
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}
