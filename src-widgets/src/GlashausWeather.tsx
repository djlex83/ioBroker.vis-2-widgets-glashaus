/* Weather: big animated weather icon, temperature, condition and "feels like", a key/value grid (today, wind,
 * humidity, pressure, UV, sun), a 24 hour strip and 7 day cards. Every input is an object ID of the user's own
 * weather source (text, WMO code or keyword for the condition; JSON for the forecasts). The layout follows the
 * widget size: small = icon + temperature, large = everything. */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { GhIconBox, GhNumber, GhPill } from './core/components';
import { clamp, fmtDate, fmtNum, fmtTime, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';
import {
    compass,
    headerIcon,
    labelKey,
    parseCondition,
    uvKey,
    type WxCondition,
    type WxKind,
} from './weather/conditions';
import { approxSun, dayStart, parseDays, parseHours, parseTime, type WxDay, type WxHour } from './weather/forecast';
import { WxIcon } from './weather/WxIcon';

const H = 3600000;
const D = 86400000;
/** Data older than this is marked in the header */
const STALE_MS = 3 * H;

const OID_KEYS = [
    'oidTemp',
    'oidFeels',
    'oidCondition',
    'oidHumidity',
    'oidPressure',
    'oidWind',
    'oidGust',
    'oidWindDir',
    'oidRain',
    'oidMin',
    'oidMax',
    'oidSunrise',
    'oidSunset',
    'oidUv',
    'oidHourly',
    'oidDaily',
] as const;

type OidKey = (typeof OID_KEYS)[number];

interface WeatherRxData extends Record<OidKey, string> {
    title: string;
    showHeader: boolean | string;
    unit: string;
    decimals: number | string;
    windUnit: string;
    showKv: boolean | string;
    showHours: boolean | string;
    showDays: boolean | string;
}

interface WeatherState extends VisRxWidgetState {
    rw: number;
    rh: number;
    now: number;
    paused: boolean;
}

/** Everything the widget shows, from the states or from the demo */
/** Forecast entries after sorting: the time is always known */
type TimedHour = WxHour & { t: number };
type TimedDay = WxDay & { t: number };

interface WxData {
    temp: number | null;
    feels: number | null;
    cond: WxCondition | null;
    hum: number | null;
    pres: number | null;
    wind: number | null;
    gust: number | null;
    dir: string | null;
    rain: number | null;
    min: number | null;
    max: number | null;
    rise: number | null;
    set: number | null;
    uv: number | null;
    hours: WxHour[];
    days: WxDay[];
    /** Which inputs are configured (undefined = not configured → item hidden) */
    has: Partial<Record<OidKey, boolean>>;
    /** Last update of the temperature (ms) */
    ts?: number;
}

interface Layout {
    pad: number;
    tiny: boolean;
    header: boolean;
    icon: number;
    tempFs: number;
    /** Font size of the condition label */
    labelFs: number;
    kv: 'side' | 'below' | 'none';
    kvCols: number;
    hours: number;
    days: number;
}

const WX_CSS = `
.gh.gh-wx{padding:0;--gh-wx-cloud:color-mix(in srgb,var(--gh-bg) 40%,#fff);--gh-wx-cloud-dark:#d9d6d0;--gh-wx-moon:#5b6474;--gh-wx-snow:#7d8ea3}
.gh.gh-dark.gh-wx{--gh-wx-cloud:#1f1e1c;--gh-wx-cloud-dark:#2c2b28;--gh-wx-moon:#ece6da;--gh-wx-snow:#e9eef5}
.gh-wx-box{flex:1;min-height:0;display:flex;flex-direction:column}
.gh-wx .gh-h{margin-bottom:12px;flex-wrap:nowrap}
.gh-wx .gh-title{min-width:0}
.gh-wx-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-wx-top{flex:1;min-height:0;display:flex;align-items:center;gap:16px 40px}
.gh-wx-top.gh-wx-alone{justify-content:center}
.gh-wx-now{display:flex;align-items:center;gap:16px;min-width:0}
.gh-wx-ico{display:block;flex:none;overflow:visible}
.gh-wx-nt{display:flex;flex-direction:column;gap:7px;min-width:0}
.gh-wx-temp{line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums}
.gh-wx-temp .gh-num{font-weight:550;letter-spacing:-.04em}
.gh-wx-temp .gh-wx-u{font-weight:550;letter-spacing:-.02em;margin-left:.12em}
.gh-wx-lbl{font-size:var(--gh-wx-lfs,15px);color:var(--gh-fg-2);line-height:1.25;display:flex;flex-wrap:wrap;column-gap:10px;row-gap:2px;align-items:baseline;min-width:0}
.gh-wx-lbl>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.gh-wx-lbl small{font-size:.84em;white-space:nowrap}
.gh-wx-kv{flex:1;min-width:0;align-self:center}
.gh-wx .gh-wx-kv{gap:8px 16px}
.gh-wx-kv dt,.gh-wx-kv dd{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.gh-wx-kv dd{text-align:left}
.gh-wx-kv.c1 dd{text-align:right}
.gh-wx-below{margin-top:14px;flex:none;align-self:stretch}
.gh-wx-hours{display:grid;gap:2px;margin:16px 0 2px;font-variant-numeric:tabular-nums;flex:none}
.gh-wx-h{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10.5px;color:var(--gh-fg-2);min-width:0}
.gh-wx-h b{font-size:12.5px;font-weight:500;color:var(--gh-fg)}
.gh-wx-h.n b{color:var(--gh-fg-2)}
.gh-wx-h.m span{visibility:hidden}
.gh-wx-h i{display:block;width:6px;height:30px;border-radius:3px;
  background:linear-gradient(to top,var(--gh-cool) calc(var(--p)*1%),color-mix(in srgb,var(--gh-fg) 10%,transparent) 0)}
.gh-wx-h span{white-space:nowrap}
.gh-wx-days{display:grid;gap:8px;margin-top:12px;font-size:13px;flex:none}
.gh-wx-days>div{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:14px;min-width:0;
  background:color-mix(in srgb,var(--gh-fg) 5%,transparent)}
.gh-wx-days>div.today{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--gh-fg) 25%,transparent)}
.gh-wx-dh{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0}
.gh-wx-days b{font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-wx-days span{color:var(--gh-fg-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-wx-days em{font-style:normal;font-variant-numeric:tabular-nums;font-size:15px;white-space:nowrap}
.gh-wx-days small{color:var(--gh-fg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-wx-days small.wet{color:var(--gh-cool)}
.gh-wx-top.gh-wx-col{flex-direction:column;align-items:stretch;justify-content:center;gap:0}
.gh-wx-tiny .gh-wx-top{justify-content:center}
.gh-wx-tiny .gh-wx-now{gap:10px}
.gh-wx-tiny .gh-wx-nt{gap:4px}
.gh-wx-rays{animation:gh-wx-spin 36s linear infinite;transform-box:view-box}
.gh-wx-core{animation:gh-wx-pulse 3.6s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:center}
.gh-wx-moon{animation:gh-wx-rock 9s ease-in-out infinite alternate;transform-box:view-box}
.gh-wx-star{animation:gh-wx-twinkle 2.6s ease-in-out infinite}
.gh-wx-drift{animation:gh-wx-drift 6s ease-in-out infinite alternate}
.gh-wx-drift2{animation:gh-wx-drift2 8s ease-in-out infinite alternate}
.gh-wx-drop{animation:gh-wx-fall 1.1s linear infinite}
.gh-wx-flake{animation:gh-wx-snow 3.2s linear infinite;transform-box:fill-box;transform-origin:center}
.gh-wx-hail{animation:gh-wx-fall .8s linear infinite}
.gh-wx-bolt{animation:gh-wx-flash 3.4s linear infinite}
.gh-wx-fog{animation:gh-wx-slide 5s ease-in-out infinite alternate}
.gh-wx-wind{animation:gh-wx-flow 2.8s linear infinite}
@keyframes gh-wx-spin{to{transform:rotate(360deg)}}
@keyframes gh-wx-pulse{to{transform:scale(1.06)}}
@keyframes gh-wx-rock{from{transform:rotate(-5deg)}to{transform:rotate(5deg)}}
@keyframes gh-wx-twinkle{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes gh-wx-drift{from{transform:translateX(-1.5px)}to{transform:translateX(2.5px)}}
@keyframes gh-wx-drift2{from{transform:translateX(2px)}to{transform:translateX(-2px)}}
@keyframes gh-wx-fall{0%{transform:translate(1.5px,-5px);opacity:0}25%{opacity:1}100%{transform:translate(-2.5px,8px);opacity:0}}
@keyframes gh-wx-snow{0%{transform:translate(0,-4px) rotate(0);opacity:0}20%{opacity:1}100%{transform:translate(1.5px,9px) rotate(120deg);opacity:0}}
@keyframes gh-wx-flash{0%,62%,70%,76%,100%{opacity:1}64%,73%{opacity:.15}}
@keyframes gh-wx-slide{from{transform:translateX(-3px)}to{transform:translateX(3px)}}
@keyframes gh-wx-flow{to{stroke-dashoffset:-100}}
.gh-wx-paused .gh-wx-ico *{animation-play-state:paused!important}
.gh-wx-static *{animation:none!important}
@media (prefers-reduced-motion:reduce){.gh-wx-ico *{animation:none!important}}
`;

/* ---------- Demo ---------- */

function demoData(now: number, lang: string): WxData {
    const sun = approxSun(now);
    const h0 = new Date(now);
    h0.setMinutes(0, 0, 0);
    const t0 = h0.getTime();
    const curve = (t: number): number => Math.sin(((new Date(t).getHours() - 9) / 24) * 2 * Math.PI);
    const rainP = [0, 0, 10, 20, 50, 70, 40, 10];
    const hours: WxHour[] = Array.from({ length: 24 }, (_v, i) => {
        const t = t0 + i * H;
        const rain = rainP[Math.floor(i / 3)];
        return {
            t,
            temp: Math.round((14 + 4.5 * (curve(t) - curve(t0))) * 10) / 10,
            cond: { kind: rain >= 50 ? 'showers' : rain >= 20 ? 'cloudy' : 'partly' },
            rain,
        };
    });
    const kinds: WxKind[] = ['partly', 'showers', 'rain', 'mostly', 'clear', 'overcast', 'drizzle'];
    const mins = [8, 6, 8, 5, 4, 7, 8];
    const maxs = [15, 13, 12, 16, 17, 15, 13];
    const rains = [20, 80, 90, 10, 0, 30, 60];
    const days: WxDay[] = kinds.map((kind, i) => ({
        t: dayStart(now) + i * D + 12 * H,
        min: mins[i],
        max: maxs[i],
        cond: { kind },
        rain: rains[i],
    }));
    return {
        temp: 14,
        feels: 12,
        cond: { kind: 'partly' },
        hum: 68,
        pres: 1014,
        wind: 12,
        gust: 24,
        dir: compass(225, lang),
        rain: 20,
        min: 8,
        max: 15,
        rise: sun.rise,
        set: sun.set,
        uv: 2.8,
        hours,
        days,
        has: Object.fromEntries(OID_KEYS.map(k => [k, true])),
    };
}

/* ---------- Layout ---------- */

/** Measured heights (px) of the sections */
const HEAD_H = 46;
const NOW_H = 76;
const KV_ROW = 19.6;
const KV_GAP = 8;
const HOURS_H = 88;
const DAYS_H = 132;
/** Minimal width of one key/value pair next to the temperature */
const KV_PAIR_W = 290;
const ICON_MIN = 56;
const ICON_MAX = 220;

interface Want {
    kv: number;
    hours: number;
    days: number;
    header: boolean;
    /** Characters of the temperature number and of the unit (for the width estimate) */
    numChars: number;
    unitChars: number;
}

/** Decides from the widget size what is shown and how big */
function layoutFor(w: number, h: number, want: Want): Layout {
    const tiny = w < 250 || h < 175;
    if (tiny) {
        const pad = clamp(Math.min(w, h) * 0.09, 8, 14);
        const iw = w - 2 * pad;
        const icon = clamp(Math.min(h - 2 * pad - 4, iw * 0.36), 22, 120);
        const em = 0.62 * want.numChars + 0.62 * want.unitChars + 0.15;
        return {
            pad,
            tiny,
            header: false,
            icon,
            tempFs: clamp(Math.min(icon * 0.56, (iw - icon - 10) / em), 16, 60),
            labelFs: 12.5,
            kv: 'none',
            kvCols: 1,
            hours: 0,
            days: 0,
        };
    }
    const pad = w < 360 || h < 260 ? 16 : 22;
    const iw = w - 2 * pad;
    const header = want.header && h >= 200;
    const avail = h - 2 * pad - (header ? HEAD_H : 0);
    const em = 0.62 * want.numChars + 0.62 * want.unitChars + 0.15;
    /** Width of icon + temperature + condition label */
    const nowWidth = (icon: number): number => icon + 16 + Math.max(icon * 0.64 * em, 190);
    const kvHeight = (cols: number): number => {
        const rows = Math.ceil(want.kv / cols);
        return rows * KV_ROW + (rows - 1) * KV_GAP;
    };

    const plan = (mode: Layout['kv'], cols = 1): Layout & { left: number } => {
        let kvCols = 1;
        let kvH = 0;
        if (mode === 'side') {
            // balance the columns: 5 items in 2 columns → 3 + 2
            kvCols = Math.ceil(want.kv / Math.ceil(want.kv / cols));
            kvH = kvHeight(kvCols);
        } else if (mode === 'below') {
            kvCols = clamp(Math.floor(iw / 330), 1, 3);
            kvH = kvHeight(kvCols) + 14;
        }
        const rowH = mode === 'side' ? Math.max(NOW_H, kvH) : NOW_H + kvH;
        let budget = avail - rowH;
        let hours = 0;
        if (want.hours && iw >= 290 && budget >= HOURS_H) {
            hours = iw >= 560 ? Math.min(24, want.hours) : Math.min(12, Math.ceil(want.hours / 2));
            budget -= HOURS_H;
        }
        let days = 0;
        const fit = Math.min(want.days, 7, Math.floor((iw + 8) / 96));
        if (fit >= 2 && budget >= DAYS_H) {
            days = fit;
            budget -= DAYS_H;
        }
        // the icon grows into the height of the row and the space that is left
        let icon = clamp(
            (mode === 'side' ? Math.max(72, kvH * 0.95) : 72) + Math.max(0, budget) * 0.5,
            ICON_MIN,
            Math.max(ICON_MIN, Math.min(ICON_MAX, iw * 0.3)),
        );
        while (icon > ICON_MIN && nowWidth(icon) > (mode === 'side' ? iw - 40 - KV_PAIR_W * kvCols : iw)) {
            icon -= 4;
        }
        const tempFs = clamp(icon * 0.64, 36, 140);
        return {
            pad,
            tiny,
            header,
            icon,
            tempFs,
            labelFs: clamp(tempFs * 0.2, 15, 20),
            kv: mode,
            kvCols,
            hours,
            days,
            left: budget - (icon - 72),
        };
    };

    if (!want.kv) {
        return plan('none');
    }
    const below = plan('below');
    const maxCols = Math.min(3, Math.floor((iw - nowWidth(72) - 40) / KV_PAIR_W));
    if (maxCols >= 1) {
        // next to the temperature: as many columns as needed to keep the forecasts, then the biggest icon
        let side = plan('side', maxCols);
        for (let cols = maxCols - 1; cols >= 1; cols--) {
            const p = plan('side', cols);
            if (p.hours + p.days >= side.hours + side.days && p.icon > side.icon) {
                side = p;
            }
        }
        // a tall widget: below the temperature, the grid has more room and the icon can grow
        const sameContent = below.hours === side.hours && below.days === side.days;
        return sameContent && below.left >= 40 && below.icon > side.icon ? below : side;
    }
    return avail - NOW_H >= kvHeight(below.kvCols) + 14 ? below : plan('none');
}

export default class GlashausWeather extends GlashausWidget<WeatherRxData, WeatherState> {
    private rootRef = React.createRef<HTMLDivElement>();

    private ro: ResizeObserver | null = null;

    private io: IntersectionObserver | null = null;

    private obsEl: HTMLDivElement | null = null;

    private roRaf = 0;

    private offscreen = false;

    private tick: ReturnType<typeof setInterval> | undefined;

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('weather', WX_CSS);
        this.state = { ...this.state, rw: 0, rh: 0, now: Date.now(), paused: false };
    }

    static getWidgetInfo(): RxWidgetInfo {
        const id = (
            name: OidKey,
            label: string,
            tooltip?: string,
        ): { name: string; label: string; type: 'id'; tooltip?: string } =>
            tooltip ? { name, label, type: 'id', tooltip } : { name, label, type: 'id' };
        return {
            id: 'tplGlashausWeather',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Weather',
            visWidgetLabel: 'wx_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'title', label: 'title' },
                        { name: 'showHeader', label: 'wx_header', type: 'checkbox', default: true },
                        { name: 'unit', label: 'unit', default: '°C' },
                        { name: 'decimals', label: 'decimals', type: 'number', min: 0, max: 2, default: 0 },
                        { name: 'showKv', label: 'wx_show_kv', type: 'checkbox', default: true },
                        { name: 'showHours', label: 'wx_show_hours', type: 'checkbox', default: true },
                        { name: 'showDays', label: 'wx_show_days', type: 'checkbox', default: true },
                    ],
                },
                {
                    name: 'now',
                    label: 'group_wx_now',
                    fields: [
                        id('oidTemp', 'wx_temp'),
                        id('oidFeels', 'wx_feels_oid'),
                        id('oidCondition', 'wx_condition', 'wx_condition_tip'),
                        id('oidHumidity', 'wx_humidity'),
                        id('oidPressure', 'wx_pressure'),
                        id('oidWind', 'wx_wind'),
                        {
                            name: 'windUnit',
                            label: 'wx_wind_unit',
                            default: 'km/h',
                            hidden: (data: WidgetData) => !isOid(data.oidWind),
                        },
                        id('oidGust', 'wx_gust'),
                        id('oidWindDir', 'wx_wind_dir', 'wx_wind_dir_tip'),
                        id('oidRain', 'wx_rain_oid', 'wx_rain_tip'),
                        id('oidMin', 'wx_min'),
                        id('oidMax', 'wx_max'),
                        id('oidSunrise', 'wx_sunrise', 'wx_time_tip'),
                        id('oidSunset', 'wx_sunset', 'wx_time_tip'),
                        id('oidUv', 'wx_uv'),
                    ],
                },
                {
                    name: 'forecast',
                    label: 'group_wx_forecast',
                    fields: [
                        { name: 'wxForecastHelp', type: 'help', text: `${ADAPTER}_wx_forecast_help` },
                        id('oidHourly', 'wx_hourly'),
                        id('oidDaily', 'wx_daily'),
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 720, height: 440, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_weather.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausWeather.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        document.addEventListener('visibilitychange', this.onVisibility);
        // day / night, "now" in the hour strip and the stale mark move on; skipped while hidden
        this.tick = setInterval(() => {
            if (!document.hidden) {
                this.setState({ now: Date.now() });
            }
        }, 60000);
        this.attach();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: WeatherState): void {
        super.componentDidUpdate(prevProps, prevState);
        this.attach();
    }

    componentWillUnmount(): void {
        document.removeEventListener('visibilitychange', this.onVisibility);
        if (this.tick) {
            clearInterval(this.tick);
            this.tick = undefined;
        }
        this.ro?.disconnect();
        this.io?.disconnect();
        this.ro = null;
        this.io = null;
        this.obsEl = null;
        cancelAnimationFrame(this.roRaf);
        super.componentWillUnmount();
    }

    /* ---------- Observers ---------- */

    private attach(): void {
        const el = this.rootRef.current;
        if (!el || el === this.obsEl) {
            return;
        }
        this.ro?.disconnect();
        this.io?.disconnect();
        this.obsEl = el;
        if (typeof ResizeObserver !== 'undefined') {
            this.ro = new ResizeObserver(() => {
                cancelAnimationFrame(this.roRaf);
                this.roRaf = requestAnimationFrame(this.measure);
            });
            this.ro.observe(el);
        }
        if (typeof IntersectionObserver !== 'undefined') {
            this.io = new IntersectionObserver(entries => {
                this.offscreen = !entries[entries.length - 1].isIntersecting;
                this.updatePaused();
            });
            this.io.observe(el);
        }
        this.measure();
    }

    private measure = (): void => {
        const el = this.obsEl;
        if (!el) {
            return;
        }
        const rw = el.clientWidth;
        const rh = el.clientHeight;
        if (rw !== this.state.rw || rh !== this.state.rh) {
            this.setState({ rw, rh });
        }
    };

    private onVisibility = (): void => {
        this.updatePaused();
        if (!document.hidden) {
            this.setState({ now: Date.now() });
        }
    };

    /** Animations stop while the page is hidden or the widget is scrolled out of view */
    private updatePaused(): void {
        const paused = document.hidden || this.offscreen;
        if (paused !== this.state.paused) {
            this.setState({ paused });
        }
    }

    /* ---------- Data ---------- */

    private isDemo(): boolean {
        const d = this.state.rxData;
        return !OID_KEYS.some(k => isOid(d[k]));
    }

    private readData(now: number): WxData {
        const d = this.state.rxData;
        const has: Partial<Record<OidKey, boolean>> = {};
        const raw = (k: OidKey): unknown => {
            if (!isOid(d[k])) {
                return undefined;
            }
            has[k] = true;
            return this.ghVal(d[k]);
        };
        const num = (k: OidKey): number | null => toNum(raw(k));
        const time = (k: OidKey): number | null => {
            const t = parseTime(raw(k), now);
            if (t === null) {
                return null;
            }
            // only the time of day counts: a stored timestamp of yesterday's sunrise is moved to today
            const dt = new Date(t);
            const today = new Date(now);
            today.setHours(dt.getHours(), dt.getMinutes(), 0, 0);
            return today.getTime();
        };
        const dirRaw = raw('oidWindDir');
        const dirNum = toNum(dirRaw);
        const lang = this.ghLang();
        return {
            temp: num('oidTemp'),
            feels: num('oidFeels'),
            cond: parseCondition(raw('oidCondition')),
            hum: num('oidHumidity'),
            pres: num('oidPressure'),
            wind: num('oidWind'),
            gust: num('oidGust'),
            dir:
                dirNum !== null
                    ? compass(dirNum, lang)
                    : typeof dirRaw === 'string' && dirRaw.trim()
                      ? dirRaw.trim()
                      : null,
            rain: num('oidRain'),
            min: num('oidMin'),
            max: num('oidMax'),
            rise: time('oidSunrise'),
            set: time('oidSunset'),
            uv: num('oidUv'),
            hours: isOid(d.oidHourly) ? parseHours(raw('oidHourly')) : [],
            days: isOid(d.oidDaily) ? parseDays(raw('oidDaily')) : [],
            has: { ...has, oidHourly: isOid(d.oidHourly), oidDaily: isOid(d.oidDaily) },
            ts: isOid(d.oidTemp) ? (toNum(this.state.values[`${d.oidTemp}.ts`]) ?? this.ghLc(d.oidTemp)) : undefined,
        };
    }

    /** Next hours from the current hour on (entries without time are taken in order) */
    private static nextHours(list: WxHour[], now: number): TimedHour[] {
        const h0 = new Date(now);
        h0.setMinutes(0, 0, 0);
        const start = h0.getTime();
        const timed = list.map((x, i) => ({ ...x, t: x.t ?? start + i * H }));
        return timed
            .filter(x => x.t >= start)
            .sort((a, b) => a.t - b.t)
            .slice(0, 24);
    }

    /** Days from today on */
    private static nextDays(list: WxDay[], now: number): TimedDay[] {
        const today = dayStart(now);
        const timed = list.map((x, i) => ({ ...x, t: x.t ?? today + i * D + 12 * H }));
        return timed
            .filter(x => dayStart(x.t) >= today)
            .sort((a, b) => a.t - b.t)
            .slice(0, 7);
    }

    /* ---------- Rendering ---------- */

    private fmtT(v: number | null, dec = 0): string {
        return fmtNum(v, dec, this.ghLang());
    }

    private kvItems(x: WxData, unit: string, first: TimedDay | undefined, now: number): [string, string][] {
        const tr = GlashausWidget.tr;
        const lang = this.ghLang();
        const items: [string, string][] = [];
        const d = this.state.rxData;
        const today = first && dayStart(first.t) === dayStart(now) ? first : null;
        const min = x.has.oidMin ? x.min : (today?.min ?? null);
        const max = x.has.oidMax ? x.max : (today?.max ?? null);
        const rain = x.has.oidRain ? x.rain : (today?.rain ?? null);
        const parts: string[] = [];
        if (x.has.oidMin || x.has.oidMax || min !== null || max !== null) {
            parts.push(`${tr('wx_range', this.fmtT(min), this.fmtT(max))} ${unit}`);
        }
        if (x.has.oidRain || rain !== null) {
            parts.push(`${tr('wx_rain')} ${this.fmtT(rain)} %`);
        }
        if (parts.length) {
            items.push([tr('wx_today'), parts.join(' · ')]);
        }
        if (x.has.oidWind || x.has.oidWindDir) {
            const wu = d.windUnit === undefined || d.windUnit === null ? 'km/h' : GlashausWidget.ghText(d.windUnit);
            let w = x.has.oidWind ? `${this.fmtT(x.wind)} ${wu}`.trim() : '';
            if (x.dir) {
                w = w ? `${w} ${x.dir}` : x.dir;
            }
            if (x.has.oidGust && x.gust !== null) {
                w += ` · ${tr('wx_gusts')} ${this.fmtT(x.gust)}`;
            }
            items.push([tr('wx_wind'), w || '–']);
        }
        if (x.has.oidHumidity && x.has.oidPressure) {
            items.push([tr('wx_hum_pres'), `${this.fmtT(x.hum)} % · ${this.fmtT(x.pres)} hPa`]);
        } else if (x.has.oidHumidity) {
            items.push([tr('wx_humidity'), `${this.fmtT(x.hum)} %`]);
        } else if (x.has.oidPressure) {
            items.push([tr('wx_pressure'), `${this.fmtT(x.pres)} hPa`]);
        }
        if (x.has.oidUv) {
            items.push([tr('wx_uv_today'), x.uv === null ? '–' : `${fmtNum(x.uv, 1, lang)} · ${tr(uvKey(x.uv))}`]);
        }
        if (x.has.oidSunrise || x.has.oidSunset) {
            const t = (v: number | null): string => (v === null ? '–' : fmtTime(v, lang));
            items.push([tr('wx_sun'), tr('wx_range', t(x.rise), t(x.set))]);
        }
        return items;
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const tr = GlashausWidget.tr;
        const lang = this.ghLang();
        const now = Date.now();
        const demo = this.isDemo();
        const x = demo ? demoData(now, lang) : this.readData(now);
        const unit = d.unit === undefined || d.unit === null ? '°C' : GlashausWidget.ghText(d.unit);
        const dec = clamp(Math.round(toNum(d.decimals) ?? 0), 0, 2);

        // Day or night: the source tells it, else sunrise / sunset, else an approximation
        const sun = approxSun(now);
        const rise = x.rise ?? sun.rise;
        const set = x.set ?? sun.set;
        const isNightAt = (t: number): boolean => {
            const day = dayStart(t) - dayStart(now);
            return t < rise + day || t > set + day;
        };
        const night = x.cond?.night ?? isNightAt(now);
        const kind: WxKind = x.cond?.kind ?? 'cloudy';
        const label = x.cond ? x.cond.text || tr(labelKey(kind, night)) : x.has.oidCondition ? '–' : '';

        const hours = isTrue(d.showHours, true) ? GlashausWeather.nextHours(x.hours, now) : [];
        const allDays = GlashausWeather.nextDays(x.days, now);
        const days = isTrue(d.showDays, true) ? allDays : [];
        const kv = isTrue(d.showKv, true) ? this.kvItems(x, unit, allDays[0], now) : [];

        const fallbackW = parseFloat(String(this.state.rxStyle?.width ?? '')) || 720;
        const fallbackH = parseFloat(String(this.state.rxStyle?.height ?? '')) || 440;
        const lay = layoutFor(this.state.rw || fallbackW, this.state.rh || fallbackH, {
            kv: kv.length,
            hours: hours.length,
            days: days.length,
            header: isTrue(d.showHeader, true),
            numChars: this.fmtT(x.temp, dec).length,
            unitChars: unit.length,
        });

        const title = GlashausWidget.ghText(d.title) || tr('wx_title');
        const hi = headerIcon(x.cond ? kind : null, night);
        const asOf = !demo && x.ts && now - x.ts > STALE_MS ? x.ts : 0;

        const tempEl = (
            <div
                className="gh-wx-temp"
                style={{ fontSize: lay.tempFs }}
            >
                <GhNumber
                    value={x.temp}
                    dec={dec}
                    lang={lang}
                />
                {unit ? <span className="gh-wx-u">{unit}</span> : null}
            </div>
        );
        const feels =
            x.has.oidFeels && !lay.tiny ? (
                <small>{tr('wx_feels', `${this.fmtT(x.feels, dec)} ${unit}`.trim())}</small>
            ) : null;
        const showLabel = !lay.tiny || (lay.icon >= 44 && (this.state.rw || fallbackW) >= 150);

        const nowBlock = (
            <div className="gh-wx-now">
                <WxIcon
                    kind={kind}
                    night={night}
                    size={lay.icon}
                />
                <div className="gh-wx-nt">
                    {tempEl}
                    {(label && showLabel) || feels ? (
                        <div className="gh-wx-lbl">
                            {label && showLabel ? <span>{label}</span> : null}
                            {feels}
                        </div>
                    ) : null}
                </div>
            </div>
        );

        const kvEl =
            lay.kv !== 'none' && kv.length ? (
                <dl
                    className={`gh-kv gh-wx-kv${lay.kv === 'below' ? ' gh-wx-below' : ''}${lay.kv === 'below' && lay.kvCols === 1 ? ' c1' : ''}`}
                    style={{
                        gridTemplateColumns:
                            lay.kv === 'below' && lay.kvCols === 1
                                ? 'minmax(0,auto) minmax(0,1fr)'
                                : `repeat(${lay.kvCols}, minmax(0,max-content) minmax(0,1fr))`,
                    }}
                >
                    {kv.map(([k, v]) => (
                        <React.Fragment key={k}>
                            <dt>{k}</dt>
                            <dd title={v}>{v}</dd>
                        </React.Fragment>
                    ))}
                </dl>
            ) : null;

        let hoursEl: React.JSX.Element | null = null;
        if (lay.hours && hours.length) {
            const every = lay.hours >= 20 ? 1 : 2;
            const shown = hours.filter((_h, i) => i % every === 0).slice(0, lay.hours);
            hoursEl = (
                <div
                    className="gh-wx-hours"
                    style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0,1fr))` }}
                >
                    {shown.map((h, i) => {
                        const hh = String(new Date(h.t).getHours()).padStart(2, '0');
                        const mute = every === 1 && i % 3 !== 0;
                        return (
                            <div
                                key={h.t}
                                className={`gh-wx-h${isNightAt(h.t) ? ' n' : ''}${mute ? ' m' : ''}`}
                                title={`${hh}:00 · ${this.fmtT(h.temp, 1)} ${unit} · ${tr('wx_rain')} ${this.fmtT(h.rain)} %`}
                            >
                                <b>{h.temp === null ? '–' : `${this.fmtT(h.temp)}°`}</b>
                                <i style={{ '--p': clamp(h.rain ?? 0, 0, 100) } as React.CSSProperties} />
                                <span>{i === 0 ? tr('wx_now') : hh}</span>
                            </div>
                        );
                    })}
                </div>
            );
        }

        let daysEl: React.JSX.Element | null = null;
        if (lay.days && days.length) {
            const list = days.slice(0, lay.days);
            daysEl = (
                <div
                    className="gh-wx-days"
                    style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0,1fr))` }}
                >
                    {list.map((dd, i) => {
                        const t = dd.t;
                        const isToday = dayStart(t) === dayStart(now);
                        const name = isToday
                            ? tr('wx_today')
                            : fmtDate(t, lang, { weekday: 'short' }).replace(/\.$/, '');
                        const text = dd.cond ? dd.cond.text || tr(labelKey(dd.cond.kind, false)) : '–';
                        return (
                            <div
                                key={`${t}-${i}`}
                                className={isToday ? 'today' : undefined}
                            >
                                <div className="gh-wx-dh">
                                    <b>{name}</b>
                                    {dd.cond ? (
                                        <WxIcon
                                            kind={dd.cond.kind}
                                            size={22}
                                            animate={false}
                                        />
                                    ) : null}
                                </div>
                                <span title={text}>{text}</span>
                                <em>
                                    {this.fmtT(dd.min)}° / {this.fmtT(dd.max)}°
                                </em>
                                {dd.rain !== null ? (
                                    <small className={dd.rain >= 50 ? 'wet' : undefined}>
                                        {tr('wx_rain')} {this.fmtT(dd.rain)} %
                                    </small>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            );
        }

        return (
            <div
                ref={this.rootRef}
                className={this.ghClass(
                    `gh-wx${lay.tiny ? ' gh-wx-tiny' : ''}${this.state.paused ? ' gh-wx-paused' : ''}`,
                )}
            >
                <div
                    className="gh-wx-box"
                    style={{ padding: lay.pad, '--gh-wx-lfs': `${lay.labelFs}px` } as React.CSSProperties}
                >
                    {lay.header ? (
                        <div className="gh-h">
                            <h2 className="gh-title">
                                <GhIconBox
                                    name={hi.icon}
                                    color={hi.accent}
                                />
                                <span className="gh-wx-t">{title}</span>
                            </h2>
                            {asOf ? <GhPill kind="warn">{tr('wx_as_of', fmtTime(asOf, lang))}</GhPill> : null}
                        </div>
                    ) : null}
                    <div className={`gh-wx-top${lay.kv === 'below' ? ' gh-wx-col' : ''}${kvEl ? '' : ' gh-wx-alone'}`}>
                        {nowBlock}
                        {kvEl}
                    </div>
                    {hoursEl}
                    {daysEl}
                </div>
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}
