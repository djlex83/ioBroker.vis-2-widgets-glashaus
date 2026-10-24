/* Translations of the widget set. Every widget keeps its texts in its own file `i18n/<Widget>.json`
 * ({ en: {...}, de: {...}, ... }); `core.json` holds the shared ones. Missing languages fall back to English.
 * vis-2 adds the prefix `vis-2-widgets-glashaus_` to every key (prefix: true). */
const LANGS = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'] as const;

type Part = Partial<Record<(typeof LANGS)[number], Record<string, string>>>;

const parts = import.meta.glob<Part>('./i18n/*.json', { eager: true, import: 'default' });

const translations: Record<string, Record<string, string> | boolean> = { prefix: true };

for (const l of LANGS) {
    const words: Record<string, string> = {};
    for (const part of Object.values(parts)) {
        Object.assign(words, part.en || {}, part[l] || {});
    }
    translations[l] = words;
}

export default translations;
