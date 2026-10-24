/* Camera tile: snapshot image from a URL (bindable) or from an object ID (URL, data URI or base64), refreshed every
 * n seconds. Pill "Live" while refreshing works, otherwise "Last image" with its time. A motion ID adds a pill and a
 * soft glow. A click opens a large view inside the page (close button, Escape). Without a source a calm invented
 * driveway scene is drawn as demo picture. */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { GhIcon, GhIconBox, GhPill } from './core/components';
import { clamp, fmtDate, localeOf, toBool, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';
import { Lightbox, type LightboxPill } from './camera/lightbox';
import { SnapLoader, toImageSrc } from './camera/loader';
import { demoPicture } from './camera/scene';

interface CameraRxData {
    title: string;
    icon: string;
    iconCustom: string;
    accent: string;
    color: string;
    oid: string;
    url: string;
    refresh: number | string;
    bust: boolean | string;
    fit: 'cover' | 'contain';
    showTime: boolean | string;
    showHeader: boolean | string;
    oidMotion: string;
    lightbox: boolean | string;
    urlFull: string;
}

interface CameraState extends VisRxWidgetState {
    /** Image on screen */
    src: string | null;
    /** Time of the image on screen (ms) */
    at: number;
    /** Last successful load (ms) */
    okAt: number;
    /** The last attempt failed */
    err: boolean;
    /** Large view open */
    open: boolean;
    /** Image of the large view (own URL), null = same as the tile */
    fullSrc: string | null;
    /** Demo picture for the large view */
    demoBig: string;
    w: number;
    h: number;
    /** Frame size */
    fw: number;
    fh: number;
    /** Re-render when "Live" runs out */
    tick: number;
}

type SourceKind = 'demo' | 'url' | 'oid';

const DEMO_REFRESH_S = 5;

const CAM_CSS = `
.gh.gh-cam{padding:var(--gh-cam-pad,18px);gap:var(--gh-cam-gap,14px)}
.gh-cam-h{display:flex;align-items:center;gap:10px;min-width:0;flex:none}
.gh-cam-name{flex:1;min-width:0;font-size:15.5px;font-weight:550;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gh-cam-pills{display:flex;gap:6px;flex:none;min-width:0}
.gh-cam-frame{position:relative;flex:1;min-height:0;border-radius:var(--gh-cam-r,16px);overflow:hidden;background:#111;
  box-shadow:inset 0 0 0 1px var(--gh-stroke);transition:box-shadow .6s var(--gh-ease);outline-offset:3px}
.gh-cam-click .gh-cam-frame{cursor:zoom-in}
.gh-cam-img{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;-webkit-user-drag:none}
.gh-cam-frame::after{content:'';position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);pointer-events:none}
.gh-cam-motion .gh-cam-frame{box-shadow:0 0 0 2px var(--gh-warn),0 0 26px -4px var(--gh-warn);animation:gh-cam-glow 2.2s ease-in-out infinite}
@keyframes gh-cam-glow{50%{box-shadow:0 0 0 2px color-mix(in srgb,var(--gh-warn) 55%,transparent),0 0 12px -6px var(--gh-warn)}}
.gh-cam-motion .gh-cam-frame::before{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;border-radius:inherit;
  background:radial-gradient(120% 90% at 50% 50%,transparent 60%,color-mix(in srgb,var(--gh-warn) 26%,transparent))}
.gh-cam-time{position:absolute;left:10px;bottom:10px;z-index:2;height:24px;padding:0 9px;border-radius:99px;display:inline-flex;align-items:center;gap:6px;
  font-size:11.5px;font-weight:550;font-variant-numeric:tabular-nums;color:#fff;background:rgba(17,17,16,.42);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);white-space:nowrap;pointer-events:none}
.gh-cam-over{position:absolute;top:8px;right:8px;z-index:2;display:flex;gap:6px;pointer-events:none}
/* pills on the image: always on dark glass, so they take the dark-theme colors */
.gh-cam-over{--gh-crit:#ec7a69;--gh-warn:#f08a3e;--gh-fg-2:rgba(241,239,234,.85)}
.gh-cam-over .gh-pill{background:rgba(17,17,16,.5);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.gh-cam-frame.gh-cam-noimg{background:color-mix(in srgb,var(--gh-fg) 4%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--gh-fg) 10%,transparent)}
.gh-cam-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px;text-align:center;
  color:var(--gh-fg-2)}
.gh-cam-big .gh-cam-empty{background:color-mix(in srgb,var(--gh-fg) 4%,transparent)}
.gh-cam-empty b{font-size:14px;font-weight:550;color:var(--gh-fg)}
.gh-cam-empty small{font-size:12px;line-height:1.3;max-width:240px}
.gh-cam-empty-ico{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;margin-bottom:4px;
  background:color-mix(in srgb,var(--gh-fg) 8%,transparent);color:var(--gh-fg-2)}
.gh-cam-empty-ico svg{width:24px;height:24px}
.gh-cam-loading .gh-cam-empty-ico{animation:gh-blink 1.6s ease-in-out infinite}
.gh-cam-small .gh-cam-empty-ico{width:34px;height:34px;border-radius:11px;margin:0}
.gh-cam-small .gh-cam-empty-ico svg{width:18px;height:18px}
.gh-cam-small .gh-cam-empty small{display:none}
.gh.gh-cam-lb{position:fixed;inset:0;z-index:100000;width:auto;height:auto;display:flex;align-items:center;justify-content:center;padding:24px;
  background:rgba(12,12,11,.5);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);animation:gh-cam-fade .3s var(--gh-ease) both}
@keyframes gh-cam-fade{from{opacity:0}}
.gh-cam-card{display:flex;flex-direction:column;gap:12px;padding:14px;width:min(1280px,100%);max-height:100%;border-radius:var(--gh-r-xl);
  background:color-mix(in srgb,var(--gh-bg) 90%,transparent);animation:gh-cam-pop .45s var(--gh-ease) both}
@keyframes gh-cam-pop{from{opacity:0;transform:translateY(14px) scale(.98)}}
.gh-cam-card .gh-cam-h{padding:2px 2px 0 6px}
.gh-cam-card .gh-cam-meta{font-size:12.5px;color:var(--gh-fg-2);font-variant-numeric:tabular-nums;white-space:nowrap}
.gh-cam-big{position:relative;min-height:0;flex:1;display:flex;justify-content:center;border-radius:16px;overflow:hidden;background:#111}
.gh-cam-big:has(.gh-cam-empty){background:transparent}
.gh-cam-big img{display:block;max-width:100%;max-height:calc(100vh - 150px);width:auto;height:auto;object-fit:contain}
.gh-cam-big .gh-cam-empty{position:relative;min-height:240px;width:100%}
@media (max-width:600px){.gh.gh-cam-lb{padding:10px}.gh-cam-card{padding:10px}}
`;

export default class GlashausCamera extends GlashausWidget<CameraRxData, CameraState> {
    private rootRef = React.createRef<HTMLDivElement>();

    private frameRef = React.createRef<HTMLDivElement>();

    private rootEl: HTMLDivElement | null = null;

    private ro: ResizeObserver | null = null;

    private io: IntersectionObserver | null = null;

    private inView = true;

    private roRaf = 0;

    private loader: SnapLoader;

    private fullLoader: SnapLoader;

    private demoTimer: ReturnType<typeof setInterval> | undefined;

    private demoKey = '';

    private staleTimer: ReturnType<typeof setTimeout> | undefined;

    private staleAt = 0;

    private lightbox: Lightbox;

    /** Source kind and state of the image on screen: a change clears the old picture */
    private srcKey = '';

    /** Last raw value and its image source (base64 images can be large) */
    private memoRaw: unknown = undefined;

    private memoSrc: string | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('camera', CAM_CSS);
        this.state = {
            ...this.state,
            src: null,
            at: 0,
            okAt: 0,
            err: false,
            open: false,
            fullSrc: null,
            demoBig: '',
            w: 0,
            h: 0,
            fw: 0,
            fh: 0,
            tick: 0,
        };
        this.loader = new SnapLoader({
            onLoad: (src, at) => {
                const oidTs = this.oidTs();
                this.setState({ src, at: oidTs || at, okAt: at, err: false });
            },
            onError: () => this.setState({ err: true }),
        });
        this.lightbox = new Lightbox(() => this.onClose());
        this.fullLoader = new SnapLoader({
            onLoad: src => this.setState({ fullSrc: src }),
            onError: () => this.setState({ fullSrc: null }),
        });
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausCamera',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Camera',
            visWidgetLabel: 'cam_widget',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'title', label: 'title' },
                        ...GlashausWidget.iconFields('cam'),
                        ...GlashausWidget.accentFields('', 'crit'),
                        { name: 'showHeader', label: 'cam_show_header', type: 'checkbox', default: true },
                    ],
                },
                {
                    name: 'camImage',
                    label: 'group_cam_image',
                    fields: [
                        { name: 'oid', label: 'cam_oid', type: 'id', tooltip: 'cam_oid_tip' },
                        {
                            name: 'url',
                            label: 'cam_url',
                            tooltip: 'cam_url_tip',
                            hidden: (data: WidgetData) => isOid(data.oid),
                        },
                        {
                            name: 'refresh',
                            label: 'cam_refresh',
                            type: 'number',
                            min: 0,
                            max: 3600,
                            step: 1,
                            default: 5,
                            tooltip: 'cam_refresh_tip',
                        },
                        { name: 'bust', label: 'cam_bust', type: 'checkbox', default: true, tooltip: 'cam_bust_tip' },
                        {
                            name: 'fit',
                            label: 'cam_fit',
                            type: 'select',
                            options: [
                                { value: 'cover', label: 'cam_fit_cover' },
                                { value: 'contain', label: 'cam_fit_contain' },
                            ],
                            default: 'cover',
                        },
                        { name: 'showTime', label: 'cam_show_time', type: 'checkbox', default: true },
                    ],
                },
                {
                    name: 'camMore',
                    label: 'group_cam_more',
                    fields: [
                        { name: 'oidMotion', label: 'cam_motion_oid', type: 'id', tooltip: 'cam_motion_tip' },
                        { name: 'lightbox', label: 'cam_lightbox', type: 'checkbox', default: true },
                        {
                            name: 'urlFull',
                            label: 'cam_url_full',
                            tooltip: 'cam_url_full_tip',
                            hidden: (data: WidgetData) => !isTrue(data.lightbox, true),
                        },
                    ],
                },
                GlashausWidget.designGroup(),
            ],
            visDefaultStyle: { width: 480, height: 330, position: 'absolute' },
            visPrev: `widgets/${ADAPTER}/img/prev_camera.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausCamera.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        document.addEventListener('visibilitychange', this.onVisibility);
        this.attach();
        this.sync();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: CameraState): void {
        super.componentDidUpdate(prevProps, prevState);
        this.attach();
        this.sync();
        this.syncLightbox();
    }

    componentWillUnmount(): void {
        cancelAnimationFrame(this.roRaf);
        this.ro?.disconnect();
        this.ro = null;
        this.io?.disconnect();
        this.io = null;
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.lightbox.hide();
        this.loader.destroy();
        this.fullLoader.destroy();
        if (this.demoTimer) {
            clearInterval(this.demoTimer);
            this.demoTimer = undefined;
        }
        if (this.staleTimer) {
            clearTimeout(this.staleTimer);
            this.staleTimer = undefined;
        }
        super.componentWillUnmount();
    }

    private onVisibility = (): void => this.updateActive();

    private active(): boolean {
        return !document.hidden && (this.inView || this.state.open);
    }

    private updateActive(): void {
        const a = this.active();
        this.loader.setActive(a);
        this.fullLoader.setActive(!document.hidden);
        if (a && this.kind() === 'demo') {
            this.renderDemo(true);
        }
    }

    /** Observers follow the DOM element (vis-2 may re-create it) */
    private attach(): void {
        const root = this.rootRef.current;
        if (root === this.rootEl) {
            return;
        }
        this.ro?.disconnect();
        this.io?.disconnect();
        this.ro = null;
        this.io = null;
        this.rootEl = root;
        if (!root) {
            return;
        }
        if (typeof ResizeObserver !== 'undefined') {
            this.ro = new ResizeObserver(() => {
                cancelAnimationFrame(this.roRaf);
                this.roRaf = requestAnimationFrame(() => this.measure());
            });
            this.ro.observe(root);
        }
        if (typeof IntersectionObserver !== 'undefined') {
            this.io = new IntersectionObserver(entries => {
                this.inView = entries.some(e => e.isIntersecting);
                this.updateActive();
            });
            this.io.observe(root);
        }
        this.measure();
    }

    private measure(): void {
        const root = this.rootEl;
        if (!root) {
            return;
        }
        const w = root.clientWidth;
        const h = root.clientHeight;
        const fw = this.frameRef.current?.clientWidth || w;
        const fh = this.frameRef.current?.clientHeight || h;
        if (w !== this.state.w || h !== this.state.h || fw !== this.state.fw || fh !== this.state.fh) {
            this.setState({ w, h, fw, fh });
        }
    }

    private kind(): SourceKind {
        const d = this.state.rxData;
        if (isOid(d.oid)) {
            return 'oid';
        }
        // a binding without value ("undefined") is still a configured URL: no image yet, no demo picture
        return typeof d.url === 'string' && d.url.trim() ? 'url' : 'demo';
    }

    /** Time stamp of the image state (OID source), 0 otherwise */
    private oidTs(): number {
        const d = this.state.rxData;
        if (!isOid(d.oid)) {
            return 0;
        }
        const ts = toNum(this.state.values[`${d.oid}.ts`]);
        return ts && ts > 0 ? ts : 0;
    }

    /** Image source of the configured state or URL (memoized: base64 images can be large) */
    private baseSrc(): string | null {
        const d = this.state.rxData;
        const raw: unknown = isOid(d.oid) ? this.ghVal(d.oid) : GlashausWidget.ghText(d.url);
        if (raw !== this.memoRaw) {
            this.memoRaw = raw;
            this.memoSrc = toImageSrc(raw);
        }
        return this.memoSrc;
    }

    private refreshS(): number {
        const r = toNum(this.state.rxData.refresh);
        return r === null ? 5 : Math.max(0, r);
    }

    private titleText(): string {
        const own = GlashausWidget.ghText(this.state.rxData.title);
        return own || (this.kind() === 'demo' ? GlashausWidget.tr('cam_demo_title') : '');
    }

    /** Hands the source to the loaders, runs the demo, keeps "Live" up to date */
    private sync(): void {
        const d = this.state.rxData;
        const kind = this.kind();
        const bust = isTrue(d.bust, true);
        const refresh = this.refreshS();
        this.loader.setActive(this.active());
        // another source (demo / URL / other state): the old picture must not stay as "last image"
        const srcKey = `${kind}|${kind === 'oid' ? d.oid : ''}`;
        if (srcKey !== this.srcKey) {
            const first = !this.srcKey;
            this.srcKey = srcKey;
            this.demoKey = '';
            if (!first && (this.state.src || this.state.err)) {
                this.setState({ src: null, err: false, okAt: 0, at: 0 });
            }
        }
        if (kind === 'demo') {
            this.loader.set(null, 0, false);
            this.renderDemo(false);
            if (!this.demoTimer) {
                this.demoTimer = setInterval(() => {
                    if (this.active()) {
                        this.renderDemo(true);
                    }
                }, DEMO_REFRESH_S * 1000);
            }
        } else {
            if (this.demoTimer) {
                clearInterval(this.demoTimer);
                this.demoTimer = undefined;
                this.demoKey = '';
            }
            const base = this.baseSrc();
            // a data URI only changes with its state / binding: reloading it periodically gives nothing new
            const isData = !!base && /^data:/i.test(base);
            this.loader.set(base, isData ? 0 : refresh, bust);
            if (!base && (this.state.src || this.state.err)) {
                this.setState({ src: null, err: false, okAt: 0, at: 0 });
            }
        }
        // own image for the large view
        const full = this.state.open && kind !== 'demo' ? toImageSrc(GlashausWidget.ghText(d.urlFull)) : null;
        this.fullLoader.set(full, full ? refresh : 0, bust);
        if (!full && this.state.fullSrc) {
            this.setState({ fullSrc: null });
        }
        // re-render when "Live" runs out
        const until = this.liveUntil();
        if (until !== this.staleAt) {
            this.staleAt = until;
            if (this.staleTimer) {
                clearTimeout(this.staleTimer);
                this.staleTimer = undefined;
            }
            const ms = until - Date.now();
            if (ms > 0) {
                this.staleTimer = setTimeout(() => this.setState({ tick: Date.now() }), ms + 60);
            }
        }
    }

    /** Draws the demo picture (size follows the frame and the device pixel ratio, night look in the dark theme) */
    private renderDemo(force: boolean): void {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const bucket = (px: number): number => clamp(Math.ceil((px * dpr) / 160) * 160, 320, 1920);
        // 16:9 picture: with "cover" in a narrow frame the height decides the needed width
        const fw = this.state.fw || this.state.w || 480;
        const fh = this.state.fh || this.state.h || 270;
        const width = bucket(this.state.rxData.fit === 'contain' ? fw : Math.max(fw, (fh * 16) / 9));
        const dark = this.ghDark();
        const lang = this.ghLang();
        const label = this.titleText();
        const key = `${width}|${dark}|${label}|${lang}|${this.state.open}`;
        if (!force && key === this.demoKey) {
            return;
        }
        this.demoKey = key;
        const now = Date.now();
        const src = demoPicture(width, dark, now, label.toUpperCase(), lang);
        const demoBig = this.state.open
            ? demoPicture(bucket(Math.min(1280, window.innerWidth * 0.9)), dark, now, label.toUpperCase(), lang)
            : '';
        this.setState({ src, at: now, okAt: now, err: false, demoBig });
    }

    /** Until when the tile counts as "Live" (0 = not live) */
    private liveUntil(): number {
        const s = this.state;
        if (!s.okAt || s.err || !s.src) {
            return 0;
        }
        const kind = this.kind();
        if (kind === 'demo') {
            return s.okAt + DEMO_REFRESH_S * 3000;
        }
        const refresh = this.refreshS();
        const isData = /^data:/i.test(s.src);
        if (refresh > 0 && !isData) {
            return s.okAt + Math.max(refresh * 3000, 10000);
        }
        if (kind === 'oid' || isData) {
            // images written into a state (or bound into the URL): live while new ones keep arriving
            return (this.oidTs() || s.okAt) + Math.max(refresh * 3000, 30000);
        }
        return 0;
    }

    private onOpen = (): void => {
        const d = this.state.rxData;
        if (this.props.editMode || !isTrue(d.lightbox, true) || this.state.open || !this.state.src) {
            return;
        }
        this.setState({ open: true }, () => {
            if (this.kind() === 'demo') {
                this.renderDemo(true);
            } else {
                this.loader.reload();
            }
        });
    };

    private onClose = (): void => {
        if (this.state.open) {
            this.setState({ open: false, demoBig: '' });
        }
    };

    private onFrameKey = (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.onOpen();
        }
    };

    /** Time of the image: with seconds for live cameras, with date when it is not from today */
    private timeText(at: number): string {
        if (!at) {
            return '';
        }
        const lang = this.ghLang();
        const loc = localeOf(lang);
        const sec = this.kind() === 'demo' || (this.refreshS() > 0 && this.refreshS() < 60) || this.kind() === 'oid';
        const time = new Date(at).toLocaleTimeString(loc, {
            hour: '2-digit',
            minute: '2-digit',
            ...(sec ? { second: '2-digit' } : {}),
        });
        const today = new Date().toDateString() === new Date(at).toDateString();
        return today ? time : `${fmtDate(at, lang, { day: 'numeric', month: 'short' })} ${time}`;
    }

    private renderEmpty(small: boolean): React.JSX.Element {
        const s = this.state;
        const tr = GlashausWidget.tr;
        const kind = this.kind();
        const hasSource = kind === 'demo' || !!this.baseSrc();
        const loading = hasSource && !s.err;
        return (
            <div className={`gh-cam-empty${loading ? ' gh-cam-loading' : ''}${small ? ' gh-cam-small' : ''}`}>
                <span className="gh-cam-empty-ico">
                    <GhIcon name="cam" />
                </span>
                <b>{loading ? tr('cam_loading') : tr('cam_no_image')}</b>
                {loading ? null : <small>{s.err ? tr('cam_no_image_tip') : tr('cam_no_source')}</small>}
            </div>
        );
    }

    /** Pills: motion, and "Live" / "Last image" once there is an image */
    private pills(live: boolean, motion: boolean): LightboxPill[] {
        const tr = GlashausWidget.tr;
        const out: LightboxPill[] = [];
        if (motion) {
            out.push({ kind: 'warn', live: true, text: tr('cam_motion') });
        }
        if (this.state.src) {
            out.push(
                live
                    ? { kind: 'crit', live: true, text: tr('cam_live') }
                    : { kind: 'idle', live: false, text: tr('cam_last') },
            );
        }
        return out;
    }

    private static renderPills(pills: LightboxPill[]): React.JSX.Element {
        return (
            <>
                {pills.map(p => (
                    <GhPill
                        key={p.text}
                        kind={p.kind}
                        live={p.live}
                    >
                        {p.text}
                    </GhPill>
                ))}
            </>
        );
    }

    /** Opens, updates or closes the large view */
    private syncLightbox(): void {
        const s = this.state;
        if (!s.open || this.props.editMode) {
            if (this.lightbox.isOpen) {
                this.lightbox.hide();
            }
            if (s.open && this.props.editMode) {
                this.setState({ open: false });
            }
            return;
        }
        const tr = GlashausWidget.tr;
        const d = s.rxData;
        const title = this.titleText();
        const live = this.liveUntil() > Date.now();
        const motion = isOid(d.oidMotion) && toBool(this.ghVal(d.oidMotion));
        const src = this.kind() === 'demo' ? s.demoBig || s.src : s.fullSrc || s.src;
        this.lightbox.show(
            {
                title,
                dark: this.ghDark(),
                src,
                time: s.src && isTrue(d.showTime, true) ? this.timeText(s.at) : '',
                pills: this.pills(live, motion),
                icon: this.ghIcon(),
                accent: this.ghAccent('', 'crit'),
                closeLabel: tr('cam_close'),
                dialogLabel: title || tr('cam_widget'),
                emptyTitle: tr('cam_no_image'),
                emptyText: s.err ? tr('cam_no_image_tip') : tr('cam_no_source'),
            },
            this.frameRef.current,
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const s = this.state;
        const kind = this.kind();
        const demo = kind === 'demo';
        const title = this.titleText();
        const accent = this.ghAccent('', 'crit');
        const w = s.w || 480;
        const h = s.h || 330;
        const header = isTrue(d.showHeader, true) && h >= 140 && w >= 200;
        const pad = Math.round(clamp(Math.min(w, h) * 0.055, header ? 12 : 8, 20));
        const radius = Math.round(clamp(Math.min(w, h) * 0.05, 10, 18));
        const motion = isOid(d.oidMotion) && toBool(this.ghVal(d.oidMotion));
        const live = this.liveUntil() > Date.now();
        const clickable = !this.props.editMode && isTrue(d.lightbox, true) && !!s.src;
        const fit = d.fit === 'contain' ? 'contain' : 'cover';
        const small = Math.min(w, h) < 170;
        const pills = this.pills(live, motion);

        const style = {
            '--gh-cam-pad': `${pad}px`,
            '--gh-cam-gap': `${Math.round(clamp(h * 0.04, 10, 16))}px`,
            '--gh-cam-r': `${radius}px`,
        } as React.CSSProperties;

        const frameLabel = clickable
            ? `${title || GlashausWidget.tr('cam_widget')} – ${GlashausWidget.tr('cam_open')}`
            : title;

        return (
            <div
                ref={this.rootRef}
                className={this.ghClass(`gh-cam${motion ? ' gh-cam-motion' : ''}${clickable ? ' gh-cam-click' : ''}`)}
                style={style}
            >
                {header ? (
                    <div className="gh-cam-h">
                        <GhIconBox
                            name={this.ghIcon()}
                            color={accent}
                        />
                        <span
                            className="gh-cam-name"
                            title={title}
                        >
                            {title}
                        </span>
                        <span className="gh-cam-pills">{GlashausCamera.renderPills(pills)}</span>
                    </div>
                ) : null}
                <div
                    ref={this.frameRef}
                    className={`gh-cam-frame${s.src ? '' : ' gh-cam-noimg'}`}
                    role={clickable ? 'button' : 'img'}
                    tabIndex={clickable ? 0 : undefined}
                    aria-label={frameLabel || undefined}
                    onClick={clickable ? this.onOpen : undefined}
                    onKeyDown={clickable ? this.onFrameKey : undefined}
                >
                    {s.src ? (
                        <img
                            className="gh-cam-img"
                            src={s.src}
                            alt=""
                            draggable={false}
                            style={{ objectFit: fit }}
                        />
                    ) : (
                        this.renderEmpty(small)
                    )}
                    {!header && pills.length ? (
                        <div className="gh-cam-over">{GlashausCamera.renderPills(pills)}</div>
                    ) : null}
                    {s.src && isTrue(d.showTime, true) && s.at ? (
                        <span className="gh-cam-time">{this.timeText(s.at)}</span>
                    ) : null}
                </div>
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}
