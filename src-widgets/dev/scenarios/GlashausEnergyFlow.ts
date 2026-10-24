import type { Scenario } from '../scenario';

/* Simulated plant: values are functions of the time, so that the balance always fits */
const pv = (t: number): number => Math.round(3300 + 700 * Math.sin(t / 20000));
const house = (t: number): number => Math.round(1450 + 380 * Math.sin(t / 13000 + 1));
const charge = (t: number): number => Math.round(Math.max(0, (pv(t) - house(t)) * 0.55));
const grid = (t: number): number => house(t) + charge(t) - pv(t);

/* Evening, values in kW: little PV, battery discharging, small import */
const evPv = (t: number): number => Math.round(180 + 60 * Math.sin(t / 9000)) / 1000;
const evHouse = (t: number): number => Math.round(980 + 260 * Math.sin(t / 11000)) / 1000;
const evBatt = (t: number): number => Math.round(Math.min(650, evHouse(t) * 1000 - evPv(t) * 1000)) / 1000;
const evGrid = (t: number): number => Math.round((evHouse(t) - evPv(t) - evBatt(t)) * 1000) / 1000;

/* Large plant with wallbox and heat pump, split battery and grid IDs, house value incl. wallbox + heat pump */
const lPv = (t: number): number => Math.round(7800 + 500 * Math.sin(t / 17000));
const lWb = (t: number): number => (Math.sin(t / 30000) > -0.6 ? 3700 : 0);
const lHp = (t: number): number => Math.round(1200 + 150 * Math.sin(t / 8000));
const lOwn = (t: number): number => Math.round(700 + 120 * Math.sin(t / 12000 + 2));
const lHouse = (t: number): number => lOwn(t) + lWb(t) + lHp(t);
const lCharge = (t: number): number => Math.max(0, Math.min(1000, lPv(t) - lHouse(t)));
const lExport = (t: number): number => Math.max(0, lPv(t) - lHouse(t) - lCharge(t));
const lImport = (t: number): number => Math.max(0, lHouse(t) - lPv(t));
const lDischarge = (t: number): number => Math.min(1500, lImport(t));

export default [
    { widget: 'GlashausEnergyFlow', name: 'demo', w: 520, h: 520 },
    {
        widget: 'GlashausEnergyFlow',
        name: 'live',
        w: 520,
        h: 540,
        data: {
            title: 'Energie jetzt',
            pvOid: 'harness.0.ef.pv',
            battOid: 'harness.0.ef.batt',
            battSign: 'charge',
            socOid: 'harness.0.ef.soc',
            gridOid: 'harness.0.ef.grid',
            gridSign: 'import',
            autarkyOid: 'harness.0.ef.autarky',
            pvTodayOid: 'harness.0.ef.pvToday',
            pvTodayUnit: 'Wh',
        },
        states: {
            'harness.0.ef.pv': { val: pv, unit: 'W', name: 'PV power' },
            'harness.0.ef.batt': { val: charge, unit: 'W', name: 'Battery power' },
            'harness.0.ef.soc': { val: t => Math.round(71 + 3 * Math.sin(t / 60000)), unit: '%' },
            'harness.0.ef.grid': { val: grid, unit: 'W', name: 'Grid power' },
            'harness.0.ef.autarky': { val: 78, unit: '%' },
            'harness.0.ef.pvToday': { val: t => Math.round(14200 + (t % 600000) / 1000), unit: 'Wh' },
        },
    },
    {
        widget: 'GlashausEnergyFlow',
        name: 'row',
        w: 700,
        h: 250,
        data: {
            title: 'Energie jetzt',
            powerUnit: 'kW',
            pvOid: 'harness.0.ef.ev.pv',
            houseOid: 'harness.0.ef.ev.house',
            battOid: 'harness.0.ef.ev.batt',
            battSign: 'discharge',
            socOid: 'harness.0.ef.ev.soc',
            gridOid: 'harness.0.ef.ev.grid',
            gridSign: 'import',
        },
        states: {
            'harness.0.ef.ev.pv': { val: evPv, unit: 'kW' },
            'harness.0.ef.ev.house': { val: evHouse, unit: 'kW' },
            'harness.0.ef.ev.batt': { val: evBatt, unit: 'kW' },
            'harness.0.ef.ev.soc': { val: 49, unit: '%' },
            'harness.0.ef.ev.grid': { val: evGrid, unit: 'kW' },
        },
    },
    {
        widget: 'GlashausEnergyFlow',
        name: 'small',
        w: 280,
        h: 170,
        data: {
            title: 'Energie',
            pvOid: 'harness.0.ef.pv',
            battOid: 'harness.0.ef.batt',
            battSign: 'charge',
            socOid: 'harness.0.ef.soc',
            gridOid: 'harness.0.ef.grid',
        },
    },
    {
        widget: 'GlashausEnergyFlow',
        name: 'narrow',
        w: 230,
        h: 560,
        data: {
            title: 'Energie',
            pvOid: 'harness.0.ef.l.pv',
            battMode: 'split',
            battChargeOid: 'harness.0.ef.l.charge',
            battDischargeOid: 'harness.0.ef.l.discharge',
            socOid: 'harness.0.ef.l.soc',
            gridMode: 'split',
            gridImportOid: 'harness.0.ef.l.import',
            gridExportOid: 'harness.0.ef.l.export',
            houseOid: 'harness.0.ef.l.house',
            showWallbox: true,
            wallboxOid: 'harness.0.ef.l.wb',
            showExtra: true,
            extraOid: 'harness.0.ef.l.hp',
        },
    },
    {
        widget: 'GlashausEnergyFlow',
        name: 'offline',
        w: 360,
        h: 400,
        data: {
            pvOid: 'harness.0.ef.off.pv',
            gridOid: 'harness.0.ef.off.grid',
            socOid: 'harness.0.ef.off.soc',
            battOid: 'harness.0.ef.off.batt',
        },
    },
    {
        widget: 'GlashausEnergyFlow',
        name: 'nobattery',
        w: 460,
        h: 430,
        data: {
            title: 'Carport',
            layout: 'cross',
            pvOid: 'harness.0.ef.l.pv',
            gridMode: 'split',
            gridImportOid: 'harness.0.ef.nb.import',
            gridExportOid: 'harness.0.ef.nb.export',
            showWallbox: true,
            wallboxOid: 'harness.0.ef.l.wb',
            showSummary: false,
        },
        states: {
            'harness.0.ef.nb.import': { val: t => Math.max(0, 700 + lWb(t) - lPv(t)), unit: 'W' },
            'harness.0.ef.nb.export': { val: t => Math.max(0, lPv(t) - 700 - lWb(t)), unit: 'W' },
        },
    },
    {
        widget: 'GlashausEnergyFlow',
        name: 'large',
        w: 700,
        h: 680,
        data: {
            title: 'Energiefluss',
            pvOid: 'harness.0.ef.l.pv',
            houseOid: 'harness.0.ef.l.house',
            houseIncl: true,
            battMode: 'split',
            battChargeOid: 'harness.0.ef.l.charge',
            battDischargeOid: 'harness.0.ef.l.discharge',
            socOid: 'harness.0.ef.l.soc',
            gridMode: 'split',
            gridImportOid: 'harness.0.ef.l.import',
            gridExportOid: 'harness.0.ef.l.export',
            showWallbox: true,
            wallboxOid: 'harness.0.ef.l.wb',
            wallboxLabel: 'Auto lädt',
            showExtra: true,
            extraOid: 'harness.0.ef.l.hp',
            autarkyOid: 'harness.0.ef.l.autarky',
            pvTodayOid: 'harness.0.ef.l.pvToday',
        },
        states: {
            'harness.0.ef.l.pv': { val: lPv, unit: 'W' },
            'harness.0.ef.l.house': { val: lHouse, unit: 'W' },
            'harness.0.ef.l.charge': { val: lCharge, unit: 'W' },
            'harness.0.ef.l.discharge': { val: lDischarge, unit: 'W' },
            'harness.0.ef.l.soc': { val: 88, unit: '%' },
            'harness.0.ef.l.import': { val: lImport, unit: 'W' },
            'harness.0.ef.l.export': { val: lExport, unit: 'W' },
            'harness.0.ef.l.wb': { val: lWb, unit: 'W' },
            'harness.0.ef.l.hp': { val: lHp, unit: 'W' },
            'harness.0.ef.l.autarky': { val: 92, unit: '%' },
            'harness.0.ef.l.pvToday': { val: 31.4, unit: 'kWh' },
        },
    },
] satisfies Scenario[];
