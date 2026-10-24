/* Screenshot of a vis-2 runtime page (e.g. the demo project in the local ioBroker of test/devVis.js).
 * node dev/visshot.mjs "http://127.0.0.1:18082/vis-2/index.html?glashaus-demo#zuhause" out.png [light|dark] [waitMs] [width] [height] */
import puppeteer from 'puppeteer';
const [url, out, theme = 'light', wait = '7000', w = '1280', h = '800'] = process.argv.slice(2);
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.evaluateOnNewDocument(t => { try { localStorage.setItem('App.themeName', t); localStorage.setItem('App.themeType', t); } catch {} }, theme);
await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise(r => setTimeout(r, Number(wait)));
await page.screenshot({ path: out });
console.log('saved', out, errors.length ? 'ERRORS: ' + errors.slice(0, 5).join(' | ') : 'no errors');
await browser.close();
