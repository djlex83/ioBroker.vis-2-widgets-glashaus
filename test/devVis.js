/* Starts a local ioBroker with web + vis-2 + this widget set (same setup as the test) and keeps it running.
 * npm run build && node test/devVis.js  →  editor: http://127.0.0.1:18082/vis-2/edit.html  (Ctrl+C stops it)
 * Note: the test helper does not work in folders whose path contains spaces. */
const helper = require('@iobroker/vis-2-widgets-testing');

const adapterName = require('../package.json').name.split('.').pop();

async function main() {
    await helper.startIoBroker({ widgetsSetName: adapterName });
    console.log('\nioBroker is running: http://127.0.0.1:18082/vis-2/edit.html  (Ctrl+C to stop)\n');
    const stop = async () => {
        await helper.stopIoBroker();
        process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
