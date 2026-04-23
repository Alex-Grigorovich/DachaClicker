import { _decorator, Component, Node, screen, UITransform, view, macro, director } from 'cc';

const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('AdaptiveScale')
@executeInEditMode   // чтобы работало и в редакторе при смене ориентации
export class AdaptiveScale extends Component {

    @property({ type: Node, tooltip: 'GameField — основное игровое поле' })
    gameField: Node | null = null;

    @property({ type: [Node], tooltip: 'Кнопки слева (ButtonsLeft)' })
    leftButtons: Node[] = [];

    @property({ type: [Node], tooltip: 'Кнопки справа (ButtonsRight)' })
    rightButtons: Node[] = [];

    @property({ tooltip: 'Пороговое соотношение (width/height). Ниже — портрет' })
    portraitThreshold: number = 0.9;   // 0.9 — хороший баланс (меньше 1 — портрет)

    @property({ tooltip: 'Масштаб в портретном режиме (0.7–0.85 обычно хватает)' })
    portraitScale: number = 0.78;

    @property({ tooltip: 'Масштаб в ландшафтном режиме' })
    landscapeScale: number = 1.0;

    private originalScales = new Map<Node, number>();

    onLoad() {
        // Сохраняем оригинальные масштабы
        this.saveOriginalScales();
    }

    start() {
        this.applyAdaptiveScale();

        // Подписываемся на изменение размера окна / ориентации
        screen.on('window-resize', this.onScreenResize, this);
        // screen.on('orientation-change', this.onScreenResize, this); // можно добавить
    }

    onDestroy() {
        screen.off('window-resize', this.onScreenResize, this);
    }

    private saveOriginalScales() {
        if (this.gameField) {
            this.originalScales.set(this.gameField, this.gameField.scale.x);
        }
        [...this.leftButtons, ...this.rightButtons].forEach(node => {
            if (node) {
                this.originalScales.set(node, node.scale.x);
            }
        });
    }

    private onScreenResize() {
        // Небольшая задержка, чтобы экран точно обновился
        this.scheduleOnce(() => {
            this.applyAdaptiveScale();
        }, 0.05);
    }

    private applyAdaptiveScale() {
        const size = screen.windowSize;           // актуальный размер экрана
        const ratio = size.width / size.height;   // ширина / высота

        const isPortrait = ratio < this.portraitThreshold;

        const targetScale = isPortrait ? this.portraitScale : this.landscapeScale;

        console.log(`[AdaptiveScale] ratio: ${ratio.toFixed(3)}, ${isPortrait ? 'ПОРТРЕТ' : 'ЛАНДШАФТ'}, scale: ${targetScale}`);

        // Применяем масштаб к GameField
        if (this.gameField) {
            const orig = this.originalScales.get(this.gameField) || 1;
            this.gameField.setScale(orig * targetScale, orig * targetScale, 1);
        }

        // Применяем к кнопкам слева и справа
        const allButtons = [...this.leftButtons, ...this.rightButtons];
        allButtons.forEach(node => {
            if (node) {
                const orig = this.originalScales.get(node) || 1;
                node.setScale(orig * targetScale, orig * targetScale, 1);
            }
        });
    }

    // Для удобства — можно вызвать вручную из другого скрипта
    public refresh() {
        this.applyAdaptiveScale();
    }
}