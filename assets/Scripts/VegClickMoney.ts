import { _decorator, Component, director, Node, ProgressBar, Size, Sprite, Tween, tween, UITransform, Vec3, Vec2, EventHandler } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('VegClickMoney')
export class VegClickMoney extends Component {
    @property({ type: Node }) searchRoot: Node = null;

    @property({ tooltip: 'Сколько денег добавляет эта ячейка' })
    addPerClick: number = 1;

    @property({ tooltip: 'Подъём спрайта по Y' }) liftY: number = 20;
    @property({ tooltip: 'Время подъёма' }) liftUpTime: number = 0.5;
    @property({ tooltip: 'Время возврата' }) liftDownTime: number = 0.5;

    @property({ type: ProgressBar, tooltip: 'Локальный ProgressBar этой ячейки' })
    cooldownBar: ProgressBar = null;

    @property({ tooltip: 'Время кулдауна этой ячейки (сек)' })
    cooldownTime: number = 1.0;

    @property({ type: Node }) coinTarget: Node = null;
    @property({ tooltip: 'Имя монетки в ячейке' }) coinSourceName: string = 'IconCoin';
    @property({ tooltip: 'Имя монетки в Moneybar' }) coinTargetName: string = 'IconCoin';

    @property({ tooltip: 'Время полёта монетки' }) coinFlyTime: number = 0.4;
    @property({ tooltip: 'Пауза перед уничтожением' }) coinHoldTime: number = 0.05;
    @property({ tooltip: 'Ширина монеты при полёте (0 = авто)' }) coinFlyWidth: number = 0;
    @property({ tooltip: 'Высота монеты при полёте (0 = авто)' }) coinFlyHeight: number = 0;

    // ← Главное поле для связи с MoneyManager
    @property({ type: EventHandler, tooltip: 'Событие для добавления денег (подключи MoneyManager.addMoney)' })
    onClicked: EventHandler = new EventHandler();

    private _basePositions = new WeakMap<Node, Vec3>();
    private _cooldownActive: boolean = false;
    private _currentCooldownTween: Tween<any> | null = null;
    private _canvasNode: Node | null = null;

    onLoad() {
        const sceneRoot0 = director.getScene();
        this._canvasNode = sceneRoot0 ? (this.findFirstNodeByName(sceneRoot0, 'Canvas') ?? sceneRoot0) : null;

        // === ИСПРАВЛЕНИЕ: Логика поиска корня ===
        let root = this.searchRoot;
        if (!root) {
            // Если поле пустое, ищем внутри самого префаба
            root = this.node;
            console.log(`[VegClickMoney] Search Root пуст, используем Self: ${this.node.name}`);
        } else {
            console.log(`[VegClickMoney] Используем Search Root: ${root.name}`);
        }

        if (!root) return;

        // === ИСПРАВЛЕНИЕ: Поиск только внутри выбранного корня ===
        const vegNodes = this.findAllNodesByName(root, 'VegClick');
        console.log(`[VegClickMoney] Найдено нод 'VegClick': ${vegNodes.length}`);

        for (const veg of vegNodes) {
            // Проверка на наличие UITransform (обязательно для кликов!)
            if (!veg.getComponent(UITransform)) {
                console.warn(`[VegClickMoney] Нода '${veg.name}' не имеет UITransform! Добавьте его, иначе клики не сработают.`);
            }

            veg.off(Node.EventType.TOUCH_END, this.onVegClick, this);
            veg.on(Node.EventType.TOUCH_END, this.onVegClick, this);
            this.cacheVegBasePositions(veg);
        }

        // Настройка ProgressBar
        if (!this.cooldownBar) {
            this.cooldownBar = this.node.getComponentInChildren(ProgressBar);
        }
        if (this.cooldownBar) {
            const bg = this.findFirstNodeByName(this.cooldownBar.node, 'LoadingBarBackground');
            const bgWidth = bg?.getComponent(UITransform)?.contentSize.width;
            const barWidth = this.cooldownBar.barSprite?.getComponent(UITransform)?.contentSize.width;
            const width = bgWidth ?? barWidth;
            if (width && width > 0) this.cooldownBar.totalLength = width;

            this.cooldownBar.progress = 1;
            this.cooldownBar.node.active = false;
        }
    }

    private onVegClick(event?: any) {
        if (this._cooldownActive) return;

        const vegNode = (event?.currentTarget as Node) ?? (event?.target as Node);
        if (!vegNode) return;

        this.animateVegSprites(vegNode);
        this.animateCoinFly(vegNode);

        // === ОТПРАВКА ДЕНЕГ В MONEYMANAGER ===
        // Убедитесь, что в инспекторе настроено событие onClicked
        this.onClicked.emit([this.addPerClick]);

        this.startCooldown();
    }

    private startCooldown() {
        if (!this.cooldownBar || this.cooldownTime <= 0) return;

        const barNode = this.cooldownBar.node;
        Tween.stopAllByTarget(barNode);

        this._cooldownActive = true;
        barNode.active = true;
        this.cooldownBar.progress = 0;

        this._currentCooldownTween = tween(barNode)
            .to(this.cooldownTime, {}, {
                easing: 'linear',
                onUpdate: (_, ratio: number) => {
                    if (this.cooldownBar) this.cooldownBar.progress = ratio;
                }
            })
            .call(() => {
                this._cooldownActive = false;
                if (this.cooldownBar) {
                    this.cooldownBar.node.active = false;
                    this.cooldownBar.progress = 1;
                }
                this._currentCooldownTween = null;
            })
            .start();
    }

    // ====================== Вспомогательные методы ======================
    private findFirstNodeByName(root: Node | null, name: string): Node | null {
        if (!root) return null;
        const stack: Node[] = [root];
        while (stack.length) {
            const n = stack.pop()!;
            if (n.name === name) return n;
            for (const c of n.children) stack.push(c);
        }
        return null;
    }

    private findAllNodesByName(root: Node, name: string): Node[] {
        const out: Node[] = [];
        const stack: Node[] = [root];
        while (stack.length) {
            const n = stack.pop()!;
            if (n.name === name) out.push(n);
            for (const c of n.children) stack.push(c);
        }
        return out;
    }

    private animateVegSprites(vegNode: Node) {
        const sprites = vegNode.getComponentsInChildren(Sprite);
        for (const s of sprites) {
            const n = s.node;
            const basePos = this.getBasePos(n);
            Tween.stopAllByTarget(n);
            n.setPosition(basePos);

            const upPos = new Vec3(basePos.x, basePos.y + this.liftY, basePos.z);

            tween(n)
                .to(Math.max(0.01, this.liftUpTime), { position: upPos }, { easing: 'quadOut' })
                .to(Math.max(0.01, this.liftDownTime), { position: basePos }, { easing: 'quadIn' })
                .start();
        }
    }

    private cacheVegBasePositions(vegNode: Node) {
        const sprites = vegNode.getComponentsInChildren(Sprite);
        for (const s of sprites) {
            const n = s.node;
            if (!this._basePositions.has(n)) {
                this._basePositions.set(n, n.position.clone());
            }
        }
    }

    private getBasePos(node: Node): Vec3 {
        let pos = this._basePositions.get(node);
        if (!pos) {
            pos = node.position.clone();
            this._basePositions.set(node, pos);
        }
        return pos;
    }

    private animateCoinFly(vegNode: Node) {
        const sceneRoot = director.getScene();
        if (!sceneRoot) return;

        let source = this.findFirstNodeByName(vegNode, this.coinSourceName)
            ?? this.findFirstNodeByName(vegNode.parent, this.coinSourceName)
            ?? this.findFirstNodeByName(vegNode.parent?.parent, this.coinSourceName);

        const sf = source?.getComponent(Sprite)?.spriteFrame;
        if (!source || !sf) return;

        let target = this.coinTarget;
        if (!target) {
            const moneybar = this.findFirstNodeByName(sceneRoot, 'Moneybar');
            target = moneybar ? this.findFirstNodeByName(moneybar, this.coinTargetName) : null;
        }
        if (!target) return;

        const canvas = this._canvasNode ?? this.findFirstNodeByName(sceneRoot, 'Canvas') ?? sceneRoot;
        const canvasTr = canvas.getComponent(UITransform);
        if (!canvasTr) return;

        const srcLocal = canvasTr.convertToNodeSpaceAR(source.worldPosition);
        const dstLocal = canvasTr.convertToNodeSpaceAR(target.worldPosition);

        const fly = new Node('CoinFly');
        fly.layer = canvas.layer;
        fly.setParent(canvas);
        fly.setPosition(srcLocal);

        const flyUi = fly.addComponent(UITransform);
        const flySprite = fly.addComponent(Sprite);
        flySprite.spriteFrame = sf;
        flySprite.sizeMode = Sprite.SizeMode.CUSTOM;

        const srcUi = source.getComponent(UITransform);
        let w = 100, h = 100;
        if (srcUi) {
            const scale = source.worldScale;
            w = srcUi.contentSize.width * scale.x;
            h = srcUi.contentSize.height * scale.y;
            if (this.coinFlyWidth > 0) w = this.coinFlyWidth;
            if (this.coinFlyHeight > 0) h = this.coinFlyHeight;
        }
        flyUi.setContentSize(w, h);
        flyUi.anchorPoint = srcUi ? srcUi.anchorPoint.clone() : new Vec2(0.5, 0.5);

        const targetUi = target.getComponent(UITransform);
        let tw = w, th = h;
        if (targetUi) {
            const ts = target.worldScale;
            tw = targetUi.contentSize.width * ts.x;
            th = targetUi.contentSize.height * ts.y;
        }

        tween(fly)
            .parallel(
                tween().to(this.coinFlyTime, { position: dstLocal }, { easing: 'quadInOut' }),
                tween(flyUi).to(this.coinFlyTime, { contentSize: new Size(tw, th) }, { easing: 'quadInOut' })
            )
            .delay(this.coinHoldTime)
            .call(() => fly.destroy())
            .start();
    }
}