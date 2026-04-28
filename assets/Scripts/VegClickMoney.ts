import { _decorator, Component, director, Node, ProgressBar, Size, Sprite, Tween, tween, UITransform, Vec3, Vec2, Label } from 'cc';
import { BalanceCultureKey, DEFAULT_BALANCE_RESOURCE_PATH } from './BalanceData';
import { MoneyManager } from './MoneyManager';
import { PlantFieldState } from './PlantFieldState';
import { formatMoneyDisplay } from './formatMoneyDisplay';
import { notifyQuestClick } from './QuestBridge';
import { UpgradeManager } from './UpgradeManager';

const { ccclass, property } = _decorator;

@ccclass('VegClickMoney')
export class VegClickMoney extends Component {
    @property({ type: Node, tooltip: 'Корень для поиска VegClick' })
    searchRoot: Node = null;

    @property({ tooltip: 'Сколько денег даёт ячейка' })
    addPerClick: number = 1;

    @property({ tooltip: 'Подъём спрайта по Y' }) 
    liftY: number = 20;
    
    @property({ tooltip: 'Время подъёма' }) 
    liftUpTime: number = 0.5;
    
    @property({ tooltip: 'Время возврата' }) 
    liftDownTime: number = 0.5;

    @property({ type: ProgressBar, tooltip: 'Локальный кулдаун' })
    cooldownBar: ProgressBar = null;

    @property({ tooltip: 'Время кулдауна (сек)' })
    cooldownTime: number = 1.0;

    @property({ type: Node, tooltip: 'Цель полёта монеты (можно оставить пустым)' })
    coinTarget: Node = null;

    @property({ type: Node, tooltip: 'Корень Canvas (если задан, не ищем по имени Canvas)' })
    canvasRoot: Node | null = null;

    @property({ type: Node, tooltip: 'Корень Moneybar (если задан, не ищем по имени Moneybar)' })
    moneybarRoot: Node | null = null;

    @property({ tooltip: 'Имя монеты в ячейке' }) 
    coinSourceName: string = 'IconCoin';
    
    @property({ tooltip: 'Имя монеты в Moneybar' }) 
    coinTargetName: string = 'IconCoin';

    @property({ tooltip: 'Время полёта' }) 
    coinFlyTime: number = 0.4;
    
    @property({ tooltip: 'Пауза перед уничтожением' }) 
    coinHoldTime: number = 0.05;
    
    @property({ tooltip: 'Ширина монеты при полёте (0 = авто)' }) 
    coinFlyWidth: number = 0;
    
    @property({ tooltip: 'Высота монеты при полёте (0 = авто)' }) 
    coinFlyHeight: number = 0;

    @property({ type: Label, tooltip: 'Label с ценой внутри ячейки' })
    moneyCountLabel: Label = null;

    @property({ tooltip: 'База дохода клика без апгрейдов (задаётся балансом культуры)' })
    baseAddPerClick: number = 1;

    private _basePositions = new WeakMap<Node, Vec3>();
    private _cooldownActive: boolean = false;
    private _currentCooldownTween: Tween<any> | null = null;
    private _canvasNode: Node | null = null;
    private _resolvedCoinTarget: Node | null = null;
    /** Тот же кадр/платформа может дать TOUCH_END и MOUSE_UP — не считаем дважды (как в VegetableMenuHandler). */
    private _lastVegPointerNode: Node | null = null;
    private _lastVegPointerAt = 0;

    onLoad() {
        UpgradeManager.initialize(DEFAULT_BALANCE_RESOURCE_PATH);
        const scene = director.getScene();
        this._canvasNode =
            this.canvasRoot?.isValid
                ? this.canvasRoot
                : scene
                  ? (this.findFirstNodeByName(scene, 'Canvas') ?? scene)
                  : null;
        this._resolvedCoinTarget = this.resolveCoinTarget(scene);

        this.baseAddPerClick = Math.max(0, Math.floor(Number(this.baseAddPerClick) || Math.floor(Number(this.addPerClick) || 0)));
        // 1. Синхронизация цены внутри ячейки
        this.syncMoneyCountLabel();

        // 2. Настройка кликов
        let root = this.searchRoot || this.node;
        const vegNodes = this.findAllNodesByName(root, 'VegClick');
        console.log(`[VegClickMoney] Найдено VegClick нод: ${vegNodes.length}`);

        for (const veg of vegNodes) {
            veg.off(Node.EventType.TOUCH_END, this.onVegClick, this);
            veg.off(Node.EventType.MOUSE_UP, this.onVegClick, this);
            veg.on(Node.EventType.TOUCH_END, this.onVegClick, this);
            veg.on(Node.EventType.MOUSE_UP, this.onVegClick, this);
            this.cacheVegBasePositions(veg);
        }

        // 3. Настройка кулдауна
        if (!this.cooldownBar) {
            this.cooldownBar = this.node.getComponentInChildren(ProgressBar);
        }
        if (this.cooldownBar) {
            const bg = this.findFirstNodeByName(this.cooldownBar.node, 'LoadingBarBackground');
            const width = bg?.getComponent(UITransform)?.contentSize.width 
                ?? this.cooldownBar.barSprite?.getComponent(UITransform)?.contentSize.width;
            
            if (width && width > 0) {
                this.cooldownBar.totalLength = width;
            }
            this.cooldownBar.progress = 1;
            this.cooldownBar.node.active = false;
        }

        // Проверка MoneyManager
        if (!MoneyManager.getInstance()) {
            console.error('[VegClickMoney] ❌ MoneyManager не найден в сцене!');
        } else {
            console.log('[VegClickMoney] ✅ MoneyManager подключён через singleton');
        }
    }

    onDestroy() {
        if (this.cooldownBar?.node?.isValid) {
            Tween.stopAllByTarget(this.cooldownBar.node);
        }
        this._currentCooldownTween = null;
    }

    private get moneyManager(): MoneyManager | null {
        return MoneyManager.getInstance();
    }

    /** Установить базовый доход клика из баланса и сразу обновить label в ячейке. */
    public setBaseClickReward(value: number): void {
        const v = Math.max(0, Math.floor(Number(value) || 0));
        this.baseAddPerClick = v;
        this.addPerClick = v;
        this.syncMoneyCountLabel();
    }

    private onVegClick = (event?: any) => {
        if (this._cooldownActive) {
            console.log('[VegClickMoney] ⏳ Кулдаун активен');
            return;
        }

        const vegNode = (event?.currentTarget as Node) ?? (event?.target as Node);
        if (!vegNode) {
            console.warn('[VegClickMoney] ❌ vegNode не найден');
            return;
        }

        const now = Date.now();
        if (vegNode === this._lastVegPointerNode && now - this._lastVegPointerAt < 250) {
            return;
        }
        this._lastVegPointerNode = vegNode;
        this._lastVegPointerAt = now;

        console.log(`[VegClickMoney] 🖱️ Клик по ${vegNode.name}`);

        this.animateVegSprites(vegNode);
        this.animateCoinFly(vegNode);

        // Добавление денег через singleton
        const manager = this.moneyManager;
        if (manager) {
            const culture = this.resolveCultureKey();
            const reward = Math.max(0, Math.floor(UpgradeManager.getClickReward(this.baseAddPerClick, culture) || 0));
            this.addPerClick = reward;
            this.syncMoneyCountLabel();
            manager.addMoney(reward);
        } else {
            console.error('[VegClickMoney] ❌ MoneyManager.instance недоступен!');
        }

        notifyQuestClick();

        this.startCooldown();
    };

    private startCooldown() {
        if (!this.cooldownBar || this.cooldownTime <= 0) return;

        const barNode = this.cooldownBar.node;
        Tween.stopAllByTarget(barNode);

        this._cooldownActive = true;
        barNode.active = true;
        this.cooldownBar.progress = 0;

        const actualCooldown = UpgradeManager.getCooldownTime(this.cooldownTime);

        this._currentCooldownTween = tween(barNode)
            .to(actualCooldown, {}, {
                easing: 'linear',
                onUpdate: (_, ratio: number) => {
                    if (this.cooldownBar) this.cooldownBar.progress = ratio;
                }
            })
            .call(() => {
                if (!this.isValid) {
                    return;
                }
                this._cooldownActive = false;
                if (this.cooldownBar) {
                    this.cooldownBar.node.active = false;
                    this.cooldownBar.progress = 1;
                }
                this._currentCooldownTween = null;
            })
            .start();
    }

    private resolveCultureKey(): BalanceCultureKey | '' | 'unknown' {
        const content = this.node.parent;
        const cell = content?.name === 'Content' ? content.parent : content?.parent;
        return PlantFieldState.getInstance().getCellCulture(cell ?? null);
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

        let target = this.resolveCoinTarget(sceneRoot);
        if (!target) {
            console.warn('[VegClickMoney] ⚠️ Не найдена цель для полёта монеты');
            return;
        }

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
            .call(() => {
                // При остановке Preview сцена уже может уничтожить Canvas — второй destroy даёт ошибку движка.
                Tween.stopAllByTarget(fly);
                if (fly.isValid) {
                    fly.destroy();
                }
            })
            .start();
    }

    private resolveCoinTarget(sceneRoot: Node | null): Node | null {
        if (this.coinTarget?.isValid) {
            this._resolvedCoinTarget = this.coinTarget;
            return this.coinTarget;
        }
        if (this._resolvedCoinTarget?.isValid) {
            return this._resolvedCoinTarget;
        }
        if (!sceneRoot?.isValid) {
            return null;
        }

        const moneybar = this.moneybarRoot?.isValid ? this.moneybarRoot : this.findFirstNodeByName(sceneRoot, 'Moneybar');
        const target = moneybar ? this.findFirstNodeByName(moneybar, this.coinTargetName) : null;
        if (target?.isValid) {
            this._resolvedCoinTarget = target;
            return target;
        }
        return null;
    }

    private syncMoneyCountLabel() {
        const label = this.moneyCountLabel?.isValid
            ? this.moneyCountLabel
            : (this.findFirstNodeByName(this.node, 'moneyCount')?.getComponent(Label)
                ?? this.findFirstNodeByName(this.node, 'moneyCountLabel')?.getComponent(Label)
                ?? null);
        if (!label) {
            return;
        }
        this.moneyCountLabel = label;
        const culture = this.resolveCultureKey();
        const v = Math.max(0, Math.floor(UpgradeManager.getClickRewardPreview(this.baseAddPerClick, culture) || 0));
        this.addPerClick = v;
        label.string = formatMoneyDisplay(v);
        console.log(`[VegClickMoney] 💰 Установлена цена: ${v}`);
    }
}
