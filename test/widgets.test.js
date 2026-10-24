const helper = require('@iobroker/vis-2-widgets-testing');

// name of the widget set: `vis-2-widgets-glashaus`
const adapterName = require('../package.json').name.split('.').pop();

let page;
let browser;
/** Errors of the page while a widget is added */
let pageErrors = [];

describe(adapterName, () => {
    before(async function () {
        this.timeout(600000);
        // install js-controller, web and vis-2
        await helper.startIoBroker({ widgetsSetName: adapterName });
        const result = await helper.startBrowser(process.env.CI === 'true' || process.env.HEADLESS === 'true');
        browser = result.browser;
        page = result.page;
        page.on('pageerror', e => pageErrors.push(String(e && e.message ? e.message : e)));
        page.on('console', m => {
            if (m.type() === 'error' && /glashaus/i.test(m.text())) {
                pageErrors.push(m.text());
            }
        });
        await helper.createProject(page);

        // open widgets
        await helper.palette.openWidgetSet(page, adapterName);
        await helper.screenshot(page, '02_widgets_opened');
    });

    it('Check all Glashaus widgets', async function () {
        this.timeout(300000);
        const widgets = await helper.palette.getListOfWidgets(page, adapterName);
        if (!widgets.length) {
            throw new Error(`No widgets of "${adapterName}" found in the palette`);
        }
        const failed = [];
        for (const widgetName of widgets) {
            pageErrors = [];
            const wid = await helper.palette.addWidget(page, widgetName);
            // give animations, history requests and the particle engine a moment
            await new Promise(resolve => setTimeout(resolve, 2500));
            await helper.screenshot(page, `10_${widgetName}`);
            await helper.view.deleteWidget(page, wid);
            if (pageErrors.length) {
                failed.push(`${widgetName}: ${pageErrors.join(' | ')}`);
            }
        }
        if (failed.length) {
            throw new Error(`Errors while adding widgets:\n${failed.join('\n')}`);
        }
    });

    after(async function () {
        this.timeout(20000);
        await helper.stopBrowser(browser);
        await helper.stopIoBroker();
    });
});
