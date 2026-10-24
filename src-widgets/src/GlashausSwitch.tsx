/* Switch tile: icon, title, state text and toggle; the whole tile turns "ink" when it is on.
 * Types: switch (toggles), button (momentary: writes the on value, 300 ms later the off value), scene (writes the on value).
 * Optional dimmer (glass slider on a level ID) and an optional confirmation before switching.
 * Without object IDs the tile toggles locally (demo). */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { GhIcon, GhIconBox } from './core/components';
import { clamp, fmtNum, toBool, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';

interface SwitchRxData {
    oid: string;
    oidState: string;
    title: string;
    icon: string;
    iconCustom: string;
    accent: string;
    color: string;
    type: 'switch' | 'button' | 'scene';
    valueOn: string;
    valueOff: string;
    textOn: string;
    textOff: string;
    layout: 'tile' | 'row';
    spin: boolean | string;
    levelOid: string;
    levelMin: number | string;
    levelMax: number | string;
    levelUnit: string;
    confirm: boolean | string;
    confirmText: string;
}

interface SwitchState extends VisRxWidgetState {
    /** State of the demo tile (no IDs configured) */
    demoOn: boolean;
    /** Optimistic state after a click, until the state comes back */
    optOn: boolean | null;
    /** Level while dragging or until the level state comes back */
    optLevel: number | null;
    /** Button / scene: tile is ink for a moment */
    flash: boolean;
    /** Button / scene: "Done" text for a moment */
    done: boolean;
    confirming: boolean;
}

const CSS = `
.gh.gh-sw{padding:0;container:gh-sw/size;user-select:none;-webkit-user-select:none;
  transition:background .45s var(--gh-ease),color .45s,transform .5s var(--gh-spring)}
/* press feedback only for the tile itself, not while the dimmer is dragged */
.gh.gh-sw.gh-sw-live:has(> .gh-sw-hit:active){transform:scale(.97)}
.gh.gh-sw.gh-on.gh-glass:hover::after{opacity:.22}
.gh-sw-hit{flex:1;min-height:0;display:grid;gap:10px 12px;padding:16px;cursor:pointer;border-radius:inherit;outline-offset:-4px;
  grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(0,1fr);grid-template-areas:"ico tog" "txt txt"}
.gh-sw-edit .gh-sw-hit{cursor:default}
.gh-sw-hit:focus-visible{outline:2px solid currentColor}
.gh-sw-ico{grid-area:ico;display:flex;min-width:0}
.gh-sw-tg{grid-area:tog;display:flex;align-items:center}
.gh-sw-txt{grid-area:txt;align-self:end;min-width:0;display:flex;flex-direction:column}
.gh-sw-nm{font-weight:550;font-size:14.5px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-sw-st{font-size:13px;color:var(--gh-fg-2);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-variant-numeric:tabular-nums;transition:color .45s}
.gh-sw-nodata .gh-sw-st{color:var(--gh-fg-3)}
.gh-sw-nodata .gh-ico{opacity:.55}
.gh-sw .gh-ico{transition:background .45s,color .45s,box-shadow .45s}
.gh.gh-sw.gh-on .gh-ico{background:var(--gh-c);color:var(--gh-bg);
  box-shadow:0 0 0 6px color-mix(in srgb,var(--gh-c) 24%,transparent),0 8px 26px -4px var(--gh-c)}
/* accent "ink" on an ink tile: the accent becomes the paper color */
.gh.gh-sw.gh-sw-ink.gh-on .gh-ico{color:var(--gh-fg)}
.gh.gh-sw.gh-sw-ink.gh-on .gh-toggle::after,.gh.gh-sw.gh-sw-ink.gh-on .gh-sw-fill::after{background:var(--gh-fg)}
.gh.gh-sw.gh-sw-spin.gh-on .gh-ico svg{animation:gh-sw-spin 1.4s linear infinite}
@keyframes gh-sw-spin{to{transform:rotate(360deg)}}
.gh-sw .gh-toggle{pointer-events:none}
.gh-sw .gh-toggle.gh-sw-tog-on{background:var(--gh-c,var(--gh-ok))}
.gh-sw .gh-toggle.gh-sw-tog-on::after{transform:translateX(18px)}
.gh-sw.gh-on .gh-toggle:not(.gh-sw-tog-on){background:color-mix(in srgb,var(--gh-bg) 22%,transparent)}
.gh-sw-go{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;
  border:1px solid color-mix(in srgb,currentColor 24%,transparent);color:var(--gh-fg-2)}
.gh-sw-go svg{width:14px;height:14px}
.gh-sw-row .gh-sw-hit{grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:minmax(0,1fr);
  grid-template-areas:"ico txt tog";align-items:center;padding:12px 16px}
.gh-sw-row .gh-sw-txt{align-self:center}
.gh-sw-lvl{display:flex;align-items:center;gap:10px;padding:0 16px 14px;flex:none}
.gh-sw-trk{--gh-sw-k:26px;position:relative;flex:1;min-width:0;height:var(--gh-sw-k);border-radius:99px;cursor:pointer;touch-action:none;
  background:var(--gh-track);box-shadow:inset 0 1px 2px var(--gh-edge);outline-offset:3px}
.gh-sw-edit .gh-sw-trk{cursor:default}
.gh-sw.gh-on .gh-sw-trk{background:color-mix(in srgb,var(--gh-bg) 18%,transparent)}
.gh-sw-fill{position:absolute;left:0;top:0;bottom:0;min-width:var(--gh-sw-k);border-radius:99px;
  background:linear-gradient(90deg,color-mix(in srgb,var(--gh-c) 70%,transparent),var(--gh-c));
  transition:width .35s var(--gh-ease)}
.gh-sw-drag .gh-sw-fill{transition:none}
.gh-sw-fill::after{content:'';position:absolute;right:4px;top:4px;width:calc(var(--gh-sw-k) - 8px);height:calc(var(--gh-sw-k) - 8px);border-radius:50%;
  background:var(--gh-knob);box-shadow:0 1px 3px rgba(0,0,0,.25)}
.gh-sw-lv{font-size:13px;font-weight:550;font-variant-numeric:tabular-nums;min-width:44px;text-align:right;white-space:nowrap}
.gh-sw-cf{position:absolute;inset:0;z-index:3;border-radius:inherit;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:12px;padding:12px;text-align:center;color:var(--gh-fg);
  background:color-mix(in srgb,var(--gh-bg) 96%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
  animation:gh-sw-in .3s var(--gh-ease) both}
@keyframes gh-sw-in{from{opacity:0;transform:scale(.96)}}
.gh-sw-q{font-size:14px;font-weight:550;line-height:1.25;max-width:100%;overflow:hidden;display:-webkit-box;
  -webkit-line-clamp:3;-webkit-box-orient:vertical}
.gh-sw-btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.gh-sw-btns .gh-ink,.gh-sw-btns .gh-outline{height:34px;padding:0 14px;font-size:13px}
@container gh-sw (max-height:112px){
  .gh-sw-tile .gh-sw-hit{padding:11px 12px;gap:6px 10px}
  .gh-sw-tile .gh-ico{width:28px;height:28px;border-radius:9px}
  .gh-sw-tile .gh-ico svg{width:16px;height:16px}
  .gh-sw-nm{font-size:13.5px}
  .gh-sw-st{font-size:12px;margin-top:1px}
  .gh-sw-lvl{padding:0 12px 10px}
  .gh-sw-trk{--gh-sw-k:22px}
}
@container gh-sw (max-width:132px){
  .gh-sw-tile .gh-sw-hit{padding:12px}
  .gh-sw-lvl{padding:0 12px 12px}
  .gh-sw-lv{display:none}
}
/* too low for icon above text: one row like the "row" layout */
@container gh-sw (max-height:90px){
  .gh-sw-tile .gh-sw-hit{grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:minmax(0,1fr);
    grid-template-areas:"ico txt tog";align-items:center}
  .gh-sw-tile .gh-sw-txt{align-self:center}
}
@container gh-sw (max-height:122px){
  .gh-sw-tile.gh-sw-haslvl .gh-sw-hit{grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:minmax(0,1fr);
    grid-template-areas:"ico txt tog";align-items:center}
  .gh-sw-tile.gh-sw-haslvl .gh-sw-txt{align-self:center}
}
/* narrow rows: the ink tile shows the state, the toggle makes room for the text */
@container gh-sw (max-width:170px){
  .gh-sw-row .gh-sw-tg{display:none}
  .gh-sw-row .gh-sw-hit{grid-template-columns:auto minmax(0,1fr);grid-template-areas:"ico txt"}
}
@container gh-sw (max-width:170px) and (max-height:90px){
  .gh-sw-tile .gh-sw-tg{display:none}
  .gh-sw-tile .gh-sw-hit{grid-template-columns:auto minmax(0,1fr);grid-template-areas:"ico txt"}
}
@container gh-sw (max-width:170px) and (max-height:122px){
  .gh-sw-tile.gh-sw-haslvl .gh-sw-tg{display:none}
  .gh-sw-tile.gh-sw-haslvl .gh-sw-hit{grid-template-columns:auto minmax(0,1fr);grid-template-areas:"ico txt"}
}
@container gh-sw (min-width:250px) and (min-height:210px){
  .gh-sw-tile .gh-sw-hit{padding:20px}
  .gh-sw-tile .gh-ico{width:44px;height:44px;border-radius:14px}
  .gh-sw-tile .gh-ico svg{width:23px;height:23px}
  .gh-sw-tile .gh-sw-nm{font-size:18px}
  .gh-sw-tile .gh-sw-st{font-size:14px}
  .gh-sw-tile .gh-sw-lvl{padding:0 20px 20px}
  .gh-sw-tile .gh-sw-trk{--gh-sw-k:32px}
}
.gh-sw-cx-i{display:none}
@container gh-sw (max-height:130px){
  .gh-sw-cf{gap:6px;padding:8px}
  .gh-sw-q{-webkit-line-clamp:2;font-size:12.5px}
  .gh-sw-btns .gh-ink,.gh-sw-btns .gh-outline{height:28px;padding:0 10px;font-size:12px}
}
@container gh-sw (max-width:170px){
  .gh-sw-btns{gap:6px}
  .gh-sw-btns .gh-outline{width:28px;padding:0;justify-content:center}
  .gh-sw-cx-t{display:none}
  .gh-sw-cx-i{display:inline;font-size:15px;line-height:1}
}
@media (prefers-reduced-motion:reduce){.gh.gh-sw.gh-sw-live:has(> .gh-sw-hit:active){transform:none}}
`;

/** Attribute text → state value: 'true'/'false' → boolean, numeric text → number, else the text */
function parseValue(v: unknown, def: boolean): ioBroker.StateValue {
    if (v === undefined || v === null || v === '') {
        return def;
    }
    if (typeof v === 'boolean' || typeof v === 'number') {
        return v;
    }
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) {
        return def;
    }
    if (s === 'true') {
        return true;
    }
    if (s === 'false') {
        return false;
    }
    if (/^-?\d+([.,]\d+)?$/.test(s)) {
        return Number(s.replace(',', '.'));
    }
    return s;
}

/** Loose comparison of a state value with a configured value */
function sameValue(a: unknown, b: ioBroker.StateValue): boolean {
    if (a === undefined || a === null) {
        return false;
    }
    if (typeof b === 'boolean') {
        return typeof a === 'boolean' ? a === b : toBool(a) === b;
    }
    if (typeof b === 'number') {
        const n = toNum(a);
        return n !== null && n === b;
    }
    const t = typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean' ? String(a) : '';
    return t.trim().toLowerCase() === String(b).trim().toLowerCase();
}

export default class GlashausSwitch extends GlashausWidget<SwitchRxData, SwitchState> {
    private timers = new Set<ReturnType<typeof setTimeout>>();

    private optTimer: ReturnType<typeof setTimeout> | undefined;

    /** Keyboard: the level is written a moment after the last key */
    private levelSendTimer: ReturnType<typeof setTimeout> | undefined;

    /** After writing: the shown level is kept until the state comes back, at most this long */
    private levelHoldTimer: ReturnType<typeof setTimeout> | undefined;

    private confirmTimer: ReturnType<typeof setTimeout> | undefined;

    /** Writes that must still happen when the widget goes away (button release, level after keys) */
    private pending = new Map<string, ioBroker.StateValue>();

    private trackRef = React.createRef<HTMLDivElement>();

    private yesRef = React.createRef<HTMLButtonElement>();

    private hitRef = React.createRef<HTMLDivElement>();

    private dragging = false;

    /** Last level > min, to restore when a pure dimmer is switched on */
    private lastLevel: number | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('switch', CSS);
        this.state = {
            ...this.state,
            demoOn: true,
            optOn: null,
            optLevel: null,
            flash: false,
            done: false,
            confirming: false,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausSwitch',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Switch',
            visWidgetLabel: 'switch_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'oid',
                            label: 'sw_oid',
                            type: 'id',
                            tooltip: 'sw_oid_tip',
                            onChange: async (field, data, changeData, socket) => {
                                const id = data[field.name!];
                                if (!isOid(id) || data.title) {
                                    return;
                                }
                                const obj = await socket.getObject(id);
                                const common = obj?.common as ioBroker.StateCommon | undefined;
                                if (!common) {
                                    return;
                                }
                                const n = common.name;
                                data.title =
                                    typeof n === 'object'
                                        ? n[GlashausWidget.getLanguage()] || n.en
                                        : n || id.split('.').pop();
                                changeData(data);
                            },
                        },
                        { name: 'oidState', label: 'sw_oid_state', type: 'id', tooltip: 'sw_oid_state_tip' },
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields('bulb'),
                        ...GlashausWidget.accentFields('', 'sun'),
                        {
                            name: 'type',
                            label: 'sw_type',
                            type: 'select',
                            options: [
                                { value: 'switch', label: 'sw_type_switch' },
                                { value: 'button', label: 'sw_type_button' },
                                { value: 'scene', label: 'sw_type_scene' },
                            ],
                            default: 'switch',
                        },
                        { name: 'valueOn', label: 'sw_value_on', default: 'true', tooltip: 'sw_value_tip' },
                        {
                            name: 'valueOff',
                            label: 'sw_value_off',
                            default: 'false',
                            tooltip: 'sw_value_tip',
                            hidden: (data: WidgetData) => data.type === 'scene',
                        },
                        { name: 'textOn', label: 'sw_text_on', tooltip: 'sw_text_tip' },
                        { name: 'textOff', label: 'sw_text_off', tooltip: 'sw_text_tip' },
                        {
                            name: 'layout',
                            label: 'sw_layout',
                            type: 'select',
                            options: [
                                { value: 'tile', label: 'sw_layout_tile' },
                                { value: 'row', label: 'sw_layout_row' },
                            ],
                            default: 'tile',
                        },
                        { name: 'spin', label: 'sw_spin', type: 'checkbox', default: false },
                    ],
                },
                {
                    name: 'dimmer',
                    label: 'group_sw_dimmer',
                    // buttons and scenes have no level
                    hidden: (data: WidgetData) => data.type === 'button' || data.type === 'scene',
                    fields: [
                        { name: 'levelOid', label: 'sw_level_oid', type: 'id', tooltip: 'sw_level_tip' },
                        {
                            name: 'levelMin',
                            label: 'sw_level_min',
                            type: 'number',
                            default: 0,
                            hidden: (data: WidgetData) => !isOid(data.levelOid),
                        },
                        {
                            name: 'levelMax',
                            label: 'sw_level_max',
                            type: 'number',
                            default: 100,
                            hidden: (data: WidgetData) => !isOid(data.levelOid),
                        },
                        {
                            name: 'levelUnit',
                            label: 'unit',
                            default: '%',
                            hidden: (data: WidgetData) => !isOid(data.levelOid),
                        },
                    ],
                },
                {
                    name: 'confirmation',
                    label: 'group_sw_confirm',
                    fields: [
                        { name: 'confirm', label: 'sw_confirm', type: 'checkbox', default: false },
                        {
                            name: 'confirmText',
                            label: 'sw_confirm_text',
                            hidden: (data: WidgetData) => !isTrue(data.confirm),
                        },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 180, height: 150, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_switch.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausSwitch.getWidgetInfo();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: SwitchState): void {
        super.componentDidUpdate(prevProps, prevState);
        if (this.state.confirming && !prevState.confirming) {
            this.yesRef.current?.focus();
        }
    }

    componentWillUnmount(): void {
        this.timers.forEach(t => clearTimeout(t));
        this.timers.clear();
        [this.optTimer, this.levelSendTimer, this.levelHoldTimer, this.confirmTimer].forEach(t => t && clearTimeout(t));
        // a momentary button must not stay "pressed", a level chosen with the keys must not get lost
        this.pending.forEach((v, id) => this.ghSet(id, v));
        this.pending.clear();
        super.componentWillUnmount();
    }

    onStateUpdated(id: string, state: ioBroker.State): void {
        super.onStateUpdated(id, state);
        const d = this.state.rxData;
        // drop the optimistic state only when the read state confirms it (stale updates keep it, 4 s at most)
        const src = this.readSource();
        if (this.state.optOn !== null && src?.id === id && this.valueOn(src, state?.val) === this.state.optOn) {
            this.setState({ optOn: null });
        }
        if (
            this.state.optLevel !== null &&
            id === d.levelOid &&
            !this.dragging &&
            !this.levelSendTimer &&
            toNum(state?.val) === this.state.optLevel
        ) {
            this.setState({ optLevel: null });
        }
    }

    private later(ms: number, fn: () => void): void {
        const t = setTimeout(() => {
            this.timers.delete(t);
            fn();
        }, ms);
        this.timers.add(t);
    }

    private isDemo(): boolean {
        const d = this.state.rxData;
        return !isOid(d.oid) && !isOid(d.oidState) && !isOid(d.levelOid);
    }

    private levelRange(): [number, number] {
        const d = this.state.rxData;
        const min = toNum(d.levelMin) ?? 0;
        const max = toNum(d.levelMax) ?? 100;
        return max > min ? [min, max] : [0, 100];
    }

    /** Current level (optimistic while dragging), or null */
    private level(): number | null {
        if (this.state.optLevel !== null) {
            return this.state.optLevel;
        }
        const d = this.state.rxData;
        return isOid(d.levelOid) ? this.ghNum(d.levelOid) : null;
    }

    /** The ID that tells whether it is on: own state ID, else the written ID, else the level (pure dimmer) */
    private readSource(): { id: string; level: boolean } | null {
        const d = this.state.rxData;
        const sw = (d.type || 'switch') === 'switch';
        if (isOid(d.oidState)) {
            return { id: d.oidState, level: false };
        }
        if (sw && isOid(d.oid)) {
            return { id: d.oid, level: false };
        }
        if (sw && isOid(d.levelOid)) {
            return { id: d.levelOid, level: true };
        }
        return null;
    }

    /** On/off of a value of the read ID; null when there is no value */
    private valueOn(src: { level: boolean }, raw: unknown): boolean | null {
        if (raw === undefined || raw === null) {
            return null;
        }
        if (src.level) {
            const l = toNum(raw);
            return l === null ? null : l > this.levelRange()[0];
        }
        const d = this.state.rxData;
        if (sameValue(raw, parseValue(d.valueOn, true))) {
            return true;
        }
        if (sameValue(raw, parseValue(d.valueOff, false))) {
            return false;
        }
        return toBool(raw);
    }

    /** Shown on/off: demo, optimistic after a click, else the read state; null when there is no value */
    private isOn(): boolean | null {
        if (this.isDemo()) {
            return this.state.demoOn;
        }
        if (this.state.optOn !== null) {
            return this.state.optOn;
        }
        const src = this.readSource();
        return src ? this.valueOn(src, this.ghVal(src.id)) : null;
    }

    private onActivate = (): void => {
        if (this.props.editMode) {
            return;
        }
        if (isTrue(this.state.rxData.confirm) && !this.state.confirming) {
            this.setState({ confirming: true });
            if (this.confirmTimer) {
                clearTimeout(this.confirmTimer);
            }
            // unanswered questions close by themselves
            this.confirmTimer = setTimeout(() => this.closeConfirm(), 10000);
            return;
        }
        this.run();
    };

    /** Closes the question; the focus goes back to the tile if it was in the question */
    private closeConfirm(then?: () => void): void {
        if (this.confirmTimer) {
            clearTimeout(this.confirmTimer);
            this.confirmTimer = undefined;
        }
        const hadFocus = !!this.yesRef.current?.parentElement?.contains(document.activeElement);
        this.setState({ confirming: false }, () => {
            if (hadFocus) {
                this.hitRef.current?.focus();
            }
            then?.();
        });
    }

    private onCancel = (): void => this.closeConfirm();

    private onConfirm = (): void => this.closeConfirm(() => this.run());

    private flashTile(): void {
        this.setState({ flash: true, done: true });
        this.later(650, () => this.setState({ flash: false }));
        this.later(1800, () => this.setState({ done: false }));
    }

    /** Executes the action of the tile */
    private run(): void {
        const d = this.state.rxData;
        const type = d.type || 'switch';
        const vOn = parseValue(d.valueOn, true);
        const vOff = parseValue(d.valueOff, false);

        if (type !== 'switch') {
            if (isOid(d.oid)) {
                this.ghSet(d.oid, vOn);
                if (type === 'button') {
                    const id = d.oid;
                    this.pending.set(id, vOff);
                    this.later(300, () => {
                        this.pending.delete(id);
                        this.ghSet(id, vOff);
                    });
                }
            }
            this.flashTile();
            return;
        }

        if (this.isDemo()) {
            this.setState({ demoOn: !this.state.demoOn });
            return;
        }
        const next = !this.isOn();
        if (isOid(d.oid)) {
            this.ghSet(d.oid, next ? vOn : vOff);
        } else if (isOid(d.levelOid)) {
            const [min, max] = this.levelRange();
            const cur = this.level();
            if (cur !== null && cur > min) {
                this.lastLevel = cur;
            }
            this.ghSet(d.levelOid, next ? (this.lastLevel ?? max) : min);
        } else {
            return;
        }
        this.setState({ optOn: next });
        if (this.optTimer) {
            clearTimeout(this.optTimer);
        }
        this.optTimer = setTimeout(() => this.setState({ optOn: null }), 4000);
    }

    private onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            // a held key must not switch on and off in a loop
            if (!e.repeat) {
                this.onActivate();
            }
        }
    };

    /* ---------- Dimmer ---------- */

    private levelAt(clientX: number): number | null {
        const el = this.trackRef.current;
        if (!el) {
            return null;
        }
        const r = el.getBoundingClientRect();
        if (!r.width) {
            return null;
        }
        const [min, max] = this.levelRange();
        // the knob sits inside the fill: map the usable width (minus one knob) to min..max
        const knob = r.height;
        const p = clamp((clientX - r.left - knob / 2) / Math.max(1, r.width - knob), 0, 1);
        return Math.round(min + p * (max - min));
    }

    private writeLevel(v: number, delay = 0): void {
        const id = this.state.rxData.levelOid;
        [this.levelSendTimer, this.levelHoldTimer].forEach(t => t && clearTimeout(t));
        this.levelSendTimer = undefined;
        const send = (): void => {
            this.levelSendTimer = undefined;
            this.pending.delete(id);
            this.ghSet(id, v);
            // keep the shown level until the state comes back (or 4 s)
            this.levelHoldTimer = setTimeout(() => {
                if (!this.dragging) {
                    this.setState({ optLevel: null });
                }
            }, 4000);
        };
        if (delay) {
            this.pending.set(id, v);
            this.levelSendTimer = setTimeout(send, delay);
        } else {
            send();
        }
    }

    private onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
        if (this.props.editMode || e.button > 0) {
            return;
        }
        // the slider gesture belongs to the slider (no view swipe, no tile press)
        e.stopPropagation();
        const v = this.levelAt(e.clientX);
        if (v === null) {
            return;
        }
        this.dragging = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        this.setState({ optLevel: v });
    };

    private onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
        if (!this.dragging) {
            return;
        }
        const v = this.levelAt(e.clientX);
        if (v !== null && v !== this.state.optLevel) {
            this.setState({ optLevel: v });
        }
    };

    private onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
        if (!this.dragging) {
            return;
        }
        this.dragging = false;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        const v = this.state.optLevel;
        if (v !== null) {
            this.writeLevel(v);
        }
        // re-render without the "dragging" class (transitions back on)
        this.setState({ optLevel: v });
    };

    private onLevelKey = (e: React.KeyboardEvent): void => {
        if (this.props.editMode) {
            return;
        }
        const [min, max] = this.levelRange();
        const cur = this.level() ?? min;
        const step = Math.max(1, Math.round((max - min) / 20));
        let v: number | null = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            v = cur + step;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            v = cur - step;
        } else if (e.key === 'Home') {
            v = min;
        } else if (e.key === 'End') {
            v = max;
        } else if (e.key === 'PageUp') {
            v = cur + step * 2;
        } else if (e.key === 'PageDown') {
            v = cur - step * 2;
        }
        if (v === null) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        v = clamp(Math.round(v), min, max);
        this.setState({ optLevel: v });
        this.writeLevel(v, 350);
    };

    private renderLevel(on: boolean | null, title: string): React.JSX.Element | null {
        const d = this.state.rxData;
        if (!isOid(d.levelOid)) {
            return null;
        }
        const [min, max] = this.levelRange();
        const lvl = this.level();
        const p = lvl === null ? 0 : clamp((lvl - min) / (max - min), 0, 1);
        const unit = d.levelUnit ?? '%';
        const text = lvl === null ? '–' : `${fmtNum(lvl, 0, this.ghLang())}${unit ? ` ${unit}` : ''}`;
        return (
            <div className={`gh-sw-lvl${this.dragging ? ' gh-sw-drag' : ''}`}>
                <div
                    ref={this.trackRef}
                    className="gh-sw-trk"
                    role="slider"
                    tabIndex={this.props.editMode ? -1 : 0}
                    aria-label={`${title} ${GlashausWidget.tr('sw_level')}`.trim()}
                    aria-valuemin={min}
                    aria-valuemax={max}
                    aria-valuenow={lvl ?? min}
                    aria-valuetext={text}
                    aria-disabled={on === null ? true : undefined}
                    onPointerDown={this.onPointerDown}
                    onPointerMove={this.onPointerMove}
                    onPointerUp={this.onPointerUp}
                    onPointerCancel={this.onPointerUp}
                    onKeyDown={this.onLevelKey}
                >
                    <span
                        className="gh-sw-fill"
                        style={{ width: `calc(var(--gh-sw-k) + (100% - var(--gh-sw-k)) * ${p.toFixed(4)})` }}
                    />
                </div>
                <span className="gh-sw-lv">{text}</span>
            </div>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const lang = this.ghLang();
        const demo = this.isDemo();
        const type = d.type === 'button' || d.type === 'scene' ? d.type : 'switch';
        const layout = d.layout === 'row' ? 'row' : 'tile';
        const title = d.title || (demo ? GlashausWidget.tr('sw_demo_title') : '');
        const on = this.isOn();
        const noData = on === null && type === 'switch';
        const lit = type === 'switch' ? !!on : this.state.flash || (isOid(d.oidState) && !!on);
        // accent "ink" would vanish on the ink tile: use the paper color there
        const inkAccent = (d.accent || 'sun') === 'fg';
        const accent = inkAccent && lit ? 'var(--gh-bg)' : this.ghAccent('', 'sun');

        let status: string;
        if (type === 'switch') {
            if (on === null) {
                status = GlashausWidget.tr('sw_no_value');
            } else if (on) {
                status = d.textOn || GlashausWidget.tr('sw_on');
                const lvl = this.level();
                if (isOid(d.levelOid) && lvl !== null) {
                    const unit = d.levelUnit ?? '%';
                    status += ` · ${fmtNum(lvl, 0, lang)}${unit ? ` ${unit}` : ''}`;
                }
            } else {
                status = d.textOff || GlashausWidget.tr('sw_off');
            }
        } else if (this.state.done) {
            status = d.textOn || GlashausWidget.tr('sw_done');
        } else if (isOid(d.oidState) && on) {
            status = d.textOn || GlashausWidget.tr('sw_active');
        } else {
            status = d.textOff || GlashausWidget.tr('sw_tap');
        }

        const cls = [
            'gh-sw',
            `gh-sw-${layout}`,
            lit ? 'gh-on' : '',
            inkAccent ? 'gh-sw-ink' : '',
            type === 'switch' && isOid(d.levelOid) ? 'gh-sw-haslvl' : '',
            noData ? 'gh-sw-nodata' : '',
            isTrue(d.spin) ? 'gh-sw-spin' : '',
            this.props.editMode ? 'gh-sw-edit' : 'gh-sw-live',
        ]
            .filter(Boolean)
            .join(' ');

        const question = d.confirmText || GlashausWidget.tr('sw_confirm_default');

        return (
            <div
                className={this.ghClass(cls)}
                style={{ '--gh-c': accent } as React.CSSProperties}
            >
                <div
                    ref={this.hitRef}
                    className="gh-sw-hit"
                    role={type === 'switch' ? 'switch' : 'button'}
                    aria-checked={type === 'switch' ? !!on : undefined}
                    aria-label={`${title}: ${status}`}
                    tabIndex={this.props.editMode ? -1 : 0}
                    onClick={this.onActivate}
                    onKeyDown={this.onKeyDown}
                >
                    <span className="gh-sw-ico">
                        <GhIconBox
                            name={this.ghIcon()}
                            color={accent}
                        />
                    </span>
                    <span className="gh-sw-tg">
                        {type === 'switch' ? (
                            <span className={`gh-toggle${on ? ' gh-sw-tog-on' : ''}`} />
                        ) : (
                            <span className="gh-sw-go">
                                <GhIcon name={type === 'scene' ? 'play' : 'power'} />
                            </span>
                        )}
                    </span>
                    <span className="gh-sw-txt">
                        <span className="gh-sw-nm">{title}</span>
                        <span className="gh-sw-st">{status}</span>
                    </span>
                </div>
                {type === 'switch' ? this.renderLevel(on, title) : null}
                {this.state.confirming ? (
                    <div
                        className="gh-sw-cf"
                        role="alertdialog"
                        aria-label={question}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                            if (e.key === 'Escape') {
                                e.stopPropagation();
                                this.onCancel();
                            }
                        }}
                    >
                        <span className="gh-sw-q">{question}</span>
                        <span className="gh-sw-btns">
                            <button
                                type="button"
                                className="gh-outline"
                                aria-label={GlashausWidget.tr('sw_cancel')}
                                onClick={this.onCancel}
                            >
                                <span className="gh-sw-cx-t">{GlashausWidget.tr('sw_cancel')}</span>
                                <span
                                    className="gh-sw-cx-i"
                                    aria-hidden="true"
                                >
                                    ×
                                </span>
                            </button>
                            <button
                                ref={this.yesRef}
                                type="button"
                                className="gh-ink"
                                onClick={this.onConfirm}
                            >
                                {GlashausWidget.tr('sw_confirm_yes')}
                            </button>
                        </span>
                    </div>
                ) : null}
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}
