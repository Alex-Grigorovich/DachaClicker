import { _decorator, Button, Component, director, Label, Node, view } from 'cc';
import { DEBUG } from 'cc/env';
import { CellLockHandler } from './CellLockHandler';
import { dlog } from './Debug';
import { FxPool } from './FxPool';
import { MoneyManager } from './MoneyManager';
import { UnlockManager } from './UnlockManager';
import { VegetableMenuHandler } from './VegetableMenuHandler';

const { ccclass, property } = _decorator;

@ccclass('DebugPanel')
export class DebugPanel extends Component {
    @property({ type: Label, tooltip: 'Текстовый блок дебаг-панели (опционально)' })
    debugLabel: Label | null = null;

    @property({ type: Node, tooltip: 'Кнопка +1000 монет (опционально)' })
    addMoneyButton: Node | null = null;

    @property({ type: Node, tooltip: 'Кнопка открыть всё (опционально)' })
    unlockAllButton: Node | null = null;

    private _fps = 0;
    private _fpsFrames = 0;
    private _fpsAccum = 0;

    onLoad() {
        if (!DEBUG) {
            this.node.active = false;
            this.enabled = false;
            return;
        }
        this.bindButtons();
    }

    update(dt: number) {
        if (!DEBUG) {
            return;
        }
        this._fpsAccum += dt;
        this._fpsFrames += 1;
        if (this._fpsAccum >= 0.5) {
            this._fps = this._fpsFrames / Math.max(0.0001, this._fpsAccum);
            this._fpsFrames = 0;
            this._fpsAccum = 0;
            this.refreshDebugText();
        }
    }

    private bindButtons() {
        this.bindNodeClick(this.addMoneyButton, this.onAddMoney);
        this.bindNodeClick(this.unlockAllButton, this.onUnlockAll);
    }

    private bindNodeClick(node: Node | null, handler: () => void) {
        if (!node?.isValid) {
            return;
        }
        const btn = node.getComponent(Button);
        if (btn) {
            node.on(Button.EventType.CLICK, handler, this);
            return;
        }
        node.on(Node.EventType.TOUCH_END, handler, this);
        node.on(Node.EventType.MOUSE_UP, handler, this);
    }

    private onAddMoney = () => {
        MoneyManager.getInstance()?.addMoney(1000);
    };

    private onUnlockAll = () => {
        const scene = director.getScene();
        if (!scene) {
            return;
        }
        const menu = scene.getComponentsInChildren(VegetableMenuHandler)[0] ?? null;
        if (menu) {
            UnlockManager.unlockAll(menu.getMenuCultureDefs());
            menu.syncUnlockUiFromManager();
        }
        for (const lock of scene.getComponentsInChildren(CellLockHandler)) {
            lock.unlockByScript();
        }
        dlog('[DebugPanel] unlock all triggered');
    };

    private refreshDebugText() {
        if (!this.debugLabel?.isValid) {
            return;
        }
        const visible = view.getVisibleSize();
        this.debugLabel.string =
            `FPS: ${Math.round(this._fps)}\n` +
            `RES: ${Math.round(visible.width)}x${Math.round(visible.height)}\n` +
            `FX active: ${FxPool.getActiveCount()}`;
    }
}
