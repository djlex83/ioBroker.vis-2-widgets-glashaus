/* Screenshot of a harness page with puppeteer (from the root node_modules).
 * node dev/shot.mjs <url> <out.png> [waitMs=2500] [width=1500] [selector]
 * Prints console errors and page errors; exit code 1 if there were any. */
import puppeteer from 'puppeteer';

const [url, out, waitMs = '2500', width = '1500', selector] = process.argv.slice(2);
if (!url || !out) {
    console.error('usage: node dev/shot.mjs <url> <out.png> [waitMs] [width] [selector]');
    process.exit(2);
}
const errors = [];
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
    const page = await browser.newPage();
    await page.setViewport({ width: Number(width), height: 1000, deviceScaleFactor: 1 });
    page.on('console', m => {
        if (m.type() === 'error' || m.type() === 'warn') {
            const t = `[${m.type()}] ${m.text()}`;
            console.log(t);
            if (m.type() === 'error') {
                errors.push(t);
            }
        }
    });
    page.on('pageerror', e => {
        console.log(`[pageerror] ${e.message}`);
        errors.push(e.message);
    });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, Number(waitMs)));
    if (selector) {
        const el = await page.$(selector);
        if (!el) {
            throw new Error(`selector not found: ${selector}`);
        }
        await el.screenshot({ path: out });
    } else {
        await page.screenshot({ path: out, fullPage: true });
    }
    console.log(`saved ${out}`);
} finally {
    await browser.close();
}
process.exit(errors.length ? 1 : 0);
