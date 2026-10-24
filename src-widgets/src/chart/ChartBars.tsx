/* Column chart of GlashausChart: the look of GhBars (rounded columns, values above, labels below), extended by
 * several series side by side, negative values, thinned labels for many bars and a read-out on hover, touch
 * or keyboard (arrow keys, Home, End, Escape). */
import React from 'react';

import { clamp, fmtNum } from '../core/format';

export interface BarSeries {
    label?: string;
    color: string;
    vals: (number | null)[];
}

export interface ChartBarsProps {
    /** Short label under every bar */
    labels: string[];
    /** Long label for the read-out */
    tips: string[];
    series: BarSeries[];
    /** Size of the plot in px (from the ResizeObserver of the widget) */
    width: number;
    height: number;
    dec: number;
    unit?: string;
    lang?: string;
    /** Show the values above the bars when there is room */
    values?: boolean;
    empty?: string;
    /** Read-out with the keyboard (off in the editor) */
    keyboard?: boolean;
    /** Accessible name of the chart */
    label?: string;
}

const LABEL_W = 38;
const LABEL_H = 18;
/** A tapped read-out (touch) stays this long */
const TOUCH_MS = 2500;
/** Distance of the read-out to the card edge (px) */
const TIP_MARGIN = 6;

/** Grouped columns with read-out */
export function ChartBars(p: ChartBarsProps): React.JSX.Element {
    const [hover, setHover] = React.useState<number | null>(null);
    const touchTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const areaRef = React.useRef<HTMLDivElement>(null);
    const tipRef = React.useRef<HTMLSpanElement>(null);
    React.useEffect(() => () => clearTimeout(touchTimer.current), []);
    const n = p.labels.length;
    // the number of bars can shrink while a bar is hovered
    const cur = hover !== null && hover < n ? hover : null;

    // the read-out sits above the hovered columns and stays inside the card (measured, so that it also works
    // in a scaled vis-2 view); its anchor comes from data-* attributes set while rendering
    React.useLayoutEffect(() => {
        const tip = tipRef.current;
        const area = areaRef.current;
        if (!tip || !area) {
            return;
        }
        const a = area.getBoundingClientRect();
        const scale = a.width / (area.offsetWidth || 1) || 1;
        const card = (area.closest('.gh') || area).getBoundingClientRect();
        const t = tip.getBoundingClientRect();
        const m = TIP_MARGIN * scale;
        const cx = a.left + Number(tip.dataset.x) * a.width;
        const left =
            t.width > card.width - 2 * m
                ? card.left + (card.width - t.width) / 2
                : clamp(cx - t.width / 2, card.left + m, card.right - m - t.width);
        const above = a.bottom - Number(tip.dataset.y) * a.height - Number(tip.dataset.gap) * scale - t.height;
        const top = Math.max(above, card.top + m);
        tip.style.left = `${(left - a.left) / scale}px`;
        tip.style.top = `${(top - a.top) / scale}px`;
    });

    const all = p.series.flatMap(s => s.vals).filter((v): v is number => v !== null && Number.isFinite(v));
    if (!n || !all.length) {
        return <div className="gh-chart-empty gh-muted gh-small">{p.empty || '–'}</div>;
    }

    const lo = Math.min(0, ...all);
    let hi = Math.max(0, ...all);
    if (hi - lo < 1e-9) {
        hi = lo + 1;
    }
    const span = hi - lo;
    const zero = (-lo / span) * 100;
    const slotW = p.width / n;
    const sc = p.series.length;
    const autoDec = Math.abs(hi) >= 100 || Math.abs(lo) >= 100 ? 0 : p.dec;
    const sampleLen = fmtNum(hi, autoDec, p.lang).length;
    const showVals = p.values !== false && slotW >= Math.max(22, sc * (sampleLen * 6.2 + 4)) && p.height >= 90;
    const every = Math.max(1, Math.ceil(LABEL_W / Math.max(1, slotW)));
    const showLabels = p.height >= 60;
    const unit = p.unit ? ` ${p.unit}` : '';

    const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
        clearTimeout(touchTimer.current);
        const r = e.currentTarget.getBoundingClientRect();
        if (r.width) {
            setHover(clamp(Math.floor(((e.clientX - r.left) / r.width) * n), 0, n - 1));
        }
    };
    // a finger leaves right after the tap: keep the read-out for a moment
    const onLeave = (e: React.PointerEvent<HTMLDivElement>): void => {
        clearTimeout(touchTimer.current);
        if (e.pointerType === 'touch') {
            touchTimer.current = setTimeout(() => setHover(null), TOUCH_MS);
        } else {
            setHover(null);
        }
    };
    const onKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
        let next: number | null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            const dir = e.key === 'ArrowRight' ? 1 : -1;
            next = cur === null ? (dir > 0 ? 0 : n - 1) : clamp(cur + dir, 0, n - 1);
        } else if (e.key === 'Home' || e.key === 'End') {
            next = e.key === 'Home' ? 0 : n - 1;
        } else if (e.key === 'Escape') {
            next = null;
        } else {
            return;
        }
        e.preventDefault();
        clearTimeout(touchTimer.current);
        setHover(next);
    };

    let tip: React.JSX.Element | null = null;
    if (cur !== null) {
        const vals = p.series.map(s => s.vals[cur]);
        const top = Math.max(...vals.map(v => (v === null ? zero : ((Math.max(v, 0) - lo) / span) * 100)));
        tip = (
            <span
                ref={tipRef}
                className={`gh-chart-tip${sc > 1 ? ' multi' : ''}`}
                data-x={(cur + 0.5) / n}
                data-y={top / 100}
                data-gap={showVals ? 20 : 8}
            >
                {sc > 1 ? (
                    <>
                        <span>{p.tips[cur]}</span>
                        {p.series.map((s, i) => (
                            <span
                                key={i}
                                className="gh-chart-tip-r"
                                style={{ '--gh-c': s.color } as React.CSSProperties}
                            >
                                <i />
                                {s.label ? `${s.label} ` : ''}
                                <b>{fmtNum(vals[i], p.dec, p.lang)}</b>
                                {unit}
                            </span>
                        ))}
                    </>
                ) : (
                    `${p.tips[cur]} · ${fmtNum(vals[0], p.dec, p.lang)}${unit}`
                )}
            </span>
        );
    }

    return (
        <div className="gh-chart-bars">
            <div
                ref={areaRef}
                className={`gh-chart-area${cur !== null ? ' gh-chart-hov' : ''}`}
                style={{ marginTop: showVals ? 16 : 4 }}
                role="group"
                aria-label={p.label}
                tabIndex={p.keyboard ? 0 : undefined}
                onPointerDown={onMove}
                onPointerMove={onMove}
                onPointerLeave={onLeave}
                onKeyDown={p.keyboard ? onKey : undefined}
                onBlur={() => setHover(null)}
            >
                {lo < 0 ? (
                    <span
                        className="gh-chart-zero"
                        style={{ bottom: `${zero}%` }}
                    />
                ) : null}
                {p.labels.map((_l, b) => (
                    <div
                        className={`gh-chart-slot${cur === b ? ' on' : ''}`}
                        key={b}
                        style={{ padding: `0 ${Math.min(3, slotW * 0.12)}px` }}
                    >
                        {p.series.map((s, i) => {
                            const v = s.vals[b];
                            if (v === null || !Number.isFinite(v)) {
                                return (
                                    <div
                                        className="gh-chart-cw"
                                        key={i}
                                    />
                                );
                            }
                            const h = (Math.abs(v) / span) * 100;
                            const neg = v < 0;
                            return (
                                <div
                                    className="gh-chart-cw"
                                    key={i}
                                >
                                    <span
                                        className={`gh-chart-col${neg ? ' neg' : ''}`}
                                        style={{
                                            background: s.color,
                                            height: `max(2px, ${h.toFixed(3)}%)`,
                                            ...(neg ? { top: `${100 - zero}%` } : { bottom: `${zero}%` }),
                                            animationDelay: `${Math.min(600, b * (600 / n)).toFixed(0)}ms`,
                                        }}
                                    />
                                    {showVals ? (
                                        <span
                                            className="gh-chart-v"
                                            style={
                                                neg
                                                    ? { top: `calc(${(100 - zero + h).toFixed(3)}% + 2px)` }
                                                    : { bottom: `calc(${(zero + h).toFixed(3)}% + 2px)` }
                                            }
                                        >
                                            {fmtNum(v, autoDec, p.lang)}
                                        </span>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                ))}
                {tip}
            </div>
            {showLabels ? (
                <div
                    className="gh-chart-labels"
                    style={{ height: LABEL_H }}
                >
                    {p.labels.map((l, b) => (
                        <span
                            key={b}
                            className={cur === b ? 'on' : undefined}
                        >
                            {(n - 1 - b) % every === 0 ? l : ''}
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
