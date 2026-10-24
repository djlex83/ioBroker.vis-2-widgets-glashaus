/* Navigation: brand, links to views (active view underlined), theme toggle, clock and a status pill.
 * Layouts: horizontal bar like the Glashaus pages, vertical sidebar, or links as pills in a glass capsule. */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { GhIcon, GhPill } from './core/components';
import { clamp, localeOf, toBool, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';

interface NavigationRxData {
    brand: string;
    brandView: string;
    layout: 'horizontal' | 'vertical' | 'pills';
    count: number | string;
    showIcons: boolean | string;
    showLabels: boolean | string;
    themeToggle: boolean | string;
    clock: boolean | string;
    clock12: boolean | string;
    statusOid: string;
    statusOn: string;
    statusOff: string;
    [key: `view${number}`]: string;
    [key: `label${number}`]: string;
    [key: `icon${number}`]: string;
    [key: `iconCustom${number}`]: string;
}

interface NavigationState extends VisRxWidgetState {
    now: number;
    /** Theme chosen with the toggle, until vis-2 reports it back */
    pickedTheme: 'light' | 'dark' | null;
}

interface NavLink {
    i: number;
    view: string;
    label: string;
    icon?: string;
    active: boolean;
}

const MAX_LINKS = 10;
const DEMO_ICONS = ['home', 'bolt', 'flame', 'washer', 'car', 'cube', 'desk', 'cam', 'cloud', 'chart'];

const CSS = `
.gh-navigation{container:gh-navigation / inline-size;position:relative;display:flex;align-items:center;gap:12px 24px;min-width:0;overflow:hidden;padding:0}
.gh-navigation.gh-glass{padding:0 14px 0 22px;border-radius:99px}
.gh-navigation-brand{flex:none;font-weight:600;font-size:17px;letter-spacing:-.02em;background:none;border:0;padding:4px 0;cursor:pointer;white-space:nowrap;max-width:40%;overflow:hidden;text-overflow:ellipsis}
.gh-navigation-right{display:flex;align-items:center;gap:clamp(14px,2.4cqw,34px);min-width:0;margin-left:auto}
.gh-navigation-links{display:flex;align-items:center;gap:clamp(14px,2.4cqw,34px);list-style:none;margin:0;padding:8px 4px;min-width:0;overflow-x:auto;scrollbar-width:none;flex:0 1 auto}
.gh-navigation-links::-webkit-scrollbar{display:none}
.gh-navigation-links li{flex:none}
.gh-navigation-link{display:inline-flex;align-items:center;gap:7px;min-height:36px;border:0;background:none;padding:2px 0;cursor:pointer;font-size:13.5px;opacity:.68;white-space:nowrap;transition:opacity .2s}
.gh-navigation-link:hover,.gh-navigation-link[aria-current]{opacity:1}
.gh-navigation-link[aria-current] .gh-navigation-lbl{text-decoration:underline;text-underline-offset:6px;text-decoration-thickness:1px}
.gh-navigation-link svg{width:16px;height:16px;flex:none}
.gh-navigation-link img{flex:none}
.gh-navigation-x{display:flex;align-items:center;gap:10px 12px;flex:none}
.gh-navigation-nobrand .gh-navigation-right{flex:1;margin-left:0}
.gh-navigation-nobrand .gh-navigation-x{margin-left:auto}
.gh-navigation-clock{cursor:default;pointer-events:none}
.gh-navigation-edit button{cursor:default}
.gh-navigation:not(.gh-navigation-vertical) .gh-demo-badge{bottom:auto;top:0;right:4px}
/* vertical sidebar */
.gh-navigation-vertical{flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0;padding:6px 0}
.gh-navigation-vertical.gh-glass{padding:22px 14px;border-radius:var(--gh-r-xl)}
.gh-navigation-vertical .gh-navigation-brand{max-width:100%;text-align:left;font-size:19px;margin:0 12px 22px}
.gh-navigation-vertical .gh-navigation-right{flex-direction:column;align-items:stretch;flex:1;min-height:0;margin:0;gap:16px}
.gh-navigation-vertical .gh-navigation-links{flex-direction:column;align-items:stretch;gap:2px;padding:0;overflow-x:hidden;overflow-y:auto;flex:0 1 auto;min-height:0}
.gh-navigation-vertical .gh-navigation-link{width:100%;height:42px;padding:0 12px;gap:12px;border-radius:12px;font-size:14.5px;opacity:.72;transition:opacity .2s,background .35s var(--gh-ease)}
.gh-navigation-vertical .gh-navigation-link svg{width:18px;height:18px}
.gh-navigation-vertical .gh-navigation-link:hover{background:color-mix(in srgb,var(--gh-fg) 5%,transparent)}
.gh-navigation-vertical .gh-navigation-link[aria-current]{opacity:1;font-weight:550;background:var(--gh-track)}
.gh-navigation-vertical .gh-navigation-link[aria-current] .gh-navigation-lbl{text-decoration:none}
.gh-navigation-vertical .gh-navigation-lbl{overflow:hidden;text-overflow:ellipsis}
.gh-navigation-vertical .gh-navigation-link:focus-visible,.gh-navigation-pills .gh-navigation-link:focus-visible{outline-offset:-2px}
.gh-navigation-vertical .gh-navigation-x{margin-top:auto;padding:0 12px;flex-wrap:wrap}
/* pills: links in a glass capsule, the active one in ink */
.gh-navigation-pills .gh-navigation-links{gap:2px;padding:4px;border-radius:99px;background:var(--gh-glass);-webkit-backdrop-filter:blur(22px) saturate(150%);backdrop-filter:blur(22px) saturate(150%);box-shadow:inset 0 1px 0 var(--gh-glass-hi),inset 0 0 0 1px var(--gh-stroke),0 1px 2px var(--gh-edge),0 18px 40px -26px var(--gh-shadow)}
.gh-navigation-pills .gh-navigation-link{height:36px;padding:0 16px;border-radius:99px;opacity:1;color:var(--gh-fg-2);font-weight:500;transition:background .45s var(--gh-ease),color .3s}
.gh-navigation-pills .gh-navigation-link:hover{color:var(--gh-fg)}
.gh-navigation-pills .gh-navigation-link[aria-current]{background:var(--gh-fg);color:var(--gh-bg)}
.gh-navigation-pills .gh-navigation-link[aria-current] .gh-navigation-lbl{text-decoration:none}
.gh-navigation-pills .gh-circ,.gh-navigation-pills .gh-navigation-clock{background:var(--gh-glass);-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);border-color:var(--gh-stroke)}
.gh-navigation-pills .gh-circ:hover{background:var(--gh-fg)}
.gh-navigation-pills.gh-glass .gh-navigation-links{background:transparent;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}
.gh-navigation-iconly .gh-navigation-link{gap:0}
.gh-navigation-pills.gh-navigation-iconly .gh-navigation-link{padding:0 11px}
@container gh-navigation (max-width:620px){
.gh-navigation:not(.gh-navigation-vertical) .gh-navigation-clock{display:none}
.gh-navigation:not(.gh-navigation-vertical){gap:12px 16px}
}
@container gh-navigation (max-width:420px){
.gh-navigation:not(.gh-navigation-vertical) .gh-navigation-pilltxt{display:none}
.gh-navigation:not(.gh-navigation-vertical) .gh-navigation-right{gap:12px}
.gh-navigation:not(.gh-navigation-vertical) .gh-navigation-links{gap:14px}
.gh-navigation-pills:not(.gh-navigation-vertical) .gh-navigation-links{gap:2px}
}
`;

/** Trimmed text; 'undefined' / 'null' is what vis-2 makes of a binding {id} without value */
const str = (v: unknown): string => {
    const t = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
    return t === 'undefined' || t === 'null' ? '' : t;
};

export default class GlashausNavigation extends GlashausWidget<NavigationRxData, NavigationState> {
    private tick: ReturnType<typeof setTimeout> | undefined;

    private linksRef = React.createRef<HTMLUListElement>();

    private lastActive = '';

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('navigation', CSS);
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausNavigation',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Navigation',
            visWidgetLabel: 'nav_widget',
            visHelp: 'nav_help',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'brand', label: 'nav_brand', tooltip: 'nav_brand_tip' },
                        { name: 'brandView', label: 'nav_brand_view', type: 'select-views', multiple: false },
                        {
                            name: 'layout',
                            label: 'nav_layout',
                            type: 'select',
                            options: [
                                { value: 'horizontal', label: 'nav_layout_horizontal' },
                                { value: 'vertical', label: 'nav_layout_vertical' },
                                { value: 'pills', label: 'nav_layout_pills' },
                            ],
                            default: 'horizontal',
                        },
                        {
                            name: 'count',
                            label: 'nav_count',
                            type: 'slider',
                            min: 1,
                            max: MAX_LINKS,
                            default: 4,
                        },
                        { name: 'showIcons', label: 'nav_show_icons', type: 'checkbox', default: true },
                        { name: 'showLabels', label: 'nav_show_labels', type: 'checkbox', default: true },
                    ],
                },
                {
                    name: 'nav_extras',
                    label: 'nav_group_extras',
                    fields: [
                        { name: 'themeToggle', label: 'nav_theme_toggle', type: 'checkbox', default: true },
                        { name: 'clock', label: 'nav_clock', type: 'checkbox', default: true },
                        {
                            name: 'clock12',
                            label: 'nav_clock12',
                            type: 'checkbox',
                            default: false,
                            hidden: (data: WidgetData) => !isTrue(data.clock, true),
                        },
                        { name: 'statusOid', label: 'nav_status_oid', type: 'id', tooltip: 'nav_status_oid_tip' },
                        {
                            name: 'statusOn',
                            label: 'nav_status_on',
                            hidden: (data: WidgetData) => !isOid(data.statusOid),
                        },
                        {
                            name: 'statusOff',
                            label: 'nav_status_off',
                            hidden: (data: WidgetData) => !isOid(data.statusOid),
                        },
                    ],
                },
                {
                    name: 'nav_link',
                    label: 'nav_group_link',
                    indexFrom: 1,
                    indexTo: 'count',
                    fields: [
                        { name: 'view', label: 'nav_view', type: 'select-views', multiple: false },
                        { name: 'label', label: 'nav_label', tooltip: 'nav_label_tip' },
                        ...GlashausWidget.iconFields(''),
                    ],
                },
                GlashausWidget.designGroup({ glass: false }),
            ],
            visDefaultStyle: { width: 1100, height: 64, position: 'absolute' },
            visDefaultGrid: { columns: 'full', rows: 'auto' },
            visPrev: `widgets/${ADAPTER}/img/prev_navigation.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausNavigation.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        document.addEventListener('visibilitychange', this.onVisibility);
        this.startTicker();
        this.revealActive();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: NavigationState): void {
        super.componentDidUpdate(prevProps, prevState);
        // vis-2 reported the new theme: the toggle follows vis-2 again
        if (this.state.pickedTheme && prevProps.context?.themeType !== this.props.context?.themeType) {
            this.setState({ pickedTheme: null });
        }
        this.revealActive();
    }

    componentWillUnmount(): void {
        this.stopTicker();
        document.removeEventListener('visibilitychange', this.onVisibility);
        super.componentWillUnmount();
    }

    /* ---------- Clock: one update per minute, paused while the tab is hidden ---------- */

    private startTicker(): void {
        this.stopTicker();
        if (document.hidden || !isTrue(this.state.rxData.clock, true)) {
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

    onRxDataChanged(prev: NavigationRxData): void {
        if (isTrue(prev.clock, true) !== isTrue(this.state.rxData.clock, true)) {
            this.startTicker();
        }
    }

    /** Scrolls the active link into view when the links do not fit (horizontal bar) */
    private revealActive(): void {
        const ul = this.linksRef.current;
        const active = ul?.querySelector<HTMLElement>('[aria-current]');
        const key = active?.dataset.view || '';
        if (!ul || !active || key === this.lastActive) {
            return;
        }
        this.lastActive = key;
        if (ul.scrollWidth > ul.clientWidth + 1) {
            const left = active.offsetLeft - ul.offsetLeft - (ul.clientWidth - active.offsetWidth) / 2;
            ul.scrollLeft = Math.max(0, left);
        }
    }

    /* ---------- Actions ---------- */

    private go(view: string): void {
        if (!view || this.props.editMode) {
            return;
        }
        this.props.context?.changeView?.(view);
    }

    /** Current theme of vis-2 (or the one just picked with the toggle) */
    private visTheme(): 'light' | 'dark' {
        if (this.state.pickedTheme) {
            return this.state.pickedTheme;
        }
        return this.props.context?.themeType === 'dark' ? 'dark' : 'light';
    }

    private toggleTheme = (e: React.MouseEvent): void => {
        e.stopPropagation();
        if (this.props.editMode) {
            return;
        }
        const dark = this.visTheme() !== 'dark';
        // stay in the design family of vis-2: modernLight <-> modernDark (its default), light <-> dark
        const current = this.props.context?.themeName || '';
        const modern = !current || current.startsWith('modern');
        const next = modern ? (dark ? 'modernDark' : 'modernLight') : dark ? 'dark' : 'light';
        this.setState({ pickedTheme: dark ? 'dark' : 'light' });
        const toggle = this.props.context?.toggleTheme;
        if (toggle) {
            // vis-2 switches and stores the choice itself (App.themeName)
            toggle(next);
        } else {
            try {
                window.localStorage.setItem('App.themeName', next);
            } catch {
                // storage may be blocked
            }
        }
    };

    /* ---------- Rendering ---------- */

    private viewTitle(view: string): string {
        return this.props.context?.views?.[view]?.settings?.navigationTitle || view;
    }

    private links(): { links: NavLink[]; demo: boolean } {
        const d = this.state.rxData;
        const count = clamp(Math.round(toNum(d.count) ?? 4), 1, MAX_LINKS);
        const vertical = d.layout === 'vertical';
        let demo = true;
        for (let i = 1; i <= count; i++) {
            if (str(d[`view${i}`])) {
                demo = false;
                break;
            }
        }
        const activeView = this.props.context?.activeView || this.props.view || '';
        const out: NavLink[] = [];
        for (let i = 1; i <= count; i++) {
            const view = str(d[`view${i}`]);
            let label = str(d[`label${i}`]);
            if (!label && view) {
                label = this.viewTitle(view);
            }
            if (!label && demo && (d[`label${i}`] === undefined || d[`label${i}`] === null)) {
                label = GlashausWidget.tr(`nav_demo_${i}`);
            }
            let icon = str(d[`iconCustom${i}`]) || str(d[`icon${i}`]) || undefined;
            if (!icon && demo && vertical && d[`icon${i}`] === undefined) {
                icon = DEMO_ICONS[i - 1];
            }
            if (!label && !icon) {
                continue;
            }
            out.push({ i, view, label, icon, active: demo ? i === 1 : !!view && view === activeView });
        }
        return { links: out, demo };
    }

    private renderClock(lang: string): React.JSX.Element {
        // state.now only triggers the re-render at the full minute
        const h12 = isTrue(this.state.rxData.clock12);
        const text = new Date().toLocaleTimeString(localeOf(lang), {
            hour: h12 ? 'numeric' : '2-digit',
            minute: '2-digit',
            hour12: h12,
        });
        return <span className="gh-outline gh-navigation-clock">{text}</span>;
    }

    private renderStatus(): React.JSX.Element | null {
        const d = this.state.rxData;
        if (!isOid(d.statusOid)) {
            return null;
        }
        const raw = this.ghVal(d.statusOid);
        const known = raw !== undefined && raw !== null && raw !== '';
        const on = known && toBool(raw);
        const text = on
            ? str(d.statusOn) || GlashausWidget.tr('nav_status_live')
            : str(d.statusOff) || GlashausWidget.tr('nav_status_offline');
        return (
            <span title={text}>
                <GhPill
                    kind={on ? 'ok' : known ? 'crit' : 'idle'}
                    live={on}
                >
                    <span className="gh-navigation-pilltxt">{text}</span>
                </GhPill>
            </span>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const lang = this.ghLang();
        const layout = d.layout === 'vertical' || d.layout === 'pills' ? d.layout : 'horizontal';
        const showIcons = isTrue(d.showIcons, true);
        const showLabels = isTrue(d.showLabels, true);
        // brand never set: the example brand (marked "Demo" in the editor); '' = no brand
        const brandExample = d.brand === undefined || d.brand === null;
        const brand = brandExample ? GlashausWidget.tr('nav_demo_brand') : str(d.brand);
        const { links, demo } = this.links();
        const dark = this.visTheme() === 'dark';
        const toggleLabel = GlashausWidget.tr(dark ? 'nav_theme_light' : 'nav_theme_dark');

        const cls = ['gh-navigation', `gh-navigation-${layout}`];
        if (!showLabels) {
            cls.push('gh-navigation-iconly');
        }
        if (!brand) {
            cls.push('gh-navigation-nobrand');
        }
        if (this.props.editMode) {
            cls.push('gh-navigation-edit');
        }

        const status = this.renderStatus();
        const toggle = isTrue(d.themeToggle, true) ? (
            <button
                type="button"
                className="gh-circ"
                aria-label={toggleLabel}
                title={toggleLabel}
                onClick={this.toggleTheme}
            >
                <GhIcon name={dark ? 'sun' : 'moon'} />
            </button>
        ) : null;
        const clock = isTrue(d.clock, true) ? this.renderClock(lang) : null;

        return (
            <nav
                className={this.ghClass(cls.join(' '), { tile: false })}
                aria-label={brand || GlashausWidget.tr('nav_widget')}
            >
                {brand ? (
                    <button
                        type="button"
                        className="gh-navigation-brand"
                        title={brand}
                        onClick={() => this.go(str(d.brandView))}
                        style={str(d.brandView) ? undefined : { cursor: 'default' }}
                    >
                        {brand}
                    </button>
                ) : null}
                <div className="gh-navigation-right">
                    <ul
                        className="gh-navigation-links"
                        ref={this.linksRef}
                    >
                        {links.map(l => (
                            <li key={l.i}>
                                <button
                                    type="button"
                                    className="gh-navigation-link"
                                    data-view={l.view || `#${l.i}`}
                                    aria-current={l.active ? 'page' : undefined}
                                    aria-label={showLabels ? undefined : l.label}
                                    title={showLabels ? undefined : l.label}
                                    onClick={() => this.go(l.view)}
                                >
                                    {showIcons && l.icon ? (
                                        <GhIcon
                                            name={l.icon}
                                            size={layout === 'vertical' ? 18 : 16}
                                        />
                                    ) : null}
                                    {showLabels || !showIcons || !l.icon ? (
                                        <span className="gh-navigation-lbl">{l.label}</span>
                                    ) : null}
                                </button>
                            </li>
                        ))}
                    </ul>
                    {status || toggle || clock ? (
                        <div className="gh-navigation-x">
                            {status}
                            {toggle}
                            {clock}
                        </div>
                    ) : null}
                </div>
                {this.ghDemoBadge(demo || brandExample)}
            </nav>
        );
    }
}
