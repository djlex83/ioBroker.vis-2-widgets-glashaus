/* Shared building blocks of the Glashaus widgets: icon, animated number, ring, line chart, bar chart */
import React from 'react';

import { ICONS } from './icons';
import { fmtNum, fmtTime, fmtDate } from './format';

const reducedMotion = (): boolean => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------- Icon ---------- */

export interface GhIconProps {
    /** Name from ICONS, or an image URL / data URI (e.g. from the vis-2 icon picker) */
    name?: string;
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}

/** Glashaus line icon. Falls back to an <img> when `name` is a URL or data URI. */
export function GhIcon({ name, size, className, style }: GhIconProps): React.JSX.Element | null {
    if (!name) {
        return null;
    }
    if (/^(data:|https?:|\/|\.\/)/.test(name) || name.includes('.svg') || name.includes('.png')) {
        return (
            <img
                src={name}
                alt=""
                className={className}
                style={{ width: size || 19, height: size || 19, objectFit: 'contain', ...style }}
            />
        );
    }
    const d = ICONS[name];
    if (!d) {
        return null;
    }
    return (
        <svg
            viewBox={d.viewBox || '0 0 24 24'}
            fill={d.fill || 'none'}
            stroke={d.stroke || 'currentColor'}
            strokeWidth={d['stroke-width']}
            strokeLinecap={d['stroke-linecap'] as React.SVGAttributes<SVGElement>['strokeLinecap']}
            strokeLinejoin={d['stroke-linejoin'] as React.SVGAttributes<SVGElement>['strokeLinejoin']}
            className={className}
            style={size ? { width: size, height: size, ...style } : style}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: d.inner }}
        />
    );
}

/** Icon in a tinted rounded square (`--gh-c` sets the tint) */
export function GhIconBox({ name, color }: { name?: string; color?: string }): React.JSX.Element | null {
    if (!name) {
        return null;
    }
    return (
        <span
            className="gh-ico"
            style={color ? ({ '--gh-c': color } as React.CSSProperties) : undefined}
        >
            <GhIcon name={name} />
        </span>
    );
}

/* ---------- Animated number ---------- */

export interface GhNumberProps {
    value: number | null | undefined;
    dec?: number;
    lang?: string;
    /** Animation time in ms */
    ms?: number;
}

/** Number that counts smoothly to its new value */
export function GhNumber({ value, dec = 0, lang, ms = 900 }: GhNumberProps): React.JSX.Element {
    const [shown, setShown] = React.useState<number | null | undefined>(value);
    const from = React.useRef<number | null | undefined>(value);
    const raf = React.useRef(0);

    React.useEffect(() => {
        const start = from.current;
        if (value === null || value === undefined || start === null || start === undefined || reducedMotion()) {
            from.current = value;
            setShown(value);
            return undefined;
        }
        const t0 = performance.now();
        const step = (now: number): void => {
            const p = Math.min(1, (now - t0) / ms);
            const e = 1 - Math.pow(1 - p, 3);
            const v = start + (value - start) * e;
            from.current = v;
            setShown(v);
            if (p < 1) {
                raf.current = requestAnimationFrame(step);
            }
        };
        cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf.current);
    }, [value, ms]);

    return <span className="gh-num">{fmtNum(shown, dec, lang)}</span>;
}

/* ---------- Ring ---------- */

export interface GhRingProps {
    /** 0..1 */
    value: number | null;
    /** Diameter in px, or any CSS length (e.g. 'min(100cqw, 100cqh)') */
    size?: number | string;
    stroke?: number;
    color?: string;
    children?: React.ReactNode;
}

/** Circular progress ring with content in the middle */
export function GhRing({ value, size = 64, stroke = 6, color, children }: GhRingProps): React.JSX.Element {
    const r = 50 - stroke / 2 - 1;
    const c = 2 * Math.PI * r;
    const p = value === null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(1, value));
    return (
        <div
            className="gh-ring"
            style={{ '--gh-sz': typeof size === 'number' ? `${size}px` : size, '--gh-c': color } as React.CSSProperties}
        >
            <svg viewBox="0 0 100 100">
                <circle
                    className="bg"
                    cx="50"
                    cy="50"
                    r={r}
                    strokeWidth={stroke}
                />
                <circle
                    className="fg"
                    cx="50"
                    cy="50"
                    r={r}
                    strokeWidth={stroke}
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - p)}
                />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                {children}
            </div>
        </div>
    );
}

/* ---------- Line chart ---------- */

export interface GhSeries {
    /** Points [timestamp ms, value] sorted by time */
    pts: [number, number][];
    color: string;
    label?: string;
    /** Fill the area under the line */
    fill?: boolean;
    dash?: boolean;
    /** Draw as steps (e.g. on/off states) */
    step?: boolean;
}

export interface GhSparkProps {
    series: GhSeries[];
    unit?: string;
    dec?: number;
    lang?: string;
    /** Time range; default: from the data */
    from?: number;
    to?: number;
    /** Include 0 in the value range */
    zero?: boolean;
    min?: number;
    max?: number;
    /** Show min/max and time labels */
    labels?: boolean;
    height?: number | string;
    /** Message when there are no points */
    empty?: string;
}

const VB_W = 1000;
const VB_H = 300;

/** Line chart with hover read-out. Width follows the container, height from `height` or the parent. */
export function GhSpark(p: GhSparkProps): React.JSX.Element {
    const ref = React.useRef<HTMLDivElement>(null);
    const [hover, setHover] = React.useState<number | null>(null);
    const all = p.series.flatMap(s => s.pts);

    if (!all.length) {
        return (
            <div
                className="gh-spark gh-muted gh-small"
                style={{ height: p.height || '100%', display: 'grid', placeItems: 'center' }}
            >
                {p.empty || '–'}
            </div>
        );
    }

    const t0 = p.from ?? Math.min(...all.map(q => q[0]));
    const t1 = p.to ?? Math.max(...all.map(q => q[0]));
    let lo = p.min ?? Math.min(...all.map(q => q[1]));
    let hi = p.max ?? Math.max(...all.map(q => q[1]));
    if (p.zero) {
        lo = Math.min(lo, 0);
        hi = Math.max(hi, 0);
    }
    if (hi - lo < 1e-9) {
        hi = lo + 1;
    }
    const pad = (hi - lo) * 0.08;
    const y0 = p.min ?? lo - (p.zero && lo === 0 ? 0 : pad);
    const y1 = p.max ?? hi + pad;
    const X = (t: number): number => ((t - t0) / Math.max(1, t1 - t0)) * VB_W;
    const Y = (v: number): number => VB_H - ((v - y0) / (y1 - y0)) * VB_H;
    // area fill down to 0, but never outside the plot (all values below or above 0)
    const base = Y(Math.min(Math.max(0, y0), y1)).toFixed(1);

    const path = (s: GhSeries): string => {
        let d = '';
        s.pts.forEach(([t, v], i) => {
            const x = X(t).toFixed(1);
            const y = Y(v).toFixed(1);
            if (!i) {
                d += `M${x} ${y}`;
            } else if (s.step) {
                d += `H${x}V${y}`;
            } else {
                d += `L${x} ${y}`;
            }
        });
        return d;
    };

    const hoverT = hover === null ? null : t0 + (hover / VB_W) * (t1 - t0);
    const nearest = (s: GhSeries): [number, number] | null => {
        if (hoverT === null || !s.pts.length) {
            return null;
        }
        let best = s.pts[0];
        for (const q of s.pts) {
            if (Math.abs(q[0] - hoverT) < Math.abs(best[0] - hoverT)) {
                best = q;
            }
        }
        return best;
    };
    const span = t1 - t0;
    const tLabel = (t: number): string => {
        if (span > 3 * 86400000) {
            return fmtDate(t, p.lang, { day: 'numeric', month: 'short' });
        }
        if (span > 18 * 3600000) {
            return `${fmtDate(t, p.lang, { weekday: 'short' })} ${fmtTime(t, p.lang)}`;
        }
        return fmtTime(t, p.lang);
    };
    const labels = p.labels !== false;
    const fmtV = (v: number): string => fmtNum(v, Math.min(p.dec ?? 0, Math.abs(hi - lo) >= 10 ? 0 : 1), p.lang);
    const gutterR = labels ? Math.max(fmtV(hi).length, fmtV(lo).length) * 7 + 10 : 0;
    const gutterB = labels ? 16 : 0;

    const onMove = (e: React.PointerEvent): void => {
        const r = ref.current?.getBoundingClientRect();
        if (r && r.width) {
            const pw = Math.max(1, r.width - gutterR);
            setHover(Math.max(0, Math.min(VB_W, ((e.clientX - r.left) / pw) * VB_W)));
        }
    };

    const first = hover !== null ? nearest(p.series[0]) : null;

    return (
        <div
            ref={ref}
            className="gh-spark"
            style={{ height: p.height || '100%' }}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
        >
            <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                preserveAspectRatio="none"
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: `calc(100% - ${gutterR}px)`,
                    height: `calc(100% - ${gutterB}px)`,
                }}
            >
                {p.zero && y0 < 0 && y1 > 0 ? (
                    <line
                        className="ax"
                        x1="0"
                        x2={VB_W}
                        y1={Y(0)}
                        y2={Y(0)}
                    />
                ) : null}
                {p.series.map((s, i) =>
                    s.fill && s.pts.length ? (
                        <path
                            key={`a${i}`}
                            className="ar"
                            d={`${path(s)}L${X(s.pts[s.pts.length - 1][0]).toFixed(1)} ${base}L${X(s.pts[0][0]).toFixed(1)} ${base}Z`}
                            fill={s.color}
                            opacity={0.12}
                        />
                    ) : null,
                )}
                {p.series.map((s, i) => (
                    <path
                        key={`l${i}`}
                        className="ln"
                        d={path(s)}
                        stroke={s.color}
                        strokeDasharray={s.dash ? '6 6' : undefined}
                    />
                ))}
                {hover !== null && first ? (
                    <line
                        className="cur"
                        x1={X(first[0])}
                        x2={X(first[0])}
                        y1="0"
                        y2={VB_H}
                    />
                ) : null}
            </svg>
            {labels ? (
                <>
                    <span
                        className="lbl"
                        style={{ right: 0, top: -2 }}
                    >
                        {fmtV(hi)}
                    </span>
                    <span
                        className="lbl"
                        style={{ right: 0, bottom: gutterB - 4 }}
                    >
                        {fmtV(lo)}
                    </span>
                    <span
                        className="lbl"
                        style={{ left: 0, bottom: -3 }}
                    >
                        {tLabel(t0)}
                    </span>
                    <span
                        className="lbl"
                        style={{ right: gutterR, bottom: -3 }}
                    >
                        {tLabel(t1)}
                    </span>
                </>
            ) : null}
            {hover !== null && first ? (
                <span
                    className="tip"
                    style={{
                        // keep the read-out inside the card: anchor left/right in the outer quarters
                        ['--gh-tip-x' as string]:
                            X(first[0]) < VB_W * 0.25 ? '-12%' : X(first[0]) > VB_W * 0.75 ? '-88%' : '-50%',
                        left: `calc(${(X(first[0]) / VB_W).toFixed(4)} * (100% - ${gutterR}px))`,
                        top: `calc(${(Y(first[1]) / VB_H).toFixed(4)} * (100% - ${gutterB}px))`,
                    }}
                >
                    {tLabel(first[0])} ·{' '}
                    {p.series
                        .map(s => nearest(s))
                        .map((q, i) =>
                            q
                                ? `${p.series[i].label ? `${p.series[i].label} ` : ''}${fmtNum(q[1], p.dec ?? 0, p.lang)}`
                                : '',
                        )
                        .filter(Boolean)
                        .join(' · ')}
                    {p.unit ? ` ${p.unit}` : ''}
                </span>
            ) : null}
        </div>
    );
}

/* ---------- Bar chart ---------- */

export interface GhBarsProps {
    bars: { l: string; v: number | null }[];
    color?: string;
    unit?: string;
    dec?: number;
    lang?: string;
    /** Show the values above the bars */
    values?: boolean;
}

/** Simple column chart with labels below and values above */
export function GhBars({ bars, color, dec = 0, lang, values = true }: GhBarsProps): React.JSX.Element {
    const max = Math.max(1e-9, ...bars.map(b => b.v || 0));
    return (
        <div
            className="gh-bars"
            style={color ? ({ '--gh-c': color } as React.CSSProperties) : undefined}
        >
            {bars.map((b, i) => (
                <div
                    className="bar"
                    key={i}
                    title={`${b.l}: ${fmtNum(b.v, dec, lang)}`}
                >
                    {values ? <span className="v">{b.v === null ? '' : fmtNum(b.v, dec, lang)}</span> : null}
                    <span
                        className="col"
                        style={{ height: `${((b.v || 0) / max) * 100}%` }}
                    />
                    <span className="l">{b.l}</span>
                </div>
            ))}
        </div>
    );
}

/* ---------- Status pill ---------- */

export type GhPillKind = 'ok' | 'warn' | 'crit' | 'info' | 'idle';

export function GhPill({
    kind = 'idle',
    live,
    color,
    children,
}: {
    kind?: GhPillKind;
    live?: boolean;
    /** Own color instead of the kind color (e.g. an accent like var(--gh-sun)) */
    color?: string;
    children: React.ReactNode;
}): React.JSX.Element {
    return (
        <span
            className={`gh-pill ${kind}${live ? ' live' : ''}`}
            style={color ? ({ '--gh-c': color } as React.CSSProperties) : undefined}
        >
            <span className="gh-pill-t">{children}</span>
        </span>
    );
}
