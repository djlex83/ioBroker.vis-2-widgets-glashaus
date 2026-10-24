/* Appliance tile: animated illustration of a washing machine, dryer or dishwasher (drum, laundry, water, spray arms,
 * door at the left hinge) with progress ring, remaining time, end time, program and state.
 * The state comes from a running flag (bool) or a text state (e.g. Home Connect "…OperationState.Run"). */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    RxWidgetInfoAttributesField,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ACCENTS, ADAPTER, SET_COLOR, accentColor, isOid, isTrue } from './core/GlashausWidget';
import { GhIcon, GhIconBox, GhPill, GhRing, type GhPillKind } from './core/components';
import { clamp, fmtDate, fmtNum, fmtTime, toBool, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';
import {
    VIEWBOX,
    createFigure,
    figureMarkup,
    type ApFinish,
    type ApMode,
    type ApType,
    type FigState,
    type Figure,
} from './appliance/figures';
import {
    DEFAULT_VALUES,
    displayTime,
    doorOpen,
    isFault,
    modeFromState,
    prettyProgram,
    toMinutes,
    type TimeUnit,
} from './appliance/state';

interface ApplianceRxData {
    deviceType: ApType;
    title: string;
    accent: string;
    color: string;
    finish: ApFinish;
    showFigure: boolean | string;
    oidState: string;
    valuesRun: string;
    valuesPause: string;
    valuesDone: string;
    valuesOff: string;
    oidRunning: string;
    oidDone: string;
    oidDoor: string;
    textDone: string;
    oidRemaining: string;
    remainingUnit: TimeUnit;
    oidProgress: string;
    oidTotal: string;
    oidProgram: string;
    programSub: string;
    showEnd: boolean | string;
}

interface ApplianceState extends VisRxWidgetState {
    /** Measured size of the tile */
    w: number;
    h: number;
    /** Re-render tick for the end time */
    tick: number;
}

/** Everything the tile shows, read from the object values (or demo values) */
interface Reading {
    mode: ApMode;
    /** false: IDs are configured but no value has arrived (offline) */
    known: boolean;
    /** Text of a state value that matches no list */
    raw: string;
    /** The unknown state value looks like a fault (Error, Störung, …) */
    fault: boolean;
    remaining: number | null;
    progress: number | null;
    program: string;
    sub: string;
    door: boolean;
    /** Done since (ms), from the last change of the state */
    since: number | null;
}

type Layout = 'wide' | 'tall' | 'mini';

const DEFAULT_ACCENT: Record<ApType, string> = { washer: 'home', dryer: 'heat', dishwasher: 'cool' };
const ICON: Record<ApType, string> = { washer: 'washer', dryer: 'dryer', dishwasher: 'dish' };
const FIG_RATIO: Record<ApType, number> = { washer: 220 / 312, dryer: 220 / 300, dishwasher: 220 / 300 };
const DEMO: Record<ApType, { progress: number; remaining: number }> = {
    washer: { progress: 0.42, remaining: 58 },
    dryer: { progress: 0.41, remaining: 85 },
    dishwasher: { progress: 0.32, remaining: 132 },
};

const AP_CSS = `
.gh.gh-ap{padding:0;position:relative}
.gh-ap-in{position:absolute;inset:0;display:flex;gap:var(--gh-ap-gap,20px);padding:var(--gh-ap-pad,20px);min-width:0;min-height:0}
.gh-ap-wide{flex-direction:row;align-items:center}
.gh-ap-tall{flex-direction:column;align-items:stretch}
.gh-ap-fig{flex:none;position:relative;min-width:0;min-height:0}
.gh-ap-tall .gh-ap-fig{flex:1;width:100%}
.gh-ap-mini .gh-ap-fig{display:none}
.gh-ap-fig svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 14px 18px var(--gh-shadow))}
.gh-ap-fig.gh-ap-shake svg{animation:gh-ap-shake .11s linear infinite}
@keyframes gh-ap-shake{25%{transform:translate(.6px,-.4px)}50%{transform:translate(-.5px,.3px)}75%{transform:translate(.4px,.5px)}}
.gh-ap-fig .gh-ap-blur{filter:blur(1.4px)}
.gh-ap-fig .gh-ap-laundry,.gh-ap-fig .gh-ap-dishes{transition:opacity 1.2s var(--gh-ease),transform 1.2s var(--gh-ease)}
.gh-ap-fig[data-mode="off"] .gh-ap-laundry{opacity:0}
.gh-ap-fig[data-mode="off"] .gh-ap-dishes{opacity:0;transform:translateY(-8px)}
.gh-ap-fig .gh-ap-wave{animation:gh-ap-wave 2.6s linear infinite}
.gh-ap-fig .gh-ap-wave2{animation-duration:4.1s;animation-direction:reverse;opacity:.5}
@keyframes gh-ap-wave{to{transform:translateX(40px)}}
.gh-ap-fig .gh-ap-foam{transition:opacity 1.5s}
.gh-ap-fig .gh-ap-foam circle{animation:gh-ap-bob 1.8s ease-in-out infinite alternate}
.gh-ap-fig .gh-ap-foam circle:nth-child(2n){animation-delay:.6s}
.gh-ap-fig .gh-ap-foam circle:nth-child(3n){animation-delay:1.1s}
@keyframes gh-ap-bob{to{transform:translateY(-2.5px)}}
.gh-ap-fig .gh-ap-knob{transition:transform 1.2s var(--gh-spring);transform-box:fill-box;transform-origin:center}
.gh-ap-fig .gh-ap-door{transition:transform 1.4s var(--gh-spring);transform-box:view-box}
.gh-ap-fig[data-door="1"] .gh-ap-door{transform:scaleX(-.17) skewY(7deg)}
.gh-ap-fig[data-door="1"] .gh-ap-glass{fill:rgba(150,165,180,.55)}
.gh-ap-fig .gh-ap-glow{opacity:0;transition:opacity .6s;filter:drop-shadow(0 0 6px var(--gh-ok))}
.gh-ap-fig[data-mode="done"] .gh-ap-glow{opacity:1;animation:gh-ap-rglow 2s ease-in-out infinite}
@keyframes gh-ap-rglow{50%{opacity:.35}}
.gh-ap-fig .gh-ap-steam circle{animation:gh-ap-steam 3.2s ease-in infinite}
@keyframes gh-ap-steam{0%{transform:translateY(0);opacity:0}25%{opacity:.7}100%{transform:translateY(-46px);opacity:0}}
.gh-ap-fig .gh-ap-front{opacity:.16}
.gh-ap-fig .gh-ap-tl{--gh-ap-tl:#9cc8ff;transition:opacity .8s}
.gh-ap-fig[data-mode="done"] .gh-ap-tl{--gh-ap-tl:var(--gh-ok)}
.gh-ap-fig[data-mode="off"] .gh-ap-tl{opacity:0}
.gh-ap-fig .gh-ap-tl text{fill:var(--gh-ap-tl)}
.gh-ap-fig .gh-ap-tlglow{fill:var(--gh-ap-tl);animation:gh-ap-tlg 3s ease-in-out infinite}
@keyframes gh-ap-tlg{50%{opacity:.55}}
.gh-ap-fig[data-mode="pause"] .gh-ap-dtime{animation:gh-blink 1.6s ease-in-out infinite}
.gh-ap-fig[data-move="0"] :is(.gh-ap-wave,.gh-ap-foam circle,.gh-ap-steam circle),.gh-ap-fig[data-mode="off"] .gh-ap-tlglow,
.gh-ap-fig[data-paused="1"] *{animation-play-state:paused!important}
.gh-ap-info{flex:1;min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);
  grid-template-areas:"top top" "prog prog" "ring txt";align-content:center;align-items:center;column-gap:var(--gh-ap-cg,16px)}
.gh-ap-tall .gh-ap-info{flex:none}
.gh-ap-mini .gh-ap-info{grid-template-areas:"ring top" "ring prog" "ring txt";align-content:center}
.gh-ap-top{grid-area:top;display:flex;align-items:center;gap:10px;min-width:0;margin-bottom:var(--gh-ap-top-mb,14px)}
.gh-ap-mini .gh-ap-top{margin-bottom:4px;gap:8px}
.gh-ap-mini .gh-ap-top .gh-ico,.gh-ap-noico .gh-ap-top .gh-ico,.gh-ap-nopill .gh-ap-top .gh-pill{display:none}
.gh-ap-name{flex:1;min-width:0;font-weight:550;font-size:15px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-ap-mini .gh-ap-name{font-size:14px}
.gh-ap-top .gh-pill{flex:none;max-width:60%}
.gh-ap-prog{grid-area:prog;min-width:0;font-size:var(--gh-ap-prog,24px);font-weight:500;letter-spacing:-.035em;line-height:1.1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:var(--gh-ap-prog-mb,12px)}
.gh-ap-prog .gh-it{font-size:1.04em;color:var(--gh-fg-2)}
.gh-ap-mini .gh-ap-prog{font-size:13px;letter-spacing:0;color:var(--gh-fg-2);margin-bottom:2px}
.gh-ap-ringc{grid-area:ring;display:flex}
.gh-ap-ringc .gh-ring b{font-size:var(--gh-ap-ringf,13px);font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.gh-ap-ringc .gh-ring svg+div svg{width:calc(var(--gh-ap-ring,64px)*.34);height:calc(var(--gh-ap-ring,64px)*.34)}
.gh-ap-off .gh-ap-ringc .gh-ring{opacity:.55}
.gh-ap-txt{grid-area:txt;min-width:0}
.gh-ap-big{font-size:var(--gh-ap-big,44px);line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-ap-big .gh-num{letter-spacing:-.045em}
.gh-ap-big .gh-unit{font-size:.42em;margin:0 .32em 0 .12em}
.gh-ap-big .gh-unit:last-child{margin-right:0}
.gh-ap-msg{font-family:var(--gh-serif);font-style:italic;font-weight:400;letter-spacing:-.02em;font-size:calc(var(--gh-ap-big,44px)*.72);
  line-height:1.05;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.gh-ap-sub{font-size:12.5px;color:var(--gh-fg-2);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.gh-ap-mini .gh-ap-sub{margin-top:3px;font-size:12px}
.gh-ap-sub b{color:var(--gh-fg);font-weight:550}
`;

let SEQ = 0;

/** Accent field with "like the device" as default */
function accentFieldsAuto(): RxWidgetInfoAttributesField[] {
    return [
        {
            name: 'accent',
            label: 'accent',
            type: 'select',
            options: [
                { value: 'auto', label: 'ap_accent_auto' },
                ...[...ACCENTS, 'custom'].map(a => ({ value: a, label: `accent_${a}` })),
            ],
            default: 'auto',
        },
        { name: 'color', label: 'color', type: 'color', hidden: 'data.accent !== "custom"' },
    ];
}

const hiddenWithoutRemaining = (data: WidgetData): boolean => !isOid(data.oidRemaining);

export default class GlashausAppliance extends GlashausWidget<ApplianceRxData, ApplianceState> {
    private rootRef = React.createRef<HTMLDivElement>();

    private figRef = React.createRef<HTMLDivElement>();

    private readonly uid = `ghap${++SEQ}`;

    private figEl: HTMLDivElement | null = null;

    private rootEl: HTMLDivElement | null = null;

    private fig: Figure | null = null;

    private figKey = '';

    private figState: FigState | null = null;

    private figMode: ApMode = 'off';

    private figDoor = false;

    private ro: ResizeObserver | null = null;

    private io: IntersectionObserver | null = null;

    private mql: MediaQueryList | null = null;

    private reduced = false;

    private inView = true;

    private raf = 0;

    private roRaf = 0;

    private last = 0;

    private readonly t0 = performance.now();

    /** The end time is shown: re-render every 30 s */
    private needTick = false;

    private tickTimer: ReturnType<typeof setInterval> | undefined;

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('appliance', AP_CSS);
        this.state = { ...this.state, w: 0, h: 0, tick: 0 };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausAppliance',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Appliance',
            visWidgetLabel: 'ap_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'deviceType',
                            label: 'ap_type',
                            type: 'select',
                            options: [
                                { value: 'washer', label: 'ap_type_washer' },
                                { value: 'dryer', label: 'ap_type_dryer' },
                                { value: 'dishwasher', label: 'ap_type_dishwasher' },
                            ],
                            default: 'washer',
                        },
                        { name: 'title', label: 'title', tooltip: 'ap_title_tip' },
                        ...accentFieldsAuto(),
                        {
                            name: 'finish',
                            label: 'ap_finish',
                            type: 'select',
                            options: [
                                { value: 'auto', label: 'ap_finish_auto' },
                                { value: 'white', label: 'ap_finish_white' },
                                { value: 'dark', label: 'ap_finish_dark' },
                            ],
                            default: 'auto',
                        },
                        { name: 'showFigure', label: 'ap_show_figure', type: 'checkbox', default: true },
                    ],
                },
                {
                    name: 'apState',
                    label: 'group_ap_state',
                    fields: [
                        {
                            name: 'stateHelp',
                            type: 'help',
                            text: `${ADAPTER}_ap_state_help`,
                        },
                        { name: 'oidState', label: 'ap_oid_state', type: 'id', tooltip: 'ap_oid_state_tip' },
                        {
                            name: 'valuesRun',
                            label: 'ap_values_run',
                            tooltip: 'ap_values_tip',
                            default: DEFAULT_VALUES.run,
                            hidden: (data: WidgetData) => !isOid(data.oidState),
                        },
                        {
                            name: 'valuesPause',
                            label: 'ap_values_pause',
                            tooltip: 'ap_values_tip',
                            default: DEFAULT_VALUES.pause,
                            hidden: (data: WidgetData) => !isOid(data.oidState),
                        },
                        {
                            name: 'valuesDone',
                            label: 'ap_values_done',
                            tooltip: 'ap_values_tip',
                            default: DEFAULT_VALUES.done,
                            hidden: (data: WidgetData) => !isOid(data.oidState),
                        },
                        {
                            name: 'valuesOff',
                            label: 'ap_values_off',
                            tooltip: 'ap_values_tip',
                            default: DEFAULT_VALUES.off,
                            hidden: (data: WidgetData) => !isOid(data.oidState),
                        },
                        {
                            name: 'oidRunning',
                            label: 'ap_oid_running',
                            type: 'id',
                            tooltip: 'ap_oid_running_tip',
                            hidden: (data: WidgetData) => isOid(data.oidState),
                        },
                        { name: 'oidDone', label: 'ap_oid_done', type: 'id', tooltip: 'ap_oid_done_tip' },
                        { name: 'oidDoor', label: 'ap_oid_door', type: 'id', tooltip: 'ap_oid_door_tip' },
                        { name: 'textDone', label: 'ap_text_done', tooltip: 'ap_text_done_tip' },
                    ],
                },
                {
                    name: 'apTime',
                    label: 'group_ap_time',
                    fields: [
                        {
                            name: 'oidRemaining',
                            label: 'ap_oid_remaining',
                            type: 'id',
                            onChange: async (field, data, changeData, socket) => {
                                const id = data[field.name!];
                                if (!isOid(id)) {
                                    return;
                                }
                                const obj = await socket.getObject(id);
                                const unit = String((obj?.common as ioBroker.StateCommon | undefined)?.unit || '')
                                    .trim()
                                    .toLowerCase();
                                const u: TimeUnit | null = ['s', 'sec', 'sek', 'seconds'].includes(unit)
                                    ? 's'
                                    : ['min', 'minutes', 'minuten', 'm'].includes(unit)
                                      ? 'min'
                                      : ['h', 'std', 'hours'].includes(unit)
                                        ? 'h'
                                        : null;
                                if (u && data.remainingUnit !== u) {
                                    data.remainingUnit = u;
                                    changeData(data);
                                }
                            },
                        },
                        {
                            name: 'remainingUnit',
                            label: 'ap_remaining_unit',
                            type: 'select',
                            options: [
                                { value: 's', label: 'ap_unit_s' },
                                { value: 'min', label: 'ap_unit_min' },
                                { value: 'h', label: 'ap_unit_h' },
                            ],
                            default: 'min',
                            tooltip: 'ap_remaining_unit_tip',
                        },
                        { name: 'oidProgress', label: 'ap_oid_progress', type: 'id', tooltip: 'ap_oid_progress_tip' },
                        {
                            name: 'oidTotal',
                            label: 'ap_oid_total',
                            type: 'id',
                            tooltip: 'ap_oid_total_tip',
                            hidden: (data: WidgetData) => isOid(data.oidProgress) || hiddenWithoutRemaining(data),
                        },
                        { name: 'showEnd', label: 'ap_show_end', type: 'checkbox', default: true },
                        { name: 'oidProgram', label: 'ap_oid_program', type: 'id', tooltip: 'ap_oid_program_tip' },
                        { name: 'programSub', label: 'ap_program_sub', tooltip: 'ap_program_sub_tip' },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 460, height: 280, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_appliance.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausAppliance.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.mql = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        this.reduced = !!this.mql?.matches;
        this.mql?.addEventListener('change', this.onMotion);
        document.addEventListener('visibilitychange', this.kick);
        this.attach();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: ApplianceState): void {
        super.componentDidUpdate(prevProps, prevState);
        this.attach();
    }

    componentWillUnmount(): void {
        this.stop();
        cancelAnimationFrame(this.roRaf);
        this.ro?.disconnect();
        this.ro = null;
        this.io?.disconnect();
        this.io = null;
        this.mql?.removeEventListener('change', this.onMotion);
        document.removeEventListener('visibilitychange', this.kick);
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = undefined;
        }
        this.fig = null;
        super.componentWillUnmount();
    }

    private onMotion = (): void => {
        this.reduced = !!this.mql?.matches;
        this.kick();
    };

    /** Observers, illustration and animation follow the DOM (vis-2 may re-create the elements) */
    private attach(): void {
        const root = this.rootRef.current;
        const figEl = this.figRef.current;
        if (root !== this.rootEl || figEl !== this.figEl) {
            this.ro?.disconnect();
            this.io?.disconnect();
            this.ro = null;
            this.io = null;
            this.rootEl = root;
            if (root && typeof ResizeObserver !== 'undefined') {
                this.ro = new ResizeObserver(() => {
                    // next frame: the new layout resizes the illustration, which would trigger the observer again
                    cancelAnimationFrame(this.roRaf);
                    this.roRaf = requestAnimationFrame(() => {
                        this.measure();
                        this.kick();
                    });
                });
                this.ro.observe(root);
                if (figEl) {
                    this.ro.observe(figEl);
                }
            }
            if (figEl && typeof IntersectionObserver !== 'undefined') {
                this.io = new IntersectionObserver(entries => {
                    this.inView = entries.some(e => e.isIntersecting);
                    this.kick();
                });
                this.io.observe(figEl);
            }
            this.measure();
        }
        this.syncFigure(figEl);
        this.syncTick();
    }

    private syncTick(): void {
        if (this.needTick && !this.tickTimer) {
            this.tickTimer = setInterval(() => {
                if (!document.hidden) {
                    this.setState({ tick: Date.now() });
                }
            }, 30000);
        } else if (!this.needTick && this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = undefined;
        }
    }

    private measure(): void {
        const root = this.rootEl;
        if (!root) {
            return;
        }
        const w = root.clientWidth;
        const h = root.clientHeight;
        if (w !== this.state.w || h !== this.state.h) {
            this.setState({ w, h });
        }
    }

    private type(): ApType {
        const t = this.state.rxData.deviceType;
        return t === 'dryer' || t === 'dishwasher' ? t : 'washer';
    }

    private finish(): ApFinish {
        const f = this.state.rxData.finish;
        return f === 'white' || f === 'dark' ? f : 'auto';
    }

    /** Builds the illustration when the element, type or finish changed; hands the current state to it */
    private syncFigure(el: HTMLDivElement | null): void {
        const type = this.type();
        const finish = this.finish();
        const key = `${type}|${finish}`;
        if (el !== this.figEl || key !== this.figKey) {
            this.stop();
            this.figEl = el;
            this.figKey = key;
            this.fig = null;
            if (el) {
                el.innerHTML = `<svg viewBox="${VIEWBOX[type]}" preserveAspectRatio="xMidYMid meet" role="img">${figureMarkup(type, `${this.uid}${type[0]}`, finish)}</svg>`;
                const svg = el.querySelector('svg');
                if (svg) {
                    this.fig = createFigure(type, svg, el);
                }
            }
        }
        if (!el || !this.fig || !this.figState) {
            return;
        }
        el.dataset.mode = this.figMode;
        el.dataset.door = this.figDoor ? '1' : '0';
        el.querySelector('svg')?.setAttribute('aria-label', this.titleText());
        this.fig.apply(this.figState);
        this.kick();
    }

    /** Runs the animation loop while the illustration is visible and something moves */
    private kick = (): void => {
        const el = this.figEl;
        if (!this.fig || !el) {
            return;
        }
        const visible = !document.hidden && this.inView && el.clientWidth > 0 && el.clientHeight > 0;
        el.dataset.paused = visible ? '0' : '1';
        if (!visible) {
            this.stop();
            return;
        }
        if (!this.raf) {
            this.last = 0;
            this.raf = requestAnimationFrame(this.frame);
        }
    };

    private stop(): void {
        if (this.raf) {
            cancelAnimationFrame(this.raf);
            this.raf = 0;
        }
    }

    private frame = (now: number): void => {
        this.raf = 0;
        if (!this.fig) {
            return;
        }
        const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
        this.last = now;
        const busy = this.fig.step(dt, (now - this.t0) / 1000, this.reduced);
        if (busy && !document.hidden && this.inView) {
            this.raf = requestAnimationFrame(this.frame);
        }
    };

    private isDemo(): boolean {
        const d = this.state.rxData;
        return !isOid(d.oidState) && !isOid(d.oidRunning) && !isOid(d.oidDone);
    }

    private titleText(): string {
        return GlashausWidget.ghText(this.state.rxData.title) || GlashausWidget.tr(`ap_type_${this.type()}`);
    }

    /** Reads mode, times, program and door from the configured IDs (or the demo of the type) */
    private read(): Reading {
        const d = this.state.rxData;
        const type = this.type();
        const programSub = GlashausWidget.ghText(d.programSub);
        if (this.isDemo()) {
            const demo = DEMO[type];
            return {
                mode: 'run',
                known: true,
                raw: '',
                fault: false,
                remaining: demo.remaining,
                progress: demo.progress,
                program: GlashausWidget.tr(`ap_demo_prog_${type}`),
                sub: programSub || GlashausWidget.tr(`ap_demo_sub_${type}`),
                door: false,
                since: null,
            };
        }
        let mode: ApMode = 'off';
        let known = true;
        let raw = '';
        let fault = false;
        let since: number | null = null;
        if (isOid(d.oidState)) {
            const v = this.ghVal(d.oidState);
            if (v === undefined || v === null || v === '') {
                known = false;
            } else {
                const m = modeFromState(v, {
                    run: d.valuesRun,
                    pause: d.valuesPause,
                    done: d.valuesDone,
                    off: d.valuesOff,
                });
                if (m) {
                    mode = m;
                } else {
                    raw = prettyProgram(v);
                    fault = isFault(v);
                }
            }
            since = this.ghLc(d.oidState) ?? null;
        } else if (isOid(d.oidRunning)) {
            const v = this.ghVal(d.oidRunning);
            if (v === undefined || v === null) {
                known = false;
            } else {
                mode = toBool(v) ? 'run' : 'off';
            }
            since = this.ghLc(d.oidRunning) ?? null;
        }
        if (isOid(d.oidDone)) {
            const v = this.ghVal(d.oidDone);
            if (v === undefined || v === null) {
                if (!isOid(d.oidState) && !isOid(d.oidRunning)) {
                    known = false;
                }
            } else if (mode !== 'run' && mode !== 'pause' && toBool(v)) {
                mode = 'done';
                since = this.ghLc(d.oidDone) ?? since;
            }
        }
        const unit: TimeUnit = d.remainingUnit === 's' || d.remainingUnit === 'h' ? d.remainingUnit : 'min';
        const remaining = isOid(d.oidRemaining) ? toMinutes(this.ghVal(d.oidRemaining), unit) : null;
        let progress: number | null = null;
        if (isOid(d.oidProgress)) {
            const p = toNum(this.ghVal(d.oidProgress));
            progress = p === null ? null : clamp(p / 100, 0, 1);
        } else if (isOid(d.oidTotal) && remaining !== null) {
            const total = toMinutes(this.ghVal(d.oidTotal), unit);
            progress = total && total > 0 ? clamp(1 - remaining / total, 0, 1) : null;
        }
        if (mode === 'done') {
            progress = 1;
        } else if (mode === 'off') {
            // a progress value that was not reset after the program is not shown
            progress = null;
        }
        return {
            mode,
            known,
            raw,
            fault,
            remaining,
            progress,
            program: isOid(d.oidProgram) ? prettyProgram(this.ghVal(d.oidProgram)) : '',
            sub: programSub,
            door: isOid(d.oidDoor) ? doorOpen(this.ghVal(d.oidDoor)) : false,
            since,
        };
    }

    /** Sizes of the three layouts: illustration beside the info, above it, or no illustration */
    private layout(type: ApType): {
        layout: Layout;
        pad: number;
        gap: number;
        figW: number;
        figH: number;
        big: number;
        ring: number;
        prog: number;
        /** Width of the text column */
        infoW: number;
    } {
        const w = this.state.w || 460;
        const h = this.state.h || 280;
        const pad = Math.round(clamp(Math.min(w, h) * 0.075, 12, 22));
        const gap = Math.round(clamp(w * 0.045, 12, 26));
        const ratio = FIG_RATIO[type];
        const showFig = isTrue(this.state.rxData.showFigure, true);
        const ih = h - 2 * pad;
        const iw = w - 2 * pad;
        if (showFig && h >= 150) {
            const figW = Math.min(ih * ratio, w * 0.4);
            const infoW = iw - figW - gap;
            if (infoW >= 170 && w / h >= 1.15) {
                const big = clamp(Math.min(infoW * 0.17, ih * 0.21), 24, 64);
                return {
                    layout: 'wide',
                    pad,
                    gap,
                    figW,
                    figH: ih,
                    big,
                    ring: clamp(big * 1.5, 46, 92),
                    prog: clamp(big * 0.52, 15, 34),
                    infoW,
                };
            }
        }
        if (showFig && h >= 280 && w >= 160) {
            const big = clamp(Math.min(iw * 0.15, h * 0.09), 22, 46);
            return {
                layout: 'tall',
                pad,
                gap: Math.round(clamp(h * 0.04, 10, 22)),
                figW: iw,
                figH: 0,
                big,
                ring: clamp(big * 1.45, 44, 76),
                prog: clamp(big * 0.55, 14, 26),
                infoW: iw,
            };
        }
        const ring = clamp(Math.min(ih, w * 0.32), 40, 84);
        const infoW = iw - ring - clamp(ring * 0.24, 10, 18);
        return {
            layout: 'mini',
            pad,
            gap,
            figW: 0,
            figH: 0,
            big: clamp(Math.min(ih * 0.3, infoW * 0.2), 18, 40),
            ring,
            prog: 13,
            infoW,
        };
    }

    /** "1 h 05 min" with big numbers and small units */
    private static renderRest(min: number): React.JSX.Element {
        const m = Math.max(0, Math.ceil(min));
        if (m < 60) {
            return (
                <>
                    <span className="gh-num">{m}</span>
                    <span className="gh-unit">min</span>
                </>
            );
        }
        return (
            <>
                <span className="gh-num">{Math.floor(m / 60)}</span>
                <span className="gh-unit">h</span>
                <span className="gh-num">{String(m % 60).padStart(2, '0')}</span>
                <span className="gh-unit">min</span>
            </>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const lang = this.ghLang();
        const type = this.type();
        const demo = this.isDemo();
        const r = this.read();
        const tr = GlashausWidget.tr;
        const accent = !d.accent || d.accent === 'auto' ? accentColor(DEFAULT_ACCENT[type]) : this.ghAccent('', 'home');
        const L = this.layout(type);
        const mode = r.mode;
        const title = this.titleText();

        // illustration state and end time clock, handed over in componentDidUpdate
        this.needTick = mode === 'run' && r.remaining !== null && isTrue(d.showEnd, true);
        let display = '';
        if (mode === 'run' || mode === 'pause') {
            display =
                r.remaining !== null
                    ? displayTime(r.remaining)
                    : r.progress !== null
                      ? `${Math.round(r.progress * 100)}%`
                      : '';
        } else if (mode === 'done') {
            display = tr('ap_disp_end');
        }
        this.figMode = mode;
        this.figDoor = r.door && mode !== 'run';
        this.figState = {
            mode,
            progress: r.progress,
            door: this.figDoor,
            display,
            program: mode === 'off' ? '' : r.program,
        };

        // pill
        let pillKind: GhPillKind = 'idle';
        let pillText: string;
        let live = false;
        if (!r.known) {
            pillText = tr('ap_offline');
        } else if (mode === 'run') {
            pillKind = 'info';
            pillText = tr('ap_run');
            live = true;
        } else if (mode === 'pause') {
            pillKind = 'warn';
            pillText = tr('ap_pause');
        } else if (mode === 'done') {
            pillKind = 'ok';
            pillText = r.door ? tr('ap_door_open') : tr('ap_done');
            live = !r.door;
        } else if (r.raw) {
            // a state value that matches no list is shown as it is
            pillKind = r.fault ? 'crit' : 'idle';
            pillText = r.raw;
        } else if (r.door) {
            pillText = tr('ap_door_open');
        } else {
            pillText = tr('ap_off');
        }

        // ring
        const pct = r.progress === null ? null : Math.round(r.progress * 100);
        let ringContent: React.ReactNode;
        if (mode === 'done') {
            ringContent = (
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ color: 'var(--gh-ok)' }}
                >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
            );
        } else if ((mode === 'run' || mode === 'pause') && pct !== null) {
            ringContent = <b>{`${fmtNum(pct, 0, lang)} %`}</b>;
        } else {
            ringContent = <GhIcon name={ICON[type]} />;
        }

        // big line and the small line below
        let big: React.ReactNode;
        let sub: React.ReactNode = null;
        if (mode === 'run' || mode === 'pause') {
            if (r.remaining !== null) {
                big = <div className="gh-ap-big">{GlashausAppliance.renderRest(r.remaining)}</div>;
                if (mode === 'pause') {
                    sub = `${tr('ap_left')} · ${tr('ap_paused_sub')}`;
                } else if (this.needTick) {
                    const end = fmtTime(Date.now() + Math.ceil(r.remaining) * 60000, lang);
                    sub = (
                        <>
                            {tr('ap_end_at')} <b>{end}</b>
                        </>
                    );
                } else {
                    sub = tr('ap_left');
                }
            } else if (pct !== null) {
                big = (
                    <div className="gh-ap-big">
                        <span className="gh-num">{fmtNum(pct, 0, lang)}</span>
                        <span className="gh-unit">%</span>
                    </div>
                );
                sub = mode === 'pause' ? tr('ap_paused_sub') : tr('ap_progress');
            } else {
                big = <div className="gh-ap-msg">{mode === 'pause' ? tr('ap_pause_big') : tr('ap_run_big')}</div>;
            }
        } else if (mode === 'done') {
            big = <div className="gh-ap-msg">{GlashausWidget.ghText(d.textDone) || tr('ap_text_done_default')}</div>;
            if (r.since) {
                // weekday in front when it finished before today
                const day =
                    new Date(r.since).toDateString() === new Date().toDateString()
                        ? ''
                        : `${fmtDate(r.since, lang, { weekday: 'short' })} `;
                sub = `${tr('ap_done_since')} ${day}${fmtTime(r.since, lang)}`;
            }
        } else {
            big = (
                <div className="gh-ap-msg">
                    {!r.known ? tr('ap_no_data') : r.fault ? tr('ap_fault_big') : r.raw || tr('ap_off_big')}
                </div>
            );
            // (the pill shows the door unless it shows an unknown state)
            sub = r.door && r.raw ? tr('ap_door_open') : null;
        }
        const showProg =
            !!(r.program || r.sub) && mode !== 'off' && !(L.layout === 'mini' && (this.state.h || 0) < 118);

        const style = {
            '--gh-ap-pad': `${L.pad}px`,
            '--gh-ap-gap': `${L.gap}px`,
            '--gh-ap-big': `${L.big.toFixed(1)}px`,
            '--gh-ap-ring': `${L.ring.toFixed(0)}px`,
            '--gh-ap-ringf': `${clamp(L.ring * 0.22, 11, 19).toFixed(1)}px`,
            '--gh-ap-prog': `${L.prog.toFixed(1)}px`,
            '--gh-ap-cg': `${clamp(L.ring * 0.24, 10, 18).toFixed(0)}px`,
            '--gh-ap-top-mb': `${L.layout === 'tall' ? 10 : clamp(L.big * 0.32, 8, 16).toFixed(0)}px`,
            '--gh-ap-prog-mb': `${clamp(L.big * 0.3, 6, 14).toFixed(0)}px`,
        } as React.CSSProperties;

        return (
            <div
                ref={this.rootRef}
                className={this.ghClass(`gh-ap gh-ap-${mode}`)}
                style={style}
                data-type={type}
            >
                <div
                    className={`gh-ap-in gh-ap-${L.layout}${L.infoW < 250 ? ' gh-ap-noico' : ''}${
                        L.layout === 'mini' && L.infoW < 170 ? ' gh-ap-nopill' : ''
                    }`}
                >
                    <div
                        ref={this.figRef}
                        className="gh-ap-fig"
                        style={L.layout === 'wide' ? { width: L.figW, height: L.figH } : undefined}
                    />
                    <div className="gh-ap-info">
                        <div className="gh-ap-top">
                            <GhIconBox
                                name={ICON[type]}
                                color={accent}
                            />
                            <span
                                className="gh-ap-name"
                                title={title}
                            >
                                {title}
                            </span>
                            <GhPill
                                kind={pillKind}
                                live={live}
                            >
                                {pillText}
                            </GhPill>
                        </div>
                        {showProg ? (
                            <div className="gh-ap-prog">
                                {r.program}
                                {r.program && r.sub ? ' ' : ''}
                                {r.sub ? <span className="gh-it">{r.sub}</span> : null}
                            </div>
                        ) : null}
                        <div className="gh-ap-ringc">
                            <GhRing
                                value={r.progress ?? 0}
                                size={L.ring}
                                stroke={L.ring < 56 ? 8 : 6}
                                color={mode === 'done' ? 'var(--gh-ok)' : accent}
                            >
                                {ringContent}
                            </GhRing>
                        </div>
                        <div className="gh-ap-txt">
                            {big}
                            {sub ? <div className="gh-ap-sub">{sub}</div> : null}
                        </div>
                    </div>
                </div>
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}
