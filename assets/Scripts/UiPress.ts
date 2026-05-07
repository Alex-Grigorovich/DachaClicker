import { _decorator, Button, Component, Node, tween, Tween, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('UiPress')
export class UiPress extends Component {
    @property({ tooltip: 'Пиковый scale на нажатии' })
    pressedScale = 1.1;

    @property({ tooltip: 'Длительность фазы увеличения (сек)' })
    growDuration = 0.05;

    @property({ tooltip: 'Длительность возврата к базовому scale (сек)' })
    settleDuration = 0.1;

    private _baseScale: Vec3 = new Vec3(1, 1, 1);

    onLoad() {
        this._baseScale = this.node.scale.clone();
    }

    onEnable() {
        this.bind(true);
    }

    onDisable() {
        this.bind(false);
        this.restoreScaleInstant();
    }

    private bind(enable: boolean) {
        const fn = enable ? this.node.on : this.node.off;
        fn.call(this.node, Node.EventType.TOUCH_START, this.onPressStart, this);
        fn.call(this.node, Node.EventType.MOUSE_DOWN, this.onPressStart, this);

        fn.call(this.node, Node.EventType.TOUCH_END, this.onPressEnd, this);
        fn.call(this.node, Node.EventType.TOUCH_CANCEL, this.onPressEnd, this);
        fn.call(this.node, Node.EventType.MOUSE_UP, this.onPressEnd, this);
        fn.call(this.node, Node.EventType.MOUSE_LEAVE, this.onPressEnd, this);
    }

    private onPressStart = () => {
        if (!this.node.isValid) {
            return;
        }
        Tween.stopAllByTarget(this.node);
        const up = new Vec3(
            this._baseScale.x * this.pressedScale,
            this._baseScale.y * this.pressedScale,
            this._baseScale.z,
        );
        tween(this.node)
            .to(Math.max(0.02, this.growDuration), { scale: up }, { easing: 'quadOut' })
            .to(Math.max(0.04, this.settleDuration), { scale: this._baseScale.clone() }, { easing: 'quadIn' })
            .start();
    };

    private onPressEnd = () => {
        this.animateTo(1);
    };

    private animateTo(mul: number) {
        if (!this.node.isValid) {
            return;
        }
        Tween.stopAllByTarget(this.node);
        const next = new Vec3(this._baseScale.x * mul, this._baseScale.y * mul, this._baseScale.z);
        tween(this.node).to(Math.max(0.02, this.duration), { scale: next }).start();
    }

    private restoreScaleInstant() {
        if (!this.node.isValid) {
            return;
        }
        Tween.stopAllByTarget(this.node);
        this.node.setScale(this._baseScale);
    }
}
