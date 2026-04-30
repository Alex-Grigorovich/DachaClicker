import { _decorator, Component, Label, ProgressBar } from 'cc';
import { MoneyManager } from './MoneyManager';

const { ccclass, property } = _decorator;

@ccclass('LevelProgressController')
export class LevelProgressController extends Component {
    @property({ type: ProgressBar, tooltip: 'UI ProgressBar уровня. Пусто — берётся с этой ноды.' })
    progressBar: ProgressBar | null = null;

    @property({ type: Label, tooltip: 'Текст уровня (например "ур. 1").' })
    levelText: Label | null = null;

    @property({ tooltip: 'Сколько totalEarned нужно на переход с 1 на 2 уровень.' })
    baseXpForLevel2 = 100;

    @property({ tooltip: 'Множитель роста требования к следующему уровню.' })
    levelGrowth = 1.35;

    @property({ tooltip: 'Частота обновления UI (сек).' })
    refreshInterval = 0.1;

    onLoad() {
        if (!this.progressBar) {
            this.progressBar = this.getComponent(ProgressBar) ?? this.getComponentInChildren(ProgressBar);
        }
    }

    start() {
        this.refreshNow();
        this.schedule(this.refreshNow, Math.max(0.03, this.refreshInterval));
    }

    onDisable() {
        this.unschedule(this.refreshNow);
    }

    public refreshNow = () => {
        const mm = MoneyManager.getInstance();
        const earned = mm ? Math.max(0, Math.floor(mm.getTotalEarned())) : 0;
        const state = this.computeLevelState(earned);

        if (this.progressBar) {
            this.progressBar.progress = state.progress;
        }
        if (this.levelText) {
            this.levelText.string = `ур. ${state.level}`;
        }
    };

    private computeLevelState(totalEarned: number): { level: number; progress: number } {
        const growth = Math.max(1.01, this.levelGrowth);
        let need = Math.max(1, Math.floor(this.baseXpForLevel2));
        let level = 1;
        let remaining = Math.max(0, Math.floor(totalEarned));

        let guard = 0;
        while (remaining >= need && guard < 5000) {
            remaining -= need;
            level += 1;
            need = Math.max(1, Math.floor(need * growth));
            guard += 1;
        }

        const progress = need > 0 ? Math.min(1, remaining / need) : 0;
        return { level, progress };
    }
}

