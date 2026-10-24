/*!
 * ioBroker build tasks for the Glashaus widget set.
 *
 * Executed with `tsx` (see the `build` script in package.json).
 */
import { existsSync, readFileSync } from 'node:fs';
import { deleteFoldersRecursive, copyFiles, npmInstall, buildReact } from '@iobroker/build-tools';

const { name } = JSON.parse(readFileSync(`${__dirname}/package.json`, 'utf8')) as { name: string };

/** Name of the adapter without the `iobroker.` prefix: `vis-2-widgets-glashaus` */
const adapterName = name.replace('iobroker.', '');

const srcDir = 'src-widgets/';

/** Build the widget project and copy the result into `widgets/<adapterName>` */
async function build(): Promise<void> {
    const src = `${__dirname}/${srcDir}`;

    deleteFoldersRecursive(`${src}build`);
    deleteFoldersRecursive(`${__dirname}/widgets`);

    if (!existsSync(`${src}node_modules`)) {
        await npmInstall(src);
    }

    // tsc checks the sources first, then vite builds the bundle
    await buildReact(src, { rootDir: __dirname, vite: true, tsc: true });

    // `collectFiles()` strips the part before the first `*`, so the exclusion needs the same base folder
    copyFiles([`${srcDir}build/**/*`, `!${srcDir}build/index.html`], `widgets/${adapterName}`);
}

build().catch((e: unknown) => {
    console.error(`Cannot build: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
});
