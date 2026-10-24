import type { Scenario, StateDef } from '../scenario';

const P = 'harness.0.house.';

/** Devices of the example house with simulated object IDs */
const liveDevices = [
    { id: 'k_light', type: 'light', room: 'kitchen', uv: [0.55, 0.5], oid: `${P}kitchen_light`, label: 'Küche Decke' },
    {
        id: 'k_win',
        type: 'window',
        room: 'kitchen',
        uv: [0.35, 0.95],
        oid: `${P}kitchen_window`,
        label: 'Küchenfenster',
    },
    { id: 'k_sh', type: 'shutter', room: 'kitchen', uv: [0.08, 0.2], oid: `${P}kitchen_shutter`, label: 'Rollladen' },
    { id: 'w_lamp', type: 'light', room: 'living', uv: [0.3, 0.12], oid: `${P}living_lamp`, label: 'Stehlampe' },
    {
        id: 'w_temp',
        type: 'temperature',
        room: 'living',
        uv: [0.86, 0.5],
        oid: `${P}living_temp`,
        label: 'Raumtemperatur',
    },
    { id: 'h_pir', type: 'motion', room: 'hall', uv: [0.5, 0.7], oid: `${P}hall_motion`, label: 'Bewegung Flur' },
    {
        id: 'c1_light',
        type: 'light',
        room: 'child1',
        uv: [0.5, 0.5],
        oid: `${P}child1_light`,
        label: 'Deckenlicht',
    },
    {
        id: 'c1_th',
        type: 'thermostat',
        room: 'child1',
        uv: [0.06, 0.84],
        oid: `${P}child1_temp`,
        oidSet: `${P}child1_set`,
        label: 'Heizkörper',
    },
    { id: 'c1_pir', type: 'motion', room: 'child1', uv: [0.9, 0.1], oid: `${P}child1_motion`, label: 'Bewegung' },
    { id: 'c1_win', type: 'window', room: 'child1', uv: [0.03, 0.4], oid: `${P}child1_window`, label: 'Fenster' },
    {
        id: 'o_th',
        type: 'thermostat',
        room: 'office',
        uv: [0.55, 0.06],
        oid: `${P}office_temp`,
        oidSet: `${P}office_set`,
        label: 'Heizkörper Büro',
    },
    { id: 'o_win', type: 'window', room: 'office', uv: [0.03, 0.5], oid: `${P}office_window`, label: 'Dachfenster' },
    { id: 'o_plug', type: 'plug', room: 'office', uv: [0.82, 0.6], oid: `${P}office_plug`, label: 'Schreibtisch' },
    { id: 'l_plug', type: 'plug', room: 'laundry', uv: [0.35, 0.35], oid: `${P}washer_plug`, label: 'Waschmaschine' },
    { id: 't_light', type: 'light', room: 'terrace', uv: [0.7, 0.75], oid: `${P}terrace_light`, label: 'Terrasse' },
    { id: 'a_temp', type: 'temperature', room: 'attic', uv: [0.5, 0.5], oid: `${P}attic_temp`, label: 'Dachboden' },
];

const liveStates: Record<string, StateDef> = {
    [`${P}kitchen_light`]: { val: t => Math.floor(t / 8000) % 2 === 0, type: 'boolean' },
    [`${P}kitchen_window`]: { val: t => Math.floor(t / 10000) % 3 === 0, type: 'boolean' },
    [`${P}kitchen_shutter`]: { val: 60, unit: '%' },
    [`${P}living_lamp`]: { val: true, type: 'boolean' },
    [`${P}living_temp`]: { val: t => Math.round((21.6 + 0.4 * Math.sin(t / 20000)) * 10) / 10, unit: '°C' },
    [`${P}hall_motion`]: { val: t => Math.floor(t / 4000) % 3 === 0, type: 'boolean' },
    [`${P}child1_light`]: { val: false, type: 'boolean' },
    [`${P}child1_temp`]: { val: t => Math.round((22.4 + 0.2 * Math.sin(t / 15000)) * 10) / 10, unit: '°C' },
    [`${P}child1_set`]: { val: 23, unit: '°C' },
    [`${P}child1_motion`]: { val: t => Math.floor(t / 6000) % 2 === 1, type: 'boolean' },
    [`${P}child1_window`]: { val: false, type: 'boolean' },
    [`${P}office_temp`]: { val: t => Math.round((20.1 + 0.3 * Math.sin(t / 25000)) * 10) / 10, unit: '°C' },
    [`${P}office_set`]: { val: 21, unit: '°C' },
    [`${P}office_window`]: { val: true, type: 'boolean' },
    [`${P}office_plug`]: { val: true, type: 'boolean' },
    [`${P}washer_plug`]: { val: true, type: 'boolean' },
    [`${P}terrace_light`]: { val: false, type: 'boolean' },
    [`${P}attic_temp`]: { val: 13.8, unit: '°C' },
};

/** A small own plan: bungalow with a roof whose ridge runs along y */
const bungalow = {
    floors: [
        {
            id: 'eg',
            name: 'Erdgeschoss',
            short: 'EG',
            h: 2.8,
            foot: [
                [0, 0],
                [9, 0],
                [9, 7],
                [0, 7],
            ],
            rooms: [
                {
                    id: 'wohnen',
                    name: 'Wohnen',
                    accent: 'home',
                    p: [
                        [0, 0],
                        [5.5, 0],
                        [5.5, 4.2],
                        [0, 4.2],
                    ],
                },
                {
                    id: 'kueche',
                    name: 'Küche',
                    accent: 'sun',
                    p: [
                        [5.5, 0],
                        [9, 0],
                        [9, 3],
                        [5.5, 3],
                    ],
                },
                {
                    id: 'bad',
                    name: 'Bad',
                    accent: 'cool',
                    p: [
                        [5.5, 3],
                        [9, 3],
                        [9, 7],
                        [7, 7],
                        [7, 4.2],
                        [5.5, 4.2],
                    ],
                },
                {
                    id: 'schlafen',
                    name: 'Schlafen',
                    accent: 'grid',
                    p: [
                        [0, 4.2],
                        [7, 4.2],
                        [7, 7],
                        [0, 7],
                    ],
                },
                {
                    id: 'terrasse',
                    name: 'Terrasse',
                    kind: 'outside',
                    p: [
                        [0, -2.5],
                        [5.5, -2.5],
                        [5.5, 0],
                        [0, 0],
                    ],
                },
            ],
        },
    ],
    roof: { pitch: 30, ridge: 'y', knee: 0.4 },
};

/** IDs that do not exist (offline devices) and one device in an unknown room */
const offlineDevices = [
    { id: 'l1', type: 'light', room: 'wohnen', uv: [0.5, 0.5], oid: `${P}missing_light`, label: 'Deckenlicht' },
    { id: 't1', type: 'temperature', room: 'schlafen', uv: [0.3, 0.5], oid: `${P}missing_temp`, label: 'Temperatur' },
    { id: 'w1', type: 'window', room: 'bad', uv: [0.8, 0.2], oid: `${P}missing_window`, label: 'Fenster' },
    { id: 'x1', type: 'light', room: 'gibtsnicht', oid: `${P}missing_x`, label: 'Falscher Raum' },
];

const live = JSON.stringify(liveDevices);

export default [
    { widget: 'GlashausHouse', name: 'demo', w: 760, h: 560, data: { autoRotate: 'sway' } },
    { widget: 'GlashausHouse', name: 'live', w: 900, h: 600, data: { devices: live }, states: liveStates },
    {
        widget: 'GlashausHouse',
        name: 'floor',
        w: 760,
        h: 560,
        data: { devices: live, startFloor: 'upper', title: 'Obergeschoss' },
        states: liveStates,
    },
    {
        widget: 'GlashausHouse',
        name: 'room',
        w: 820,
        h: 520,
        data: { devices: live, startRoom: 'child1' },
        states: liveStates,
    },
    {
        widget: 'GlashausHouse',
        name: 'room-narrow',
        w: 420,
        h: 520,
        data: { devices: live, startRoom: 'kitchen' },
        states: liveStates,
    },
    {
        widget: 'GlashausHouse',
        name: 'stacked',
        w: 560,
        h: 440,
        data: { devices: live, view: 'stacked', startAngle: -40 },
        states: liveStates,
    },
    { widget: 'GlashausHouse', name: 'small', w: 300, h: 240 },
    {
        widget: 'GlashausHouse',
        name: 'offline',
        w: 440,
        h: 360,
        // pretty-printed JSON, as typed in the editor
        data: { plan: JSON.stringify(bungalow, null, 2), devices: JSON.stringify(offlineDevices), title: 'Bungalow' },
    },
    // flat widget: the floor buttons move into the header
    { widget: 'GlashausHouse', name: 'flat', w: 900, h: 220 },
    {
        widget: 'GlashausHouse',
        name: 'large',
        w: 1400,
        h: 900,
        data: { autoRotate: 'spin', wallHeight: 0.55 },
    },
] satisfies Scenario[];
