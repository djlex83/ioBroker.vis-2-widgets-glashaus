import type { Scenario } from '../scenario';

/** Links to the (simulated) views; the harness reports "Home" as the active view */
const links = (names: string[], icons: string[] = []): Record<string, string | number> => {
    const d: Record<string, string | number> = { count: names.length };
    names.forEach((n, i) => {
        d[`view${i + 1}`] = n;
        d[`label${i + 1}`] = '';
        if (icons[i]) {
            d[`icon${i + 1}`] = icons[i];
        }
    });
    return d;
};

export default [
    // no attributes at all: example brand and links, first link active
    { widget: 'GlashausNavigation', name: 'demo', w: 840, h: 64 },
    {
        widget: 'GlashausNavigation',
        name: 'live',
        w: 1100,
        h: 64,
        data: {
            brand: 'Glashaus®',
            brandView: 'Home',
            ...links(['Home', 'Energy', 'Heating', 'Devices', 'Driveway', 'Rooms']),
            label1: 'Zuhause',
            label2: 'Energie',
            label3: 'Heizung',
            label4: 'Geräte',
            label5: 'Einfahrt',
            label6: '',
            statusOid: 'harness.0.nav_online',
        },
        states: {
            'harness.0.nav_online': { val: t => Math.floor(t / 6000) % 3 !== 2, type: 'boolean', name: 'Connected' },
        },
    },
    {
        widget: 'GlashausNavigation',
        name: 'vertical',
        w: 250,
        h: 560,
        data: {
            layout: 'vertical',
            brand: 'Glashaus®',
            ...links(
                ['Home', 'Energy', 'Heating', 'Devices', 'Cameras', 'Weather'],
                ['home', 'bolt', 'flame', 'washer', 'cam', 'cloud'],
            ),
            label1: 'Zuhause',
            label2: 'Energie',
            label3: 'Heizung',
            label4: 'Geräte',
            label5: 'Kameras',
            label6: 'Wetter',
            statusOid: 'harness.0.nav_online',
            statusOn: 'Verbunden',
            statusOff: 'Getrennt',
        },
    },
    {
        widget: 'GlashausNavigation',
        name: 'pills',
        w: 900,
        h: 64,
        data: {
            layout: 'pills',
            brand: 'Glashaus®',
            ...links(['Home', 'Energy', 'Heating', 'Rooms'], ['home', 'bolt', 'flame', 'desk']),
            label1: 'Zuhause',
            label2: 'Energie',
            label3: 'Heizung',
            label4: 'Zimmer',
        },
    },
    {
        // too narrow for everything: links scroll, clock hidden; status ID without value
        widget: 'GlashausNavigation',
        name: 'small-offline',
        w: 360,
        h: 52,
        data: {
            brand: 'Glashaus',
            ...links(['Energy', 'Heating', 'Home', 'Devices', 'Rooms', 'Weather']),
            statusOid: 'harness.0.nav_missing',
        },
    },
    {
        widget: 'GlashausNavigation',
        name: 'icons-only-glass',
        w: 520,
        h: 64,
        data: {
            layout: 'pills',
            ghGlass: true,
            brand: '',
            showLabels: false,
            clock: false,
            ...links(['Home', 'Energy', 'Heating', 'Devices', 'Cameras'], ['home', 'bolt', 'flame', 'washer', 'cam']),
        },
    },
    {
        widget: 'GlashausNavigation',
        name: 'large',
        w: 1700,
        h: 80,
        data: {
            brand: 'Glashaus®',
            ghGlass: true,
            showIcons: true,
            ...links(
                ['Home', 'Energy', 'Heating', 'Devices', 'Driveway', 'House', 'Rooms', 'Cameras', 'Weather', 'Charts'],
                ['home', 'bolt', 'flame', 'washer', 'car', 'cube', 'desk', 'cam', 'cloud', 'chart'],
            ),
            statusOid: 'harness.0.nav_online',
        },
    },
] satisfies Scenario[];
