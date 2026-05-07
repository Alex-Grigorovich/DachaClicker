import { JsonAsset, resources, sys } from 'cc';
import { YandexSDKManager } from './YandexSDKManager';

type LocaleDict = Record<string, string>;
type LocaleCode = 'ru' | 'en';

const SUPPORTED: readonly LocaleCode[] = ['ru', 'en'];
const FALLBACK_LANG: LocaleCode = 'ru';

const FALLBACK_RU: LocaleDict = {
    'upgrade.max': 'МАКС',
    'upgrade.level': 'ур. {n}',
    'button.tasks': 'Задания',
    'button.vegetables': 'Список продуктов',
    'button.upgrade': 'Улучшить',
    'xp.hint': '+{cur}/{need} XP',
};

const FALLBACK_EN: LocaleDict = {
    'upgrade.max': 'MAX',
    'upgrade.level': 'lvl {n}',
    'button.tasks': 'Tasks',
    'button.vegetables': 'Products',
    'button.upgrade': 'Upgrade',
    'xp.hint': '+{cur}/{need} XP',
};

export class LocalizationManager {
    private static _inited = false;
    private static _initPromise: Promise<void> | null = null;
    private static _lang: LocaleCode = FALLBACK_LANG;
    private static _dict: LocaleDict = { ...FALLBACK_RU };
    private static _listeners = new Set<() => void>();

    public static init(): Promise<void> {
        if (this._initPromise) {
            return this._initPromise;
        }
        this._initPromise = this.initInternal();
        return this._initPromise;
    }

    public static getLang(): LocaleCode {
        return this._lang;
    }

    public static onChange(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    public static t(key: string, params?: Record<string, string | number>): string {
        const fromCurrent = this._dict[key];
        const fromFallback = this._lang === 'en' ? FALLBACK_EN[key] : FALLBACK_RU[key];
        const fallbackRu = FALLBACK_RU[key];
        const template = fromCurrent ?? fromFallback ?? fallbackRu ?? key;
        return this.applyParams(template, params);
    }

    public static tryT(key: string, params?: Record<string, string | number>): string | null {
        const template = this._dict[key];
        if (!template) {
            return null;
        }
        return this.applyParams(template, params);
    }

    private static async initInternal(): Promise<void> {
        if (this._inited) {
            return;
        }
        this._lang = this.resolveLanguage();
        const loaded = await this.loadLocale(this._lang);
        this._dict = loaded ?? (this._lang === 'en' ? { ...FALLBACK_EN } : { ...FALLBACK_RU });
        this._inited = true;
        for (const cb of this._listeners) {
            cb();
        }
    }

    private static resolveLanguage(): LocaleCode {
        const sdkLangRaw = String(
            ((YandexSDKManager.getInstance()?.getYsdk() as any)?.environment?.i18n?.lang ?? ''),
        ).toLowerCase();
        const browserLangRaw = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase();
        const raw = sdkLangRaw || browserLangRaw || FALLBACK_LANG;
        if (raw.startsWith('en')) {
            return 'en';
        }
        if (raw.startsWith('ru')) {
            return 'ru';
        }
        if (SUPPORTED.includes(raw as LocaleCode)) {
            return raw as LocaleCode;
        }
        return FALLBACK_LANG;
    }

    private static async loadLocale(lang: LocaleCode): Promise<LocaleDict | null> {
        const path = `locales/${lang}`;
        return await new Promise(resolve => {
            resources.load(path, JsonAsset, (err, asset) => {
                if (err || !asset?.json || typeof asset.json !== 'object') {
                    resolve(null);
                    return;
                }
                resolve(asset.json as LocaleDict);
            });
        });
    }

    private static applyParams(template: string, params?: Record<string, string | number>): string {
        if (!params) {
            return template;
        }
        return template.replace(/\{(\w+)\}/g, (_, k: string) => {
            const value = params[k];
            return value == null ? `{${k}}` : String(value);
        });
    }
}

if (!sys.isNative) {
    void LocalizationManager.init();
}
