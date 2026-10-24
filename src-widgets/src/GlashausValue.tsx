/* Value tile: icon, title, big animated value with unit, status pill by thresholds and an optional 24 h line */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { GhIconBox, GhNumber, GhPill, GhSpark, type GhPillKind } from './core/components';
import { fmtNum, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';

interface ValueRxData {
    oid: string;
    title: string;
    icon: string;
    iconCustom: string;
    accent: string;
    color: string;
    unit: string;
    decimals: number | string;
    factor: number | string;
    sub: string;
    size: 'big' | 'medium' | 'small';
    warnAbove: number | string;
    critAbove: number | string;
    warnBelow: number | string;
    critBelow: number | string;
    pill: boolean | string;
    textOk: string;
    textWarn: string;
    textCrit: string;
    chart: boolean | string;
    history: string;
    hours: number | string;
}

interface ValueState extends VisRxWidgetState {
    /** History points (raw values, before the factor); null while loading or without chart */
    hist: [number, number][] | null;
}

const DEMO = { val: 21.6, unit: '°C' };

/** The limits only drive the status pill: hidden while the pill is off */
const noPill = (data: WidgetData): boolean => !isTrue(data.pill);

/* The root is a size container: compact header on small tiles, the number shrinks to the width,
 * and the chart box (also a container) hides the chart when there is no room for it. */
const CSS = `
.gh.gh-val{padding:0;container:gh-val/size}
.gh-val-box{flex:1;min-height:0;display:flex;flex-direction:column;padding:22px}
.gh-val .gh-h{flex-wrap:nowrap}
.gh-val .gh-title{flex:1 1 auto}
.gh-val-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-val .gh-pill{flex:none;max-width:55%}
.gh-val .gh-pill::before{flex:none}
.gh-val-pt{overflow:hidden;text-overflow:ellipsis}
.gh-val-n{line-height:1;white-space:nowrap;
  font-size:min(var(--gh-val-fs), calc((100cqw - 44px) / var(--gh-val-len)), 38cqh)}
.gh-val-sub{margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-val-chart{flex:1 1 0;min-height:0;margin-top:14px;padding-bottom:14px;container:gh-val-c/size}
@container gh-val-c (max-height:40px){.gh-val-chart>*{display:none}}
@container gh-val (max-height:150px) or (max-width:200px){
  .gh-val-box{padding:14px 16px}
  .gh-val .gh-h{margin-bottom:8px}
  .gh-val .gh-title{font-size:14px;gap:8px}
  .gh-val .gh-ico{width:28px;height:28px;border-radius:9px}
  .gh-val .gh-ico svg{width:16px;height:16px}
}
@container gh-val (max-height:100px){
  .gh-val .gh-ico{display:none}
  .gh-val-sub{display:none}
}
`;

/** Demo curve: a smooth day, deterministic */
function demoCurve(hours: number, base: number, amp: number): [number, number][] {
    const now = Date.now();
    const pts: [number, number][] = [];
    for (let i = 0; i <= 48; i++) {
        const t = now - hours * 3600000 + (i / 48) * hours * 3600000;
        const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
        pts.push([t, base + amp * Math.sin(((h - 9) / 24) * 2 * Math.PI) + 0.15 * Math.sin(i * 1.7)]);
    }
    return pts;
}

export default class GlashausValue extends GlashausWidget<ValueRxData, ValueState> {
    private histTimer: ReturnType<typeof setInterval> | undefined;

    private histKey = '';

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('value', CSS);
        this.state = { ...this.state, hist: null };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausValue',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Value',
            visWidgetLabel: 'value_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'oid',
                            label: 'oid',
                            type: 'id',
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
                                if (!data.title) {
                                    const n = common.name;
                                    data.title =
                                        typeof n === 'object'
                                            ? n[GlashausWidget.getLanguage()] || n.en
                                            : n || id.split('.').pop();
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
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields('thermo'),
                        ...GlashausWidget.accentFields('', 'home'),
                        { name: 'unit', label: 'unit' },
                        { name: 'decimals', label: 'decimals', type: 'number', min: 0, max: 4, default: 1 },
                        { name: 'factor', label: 'factor', type: 'number', default: 1, tooltip: 'factor_tip' },
                        { name: 'sub', label: 'sub_text', tooltip: 'sub_text_tip' },
                        {
                            name: 'size',
                            label: 'size',
                            type: 'select',
                            options: [
                                { value: 'big', label: 'size_big' },
                                { value: 'medium', label: 'size_medium' },
                                { value: 'small', label: 'size_small' },
                            ],
                            default: 'big',
                        },
                    ],
                },
                {
                    name: 'status',
                    label: 'group_status',
                    fields: [
                        { name: 'pill', label: 'show_pill', type: 'checkbox', default: false },
                        { name: 'warnAbove', label: 'warn_above', type: 'number', hidden: noPill },
                        { name: 'critAbove', label: 'crit_above', type: 'number', hidden: noPill },
                        { name: 'warnBelow', label: 'warn_below', type: 'number', hidden: noPill },
                        { name: 'critBelow', label: 'crit_below', type: 'number', hidden: noPill },
                        { name: 'textOk', label: 'text_ok', hidden: noPill },
                        { name: 'textWarn', label: 'text_warn', hidden: noPill },
                        { name: 'textCrit', label: 'text_crit', hidden: noPill },
                    ],
                },
                {
                    name: 'chart',
                    label: 'group_chart',
                    fields: [
                        { name: 'chart', label: 'show_chart', type: 'checkbox', default: true },
                        {
                            name: 'history',
                            label: 'history',
                            type: 'instance',
                            adapter: '_dataSources',
                            hidden: (data: WidgetData) => !isTrue(data.chart, true),
                        },
                        {
                            name: 'hours',
                            label: 'hours',
                            type: 'slider',
                            min: 1,
                            max: 168,
                            default: 24,
                            hidden: (data: WidgetData) => !isTrue(data.chart, true),
                        },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 320, height: 210, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_value.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausValue.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.loadHistory();
    }

    onRxDataChanged(): void {
        this.loadHistory();
    }

    componentWillUnmount(): void {
        if (this.histTimer) {
            clearInterval(this.histTimer);
        }
        this.histKey = '';
        super.componentWillUnmount();
    }

    /** (Re)loads the line chart, then every 5 minutes */
    private loadHistory(): void {
        const d = this.state.rxData;
        const on = isTrue(d.chart, true);
        const hours = Math.max(1, toNum(d.hours) || 24);
        const key = `${on}|${d.oid}|${hours}|${d.history}`;
        if (key === this.histKey) {
            return;
        }
        this.histKey = key;
        if (this.histTimer) {
            clearInterval(this.histTimer);
            this.histTimer = undefined;
        }
        this.setState({ hist: null });
        if (!on || !isOid(d.oid)) {
            return;
        }
        const read = (): void => {
            const end = Date.now();
            const start = end - hours * 3600000;
            void this.ghHistory(d.oid, { start, end, aggregate: 'average', count: 120 })
                .then(pts => pts.map((p): [number, number] => [p.ts, p.val]))
                .catch(e => {
                    console.warn(`[Glashaus] Cannot read history of ${d.oid}: ${e}`);
                    return [];
                })
                .then(hist => {
                    // ignore answers for an older configuration or after unmount
                    if (this.histKey === key) {
                        this.setState({ hist });
                    }
                });
        };
        read();
        this.histTimer = setInterval(read, 5 * 60000);
    }

    private status(v: number | null): GhPillKind {
        if (v === null) {
            return 'idle';
        }
        const d = this.state.rxData;
        const ca = toNum(d.critAbove);
        const cb = toNum(d.critBelow);
        const wa = toNum(d.warnAbove);
        const wb = toNum(d.warnBelow);
        if ((ca !== null && v > ca) || (cb !== null && v < cb)) {
            return 'crit';
        }
        if ((wa !== null && v > wa) || (wb !== null && v < wb)) {
            return 'warn';
        }
        return 'ok';
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const lang = this.ghLang();
        const demo = !isOid(d.oid);
        const factor = toNum(d.factor) ?? 1;
        const raw = this.ghNum(d.oid, DEMO.val);
        const v = raw === null ? null : raw * factor;
        const dec = Math.max(0, Math.min(4, toNum(d.decimals) ?? 1));
        const unit = d.unit || (demo ? DEMO.unit : '');
        const title = d.title || (demo ? GlashausWidget.tr('demo_value_title') : '');
        const accent = this.ghAccent('', 'home');
        const kind = this.status(v);
        const size = d.size || 'big';
        const fontSize = size === 'big' ? 46 : size === 'medium' ? 34 : 24;
        // rough width of value + unit in em, so that long numbers shrink instead of being cut off
        const len = fmtNum(v, dec, lang).length * 0.56 + (unit ? unit.length * 0.32 + 0.15 : 0);
        const showChart = isTrue(d.chart, true);
        const hours = Math.max(1, toNum(d.hours) || 24);
        const rawHist = demo ? demoCurve(hours, DEMO.val - 0.6, 1.4) : this.state.hist;
        const hist = rawHist && factor !== 1 ? rawHist.map(([t, y]): [number, number] => [t, y * factor]) : rawHist;
        const pillText =
            kind === 'crit'
                ? d.textCrit || GlashausWidget.tr('status_crit')
                : kind === 'warn'
                  ? d.textWarn || GlashausWidget.tr('status_warn')
                  : d.textOk || GlashausWidget.tr('status_ok');

        return (
            <div className={this.ghClass('gh-val')}>
                <div className="gh-val-box">
                    <div className="gh-h">
                        <h2 className="gh-title">
                            <GhIconBox
                                name={this.ghIcon()}
                                color={accent}
                            />
                            <span className="gh-val-t">{title}</span>
                        </h2>
                        {isTrue(d.pill) && v !== null ? (
                            <GhPill kind={kind}>
                                <span className="gh-val-pt">{pillText}</span>
                            </GhPill>
                        ) : null}
                    </div>
                    <div
                        className="gh-num gh-val-n"
                        style={
                            { '--gh-val-fs': `${fontSize}px`, '--gh-val-len': Math.max(1, len) } as React.CSSProperties
                        }
                    >
                        <GhNumber
                            value={v}
                            dec={dec}
                            lang={lang}
                        />
                        {unit ? <span className="gh-unit">{unit}</span> : null}
                    </div>
                    {d.sub ? <div className="gh-muted gh-small gh-val-sub">{d.sub}</div> : null}
                    {showChart ? (
                        <div className="gh-val-chart">
                            <GhSpark
                                series={hist ? [{ pts: hist, color: accent, fill: true }] : []}
                                dec={dec}
                                unit={unit}
                                lang={lang}
                                empty={hist === null ? ' ' : GlashausWidget.tr('no_data')}
                            />
                        </div>
                    ) : null}
                </div>
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}
