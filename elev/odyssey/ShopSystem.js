// ShopSystem.js
/*
========================================
FILE OVERVIEW
----------------------------------------
Purpose:
- Adds lightweight shop support on top of generated shop locations.

Key Systems:
- Shop modal creation
- Inventory pool generation by shop type
- Shop command patching
- Purchase handling

Flow:
- Ensures the modal exists
- Attaches inventories to generated shop nodes
- Opens a contextual storefront when the player uses `shop`

Design Notes:
- This is intentionally compact and data-driven. Shops are just another room
  interaction, not a giant economy simulator pretending it belongs here.
========================================
*/
(function () {
    class ShopSystem {
        // SHOP LAYER SETUP
        // -----------------------------------
        // Shops are implemented as a lightweight extension over normal rooms.
        // That means they need just enough structure to open, sell items, and
        // close again without becoming a totally separate game state machine.

        // Creates the shop subsystem wrapper.
        // Called by WorldEvolutionSystem during extension startup.
        // Inputs:
        // - `context`: Shared extension context used for logging and UI refresh hooks.
        // Returns:
        // - A configured `ShopSystem` instance.
        // Why it is designed this way:
        // - The shop layer is a patch over the base architecture, so it accepts
        //   a context object instead of hard-coding all dependencies internally.
        constructor(context) {
            this.ctx = context;
            this.original = {};
        }

        // Sends shop debug messages through the shared extension logger.
        log(msg, data) {
            if (this.ctx && this.ctx.log) this.ctx.log(msg, data);
        }

        // MODAL AND INVENTORY PREPARATION
        // -----------------------------------
       
        // These methods create the shop UI only when needed and attach stock to
        // generated shop locations.

        // Creates the shop modal lazily the first time the subsystem initializes.
        // Called once during setup.
        // Inputs:
        // - None.
        // Returns:
        // - Nothing.
        // Why it is designed this way:
        // - The base HTML does not need to know about this extension feature in
        //   advance, which keeps the original project structure less coupled.
        //   Also keeps us from hauling around unused shop markup forever.
        ensureModal() {
            if (document.getElementById("shop-modal-evo")) return;
            const m = document.createElement("div");
            m.id = "shop-modal-evo";
            m.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:4500;align-items:center;justify-content:center";
            m.innerHTML = "<div style='width:min(94vw,760px);max-height:84vh;overflow:auto;background:#132131;border:2px solid #d1ad69;border-radius:12px;padding:14px;color:#f3ebde'><div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:10px'><h3 id='shop-title-evo' style='margin:0'>Shop</h3><button id='shop-close-evo' style='background:#8d2e2e;color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer'>Close</button></div><div id='shop-gold-evo' style='font-weight:700;margin-bottom:10px'></div><div id='shop-list-evo'></div></div>";
            document.body.appendChild(m);
            document.getElementById("shop-close-evo").addEventListener("click", () => this.closeShop());
        }

        // Builds the default stock list for one category of shop.
        // Called when a shop location needs inventory for the first time.
        // Inputs:
        // - `type`: The shop flavor/category, such as `weapon` or `rare`.
        // Returns:
        // - An array of `{ item, price }` entries.
        // Why it is designed this way:
        // - Stock is data-driven so procedural areas can create believable shops
        //   without a hand-authored inventory for every single room.
        //   Enough variety to be interesting, not enough to need an accounting degree.
        getShopInventory(type) {
            const pools = {
                weapon:["rusty sword","dagger","bow"],
                armor:["leather armor","chainmail armor","bandage"],
                clothing:["cloth","lantern","bandage"],
                merchant:["health potion","small health potion","antidote","torch"],
                rare:["large health potion","blessed torch","magic key"]
            };
            const list = pools[type] || pools.merchant;
            return list.map((id) => {
                const it = gameState.items[id] || { value:25 };
                const mult = type === "rare" ? 2.4 : (type === "armor" ? 1.8 : 1.5);
                return { item:id, price:Math.max(10, Math.round((it.value || 20) * mult)) };
            });
        }

        // Seeds every shop node inside one generated area with inventory.
        attachInventoriesToArea(area) {
            Object.keys(area).forEach((id) => {
                const node = area[id];
                if (!node || !node.isShop) return;
                if (!node.shopInventory) node.shopInventory = this.getShopInventory(node.shopType || "merchant");
            });
        }

        // Hooks area generation so shop rooms come into existence already stocked.
        patchAreaGeneration() {
            const prev = mapSystem.generateSubArea.bind(mapSystem);
            mapSystem.generateSubArea = (subAreaId, entranceLocationId, theme) => {
                const result = prev(subAreaId, entranceLocationId, theme);
                const area = gameState.subAreas[subAreaId];
                if (area) this.attachInventoriesToArea(area);
                return result;
            };
        }

        // COMMAND PATCHING
        // -----------------------------------
        // Shops are opened through the normal command flow, so this section
        // patches that flow instead of inventing a disconnected interaction path.

        // Intercepts the `shop` command and keeps quick-button visibility synchronized.
        // Shops still go through the normal command flow so typed input and button input stay in agreement.
        patchCommands() {
            this.original.processCommand = main.processCommand.bind(main);
            main.processCommand = (command) => {
                const cmd = (command || "").toLowerCase().trim();
                if (cmd === "shop") {
                    this.openShop();
                    if (this.ctx && this.ctx.updateQuickButtons) this.ctx.updateQuickButtons();
                    return;
                }
                this.original.processCommand(command);
                if (this.ctx && this.ctx.updateQuickButtons) this.ctx.updateQuickButtons();
            };

            const od = uiController.updateGameDisplay.bind(uiController);
            uiController.updateGameDisplay = () => {
                od();
                if (this.ctx && this.ctx.updateQuickButtons) this.ctx.updateQuickButtons();
            };
        }

        // SHOP INTERACTION

        // These methods present inventory, handle purchases, and close the shop again.

        // Opens the storefront for the current room if it is a valid shop.
        // Called from typed commands or quick buttons.
        // Inputs:
        // - None.
        // Returns:
        // - Nothing.
        // Why it is designed this way:
        // - Shops remain location-bound. If the current room is not a shop, the
        //   player gets feedback instead of silently failing.
        //   Fewer "why is nothing happening?" moments that way.
        openShop() {
            const world = gameState.getCurrentWorld();
            const loc = world[gameState.currentLocation];
            if (!loc || !loc.isShop) {
                main.addMessage("There is no shop here.");
                return;
            }

            if (!loc.shopInventory || !loc.shopInventory.length) {
                // Stock is generated lazily so saved areas do not need every
                // shop's inventory created upfront. Less wasted setup, less mystery lag.
                loc.shopInventory = this.getShopInventory(loc.shopType || "merchant");
            }

            const m = document.getElementById("shop-modal-evo");
            const t = document.getElementById("shop-title-evo");
            const g = document.getElementById("shop-gold-evo");
            const l = document.getElementById("shop-list-evo");
            if (!m || !t || !g || !l) return;

            t.textContent = loc.name;
            g.textContent = "Gold: " + gameState.gold;
            l.innerHTML = "";

            (loc.shopInventory || []).forEach((entry) => {
                const it = gameState.items[entry.item] || { name:entry.item, description:"Unknown item", icon:"📦", stats:{} };
                const itemIcon = gameState.getItemIcon ? gameState.getItemIcon(entry.item) : (it.icon || "📦");
                const row = document.createElement("div");
                row.style.cssText = "display:grid;grid-template-columns:1fr auto;gap:10px;padding:10px;border:1px solid #2b3a49;border-radius:8px;margin-bottom:8px;background:#0f1b27";
                row.innerHTML = "<div><div style='font-weight:700'>" + itemIcon + " " + (it.name || entry.item) + "</div><div style='font-size:13px;opacity:.92'>" + (it.description || "No description") + "</div><div style='font-size:12px;opacity:.85'>Stats: +" + ((it.stats && it.stats.attack) || 0) + " ATK, +" + ((it.stats && it.stats.defense) || 0) + " DEF</div></div><div style='display:flex;flex-direction:column;align-items:end;gap:6px'><div>" + entry.price + "g</div><button data-buy='" + entry.item + "' style='padding:6px 10px;border:none;border-radius:6px;background:#2f7c4c;color:#fff;cursor:pointer'>Buy</button></div>";
                l.appendChild(row);
            });

            l.querySelectorAll("button[data-buy]").forEach((b) => b.addEventListener("click", () => this.buy(loc, b.getAttribute("data-buy"))));

            gameState.shopState.open = true;
            gameState.shopState.activeShopId = loc.shopId || null;
            m.style.display = "flex";
            this.log("Shop opened", { shop: loc.shopId || loc.name });
        }

        // Closes the active shop modal and clears shop-state bookkeeping.
        closeShop() {
            const m = document.getElementById("shop-modal-evo");
            if (m) m.style.display = "none";
            gameState.shopState.open = false;
            gameState.shopState.activeShopId = null;
        }

        // Processes one purchase from the current shop.
        // Called when the player presses a Buy button inside the modal.
        // Inputs:
        // - `loc`: The active shop location object.
        // - `itemId`: The item the player wants to buy.
        // Returns:
        // - Nothing.
        // Why it is designed this way:
        // - Reopening the shop after purchase recalculates gold and visible
        //   inventory immediately, which keeps the UI honest.
        buy(loc, itemId) {
            const entry = (loc.shopInventory || []).find((x) => x.item === itemId);
            if (!entry) return;
            if (gameState.gold < entry.price) {
                main.addMessage("Not enough gold for that purchase.");
                return;
            }
            gameState.gold -= entry.price;
            gameState.addToInventory(itemId);
            main.addMessage("Purchased " + itemId + " for " + entry.price + " gold.");
            this.openShop();
            uiController.updateGameDisplay();
        }

        // Initializes the shop subsystem.
        // Called once by WorldEvolutionSystem during extension startup.
        // Inputs:
        // - None.
        // Returns:
        // - Nothing.
        // Why it is designed this way:
        // - Shop support is opt-in patch logic layered over the base game, so
        //   setup is centralized in one predictable entry point.
        init() {
            this.ensureModal();
            this.patchAreaGeneration();
            this.patchCommands();
            this.log("ShopSystem initialized");
        }
    }

    window.ShopSystem = ShopSystem;
})();
