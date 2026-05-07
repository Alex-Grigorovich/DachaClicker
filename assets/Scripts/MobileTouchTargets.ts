import { _decorator, Button, Component, Layout, Node, UITransform, Vec3, view } from 'cc';
import { UiPress } from './UiPress';

const { ccclass, property } = _decorator;

@ccclass('MobileTouchTargets')
export class MobileTouchTargets extends Component {
    @property({ tooltip: 'Минимальный touch target в px' })
    minTouchPx = 44;

    @property({ tooltip: 'Минимальный зазор между кнопками в px' })
    minGapPx = 8;

    @property({ tooltip: 'Автоматически добавлять UiPress на кнопки колонок' })
    autoAttachUiPress = true;

    private _baseSizeByNode = new Map<string, Vec3>();

    onLoad() {
        this.apply();
        view.on('canvas-resize', this.apply, this);
    }

    onDestroy() {
        view.off('canvas-resize', this.apply, this);
        this._baseSizeByNode.clear();
    }

    private apply = () => {
        const scene = this.node.scene;
        if (!scene) {
            return;
        }

        const left = this.findNodeDeepByName(scene, 'ButtonsLeft');
        const right = this.findNodeDeepByName(scene, 'ButtonsRight');
        for (const column of [left, right]) {
            if (!column?.isValid) {
                continue;
            }
            this.enforceGap(column);
            this.enforceButtons(column);
        }
    };

    private enforceGap(column: Node) {
        const layout = column.getComponent(Layout);
        if (!layout) {
            return;
        }
        const nextX = Math.max(layout.spacingX, this.minGapPx);
        const nextY = Math.max(layout.spacingY, this.minGapPx);
        if (nextX !== layout.spacingX || nextY !== layout.spacingY) {
            layout.spacingX = nextX;
            layout.spacingY = nextY;
            layout.updateLayout();
        }
    }

    private enforceButtons(column: Node) {
        const stack: Node[] = [column];
        while (stack.length) {
            const n = stack.pop()!;
            const button = n.getComponent(Button);
            if (button) {
                this.enforceSingleButtonHitArea(n);
                if (this.autoAttachUiPress && !n.getComponent(UiPress)) {
                    n.addComponent(UiPress);
                }
            }
            for (const child of n.children) {
                stack.push(child);
            }
        }
    }

    private enforceSingleButtonHitArea(node: Node) {
        let tr = node.getComponent(UITransform);
        if (!tr) {
            tr = node.addComponent(UITransform);
        }

        const base = this._baseSizeByNode.get(node.uuid) ?? new Vec3(tr.contentSize.width, tr.contentSize.height, 0);
        if (!this._baseSizeByNode.has(node.uuid)) {
            this._baseSizeByNode.set(node.uuid, base.clone());
        }

        const ws = node.worldScale;
        const sx = Math.max(0.0001, Math.abs(ws.x));
        const sy = Math.max(0.0001, Math.abs(ws.y));

        const needW = this.minTouchPx / sx;
        const needH = this.minTouchPx / sy;

        const nextW = Math.max(base.x, needW);
        const nextH = Math.max(base.y, needH);
        if (Math.abs(tr.contentSize.width - nextW) > 0.01 || Math.abs(tr.contentSize.height - nextH) > 0.01) {
            tr.setContentSize(nextW, nextH);
        }
    }

    private findNodeDeepByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const c of root.children) {
            const f = this.findNodeDeepByName(c, name);
            if (f) {
                return f;
            }
        }
        return null;
    }
}
