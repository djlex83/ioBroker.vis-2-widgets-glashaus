/* Dev server for the widget harness (no module federation): npm run harness */
import react from '@vitejs/plugin-react';

export default {
    root: __dirname,
    plugins: [react()],
    cacheDir: process.env.GH_CACHE || '../node_modules/.vite-harness',
    server: { port: Number(process.env.PORT) || 5180, strictPort: true, host: '127.0.0.1' },
    resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: '../build-harness' },
};
