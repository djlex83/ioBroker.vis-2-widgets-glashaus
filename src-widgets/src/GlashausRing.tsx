/* Ring: circular progress (GhRing) with a big centered value, unit, label and an optional text below,
 * e.g. the state of charge of a battery. Color by accent or by warning / critical limits. */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps } from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { GhIconBox, GhNumber, GhRing, type GhPillKind } from './core/components';
import { clamp, fmtNum, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';

interface RingRxData {
    oid: string;
    title: string;
    icon: string;
    iconCustom: string;
    accent: string;
    color: string;
    min: number | string;
    max: number | string;
    unit: string;
    decimals: number | string;
    label: string;
    sub: string;
    showTitle: boolean | string;
    thickness: number | string;
    ringSize: number | string;
    warnBelow: number | string;
    critBelow: number | string;
    warnAbove: number | string;
    critAbove: number | string;
}

const DEMO_VALUE = 78;

/* Root and ring box are size containers: the ring fills the smaller side (or the fixed size),
 * the number scales with the ring, wide tiles put the text beside the ring. */
const CSS = `
.gh.gh-rg{padding:0;container:gh-rg/size}
.gh-rg-box{flex:1;min-height:0;display:flex;flex-direction:column;padding:20px}
.gh-rg .gh-h{margin-bottom:10px;flex-wrap:nowrap}
.gh-rg-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-rg-body{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;gap:8px}
.gh-rg-wrap{flex:1;min-height:0;width:100%;container-type:size;display:grid;place-items:center}
.gh-rg-wrap>.gh-ring{--gh-sz:var(--gh-rg-rs)!important}
.gh-rg-in{display:flex;flex-direction:column;align-items:center;justify-content:center;max-width:78%;line-height:1}
.gh-rg-v{font-size:calc(var(--gh-rg-rs) * var(--gh-rg-f, .25));white-space:nowrap}
.gh-rg-v .gh-unit{font-size:.46em;margin-left:.12em}
.gh-rg-l{margin-top:calc(var(--gh-rg-rs) * .04);font-size:max(10px,calc(var(--gh-rg-rs) * .075));color:var(--gh-fg-2);
  max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0}
.gh-rg-sub{flex:none;max-width:100%;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-variant-numeric:tabular-nums}
.gh-rg-nodata .gh-rg-v{color:var(--gh-fg-3)}
@container (max-width:100px) or (max-height:100px){.gh-rg-l{display:none}}
@container gh-rg (max-width:170px) or (max-height:170px){
  .gh-rg-box{padding:12px}
  .gh-rg .gh-h{margin-bottom:6px}
  .gh-rg .gh-ico{width:26px;height:26px;border-radius:8px}
  .gh-rg .gh-ico svg{width:15px;height:15px}
  .gh-rg .gh-title{font-size:13.5px;gap:8px}
  .gh-rg-body{gap:4px}
  .gh-rg-sub{font-size:11.5px}
}
@container gh-rg (min-aspect-ratio:9/5) and (min-width:260px){
  .gh-rg-body.gh-rg-hassub{flex-direction:row;align-items:stretch;gap:18px}
  .gh-rg-hassub .gh-rg-wrap{flex:0 0 46%;width:auto;height:100%}
  .gh-rg-hassub .gh-rg-sub{flex:1;align-self:center;text-align:left;white-space:normal;font-size:14px;
    display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}
}
@container gh-rg (min-width:320px) and (min-height:320px){
  .gh-rg-box{padding:24px}
  .gh-rg-sub{font-size:14px}
}
`;

export default class GlashausRing extends GlashausWidget<RingRxData> {
    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('ring', CSS);
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausRing',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Ring',
            visWidgetLabel: 'ring_widget',
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
                                if (common.unit && (!data.unit || data.unit === '%') && common.unit !== data.unit) {
                                    data.unit = common.unit;
                                    changed = true;
                                }
                                const untouched = (toNum(data.min) ?? 0) === 0 && (toNum(data.max) ?? 100) === 100;
                                if (
                                    untouched &&
                                    typeof common.min === 'number' &&
                                    typeof common.max === 'number' &&
                                    common.max > common.min
                                ) {
                                    data.min = common.min;
                                    data.max = common.max;
                                    changed = true;
                                }
                                if (changed) {
                                    changeData(data);
                                }
                            },
                        },
                        { name: 'title', label: 'title' },
                        { name: 'showTitle', label: 'ring_show_title', type: 'checkbox', default: true },
                        ...GlashausWidget.iconFields('batt'),
                        ...GlashausWidget.accentFields('', 'batt'),
                        { name: 'min', label: 'ring_min', type: 'number', default: 0 },
                        { name: 'max', label: 'ring_max', type: 'number', default: 100 },
                        { name: 'unit', label: 'unit', default: '%' },
                        { name: 'decimals', label: 'decimals', type: 'number', min: 0, max: 4, default: 0 },
                        { name: 'label', label: 'ring_label', tooltip: 'ring_label_tip' },
                        { name: 'sub', label: 'ring_sub', tooltip: 'ring_sub_tip' },
                        {
                            name: 'thickness',
                            label: 'ring_thickness',
                            type: 'slider',
                            min: 2,
                            max: 20,
                            step: 1,
                            default: 7,
                        },
                        {
                            name: 'ringSize',
                            label: 'ring_size',
                            type: 'number',
                            min: 0,
                            max: 1000,
                            default: 0,
                            tooltip: 'ring_size_tip',
                        },
                    ],
                },
                {
                    name: 'limits',
                    label: 'group_ring_limits',
                    fields: [
                        {
                            name: 'ringLimitsHelp',
                            type: 'help',
                            text: `${ADAPTER}_ring_limits_help`,
                        },
                        { name: 'critBelow', label: 'ring_crit_below', type: 'number' },
                        { name: 'warnBelow', label: 'ring_warn_below', type: 'number' },
                        { name: 'warnAbove', label: 'ring_warn_above', type: 'number' },
                        { name: 'critAbove', label: 'ring_crit_above', type: 'number' },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 220, height: 240, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_ring.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausRing.getWidgetInfo();
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
        const v = this.ghNum(d.oid, DEMO_VALUE);
        let min = toNum(d.min) ?? 0;
        let max = toNum(d.max) ?? 100;
        if (max === min) {
            max = min + 1;
        }
        if (max < min) {
            [min, max] = [max, min];
        }
        const frac = v === null ? null : (v - min) / (max - min);
        const dec = clamp(Math.round(toNum(d.decimals) ?? 0), 0, 4);
        const unit = d.unit ?? '';
        const kind = this.status(v);
        const accent = this.ghAccent('', 'batt');
        const color = kind === 'crit' ? 'var(--gh-crit)' : kind === 'warn' ? 'var(--gh-warn)' : accent;
        const title = d.title || (demo ? GlashausWidget.tr('ring_demo_title') : '');
        const label = d.label || (demo ? GlashausWidget.tr('ring_demo_label') : '');
        const sub = d.sub || (demo ? GlashausWidget.tr('ring_demo_sub') : '');
        const showTitle = isTrue(d.showTitle, true) && !!title;
        const thick = clamp(toNum(d.thickness) ?? 7, 1, 24);
        const px = toNum(d.ringSize) || 0;
        const rs = px > 0 ? `min(${px}px, 100cqw, 100cqh)` : 'min(100cqw, 100cqh)';

        // shrink the number for long values so that it stays inside the ring
        const text = fmtNum(v, dec, lang);
        const len = text.length * 0.6 + unit.length * 0.3 + 0.25;
        const f = Math.min(0.27, (0.72 - thick * 0.006) / Math.max(1, len));
        const aria = `${title ? `${title}: ` : ''}${text}${unit ? ` ${unit}` : ''}${label ? `, ${label}` : ''}`;

        return (
            <div className={this.ghClass(`gh-rg${v === null ? ' gh-rg-nodata' : ''}`)}>
                <div className="gh-rg-box">
                    {showTitle ? (
                        <div className="gh-h">
                            <h2 className="gh-title">
                                <GhIconBox
                                    name={this.ghIcon()}
                                    color={color}
                                />
                                <span className="gh-rg-t">{title}</span>
                            </h2>
                        </div>
                    ) : null}
                    <div className={`gh-rg-body${sub ? ' gh-rg-hassub' : ''}`}>
                        <div
                            className="gh-rg-wrap"
                            role="img"
                            aria-label={aria}
                            style={{ '--gh-rg-rs': rs, '--gh-rg-f': f.toFixed(3) } as React.CSSProperties}
                        >
                            <GhRing
                                value={frac}
                                stroke={thick}
                                color={color}
                            >
                                <div className="gh-rg-in">
                                    <div className="gh-num gh-rg-v">
                                        <GhNumber
                                            value={v}
                                            dec={dec}
                                            lang={lang}
                                        />
                                        {unit ? <span className="gh-unit">{unit}</span> : null}
                                    </div>
                                    {label && !(px > 0 && px < 100) ? <div className="gh-rg-l">{label}</div> : null}
                                </div>
                            </GhRing>
                        </div>
                        {sub ? <div className="gh-rg-sub gh-muted gh-small">{sub}</div> : null}
                    </div>
                </div>
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}
