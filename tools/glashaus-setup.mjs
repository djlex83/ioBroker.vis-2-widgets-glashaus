#!/usr/bin/env node
/* Builds a personal vis-2 project from the Glashaus demo project and a setup file that maps the user's object IDs.
 *
 *   node tools/glashaus-setup.mjs <setup.json> [outDir]
 *
 * Writes <outDir>/vis-views.json, <outDir>/vis-user.css and <outDir>.zip (import in the vis-2 editor:
 * Projects → Import). The layout and the design come from examples/glashaus-demo; only the data points change.
 * Widgets without a mapping are removed (set "keepDemo": true to keep them with demo values).
 * See examples/glashaus-setup.example.json and the skill .claude/skills/glashaus-widgets/SKILL.md. No dependencies. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = `${ROOT}/examples/glashaus-demo/vis-views.json`;

const [setupFile, outArg] = process.argv.slice(2);
if (!setupFile) {
    console.error('usage: node tools/glashaus-setup.mjs <setup.json> [outDir]');
    process.exit(2);
}
const setup = JSON.parse(readFileSync(setupFile, 'utf8'));
const project = JSON.parse(readFileSync(TEMPLATE, 'utf8'));
const outDir = resolve(outArg || setup.project || 'glashaus');

const warnings = [];
const report = [];

/** True for a usable object ID: "adapter.instance.something" */
function isId(v) {
    return typeof v === 'string' && /^[a-zA-Z0-9_-]+\.\d+\.\S+$|^0_userdata\.0\.\S+$|^alias\.0\.\S+$/.test(v);
}

/** Checks an ID value from the setup and returns it (or undefined with a warning) */
function id(value, where) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (!isId(value)) {
        warnings.push(`${where}: "${value}" does not look like an object ID, ignored`);
        return undefined;
    }
    return value;
}

/** Finds the widget of a type in a view; `nth` counts from 0 in the order of the template */
function widget(view, tpl, nth = 0) {
    const list = Object.entries(project[view]?.widgets || {}).filter(([, w]) => w.tpl === tpl);
    if (!list[nth]) {
        throw new Error(`Template has no ${tpl} #${nth} in view "${view}" – examples/glashaus-demo changed?`);
    }
    return { wid: list[nth][0], w: list[nth][1] };
}

/** Sets attributes; undefined values are skipped */
function set(w, data) {
    for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) {
            w.data[k] = v;
        }
    }
}

const removed = [];
function remove(view, wid, why) {
    if (setup.keepDemo) {
        warnings.push(`${view}/${wid}: ${why} – kept with demo values`);
        return;
    }
    delete project[view].widgets[wid];
    removed.push(`${view}/${wid} (${why})`);
}

/* ---------- Navigation and background ---------- */
for (const view of ['zuhause', 'energie', 'haus']) {
    const nav = widget(view, 'tplGlashausNavigation').w;
    set(nav, { brand: setup.brand });
    const bg = widget(view, 'tplGlashausBackground').w;
    const wx = id(setup.weather?.backgroundOid, 'weather.backgroundOid');
    if (wx && (bg.data.motif === 'house' || bg.data.motif === 'driveway')) {
        set(bg, { weather: 'auto', weatherOid: wx });
    }
}

/* ---------- Energy (Zuhause + Energie) ---------- */
const e = setup.energy || {};
const energy = {};
energy.pvOid = id(e.pv, 'energy.pv');
energy.houseOid = id(e.house, 'energy.house');
energy.powerUnit = e.unit === 'kW' ? 'kW' : e.unit ? 'W' : undefined;
if (e.battery) {
    if (e.battery.charge || e.battery.discharge) {
        Object.assign(energy, {
            battMode: 'split',
            battChargeOid: id(e.battery.charge, 'energy.battery.charge'),
            battDischargeOid: id(e.battery.discharge, 'energy.battery.discharge'),
        });
    } else {
        Object.assign(energy, {
            battMode: 'signed',
            battOid: id(e.battery.power, 'energy.battery.power'),
            battSign: e.battery.positive === 'discharge' ? 'discharge' : 'charge',
        });
    }
}
energy.socOid = id(e.soc, 'energy.soc');
if (e.grid) {
    if (e.grid.import || e.grid.export) {
        Object.assign(energy, {
            gridMode: 'split',
            gridImportOid: id(e.grid.import, 'energy.grid.import'),
            gridExportOid: id(e.grid.export, 'energy.grid.export'),
        });
    } else {
        Object.assign(energy, {
            gridMode: 'signed',
            gridOid: id(e.grid.power, 'energy.grid.power'),
            gridSign: e.grid.positive === 'export' ? 'export' : 'import',
        });
    }
}
if (id(e.wallbox, 'energy.wallbox')) {
    Object.assign(energy, { showWallbox: true, wallboxOid: e.wallbox });
}
energy.autarkyOid = id(e.autarkyToday, 'energy.autarkyToday');
energy.pvTodayOid = id(e.pvToday, 'energy.pvToday');
const hasEnergy = !!(energy.pvOid || energy.houseOid || energy.gridOid || energy.gridImportOid);
for (const view of ['zuhause', 'energie']) {
    const { wid, w } = widget(view, 'tplGlashausEnergyFlow');
    if (hasEnergy) {
        set(w, energy);
        report.push(`${view}/${wid} energy flow`);
    } else {
        remove(view, wid, 'no energy data');
    }
}

/* ---------- Year skyline (Energie) ---------- */
{
    const { wid, w } = widget('energie', 'tplGlashausSkyline');
    const y = setup.year || {};
    let oid = id(y.oid, 'year.oid');
    let mode = y.mode;
    if (!oid && energy.pvTodayOid) {
        oid = energy.pvTodayOid;
        mode = mode || 'counter';
    } else if (!oid && energy.pvOid) {
        oid = energy.pvOid;
        mode = mode || 'power';
    }
    if (oid) {
        set(w, { oid, mode, history: setup.history, label: y.label ?? 'PV-Ertrag', unit: y.unit ?? 'kWh' });
        report.push(`energie/${wid} year skyline (${mode})`);
    } else {
        remove('energie', wid, 'no daily or power data');
    }
}

/* ---------- Chart (Energie) ---------- */
{
    const { wid, w } = widget('energie', 'tplGlashausChart');
    let series = Array.isArray(setup.chart?.series) ? setup.chart.series : [];
    if (!series.length) {
        series = [
            energy.pvOid && { oid: energy.pvOid, label: 'PV', accent: 'sun' },
            energy.houseOid && { oid: energy.houseOid, label: setup.labels?.house || 'Haus', accent: 'home' },
        ].filter(Boolean);
    }
    series = series.filter((s, i) => id(s.oid, `chart.series[${i}].oid`)).slice(0, 4);
    if (series.length) {
        const unit = setup.chart?.unit ?? (setup.chart?.series ? undefined : energy.powerUnit === 'kW' ? 'kW' : 'W');
        const data = {
            count: series.length,
            history: setup.history,
            title: setup.chart?.title ?? 'Tagesverlauf',
            unit,
            decimals: setup.chart?.decimals ?? (unit === 'W' ? 0 : undefined),
        };
        series.forEach((s, i) => {
            const n = i + 1;
            Object.assign(data, {
                [`oid${n}`]: s.oid,
                [`label${n}`]: s.label,
                [`accent${n}`]: s.accent || '',
                [`fill${n}`]: s.fill ?? true,
                [`dash${n}`]: s.dash ?? false,
                [`steps${n}`]: false,
                [`factor${n}`]: s.factor ?? 1,
            });
        });
        set(w, data);
        report.push(`energie/${wid} chart (${series.length} series)`);
    } else {
        remove('energie', wid, 'no chart data');
    }
}

/* ---------- Battery ring (Energie) ---------- */
{
    const { wid, w } = widget('energie', 'tplGlashausRing');
    if (energy.socOid) {
        set(w, { oid: energy.socOid, title: setup.labels?.battery ?? 'Batterie', unit: '%', sub: '' });
        report.push(`energie/${wid} battery ring`);
    } else {
        remove('energie', wid, 'no state of charge');
    }
}

/* ---------- Value tile (Zuhause) ---------- */
{
    const { wid, w } = widget('zuhause', 'tplGlashausValue');
    const v = setup.value || {};
    if (id(v.oid, 'value.oid')) {
        set(w, {
            oid: v.oid,
            title: v.title,
            unit: v.unit,
            icon: v.icon,
            accent: v.accent,
            decimals: v.decimals,
            history: setup.history,
        });
        report.push(`zuhause/${wid} value "${v.title || v.oid}"`);
    } else {
        remove('zuhause', wid, 'no value');
    }
}

/* ---------- Switches (Zuhause, up to 4) ---------- */
{
    const list = Array.isArray(setup.switches) ? setup.switches : [];
    // look all four tiles up first: removing one would shift the order of the others
    const tiles = [0, 1, 2, 3].map(i => widget('zuhause', 'tplGlashausSwitch', i));
    for (let i = 0; i < 4; i++) {
        const { wid, w } = tiles[i];
        const s = list[i];
        if (s && id(s.oid, `switches[${i}].oid`)) {
            set(w, {
                oid: s.oid,
                oidState: id(s.state, `switches[${i}].state`),
                title: s.title,
                icon: s.icon,
                accent: s.accent,
                type: s.type,
                valueOn: s.valueOn,
                valueOff: s.valueOff,
                levelOid: id(s.level, `switches[${i}].level`),
            });
            report.push(`zuhause/${wid} switch "${s.title || s.oid}"`);
        } else {
            remove('zuhause', wid, 'no switch');
        }
    }
    if (list.length > 4) {
        warnings.push(`switches: only the first 4 are placed; add more Switch widgets in the editor`);
    }
}

/* ---------- Weather (Zuhause) ---------- */
{
    const { wid, w } = widget('zuhause', 'tplGlashausWeather');
    const wx = setup.weather || {};
    const map = {
        temperature: 'oidTemp',
        feelsLike: 'oidFeels',
        condition: 'oidCondition',
        humidity: 'oidHumidity',
        pressure: 'oidPressure',
        wind: 'oidWind',
        gust: 'oidGust',
        windDirection: 'oidWindDir',
        rain: 'oidRain',
        min: 'oidMin',
        max: 'oidMax',
        sunrise: 'oidSunrise',
        sunset: 'oidSunset',
        uv: 'oidUv',
        hourly: 'oidHourly',
        daily: 'oidDaily',
    };
    const data = {};
    for (const [k, attr] of Object.entries(map)) {
        data[attr] = id(wx[k], `weather.${k}`);
    }
    if (data.oidTemp || data.oidCondition) {
        set(w, data);
        report.push(`zuhause/${wid} weather`);
    } else {
        remove('zuhause', wid, 'no weather data');
    }
}

/* ---------- House model, messages, camera, appliance (Haus) ---------- */
{
    const { wid, w } = widget('haus', 'tplGlashausHouse');
    const h = setup.house || {};
    if (h.plan) {
        set(w, {
            plan: typeof h.plan === 'string' ? h.plan : JSON.stringify(h.plan),
            devices: h.devices ? (typeof h.devices === 'string' ? h.devices : JSON.stringify(h.devices)) : '',
            title: h.title,
        });
        report.push(`haus/${wid} house model`);
    } else {
        remove('haus', wid, 'no floor plan (see the help text of the House model widget)');
    }
}
{
    const { wid, w } = widget('haus', 'tplGlashausStatusList');
    const rows = (Array.isArray(setup.messages) ? setup.messages : [])
        .filter((r, i) => id(r.oid, `messages[${i}].oid`))
        .slice(0, 20);
    if (rows.length) {
        const data = { count: rows.length };
        rows.forEach((r, i) => {
            const n = i + 1;
            Object.assign(data, {
                [`oid${n}`]: r.oid,
                [`label${n}`]: r.label,
                [`icon${n}`]: r.icon || '',
                [`condition${n}`]: r.condition || 'true',
                [`value${n}`]: r.value ?? '',
                [`kind${n}`]: r.kind || 'warn',
                [`textTrue${n}`]: r.text ?? '',
                [`textFalse${n}`]: r.textFalse ?? '',
                [`unit${n}`]: r.unit ?? '',
            });
        });
        set(w, data);
        report.push(`haus/${wid} messages (${rows.length})`);
    } else {
        remove('haus', wid, 'no messages');
    }
}
{
    const { wid, w } = widget('haus', 'tplGlashausCamera');
    const c = setup.camera || {};
    const oid = id(c.oid, 'camera.oid');
    if (oid || (typeof c.url === 'string' && /^https?:\/\//.test(c.url))) {
        set(w, {
            oid,
            url: oid ? undefined : c.url,
            title: c.title,
            refresh: c.refresh,
            oidMotion: id(c.motion, 'camera.motion'),
        });
        report.push(`haus/${wid} camera`);
    } else {
        remove('haus', wid, 'no camera');
    }
}
{
    const { wid, w } = widget('haus', 'tplGlashausAppliance');
    const a = setup.appliance || {};
    const data = {
        deviceType: a.type,
        title: a.title,
        oidState: id(a.state, 'appliance.state'),
        oidRunning: id(a.running, 'appliance.running'),
        oidRemaining: id(a.remaining, 'appliance.remaining'),
        remainingUnit: a.remainingUnit,
        oidProgress: id(a.progress, 'appliance.progress'),
        oidTotal: id(a.total, 'appliance.total'),
        oidProgram: id(a.program, 'appliance.program'),
        oidDoor: id(a.door, 'appliance.door'),
        oidDone: id(a.done, 'appliance.done'),
    };
    if (data.oidState || data.oidRunning) {
        set(w, data);
        report.push(`haus/${wid} appliance (${a.type || 'washer'})`);
    } else {
        remove('haus', wid, 'no appliance');
    }
}

/* ---------- Close gaps on the house view ---------- */
// Without the house model the left half would stay empty: messages, appliance and camera move up into two columns.
{
    const ws = project.haus.widgets;
    const find = tpl => Object.values(ws).find(w => w.tpl === tpl);
    if (!find('tplGlashausHouse')) {
        const tiles = ['tplGlashausStatusList', 'tplGlashausAppliance', 'tplGlashausCamera'].map(find).filter(Boolean);
        const place = (w, x, y, width, height) =>
            Object.assign(w.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
        if (tiles.length === 1) {
            place(tiles[0], 24, 250, 1232, 530);
        } else if (tiles.length === 2) {
            place(tiles[0], 24, 250, 608, 530);
            place(tiles[1], 648, 250, 608, 530);
        } else if (tiles.length === 3) {
            place(tiles[0], 24, 250, 608, 530);
            place(tiles[1], 648, 250, 608, 264);
            place(tiles[2], 648, 530, 608, 250);
        }
    }
}

/* ---------- Write ---------- */
project.___settings.ts = `${Date.now()}.glashaus-setup`;
mkdirSync(outDir, { recursive: true });
const views = JSON.stringify(project, null, 2);
const css = '/* Own CSS for this project */\n';
writeFileSync(`${outDir}/vis-views.json`, views);
writeFileSync(`${outDir}/vis-user.css`, css);
writeFileSync(
    `${outDir}.zip`,
    zip([
        ['vis-views.json', Buffer.from(views)],
        ['vis-user.css', Buffer.from(css)],
    ]),
);

console.log(`Glashaus project "${basename(outDir)}"`);
report.forEach(r => console.log(`  ✓ ${r}`));
removed.forEach(r => console.log(`  – removed ${r}`));
warnings.forEach(w => console.log(`  ! ${w}`));
console.log(`\n${outDir}/vis-views.json\n${outDir}.zip  → vis-2 editor: Projects → Import`);

/** Minimal zip writer (stored, no compression) – vis-2 imports the files from the root of the archive */
function zip(files) {
    const local = [];
    const central = [];
    let offset = 0;
    for (const [name, data] of files) {
        const n = Buffer.from(name);
        const crc = crc32(data);
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);
        lh.writeUInt16LE(20, 4);
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(data.length, 18);
        lh.writeUInt32LE(data.length, 22);
        lh.writeUInt16LE(n.length, 26);
        local.push(lh, n, data);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0);
        ch.writeUInt16LE(20, 4);
        ch.writeUInt16LE(20, 6);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(data.length, 20);
        ch.writeUInt32LE(data.length, 24);
        ch.writeUInt16LE(n.length, 28);
        ch.writeUInt32LE(offset, 42);
        central.push(ch, n);
        offset += lh.length + n.length + data.length;
    }
    const cd = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, cd, end]);
}
