import { _decorator, Component, Node, Button, tween, Tween, Vec3 } from 'cc';
import { ExclusiveUIPanelId, closeOtherExclusivePanels } from './ExclusiveUIPanels';

const { ccclass, property } = _decorator;

/**
 * По клику на кнопку открывает/закрывает панель Tasks с плавной анимацией масштаба (меньше → больше).
 * Повесь на ноду ButtonTasks, в tasksRoot укажи ноду Tasks.
 */
@ccclass('TasksPanelToggle')
export class TasksPanelToggle extends Component {
    @property({ type: Node, tooltip: 'Корневая нода панели заданий (Tasks)' })
    tasksRoot: Node | null = null;

    @property({ type: Node, tooltip: 'Иконка на кнопке: видна пока меню целей открыто (или дочерняя IconButtonGreenCheck)' })
    iconButtonGreenCheck: Node | null = null;

    @property({ tooltip: 'Длительность открытия (сек)' })
    openDuration = 0.38;

    @property({ tooltip: 'Длительность закрытия (сек)' })
    closeDuration = 0.28;

    @property({ tooltip: 'Начальный масштаб при открытии (доля от 1)' })
    openFromScale = 0.72;

    @property({ tooltip: 'Конечный масштаб перед скрытием' })
    closeToScale = 0.82;

    @property({ tooltip: 'Easing при открытии: backOut, cubicOut, quartOut, sineOut' })
    openEasing = 'backOut';

    @property({ tooltip: 'Easing при закрытии: quadIn, cubicIn, sineIn' })
    closeEasing = 'quadIn';

    private _animating = false;
    /** Подписка на клик уже повешена (onEnable может вызываться повторно). */
    private _inputWired = false;
    /** Один кадр/платформа может дать и CLICK, и MOUSE_UP — не переключать дважды. */
    private _toggleFrameLock = false;

    onLoad() {
        if (!this.iconButtonGreenCheck) {
            this.iconButtonGreenCheck = this.node.getChildByName('IconButtonGreenCheck') ?? null;
        }
        const menuOpen = this.tasksRoot?.active ?? false;
        this.setOpenIndicator(menuOpen);
    }

    start() {
        this.wireInput();
    }

    onEnable() {
        this.wireInput();
    }

    onDisable() {
        this.unwireInput();
    }

    onDestroy() {
        this.unwireInput();
        if (this.tasksRoot?.isValid) {
            Tween.stopAllByTarget(this.tasksRoot);
        }
    }

    private wireInput() {
        if (this._inputWired) {
            return;
        }
        const btn = this.node.getComponent(Button) ?? this.node.getComponentInChildren(Button);
        if (btn) {
            btn.node.on(Button.EventType.CLICK, this.onToggle, this);
        } else {
            console.warn('[TasksPanelToggle] Нет Button на ноде и в дочерних — только TOUCH/MOUSE');
        }
        // Клик по дочерним спрайтам не всегда даёт Button.CLICK; события на корне ловят жест по всей подноде.
        this.node.on(Node.EventType.TOUCH_END, this.onToggle, this);
        this.node.on(Node.EventType.MOUSE_UP, this.onToggle, this);
        this._inputWired = true;
    }

    private unwireInput() {
        if (!this._inputWired) {
            return;
        }
        const btn = this.node.getComponent(Button) ?? this.node.getComponentInChildren(Button);
        if (btn) {
            btn.node.off(Button.EventType.CLICK, this.onToggle, this);
        }
        this.node.off(Node.EventType.TOUCH_END, this.onToggle, this);
        this.node.off(Node.EventType.MOUSE_UP, this.onToggle, this);
        this._inputWired = false;
    }

    private onToggle() {
        if (this._toggleFrameLock) {
            return;
        }
        this._toggleFrameLock = true;
        this.scheduleOnce(() => {
            this._toggleFrameLock = false;
        }, 0);

        if (!this.tasksRoot || !this.tasksRoot.isValid) {
            console.warn('[TasksPanelToggle] tasksRoot не назначен');
            return;
        }
        if (!this.tasksRoot.active) {
            this._animating = false;
        }
        if (this._animating) {
            return;
        }
        if (this.tasksRoot.active) {
            this.animateClose();
        } else {
            closeOtherExclusivePanels(ExclusiveUIPanelId.Tasks);
            this.animateOpen();
        }
    }

    private setOpenIndicator(visible: boolean) {
        if (this.iconButtonGreenCheck?.isValid) {
            this.iconButtonGreenCheck.active = visible;
        }
    }

    private animateOpen() {
        const root = this.tasksRoot!;
        this._animating = true;
        Tween.stopAllByTarget(root);

        const s0 = Math.max(0.05, this.openFromScale);
        const s1 = 1;
        root.setScale(s0, s0, 1);
        root.active = true;
        this.setOpenIndicator(true);

        const dur = Math.max(0.05, this.openDuration);
        tween(root)
            .to(
                dur,
                { scale: new Vec3(s1, s1, 1) },
                { easing: this.openEasing as any },
            )
            .call(() => {
                this._animating = false;
            })
            .start();
    }

    private animateClose() {
        const root = this.tasksRoot!;
        this.setOpenIndicator(false);
        this._animating = true;
        Tween.stopAllByTarget(root);

        const end = Math.max(0.05, this.closeToScale);
        const dur = Math.max(0.05, this.closeDuration);

        tween(root)
            .to(
                dur,
                { scale: new Vec3(end, end, 1) },
                { easing: this.closeEasing as any },
            )
            .call(() => {
                root.active = false;
                root.setScale(1, 1, 1);
                this._animating = false;
            })
            .start();
    }
}
