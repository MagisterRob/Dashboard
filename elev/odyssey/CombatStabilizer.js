// CombatStabilizer.js
/*
========================================
FILE OVERVIEW
----------------------------------------
Purpose:
- Patches the base combat system to stabilize turn locks, cooldowns, and flee cleanup.

Key Systems:
- Turn-indicator updates
- Safe control re-enabling
- Cleanup fallback for stuck combat states
- Patched flee behavior

Flow:
- Hooks key CombatSystem methods
- Tracks whose turn it should be
- Forces recovery if combat UI or locks become desynchronized

Design Notes:
- This file is a protective wrapper. It exists to make the battle loop feel
  reliable even when multiple patched systems are all trying to help at the same time.
========================================
*/
(function () {
    class CombatStabilizer {
        // Receive shared extension context for logging and coordination.
        constructor(context) {
            this.ctx = context;
            this.original = {};
        }

        // Forward stabilizer debug output through the shared extension logger.
        log(msg, data) {
            if (this.ctx && this.ctx.log) this.ctx.log(msg, data);
        }

        // Keep the overlay text aligned with the stabilized turn state.
        setTurnIndicator(text) {
            gameState.combatState.indicator = text;
            const o = document.getElementById("combat-overlay-message");
            if (o && gameState.inCombat) {
                o.textContent = text + " - Combat engaged.";
            }
        }

        // Re-enable controls only when the battle is genuinely back on the player's turn.
        safeUnlockIfPlayerTurn() {
            if (!gameState.inCombat) return;
            if (combatSystem.turnState !== "player") return;
            combatSystem.actionCooldown = false;
            combatSystem.combatLocked = false;
            gameState.combatState.turnLock = false;
            gameState.combatState.playerTurn = true;
            if (combatSystem.setCombatInputsEnabled) combatSystem.setCombatInputsEnabled(true);
            this.setTurnIndicator("Player Turn");
            this.log("Combat controls re-enabled");
        }

        // Failsafe cleanup path used when combat should end immediately and safely.
        // Not glamorous, but much better than leaving the player trapped in a half-dead battle UI.
        cleanupCombat() {
            gameState.inCombat = false;
            gameState.currentEnemy = null;
            gameState.statusEffects.player = [];
            gameState.statusEffects.enemy = [];
            gameState.combatState.turnLock = false;
            gameState.combatState.playerTurn = true;
            combatSystem.turnState = "player";
            combatSystem.actionCooldown = false;
            combatSystem.combatLocked = false;
            combatSystem.defeatProcessed = false;

            const c = document.getElementById("combat-container");
            if (c) c.style.display = "none";
            const log = document.getElementById("combat-log");
            if (log) log.innerHTML = "";
            const ov = document.getElementById("combat-overlay");
            if (combatSystem.hideCombatOverlay) combatSystem.hideCombatOverlay();
            else if (ov) ov.classList.remove("show");
            const submenu = document.getElementById("item-submenu");
            if (submenu) submenu.style.display = "none";
            const status = document.getElementById("status-effects");
            if (status) status.innerHTML = "";

            const i = document.getElementById("command-input");
            const s = document.getElementById("submit-btn");
            if (i) i.disabled = false;
            if (s) s.disabled = false;
            document.querySelectorAll(".combat-btn").forEach((b) => { b.disabled = false; b.classList.remove("combat-action-delay"); });
            if (i && typeof i.focus === "function") {
                setTimeout(() => i.focus(), 0);
            }

            if (uiController) uiController.updateGameDisplay();
            if (mapSystem) mapSystem.updateMapDisplay();
            if (gameState.saveGame) gameState.saveGame();
            this.log("Combat cleaned up");
        }

        // Replace the cooldown logic with a stricter version that also tracks turn locks.
        // This is mostly here to stop rapid input from turning one turn into several very confusing turns.
        patchCooldown() {
            this.original.startActionCooldown = combatSystem.startActionCooldown.bind(combatSystem);
            combatSystem.startActionCooldown = () => {
                if (combatSystem.actionCooldown || combatSystem.combatLocked || combatSystem.turnState !== "player") return false;
                combatSystem.actionCooldown = true;
                gameState.combatState.turnLock = true;
                document.querySelectorAll(".combat-btn").forEach((b) => { b.disabled = true; b.classList.add("combat-action-delay"); });
                setTimeout(() => {
                    combatSystem.actionCooldown = false;
                    if (!combatSystem.combatLocked && combatSystem.turnState === "player") {
                        document.querySelectorAll(".combat-btn").forEach((b) => { b.disabled = false; b.classList.remove("combat-action-delay"); });
                        gameState.combatState.turnLock = false;
                    }
                }, 750);
                return true;
            };
        }

        // Hook combat turn transitions so the stabilizer can keep UI and state synchronized.
        patchTurnFlow() {
            this.original.beginEnemyTurn = combatSystem.beginEnemyTurn.bind(combatSystem);
            this.original.finishEnemyTurn = combatSystem.finishEnemyTurn.bind(combatSystem);
            this.original.playerAttack = combatSystem.playerAttack.bind(combatSystem);
            this.original.playerDefend = combatSystem.playerDefend.bind(combatSystem);
            this.original.playerSpecial = combatSystem.playerSpecial.bind(combatSystem);
            this.original.startCombat = combatSystem.startCombat.bind(combatSystem);

            combatSystem.beginEnemyTurn = () => {
                this.original.beginEnemyTurn();
                gameState.combatState.playerTurn = false;
                this.setTurnIndicator("Enemy Turn");
            };

            combatSystem.finishEnemyTurn = () => {
                this.original.finishEnemyTurn();
                gameState.combatState.playerTurn = true;
                gameState.combatState.turnLock = false;
                this.setTurnIndicator("Player Turn");
                this.safeUnlockIfPlayerTurn();
            };

            combatSystem.playerAttack = () => {
                if (gameState.combatState.turnLock || !gameState.combatState.playerTurn) return;
                this.setTurnIndicator("Enemy Turn");
                this.original.playerAttack();
            };

            combatSystem.playerDefend = () => {
                if (gameState.combatState.turnLock || !gameState.combatState.playerTurn) return;
                this.setTurnIndicator("Enemy Turn");
                this.original.playerDefend();
            };

            combatSystem.playerSpecial = () => {
                if (gameState.combatState.turnLock || !gameState.combatState.playerTurn) return;
                this.setTurnIndicator("Enemy Turn");
                this.original.playerSpecial();
            };

            combatSystem.startCombat = (enemyType, health) => {
                this.original.startCombat(enemyType, health);
                gameState.combatState.playerTurn = true;
                gameState.combatState.turnLock = false;
                setTimeout(() => this.safeUnlockIfPlayerTurn(), 900);
                setTimeout(() => this.safeUnlockIfPlayerTurn(), 1800);
                setTimeout(() => this.safeUnlockIfPlayerTurn(), 3200);
            };
        }

        // Replace flee logic with a shorter, safer cleanup path.
        patchFlee() {
            combatSystem.fleeCombat = () => {
                if (!combatSystem.canPlayerAct()) return;
                if (!combatSystem.startActionCooldown()) return;
                combatSystem.beginPlayerAction();

                const chance = gameState.difficulty === "hardcore" ? 0.4 : 0.72;
                if (Math.random() < chance) {
                    combatSystem.addCombatMessage(gameState.username + " successfully flees from combat.", "player-action");
                    if (gameState.currentEnemy) {
                        gameState.activeEnemies[gameState.currentLocation] = {
                            type: gameState.currentEnemy.type,
                            health: gameState.currentEnemy.health,
                            name: gameState.currentEnemy.name
                        };
                    }
                    setTimeout(() => this.cleanupCombat(), 550);
                } else {
                    combatSystem.addCombatMessage(gameState.username + " fails to flee.", "enemy-action");
                    setTimeout(() => combatSystem.enemyTurn(), 500);
                }
            };
        }

        // Install all combat stability patches.
        init() {
            this.patchCooldown();
            this.patchTurnFlow();
            this.patchFlee();
            this.log("CombatStabilizer initialized");
        }
    }

    window.CombatStabilizer = CombatStabilizer;
})();
