import react from '@vitejs/plugin-react';
import commonjs from 'vite-plugin-commonjs';
import { federation } from '@module-federation/vite';
import { moduleFederationShared } from '@iobroker/types-vis-2/modulefederation.vis.config';
import { existsSync, readFileSync } from 'node:fs';

const pack = JSON.parse(readFileSync('./package.json').toString());
const ioPack = JSON.parse(readFileSync('../io-package.json').toString());
const collection = ioPack.common.visWidgets.vis2GlashausWidgets;

// The widgets come from io-package.json (common.visWidgets.vis2GlashausWidgets.components): one file src/<Name>.tsx each.
// GH_WIDGETS=Name1,Name2 builds only these (for quick local tests).
const only = process.env.GH_WIDGETS ? process.env.GH_WIDGETS.split(',') : null;
const exposes: Record<string, string> = { './translations': './src/translations' };
for (const name of collection.components as string[]) {
    if (only && !only.includes(name)) {
        continue;
    }
    if (!existsSync(`./src/${name}.tsx`)) {
        throw new Error(`Widget "${name}" is listed in io-package.json, but src/${name}.tsx is missing`);
    }
    exposes[`./${name}`] = `./src/${name}`;
}

const config = {
    plugins: [
        federation({
            manifest: true,
            name: collection.name,
            filename: 'customWidgets.js',
            exposes,
            remotes: {},
            shared: moduleFederationShared(pack),
            dts: false,
        }),
        react(),
        commonjs(),
    ],
    server: {
        port: 3000,
        proxy: {
            '/_socket': 'http://localhost:8082',
            '/vis.0': 'http://localhost:8082',
            '/adapter': 'http://localhost:8082',
            '/habpanel': 'http://localhost:8082',
            '/vis': 'http://localhost:8082',
            '/widgets': 'http://localhost:8082/vis',
            '/widgets.html': 'http://localhost:8082/vis',
            '/web': 'http://localhost:8082',
            '/state': 'http://localhost:8082',
        },
    },
    base: './',
    resolve: {
        tsconfigPaths: true,
        dedupe: ['react', 'react-dom'],
    },
    build: {
        target: 'chrome89',
        outDir: './build',
        rollupOptions: {
            onwarn(warning: { code: string }, warn: (warning: { code: string }) => void): void {
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
                    return;
                }
                warn(warning);
            },
        },
    },
};

export default config;
