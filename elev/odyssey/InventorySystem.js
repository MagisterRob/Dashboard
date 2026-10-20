/*
========================================
FILE OVERVIEW
----------------------------------------
Purpose:
- Handles inventory rendering, item detail panels, and equipment slot updates.

Key Systems:
- Stack-style inventory counting
- Equip and unequip flow
- Item action buttons inside the inventory UI

Flow:
- Reads item and equipment data from `gameState`
- Updates inventory-related DOM panels
- Forwards gameplay actions back to `Main` when needed

Design Notes:
- This class is intentionally UI-focused. `gameState` owns the truth; this file
  just makes that truth readable and clickable for actual humans.
========================================
*/

// InventorySystem.js - Inventory, equipment, and crafting systems (Fixed inventory bug)
// InventorySystem bridges the persistent item state in `gameState` and the
// inventory/equipment panels shown to the player.
class InventorySystem {
    // INVENTORY CONTROLLER SETUP
    // -----------------------------------
    // This class exists to keep inventory and equipment interface logic out of
    // the main gameplay loop. `gameState` owns the actual data, but this class
    // decides how that data should be displayed and which UI buttons should be
    // available to the player at any moment.

    // Creates the inventory controller instance.
    // Runs once when the file is loaded and the singleton is created.
    // Inputs:
    // - None.
    // Returns:
    // - A configured `InventorySystem` object.
    // Why it is designed this way:
    // - Most setup is deferred until the UI is actually opened, so the
    //   constructor can stay lightweight and avoid touching the DOM too early.
    constructor() {
        // Initialize crafting recipes if needed
    }
    
    // INVENTORY RENDERING
    // -----------------------------------
    // These methods are responsible for turning raw item arrays into readable
    // UI elements. They interact mainly with `gameState` for data and with the
    // DOM for presentation.

    // Refreshes every visible inventory panel from the same inventory data.
    // Runs whenever inventory contents change or the main game display refreshes.
    // Inputs:
    // - None.
    // Returns:
    // - Nothing. It updates DOM nodes in place.
    // Why it is designed this way:
    // - The game has both desktop and mobile inventory containers, so a single
    //   method keeps them synchronized and avoids duplicate rendering logic.
    updateInventoryDisplay() {
        const inventoryItems = document.getElementById('inventory-items');
        const inventoryItemsMobile = document.getElementById('inventory-items-mobile');
        
        this.updateInventoryContainer(inventoryItems);
        if (inventoryItemsMobile) {
            this.updateInventoryContainer(inventoryItemsMobile);
        }
    }
    
    // Renders one specific inventory container.
    // Called by `updateInventoryDisplay()` for each active inventory panel.
    // Inputs:
    // - `container`: The DOM element that should receive rendered item entries.
    // Returns:
    // - Nothing. The container's contents are rebuilt.
    // Why it is designed this way:
    // - Inventory items are stored as one array entry per item in `gameState`,
    //   which keeps pickup/drop logic simple. The UI then groups duplicates so
    //   stackable resources remain readable for the player.
    updateInventoryContainer(container) {
        if (!container) return;
        
        container.innerHTML = "";
        
        // Grouping here keeps the underlying data model simple while still
        // showing the player a clean "item x count" style inventory.
        const itemCounts = {};
        gameState.inventory.forEach(item => {
            itemCounts[item] = (itemCounts[item] || 0) + 1;
        });
        
        if (Object.keys(itemCounts).length === 0) {
            const emptyItem = document.createElement("div");
            emptyItem.classList.add("item");
            emptyItem.textContent = "Empty";
            container.appendChild(emptyItem);
        } else {
            Object.keys(itemCounts).forEach(item => {
                const itemElement = document.createElement("div");
                itemElement.classList.add("item");
                
                // The icon lookup is defensive because item data may come from
                // multiple systems, including fallback or patched data sets.
                const itemData = gameState.items[item] || { icon: "📦" };
                const icon = gameState.getItemIcon ? gameState.getItemIcon(item) : (itemData.icon || "📦");
                const countText = itemCounts[item] > 1 ? ` (${itemCounts[item]})` : "";
                itemElement.textContent = `${icon} ${item}${countText}`;
                itemElement.addEventListener("click", () => this.showItemDetail(item));
                container.appendChild(itemElement);
            });
        }
    }

    // ITEM DETAIL VIEW
    // -----------------------------------
    // This section controls the modal that teaches the player what an item is,
    // what it does, and which actions are valid for it.

    // Opens the item detail modal for one selected item.
    // Called when the player clicks an item in the inventory list or grid.
    // Inputs:
    // - `item`: The item ID/name stored in the inventory array.
    // Returns:
    // - Nothing. It populates and displays the detail modal.
    // Why it is designed this way:
    // - Centralizing item actions here prevents the UI from showing invalid
    //   buttons, such as "Use" on armor or "Equip" on a potion.
    showItemDetail(item) {
        const itemDetail = document.getElementById("item-detail");
        const itemData = gameState.items[item] || { name: item, icon: "📦", description: "An unknown item." };
        
        document.getElementById("detail-name").textContent = itemData.name;
        const icon = gameState.getItemIcon ? gameState.getItemIcon(item) : (itemData.icon || "📦");
        document.getElementById("detail-icon").innerHTML = icon;
        document.getElementById("detail-description").textContent = itemData.description;
        
        const detailActions = document.getElementById("detail-actions");
        detailActions.innerHTML = '';
        
        // Actions are generated dynamically so the same modal can explain
        // many kinds of items without hard-coding separate screens.
        if (itemData.type === "consumable") {
            const useBtn = document.createElement('button');
            useBtn.classList.add('detail-btn', 'primary');
            useBtn.textContent = 'Use';
            useBtn.addEventListener('click', () => {
                this.processCommand(`use ${item}`);
                this.closeItemDetail();
            });
            detailActions.appendChild(useBtn);
        }
        
        if (itemData.type === "weapon" || itemData.type === "armor") {
            const equipBtn = document.createElement('button');
            equipBtn.classList.add('detail-btn', 'primary');
            equipBtn.textContent = 'Equip';
            equipBtn.addEventListener('click', () => {
                this.equipItem(item);
                this.closeItemDetail();
            });
            detailActions.appendChild(equipBtn);
        }
        
        // For keys, show which locations they unlock
        if (itemData.type === "key" && itemData.unlocks) {
            const keyInfo = document.createElement('div');
            keyInfo.classList.add('key-info');
            keyInfo.innerHTML = `<p><strong>Unlocks:</strong> ${itemData.unlocks.join(', ')}</p>`;
            detailActions.appendChild(keyInfo);
        }
        
        const dropBtn = document.createElement('button');
        dropBtn.classList.add('detail-btn');
        dropBtn.textContent = 'Drop';
        dropBtn.addEventListener('click', () => {
            // Dropping places the item back into the current room so the world
            // remains logical: items do not vanish, they change ownership.
            const location = gameState.world[gameState.currentLocation];
            if (location) {
                location.items.push(item);
            }
            
            // Only one copy is removed because inventory stores duplicates as
            // separate entries. This matters for stackable items like potions.
            const itemIndex = gameState.inventory.indexOf(item);
            if (itemIndex !== -1) {
                gameState.inventory.splice(itemIndex, 1);
            }
            
            // Add message
            this.addMessage(`You dropped the ${item}.`);
            
            // UI refresh is immediate so the player sees the world and
            // inventory change in the same moment as the action feedback.
            this.updateInventoryDisplay();
            if (window.uiController) {
                window.uiController.updateRoomItemsDisplay();
            }
            this.closeItemDetail();
        });
        detailActions.appendChild(dropBtn);
        
        itemDetail.style.display = 'flex';
    }
    
    // Closes the currently open item detail modal.
    // Runs after a player action or when the close button is clicked.
    // Inputs:
    // - None.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Closing the modal is intentionally isolated from item logic so it can
    //   be reused after equip, use, drop, or cancel actions.
    closeItemDetail() {
        document.getElementById('item-detail').style.display = 'none';
    }
    
    // EQUIPMENT MANAGEMENT
    // -----------------------------------
    // Equipment is where inventory data begins affecting combat stats. These
    // methods make sure slot rules and stat bonuses stay consistent.

    // Equips an inventory item into the correct slot and applies its bonuses.
    // Called from the item detail modal or from typed commands routed through `Main`.
    // Inputs:
    // - `itemName`: The inventory item being equipped.
    // Returns:
    // - Nothing. It updates `gameState` and refreshes the UI.
    // Why it is designed this way:
    // - Slot resolution happens here instead of in `Main` because equipment
    //   rules are inventory-specific and should stay centralized.
    equipItem(itemName) {
        const itemData = gameState.items[itemName];
        if (!itemData) {
            this.addMessage(`You don't have a ${itemName} to equip.`);
            return;
        }
        
        if (itemData.type !== "weapon" && itemData.type !== "armor") {
            this.addMessage(`You cannot equip ${itemName}.`);
            return;
        }
        
        // Slot selection is part of the game design: one-handed items offer
        // flexibility, while two-handed items trade versatility for power.
        let slot = null;
        if (itemData.slot === "oneHanded") {
            // Try to equip in left hand first, then right hand
            if (!gameState.equippedItems.leftHand) {
                slot = "leftHand";
            } else if (!gameState.equippedItems.rightHand) {
                slot = "rightHand";
            } else {
                this.addMessage('Both hands are occupied. Unequip an item first.');
                return;
            }
        } else if (itemData.slot === "twoHanded") {
            slot = "twoHanded";
            // Two-handed weapons occupy both hands
            if (gameState.equippedItems.leftHand || gameState.equippedItems.rightHand) {
                this.addMessage('You need both hands free for a two-handed weapon.');
                return;
            }
        } else {
            // Armor items
            slot = itemData.slot;
        }
        
        // The equipped item is moved out of inventory so the same sword cannot
        // accidentally exist in both places at once.
        gameState.equippedItems[slot] = itemName;
        
        // Remove only one copy from inventory.
        // The old version was a bit too enthusiastic and could strip every copy
        // of an item at once, which was not the intended deal.
        const itemIndex = gameState.inventory.indexOf(itemName);
        if (itemIndex !== -1) {
            gameState.inventory.splice(itemIndex, 1);
        }
        
        // Stats are applied directly to the live player values so combat can
        // use the final totals without recalculating every attack.
        if (itemData.stats) {
            if (itemData.stats.attack) {
                gameState.attack += itemData.stats.attack;
            }
            if (itemData.stats.defense) {
                gameState.defense += itemData.stats.defense;
            }
        }
        
        this.addMessage(`You equipped the ${itemName}.`);
        
        // Update displays
        if (window.uiController) {
            window.uiController.updateGameDisplay();
            window.uiController.updateEquipmentDisplay();
        }
    }
    
    // Unequips an item from one equipment slot.
    // Called when the player explicitly removes gear from a slot.
    // Inputs:
    // - `slot`: The equipment slot key, such as `leftHand` or `chest`.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Removing bonuses before returning the item prevents stat drift, which
    //   is one of those bugs that stays invisible right up until your stats stop making sense.
    unequipItem(slot) {
        const itemName = gameState.equippedItems[slot];
        if (!itemName) {
            this.addMessage(`Nothing equipped in ${slot}.`);
            return;
        }
        
        // Remove stat bonuses
        const itemData = gameState.items[itemName];
        if (itemData && itemData.stats) {
            if (itemData.stats.attack) {
                gameState.attack -= itemData.stats.attack;
            }
            if (itemData.stats.defense) {
                gameState.defense -= itemData.stats.defense;
            }
        }
        
        // Put the item back in inventory so unequipping is an actual transfer,
        // not a tiny gear-eating void.
        gameState.inventory.push(itemName);
        
        // Unequip
        gameState.equippedItems[slot] = null;
        
        this.addMessage(`You unequipped the ${itemName}.`);
        
        // Update displays
        if (window.uiController) {
            window.uiController.updateGameDisplay();
            window.uiController.updateEquipmentDisplay();
        }
    }
    
    // Redraws equipped items and summed bonuses in the main inventory modal.
    // Runs after equip/unequip operations and whenever the inventory modal opens.
    // Inputs:
    // - None.
    // Returns:
    // - Nothing. It updates the slot visuals and total bonus text.
    // Why it is designed this way:
    // - The modal needs both per-slot visuals and aggregate combat bonuses,
    //   since players often compare loadouts before making decisions.
    updateEquipmentDisplay() {
        // Update equipment slots in inventory modal
        Object.keys(gameState.equippedItems).forEach(slot => {
            const slotElement = document.getElementById(`${slot}-slot`);
            const item = gameState.equippedItems[slot];
            
            if (slotElement) {
                if (item) {
                    const itemData = gameState.items[item];
                    const icon = gameState.getItemIcon ? gameState.getItemIcon(item) : (itemData && itemData.icon ? itemData.icon : "📦");
                    slotElement.innerHTML = icon;
                    slotElement.title = itemData.name;
                } else {
                    slotElement.innerHTML = "";
                    slotElement.title = "";
                }
            }
        });
        
        // Total bonuses are recomputed from equipped items rather than trusted
        // from a cached value. That makes the UI safer if equipment changes in
        // more than one place.
        const equipmentStats = document.getElementById("equipment-stats");
        if (equipmentStats) {
            equipmentStats.innerHTML = "";
            
            let totalAttack = 0;
            let totalDefense = 0;
            
            Object.keys(gameState.equippedItems).forEach(slot => {
                const item = gameState.equippedItems[slot];
                if (item && gameState.items[item] && gameState.items[item].stats) {
                    if (gameState.items[item].stats.attack) {
                        totalAttack += gameState.items[item].stats.attack;
                    }
                    if (gameState.items[item].stats.defense) {
                        totalDefense += gameState.items[item].stats.defense;
                    }
                }
            });
            
            if (totalAttack > 0 || totalDefense > 0) {
                equipmentStats.innerHTML = `
                    <div class="stat-row">
                        <span>Attack Bonus:</span>
                        <span>+${totalAttack}</span>
                    </div>
                    <div class="stat-row">
                        <span>Defense Bonus:</span>
                        <span>+${totalDefense}</span>
                    </div>
                `;
            } else {
                equipmentStats.innerHTML = `<p>No equipment bonuses</p>`;
            }
        }
        
        // Update armory modal if open
        this.updateArmoryModal();
    }

    // Updates the separate armory modal with the current equipment loadout.
    // Called whenever equipment changes or the armory screen is opened.
    // Inputs:
    // - None.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - The armory gives a more specialized equipment overview than the regular
    //   inventory modal, so it maintains its own visual summary.
    updateArmoryModal() {
        // Update equipment slots in armory modal
        Object.keys(gameState.equippedItems).forEach(slot => {
            const slotElement = document.getElementById(`armory-${slot}-slot`);
            const item = gameState.equippedItems[slot];
            
            if (slotElement) {
                if (item) {
                    const itemData = gameState.items[item];
                    const icon = gameState.getItemIcon ? gameState.getItemIcon(item) : (itemData && itemData.icon ? itemData.icon : "📦");
                    slotElement.innerHTML = icon;
                    slotElement.title = itemData.name;
                } else {
                    slotElement.innerHTML = "";
                    slotElement.title = "";
                }
            }
        });
        
        // The armory shows both individual item contributions and final totals,
        // which helps a player understand where their stats actually come from.
        const equipmentStats = document.getElementById("armory-equipment-stats");
        if (equipmentStats) {
            equipmentStats.innerHTML = "";
            
            let totalAttack = 0;
            let totalDefense = 0;
            
            Object.keys(gameState.equippedItems).forEach(slot => {
                const item = gameState.equippedItems[slot];
                if (item && gameState.items[item] && gameState.items[item].stats) {
                    if (gameState.items[item].stats.attack) {
                        totalAttack += gameState.items[item].stats.attack;
                    }
                    if (gameState.items[item].stats.defense) {
                        totalDefense += gameState.items[item].stats.defense;
                    }
                    
                    const statRow = document.createElement("div");
                    statRow.classList.add("stat-row");
                    statRow.innerHTML = `
                        <span>${gameState.items[item].name}:</span>
                        <span>+${gameState.items[item].stats.attack || 0}/${gameState.items[item].stats.defense || 0}</span>
                    `;
                    equipmentStats.appendChild(statRow);
                }
            });
            
            // Update total stats
            const totalAttackElement = document.getElementById("total-attack");
            const totalDefenseElement = document.getElementById("total-defense");
            
            if (totalAttackElement) {
                totalAttackElement.textContent = gameState.baseStats.attack + totalAttack;
            }
            if (totalDefenseElement) {
                totalDefenseElement.textContent = gameState.baseStats.defense + totalDefense;
            }
        }
    }

    // 
    // SHARED HELPERS
    // 
    // These small helpers keep the inventory system aligned with the rest of
    // the architecture instead of inventing a second action or message system.

    // Sends a text command through the same processing path used for typed input.
    // Called when an inventory button, such as "Use", should behave exactly
    // like the player typed a command manually.
    // Inputs:
    // - `command`: The command string to forward.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Reusing the main command parser prevents UI actions and typed actions
    //   from drifting into different behaviors over time.
    processCommand(command) {
        if (window.main && window.main.processCommand) {
            window.main.processCommand(command);
        }
    }
    
    // Writes a message directly to the game output.
    // Used for inventory-specific actions that need immediate player feedback.
    // Inputs:
    // - `text`: The message to display.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Inventory actions should still be able to report results even if the
    //   main UI controller is unavailable or not involved in the interaction.
    addMessage(text) {
        const output = document.getElementById('game-output');
        if (output) {
            const message = document.createElement('div');
            message.classList.add('message');
            message.textContent = text;
            output.appendChild(message);
            output.scrollTop = output.scrollHeight;
        }
    }
}

// Export singleton instance
const inventorySystem = new InventorySystem();
