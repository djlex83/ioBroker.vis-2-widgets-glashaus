/* Translations of the widget set: one file per language in i18n/ (keys without prefix).
 * vis-2 adds the prefix `vis-2-widgets-glashaus_` to every key (prefix: true). Missing keys fall back to English. */
import langEn from './i18n/en.json';
import langDe from './i18n/de.json';
import langRu from './i18n/ru.json';
import langPt from './i18n/pt.json';
import langNl from './i18n/nl.json';
import langFr from './i18n/fr.json';
import langIt from './i18n/it.json';
import langEs from './i18n/es.json';
import langPl from './i18n/pl.json';
import langUk from './i18n/uk.json';
import langZh from './i18n/zh-cn.json';

const withEn = (words: Record<string, string>): Record<string, string> => ({ ...langEn, ...words });

const translations = {
    en: langEn as Record<string, string>,
    de: withEn(langDe),
    ru: withEn(langRu),
    pt: withEn(langPt),
    nl: withEn(langNl),
    fr: withEn(langFr),
    it: withEn(langIt),
    es: withEn(langEs),
    pl: withEn(langPl),
    uk: withEn(langUk),
    'zh-cn': withEn(langZh),
    prefix: true,
};

export default translations;
