import { JsonAsset, resources } from 'cc';
import { PlantCultureKey } from './PlantFieldState';

export type BalanceCultureKey = Exclude<PlantCultureKey, '' | 'unknown'>;

export interface BalanceCultureDef {
    key: BalanceCultureKey;
    title: string;
    rowName: string;
    prefabKey: BalanceCultureKey;
    baseClickReward: number;
    passiveIncomePerSecond?: number;
    unlockCost: number;
    unlockedByDefault?: boolean;
    blockName?: string;
    menuOrder?: number;
}

export interface BalanceQuestCondition {
    key: string;
    operator: string;
    value: number;
}

export interface BalanceQuestReward {
    type: string;
    amount?: number;
    slot_index?: number;
}

export interface BalanceQuestDef {
    id: string;
    order: number;
    group?: string;
    title: string;
    description: string;
    titleKey?: string;
    descKey?: string;
    conditions: BalanceQuestCondition[];
    rewards: BalanceQuestReward[];
}

export interface BalanceQuestSection {
    id: string;
    title: string;
    description?: string;
    tracking_keys: string[];
    items: BalanceQuestDef[];
    minimal_first_implementation?: string[];
}

export interface BalanceFieldSlotUnlockDef {
    slotIndex: number;
    unlockSource: 'quest_reward' | 'money' | 'script';
    questId?: string;
    condition?: BalanceQuestCondition;
    label?: string;
}

export interface BalanceUpgradeDef {
    id: string;
    title: string;
    description: string;
    category: string;
    effectType: string;
    effectValues: number[];
    costs: number[];
    maxLevel: number;
    unlockCondition?: {
        type: string;
        key?: string;
        value?: number;
        cultureKey?: BalanceCultureKey;
    };
}

export interface BalanceData {
    version: number;
    cultures: BalanceCultureDef[];
    fieldSlotUnlocks?: BalanceFieldSlotUnlockDef[];
    quests: BalanceQuestSection;
    upgrades: BalanceUpgradeDef[];
    /** Макс. секунд оффлайн-пассивки за один заход (после — кэп). По умолчанию в коде, если не задано. */
    offlineCapSeconds?: number;
}

export const DEFAULT_BALANCE_RESOURCE_PATH = 'balance/BALANCE_DATA';

const _cache = new Map<string, BalanceData>();

export function loadBalanceData(
    resourcePath: string,
    done: (err: Error | null, data: BalanceData | null) => void,
): void {
    const path = resourcePath || DEFAULT_BALANCE_RESOURCE_PATH;
    const cached = _cache.get(path);
    if (cached) {
        done(null, cached);
        return;
    }

    resources.load(path, JsonAsset, (err, asset) => {
        if (err || !asset) {
            done(err ?? new Error(`[BalanceData] Не удалось загрузить ${path}`), null);
            return;
        }

        const json = asset.json as BalanceData;
        if (!isBalanceData(json)) {
            done(new Error(`[BalanceData] Некорректная структура JSON по пути ${path}`), null);
            return;
        }

        _cache.set(path, json);
        done(null, json);
    });
}

function isBalanceData(json: any): json is BalanceData {
    return (
        !!json &&
        Array.isArray(json.cultures) &&
        !!json.quests &&
        Array.isArray(json.quests.items) &&
        Array.isArray(json.upgrades)
    );
}
