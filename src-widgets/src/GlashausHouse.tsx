/* House model: the isometric glass house of all floors (canvas), drag to rotate, floors exploded or stacked with
 * roof, floor buttons, rooms colored, device symbols at their places (lights glow, open windows blink, motion
 * pulses, temperatures as values) and a room view with the devices of one room.
 * Plan and devices come from two JSON attributes; empty attributes show the invented example house with demo devices. */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import GlashausWidget, { ACCENTS, ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { GhIcon, GhIconBox, GhPill } from './core/components';
import { clamp, fmtNum, toBool, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';
import { HouseEngine, parseRgb, type HouseInsets, type HouseMode, type HouseView, type RGB } from './house/engine';
import {
    parseDevices,
    parsePlan,
    pickJson,
    type HouseDevice,
    type HouseRoom,
    type ParsedDevices,
    type ParsedPlan,
} from './house/plan';

interface HouseRxData {
    title: string;
    icon: string;
    iconCustom: string;
    accent: string;
    color: string;
    showHeader: boolean | string;
    plan: string;
    devices: string;
    view: HouseMode;
    modeSwitch: boolean | string;
    startFloor: string;
    startRoom: string;
    floorPills: boolean | string;
    startAngle: number | string;
    tilt: number | string;
    autoRotate: 'off' | 'sway' | 'spin';
    wallHeight: number | string;
    roof: boolean | string;
    showLabels: boolean | string;
    roomView: boolean | string;
    showHint: boolean | string;
}

interface HouseState extends VisRxWidgetState {
    /** Size of the stage (px) */
    w: number;
    h: number;
    /** Values of the device object IDs */
    vals: Record<string, ioBroker.StateValue | undefined>;
    mode: HouseMode;
    /** Focused floor ID, '' = all */
    focus: string;
    /** Room of the room view: `<floor id>/<room id>` or just `<room id>`, '' = none */
    room: string;
    /** Tick of the demo values */
    demoT: number;
    /** Lights switched in the demo */
    demoOn: Record<string, boolean>;
}

interface DevInfo {
    on: boolean;
    open: boolean;
    motion: boolean;
    known: boolean;
    /** State text, e.g. "on", "22.5 °C · target 23 °C" */
    text: string;
    /** Short value next to the symbol, '' = none */
    value: string;
}

const HOUSE_CSS = `
.gh.gh-house{position:relative;overflow:hidden;padding:0;display:block;--gh-house-m:28px}
.gh.gh-house:focus{outline:none}
.gh-house.gh-house-sm{--gh-house-m:24px}
.gh-house-stage{position:absolute;inset:0;touch-action:pan-y;cursor:grab;-webkit-user-select:none;user-select:none}
.gh-house-stage.drag{cursor:grabbing}
.gh-house-stage.ro{cursor:default;touch-action:auto}
.gh-house-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.gh-house-ov{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.gh-house-dev{position:absolute;left:0;top:0;opacity:0;transition:opacity .4s;--gh-c:var(--gh-fg)}
.gh-house-dev>button{position:absolute;left:calc(var(--gh-house-m)/-2);top:calc(var(--gh-house-m)/-2);width:var(--gh-house-m);height:var(--gh-house-m);border-radius:50%;border:0;padding:0;display:grid;place-items:center;cursor:pointer;pointer-events:auto;color:var(--gh-c);background:var(--gh-glass-strong);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px var(--gh-stroke),0 6px 14px -6px var(--gh-shadow);transition:box-shadow .3s,background .3s,color .3s}
.gh-house-ro .gh-house-dev>button{pointer-events:none}
.gh-house-dev svg{width:calc(var(--gh-house-m)*.55);height:calc(var(--gh-house-m)*.55)}
.gh-house-dev.on>button{background:var(--gh-c);color:var(--gh-bg);box-shadow:0 0 0 5px color-mix(in srgb,var(--gh-c) 25%,transparent),0 6px 18px -4px var(--gh-c)}
.gh-house-dev.na>button{opacity:.55}
.gh-house-dev.open>button{--gh-c:var(--gh-warn);background:var(--gh-c);color:var(--gh-bg);animation:gh-house-blink 1.3s ease-in-out infinite}
@keyframes gh-house-blink{50%{background:var(--gh-glass-strong);color:var(--gh-c);box-shadow:0 0 0 6px color-mix(in srgb,var(--gh-c) 30%,transparent)}}
.gh-house-dev.motion>button{background:var(--gh-c);color:var(--gh-bg)}
.gh-house-dev.motion>button::after{content:'';position:absolute;inset:0;border-radius:50%;animation:gh-house-pulse 1.6s ease-out infinite;pointer-events:none}
@keyframes gh-house-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--gh-c) 60%,transparent)}100%{box-shadow:0 0 0 16px transparent}}
.gh-house-chip{position:absolute;left:calc(var(--gh-house-m)/2 + 3px);top:-10px;height:20px;padding:0 7px;border-radius:99px;font-size:11px;font-weight:600;line-height:20px;white-space:nowrap;color:var(--gh-fg);background:var(--gh-glass-strong);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px var(--gh-stroke);font-variant-numeric:tabular-nums;pointer-events:none;max-width:180px;overflow:hidden;text-overflow:ellipsis}
.gh-house-chip.l{left:auto;right:calc(var(--gh-house-m)/2 + 3px)}
.gh-house-chip small{font-weight:450;color:var(--gh-fg-2);font-size:10.5px;margin-left:4px}
.gh-house-dev.heat .gh-house-chip{color:var(--gh-heat)}
.gh-house-lab{position:absolute;left:0;top:0;opacity:0;transition:opacity .4s;pointer-events:none;white-space:nowrap}
.gh-house-lab>span{display:block;transform:translate(-50%,-50%);text-align:center;font-size:11.5px;font-weight:550;line-height:1.15;color:var(--gh-fg);text-shadow:0 1px 0 var(--gh-bg),0 0 8px var(--gh-bg),0 0 3px var(--gh-bg)}
.gh-house-lab small{display:block;font-weight:400;color:var(--gh-fg-2);font-size:10.5px}
.gh-house-tip{position:absolute;left:0;top:0;padding:6px 10px;border-radius:9px;font-size:12px;font-weight:500;background:var(--gh-fg);color:var(--gh-bg);white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .15s;z-index:3}
.gh-house-head{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px 0;pointer-events:none;z-index:2;min-width:0}
.gh-house-head>*{pointer-events:auto}
.gh-house-head .gh-title{flex:1 1 auto;min-width:0}
.gh-house-tt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-house-sm .gh-house-head{padding:12px 12px 0}
.gh-house-sm .gh-house-head .gh-ico{width:30px;height:30px;border-radius:10px}
.gh-house-sm .gh-house-head .gh-ico svg{width:17px;height:17px}
.gh-house-segs{display:inline-flex;padding:3px;border-radius:99px;background:var(--gh-track);gap:2px;flex:none}
.gh-house-segs button{border:0;background:transparent;height:28px;padding:0 11px;border-radius:99px;font-size:12.5px;font-weight:500;color:var(--gh-fg-2);cursor:pointer;white-space:nowrap;transition:background .45s var(--gh-ease),color .3s}
.gh-house-segs button[aria-pressed='true']{background:var(--gh-fg);color:var(--gh-bg)}
.gh-house-rt{display:flex;align-items:center;gap:12px;min-width:0;flex:1 1 auto}
.gh-house-rt .gh-circ{flex:none;background:var(--gh-glass-strong)}
.gh-house-rt .gh-circ:hover{background:var(--gh-fg)}
.gh-house-rn{display:flex;flex-direction:column;min-width:0;line-height:1.1}
.gh-house-rn small{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--gh-fg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-house-rn b{font-size:21px;font-weight:550;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.gh-house-rn b .gh-it{font-size:1.12em;margin-left:6px;color:var(--gh-fg-2)}
.gh-house-area{flex:none;font-size:13px;color:var(--gh-fg-2);font-variant-numeric:tabular-nums;white-space:nowrap}
.gh-house-floors{position:absolute;right:14px;bottom:14px;display:flex;flex-direction:column;gap:6px;z-index:2}
.gh-house-floors.row{flex-direction:row}
.gh-house-head .gh-house-floors{position:static;flex-direction:row;flex:none}
.gh-house-floors button{min-width:42px;max-width:96px;padding:0 8px;border:0;height:32px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;color:var(--gh-fg-2);background:var(--gh-glass-strong);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px var(--gh-stroke);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:background .3s,color .3s}
.gh-house-floors button[aria-pressed='true']{background:var(--gh-fg);color:var(--gh-bg)}
.gh-house-sm .gh-house-floors{right:10px;bottom:10px;gap:4px}
.gh-house-sm .gh-house-floors button{height:28px;min-width:36px;font-size:11px;border-radius:9px}
.gh-house-hint{position:absolute;left:18px;bottom:14px;font-size:12px;color:var(--gh-fg-3);pointer-events:none;white-space:nowrap}
.gh-house-err{position:absolute;left:14px;display:flex;min-width:0;z-index:3}
.gh-house-err .gh-pill{max-width:100%}
.gh-house .gh-demo-badge{left:18px;right:auto;bottom:12px;z-index:3}
.gh-house-panel{position:absolute;z-index:2;display:flex;flex-direction:column;padding:6px 14px;border-radius:var(--gh-r-l);background:var(--gh-glass-strong);-webkit-backdrop-filter:blur(22px) saturate(150%);backdrop-filter:blur(22px) saturate(150%);box-shadow:inset 0 0 0 1px var(--gh-stroke),0 20px 40px -26px var(--gh-shadow);overflow:auto;overscroll-behavior:contain;animation:gh-house-in .5s var(--gh-ease) both}
@keyframes gh-house-in{from{opacity:0;transform:translateY(10px)}}
.gh-house-panel.side{top:72px;right:14px;max-height:calc(100% - 86px)}
.gh-house-panel.bottom{left:12px;right:12px;bottom:12px}
.gh-house-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--gh-track);font-size:13px;min-width:0}
.gh-house-row:last-child{border-bottom:0}
.gh-house-row .gh-ico{width:30px;height:30px;border-radius:10px}
.gh-house-row .gh-ico svg{width:17px;height:17px}
.gh-house-row b{display:block;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-house-row small{display:block;color:var(--gh-fg-2);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.gh-house-row.open small{color:var(--gh-warn)}
.gh-house-row.heat small{color:var(--gh-heat)}
.gh-house-empty{margin:10px 0;font-size:12.5px;color:var(--gh-fg-2)}
@media (prefers-reduced-motion:reduce){.gh-house-dev.open>button,.gh-house-dev.motion>button::after{animation:none}}
`;

const isAccent = (a: string): boolean => (ACCENTS as readonly string[]).includes(a);

/** CSS color of a device/room accent: accent name of the palette or own CSS color */
function accentVar(a: string): string {
    return !a ? 'var(--gh-fg)' : isAccent(a) ? `var(--gh-${a})` : a;
}

let colorCtx: CanvasRenderingContext2D | null | undefined;

/** RGB of any CSS color (#hex, rgb(), hsl(), names …) for the canvas; `def` when it is not a valid color */
function cssRgb(c: string, def: RGB): RGB {
    const t = c.trim();
    if (!t || (typeof CSS !== 'undefined' && !CSS.supports('color', t))) {
        return def;
    }
    colorCtx ??= document.createElement('canvas').getContext('2d');
    if (!colorCtx) {
        return parseRgb(t, def);
    }
    colorCtx.fillStyle = '#000';
    colorCtx.fillStyle = t;
    return parseRgb(colorCtx.fillStyle, def);
}

const textOf = (v: unknown): string => (typeof v === 'string' ? v : v ? JSON.stringify(v) : '');

const SWITCHABLE = new Set(['light', 'plug']);

/** "On" of a light or plug: numbers (also dimmer levels as text) > 0, else on/true/… */
function isOn(v: unknown): boolean {
    const n = toNum(v);
    return n !== null ? n > 0 : toBool(v);
}

/** "Open" of a window: numbers > 0 (e.g. 0 closed, 1 tilted, 2 open), else open/tilted/true/… */
function isOpen(v: unknown): boolean {
    return isOn(v) || (typeof v === 'string' && /^(tilt|tilted|gekippt|offen)$/i.test(v.trim()));
}

const startFloorOf = (d: HouseRxData): string => GlashausWidget.ghText(d.startFloor).trim();
const startRoomOf = (d: HouseRxData): string => GlashausWidget.ghText(d.startRoom).trim();

/** Attributes that set the start state (view, floor, room) */
const attrsOf = (d: HouseRxData): string => `${d.view}|${startFloorOf(d)}|${startRoomOf(d)}`;

/** Below this scale (px per meter) the house is too small for device symbols */
const MIN_SYMBOL_SCALE = 7;

export default class GlashausHouse extends GlashausWidget<HouseRxData, HouseState> {
    private rootRef = React.createRef<HTMLDivElement>();

    private stageRef = React.createRef<HTMLDivElement>();

    private canvasRef = React.createRef<HTMLCanvasElement>();

    private tipRef = React.createRef<HTMLDivElement>();

    private engine: HouseEngine | null = null;

    private engineCanvas: HTMLCanvasElement | null = null;

    private ro: ResizeObserver | null = null;

    private roRaf = 0;

    private obsStage: HTMLElement | null = null;

    private demoTimer: ReturnType<typeof setInterval> | undefined;

    private valTimer: ReturnType<typeof setTimeout> | undefined;

    private pendingVals: Record<string, ioBroker.StateValue | undefined> = {};

    private subKey: string | null = null;

    private attrKey = '';

    private parsedKey = '';

    private parsed: { plan: ParsedPlan; devs: ParsedDevices } | null = null;

    /** Counts the parsings (rooms are new objects after each one) */
    private parseGen = 0;

    private lastDark: boolean | null = null;

    private viewKey = '';

    private marksKey = '';

    /** Prepared in render, handed to the engine after the commit */
    private next: {
        view: HouseView | null;
        marks: {
            lit: Set<HouseRoom>;
            open: Set<HouseRoom>;
            glows: { floor: number; room: HouseRoom | null; x: number; y: number }[];
        };
        marksKey: string;
    } = { view: null, marks: { lit: new Set(), open: new Set(), glows: [] }, marksKey: '' };

    /** Devices that are "active" (shown in the stacked house view) */
    private activeIds = new Set<string>();

    /** Floor whose room names are shown (-1 = none) */
    private labelFloor = -1;

    /** Small widget showing all floors: only active devices get a symbol */
    private activeOnly = false;

    private devEls = new Map<string, HTMLDivElement>();

    private labEls = new Map<string, HTMLDivElement>();

    private refCbs = new Map<string, (el: HTMLDivElement | null) => void>();

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('house', HOUSE_CSS);
        const d = this.state.rxData;
        this.state = {
            ...this.state,
            w: 0,
            h: 0,
            vals: {},
            mode: d.view === 'stacked' ? 'stacked' : 'exploded',
            focus: startFloorOf(d),
            room: startRoomOf(d),
            demoT: Date.now(),
            demoOn: {},
        };
        this.attrKey = attrsOf(d);
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausHouse',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visName: 'House',
            visWidgetLabel: 'house_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields('home'),
                        ...GlashausWidget.accentFields('', 'home'),
                        { name: 'showHeader', label: 'house_show_header', type: 'checkbox', default: true },
                    ],
                },
                {
                    name: 'house_plan',
                    label: 'house_group_plan',
                    fields: [
                        { name: 'planHelp', type: 'help', text: `${ADAPTER}_house_plan_help` },
                        { name: 'plan', label: 'house_plan', type: 'json', multiline: true, default: '' },
                        { name: 'devicesHelp', type: 'help', text: `${ADAPTER}_house_devices_help` },
                        { name: 'devices', label: 'house_devices', type: 'json', multiline: true, default: '' },
                    ],
                },
                {
                    name: 'house_view',
                    label: 'house_group_view',
                    fields: [
                        {
                            name: 'view',
                            label: 'house_view',
                            type: 'select',
                            options: [
                                { value: 'exploded', label: 'house_mode_exploded' },
                                { value: 'stacked', label: 'house_mode_stacked' },
                            ],
                            default: 'exploded',
                        },
                        {
                            name: 'modeSwitch',
                            label: 'house_mode_switch',
                            type: 'checkbox',
                            default: true,
                            hidden: 'data.showHeader === false || data.showHeader === "false"',
                        },
                        { name: 'floorPills', label: 'house_floor_pills', type: 'checkbox', default: true },
                        { name: 'startFloor', label: 'house_start_floor', tooltip: 'house_start_floor_tip' },
                        { name: 'startRoom', label: 'house_start_room', tooltip: 'house_start_room_tip' },
                        {
                            name: 'startAngle',
                            label: 'house_start_angle',
                            type: 'slider',
                            min: -180,
                            max: 180,
                            step: 5,
                            default: -30,
                        },
                        { name: 'tilt', label: 'house_tilt', type: 'slider', min: 15, max: 80, step: 1, default: 38 },
                        {
                            name: 'autoRotate',
                            label: 'house_auto',
                            type: 'select',
                            options: [
                                { value: 'off', label: 'house_auto_off' },
                                { value: 'sway', label: 'house_auto_sway' },
                                { value: 'spin', label: 'house_auto_spin' },
                            ],
                            default: 'off',
                        },
                        {
                            name: 'wallHeight',
                            label: 'house_wall_height',
                            type: 'slider',
                            min: 0.1,
                            max: 1,
                            step: 0.05,
                            default: 0.4,
                            tooltip: 'house_wall_height_tip',
                        },
                        { name: 'roof', label: 'house_roof', type: 'checkbox', default: true },
                        { name: 'showLabels', label: 'house_show_labels', type: 'checkbox', default: true },
                        { name: 'roomView', label: 'house_room_view', type: 'checkbox', default: true },
                        { name: 'showHint', label: 'house_show_hint', type: 'checkbox', default: true },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 760, height: 560, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_house.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausHouse.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.sync();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: any): void {
        super.componentDidUpdate(prevProps, prevState);
        this.sync();
    }

    componentWillUnmount(): void {
        this.ro?.disconnect();
        this.ro = null;
        cancelAnimationFrame(this.roRaf);
        this.engine?.destroy();
        this.engine = null;
        // a later mount of the same instance (e.g. React StrictMode) sets everything up again
        this.obsStage = null;
        this.engineCanvas = null;
        this.subKey = null;
        this.pendingVals = {};
        if (this.demoTimer) {
            clearInterval(this.demoTimer);
            this.demoTimer = undefined;
        }
        if (this.valTimer) {
            clearTimeout(this.valTimer);
            this.valTimer = undefined;
        }
        super.componentWillUnmount();
    }

    /* ---------- synchronisation after every commit ---------- */

    private sync(): void {
        this.syncAttrs();
        this.attach();
        this.syncSubs();
        this.syncDemo();
        this.syncEngine();
        this.place();
    }

    /** Start view / floor / room changed in the editor: apply them */
    private syncAttrs(): void {
        const d = this.state.rxData;
        const key = attrsOf(d);
        if (key === this.attrKey) {
            return;
        }
        this.attrKey = key;
        this.setState({
            mode: d.view === 'stacked' ? 'stacked' : 'exploded',
            focus: startFloorOf(d),
            room: startRoomOf(d),
        });
    }

    /** Observer and engine follow the DOM elements (vis-2 may re-create them) */
    private attach(): void {
        const stage = this.stageRef.current;
        if (stage && stage !== this.obsStage) {
            this.ro?.disconnect();
            this.obsStage = stage;
            if (typeof ResizeObserver !== 'undefined') {
                this.ro = new ResizeObserver(() => {
                    cancelAnimationFrame(this.roRaf);
                    this.roRaf = requestAnimationFrame(this.measure);
                });
                this.ro.observe(stage);
            }
            this.measure();
        }
        const cv = this.canvasRef.current;
        if (stage && cv && cv !== this.engineCanvas) {
            this.engine?.destroy();
            this.engineCanvas = cv;
            this.viewKey = '';
            this.marksKey = '';
            this.lastDark = null;
            this.engine = new HouseEngine(stage, cv, this.next.view || this.viewFor(), {
                onFrame: this.place,
                onRoomClick: this.onRoomClick,
                onHover: this.onHover,
            });
            this.measure();
        }
    }

    private measure = (): void => {
        const stage = this.obsStage;
        if (!stage) {
            return;
        }
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        this.engine?.setSize(w, h);
        if (w !== this.state.w || h !== this.state.h) {
            this.setState({ w, h });
        }
    };

    private syncSubs(): void {
        const p = this.parsed;
        if (!p) {
            return;
        }
        const ids = new Set<string>();
        if (!p.devs.isDemo) {
            p.devs.devices.forEach(d => {
                if (isOid(d.oid)) {
                    ids.add(d.oid);
                }
                if (isOid(d.oidSet)) {
                    ids.add(d.oidSet);
                }
            });
        }
        const key = [...ids].sort().join('|');
        if (key === this.subKey) {
            return;
        }
        this.subKey = key;
        this.ghUnsubscribeAll();
        if (ids.size) {
            this.ghSubscribe([...ids], this.onVal);
        }
    }

    private onVal = (id: string, state: ioBroker.State | null | undefined): void => {
        this.pendingVals[id] = state ? state.val : null;
        if (!this.valTimer) {
            this.valTimer = setTimeout(() => {
                this.valTimer = undefined;
                const add = this.pendingVals;
                this.pendingVals = {};
                this.setState(s => ({ vals: { ...s.vals, ...add } }));
            }, 30);
        }
    };

    private syncDemo(): void {
        const demo = !!this.parsed?.devs.isDemo;
        if (demo && !this.demoTimer) {
            this.demoTimer = setInterval(() => {
                if (!document.hidden) {
                    this.setState({ demoT: Date.now() });
                }
            }, 2000);
        } else if (!demo && this.demoTimer) {
            clearInterval(this.demoTimer);
            this.demoTimer = undefined;
        }
    }

    private syncEngine(): void {
        const eng = this.engine;
        const p = this.parsed;
        if (!eng || !p) {
            return;
        }
        const root = this.rootRef.current;
        const dark = this.ghDark();
        if (root && dark !== this.lastDark) {
            this.lastDark = dark;
            const cs = getComputedStyle(root);
            const def: RGB = dark ? [200, 200, 200] : [60, 60, 60];
            eng.setPalette(name =>
                name === 'bg' || isAccent(name)
                    ? parseRgb(cs.getPropertyValue(`--gh-${name}`), def)
                    : cssRgb(name, def),
            );
        }
        eng.setPlan(p.plan.plan);
        const v = this.next.view;
        if (v) {
            const key = JSON.stringify({ ...v, room: v.room?.key || '', gen: this.parseGen });
            if (key !== this.viewKey) {
                this.viewKey = key;
                eng.setView(v);
            }
        }
        if (this.next.marksKey !== this.marksKey) {
            this.marksKey = this.next.marksKey;
            eng.setMarks(this.next.marks);
        }
    }

    /* ---------- data ---------- */

    private getParsed(): { plan: ParsedPlan; devs: ParsedDevices } {
        const d = this.state.rxData;
        // attributes as stored in the project, before vis-2 applied bindings (missing outside vis-2)
        const stored = this.state.data as Record<string, unknown> | undefined;
        const key = [this.ghLang(), d.plan, d.devices, stored?.plan, stored?.devices].map(textOf).join('\u0001');
        if (!this.parsed || key !== this.parsedKey) {
            const tr = GlashausWidget.tr;
            const valueOf = (id: string): unknown => this.state.values[`${id}.val`];
            const plan = parsePlan(pickJson(stored?.plan, d.plan, valueOf), tr);
            const devs = parseDevices(pickJson(stored?.devices, d.devices, valueOf), plan, tr);
            this.parsed = { plan, devs };
            this.parsedKey = key;
            this.parseGen++;
        }
        return this.parsed;
    }

    /** Raw value of a device (demo value without IDs) */
    private raw(d: HouseDevice, set = false): ioBroker.StateValue | undefined {
        if (this.parsed?.devs.isDemo) {
            if (!set && SWITCHABLE.has(d.type) && d.id in this.state.demoOn) {
                return this.state.demoOn[d.id];
            }
            const s = this.state.demoT / 1000;
            return set ? d.demoSet?.(s) : d.demo?.(s);
        }
        let id = set ? d.oidSet : d.oid;
        if (!set && !isOid(id) && SWITCHABLE.has(d.type)) {
            id = d.oidSet;
        }
        if (!isOid(id)) {
            return undefined;
        }
        const v = this.state.vals[id];
        return v === null ? undefined : v;
    }

    private info(d: HouseDevice): DevInfo {
        const tr = GlashausWidget.tr;
        const lang = this.ghLang();
        const v = this.raw(d);
        const known = v !== undefined && v !== '';
        const res: DevInfo = { on: false, open: false, motion: false, known, text: '–', value: '' };
        const numText = (n: number | null): string => (n === null ? '–' : `${fmtNum(n, d.dec, lang)} ${d.unit}`.trim());
        switch (d.type) {
            case 'light':
            case 'plug':
                res.on = known && isOn(v);
                res.text = known ? tr(res.on ? 'house_on' : 'house_off') : tr('house_no_value');
                break;
            case 'motion':
                res.motion = known && isOn(v);
                res.text = known ? tr(res.motion ? 'house_motion' : 'house_calm') : tr('house_no_value');
                break;
            case 'window':
                res.open = known && isOpen(v);
                res.text = known ? tr(res.open ? 'house_open' : 'house_closed') : tr('house_no_value');
                break;
            case 'thermostat': {
                const n = toNum(v);
                const s = toNum(this.raw(d, true));
                res.on = n !== null && s !== null && n < s - 0.15;
                res.value = numText(n);
                res.text = known ? res.value : tr('house_no_value');
                if (s !== null) {
                    res.text += ` · ${tr('house_target')} ${numText(s)}`;
                }
                if (res.on) {
                    res.text += ` · ${tr('house_heating')}`;
                }
                break;
            }
            case 'shutter': {
                const n = toNum(v);
                res.value = numText(n);
                res.text = known ? `${tr('house_position')} ${res.value}` : tr('house_no_value');
                break;
            }
            default: {
                const n = toNum(v);
                res.value = numText(n);
                res.text = known ? res.value : tr('house_no_value');
            }
        }
        return res;
    }

    private focusIndex(plan: ParsedPlan['plan']): number {
        const f = this.state.focus;
        if (!f) {
            return -1;
        }
        const i = plan.floors.findIndex(x => x.id === f);
        if (i >= 0) {
            return i;
        }
        return /^\d+$/.test(f) && +f < plan.floors.length ? +f : -1;
    }

    private selRoom(plan: ParsedPlan['plan']): HouseRoom | null {
        const s = this.state.room;
        if (!s) {
            return null;
        }
        const slash = s.indexOf('/');
        const fid = slash > 0 ? s.slice(0, slash) : '';
        const rid = slash > 0 ? s.slice(slash + 1) : s;
        for (const f of plan.floors) {
            if (fid && f.id !== fid) {
                continue;
            }
            const r = f.rooms.find(x => x.id === rid && x.kind !== 'stairs');
            if (r) {
                return r;
            }
        }
        return null;
    }

    /* ---------- interaction ---------- */

    private onRoomClick = (r: HouseRoom | null): void => {
        if (this.props.editMode) {
            return;
        }
        const plan = this.parsed?.plan.plan;
        if (!r || !plan) {
            if (this.state.room) {
                this.setState({ room: '' });
            }
            return;
        }
        if (!isTrue(this.state.rxData.roomView, true)) {
            return;
        }
        this.setState({ room: `${plan.floors[r.floor].id}/${r.id}` });
    };

    private onHover = (r: HouseRoom | null, x: number, y: number): void => {
        const el = this.tipRef.current;
        const plan = this.parsed?.plan.plan;
        if (!el) {
            return;
        }
        if (!r || !plan || this.state.room) {
            el.style.opacity = '0';
            return;
        }
        const lang = this.ghLang();
        const parts = [r.name];
        if (r.kind === 'room' && r.area) {
            parts.push(`${fmtNum(r.area, 1, lang)} m²`);
        }
        parts.push(plan.floors[r.floor].name);
        const text = parts.join(' · ');
        if (el.textContent !== text) {
            el.textContent = text;
        }
        // keep the tooltip inside the widget
        const half = this.width(el) / 2 + 6;
        const cx = this.state.w > 2 * half ? clamp(x, half, this.state.w - half) : x;
        el.style.transform = `translate(${cx.toFixed(0)}px,${y.toFixed(0)}px) translate(-50%,calc(-100% - 12px))`;
        el.style.opacity = '1';
    };

    private back = (): void => this.setState({ room: '' });

    private setMode(mode: HouseMode): void {
        this.setState({ mode, focus: mode === 'stacked' ? '' : this.state.focus, room: '' });
    }

    private setFocus(id: string): void {
        this.setState({ focus: id, mode: id ? 'exploded' : this.state.mode, room: '' });
    }

    private onDevice(d: HouseDevice): void {
        if (this.props.editMode) {
            return;
        }
        if (SWITCHABLE.has(d.type)) {
            this.toggle(d);
            return;
        }
        if (d.room && d.room.kind !== 'stairs' && !this.state.room && isTrue(this.state.rxData.roomView, true)) {
            this.onRoomClick(d.room);
        }
    }

    private toggle(d: HouseDevice): void {
        if (this.props.editMode) {
            return;
        }
        const on = this.info(d).on;
        if (this.parsed?.devs.isDemo) {
            this.setState(s => ({ demoOn: { ...s.demoOn, [d.id]: !on } }));
            return;
        }
        this.ghSet(isOid(d.oidSet) ? d.oidSet : d.oid, !on);
    }

    private onKey = (e: React.KeyboardEvent): void => {
        if (e.key === 'Escape' && this.state.room) {
            this.back();
        }
    };

    /* ---------- overlay ---------- */

    private refCb(kind: 'd' | 'l', id: string): (el: HTMLDivElement | null) => void {
        const key = `${kind}:${id}`;
        let cb = this.refCbs.get(key);
        if (!cb) {
            const map = kind === 'd' ? this.devEls : this.labEls;
            cb = (el: HTMLDivElement | null): void => {
                if (el) {
                    map.set(id, el);
                } else {
                    map.delete(id);
                }
            };
            this.refCbs.set(key, cb);
        }
        return cb;
    }

    /** Positions of symbols and labels, called after every drawn frame */
    private place = (): void => {
        const eng = this.engine;
        const p = this.parsed;
        if (!eng || !p) {
            return;
        }
        const plan = p.plan.plan;
        const room = this.selRoom(plan);
        const focus = this.labelFloor;
        const stacked = eng.explode < 0.5;
        const labels = isTrue(this.state.rxData.showLabels, true);
        const ready = eng.ready;
        // a tiny house would disappear behind its symbols
        const symbols = !!room || eng.pxPerMeter >= MIN_SYMBOL_SCALE;
        const shown: { el: HTMLElement; x: number; y: number }[] = [];
        const obstacles: number[][] = [];
        const set = (el: HTMLElement, x: number, y: number, show: boolean): void => {
            const vis = show && ready;
            const tf = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
            if (el.style.transform !== tf) {
                el.style.transform = tf;
            }
            const op = vis ? '1' : '0';
            if (el.style.opacity !== op) {
                el.style.opacity = op;
                // hidden symbols can be neither clicked nor reached with the keyboard or a screen reader
                el.inert = !vis;
            }
        };
        p.devs.devices.forEach(d => {
            const el = this.devEls.get(d.id);
            if (!el) {
                return;
            }
            let vis = symbols && eng.floorAlpha(d.floor) > 0.45;
            if (room) {
                vis = vis && d.room === room;
            } else if (stacked || this.activeOnly) {
                vis = vis && this.activeIds.has(d.id);
            }
            const [x, y] = eng.project(d.x, d.y, eng.floorZ(d.floor) + 0.35);
            set(el, x, y, vis);
            if (vis && ready) {
                shown.push({ el, x, y });
            }
        });
        plan.floors.forEach((f, i) => {
            f.rooms.forEach(r => {
                const el = this.labEls.get(r.key);
                if (!el) {
                    return;
                }
                const vis = labels && !room && !stacked && focus === i && eng.floorAlpha(i) > 0.6;
                const [x, y] = eng.project(r.c[0], r.c[1], eng.floorZ(i) + 0.02);
                set(el, x, y + 16, vis);
                if (vis && ready) {
                    const lw = this.width(el.firstElementChild as HTMLElement | null);
                    obstacles.push([x - lw / 2, y + 2, x + lw / 2, y + 30]);
                }
            });
        });
        this.placeChips(shown, obstacles);
    };

    private chipW = new WeakMap<HTMLElement, { t: string; w: number }>();

    /** Natural width of an element (without a max-width set by placeChips), cached while its text does not change */
    private width(el: HTMLElement | null): number {
        if (!el) {
            return 0;
        }
        const t = el.textContent || '';
        const c = this.chipW.get(el);
        if (c && c.t === t) {
            return c.w;
        }
        const mw = el.style.maxWidth;
        el.style.maxWidth = '';
        const w = el.offsetWidth;
        el.style.maxWidth = mw;
        this.chipW.set(el, { t, w });
        return w;
    }

    /**
     * Value chips go right of their symbol, or left when they would cover another symbol, label or chip.
     * Chips are shortened (ellipsis) to stay inside the widget; with almost no room they change sides.
     */
    private placeChips(shown: { el: HTMLElement; x: number; y: number }[], obstacles: number[][]): void {
        const m = this.rootRef.current?.classList.contains('gh-house-sm') ? 24 : 28;
        const gap = m / 2 + 3;
        const W = this.state.w || Infinity;
        const rects = obstacles.slice();
        shown.forEach(s => rects.push([s.x - m / 2, s.y - m / 2, s.x + m / 2, s.y + m / 2]));
        const overlap = (a: number[], own: number): number => {
            let sum = 0;
            rects.forEach((b, i) => {
                if (i === own) {
                    return;
                }
                const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
                const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
                if (w > 0 && h > 0) {
                    sum += w * h;
                }
            });
            return sum;
        };
        shown
            .map((s, i) => ({ ...s, own: obstacles.length + i }))
            .sort((a, b) => a.y - b.y)
            .forEach(s => {
                const chip = s.el.querySelector<HTMLElement>('.gh-house-chip');
                if (!chip) {
                    return;
                }
                const cw = this.width(chip);
                const roomL = s.x - gap - 6;
                const roomR = W - 6 - s.x - gap;
                const rect = (l: boolean, w: number): number[] =>
                    l ? [s.x - gap - w, s.y - 10, s.x - gap, s.y + 10] : [s.x + gap, s.y - 10, s.x + gap + w, s.y + 10];
                let goLeft =
                    overlap(rect(true, Math.min(cw, roomL)), s.own) + 1 <
                    overlap(rect(false, Math.min(cw, roomR)), s.own);
                if (
                    (goLeft ? roomL : roomR) < Math.min(cw, 56) &&
                    (goLeft ? roomR : roomL) > (goLeft ? roomL : roomR)
                ) {
                    goLeft = !goLeft;
                }
                const avail = goLeft ? roomL : roomR;
                const fit = avail < cw ? Math.max(36, Math.floor(avail)) : 0;
                const mw = fit ? `${fit}px` : '';
                if (chip.style.maxWidth !== mw) {
                    chip.style.maxWidth = mw;
                }
                chip.classList.toggle('l', goLeft);
                rects.push(rect(goLeft, fit || cw));
            });
    }

    /* ---------- render ---------- */

    private viewFor(
        insets: HouseInsets = { t: 60, r: 14, b: 14, l: 14 },
        room: HouseRoom | null = null,
        focus = -1,
    ): HouseView {
        const d = this.state.rxData;
        const deg = (v: unknown, def: number, lo: number, hi: number): number =>
            (clamp(toNum(v) ?? def, lo, hi) * Math.PI) / 180;
        const auto = d.autoRotate === 'sway' || d.autoRotate === 'spin' ? d.autoRotate : 'off';
        return {
            mode: this.state.mode,
            focus,
            room,
            wallScale: clamp(toNum(d.wallHeight) ?? 0.4, 0.05, 1),
            roof: isTrue(d.roof, true),
            auto,
            yaw: deg(d.startAngle, -30, -360, 360),
            tilt: deg(d.tilt, 38, 15, 80),
            interactive: !this.props.editMode,
            insets,
        };
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const tr = GlashausWidget.tr;
        const lang = this.ghLang();
        const edit = !!this.props.editMode;
        const parsed = this.getParsed();
        const plan = parsed.plan.plan;
        const devs = parsed.devs.devices;
        const { w, h } = this.state;
        const sm = w > 0 && (w < 380 || h < 300);
        const room = this.selRoom(plan);
        const focus = room ? -1 : this.focusIndex(plan);
        const mode = this.state.mode;
        const labels = isTrue(d.showLabels, true);

        // device states
        const infos = new Map<string, DevInfo>();
        const lit = new Set<HouseRoom>();
        const open = new Set<HouseRoom>();
        const glows: { floor: number; room: HouseRoom | null; x: number; y: number }[] = [];
        const keyParts: string[] = [];
        this.activeIds = new Set();
        devs.forEach(dv => {
            const inf = this.info(dv);
            infos.set(dv.id, inf);
            if (dv.type === 'light' && inf.on) {
                if (dv.room) {
                    lit.add(dv.room);
                }
                glows.push({ floor: dv.floor, room: dv.room, x: dv.x, y: dv.y });
                keyParts.push(`l${dv.id}`);
            }
            if (inf.open && dv.room) {
                open.add(dv.room);
                keyParts.push(`o${dv.id}`);
            }
            if (inf.on || inf.open || inf.motion) {
                this.activeIds.add(dv.id);
            }
        });

        // layout
        const header = isTrue(d.showHeader, true) || !!room;
        const headH = header ? (room ? 74 : sm ? 52 : 62) : 12;
        const nFloors = plan.floors.length;
        const pillsWanted = isTrue(d.floorPills, true) && !room && nFloors > 1 && w >= 200 && h >= 170;
        const pillH = sm ? 32 : 38;
        // estimated widths of the floor buttons (CSS: min-width, max-width 96px, ellipsis)
        const pillWs = [tr('house_all'), ...plan.floors.map(f => f.short)].map(t =>
            clamp(t.length * (sm ? 6.5 : 7) + 16, sm ? 36 : 42, 96),
        );
        const rowW = pillWs.reduce((sum, pw) => sum + pw + (sm ? 4 : 6), 0);
        const segs = isTrue(d.modeSwitch, true) && w >= 330;
        // column at the right; in flat widgets a row in the header (leaves the height to the house) or at the bottom
        let pills: '' | 'col' | 'row' | 'head' = '';
        if (pillsWanted) {
            if (h - headH - 24 >= (nFloors + 1) * pillH) {
                pills = 'col';
            } else if (header && w >= rowW + (segs ? 200 : 0) + 260) {
                pills = 'head';
            } else if (w >= rowW + 40) {
                pills = 'row';
            }
        }
        const colR = pills === 'col' ? Math.max(...pillWs) + (sm ? 14 : 18) : 14;
        const side = w >= 600 && h >= 300;
        const panel = !!room && h >= 200;
        const roomDevs = room ? devs.filter(x => x.room === room) : [];
        const panelW = side ? Math.min(290, Math.round(w * 0.38)) : 0;
        const panelH = !side && panel ? Math.min(Math.round(h * 0.42), Math.max(1, roomDevs.length) * 54 + 14) : 0;
        const hint =
            isTrue(d.showHint, true) && !edit && !room && w >= 480 && h >= 320 && (pills !== 'row' || w >= rowW + 300);
        let insets: HouseInsets;
        if (room) {
            insets = side
                ? { t: headH, r: panelW + 24, b: 14, l: 14 }
                : { t: headH, r: 14, b: panel ? panelH + 18 : 14, l: 14 };
        } else {
            // wide widgets keep the house centered, small ones use the space left of the floor buttons
            insets = { t: headH, r: colR, b: pills === 'row' ? pillH + 18 : hint ? 28 : 14, l: w >= 560 ? colR : 14 };
        }
        this.next = {
            view: this.viewFor(insets, room, focus),
            marks: { lit, open, glows },
            marksKey: `${this.parseGen}|${keyParts.join(',')}`,
        };

        // value chips: room view → all devices of the room; focused (or only) floor → values
        this.labelFloor = room ? -1 : focus >= 0 ? focus : nFloors === 1 ? 0 : -1;
        this.activeOnly = sm && !room && focus < 0 && nFloors > 1;
        const chipIds = new Set<string>();
        const bigOverview = !room && focus < 0 && mode === 'exploded' && w >= 900 && h >= 560;
        devs.forEach(dv => {
            const inf = infos.get(dv.id)!;
            if (room ? dv.room === room : labels && (bigOverview || this.labelFloor === dv.floor) && !!inf.value) {
                chipIds.add(dv.id);
            }
        });

        const title = GlashausWidget.ghText(d.title) || tr('house_title_default');
        const accent = this.ghAccent('', 'home');
        const errs = [
            parsed.plan.error ? `${tr('house_err_plan')}: ${parsed.plan.error}` : '',
            parsed.devs.error ? `${tr('house_err_devices')}: ${parsed.devs.error}` : '',
        ].filter(Boolean);
        const floorOf = room ? plan.floors[room.floor] : null;
        const floorButtons = (
            <div
                className={`gh-house-floors${pills === 'row' ? ' row' : ''}`}
                role="group"
                aria-label={tr('house_floors')}
            >
                <button
                    type="button"
                    aria-pressed={focus < 0}
                    onClick={() => this.setFocus('')}
                >
                    {tr('house_all')}
                </button>
                {[...plan.floors].reverse().map(f => (
                    <button
                        key={f.index}
                        type="button"
                        title={f.name}
                        aria-pressed={focus === f.index}
                        onClick={() => this.setFocus(focus === f.index ? '' : f.id)}
                    >
                        {f.short}
                    </button>
                ))}
            </div>
        );

        return (
            <div
                ref={this.rootRef}
                className={this.ghClass(`gh-house${sm ? ' gh-house-sm' : ''}${edit ? ' gh-house-ro' : ''}`, {
                    tile: false,
                })}
                onKeyDown={this.onKey}
                tabIndex={-1}
            >
                <div
                    ref={this.stageRef}
                    className={`gh-house-stage${edit ? ' ro' : ''}`}
                >
                    <canvas
                        ref={this.canvasRef}
                        role="img"
                        aria-label={tr('house_aria', String(nFloors))}
                    />
                    <div className="gh-house-ov">
                        {plan.floors.map(f =>
                            f.rooms
                                .filter(r => r.kind !== 'stairs')
                                .map(r => (
                                    <div
                                        key={r.key}
                                        ref={this.refCb('l', r.key)}
                                        className="gh-house-lab"
                                        inert
                                    >
                                        <span>
                                            {r.name}
                                            {r.kind === 'room' && r.area && !sm ? (
                                                <small>{fmtNum(r.area, 1, lang)} m²</small>
                                            ) : null}
                                        </span>
                                    </div>
                                )),
                        )}
                        {devs.map(dv => {
                            const inf = infos.get(dv.id)!;
                            const cls = ['gh-house-dev'];
                            if (inf.on) {
                                cls.push(dv.type === 'thermostat' ? 'heat' : 'on');
                            }
                            if (inf.open) {
                                cls.push('open');
                            }
                            if (inf.motion) {
                                cls.push('motion');
                            }
                            if (!inf.known) {
                                cls.push('na');
                            }
                            const chip = chipIds.has(dv.id);
                            const aria = `${dv.label}: ${inf.text}`;
                            return (
                                <div
                                    key={dv.id}
                                    ref={this.refCb('d', dv.id)}
                                    className={cls.join(' ')}
                                    style={{ '--gh-c': accentVar(dv.accent) } as React.CSSProperties}
                                    inert
                                >
                                    <button
                                        type="button"
                                        aria-label={aria}
                                        title={aria}
                                        aria-pressed={SWITCHABLE.has(dv.type) ? inf.on : undefined}
                                        onClick={() => this.onDevice(dv)}
                                    >
                                        <GhIcon name={dv.icon} />
                                    </button>
                                    {chip ? (
                                        <span className="gh-house-chip">
                                            {room ? dv.label : inf.value}
                                            {room && inf.value ? <small>{inf.value}</small> : null}
                                        </span>
                                    ) : null}
                                </div>
                            );
                        })}
                        <div
                            ref={this.tipRef}
                            className="gh-house-tip"
                            aria-hidden="true"
                        />
                    </div>
                </div>

                {header ? (
                    <div className="gh-house-head">
                        {room && floorOf ? (
                            <>
                                <div className="gh-house-rt">
                                    <button
                                        type="button"
                                        className="gh-circ"
                                        aria-label={tr('house_back')}
                                        title={tr('house_back')}
                                        onClick={this.back}
                                    >
                                        <GhIcon
                                            name="arrow"
                                            style={{ transform: 'rotate(180deg)' }}
                                        />
                                    </button>
                                    <div className="gh-house-rn">
                                        <small>{floorOf.name}</small>
                                        <b>{room.name}</b>
                                    </div>
                                </div>
                                {w >= 300 ? (
                                    <span className="gh-house-area">
                                        {room.kind === 'room' && room.area
                                            ? `${fmtNum(room.area, 1, lang)} m²`
                                            : room.kind === 'outside'
                                              ? tr('house_outside')
                                              : ''}
                                    </span>
                                ) : null}
                            </>
                        ) : (
                            <>
                                <h2 className="gh-title">
                                    <GhIconBox
                                        name={this.ghIcon()}
                                        color={accent}
                                    />
                                    <span className="gh-house-tt">{title}</span>
                                </h2>
                                {pills === 'head' ? floorButtons : null}
                                {segs ? (
                                    <div
                                        className="gh-house-segs"
                                        role="group"
                                        aria-label={tr('house_view')}
                                    >
                                        {(['stacked', 'exploded'] as HouseMode[]).map(m => (
                                            <button
                                                key={m}
                                                type="button"
                                                aria-pressed={mode === m && (m === 'stacked' || focus < 0)}
                                                onClick={() => this.setMode(m)}
                                            >
                                                {tr(`house_mode_${m}`)}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </>
                        )}
                    </div>
                ) : null}

                {pills && pills !== 'head' ? floorButtons : null}

                {room && panel ? (
                    <div
                        className={`gh-house-panel ${side ? 'side' : 'bottom'}`}
                        style={side ? { width: panelW } : { maxHeight: panelH }}
                    >
                        {roomDevs.length ? (
                            roomDevs.map(dv => {
                                const inf = infos.get(dv.id)!;
                                return (
                                    <div
                                        key={dv.id}
                                        className={`gh-house-row${inf.open ? ' open' : ''}${dv.type === 'thermostat' && inf.on ? ' heat' : ''}`}
                                    >
                                        <GhIconBox
                                            name={dv.icon}
                                            color={inf.open ? 'var(--gh-warn)' : accentVar(dv.accent)}
                                        />
                                        <div style={{ minWidth: 0 }}>
                                            <b>{dv.label}</b>
                                            <small>{inf.text}</small>
                                        </div>
                                        {SWITCHABLE.has(dv.type) ? (
                                            <button
                                                type="button"
                                                className="gh-toggle"
                                                role="switch"
                                                aria-checked={inf.on}
                                                aria-label={dv.label}
                                                disabled={edit || (!inf.known && !parsed.devs.isDemo)}
                                                style={{ '--gh-c': accentVar(dv.accent) } as React.CSSProperties}
                                                onClick={() => this.toggle(dv)}
                                            />
                                        ) : (
                                            <span />
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <p className="gh-house-empty">{tr('house_no_devices')}</p>
                        )}
                    </div>
                ) : null}

                {hint ? <span className="gh-house-hint">{tr('house_hint')}</span> : null}
                {edit && errs.length ? (
                    <div
                        className="gh-house-err"
                        title={errs.join('\n')}
                        style={{
                            right: colR,
                            bottom: (pills === 'row' ? pillH + 18 : 14) + (parsed.devs.isDemo ? 18 : 0),
                        }}
                    >
                        <GhPill kind="warn">{errs[0]}</GhPill>
                    </div>
                ) : null}
                {this.ghDemoBadge(parsed.devs.isDemo)}
            </div>
        );
    }
}
