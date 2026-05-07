import { _decorator, Component, Label } from 'cc';
import { YandexSDKManager } from './YandexSDKManager';

const { ccclass, property } = _decorator;

@ccclass('LeaderboardPanel')
export class LeaderboardPanel extends Component {
    @property({ type: Label, tooltip: 'Куда печатать топ, если нет отдельного списка нод' })
    outputLabel: Label | null = null;

    @property({ tooltip: 'Имя лидерборда в Яндекс SDK' })
    leaderboardName = 'total_earned';

    onEnable() {
        void this.refresh();
    }

    public async refresh(): Promise<void> {
        const sdk = YandexSDKManager.getInstance();
        if (!sdk) {
            this.setOutput('Leaderboard: SDK manager missing');
            return;
        }
        try {
            const rows = await sdk.getLeaderboard(this.leaderboardName);
            if (!rows.length) {
                this.setOutput('Leaderboard: no entries');
                return;
            }
            const text = rows
                .slice(0, 10)
                .map(r => `${r.rank}. ${r.name} — ${r.score}`)
                .join('\n');
            this.setOutput(text);
        } catch (err) {
            this.setOutput('Leaderboard load failed');
            console.warn('[LeaderboardPanel] refresh failed', err);
        }
    }

    private setOutput(text: string) {
        if (this.outputLabel?.isValid) {
            this.outputLabel.string = text;
        }
    }
}
