import { _decorator, Component, director, game, Label, LabelOutline, LabelShadow, Node, sys, tween, UIOpacity, UITransform, Vec3, view } from 'cc';
import { DEBUG } from 'cc/env';
import { dlog } from './Debug';

const { ccclass, property } = _decorator;

export type GraphicsQuality = 'low' | 'medium' | 'high';

@ccclass('PerformanceManager')
export class PerformanceManager extends Component {
    public static readonly QUALITY_STORAGE_KEY = 'farm_clicker_quality_v1';

    @property({ tooltip: 'FPS ниже этого значения считаем просадкой' })
    lowFpsThreshold = 40;

    @property({ tooltip: 'Сколько секунд низкого FPS подряд нужно для переключения в 30 FPS' })
    lowFpsDurationSec = 5;

    @property({ tooltip: 'Порог для возврата 60 FPS после падения' })
    recoverFpsThreshold = 52;

    @property({ tooltip: 'Сколько секунд устойчивого FPS нужно для возврата в 60 FPS' })
    recoverDurationSec = 8;

    @property({ tooltip: 'Предупреждение на экранах уже этого значения (px)' })
    widthWarningThreshold = 360;

    private _lowFpsAccum = 0;
    private _recoverFpsAccum = 0;
    private _currentTargetFps = 60;
    private _quality: GraphicsQuality = 'high';

    onLoad() {
        this._quality = this.readQuality();
        this.setTargetFps(60);
        this.applyGraphicsQuality(this._quality);
    }

    start() {
        this.logResolutionIfDebug();
        this.warnOnNarrowViewport();
        view.on('canvas-resize', this.onResize, this);
    }

    onDestroy() {
        view.off('canvas-resize', this.onResize, this);
    }

    update(dt: number) {
        const fps = dt > 0 ? 1 / dt : 0;
        if (fps <= 0) {
            return;
        }

        if (this._currentTargetFps >= 60) {
            if (fps < this.lowFpsThreshold) {
                this._lowFpsAccum += dt;
                if (this._lowFpsAccum >= this.lowFpsDurationSec) {
                    this.setTargetFps(30);
                    this._lowFpsAccum = 0;
                    this._recoverFpsAccum = 0;
                    this.forceAtLeastMediumForWeakDevice();
                }
            } else {
                this._lowFpsAccum = 0;
            }
            return;
        }

        if (fps > this.recoverFpsThreshold) {
            this._recoverFpsAccum += dt;
            if (this._recoverFpsAccum >= this.recoverDurationSec) {
                this.setTargetFps(60);
                this._recoverFpsAccum = 0;
            }
        } else {
            this._recoverFpsAccum = 0;
        }
    }

    private onResize = () => {
        this.logResolutionIfDebug();
        this.warnOnNarrowViewport();
    };

    private setTargetFps(value: 30 | 60) {
        this._currentTargetFps = value;
        game.frameRate = value;
    }

    private readQuality(): GraphicsQuality {
        const raw = sys.localStorage.getItem(PerformanceManager.QUALITY_STORAGE_KEY);
        if (raw === 'low' || raw === 'medium' || raw === 'high') {
            return raw;
        }
        return 'high';
    }

    private saveQuality(q: GraphicsQuality) {
        this._quality = q;
        sys.localStorage.setItem(PerformanceManager.QUALITY_STORAGE_KEY, q);
    }

    private forceAtLeastMediumForWeakDevice() {
        if (this._quality === 'high') {
            this.saveQuality('medium');
            this.applyGraphicsQuality('medium');
        }
    }

    private applyGraphicsQuality(q: GraphicsQuality) {
        const scene = director.getScene();
        if (!scene) {
            return;
        }

        const hudLabelNames = ['MoneyTextCount', 'MoneyDPS', 'LevelText'];
        for (const name of hudLabelNames) {
            const node = this.findNodeDeepByName(scene, name);
            const label = node?.getComponent(Label) ?? node?.getComponentInChildren(Label);
            if (!label) {
                continue;
            }

            const outline = label.getComponent(LabelOutline);
            const shadow = label.getComponent(LabelShadow);

            if (outline) {
                outline.enabled = q !== 'low';
            }
            if (shadow) {
                shadow.enabled = q === 'high';
            }
        }
    }

    private logResolutionIfDebug() {
        if (!DEBUG) {
            return;
        }
        const visible = view.getVisibleSize();
        dlog(`[PerformanceManager] Visible size: ${Math.round(visible.width)}x${Math.round(visible.height)}`);
    }

    private warnOnNarrowViewport() {
        const frame = view.getFrameSize();
        if (frame.width >= this.widthWarningThreshold) {
            return;
        }
        this.showToast(`Ширина экрана ${Math.round(frame.width)}px: проверь мобильную верстку`);
    }

    private showToast(message: string) {
        const scene = director.getScene();
        const uiRoot = this.findNodeDeepByName(scene, 'UI') ?? scene;
        if (!uiRoot) {
            return;
        }

        const toast = new Node('PerfWarningToast');
        const tr = toast.addComponent(UITransform);
        tr.setContentSize(760, 60);
        const opacity = toast.addComponent(UIOpacity);
        opacity.opacity = 220;
        const label = toast.addComponent(Label);
        label.string = message;
        label.fontSize = 22;
        label.lineHeight = 26;
        toast.setPosition(new Vec3(0, 300, 0));

        uiRoot.addChild(toast);
        tween(opacity)
            .delay(1.6)
            .to(0.35, { opacity: 0 })
            .call(() => {
                if (toast.isValid) {
                    toast.destroy();
                }
            })
            .start();
    }

    private findNodeDeepByName(root: Node | null, name: string): Node | null {
        if (!root?.isValid) {
            return null;
        }
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
}
