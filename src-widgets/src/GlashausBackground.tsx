/* Background: the signature of the Glashaus look for a whole view. A huge word, and in front of it a line drawing
 * made of particles that move aside under the pointer and spring back. Motifs: house (with weather), energy,
 * heating, appliances, driveway, floor plan, an own image, or none. Stretch it over the view, behind all widgets. */
import React from 'react';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import GlashausWidget, { ADAPTER, SET_COLOR, isOid, isTrue } from './core/GlashausWidget';
import { clamp, toBool, toNum } from './core/format';
import { ensureWidgetCss } from './core/style';
import {
    artOpts,
    motifDraw,
    parseWeather,
    renderArt,
    renderImage,
    weatherOf,
    type ImageColors,
    type MotifName,
    type PlanFloor,
    type Weather,
} from './background/motifs';
import Sculpture, { type ArtSource, type Density } from './background/sculpture';

type Motif = MotifName | 'image' | 'none';

interface BackgroundRxData {
    motif: Motif;
    planFloor: PlanFloor;
    image: string;
    imageColors: ImageColors;
    text: string;
    showText: boolean | string;
    bandTop: number | string;
    bandBottom: number | string;
    bg: 'theme' | 'transparent' | 'custom';
    bgColor: string;
    weather: string;
    weatherOid: string;
    night: boolean | string;
    interactive: boolean | string;
    ambient: boolean | string;
    ambientStrength: number | string;
    density: Density;
    showHint: boolean | string;
    hint: string;
}

const MOTIFS: Motif[] = ['house', 'energy', 'heating', 'appliances', 'driveway', 'plan', 'image', 'none'];
const WEATHER_OPTIONS = ['none', 'auto', 'sun', 'fair', 'clouds', 'rain', 'storm', 'snow', 'fog', 'wind'];
/** Weather shown in the demo (weather "auto" without an object ID) */
const DEMO_WEATHER = 'fair';

const CSS = `
.gh-background{position:relative;overflow:hidden;transition:background-color .6s ease}
.gh-background-stage{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.gh-background-word{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);white-space:nowrap;user-select:none;
font-weight:600;letter-spacing:-.06em;line-height:.8;font-size:100px;color:color-mix(in srgb,var(--gh-fg) 7%,transparent)}
.gh-background-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.gh-background-hint{position:absolute;left:50%;top:60%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;
max-width:calc(100% - 32px);white-space:nowrap;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gh-fg);
opacity:.5;transition:opacity .8s ease}
.gh-background-hint>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.gh-background-hint::before{content:'';flex:none;width:6px;height:6px;border-radius:50%;background:currentColor;animation:gh-background-pulse 2.4s ease-in-out infinite}
.gh-background-hint[data-touched='1'],.gh-background-stage[data-static='1'] .gh-background-hint{opacity:0}
@keyframes gh-background-pulse{0%,100%{transform:scale(.6);opacity:.45}50%{transform:scale(1);opacity:1}}
`;

/** Loads an image; tries CORS first for other origins, so that it can be sampled into particles */
function loadImage(url: string): Promise<HTMLImageElement> {
    let cross = false;
    try {
        const u = new URL(url, window.location.href);
        cross = (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== window.location.origin;
    } catch {
        cross = false;
    }
    return new Promise((resolve, reject) => {
        const attempt = (cors: boolean): void => {
            const im = new Image();
            if (cors) {
                im.crossOrigin = 'anonymous';
            }
            im.decoding = 'async';
            im.onload = () => resolve(im);
            im.onerror = () => (cors ? attempt(false) : reject(new Error(`cannot load ${url}`)));
            im.src = url;
        };
        attempt(cross);
    });
}

/** Number attribute (also as string), limited to min..max */
const num = (v: unknown, def: number, min: number, max: number): number => clamp(toNum(v) ?? def, min, max);

const hideUnlessWeather = (data: WidgetData): boolean => !['house', 'driveway', undefined, ''].includes(data.motif);

export default class GlashausBackground extends GlashausWidget<BackgroundRxData> {
    private engine: Sculpture | null = null;

    private stageEl: HTMLDivElement | null = null;

    private wordEl: HTMLDivElement | null = null;

    private hintEl: HTMLDivElement | null = null;

    private layoutKey = '';

    constructor(props: VisRxWidgetProps) {
        super(props);
        ensureWidgetCss('background', CSS);
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplGlashausBackground',
            visSet: ADAPTER,
            visSetLabel: 'vis_2_widgets_glashaus',
            visSetColor: SET_COLOR,
            visSetIcon: `widgets/${ADAPTER}/img/vis-2-widgets-glashaus.svg`,
            visName: 'Background',
            visWidgetLabel: 'background_widget',
            visHelp: 'background_help',
            visOrder: 1,
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'motif',
                            label: 'bg_motif',
                            type: 'select',
                            options: MOTIFS.map(m => ({ value: m, label: `bg_motif_${m}` })),
                            default: 'house',
                        },
                        {
                            name: 'planFloor',
                            label: 'bg_floor',
                            type: 'select',
                            options: [
                                { value: 'basement', label: 'bg_floor_basement' },
                                { value: 'ground', label: 'bg_floor_ground' },
                                { value: 'upper', label: 'bg_floor_upper' },
                            ],
                            default: 'ground',
                            hidden: (data: WidgetData) => data.motif !== 'plan',
                        },
                        {
                            name: 'image',
                            label: 'bg_image',
                            type: 'image',
                            tooltip: 'bg_image_tip',
                            hidden: (data: WidgetData) => data.motif !== 'image',
                        },
                        {
                            name: 'imageColors',
                            label: 'bg_image_colors',
                            type: 'select',
                            options: [
                                { value: 'original', label: 'bg_colors_original' },
                                { value: 'ink', label: 'bg_colors_ink' },
                                { value: 'lines', label: 'bg_colors_lines' },
                            ],
                            default: 'original',
                            hidden: (data: WidgetData) => data.motif !== 'image',
                        },
                        { name: 'showText', label: 'bg_show_text', type: 'checkbox', default: true },
                        {
                            name: 'text',
                            label: 'bg_text',
                            tooltip: 'bg_text_tip',
                            hidden: (data: WidgetData) => !isTrue(data.showText, true),
                        },
                        {
                            name: 'bandTop',
                            label: 'bg_band_top',
                            type: 'slider',
                            min: 0,
                            max: 100,
                            step: 1,
                            default: 8,
                        },
                        {
                            name: 'bandBottom',
                            label: 'bg_band_bottom',
                            type: 'slider',
                            min: 0,
                            max: 100,
                            step: 1,
                            default: 58,
                        },
                        {
                            name: 'bg',
                            label: 'bg_background',
                            type: 'select',
                            options: [
                                { value: 'theme', label: 'bg_bg_theme' },
                                { value: 'transparent', label: 'bg_bg_transparent' },
                                { value: 'custom', label: 'bg_bg_custom' },
                            ],
                            default: 'theme',
                        },
                        {
                            name: 'bgColor',
                            label: 'bg_bg_color',
                            type: 'color',
                            hidden: (data: WidgetData) => data.bg !== 'custom',
                        },
                    ],
                },
                {
                    name: 'gh_bg_weather',
                    label: 'group_bg_weather',
                    hidden: hideUnlessWeather,
                    fields: [
                        {
                            name: 'weather',
                            label: 'bg_weather',
                            type: 'select',
                            tooltip: 'bg_weather_tip',
                            options: WEATHER_OPTIONS.map(w => ({ value: w, label: `bg_wx_${w}` })),
                            default: 'auto',
                        },
                        {
                            name: 'weatherOid',
                            label: 'bg_weather_oid',
                            type: 'id',
                            tooltip: 'bg_weather_oid_tip',
                            hidden: (data: WidgetData) => (data.weather || 'auto') !== 'auto',
                        },
                        {
                            name: 'night',
                            label: 'bg_night',
                            type: 'checkbox',
                            tooltip: 'bg_night_tip',
                            default: false,
                            noBinding: false,
                        },
                    ],
                },
                {
                    name: 'gh_bg_particles',
                    label: 'group_bg_particles',
                    hidden: (data: WidgetData) => data.motif === 'none',
                    fields: [
                        { name: 'interactive', label: 'bg_interactive', type: 'checkbox', default: true },
                        { name: 'ambient', label: 'bg_ambient', type: 'checkbox', default: false },
                        {
                            name: 'ambientStrength',
                            label: 'bg_ambient_strength',
                            type: 'slider',
                            min: 0.1,
                            max: 1,
                            step: 0.05,
                            default: 0.7,
                            hidden: (data: WidgetData) => !isTrue(data.ambient),
                        },
                        {
                            name: 'density',
                            label: 'bg_density',
                            type: 'select',
                            options: [
                                { value: 'low', label: 'bg_density_low' },
                                { value: 'normal', label: 'bg_density_normal' },
                                { value: 'high', label: 'bg_density_high' },
                            ],
                            default: 'normal',
                        },
                        {
                            name: 'showHint',
                            label: 'bg_show_hint',
                            type: 'checkbox',
                            default: true,
                            hidden: (data: WidgetData) => !isTrue(data.interactive, true),
                        },
                        {
                            name: 'hint',
                            label: 'bg_hint',
                            tooltip: 'bg_hint_tip',
                            hidden: (data: WidgetData) =>
                                !isTrue(data.interactive, true) || !isTrue(data.showHint, true),
                        },
                    ],
                },
                GlashausWidget.designGroup({ glass: false, rise: false }),
            ],
            visDefaultStyle: {
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                position: 'absolute',
                'z-index': 0,
            },
            visDefaultGrid: { columns: 'full', rows: 10 },
            visPrev: `widgets/${ADAPTER}/img/prev_background.png`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return GlashausBackground.getWidgetInfo();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: VisRxWidgetState): void {
        super.componentDidUpdate(prevProps, prevState);
        this.sync();
    }

    componentWillUnmount(): void {
        this.engine?.destroy();
        this.engine = null;
        super.componentWillUnmount();
    }

    /** Creates the engine when the stage appears, destroys it when the stage goes */
    private setStage = (el: HTMLDivElement | null): void => {
        if (el === this.stageEl) {
            return;
        }
        this.engine?.destroy();
        this.engine = null;
        this.stageEl = el;
        const canvas = el?.querySelector('canvas');
        if (el && canvas) {
            this.layoutKey = '';
            this.engine = new Sculpture({
                stage: el,
                canvas,
                word: () => this.wordEl,
                hint: () => this.hintEl,
            });
            this.sync();
        }
    };

    private setWord = (el: HTMLDivElement | null): void => {
        this.wordEl = el;
    };

    private setHint = (el: HTMLDivElement | null): void => {
        this.hintEl = el;
    };

    /** Weather of the drawing; `demo` when it comes from the demo instead of an object ID */
    private weather(): { wx: Weather | null; demo: boolean } {
        const d = this.state.rxData;
        const night = toBool(d.night);
        const sel = typeof d.weather === 'string' && d.weather ? d.weather.trim() : 'auto';
        if (sel === 'none') {
            return { wx: weatherOf(null, night), demo: false };
        }
        if (sel === 'auto') {
            if (!isOid(d.weatherOid)) {
                return { wx: weatherOf(DEMO_WEATHER, night), demo: true };
            }
            return { wx: weatherOf(parseWeather(this.ghVal(d.weatherOid)), night), demo: false };
        }
        return { wx: weatherOf(parseWeather(sel), night), demo: false };
    }

    private motif(): Motif {
        const m = this.state.rxData.motif;
        return MOTIFS.includes(m) ? m : 'house';
    }

    /** Color that covers lines behind clouds etc.: the background, or the theme color when transparent */
    private coverColor(): string | undefined {
        const d = this.state.rxData;
        if (d.bg === 'custom' && typeof d.bgColor === 'string' && d.bgColor) {
            return d.bgColor;
        }
        return undefined;
    }

    private imageUrl(): string {
        const src = this.state.rxData.image;
        if (typeof src !== 'string' || !src.trim()) {
            return '';
        }
        if (src.startsWith('_PRJ_NAME/')) {
            const c = this.props.context;
            return src.replace(
                '_PRJ_NAME/',
                `../${c?.adapterName || 'vis-2'}.${c?.instance || 0}/${c?.projectName || 'main'}/`,
            );
        }
        return src.trim();
    }

    /** The drawing for the engine (a new key = new particles) */
    private artSource(): ArtSource | null {
        const d = this.state.rxData;
        const motif = this.motif();
        if (motif === 'none') {
            return null;
        }
        const dark = this.ghDark();
        const o = artOpts(dark, this.coverColor());
        if (motif === 'image') {
            const url = this.imageUrl();
            if (!url) {
                return null;
            }
            const mode: ImageColors = d.imageColors === 'ink' || d.imageColors === 'lines' ? d.imageColors : 'original';
            return {
                key: `image|${url}|${mode}|${mode === 'original' ? '' : o.ink}`,
                render: () => loadImage(url).then(im => renderImage(im, mode, o)),
                fit: true,
            };
        }
        const wx = motif === 'house' || motif === 'driveway' ? this.weather().wx : null;
        const floor: PlanFloor = d.planFloor === 'basement' || d.planFloor === 'upper' ? d.planFloor : 'ground';
        const draw = motifDraw(motif, { weather: wx, floor });
        return {
            key: `${motif}|${motif === 'plan' ? floor : ''}|${wx ? JSON.stringify(wx) : ''}|${o.ink}|${o.bg}`,
            render: mobile => renderArt(draw, o, mobile),
        };
    }

    private word(): string {
        const d = this.state.rxData;
        if (typeof d.text === 'string' && d.text.trim()) {
            return d.text.trim();
        }
        const m = this.motif();
        return GlashausWidget.tr(`bg_word_${m === 'image' || m === 'none' ? 'house' : m}`);
    }

    private hintText(): string {
        const d = this.state.rxData;
        if (typeof d.hint === 'string' && d.hint.trim()) {
            return d.hint.trim();
        }
        const coarse = !!window.matchMedia?.('(hover: none), (pointer: coarse)').matches;
        return GlashausWidget.tr(coarse ? 'bg_hint_touch' : 'bg_hint_default');
    }

    /** Hands the current attributes to the engine */
    private sync(): void {
        const e = this.engine;
        if (!e) {
            return;
        }
        const d = this.state.rxData;
        const edit = !!this.props.editMode;
        const density: Density = d.density === 'low' || d.density === 'high' ? d.density : 'normal';
        e.set({
            bandTop: num(d.bandTop, 8, 0, 100) / 100,
            bandBottom: num(d.bandBottom, 58, 0, 100) / 100,
            interactive: isTrue(d.interactive, true) && !edit,
            ambient: isTrue(d.ambient) && !edit ? num(d.ambientStrength, 0.7, 0.1, 1) : 0,
            density,
        });
        e.setArt(this.artSource());
        const key = `${isTrue(d.showText, true) ? this.word() : ''}|${this.hintEl ? this.hintText() : ''}`;
        if (key !== this.layoutKey) {
            this.layoutKey = key;
            e.place();
        }
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        this.ghRenderStart(props);
        const d = this.state.rxData;
        const motif = this.motif();
        const showText = isTrue(d.showText, true);
        // also in the editor (where nothing reacts to the pointer), so that the view looks like at runtime
        const showHint = isTrue(d.interactive, true) && isTrue(d.showHint, true) && motif !== 'none';
        const background =
            d.bg === 'transparent'
                ? 'transparent'
                : d.bg === 'custom' && typeof d.bgColor === 'string' && d.bgColor
                  ? d.bgColor
                  : 'var(--gh-bg)';
        const demo = (motif === 'house' || motif === 'driveway') && this.weather().demo;

        return (
            <div
                className={this.ghClass('gh-background', { tile: false })}
                style={{ background }}
            >
                <div
                    className="gh-background-stage"
                    ref={this.setStage}
                    aria-hidden="true"
                >
                    {showText ? (
                        <div
                            className="gh-background-word"
                            ref={this.setWord}
                        >
                            {this.word()}
                        </div>
                    ) : null}
                    <canvas className="gh-background-canvas" />
                    {showHint ? (
                        <div
                            className="gh-background-hint"
                            ref={this.setHint}
                        >
                            <span>{this.hintText()}</span>
                        </div>
                    ) : null}
                </div>
                {this.ghDemoBadge(demo)}
            </div>
        );
    }
}
