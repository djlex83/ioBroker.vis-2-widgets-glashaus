import type { Scenario } from '../scenario';

const H = 3600000;

/** Local date "YYYY-MM-DD" */
const ymd = (t: number): string => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Hourly forecast as an array of objects, starting 2 hours in the past (the widget skips those) */
const hourly = (t: number): string => {
    const h0 = new Date(t);
    h0.setMinutes(0, 0, 0);
    return JSON.stringify(
        Array.from({ length: 30 }, (_v, i) => {
            const tt = h0.getTime() + (i - 2) * H;
            const h = new Date(tt).getHours();
            const k = Math.floor(i / 5) % 7;
            return {
                time: new Date(tt).toISOString(),
                temp: Math.round((9 + 5 * Math.sin(((h - 9) / 24) * 2 * Math.PI)) * 10) / 10,
                code: [2, 3, 61, 80, 2, 1, 0][k],
                rain: [0, 10, 60, 80, 30, 10, 0][k],
            };
        }),
    );
};

/** Daily forecast in the column format of Open-Meteo */
const daily = (t: number): string =>
    JSON.stringify({
        latitude: 0,
        daily: {
            time: Array.from({ length: 7 }, (_v, i) => ymd(t + i * 24 * H)),
            weather_code: [3, 61, 95, 71, 45, 1, 0],
            temperature_2m_max: [12.4, 10.1, 15.8, 2.3, 6.5, 13.9, 16.2],
            temperature_2m_min: [5.2, 6.8, 9.9, -2.1, 1.4, 4.0, 5.5],
            precipitation_probability_max: [30, 85, 70, 60, 10, 5, 0],
        },
    });

/** Forecasts in the shape of OpenWeatherMap (One Call): seconds, nested temp / weather, "pop" 0..1, rain in mm */
const owmHourly = (t: number): string => {
    const h0 = Math.floor(t / H) * H;
    return JSON.stringify({
        hourly: Array.from({ length: 26 }, (_v, i) => ({
            dt: (h0 + i * H) / 1000,
            temp: Math.round((6 + 4 * Math.sin(((new Date(h0 + i * H).getHours() - 9) / 24) * 2 * Math.PI)) * 10) / 10,
            weather: [{ id: [803, 500, 501, 802][Math.floor(i / 7)], description: 'light rain', icon: '10d' }],
            pop: [0.1, 0.65, 0.8, 0.2][Math.floor(i / 7)],
            rain: { '1h': 0.4 },
        })),
    });
};
const owmDaily = (t: number): string =>
    JSON.stringify({
        daily: Array.from({ length: 8 }, (_v, i) => ({
            dt: Math.floor((t + i * 24 * H) / 1000),
            temp: { day: 9 + i, min: 3 + (i % 3), max: 10 + i },
            weather: [{ id: [803, 500, 211, 600, 741, 800, 801, 804][i], icon: '04d' }],
            pop: [0.2, 0.7, 0.9, 0.6, 0.1, 0, 0.05, 0.3][i],
            rain: 2.4,
        })),
    });

const live = {
    oidTemp: 'harness.0.wx.temperature',
    oidFeels: 'harness.0.wx.feels_like',
    oidCondition: 'harness.0.wx.condition',
    oidHumidity: 'harness.0.wx.humidity',
    oidPressure: 'harness.0.wx.pressure',
    oidWind: 'harness.0.wx.wind_speed',
    oidGust: 'harness.0.wx.wind_gust',
    oidWindDir: 'harness.0.wx.wind_direction',
    oidRain: 'harness.0.wx.rain_probability',
    oidSunrise: 'harness.0.wx.sunrise',
    oidSunset: 'harness.0.wx.sunset',
    oidUv: 'harness.0.wx.uv_index',
    oidHourly: 'harness.0.wx.forecast_hourly',
    oidDaily: 'harness.0.wx.forecast_daily',
};

/** A fixed condition at a small size: to look at every icon */
const icon = (name: string, condition: string | number, temp: number): Scenario => ({
    widget: 'GlashausWeather',
    name: `icon-${name}`,
    w: 210,
    h: 120,
    data: { oidTemp: `harness.0.wx.${name}.t`, oidCondition: `harness.0.wx.${name}.c` },
    states: {
        [`harness.0.wx.${name}.t`]: { val: temp, unit: '°C' },
        [`harness.0.wx.${name}.c`]: { val: condition },
    },
});

export default [
    { widget: 'GlashausWeather', name: 'demo', w: 720, h: 440 },
    {
        widget: 'GlashausWeather',
        name: 'live',
        w: 740,
        h: 440,
        data: { title: 'Wetter Garten', ...live },
        states: {
            'harness.0.wx.temperature': { val: t => Math.round((11 + 1.5 * Math.sin(t / 9000)) * 10) / 10, unit: '°C' },
            'harness.0.wx.feels_like': { val: t => Math.round((9 + 1.5 * Math.sin(t / 9000)) * 10) / 10, unit: '°C' },
            // cycles through the conditions so that the icon animations can be watched
            'harness.0.wx.condition': { val: t => [3, 'Leichter Regen', 95, '02d', 'snow', 45, 'wind'][Math.floor(t / 8000) % 7] },
            'harness.0.wx.humidity': { val: t => Math.round(72 + 6 * Math.sin(t / 13000)), unit: '%' },
            'harness.0.wx.pressure': { val: 1009, unit: 'hPa' },
            'harness.0.wx.wind_speed': { val: t => Math.round(14 + 5 * Math.sin(t / 7000)), unit: 'km/h' },
            'harness.0.wx.wind_gust': { val: 31, unit: 'km/h' },
            'harness.0.wx.wind_direction': { val: 250, unit: '°' },
            'harness.0.wx.rain_probability': { val: 40, unit: '%' },
            'harness.0.wx.sunrise': { val: '07:53' },
            'harness.0.wx.sunset': { val: '18:18' },
            'harness.0.wx.uv_index': { val: 1.4 },
            'harness.0.wx.forecast_hourly': { val: hourly, type: 'string' },
            'harness.0.wx.forecast_daily': { val: daily, type: 'string' },
        },
    },
    {
        widget: 'GlashausWeather',
        name: 'narrow-tall',
        w: 360,
        h: 640,
        data: { ...live, oidCondition: 'harness.0.wx.cond_rain' },
        states: { 'harness.0.wx.cond_rain': { val: 'rain' } },
    },
    {
        widget: 'GlashausWeather',
        name: 'medium-no-forecast',
        w: 420,
        h: 280,
        data: {
            oidTemp: 'harness.0.wx.temperature',
            oidCondition: 'harness.0.wx.cond_clear_night',
            oidMin: 'harness.0.wx.min',
            oidMax: 'harness.0.wx.max',
            oidWind: 'harness.0.wx.wind_speed',
            oidHumidity: 'harness.0.wx.humidity',
        },
        states: {
            'harness.0.wx.cond_clear_night': { val: 'clear-night' },
            'harness.0.wx.min': { val: 4.6, unit: '°C' },
            'harness.0.wx.max': { val: 13.2, unit: '°C' },
        },
    },
    {
        widget: 'GlashausWeather',
        name: 'offline',
        w: 320,
        h: 220,
        data: {
            title: 'Wetterstation',
            oidTemp: 'harness.0.wx.station_missing_temp',
            oidCondition: 'harness.0.wx.station_missing_cond',
            oidHumidity: 'harness.0.wx.station_missing_hum',
        },
    },
    {
        widget: 'GlashausWeather',
        name: 'tiny',
        w: 150,
        h: 80,
        data: { oidTemp: 'harness.0.wx.temperature', oidCondition: 'harness.0.wx.cond_rain' },
    },
    {
        widget: 'GlashausWeather',
        name: 'large',
        w: 720,
        h: 600,
        data: { ...live, oidCondition: 'harness.0.wx.cond_partly', unit: '°C', decimals: 1 },
        states: { 'harness.0.wx.cond_partly': { val: 2 } },
    },
    {
        widget: 'GlashausWeather',
        name: 'owm-wide',
        w: 1100,
        h: 300,
        data: {
            title: 'OpenWeatherMap',
            oidTemp: 'harness.0.wx.temperature',
            oidCondition: 'harness.0.wx.owm_id',
            oidWind: 'harness.0.wx.wind_speed',
            oidWindDir: 'harness.0.wx.wind_direction',
            oidHumidity: 'harness.0.wx.humidity',
            oidHourly: 'harness.0.wx.owm_hourly',
            oidDaily: 'harness.0.wx.owm_daily',
        },
        states: {
            'harness.0.wx.owm_id': { val: 803 },
            'harness.0.wx.owm_hourly': { val: owmHourly, type: 'string' },
            'harness.0.wx.owm_daily': { val: owmDaily, type: 'string' },
        },
    },
    icon('clear', 0, 21),
    icon('mostly', 'heiter', 18),
    icon('partly', 'Teils bewölkt', 16),
    icon('cloudy', 'cloudy', 12),
    icon('overcast', 3, 9),
    icon('fog', 'nebel', 4),
    icon('drizzle', 53, 8),
    icon('rain', 'Regen', 9),
    icon('heavy', 65, 10),
    icon('showers', '09d', 11),
    icon('thunder', 'Gewitter', 17),
    icon('snow', 73, -1),
    icon('sleet', 'Schneeregen', 1),
    icon('hail', 99, 14),
    icon('wind', 'wind', 10),
    icon('night', '02n', 7),
    icon('sunny-day', 'clear-day', 24),
    icon('mostly-day', 'mostly-clear-day', 20),
    icon('partly-day', 'partly-cloudy-day', 18),
] satisfies Scenario[];
