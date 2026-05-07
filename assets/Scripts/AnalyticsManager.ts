import { _decorator, Component } from 'cc';
import { DEBUG } from 'cc/env';
import { dinfo } from './Debug';
import { TutorialManager } from './TutorialManager';
import { UpgradeManager } from './UpgradeManager';
import { YandexSDKManager } from './YandexSDKManager';

const { ccclass } = _decorator;

type AnalyticsEvent = 'game_started' | 'tutorial_completed' | 'first_upgrade_purchased' | 'session_ended';

@ccclass('AnalyticsManager')
export class AnalyticsManager extends Component {
    private _sessionStartAt = 0;
    private _tutorialReported = false;
    private _firstUpgradeReported = false;

    onLoad() {
        this._sessionStartAt = Date.now();
        this.reportEvent('game_started');
    }

    update() {
        if (!this._tutorialReported && TutorialManager.getInstance()?.hasCompletedTutorial()) {
            this._tutorialReported = true;
            this.reportEvent('tutorial_completed');
        }
        if (!this._firstUpgradeReported && this.hasAnyUpgradePurchased()) {
            this._firstUpgradeReported = true;
            this.reportEvent('first_upgrade_purchased');
        }
    }

    onDestroy() {
        const durationSec = Math.max(0, Math.floor((Date.now() - this._sessionStartAt) / 1000));
        this.reportEvent('session_ended', { durationSec });
    }

    private hasAnyUpgradePurchased(): boolean {
        const all = UpgradeManager.getAll();
        for (const def of all) {
            if (UpgradeManager.getLevel(def.id) > 0) {
                return true;
            }
        }
        return false;
    }

    private reportEvent(name: AnalyticsEvent, payload?: Record<string, unknown>) {
        const sdk = YandexSDKManager.getInstance();
        const ysdk = sdk?.getYsdk() as any;
        if (ysdk?.features?.GameplayAPI) {
            if (name === 'game_started') {
                ysdk.features.GameplayAPI.start?.();
            }
            if (name === 'session_ended') {
                ysdk.features.GameplayAPI.stop?.();
            }
            return;
        }
        if (DEBUG) {
            dinfo('[Analytics]', name, payload ?? {});
        }
    }
}
