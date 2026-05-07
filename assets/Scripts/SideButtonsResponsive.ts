import { _decorator, Component, Node, view, Widget } from 'cc';
import { dlog } from './Debug';

const { ccclass, property } = _decorator;

@ccclass('SideButtonsResponsive')
export class SideButtonsResponsive extends Component {

    @property(Node) leftPanel: Node = null!;   // ButtonsLeft
    @property(Node) rightPanel: Node = null!;  // ButtonsRight
    @property(Node) gameField: Node = null!;   // GameField / контейнер с рядами

    onLoad() {
        this.scheduleOnce(this.adapt, 0.4);
        view.on('canvas-resize', this.adapt, this);
    }

    onDestroy() {
        view.off('canvas-resize', this.adapt, this);
    }

    adapt = () => {
        const ratio = view.getFrameSize().width / view.getFrameSize().height;
        dlog(`[Responsive] Ratio = ${ratio.toFixed(3)}`);

        const isNarrow = ratio < 0.8;

        if (isNarrow) {
            // Портрет
            this.applyMargins(12, 25);
            this.scaleGameField(0.88);
        } else {
            // Ландшафт / широкий
            this.applyMargins(65, 45);        // ← главное значение
            this.scaleGameField(1.0);
        }
    };

    private applyMargins(side: number, top: number) {
        this.applyToPanel(this.leftPanel, true, side, top);
        this.applyToPanel(this.rightPanel, false, side, top);
    }

    private applyToPanel(panel: Node, isLeft: boolean, sideMargin: number, topMargin: number) {
        if (!panel) return;

        let widget = panel.getComponent(Widget);
        if (!widget) {
            widget = panel.addComponent(Widget);
        }

        widget.isAlignTop = true;
        widget.top = topMargin;

        if (isLeft) {
            widget.isAlignLeft = true;
            widget.isAlignRight = false;
            widget.left = sideMargin;
        } else {
            widget.isAlignRight = true;
            widget.isAlignLeft = false;
            widget.right = sideMargin;
        }

        widget.updateAlignment();
    }

    private scaleGameField(scale: number) {
        if (this.gameField) {
            this.gameField.setScale(scale, scale);
        }
    }
}
