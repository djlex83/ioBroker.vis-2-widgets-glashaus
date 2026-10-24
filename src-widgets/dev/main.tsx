/* Harness: shows every Glashaus widget with simulated values, side by side in light and dark.
 * URL parameters: w=<Widget> (filter), s=<scenario>, theme=light|dark|both, edit=1, lang=de|en, solo=1 (one column, no labels)
 * The button "swap theme" (#harness-swap) switches the theme of the mounted widgets. */
import React from 'react';
import { createRoot } from 'react-dom/client';

import { env, store, makeContext, socket } from './mockVis';
import type { Scenario } from './scenario';

const q = new URLSearchParams(location.search);
env.lang = (q.get('lang') as ioBroker.Languages) || 'de';
const onlyWidget = q.get('w');
const onlyScenario = q.get('s');
const themes: ('light' | 'dark')[] =
    q.get('theme') === 'light' ? ['light'] : q.get('theme') === 'dark' ? ['dark'] : ['light', 'dark'];
const edit = q.get('edit') === '1';
const solo = q.get('solo') === '1';

const widgetMods = import.meta.glob('../src/Glashaus*.tsx');
const scenarioMods = import.meta.glob<Scenario[]>('./scenarios/*.ts', { eager: true, import: 'default' });

(window as any).__harness = { store, env, socket };

async function main(): Promise<void> {
    const list: { name: string; Comp: any; scenarios: Scenario[] }[] = [];
    for (const [path, load] of Object.entries(widgetMods)) {
        const name = path.split('/').pop()!.replace('.tsx', '');
        if (onlyWidget && onlyWidget !== name) {
            continue;
        }
        const mod: any = await load();
        const Comp = mod.default;
        const info = Comp.getWidgetInfo();
        (window as any).__harness.infos = { ...(window as any).__harness.infos, [name]: info };
        let scenarios = Object.values(scenarioMods)
            .flat()
            .filter(s => s.widget === name);
        if (!scenarios.length) {
            scenarios = [
                {
                    widget: name,
                    name: 'default',
                    w: parseInt(info.visDefaultStyle?.width, 10) || 320,
                    h: parseInt(info.visDefaultStyle?.height, 10) || 200,
                },
            ];
        }
        scenarios.forEach(s =>
            Object.entries(s.states || {}).forEach(([id, def]) => {
                if (!store.get(id)) {
                    store.define(id, def.val, def);
                }
            }),
        );
        if (onlyScenario) {
            scenarios = scenarios.filter(s => s.name === onlyScenario);
        }
        list.push({ name, Comp, scenarios });
    }

    function App(): React.JSX.Element {
        // "swap" re-renders the mounted widgets with the other theme (tests the retheme path)
        const [swap, setSwap] = React.useState(false);
        const eff = (t: 'light' | 'dark'): 'light' | 'dark' => (swap ? (t === 'light' ? 'dark' : 'light') : t);
        return (
            <>
                {solo ? null : (
                    <div className="bar">
                        <b>Glashaus harness</b>
                        {list.map(l => (
                            <a
                                key={l.name}
                                href={`?w=${l.name}`}
                            >
                                {l.name}
                            </a>
                        ))}
                        <a href="?">all</a>
                        <button
                            id="harness-swap"
                            onClick={() => setSwap(!swap)}
                        >
                            swap theme
                        </button>
                    </div>
                )}
                <div className="cols">
                    {themes.map(theme => (
                        <div
                            key={theme}
                            className={`col ${eff(theme)}`}
                            data-theme={eff(theme)}
                        >
                            {list.map(l =>
                                l.scenarios.map(s => (
                                    <div
                                        className="sc"
                                        key={`${l.name}-${s.name}`}
                                        data-widget={l.name}
                                        data-scenario={s.name}
                                    >
                                        {solo ? null : (
                                            <div className="lbl">
                                                {l.name} · {s.name}
                                            </div>
                                        )}
                                        <l.Comp
                                            id={`w_${l.name}_${s.name}_${theme}`}
                                            view="harness"
                                            data={s.data || {}}
                                            editMode={edit}
                                            width={s.w}
                                            height={s.h}
                                            themeType={eff(theme)}
                                            lang={env.lang}
                                            context={makeContext(eff(theme), env.lang)}
                                        />
                                    </div>
                                )),
                            )}
                        </div>
                    ))}
                </div>
            </>
        );
    }

    createRoot(document.getElementById('root')!).render(<App />);
}

main().catch(e => {
    console.error(e);
    document.body.textContent = String(e);
});
