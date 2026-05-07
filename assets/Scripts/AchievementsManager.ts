import { _decorator, Component, director } from 'cc';
import { MoneyManager } from './MoneyManager';
import { PlantFieldState } from './PlantFieldState';
import { UnlockManager } from './UnlockManager';
import { VegetableMenuHandler } from './VegetableMenuHandler';
import { YandexSDKManager } from './YandexSDKManager';

const { ccclass } = _decorator;

const ACHIEVEMENT_IDS = {
    plant10Carrots: 'posad_10_carrots',
    earn100Money: 'earn_100_money',
    unlockAllCultures: 'unlock_all_cultures',
} as const;

@ccclass('AchievementsManager')
export class AchievementsManager extends Component {
    private _unlocked = new Set<string>();

    update() {
        this.tryUnlockRuntimeAchievements();
    }

    private tryUnlockRuntimeAchievements() {
        if (PlantFieldState.getInstance().countByCulture('carrot') >= 10) {
            this.unlock(ACHIEVEMENT_IDS.plant10Carrots);
        }
        if ((MoneyManager.getInstance()?.getTotalEarned() ?? 0) >= 100) {
            this.unlock(ACHIEVEMENT_IDS.earn100Money);
        }

        const scene = director.getScene();
        const vegMenu = scene?.getComponentsInChildren(VegetableMenuHandler)?.[0] ?? null;
        const totalExtra = (vegMenu?.getMenuCultureDefs() ?? []).filter(i => !!i.blockName).length;
        if (totalExtra > 0 && UnlockManager.getUnlockedExtraCulturesCount(vegMenu?.getMenuCultureDefs() ?? []) >= totalExtra) {
            this.unlock(ACHIEVEMENT_IDS.unlockAllCultures);
        }
    }

    private unlock(id: string) {
        if (!id || this._unlocked.has(id)) {
            return;
        }
        this._unlocked.add(id);
        void YandexSDKManager.getInstance()?.unlockAchievement(id);
    }
}
