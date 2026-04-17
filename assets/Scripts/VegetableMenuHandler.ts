import { _decorator, Component, Node, Button, Prefab, instantiate } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('VegetableMenuHandler')
export class VegetableMenuHandler extends Component {

    // Перетащи сюда свои 4 префаба еды в инспекторе
    @property({ type: Prefab, tooltip: 'Префаб для Капусты (1)' })
    cabbagePrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Префаб для Моркови (2)' })
    carrotPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Префаб для Помидоров (3)' })
    tomatoPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Префаб для Острый перец (4)' })
    chiliPrefab: Prefab | null = null;

    // Слот, в который будем помещать выбранную еду (передаётся из SlotMenuHandler)
    private targetCell: Node | null = null;

    // Имя ноды-контейнера внутри Cell1, куда кладём еду.
    // Рекомендую создать внутри каждого Cell1 пустую ноду с именем "Content" или "Icon"
    private readonly CONTENT_NAME = 'Content';   // ← измени, если у тебя другое имя

    onLoad() {
        this.setupMenuButtons();
    }

    private setupMenuButtons() {
        // Находим все Button внутри VegetableList (включая вложенные)
        const buttons = this.node.getComponentsInChildren(Button);

        buttons.forEach((btn, index) => {
            // Очищаем старые обработчики
            btn.node.off(Button.EventType.CLICK, this.onItemClicked, this);
            // Назначаем новый
            btn.node.on(Button.EventType.CLICK, () => this.onItemClicked(index), this);
        });

        console.log(`[VegetableMenuHandler] Настроено ${buttons.length} кнопок меню`);
    }

    private onItemClicked(index: number) {
        let selectedPrefab: Prefab | null = null;

        switch (index) {
            case 0: selectedPrefab = this.cabbagePrefab; break;  // Капуста
            case 1: selectedPrefab = this.carrotPrefab; break;   // Морковь
            case 2: selectedPrefab = this.tomatoPrefab; break;   // Помидоры
            case 3: selectedPrefab = this.chiliPrefab; break;    // Острый перец
            default:
                console.warn(`[VegetableMenuHandler] Неизвестный индекс: ${index}`);
                return;
        }

        if (!selectedPrefab) {
            console.error(`[VegetableMenuHandler] Префаб для пункта ${index + 1} не назначен!`);
            return;
        }

        this.placeInCell(selectedPrefab);
        this.closeMenu();
    }

    private placeInCell(prefab: Prefab) {
        if (!this.targetCell) {
            console.error(`[VegetableMenuHandler] targetCell не установлен!`);
            return;
        }

        const contentNode = this.targetCell.getChildByName(this.CONTENT_NAME) || this.targetCell;

        // Удаляем всё предыдущее содержимое слота
        contentNode.destroyAllChildren();

        // Создаём новый префаб еды
        const newItem = instantiate(prefab);
        contentNode.addChild(newItem);

        // Опционально: можно сбросить позицию/scale
        newItem.setPosition(0, 0, 0);

        console.log(`[VegetableMenuHandler] В слот ${this.targetCell.name} помещён: ${prefab.name}`);
    }

    public setTargetCell(cell: Node) {
        this.targetCell = cell;
    }

    private closeMenu() {
        this.node.active = false;
        console.log('[VegetableMenuHandler] Меню закрыто после выбора');
    }
}