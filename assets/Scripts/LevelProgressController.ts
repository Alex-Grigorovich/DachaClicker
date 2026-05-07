import { _decorator, Component, Label, Node, ProgressBar, tween, Tween, UITransform } from 'cc';
import { LocalizationManager } from './LocalizationManager';
import { MoneyManager } from './MoneyManager';
import { YandexSDKManager } from './YandexSDKManager';

const { ccclass, property } = _decorator;

@ccclass('LevelProgressController')
export class LevelProgressController extends Component {
    @property({ type: ProgressBar, tooltip: 'UI ProgressBar уровня. Пусто — берётся с этой ноды.' })
    progressBar: ProgressBar | null = null;

    @property({ type: Label, tooltip: 'Текст уровня (например "ур. 1").' })
    levelText: Label | null = null;

    @property({ type: Label, tooltip: 'Подсказка XP вида +cur/need XP' })
    xpHintLabel: Label | null = null;

    @property({ tooltip: 'Сколько totalEarned нужно на переход с 1 на 2 уровень.' })
    baseXpForLevel2 = 100;

    @property({ tooltip: 'Множитель роста требования к следующему уровню.' })
    levelGrowth = 1.35;

    @property({ tooltip: 'Частота обновления UI (сек).' })
    refreshInterval = 0.1;

    @property({ tooltip: 'Минимальный интервал между fullscreen-рекламами при level-up (сек)' })
    levelUpAdCooldownSec = 240;

    private _progressTweenState = { value: 0 };
    private _progressTween: Tween<{ value: number }> | null = null;
    private _barFillUi: UITransform | null = null;
    private _barFillBaseWidth = 0;
    private _lastLevel = 1;
    private _lastLevelUpAdAt = 0;

    onLoad() {
        void LocalizationManager.init();
        if (!this.progressBar) {
            this.progressBar = this.getComponent(ProgressBar) ?? this.getComponentInChildren(ProgressBar);
        }
        if (!this.xpHintLabel) {
            const xpNode = this.findNodeDeepByName(this.node.scene ?? this.node, 'XpHint');
            if (xpNode?.isValid) {
                this.xpHintLabel = xpNode.getComponent(Label) ?? xpNode.getComponentInChildren(Label);
            }
        }
        this.captureBarFill();
    }

    start() {
        this.refreshNow();
        this.schedule(this.refreshNow, Math.max(0.03, this.refreshInterval));
    }

    onDisable() {
        this.unschedule(this.refreshNow);
        if (this._progressTween) {
            this._progressTween.stop();
            this._progressTween = null;
        }
    }

    public refreshNow = () => {
        const mm = MoneyManager.getInstance();
        const earned = mm ? Math.max(0, Math.floor(mm.getTotalEarned())) : 0;
        const state = this.computeLevelState(earned);

        this.animateProgressBar(state.progress);
        if (this.levelText) {
            this.levelText.string = `ур. ${state.level}`;
        }
        if (this.xpHintLabel) {
            this.xpHintLabel.string = LocalizationManager.t('xp.hint', {
                cur: Math.floor(state.currentXp),
                need: Math.floor(state.needXp),
            });
        }
        this.handleLevelUp(state.level, earned);
    };

    private handleLevelUp(level: number, score: number) {
        const previous = Math.max(1, this._lastLevel);
        if (level <= previous) {
            this._lastLevel = level;
            return;
        }
        this._lastLevel = level;
        const sdk = YandexSDKManager.getInstance();
        if (!sdk) {
            return;
        }
        void sdk.submitScore('total_earned', score);
        const now = Date.now();
        const cooldownMs = Math.max(0, this.levelUpAdCooldownSec * 1000);
        if (now - this._lastLevelUpAdAt < cooldownMs) {
            return;
        }
        this._lastLevelUpAdAt = now;
        void sdk.showFullscreenAd();
    }

    private captureBarFill() {
        if (!this.progressBar?.node?.isValid || this._barFillUi) {
            return;
        }
        const fill = this.findNodeDeepByName(this.progressBar.node, 'Bar');
        const fillUi = fill?.getComponent(UITransform) ?? null;
        if (!fillUi) {
            return;
        }
        this._barFillUi = fillUi;
        this._barFillBaseWidth = Math.max(1, fillUi.contentSize.width);
    }

    private animateProgressBar(targetProgress: number) {
        if (!this.progressBar?.isValid) {
            return;
        }
        this.captureBarFill();
        const target = Math.max(0, Math.min(1, targetProgress));
        const from = Math.max(0, Math.min(1, this.progressBar.progress));
        if (Math.abs(target - from) < 0.001) {
            this.progressBar.progress = target;
            this.applyFillWidth(target);
            return;
        }
        if (this._progressTween) {
            this._progressTween.stop();
            this._progressTween = null;
        }
        this._progressTweenState.value = from;
        this._progressTween = tween(this._progressTweenState)
            .to(0.18, { value: target }, {
                easing: 'quadOut',
                onUpdate: state => {
                    const p = Math.max(0, Math.min(1, state.value));
                    if (this.progressBar?.isValid) {
                        this.progressBar.progress = p;
                    }
                    this.applyFillWidth(p);
                },
            })
            .call(() => {
                this._progressTween = null;
                if (this.progressBar?.isValid) {
                    this.progressBar.progress = target;
                }
                this.applyFillWidth(target);
            })
            .start();
    }

    private applyFillWidth(progress: number) {
        if (!this._barFillUi?.isValid || this._barFillBaseWidth <= 0) {
            return;
        }
        const h = this._barFillUi.contentSize.height;
        this._barFillUi.setContentSize(this._barFillBaseWidth * progress, h);
    }

    private findNodeDeepByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const child of root.children) {
            const found = this.findNodeDeepByName(child, name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private computeLevelState(totalEarned: number): { level: number; progress: number; currentXp: number; needXp: number } {
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
        return {
            level,
            progress,
            currentXp: remaining,
            needXp: need,
        };
    }
}
