import { _decorator, Camera, Component, Node, screen, Size, UITransform, Vec3, Widget } from 'cc';
const { ccclass, property } = _decorator;

export enum AdaptMode {
    FillNoBorder = 0, // Заполняет экран, обрезает края (без пустот)
    FitWidth = 1,     // Подгоняет по ширине
    FitHeight = 2     // Подгоняет по высоте
}

@ccclass('ResolutionAdapter')
export class ResolutionAdapter extends Component {
    @property({ tooltip: "Базовое разрешение (ширина)" })
    designWidth = 1280;
    
    @property({ tooltip: "Базовое разрешение (высота)" })
    designHeight = 720;

    @property({ tooltip: "Режим адаптации" })
    adaptMode = AdaptMode.FillNoBorder;

    // СЮДА перетащите ваш GameField (сетку с ячейками)
    @property({ tooltip: "Узел с игровым полем" })
    rootGameNode: Node = null;

    @property({ tooltip: "Камера" })
    sceneCamera: Camera = null;

    @property({ type: Node })
    moneybar: Node = null;

    @property({ type: Node })
    buttonsLeft: Node = null;

    @property({ type: Node })
    buttonsRight: Node = null;

    onLoad() {
        screen.on('window-resize', this.onResize, this);
        this.onResize();
    }

    onDestroy() {
        screen.off('window-resize', this.onResize, this);
    }

    private onResize() {
        const winSize = screen.windowSize;
        if (!winSize || winSize.width <= 0 || winSize.height <= 0) return;

        let finalScale = 1;

        // Рассчитываем масштаб
        switch (this.adaptMode) {
            case AdaptMode.FillNoBorder:
                // Заполняет весь экран (может обрезать поле по краям)
                finalScale = Math.max(winSize.width / this.designWidth, winSize.height / this.designHeight);
                break;
            case AdaptMode.FitWidth:
                finalScale = winSize.width / this.designWidth;
                break;
            case AdaptMode.FitHeight:
                finalScale = winSize.height / this.designHeight;
                break;
        }

        // Масштабируем ТОЛЬКО игровое поле
        if (this.rootGameNode) {
            this.rootGameNode.setScale(new Vec3(finalScale, finalScale, 1));
        }

        // Корректируем камеру
        if (this.sceneCamera && this.sceneCamera.projection === Camera.ProjectionType.ORTHO) {
            this.sceneCamera.orthoHeight = (this.designHeight / 2) * finalScale;
        }

        // Обновляем UI (прилипание к краям/углам)
        this.updateUIPositions(winSize, finalScale);
    }

    private updateUIPositions(winSize: Size, finalScale: number) {
        const padding = 20;

        const alignLeft = (node: Node | null, alsoTop = false) => {
            if (!node) return;

            const widget = node.getComponent(Widget);
            if (widget) {
                widget.isAlignLeft = true;
                widget.left = padding;

                if (alsoTop) {
                    widget.isAlignTop = true;
                    widget.top = (widget.top ?? padding);
                }

                widget.updateAlignment();
                return;
            }

            // Fallback: если Widget нет — прижимаем через позицию
            const parentTransform = node.parent?.getComponent(UITransform);
            const nodeTransform = node.getComponent(UITransform);
            const parentWidth = parentTransform?.contentSize.width ?? (winSize.width / finalScale);
            const nodeWidth = nodeTransform?.contentSize.width ?? 0;
            const anchorX = nodeTransform?.anchorX ?? 0.5;
            const x = -parentWidth / 2 + padding + nodeWidth * anchorX;
            node.setPosition(x, node.position.y, 0);
        };

        const alignRight = (node: Node | null) => {
            if (!node) return;

            const widget = node.getComponent(Widget);
            if (widget) {
                widget.isAlignRight = true;
                widget.right = padding;
                widget.updateAlignment();
                return;
            }

            const parentTransform = node.parent?.getComponent(UITransform);
            const nodeTransform = node.getComponent(UITransform);
            const parentWidth = parentTransform?.contentSize.width ?? (winSize.width / finalScale);
            const nodeWidth = nodeTransform?.contentSize.width ?? 0;
            const anchorX = nodeTransform?.anchorX ?? 0.5;
            const x = parentWidth / 2 - padding - nodeWidth * (1 - anchorX);
            node.setPosition(x, node.position.y, 0);
        };

        // Moneybar — в левый верхний угол
        alignLeft(this.moneybar, true);

        // Кнопки — к левому/правому краю (вертикаль оставляем как есть)
        alignLeft(this.buttonsLeft);
        alignRight(this.buttonsRight);
    }
}