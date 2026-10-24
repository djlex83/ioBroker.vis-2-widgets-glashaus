import type { Scenario } from '../scenario';

export default [
    { widget: 'GlashausValue', name: 'demo', w: 320, h: 210 },
    {
        widget: 'GlashausValue',
        name: 'live',
        w: 320,
        h: 210,
        data: { oid: 'harness.0.temp', title: 'Kinderzimmer', unit: '°C', pill: true, warnAbove: 23, critAbove: 25, accent: 'heat', icon: 'thermo' },
        states: { 'harness.0.temp': { val: t => Math.round((22 + 2.2 * Math.sin(t / 20000)) * 10) / 10, unit: '°C', name: 'Temperatur' } },
    },
    {
        widget: 'GlashausValue',
        name: 'small',
        w: 220,
        h: 120,
        data: { oid: 'harness.0.power', title: 'Hausverbrauch', unit: 'kW', factor: 0.001, decimals: 2, size: 'small', chart: false, icon: 'home', accent: 'home' },
        states: { 'harness.0.power': { val: t => Math.round(850 + 400 * Math.sin(t / 15000)), unit: 'W' } },
    },
    {
        widget: 'GlashausValue',
        name: 'long',
        w: 320,
        h: 210,
        data: {
            oid: 'harness.0.energy_total',
            title: 'Zählerstand Wärmepumpe Untergeschoss',
            unit: 'kWh',
            decimals: 2,
            pill: true,
            warnAbove: 100000,
            textWarn: 'Wartung bald fällig',
            sub: 'Seit Inbetriebnahme · Zähler 2',
            accent: 'teal',
            icon: 'bolt',
        },
        states: { 'harness.0.energy_total': { val: 123456.78, unit: 'kWh' } },
    },
    { widget: 'GlashausValue', name: 'tiny', w: 150, h: 90, data: { size: 'medium' } },
] satisfies Scenario[];
