/* Header: the hero copy of the Glashaus pages. Eyebrow line (date / text), a big headline with a greeting by
 * time of day, a second line in italic serif, an optional big clock, a short lede and up to two buttons that
 * open other views. The headline size follows the widget width and shrinks until everything fits. */
import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isTrue } from './core/GlashausWidget';
import { GhIcon } from './core/components';
import { clamp, fmtDate, localeOf, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';

interface HeaderRxData {
    eyebrow: 'none' | 'date' | 'text' | 'text_date';
    eyebrowText: string;
    headMode: 'greeting' | 'text';
    headline: string;
    name: string;
    greetEnd: string;
    line2: string;
    lede: string;
    layout: 'columns' | 'stacked';
    align: 'left' | 'center' | 'right';
    valign: 'top' | 'center' | 'bottom';
    headSize: 'auto' | 'fixed';
    headPx: number | string;
    clock: 'none' | 'time' | 'time_date';
    clock12: boolean | string;
    btnCount: number | string;
    [key: `btnLabel${number}`]: string;
    [key: `btnView${number}`]: string;
}

interface HeaderState extends VisRxWidgetState {
    now: number;
}

const MIN_FS = 18;
const MAX_FS = 128;

const CSS = `
.gh-header{container:gh-header / inline-size;position:relative;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden;min-width:0;padding:0}
.gh-header.gh-glass{padding:26px 30px}
.gh-header-in{flex:none;width:100%;min-width:0;margin-block:auto}
.gh-header-v-top>.gh-header-in{margin-top:0}
.gh-header-v-bottom>.gh-header-in{margin-bottom:0}
.gh-header[data-compact] .gh-header-aside{display:none}
.gh-header[data-compact] .gh-header-copy{grid-template-columns:minmax(0,1fr)}
.gh-header-copy{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);align-items:end;gap:clamp(20px,4cqw,72px)}
.gh-header-stacked .gh-header-copy{grid-template-columns:minmax(0,1fr);gap:clamp(14px,2.6cqw,28px)}
.gh-header-main{min-width:0}
.gh-header-eyebrow{margin:0 0 clamp(10px,1.6cqw,22px);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-header-eyebrow span{overflow:hidden;text-overflow:ellipsis}
.gh-header-h1{font-weight:500;font-size:var(--gh-header-fs,clamp(30px,8cqw,112px));line-height:.92;letter-spacing:-.045em;margin:0;text-wrap:balance;overflow-wrap:normal}
.gh-header-h1>span{display:block}
.gh-header-h1>.gh-it{letter-spacing:-.02em;padding-right:.08em}
.gh-header-aside{justify-self:end;min-width:0;max-width:100%;padding-bottom:.5em}
.gh-header-stacked .gh-header-aside{justify-self:start;padding-bottom:0}
.gh-header-clock{margin:0 0 clamp(12px,1.8cqw,22px)}
.gh-header-clock:last-child{margin-bottom:0}
.gh-header-time{display:block;font-weight:300;font-size:calc(var(--gh-header-fs,72px) * 1.08);line-height:.84;letter-spacing:-.06em;font-variant-numeric:tabular-nums;white-space:nowrap}
.gh-header-ampm{font-size:.3em;letter-spacing:0;margin-left:.2em;color:var(--gh-fg-2)}
.gh-header-date{display:block;font-size:max(15px,calc(var(--gh-header-fs,72px) * .34));line-height:1.1;margin-top:.35em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-header-lede{font-size:clamp(14px,1.45cqw,17px);line-height:1.5;margin:0 0 clamp(14px,2cqw,24px);color:var(--gh-fg-2);max-width:410px;text-wrap:pretty}
.gh-header-stacked .gh-header-lede{max-width:560px}
.gh-header-lede:last-child{margin-bottom:0}
.gh-header-lede b,.gh-header-lede strong{color:var(--gh-fg);font-weight:550}
.gh-header-ctas{display:flex;flex-wrap:wrap;align-items:center;gap:14px 22px}
.gh-header-ctas svg{width:14px;height:14px;flex:none;transition:transform .3s var(--gh-ease)}
.gh-header-ctas button:hover svg{transform:translateX(3px)}
.gh-header-ul{display:inline-flex;align-items:center;gap:8px;font-size:14.5px;font-weight:500;padding:4px 0;border:0;border-bottom:1px solid color-mix(in srgb,var(--gh-fg) 30%,transparent);background:none;cursor:pointer;white-space:nowrap}
.gh-header-ctas .gh-ink{white-space:nowrap}
.gh-header-h1[data-nowrap]>span{white-space:nowrap}
.gh-header-edit .gh-header-ctas button{cursor:default}
.gh-header-a-center .gh-header-copy{text-align:center}
.gh-header-a-center .gh-header-eyebrow,.gh-header-a-center .gh-header-ctas{justify-content:center}
.gh-header-a-center .gh-header-eyebrow::after{content:'';width:28px;height:1px;background:currentColor;opacity:.7;flex:none}
.gh-header-a-center .gh-header-aside{justify-self:center}
.gh-header-a-center .gh-header-lede{margin-inline:auto}
.gh-header-a-right .gh-header-copy{text-align:right}
.gh-header-a-right .gh-header-eyebrow,.gh-header-a-right .gh-header-ctas{justify-content:flex-end}
.gh-header-a-right .gh-header-aside{justify-self:end}
.gh-header-a-right .gh-header-lede{margin-left:auto}
.gh-header-a-right .gh-header-eyebrow{flex-direction:row-reverse;justify-content:flex-start}
@container gh-header (max-width:680px){
.gh-header-copy{grid-template-columns:minmax(0,1fr);gap:clamp(14px,3cqw,24px)}
.gh-header-aside{justify-self:start;padding-bottom:0}
.gh-header-a-center .gh-header-aside{justify-self:center}
.gh-header-a-right .gh-header-aside{justify-self:end}
.gh-header-lede{max-width:560px}
}
`;

/** Text with only <b>, <strong>, <i>, <em> and <br> allowed (bound values may contain anything) */
function safeHtml(text: string): string {
    return text
        .replace(/&(?!(?:[a-z]+|#\d+);)/gi, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/&lt;(\/?)(b|strong|i|em)&gt;/gi, '<$1$2>')
        .replace(/&lt;br\s*\/?&gt;/gi, '<br>');
}

/** i18n key of the greeting for an hour of the day */
function greetingKey(h: number): string {
    if (h < 5) {
        return 'header_greet_night';
    }
    if (h < 11) {
        return 'header_greet_morning';
    }
    if (h < 17) {
        return 'header_greet_day';
    }
    if (h < 22) {
        return 'header_greet_evening';
    }
    return 'header_greet_night';
}

/** Trimmed text; 'undefined' / 'null' is what vis-2 makes of a binding {id} without value */
function str(v: unknown): string {
    const t = typeof v === 'string' ? v.trim() : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
    return t === 'undefined' || t === 'null' ? '' : t;
}

const isSet = (v: unknown): boolean => v !== undefined && v !== null;

/** A text attribute: never set = the example, '' = deliberately empty */
const textAttr = (v: unknown, example: () => string): string => (isSet(v) ? str(v) : example());

export default class GlashausHeader extends GlashausWidget<HeaderRxData, HeaderState> {
    private rootRef = React.createRef<HTMLDivElement>();

    private innerRef = React.createRef<HTMLDivElement>();

    private mainRef = React.createRef<HTMLDivElement>();

    private h1Ref = React.createRef<HTMLHeadingElement>();

    private ro: ResizeObserver | null = null;

    private fitRaf = 0;

    private fitSig = '';

    private tick: ReturnType<typeof setTimeout> | undefined;

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('header', CSS);
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausHeader',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Header',
            visWidgetLabel: 'header_widget',
            visHelp: 'header_help',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'headMode',
                            label: 'header_head_mode',
                            type: 'select',
                            options: [
                                { value: 'greeting', label: 'header_head_greeting' },
                                { value: 'text', label: 'header_head_text' },
                            ],
                            default: 'greeting',
                        },
                        {
                            name: 'headline',
                            label: 'header_headline',
                            hidden: 'data.headMode !== "text"',
                        },
                        {
                            name: 'name',
                            label: 'header_name',
                            tooltip: 'header_name_tip',
                            hidden: 'data.headMode === "text"',
                        },
                        {
                            name: 'greetEnd',
                            label: 'header_greet_end',
                            type: 'select',
                            noTranslation: true,
                            options: [
                                { value: ',', label: ',' },
                                { value: '.', label: '.' },
                                { value: '!', label: '!' },
                                { value: 'none', label: '–' },
                            ],
                            default: ',',
                            hidden: 'data.headMode === "text"',
                        },
                        { name: 'line2', label: 'header_line2', tooltip: 'header_line2_tip' },
                        { name: 'lede', label: 'header_lede', type: 'html', tooltip: 'header_lede_tip' },
                        {
                            name: 'eyebrow',
                            label: 'header_eyebrow',
                            type: 'select',
                            options: [
                                { value: 'none', label: 'none' },
                                { value: 'date', label: 'header_eyebrow_date' },
                                { value: 'text', label: 'header_eyebrow_text' },
                                { value: 'text_date', label: 'header_eyebrow_text_date' },
                            ],
                            default: 'date',
                        },
                        {
                            name: 'eyebrowText',
                            label: 'header_eyebrow_custom',
                            hidden: 'data.eyebrow !== "text" && data.eyebrow !== "text_date"',
                        },
                    ],
                },
                {
                    name: 'header_layout',
                    label: 'header_group_layout',
                    fields: [
                        {
                            name: 'layout',
                            label: 'header_layout',
                            type: 'select',
                            options: [
                                { value: 'columns', label: 'header_layout_columns' },
                                { value: 'stacked', label: 'header_layout_stacked' },
                            ],
                            default: 'columns',
                        },
                        {
                            name: 'align',
                            label: 'header_align',
                            type: 'select',
                            options: [
                                { value: 'left', label: 'header_align_left' },
                                { value: 'center', label: 'header_align_center' },
                                { value: 'right', label: 'header_align_right' },
                            ],
                            default: 'left',
                        },
                        {
                            name: 'valign',
                            label: 'header_valign',
                            type: 'select',
                            options: [
                                { value: 'top', label: 'header_valign_top' },
                                { value: 'center', label: 'header_valign_center' },
                                { value: 'bottom', label: 'header_valign_bottom' },
                            ],
                            default: 'center',
                        },
                        {
                            name: 'headSize',
                            label: 'header_head_size',
                            type: 'select',
                            options: [
                                { value: 'auto', label: 'header_head_size_auto' },
                                { value: 'fixed', label: 'header_head_size_fixed' },
                            ],
                            default: 'auto',
                        },
                        {
                            name: 'headPx',
                            label: 'header_head_px',
                            type: 'number',
                            min: 10,
                            max: 400,
                            default: 72,
                            hidden: 'data.headSize !== "fixed"',
                        },
                        {
                            name: 'clock',
                            label: 'header_clock',
                            type: 'select',
                            options: [
                                { value: 'none', label: 'none' },
                                { value: 'time', label: 'header_clock_time' },
                                { value: 'time_date', label: 'header_clock_time_date' },
                            ],
                            default: 'none',
                        },
                        {
                            name: 'clock12',
                            label: 'header_clock12',
                            type: 'checkbox',
                            default: false,
                            hidden: '!data.clock || data.clock === "none"',
                        },
                        {
                            name: 'btnCount',
                            label: 'header_btn_count',
                            type: 'slider',
                            min: 0,
                            max: 2,
                            default: 2,
                        },
                    ],
                },
                {
                    name: 'header_btn',
                    label: 'header_group_button',
                    indexFrom: 1,
                    indexTo: 'btnCount',
                    fields: [
                        { name: 'btnLabel', label: 'header_btn_label', tooltip: 'header_btn_label_tip' },
                        { name: 'btnView', label: 'header_btn_view', type: 'select-views', multiple: false },
                    ],
                },
                GlashausWidget.designGroup({ glass: false }),
            ],
            visDefaultStyle: { width: 1000, height: 300, position: 'absolute' },
            visDefaultGrid: { columns: 'full', rows: 'auto' },
            visPrev: `widgets/${ADAPTER}/img/prev_header.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausHeader.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        if (typeof ResizeObserver !== 'undefined' && this.rootRef.current) {
            this.ro = new ResizeObserver(this.scheduleFit);
            this.ro.observe(this.rootRef.current);
        }
        document.addEventListener('visibilitychange', this.onVisibility);
        document.fonts?.addEventListener?.('loadingdone', this.onFonts);
        this.startTicker();
        this.scheduleFit();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: HeaderState): void {
        super.componentDidUpdate(prevProps, prevState);
        this.scheduleFit();
    }

    onRxDataChanged(prev: HeaderRxData): void {
        if (GlashausHeader.showsTime(prev) !== GlashausHeader.showsTime(this.state.rxData)) {
            this.startTicker();
        }
    }

    componentWillUnmount(): void {
        this.ro?.disconnect();
        this.ro = null;
        if (this.fitRaf) {
            cancelAnimationFrame(this.fitRaf);
            this.fitRaf = 0;
        }
        this.stopTicker();
        document.removeEventListener('visibilitychange', this.onVisibility);
        document.fonts?.removeEventListener?.('loadingdone', this.onFonts);
        super.componentWillUnmount();
    }

    /* ---------- Clock: one update per minute, paused while the tab is hidden ---------- */

    /** Greeting, date or clock change with the time */
    private static showsTime(d: HeaderRxData): boolean {
        return d.headMode !== 'text' || (d.eyebrow || 'date') !== 'none' || (d.clock || 'none') !== 'none';
    }

    private startTicker(): void {
        this.stopTicker();
        if (document.hidden || !GlashausHeader.showsTime(this.state.rxData)) {
            return;
        }
        const ms = 60000 - (Date.now() % 60000) + 50;
        this.tick = setTimeout(() => {
            this.setState({ now: Date.now() });
            this.startTicker();
        }, ms);
    }

    private stopTicker(): void {
        if (this.tick) {
            clearTimeout(this.tick);
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

    /* ---------- Headline size ---------- */

    private onFonts = (): void => {
        this.fitSig = '';
        this.scheduleFit();
    };

    private scheduleFit = (): void => {
        if (this.fitRaf) {
            return;
        }
        this.fitRaf = requestAnimationFrame(this.fit);
    };

    /** Auto size: proportional to the column width, then smaller until nothing overflows */
    private fit = (): void => {
        this.fitRaf = 0;
        const root = this.rootRef.current;
        const inner = this.innerRef.current;
        const main = this.mainRef.current;
        const h1 = this.h1Ref.current;
        if (!root || !inner || !main || !h1) {
            return;
        }
        const d = this.state.rxData;
        // nothing that changes the size: no new measuring
        const sig = `${root.clientWidth}x${root.clientHeight}|${root.className}|${d.headSize}|${d.headPx}|${inner.textContent}`;
        if (sig === this.fitSig) {
            return;
        }
        this.fitSig = sig;
        const set = (px: number): void => root.style.setProperty('--gh-header-fs', `${px.toFixed(1)}px`);
        if (d.headSize === 'fixed') {
            delete h1.dataset.nowrap;
            delete root.dataset.compact;
            set(clamp(toNum(d.headPx) ?? 72, 10, 400));
            return;
        }
        const cs = getComputedStyle(root);
        const availH = root.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
        const tooWide = (): boolean => h1.scrollWidth > h1.clientWidth;
        const tooHigh = (): boolean => availH > 0 && inner.offsetHeight > availH + 1;

        const attempt = (): void => {
            const base = clamp(main.clientWidth * 0.125, MIN_FS, MAX_FS);
            // 1. every line on one line, if that needs at most ~30 % less size
            h1.dataset.nowrap = '1';
            let fs = base;
            set(fs);
            while (tooWide() && fs > base * 0.7 && fs > MIN_FS) {
                fs = Math.max(MIN_FS, fs * 0.95);
                set(fs);
            }
            if (tooWide()) {
                // 2. long texts: let the lines wrap
                delete h1.dataset.nowrap;
                fs = base;
                set(fs);
            }
            // 3. smaller until it fits the width and the height
            for (let i = 0; i < 24 && fs > MIN_FS && (tooWide() || tooHigh()); i++) {
                fs = Math.max(MIN_FS, fs * 0.93);
                set(fs);
            }
        };

        delete root.dataset.compact;
        if (!main.clientWidth) {
            return;
        }
        attempt();
        // 4. still too high: the headline is more important than clock, text and buttons
        if (tooHigh() && root.querySelector('.gh-header-aside')) {
            root.dataset.compact = '1';
            attempt();
        }
    };

    /* ---------- Rendering ---------- */

    private viewTitle(view: string): string {
        return this.props.context?.views?.[view]?.settings?.navigationTitle || view;
    }

    private go(view: string): void {
        if (!view || this.props.editMode) {
            return;
        }
        this.props.context?.changeView?.(view);
    }

    private renderClock(now: number, lang: string): React.JSX.Element | null {
        const d = this.state.rxData;
        const mode = d.clock || 'none';
        if (mode === 'none') {
            return null;
        }
        const h12 = isTrue(d.clock12);
        const parts = new Intl.DateTimeFormat(localeOf(lang), {
            hour: h12 ? 'numeric' : '2-digit',
            minute: '2-digit',
            hour12: h12,
        }).formatToParts(new Date(now));
        const time = parts
            .filter(p => p.type !== 'dayPeriod')
            .map(p => p.value)
            .join('')
            .trim();
        const ampm = parts.find(p => p.type === 'dayPeriod')?.value;
        return (
            <div className="gh-header-clock">
                <span className="gh-header-time">
                    {time}
                    {ampm ? <span className="gh-header-ampm">{ampm}</span> : null}
                </span>
                {mode === 'time_date' ? <span className="gh-header-date gh-it">{fmtDate(now, lang)}</span> : null}
            </div>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const lang = this.ghLang();
        // state.now only triggers the re-render at the full minute
        const now = Date.now();
        const tr = GlashausWidget.tr;

        // Eyebrow
        const eyebrowMode = d.eyebrow || 'date';
        const eyebrowParts: string[] = [];
        if ((eyebrowMode === 'text' || eyebrowMode === 'text_date') && str(d.eyebrowText)) {
            eyebrowParts.push(str(d.eyebrowText));
        }
        if (eyebrowMode === 'date' || eyebrowMode === 'text_date') {
            eyebrowParts.push(fmtDate(now, lang));
        }

        // Headline
        let line1: string;
        if (d.headMode === 'text') {
            line1 = textAttr(d.headline, () => tr('header_demo_headline'));
        } else {
            const name = str(d.name);
            line1 = tr(greetingKey(new Date(now).getHours())) + (name ? `, ${name}` : '');
        }
        let usesExample = (d.headMode === 'text' && !isSet(d.headline)) || !isSet(d.line2) || !isSet(d.lede);
        const line2 = textAttr(d.line2, () => tr('header_demo_line2'));
        if (d.headMode !== 'text' && line1) {
            const end = isSet(d.greetEnd) ? String(d.greetEnd) : ',';
            // a trailing comma only makes sense when a second line follows
            if (end !== 'none' && end !== '' && !(end === ',' && !line2)) {
                line1 += end;
            }
        }

        // Aside
        const lede = textAttr(d.lede, () => tr('header_demo_lede'));
        const count = clamp(Math.round(toNum(d.btnCount) ?? 2), 0, 2);
        const buttons: { label: string; view: string }[] = [];
        for (let i = 1; i <= count; i++) {
            const view = str(d[`btnView${i}`]);
            let label = str(d[`btnLabel${i}`]);
            if (!label && view) {
                label = this.viewTitle(view);
            }
            if (!label && !isSet(d[`btnLabel${i}`])) {
                label = tr(`header_demo_btn${i}`);
                usesExample = true;
            }
            if (label) {
                buttons.push({ label, view });
            }
        }
        const clock = this.renderClock(now, lang);
        const hasAside = !!(clock || lede || buttons.length);

        const cls = [
            'gh-header',
            `gh-header-${d.layout === 'stacked' ? 'stacked' : 'columns'}`,
            `gh-header-a-${d.align === 'center' || d.align === 'right' ? d.align : 'left'}`,
            `gh-header-v-${d.valign === 'top' || d.valign === 'bottom' ? d.valign : 'center'}`,
        ];
        if (this.props.editMode) {
            cls.push('gh-header-edit');
        }

        return (
            <div
                ref={this.rootRef}
                className={this.ghClass(cls.join(' '), { tile: false })}
            >
                <div
                    className="gh-header-in"
                    ref={this.innerRef}
                >
                    <div
                        className="gh-header-copy"
                        style={hasAside ? undefined : { gridTemplateColumns: 'minmax(0,1fr)' }}
                    >
                        <div
                            className="gh-header-main"
                            ref={this.mainRef}
                        >
                            {eyebrowMode !== 'none' && eyebrowParts.length ? (
                                <p className="gh-eyebrow gh-header-eyebrow">
                                    <span>{eyebrowParts.join(' · ')}</span>
                                </p>
                            ) : null}
                            <h1
                                className="gh-header-h1"
                                ref={this.h1Ref}
                            >
                                {line1 ? <span>{line1}</span> : null}
                                {line2 ? <span className="gh-it">{line2}</span> : null}
                            </h1>
                        </div>
                        {hasAside ? (
                            <div className="gh-header-aside">
                                {clock}
                                {lede ? (
                                    <p
                                        className="gh-header-lede"
                                        dangerouslySetInnerHTML={{ __html: safeHtml(lede) }}
                                    />
                                ) : null}
                                {buttons.length ? (
                                    <div className="gh-header-ctas">
                                        {buttons.map((b, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                className={i === 0 ? 'gh-ink' : 'gh-header-ul'}
                                                onClick={() => this.go(b.view)}
                                            >
                                                {b.label}
                                                <GhIcon name="arrow" />
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>
                {this.ghDemoBadge(usesExample)}
            </div>
        );
    }
}
