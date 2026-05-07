import { _decorator, Component, Node, screen, sys, view, Widget } from 'cc';

const { ccclass, property } = _decorator;

type InsetsPx = { top: number; bottom: number; left: number; right: number };

@ccclass('SafeAreaLayout')
export class SafeAreaLayout extends Component {
    @property({ type: Node, tooltip: 'Пусто: автоматический поиск Moneybar в сцене' })
    moneybarNode: Node | null = null;

    @property({ type: Node, tooltip: 'Пусто: автоматический поиск Container в сцене' })
    containerNode: Node | null = null;

    @property({ tooltip: 'Дополнительный отступ сверху (в UI-единицах) поверх safe area' })
    extraTop = 0;

    @property({ tooltip: 'Дополнительный отступ снизу (в UI-единицах) поверх safe area' })
    extraBottom = 0;

    private _baseMoneybarTop: number | null = null;
    private _baseContainerBottom: number | null = null;

    onLoad() {
        this.resolveNodes();
        this.captureBaseOffsets();
        this.applySafeArea();
        view.on('canvas-resize', this.applySafeArea, this);
    }

    onDestroy() {
        view.off('canvas-resize', this.applySafeArea, this);
    }

    private resolveNodes() {
        const scene = this.node.scene;
        if (!scene) {
            return;
        }
        if (!this.moneybarNode?.isValid) {
            this.moneybarNode = this.findNodeDeepByName(scene, 'Moneybar');
        }
        if (!this.containerNode?.isValid) {
            this.containerNode = this.findNodeDeepByName(scene, 'Container');
        }
    }

    private captureBaseOffsets() {
        const moneybarWidget = this.moneybarNode?.getComponent(Widget);
        if (moneybarWidget && this._baseMoneybarTop == null) {
            this._baseMoneybarTop = moneybarWidget.top;
        }

        const containerWidget = this.containerNode?.getComponent(Widget);
        if (containerWidget && this._baseContainerBottom == null) {
            this._baseContainerBottom = containerWidget.bottom;
        }
    }

    private applySafeArea = () => {
        this.resolveNodes();
        this.captureBaseOffsets();

        const frame = view.getFrameSize();
        const visible = view.getVisibleSize();
        if (frame.width <= 0 || frame.height <= 0 || visible.width <= 0 || visible.height <= 0) {
            return;
        }

        const insets = this.resolveInsetsPx();
        const toUiY = visible.height / frame.height;

        const topUi = insets.top * toUiY;
        const bottomUi = insets.bottom * toUiY;

        const moneybarWidget = this.moneybarNode?.getComponent(Widget);
        if (moneybarWidget && this._baseMoneybarTop != null) {
            moneybarWidget.isAlignTop = true;
            moneybarWidget.top = this._baseMoneybarTop + topUi + this.extraTop;
            moneybarWidget.updateAlignment();
        }

        const containerWidget = this.containerNode?.getComponent(Widget);
        if (containerWidget && this._baseContainerBottom != null) {
            containerWidget.isAlignBottom = true;
            containerWidget.bottom = this._baseContainerBottom + bottomUi + this.extraBottom;
            containerWidget.updateAlignment();
        }
    };

    private resolveInsetsPx(): InsetsPx {
        if (sys.os !== sys.OS.IOS) {
            return { top: 0, bottom: 0, left: 0, right: 0 };
        }

        const screenAny = screen as unknown as Record<string, any>;
        const edge = screenAny.safeAreaEdge ?? screenAny.safeAreaInsets;
        if (edge) {
            return {
                top: Number(edge.top) || 0,
                bottom: Number(edge.bottom) || 0,
                left: Number(edge.left) || 0,
                right: Number(edge.right) || 0,
            };
        }

        const safeRect = screenAny.safeAreaRect;
        const windowSize = screen.windowSize;
        if (safeRect && windowSize) {
            const top = Math.max(0, windowSize.height - (safeRect.y + safeRect.height));
            const bottom = Math.max(0, safeRect.y);
            const left = Math.max(0, safeRect.x);
            const right = Math.max(0, windowSize.width - (safeRect.x + safeRect.width));
            return { top, bottom, left, right };
        }

        return { top: 0, bottom: 0, left: 0, right: 0 };
    }

    private findNodeDeepByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const c of root.children) {
            const found = this.findNodeDeepByName(c, name);
            if (found) {
                return found;
            }
        }
        return null;
    }
}
