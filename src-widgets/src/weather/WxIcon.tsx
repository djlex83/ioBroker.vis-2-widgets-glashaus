/* Animated weather icon of GlashausWeather in the Glashaus line style: inline SVG, colors from the theme tokens,
 * motion only by CSS (sun rays turn, clouds drift, drops and flakes fall, lightning flickers, fog and wind move).
 * With `animate={false}` it is a static mini icon (forecast cards). */
import React from 'react';

import { artOf, type WxKind } from './conditions';

export interface WxIconProps {
    kind: WxKind;
    night?: boolean;
    size: number;
    animate?: boolean;
}

/** Cloud outline in its own box: x 4.4..43, y 3.1..26 */
const CLOUD = 'M10 26H36A7 7 0 0 0 37 12.1A11 11 0 0 0 16 10A8 8 0 0 0 10 26Z';
const CB = { x: 4.4, y: 3.1, w: 38.6 };

interface Box {
    x: number;
    y: number;
    w: number;
}

function Cloud({ box, dark, sw, cls }: { box: Box; dark?: boolean; sw: number; cls: string }): React.JSX.Element {
    const k = box.w / CB.w;
    return (
        <g
            transform={`translate(${(box.x - CB.x * k).toFixed(2)} ${(box.y - CB.y * k).toFixed(2)}) scale(${k.toFixed(4)})`}
        >
            <g className={cls}>
                <path
                    d={CLOUD}
                    fill={dark ? 'var(--gh-wx-cloud-dark)' : 'var(--gh-wx-cloud)'}
                    stroke="var(--gh-fg)"
                    strokeOpacity={0.88}
                    strokeWidth={sw}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                />
            </g>
        </g>
    );
}

function Sun({ cx, cy, r, sw }: { cx: number; cy: number; r: number; sw: number }): React.JSX.Element {
    const rays: React.JSX.Element[] = [];
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r0 = r + 3.2;
        const r1 = r + (i % 2 ? 6.2 : 8);
        rays.push(
            <line
                key={i}
                x1={(cx + Math.cos(a) * r0).toFixed(2)}
                y1={(cy + Math.sin(a) * r0).toFixed(2)}
                x2={(cx + Math.cos(a) * r1).toFixed(2)}
                y2={(cy + Math.sin(a) * r1).toFixed(2)}
            />,
        );
    }
    return (
        <g>
            <g
                className="gh-wx-rays"
                style={{ transformOrigin: `${cx}px ${cy}px` }}
                stroke="var(--gh-sun)"
                strokeWidth={sw}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
            >
                {rays}
            </g>
            <circle
                className="gh-wx-core"
                cx={cx}
                cy={cy}
                r={r}
                fill="var(--gh-sun)"
            />
        </g>
    );
}

function Moon({ cx, cy, r, stars }: { cx: number; cy: number; r: number; stars: boolean }): React.JSX.Element {
    const s = r / 9;
    const p = (x: number, y: number): string => `${(cx + x * s).toFixed(2)} ${(cy + y * s).toFixed(2)}`;
    const d = `M${p(9, 0.79)}A${(9 * s).toFixed(2)} ${(9 * s).toFixed(2)} 0 1 1 ${p(-0.79, -9)}A${(7 * s).toFixed(2)} ${(7 * s).toFixed(2)} 0 0 0 ${p(9, 0.79)}Z`;
    const star = (x: number, y: number, k: number, i: number): React.JSX.Element => (
        <path
            key={i}
            className="gh-wx-star"
            style={{ animationDelay: `${-i * 0.8}s` }}
            d={`M${x} ${y - k}Q${x} ${y} ${x + k} ${y}Q${x} ${y} ${x} ${y + k}Q${x} ${y} ${x - k} ${y}Q${x} ${y} ${x} ${y - k}Z`}
            fill="var(--gh-wx-moon)"
        />
    );
    return (
        <g>
            {stars
                ? [
                      star(cx + r + 9, cy - r + 1, 2.6, 0),
                      star(cx + r + 4, cy + r - 2, 1.8, 1),
                      star(cx - r + 1, cy - r - 4, 2, 2),
                  ]
                : null}
            <g
                className="gh-wx-moon"
                style={{ transformOrigin: `${cx}px ${cy}px` }}
            >
                <path
                    d={d}
                    fill="var(--gh-wx-moon)"
                />
            </g>
        </g>
    );
}

/** Weather icon, 64×64 view box scaled to `size` */
export function WxIcon({ kind, night, size, animate = true }: WxIconProps): React.JSX.Element {
    const a = artOf(kind);
    const sw = Math.max(1.2, Math.min(3.2, size / 34));
    const precip = !!(a.rain || a.snow || a.hail || a.bolt);
    const parts: React.JSX.Element[] = [];

    // Sky: sun or moon, full (alone / with a small cloud) or peeking behind a cloud
    if (a.sky) {
        let cx = 32;
        let cy = 32;
        let r = night ? 13 : 11;
        if (a.sky === 'full' && a.clouds) {
            cx = 27;
            cy = 27;
            r = night ? 12 : 10;
        } else if (a.sky === 'peek') {
            cx = precip ? 21 : 24;
            cy = precip ? 16 : 22;
            r = night ? 9.5 : 8.5;
        }
        parts.push(
            night ? (
                <Moon
                    key="sky"
                    cx={cx}
                    cy={cy}
                    r={r}
                    stars={!a.clouds || a.sky === 'full'}
                />
            ) : (
                <Sun
                    key="sky"
                    cx={cx}
                    cy={cy}
                    r={r}
                    sw={sw}
                />
            ),
        );
    }

    // Clouds
    if (a.clouds === 2) {
        parts.push(
            <Cloud
                key="c2"
                box={{ x: 24, y: 12, w: 34 }}
                sw={sw}
                cls="gh-wx-drift2"
            />,
            <Cloud
                key="c1"
                box={{ x: 5, y: 25, w: 44 }}
                dark={a.dark}
                sw={sw}
                cls="gh-wx-drift"
            />,
        );
    } else if (a.clouds === 1) {
        let box: Box;
        if (a.sky === 'full') {
            box = { x: 30, y: 35, w: 29 };
        } else if (precip) {
            box = a.sky ? { x: 13, y: 13, w: 45 } : { x: 9, y: 8, w: 46 };
        } else if (a.wind || a.fog) {
            box = { x: 14, y: 5, w: 37 };
        } else {
            box = { x: 13, y: 26, w: 46 };
        }
        parts.push(
            <Cloud
                key="c1"
                box={box}
                dark={a.dark}
                sw={sw}
                cls="gh-wx-drift"
            />,
        );
    }

    // Precipitation below the cloud
    const top = a.sky ? 44 : 39;
    if (a.rain) {
        const n = a.rain === 3 ? 6 : a.rain === 2 ? 4 : 3;
        const len = a.rain === 1 ? 4 : a.rain === 3 ? 8 : 6.5;
        const xs = a.snow ? [22, 40] : Array.from({ length: n }, (_v, i) => 19 + (i * 26) / Math.max(1, n - 1));
        xs.forEach((x, i) => {
            const y = top + (i % 2 ? 5 : 0);
            parts.push(
                <line
                    key={`r${i}`}
                    className="gh-wx-drop"
                    style={{ animationDelay: `${(-i * 0.37) % 1.1}s` }}
                    x1={x}
                    y1={y}
                    x2={x - len * 0.38}
                    y2={y + len}
                    stroke="var(--gh-cool)"
                    strokeWidth={sw}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />,
            );
        });
    }
    if (a.snow) {
        const xs = a.rain ? [31, 49] : [20, 32, 44, 26, 38];
        xs.forEach((x, i) => {
            const y = top + 2 + (i >= 3 ? 9 : i % 2 ? 5 : 0);
            const k = 3.1;
            parts.push(
                <g
                    key={`s${i}`}
                    className="gh-wx-flake"
                    style={{ animationDelay: `${-i * 0.9}s` }}
                    stroke="var(--gh-wx-snow)"
                    strokeWidth={Math.max(1, sw * 0.8)}
                    strokeLinecap="round"
                >
                    {[0, 60, 120].map(deg => {
                        const r = (deg * Math.PI) / 180;
                        return (
                            <line
                                key={deg}
                                x1={(x - Math.cos(r) * k).toFixed(2)}
                                y1={(y - Math.sin(r) * k).toFixed(2)}
                                x2={(x + Math.cos(r) * k).toFixed(2)}
                                y2={(y + Math.sin(r) * k).toFixed(2)}
                                vectorEffect="non-scaling-stroke"
                            />
                        );
                    })}
                </g>,
            );
        });
    }
    if (a.hail) {
        [20, 30, 44, 25, 39].forEach((x, i) => {
            parts.push(
                <circle
                    key={`h${i}`}
                    className="gh-wx-hail"
                    style={{ animationDelay: `${-i * 0.23}s` }}
                    cx={x}
                    cy={top + 2 + (i >= 3 ? 9 : i % 2 ? 4 : 0)}
                    r={2.3}
                    fill="var(--gh-wx-snow)"
                    stroke="var(--gh-fg-2)"
                    strokeWidth={Math.max(1, sw * 0.7)}
                    vectorEffect="non-scaling-stroke"
                />,
            );
        });
    }
    if (a.bolt) {
        parts.push(
            <path
                key="bolt"
                className="gh-wx-bolt"
                d="M35 33L27.5 46.5H33.5L29.5 60.5L42 43H35.5L39.5 33Z"
                fill="var(--gh-sun)"
                stroke="var(--gh-fg)"
                strokeOpacity={0.85}
                strokeWidth={Math.max(1, sw * 0.8)}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />,
        );
    }

    // Fog and wind lines
    if (a.fog) {
        [
            [12, 50, 22],
            [6, 44, 30],
            [16, 58, 38],
            [9, 47, 46],
        ].forEach(([x1, x2, y], i) => {
            parts.push(
                <line
                    key={`f${i}`}
                    className="gh-wx-fog"
                    style={{ animationDelay: `${-i * 1.3}s` }}
                    x1={x1}
                    x2={x2}
                    y1={y}
                    y2={y}
                    stroke="var(--gh-fg-2)"
                    strokeWidth={sw}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />,
            );
        });
    }
    if (a.wind) {
        ['M6 40H40A4.5 4.5 0 1 0 35.5 35.5', 'M4 48.5H50A5 5 0 1 1 45 53.5', 'M12 57H34'].forEach((d, i) => {
            parts.push(
                <path
                    key={`w${i}`}
                    className="gh-wx-wind"
                    style={{ animationDelay: `${-i * 0.7}s` }}
                    d={d}
                    pathLength={100}
                    fill="none"
                    stroke="var(--gh-fg-2)"
                    strokeWidth={sw}
                    strokeLinecap="round"
                    strokeDasharray="78 22"
                    vectorEffect="non-scaling-stroke"
                />,
            );
        });
    }

    return (
        <svg
            viewBox="0 0 64 64"
            width={size}
            height={size}
            className={`gh-wx-ico${animate ? '' : ' gh-wx-static'}`}
            aria-hidden="true"
        >
            {parts}
        </svg>
    );
}
