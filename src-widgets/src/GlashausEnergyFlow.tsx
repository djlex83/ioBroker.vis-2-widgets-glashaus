/* Energy flow: PV, house, battery with state-of-charge ring, grid, optional wallbox and an extra consumer.
 * Glowing dots run along the lines in the direction of the energy; speed and density follow the power.
 * Layout "cross" (star around a hub that shows the self-sufficiency, as on the Glashaus energy page),
 * "row" (all nodes on one bus line, for wide and low widgets) or "column" (the bus from top to bottom,
 * for narrow and tall widgets). */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    RxWidgetInfoAttributesField,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { GhIcon, GhIconBox, GhNumber, GhPill, GhRing } from './core/components';
import { clamp, fmtNum, fmtPower, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';
import { IDLE_W, busSegments, computeFlows, type Flows, type NodeKey, type Readings } from './energyflow/model';
import { COLUMN_GAP, computeLayout, type FlowLayout, type LNode, type LayoutMode } from './energyflow/layout';
import { FlowPainter, type PaintPath } from './energyflow/painter';

interface EnergyFlowRxData {
    title: string;
    icon: string;
    iconCustom: string;
    accent: string;
    color: string;
    layout: 'auto' | LayoutMode;
    powerUnit: 'W' | 'kW';
    showPill: boolean | string;
    pvOid: string;
    pvLabel: string;
    battMode: 'signed' | 'split';
    battOid: string;
    battSign: 'charge' | 'discharge';
    battChargeOid: string;
    battDischargeOid: string;
    socOid: string;
    battLabel: string;
    gridMode: 'signed' | 'split';
    gridOid: string;
    gridSign: 'import' | 'export';
    gridImportOid: string;
    gridExportOid: string;
    gridLabel: string;
    houseOid: string;
    houseIncl: boolean | string;
    houseLabel: string;
    showWallbox: boolean | string;
    wallboxOid: string;
    wallboxLabel: string;
    wbAccent: string;
    wbColor: string;
    showExtra: boolean | string;
    extraOid: string;
    extraLabel: string;
    extraIcon: string;
    extraIconCustom: string;
    extraAccent: string;
    extraColor: string;
    showSummary: boolean | string;
    autarkyOid: string;
    pvTodayOid: string;
    pvTodayUnit: 'kWh' | 'Wh';
}

interface EnergyFlowState extends VisRxWidgetState {
    /** Size of the widget and of the flow area (px) */
    rw: number;
    rh: number;
    fw: number;
    fh: number;
    /** Tick of the demo values */
    demoT: number;
}

interface Measured {
    r: Readings;
    soc: number | null;
    autToday: number | null;
    pvToday: number | null;
}

interface NodeInfo {
    value: number | null;
    icon: string;
    label: string;
    /** State of charge 0..1 (battery only) */
    ring?: number;
}

const POWER_IDS = [
    'pvOid',
    'houseOid',
    'battOid',
    'battChargeOid',
    'battDischargeOid',
    'socOid',
    'gridOid',
    'gridImportOid',
    'gridExportOid',
    'wallboxOid',
    'extraOid',
] as const;

/* module-level name EF_CSS: a const named CSS would shadow the global CSS (CSS.supports, CSS.escape) */
const EF_CSS = `
.gh-ef .gh-h{flex-wrap:nowrap;margin-bottom:12px}
.gh-ef .gh-h .gh-title{flex:1 1 auto}
.gh-ef-tt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-ef .gh-h .gh-pill{flex:none;max-width:60%}
.gh-ef-flow{position:relative;flex:1 1 auto;min-height:0;min-width:0}
.gh-ef-flow canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.gh-ef-node{position:absolute;display:flex;flex-direction:column;align-items:center;text-align:center;transform:translateX(-50%);transition:opacity .6s var(--gh-ease)}
.gh-ef-node.dim{opacity:.42}
.gh-ef-txt{display:flex;flex-direction:column;align-items:center;min-width:0;max-width:100%}
.gh-ef-node.up{flex-direction:column-reverse;transform:translate(-50%,-100%)}
.gh-ef-node.up .gh-ef-txt{flex-direction:column-reverse}
.gh-ef-node.up .gh-ef-val{margin:0 0 6px}
.gh-ef-column .gh-ef-node{flex-direction:row;text-align:left;transform:translateY(-50%)}
.gh-ef-column .gh-ef-txt{align-items:flex-start;flex:1 1 auto}
.gh-ef-column .gh-ef-val{margin-top:0}
.gh-ef-disc{position:relative;width:var(--gh-ef-d);height:var(--gh-ef-d);flex:none;border-radius:50%;display:grid;place-items:center;color:var(--gh-c)}
.gh-ef-cross .gh-ef-disc{background:var(--gh-glass);-webkit-backdrop-filter:blur(20px) saturate(150%);backdrop-filter:blur(20px) saturate(150%);box-shadow:inset 0 1px 0 var(--gh-glass-hi),inset 0 0 0 1px var(--gh-stroke),0 1px 2px var(--gh-edge),0 18px 34px -22px var(--gh-shadow)}
.gh-ef-row .gh-ef-disc,.gh-ef-column .gh-ef-disc{background:color-mix(in srgb,var(--gh-c) 15%,transparent);box-shadow:0 0 0 0 color-mix(in srgb,var(--gh-c) 40%,transparent)}
.gh-ef-row .gh-ef-node.on .gh-ef-disc,.gh-ef-column .gh-ef-node.on .gh-ef-disc{animation:gh-ef-pulse 2.8s ease-out infinite}
@keyframes gh-ef-pulse{70%{box-shadow:0 0 0 12px transparent}}
.gh-ef-disc>.gh-ring{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none}
.gh-ef-val{display:block;font-size:var(--gh-ef-fs);line-height:1.15;margin-top:6px;white-space:nowrap}
.gh-ef-val .gh-unit{font-size:max(10px,.52em)}
.gh-ef-lbl{display:block;max-width:100%;font-size:11.5px;line-height:15px;color:var(--gh-fg-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-ef-hub{position:absolute;transform:translate(-50%,-50%);--gh-ef-d:var(--gh-ef-hd)}
.gh-ef-hub .gh-ef-disc{color:var(--gh-fg)}
.gh-ef-hubtxt{display:flex;flex-direction:column;align-items:center;line-height:1.05}
.gh-ef-hubtxt b{font-size:max(12px,calc(var(--gh-ef-hd)*.22))}
.gh-ef-hubtxt small{font-size:max(9px,calc(var(--gh-ef-hd)*.14));white-space:nowrap;color:var(--gh-fg-2);margin-top:2px}
.gh-ef-glow{position:absolute;border-radius:50%;pointer-events:none;background:radial-gradient(circle,color-mix(in srgb,var(--gh-sun) 42%,transparent),transparent 62%);transform:translate(-50%,-50%) scale(var(--gh-ef-s,1));opacity:var(--gh-ef-o,1);transition:opacity 1s var(--gh-ease),transform 1s var(--gh-ease);animation:gh-ef-breathe 5s ease-in-out infinite}
@keyframes gh-ef-breathe{50%{filter:brightness(1.25)}}
.gh-ef-stats{display:grid;grid-template-columns:repeat(var(--gh-ef-n),minmax(0,1fr));gap:10px;margin-top:12px;flex:none}
.gh-ef-stats>div{padding:11px 14px;border-radius:var(--gh-r-m);background:var(--gh-track);min-width:0}
.gh-ef-stats b{display:block;font-size:21px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-ef-stats>div>span{display:block;font-size:12px;color:var(--gh-fg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-ef.gh-ef-xs{padding:14px}
.gh-ef.gh-ef-xs .gh-h{margin-bottom:6px}
.gh-ef.gh-ef-xs .gh-title{font-size:14px;gap:8px}
.gh-ef.gh-ef-xs .gh-ico{width:28px;height:28px;border-radius:9px}
.gh-ef.gh-ef-xs .gh-ico svg{width:16px;height:16px}
`;

/** hidden-predicate of the ID fields: hidden while the battery / grid IDs are given the other way */
const notMode =
    (key: 'battMode' | 'gridMode', mode: 'signed' | 'split') =>
    (data: WidgetData): boolean =>
        (data[key] === 'split' ? 'split' : 'signed') !== mode;

/** Fields of an optional node (wallbox, extra consumer): hidden while the node is off */
function nodeFields(
    flag: 'showWallbox' | 'showExtra',
    fields: RxWidgetInfoAttributesField[],
): RxWidgetInfoAttributesField[] {
    return fields.map(f => ({
        ...f,
        hidden: (data: WidgetData) =>
            !isTrue(data[flag]) ||
            // own color only with accent "custom"
            (!!f.name?.endsWith('color') && data[f.name.replace(/color$/, 'accent')] !== 'custom'),
    }));
}

/** Watts → number, decimals and unit as fmtPower() shows them (for the animated number) */
function powerParts(w: number | null, lang: string): { v: number | null; dec: number; unit: string } {
    if (w === null) {
        return { v: null, dec: 0, unit: 'W' };
    }
    const a = Math.abs(w);
    const unit = fmtPower(a, lang).unit;
    if (unit === 'kW') {
        return { v: a / 1000, dec: a >= 10000 ? 1 : 2, unit };
    }
    return { v: Math.round(a), dec: 0, unit };
}

/** "Label 1,25 kW" of a node (tooltip and aria-label) */
function nodeText(info: NodeInfo, lang: string): string {
    const p = fmtPower(info.value === null ? null : Math.abs(info.value), lang);
    return `${info.label} ${p.v} ${p.unit}`;
}

/** Ring around a disc (state of charge, self-sufficiency); stroke in px */
function DiscRing({ value, size, stroke }: { value: number | null; size: number; stroke: number }): React.JSX.Element {
    return (
        <GhRing
            value={value}
            size={size}
            stroke={(stroke * 100) / size}
        />
    );
}

/** Demo: a sunny afternoon (PV 4.2 kW, house 1.1 kW, battery charging 1.6 kW at 64 %, export 1.5 kW), gently varying */
function demoValues(t: number, wb: boolean, extra: boolean): Measured {
    const s = t / 1000;
    const pv = 4200 + 220 * Math.sin(s / 23) + 70 * Math.sin(s / 6.1);
    const house = 1100 + 110 * Math.sin(s / 17 + 1.3);
    const ext = extra ? 420 + 40 * Math.sin(s / 13) : 0;
    const charge = 1600 + 100 * Math.sin(s / 29 + 0.7);
    const grid = house + ext + charge - pv;
    return {
        r: {
            pv: Math.round(pv),
            batt: -Math.round(charge),
            grid: Math.round(grid),
            house: null,
            houseIncl: true,
            wb: wb ? 0 : null,
            extra: extra ? Math.round(ext) : null,
        },
        soc: 64 + 0.4 * Math.sin(s / 90),
        autToday: 84,
        pvToday: 19.9,
    };
}

export default class GlashausEnergyFlow extends GlashausWidget<EnergyFlowRxData, EnergyFlowState> {
    private rootRef = React.createRef<HTMLDivElement>();

    private flowRef = React.createRef<HTMLDivElement>();

    private canvasRef = React.createRef<HTMLCanvasElement>();

    private ro: ResizeObserver | null = null;

    private roRaf = 0;

    private obsRoot: HTMLElement | null = null;

    private obsFlow: HTMLElement | null = null;

    private painter: FlowPainter | null = null;

    private painterCanvas: HTMLCanvasElement | null = null;

    private demoTimer: ReturnType<typeof setInterval> | undefined;

    /** Paths and style of the last render, handed to the painter after the commit */
    private paint: { paths: PaintPath[]; layout: FlowLayout | null } = { paths: [], layout: null };

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('energyflow', EF_CSS);
        this.state = { ...this.state, rw: 0, rh: 0, fw: 0, fh: 0, demoT: Date.now() };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausEnergyFlow',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'EnergyFlow',
            visWidgetLabel: 'energyflow_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields('bolt'),
                        ...GlashausWidget.accentFields('', 'sun'),
                        {
                            name: 'layout',
                            label: 'ef_layout',
                            type: 'select',
                            options: [
                                { value: 'auto', label: 'ef_layout_auto' },
                                { value: 'cross', label: 'ef_layout_cross' },
                                { value: 'row', label: 'ef_layout_row' },
                                { value: 'column', label: 'ef_layout_column' },
                            ],
                            default: 'auto',
                        },
                        {
                            name: 'powerUnit',
                            label: 'ef_power_unit',
                            type: 'select',
                            noTranslation: true,
                            options: [
                                { value: 'W', label: 'W' },
                                { value: 'kW', label: 'kW' },
                            ],
                            default: 'W',
                            tooltip: 'ef_power_unit_tip',
                        },
                        { name: 'showPill', label: 'ef_show_pill', type: 'checkbox', default: true },
                    ],
                },
                {
                    name: 'ef_pv',
                    label: 'ef_group_pv',
                    fields: [
                        { name: 'pvOid', label: 'ef_pv_oid', type: 'id' },
                        // a default value: vis-2 shows a group without any default collapsed and switched off
                        { name: 'pvLabel', label: 'ef_label', default: '' },
                    ],
                },
                {
                    name: 'ef_battery',
                    label: 'ef_group_batt',
                    fields: [
                        {
                            name: 'battMode',
                            label: 'ef_mode',
                            type: 'select',
                            options: [
                                { value: 'signed', label: 'ef_mode_signed' },
                                { value: 'split', label: 'ef_mode_split' },
                            ],
                            default: 'signed',
                        },
                        { name: 'battOid', label: 'ef_batt_oid', type: 'id', hidden: notMode('battMode', 'signed') },
                        {
                            name: 'battSign',
                            label: 'ef_sign',
                            type: 'select',
                            options: [
                                { value: 'charge', label: 'ef_sign_charge' },
                                { value: 'discharge', label: 'ef_sign_discharge' },
                            ],
                            default: 'charge',
                            hidden: notMode('battMode', 'signed'),
                        },
                        {
                            name: 'battChargeOid',
                            label: 'ef_batt_charge_oid',
                            type: 'id',
                            hidden: notMode('battMode', 'split'),
                        },
                        {
                            name: 'battDischargeOid',
                            label: 'ef_batt_discharge_oid',
                            type: 'id',
                            hidden: notMode('battMode', 'split'),
                        },
                        { name: 'socOid', label: 'ef_soc_oid', type: 'id' },
                        { name: 'battLabel', label: 'ef_label' },
                    ],
                },
                {
                    name: 'ef_grid',
                    label: 'ef_group_grid',
                    fields: [
                        {
                            name: 'gridMode',
                            label: 'ef_mode',
                            type: 'select',
                            options: [
                                { value: 'signed', label: 'ef_mode_signed' },
                                { value: 'split', label: 'ef_mode_split' },
                            ],
                            default: 'signed',
                        },
                        { name: 'gridOid', label: 'ef_grid_oid', type: 'id', hidden: notMode('gridMode', 'signed') },
                        {
                            name: 'gridSign',
                            label: 'ef_sign',
                            type: 'select',
                            options: [
                                { value: 'import', label: 'ef_sign_import' },
                                { value: 'export', label: 'ef_sign_export' },
                            ],
                            default: 'import',
                            hidden: notMode('gridMode', 'signed'),
                        },
                        {
                            name: 'gridImportOid',
                            label: 'ef_grid_import_oid',
                            type: 'id',
                            hidden: notMode('gridMode', 'split'),
                        },
                        {
                            name: 'gridExportOid',
                            label: 'ef_grid_export_oid',
                            type: 'id',
                            hidden: notMode('gridMode', 'split'),
                        },
                        { name: 'gridLabel', label: 'ef_label', tooltip: 'ef_grid_label_tip' },
                    ],
                },
                {
                    name: 'ef_house',
                    label: 'ef_group_house',
                    fields: [
                        { name: 'houseOid', label: 'ef_house_oid', type: 'id', tooltip: 'ef_house_tip' },
                        {
                            name: 'houseIncl',
                            label: 'ef_house_incl',
                            type: 'checkbox',
                            default: true,
                            hidden: (data: WidgetData) =>
                                !isOid(data.houseOid) || (!isTrue(data.showWallbox) && !isTrue(data.showExtra)),
                        },
                        { name: 'houseLabel', label: 'ef_label' },
                    ],
                },
                {
                    name: 'ef_wallbox',
                    label: 'ef_group_wallbox',
                    fields: [
                        { name: 'showWallbox', label: 'ef_show_wallbox', type: 'checkbox', default: false },
                        ...nodeFields('showWallbox', [
                            { name: 'wallboxOid', label: 'ef_wallbox_oid', type: 'id' },
                            { name: 'wallboxLabel', label: 'ef_label' },
                            ...GlashausWidget.accentFields('wb', 'teal'),
                        ]),
                    ],
                },
                {
                    name: 'ef_extra',
                    label: 'ef_group_extra',
                    fields: [
                        { name: 'showExtra', label: 'ef_show_extra', type: 'checkbox', default: false },
                        ...nodeFields('showExtra', [
                            { name: 'extraOid', label: 'ef_extra_oid', type: 'id' },
                            { name: 'extraLabel', label: 'ef_label' },
                            ...GlashausWidget.iconFields('flame', 'extra'),
                            ...GlashausWidget.accentFields('extra', 'heat'),
                        ]),
                    ],
                },
                {
                    name: 'ef_summary',
                    label: 'ef_group_summary',
                    fields: [
                        { name: 'showSummary', label: 'ef_show_summary', type: 'checkbox', default: true },
                        { name: 'autarkyOid', label: 'ef_autarky_oid', type: 'id' },
                        { name: 'pvTodayOid', label: 'ef_pv_today_oid', type: 'id' },
                        {
                            name: 'pvTodayUnit',
                            label: 'ef_pv_today_unit',
                            type: 'select',
                            noTranslation: true,
                            options: [
                                { value: 'kWh', label: 'kWh' },
                                { value: 'Wh', label: 'Wh' },
                            ],
                            default: 'kWh',
                        },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 520, height: 520, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_energyflow.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausEnergyFlow.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.attach();
        this.syncDemo();
        this.syncPainter();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: EnergyFlowState): void {
        super.componentDidUpdate(prevProps, prevState);
        this.attach();
        this.syncDemo();
        this.syncPainter();
    }

    componentWillUnmount(): void {
        this.ro?.disconnect();
        this.ro = null;
        cancelAnimationFrame(this.roRaf);
        this.painter?.destroy();
        this.painter = null;
        // a remount of this instance attaches observer and painter again
        this.obsRoot = null;
        this.obsFlow = null;
        this.painterCanvas = null;
        if (this.demoTimer) {
            clearInterval(this.demoTimer);
            this.demoTimer = undefined;
        }
        super.componentWillUnmount();
    }

    /** No object ID configured at all: show the demo afternoon */
    private isDemo(): boolean {
        const d = this.state.rxData;
        return !POWER_IDS.some(k => isOid(d[k]));
    }

    /** Observers and painter follow the DOM elements (they can change when vis-2 re-creates the widget) */
    private attach(): void {
        const root = this.rootRef.current;
        const flow = this.flowRef.current;
        if (root && flow && (root !== this.obsRoot || flow !== this.obsFlow)) {
            this.ro?.disconnect();
            this.obsRoot = root;
            this.obsFlow = flow;
            if (typeof ResizeObserver !== 'undefined') {
                this.ro = new ResizeObserver(() => {
                    // next frame: avoids "ResizeObserver loop" errors when the new layout resizes the flow area
                    cancelAnimationFrame(this.roRaf);
                    this.roRaf = requestAnimationFrame(this.measure);
                });
                this.ro.observe(root);
                this.ro.observe(flow);
            }
            this.measure();
        }
        const cv = this.canvasRef.current;
        if (cv && cv !== this.painterCanvas) {
            this.painter?.destroy();
            this.painter = new FlowPainter(cv);
            this.painterCanvas = cv;
        }
    }

    private measure = (): void => {
        const root = this.obsRoot;
        const flow = this.obsFlow;
        if (!root || !flow) {
            return;
        }
        const rw = root.clientWidth;
        const rh = root.clientHeight;
        const fw = flow.clientWidth;
        const fh = flow.clientHeight;
        const s = this.state;
        if (rw !== s.rw || rh !== s.rh || fw !== s.fw || fh !== s.fh) {
            this.setState({ rw, rh, fw, fh });
        }
    };

    private syncDemo(): void {
        const demo = this.isDemo();
        if (demo && !this.demoTimer) {
            this.demoTimer = setInterval(() => {
                // no re-render (and canvas frame) while the page is hidden
                if (!document.hidden) {
                    this.setState({ demoT: Date.now() });
                }
            }, 2000);
        } else if (!demo && this.demoTimer) {
            clearInterval(this.demoTimer);
            this.demoTimer = undefined;
        }
    }

    private syncPainter(): void {
        if (!this.painter) {
            return;
        }
        const l = this.paint.layout;
        this.painter.setSize(this.state.fw, this.state.fh);
        this.painter.setPaths(
            this.paint.paths,
            l ? { track: l.track, line: l.line, dot: l.dot } : { track: 6, line: 2, dot: 3 },
        );
    }

    /** Current readings in W (demo values when no power ID is configured) */
    private readValues(demo: boolean): Measured {
        const d = this.state.rxData;
        const pct = (id: unknown): number | null => (isOid(id) ? toNum(this.ghVal(id)) : null);
        const pvToday = pct(d.pvTodayOid);
        const summary = {
            autToday: pct(d.autarkyOid),
            pvToday: pvToday === null ? null : pvToday * (d.pvTodayUnit === 'Wh' ? 0.001 : 1),
        };
        if (demo) {
            const m = demoValues(this.state.demoT, isTrue(d.showWallbox), isTrue(d.showExtra));
            // the summary IDs may be set before the power IDs
            return {
                ...m,
                autToday: isOid(d.autarkyOid) ? summary.autToday : m.autToday,
                pvToday: isOid(d.pvTodayOid) ? summary.pvToday : m.pvToday,
            };
        }
        const f = d.powerUnit === 'kW' ? 1000 : 1;
        const p = (id: unknown): number | null => {
            if (!isOid(id)) {
                return null;
            }
            const v = toNum(this.ghVal(id));
            return v === null ? null : v * f;
        };
        let batt: number | null;
        if (d.battMode === 'split') {
            const c = p(d.battChargeOid);
            const dis = p(d.battDischargeOid);
            batt = c === null && dis === null ? null : Math.abs(dis ?? 0) - Math.abs(c ?? 0);
        } else {
            const v = p(d.battOid);
            batt = v === null ? null : d.battSign === 'discharge' ? v : -v;
        }
        let grid: number | null;
        if (d.gridMode === 'split') {
            const imp = p(d.gridImportOid);
            const exp = p(d.gridExportOid);
            grid = imp === null && exp === null ? null : Math.abs(imp ?? 0) - Math.abs(exp ?? 0);
        } else {
            const v = p(d.gridOid);
            grid = v === null ? null : d.gridSign === 'export' ? -v : v;
        }
        return {
            r: {
                pv: p(d.pvOid),
                batt,
                grid,
                house: p(d.houseOid),
                houseIncl: isTrue(d.houseIncl, true),
                wb: isTrue(d.showWallbox) ? p(d.wallboxOid) : null,
                extra: isTrue(d.showExtra) ? p(d.extraOid) : null,
            },
            soc: pct(d.socOid),
            ...summary,
        };
    }

    /** Nodes to show */
    private nodeKeys(demo: boolean): Set<NodeKey> {
        const d = this.state.rxData;
        const keys = new Set<NodeKey>(['house']);
        const any = (...ids: unknown[]): boolean => demo || ids.some(isOid);
        if (any(d.pvOid)) {
            keys.add('pv');
        }
        const battIds = d.battMode === 'split' ? [d.battChargeOid, d.battDischargeOid] : [d.battOid];
        if (any(...battIds, d.socOid)) {
            keys.add('batt');
        }
        const gridIds = d.gridMode === 'split' ? [d.gridImportOid, d.gridExportOid] : [d.gridOid];
        if (any(...gridIds)) {
            keys.add('grid');
        }
        if (isTrue(d.showWallbox)) {
            keys.add('wb');
        }
        if (isTrue(d.showExtra)) {
            keys.add('extra');
        }
        return keys;
    }

    /** Value (W, signed like the flows), icon, label and state-of-charge ring of a node */
    private nodeInfo(key: NodeKey, mode: LayoutMode, f: Flows, m: Measured): NodeInfo {
        const d = this.state.rxData;
        const tr = GlashausWidget.tr;
        const txt = GlashausWidget.ghText;
        switch (key) {
            case 'pv': {
                const value = m.r.pv === null ? null : f.pv;
                return {
                    value,
                    icon: f.pv >= IDLE_W || value === null ? 'sun' : 'moon',
                    label: txt(d.pvLabel) || tr(mode === 'row' ? 'ef_pv_short' : 'ef_pv'),
                };
            }
            case 'batt': {
                const value = m.r.batt === null ? null : f.batt;
                const state =
                    value === null
                        ? ''
                        : f.batt <= -IDLE_W
                          ? tr('ef_charging')
                          : f.batt >= IDLE_W
                            ? tr('ef_discharging')
                            : tr('ef_idle');
                const soc = m.soc === null ? '' : `${fmtNum(m.soc, 0, this.ghLang())} %`;
                return {
                    value,
                    icon: 'batt',
                    label: [txt(d.battLabel) || (soc ? '' : tr('ef_batt')), soc, state].filter(Boolean).join(' · '),
                    ring: m.soc === null ? undefined : m.soc / 100,
                };
            }
            case 'grid': {
                const value = m.r.grid === null ? null : f.grid;
                const dir = value === null ? 0 : f.grid >= IDLE_W ? 1 : f.grid <= -IDLE_W ? -1 : 0;
                return {
                    value,
                    icon: 'grid',
                    label: txt(d.gridLabel) || tr(dir > 0 ? 'ef_import' : dir < 0 ? 'ef_export' : 'ef_grid'),
                };
            }
            case 'wb':
                return {
                    value: m.r.wb === null ? null : f.wb,
                    icon: 'car',
                    label: txt(d.wallboxLabel) || tr('ef_wallbox'),
                };
            case 'extra':
                return {
                    value: m.r.extra === null ? null : f.extra,
                    icon: this.ghIcon('extra') || 'flame',
                    label: txt(d.extraLabel) || tr('ef_extra'),
                };
            default:
                return { value: f.hasData ? f.house : null, icon: 'home', label: txt(d.houseLabel) || tr('ef_house') };
        }
    }

    private renderNode(n: LNode, l: FlowLayout, info: NodeInfo, color: string): React.JSX.Element {
        const lang = this.ghLang();
        const on = info.value !== null && Math.abs(info.value) >= IDLE_W;
        const pp = powerParts(info.value, lang);
        // cross/row: centered below the disc (row: every second one above); column: right of the disc
        const pos: React.CSSProperties =
            l.mode === 'column'
                ? { left: n.x - l.d / 2, top: n.y, width: l.d + COLUMN_GAP + n.w, gap: COLUMN_GAP }
                : { left: n.x, top: n.up ? n.y + l.d / 2 : n.y - l.d / 2, width: n.w };
        return (
            <div
                key={n.key}
                className={`gh-ef-node${on ? ' on' : ' dim'}${n.up ? ' up' : ''}`}
                style={{ ...pos, '--gh-c': color } as React.CSSProperties}
                title={nodeText(info, lang)}
            >
                <span className="gh-ef-disc">
                    {info.ring !== undefined ? (
                        <DiscRing
                            value={info.ring}
                            size={l.d + 14}
                            stroke={l.mode === 'cross' ? 3 : 2.5}
                        />
                    ) : null}
                    <GhIcon
                        name={info.icon}
                        size={Math.round(l.d * 0.4)}
                    />
                </span>
                {l.values ? (
                    <span className="gh-ef-txt">
                        <b className="gh-ef-val gh-num">
                            {pp.v === null ? (
                                '–'
                            ) : (
                                <GhNumber
                                    key={pp.unit}
                                    value={pp.v}
                                    dec={pp.dec}
                                    lang={lang}
                                />
                            )}
                            {pp.v === null ? null : <span className="gh-unit">{pp.unit}</span>}
                        </b>
                        {l.labels ? <span className="gh-ef-lbl">{info.label}</span> : null}
                    </span>
                ) : null}
            </div>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const tr = GlashausWidget.tr;
        const lang = this.ghLang();
        const demo = this.isDemo();
        const m = this.readValues(demo);
        const f = computeFlows(m.r);
        const keys = this.nodeKeys(demo);
        const { rw, rh, fw, fh } = this.state;
        const mode = d.layout === 'row' || d.layout === 'cross' || d.layout === 'column' ? d.layout : 'auto';
        const ratio = rw / Math.max(1, rh);
        // the layout that suits the shape of the widget ("auto")
        const shape: LayoutMode = ratio < 0.75 ? 'column' : ratio > 1.9 || rh < 300 ? 'row' : 'cross';
        const lowRow = mode === 'row' || (mode === 'auto' && shape === 'row');
        const xs = rw > 0 && (rw < 300 || rh < 200);
        const l = fw > 20 && fh > 20 ? computeLayout(fw, fh, keys, mode, shape) : null;
        const info = new Map(l?.nodes.map(n => [n.key, this.nodeInfo(n.key, l.mode, f, m)]));

        const col: Record<NodeKey, string> = {
            pv: 'var(--gh-sun)',
            batt: 'var(--gh-batt)',
            grid: 'var(--gh-grid)',
            house: 'var(--gh-home)',
            wb: this.ghAccent('wb', 'teal'),
            extra: this.ghAccent('extra', 'heat'),
        };

        // lines for the painter (drawn after the commit)
        const paths: PaintPath[] = [];
        if (l?.mode === 'cross') {
            const power: Record<NodeKey, number> = {
                pv: f.pv,
                grid: f.grid,
                batt: -f.batt,
                house: f.house,
                wb: f.wb,
                extra: f.extra,
            };
            l.paths.forEach(p => {
                const k = p.id as NodeKey;
                paths.push({ id: p.id, pts: p.pts, color: col[k], power: power[k] });
            });
        } else if (l) {
            const segs = busSegments(f, l.order);
            l.paths.forEach((p, i) =>
                paths.push({ id: p.id, pts: p.pts, color: col[segs[i].src], power: segs[i].power }),
            );
        }
        this.paint = { paths, layout: l };

        // status pill
        let pill: { text: string; color: string; live: boolean };
        if (!f.hasData) {
            pill = { text: tr('ef_no_data'), color: 'var(--gh-fg-2)', live: false };
        } else if (f.grid >= IDLE_W) {
            pill = { text: tr('ef_mode_import'), color: 'var(--gh-grid)', live: true };
        } else if (f.grid <= -IDLE_W) {
            pill = { text: tr('ef_mode_export'), color: 'var(--gh-ok)', live: true };
        } else if (f.batt >= IDLE_W && f.batt > f.pv) {
            pill = { text: tr('ef_mode_battery'), color: 'var(--gh-batt)', live: true };
        } else if (f.pv >= IDLE_W) {
            pill = { text: tr('ef_mode_solar'), color: 'var(--gh-sun)', live: true };
        } else {
            pill = { text: tr('ef_mode_self'), color: 'var(--gh-ok)', live: true };
        }

        // summary boxes
        const items: { v: number | null; dec: number; unit: string; label: string }[] = [];
        if (isOid(d.autarkyOid) || demo) {
            items.push({ v: m.autToday, dec: 0, unit: '%', label: tr('ef_autarky_today') });
        } else if (l?.mode !== 'cross') {
            items.push({
                v: f.autarky === null ? null : f.autarky * 100,
                dec: 0,
                unit: '%',
                label: tr('ef_autarky_now'),
            });
        }
        if (isOid(d.pvTodayOid) || demo) {
            items.push({ v: m.pvToday, dec: 1, unit: 'kWh', label: tr('ef_pv_today') });
        }
        items.push({
            v: f.selfUse === null ? null : f.selfUse * 100,
            dec: 0,
            unit: '%',
            label: tr('ef_selfuse_now'),
        });
        if (keys.has('wb') || keys.has('extra')) {
            const t = powerParts(f.hasData ? f.total : null, lang);
            items.push({ v: t.v, dec: t.dec, unit: t.unit, label: tr('ef_total') });
        }
        const maxItems = Math.max(1, Math.floor((rw - 30) / 130));
        const shown = items.slice(0, Math.min(maxItems, 4));
        const showSummary = isTrue(d.showSummary, true) && rh >= (lowRow ? 270 : 400) && rw >= 260;

        const title = GlashausWidget.ghText(d.title) || tr('ef_title_default');
        const pvNode = l?.nodes.find(n => n.key === 'pv');
        const pvOn = f.pv >= IDLE_W;
        const aria = l ? [...info.values()].map(it => nodeText(it, lang)).join(', ') : title;

        return (
            <div
                ref={this.rootRef}
                className={this.ghClass(`gh-ef${xs ? ' gh-ef-xs' : ''}`)}
            >
                <div className="gh-h">
                    <h2 className="gh-title">
                        <GhIconBox
                            name={this.ghIcon()}
                            color={this.ghAccent('', 'sun')}
                        />
                        <span className="gh-ef-tt">{title}</span>
                    </h2>
                    {isTrue(d.showPill, true) && rw >= 230 ? (
                        <GhPill
                            color={pill.color}
                            live={pill.live}
                        >
                            {pill.text}
                        </GhPill>
                    ) : null}
                </div>
                <div
                    ref={this.flowRef}
                    className={`gh-ef-flow gh-ef-${l?.mode || 'cross'}`}
                    role="img"
                    aria-label={aria}
                    style={
                        l
                            ? ({
                                  '--gh-ef-d': `${l.d}px`,
                                  '--gh-ef-hd': `${l.hubD}px`,
                                  '--gh-ef-fs': `${l.fs}px`,
                              } as React.CSSProperties)
                            : undefined
                    }
                >
                    {l?.mode === 'cross' && pvNode && pvOn ? (
                        <div
                            className="gh-ef-glow"
                            style={
                                {
                                    left: pvNode.x,
                                    top: pvNode.y,
                                    width: l.d * 4.2,
                                    height: l.d * 4.2,
                                    '--gh-ef-o': clamp(f.pv / 3500, 0.25, 1),
                                    '--gh-ef-s': 0.75 + 0.25 * clamp(f.pv / 5000, 0, 1),
                                } as React.CSSProperties
                            }
                        />
                    ) : null}
                    <canvas
                        ref={this.canvasRef}
                        aria-hidden="true"
                    />
                    {l?.hub ? (
                        <div
                            className="gh-ef-hub"
                            style={{ left: l.hub.x, top: l.hub.y, '--gh-c': 'var(--gh-fg-2)' } as React.CSSProperties}
                            title={tr('ef_autarky_now')}
                        >
                            <span className="gh-ef-disc">
                                <DiscRing
                                    value={f.autarky}
                                    size={l.hubD + 14}
                                    stroke={2}
                                />
                                <span className="gh-ef-hubtxt">
                                    <b className="gh-num">
                                        {f.autarky === null ? '–' : fmtNum(f.autarky * 100, 0, lang)}
                                        {f.autarky === null ? null : <span className="gh-unit">%</span>}
                                    </b>
                                    {l.hubD >= 52 ? <small>{tr('ef_autark')}</small> : null}
                                </span>
                            </span>
                        </div>
                    ) : null}
                    {l?.nodes.map(n => this.renderNode(n, l, info.get(n.key)!, col[n.key]))}
                </div>
                {showSummary ? (
                    <div
                        className="gh-ef-stats"
                        style={{ '--gh-ef-n': shown.length } as React.CSSProperties}
                    >
                        {shown.map(it => (
                            <div key={it.label}>
                                <b className="gh-num">
                                    {it.v === null ? (
                                        '–'
                                    ) : (
                                        <GhNumber
                                            key={it.unit}
                                            value={it.v}
                                            dec={it.dec}
                                            lang={lang}
                                        />
                                    )}
                                    {it.v === null ? null : <span className="gh-unit">{it.unit}</span>}
                                </b>
                                <span>{it.label}</span>
                            </div>
                        ))}
                    </div>
                ) : null}
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}
