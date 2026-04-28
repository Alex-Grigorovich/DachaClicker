import { BalanceCultureDef } from './BalanceData';
import { notifyQuestProgress } from './QuestBridge';
import { notifyProgressChanged } from './ProgressBridge';

/**
 * Единое хранилище разблокированных культур (ключи из баланса).
 * UI (`VegetableMenuHandler`) только отображает состояние; покупка и сейв опираются на этот слой.
 */
export class UnlockManager {
    private static _cultures = new Set<string>();

    static seedFromMenuItems(items: BalanceCultureDef[]) {
        this._cultures.clear();
        for (const item of items) {
            if (item.unlockedByDefault) {
                this._cultures.add(item.key);
            }
        }
    }

    /** Дефолты из баланса + ключи из сейва (идемпотентно при повторном вызове с теми же данными). */
    static restoreCultureUnlocksFromSave(savedKeys: string[] | null | undefined, items: BalanceCultureDef[]) {
        this.seedFromMenuItems(items);
        if (!savedKeys?.length) {
            return;
        }
        for (const k of savedKeys) {
            if (k) {
                this._cultures.add(k);
            }
        }
    }

    static unlockCulture(key: string) {
        if (!key || this._cultures.has(key)) {
            return;
        }
        this._cultures.add(key);
        notifyQuestProgress();
        notifyProgressChanged();
    }

    static isCultureUnlocked(key: string): boolean {
        return this._cultures.has(key);
    }

    /** Ключи в порядке `menuOrder` из переданного списка культур (для сейва и отладки). */
    static getUnlockedCultureKeysOrdered(items: BalanceCultureDef[]): string[] {
        const out: string[] = [];
        for (const item of items) {
            if (this.isCultureUnlocked(item.key)) {
                out.push(item.key);
            }
        }
        return out;
    }

    /** Платные культуры (есть `blockName`), не считая сам факт блока в UI. */
    static getUnlockedExtraCulturesCount(items: BalanceCultureDef[]): number {
        let n = 0;
        for (const item of items) {
            if (!item.blockName) {
                continue;
            }
            if (this.isCultureUnlocked(item.key)) {
                n++;
            }
        }
        return n;
    }
}
