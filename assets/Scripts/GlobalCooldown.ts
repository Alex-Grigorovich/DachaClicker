import { _decorator, Component, ProgressBar, Tween, tween, director } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('GlobalCooldown')
export class GlobalCooldown extends Component {

    @property({ type: ProgressBar, tooltip: 'Общий ProgressBar перезарядки (в UI)' })
    cooldownBar: ProgressBar = null;

    @property({ tooltip: 'Длительность перезарядки в секундах' })
    cooldownTime: number = 1.0;


    

    private _active: boolean = false;
    private _tweenState: { p: number } | null = null;

    public isCooldownActive(): boolean {
        return this._active;
    }

    public startCooldown(): void {
        if (this._active || !this.cooldownBar || this.cooldownTime <= 0) {
            return;
        }

        this._active = true;
        this.cooldownBar.node.active = true;
        this.cooldownBar.progress = 0;

        if (!this._tweenState) {
            this._tweenState = { p: 0 };
        }

        Tween.stopAllByTarget(this._tweenState);

        tween(this._tweenState)
            .to(this.cooldownTime, { p: 1 }, {
                easing: 'linear',
                onUpdate: () => {
                    if (this._tweenState) {
                        this.cooldownBar.progress = Math.min(1, Math.max(0, this._tweenState.p));
                    }
                }
            })
            .call(() => {
                this._active = false;
                if (this.cooldownBar) {
                    this.cooldownBar.progress = 1;
                    this.cooldownBar.node.active = false;
                }
            })
            .start();
    }

    // Опционально: сброс при смене сцены
    onDestroy() {
        if (this._tweenState) {
            Tween.stopAllByTarget(this._tweenState);
        }
    }
}