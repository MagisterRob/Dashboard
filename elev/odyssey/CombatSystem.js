// CombatSystem.js - Enhanced combat with status effects and cooldowns
/*
========================================
FILE OVERVIEW
----------------------------------------
Purpose:
- Runs turn-based combat encounters, combat UI updates, and battle resolution.

Key Systems:
- Turn order and button locking
- Player and enemy actions
- Status effects and special meter updates
- Rewards, defeat handling, and encounter cleanup

Flow:
- `Main` starts combat by passing in an enemy type
- CombatSystem clones enemy data and drives the battle panel
- On win, loss, or flee it writes the outcome back into `gameState`

Design Notes:
- Combat needs tight coordination between rules and presentation, so this file
  updates both game data and the battle UI in the same methods. Messy in theory,
  much less messy than desynchronizing turns in practice.
========================================
*/
class CombatSystem {
    // COMBAT STATE SETUP
    // -----------------------------------
    // Combat is turn-based, but it also has animations and delayed actions.
    // These fields keep the timing logic and UI lock state synchronized so the
    // player cannot accidentally trigger duplicate turns.

    // Creates the combat controller and its timing/lock state.
    // Runs once when the singleton is created.
    // Inputs:
    // - None.
    // Returns:
    // - A configured `CombatSystem` instance.
    // Why it is designed this way:
    // - Combat has more temporary state than exploration, so these fields are
    //   kept together here instead of scattered across the UI.
    constructor() {
        this.combatLog = [];
        this.actionCooldown = false;
        this.combatStartTime = null;
        this.defeatProcessed = false;
        this.combatLocked = false;
        this.turnState = "player";
        this.playerActionDelay = 500;
        this.enemyActionDelay = 700;
        this.specialActionDelay = 1000;
    }
    
    // COMBAT ENTRY
    // -----------------------------------
    // These methods move the game from exploration mode into combat mode and
    // establish the enemy, UI overlays, and first-turn state.

    // Starts a fresh combat instance from base enemy data and opens the battle UI.
    // Called when exploration or encounter logic decides a fight should begin.
    // Inputs:
    // - `enemyType`: The enemy key to clone from `gameState.enemies`.
    // - `health`: Optional override used when re-engaging a previously fled enemy.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Enemies are cloned from template data so combat can safely mutate health
    //   and statuses without corrupting the master enemy definitions.
    startCombat(enemyType, health = null) {
        gameState.inCombat = true;
        gameState.currentEnemy = JSON.parse(JSON.stringify(gameState.enemies[enemyType]));
        gameState.currentEnemy.type = enemyType;
        this.combatStartTime = Date.now();
        this.defeatProcessed = false;
        this.combatLocked = false;
        this.turnState = "player";
        this.actionCooldown = false;
        this.setCombatInputsEnabled(true);
        
        this.applyDifficultyModifiers();
        
        if (health !== null) {
            gameState.currentEnemy.health = health;
        }
        
        // Track the encounter for the Journey Book before the fight gets messy.
        if (gameState.markEnemyEncountered) {
            gameState.markEnemyEncountered(enemyType);
        }
        if (window.uiController && typeof uiController.updateJourneyBook === 'function') {
            uiController.updateJourneyBook();
        }
        
        // Reset combat status effects.
        // Carrying poison from one unrelated fight into the next was... not a fun bug.
        gameState.statusEffects.player = [];
        gameState.statusEffects.enemy = [];
        
        // Show enemy intro
        this.showEnemyIntro(gameState.currentEnemy);
        
        // Delay the actual battle panel a bit so the intro has time to land.
        // Without this, fights technically worked, but they felt like pop-up windows with swords.
        setTimeout(() => {
            this.showCombatOverlay();
            
            if (gameState.currentEnemy.bossIntro) {
                this.showBossIntro(gameState.currentEnemy);
            }
            
            document.getElementById('combat-container').style.display = 'flex';
            
            document.getElementById('enemy-name').textContent = gameState.currentEnemy.name;
            document.getElementById('enemy-image').textContent = gameState.currentEnemy.icon;
            
            this.updateCombatHealthBars();
            this.updateSpecialMeter();
            this.updateStatusEffects();
            
            this.addCombatMessage(`A ${gameState.currentEnemy.name} appears! ${gameState.currentEnemy.description}`, 'enemy-action');
            
            if (gameState.inputMode === "type") {
                const commandInput = document.getElementById('command-input');
                if (commandInput) {
                    setTimeout(() => commandInput.focus(), 50);
                }
            }
        }, 2500); // Wait for intro animation
    }
    
    showEnemyIntro(enemy) {
        const overlay = document.getElementById('enemy-intro-overlay');
        const icon = document.getElementById('enemy-intro-icon');
        const title = document.getElementById('enemy-intro-title');
        const name = document.getElementById('enemy-intro-name');
        const desc = document.getElementById('enemy-intro-description');
        
        if (!overlay) return;
        
        icon.textContent = enemy.icon;
        title.textContent = enemy.bossIntro ? enemy.bossTitle : "ENEMY ENCOUNTER!";
        name.textContent = enemy.name;
        desc.textContent = enemy.bossIntro ? enemy.bossDescription : "Prepare for combat!";
        
        if (enemy.bossIntro) {
            overlay.classList.add('boss-intro');
        } else {
            overlay.classList.remove('boss-intro');
        }
        
        overlay.style.display = 'flex';
        
        // Auto-hide after 2 seconds
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 2000);
    }
    
    applyDifficultyModifiers() {
        if (!gameState.currentEnemy) return;
        
        const modifier = gameState.getDifficultyModifier();
        gameState.currentEnemy.health = Math.floor(gameState.currentEnemy.health * modifier.health);
        gameState.currentEnemy.maxHealth = Math.floor(gameState.currentEnemy.maxHealth * modifier.health);
        gameState.currentEnemy.attack = Math.floor(gameState.currentEnemy.attack * modifier.attack);
        gameState.currentEnemy.defense = Math.floor(gameState.currentEnemy.defense * modifier.defense);
    }
    
    // Bosses get an additional presentation layer before the fight fully begins.
    showBossIntro(enemy) {
        const bossIntro = document.getElementById('boss-intro');
        const bossIcon = document.getElementById('boss-icon');
        const bossTitle = document.getElementById('boss-title');
        const bossName = document.getElementById('boss-name');
        const bossDescription = document.getElementById('boss-description');
        
        bossIcon.textContent = enemy.icon;
        bossTitle.textContent = enemy.bossTitle;
        bossName.textContent = enemy.name;
        bossDescription.textContent = enemy.bossDescription;
        
        bossIntro.style.display = 'flex';
        
        setTimeout(() => {
            bossIntro.style.display = 'none';
        }, 3000);
    }
    
    // Reveal the combat panel and switch the page into combat mode.
    showCombatOverlay() {
        const overlay = document.getElementById('combat-overlay');
        const combatContainer = document.getElementById('combat-container');
        const combatBackdrop = document.getElementById('combat-backdrop');

        document.documentElement.classList.add('combat-active');
        document.body.classList.add('combat-active');

        if (combatBackdrop) {
            combatBackdrop.classList.remove('show');
        }

        if (overlay) {
            overlay.classList.remove('show');
            overlay.classList.remove('combat-type-only');
            overlay.style.display = 'none';
        }

        if (combatContainer) {
            requestAnimationFrame(() => combatContainer.classList.add('show'));
        }

        if (window.uiController && typeof uiController.addMessage === 'function' && gameState.currentEnemy) {
            uiController.addMessage(`Combat with ${gameState.currentEnemy.name} has begun. Scroll down to the battle panel to fight.`);
        }

        if (gameState.inputMode === "type") {
            const meter = document.getElementById('special-meter-container');
            if (meter) meter.style.display = 'flex';
            this.showTypeOnlyCombatReminder();
        } else {
            const meter = document.getElementById('special-meter-container');
            if (meter) meter.style.display = 'none';
        }
    }
    
    // Tear down overlay-specific visuals once the battle is over.
    hideCombatOverlay() {
        const overlay = document.getElementById('combat-overlay');
        const combatContainer = document.getElementById('combat-container');
        const combatBackdrop = document.getElementById('combat-backdrop');
        if (overlay) {
            overlay.classList.remove('show');
            overlay.classList.remove('combat-type-only');
            overlay.style.top = '';
            overlay.style.height = '';
            overlay.style.display = 'none';
            
            const reminder = document.getElementById('combat-command-reminder');
            if (reminder) reminder.style.display = 'none';
            
            // Hide special meter
            const meter = document.getElementById('special-meter-container');
            if (meter) meter.style.display = 'none';
        }

        document.documentElement.classList.remove('combat-active');
        document.body.classList.remove('combat-active');
        if (combatBackdrop) {
            combatBackdrop.classList.remove('show');
        }
        if (combatContainer) {
            combatContainer.classList.remove('show');
        }
    }
    
    // Optional helper for scrolling the player toward the battle panel on smaller layouts.
    autoScrollToCombat() {
        document.body.classList.add('auto-scroll-combat');
        
        const combatContainer = document.getElementById('combat-container');
        if (combatContainer) {
            combatContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        
        setTimeout(() => {
            document.body.classList.remove('auto-scroll-combat');
        }, 1000);
    }
    
    // Play entrance-specific animations for enemies with custom encounter styles.
    showEnemyEntrance(enemy) {
        const enemyImage = document.getElementById('enemy-image');
        if (!enemyImage) return;
        
        const effect = enemy.entranceEffect || "normal";
        enemyImage.classList.add(`enemy-entrance-${effect}`);
        
        setTimeout(() => {
            enemyImage.classList.remove(`enemy-entrance-${effect}`);
        }, effect === "boss" ? 2000 : 1000);
    }
    
    // In type-only mode, combat commands must be discoverable without on-screen buttons.
    showTypeOnlyCombatReminder() {
        this.addCombatMessage('Type commands such as attack, defend, special, flee, or use item to act in combat.', 'player-action');
    }
    
    // Recalculate both health bars from the current player and enemy health values.
    updateCombatHealthBars() {
        const playerHealthPercent = (gameState.health / gameState.maxHealth) * 100;
        const enemyHealthPercent = (gameState.currentEnemy.health / gameState.currentEnemy.maxHealth) * 100;
        
        document.getElementById('player-health-bar').style.width = `${playerHealthPercent}%`;
        document.getElementById('enemy-health-bar').style.width = `${enemyHealthPercent}%`;
        
        document.getElementById('player-health-text').textContent = `${gameState.health}/${gameState.maxHealth}`;
        document.getElementById('enemy-health-text').textContent = `${gameState.currentEnemy.health}/${gameState.currentEnemy.maxHealth}`;
    }
    
    // Keep the special meter and button text in sync with combat charge.
    updateSpecialMeter() {
        const meterFill = document.getElementById('special-meter-fill');
        const meterText = document.getElementById('special-meter-text');
        const specialBtn = document.getElementById('special-btn');
        
        const width = gameState.specialCharge;
        const text = `${gameState.specialCharge}%`;
        
        if (meterFill) meterFill.style.width = `${width}%`;
        if (meterText) meterText.textContent = text;
        if (specialBtn) specialBtn.textContent = `Special (${gameState.specialCharge}%)`;
    }
    
    // Redraw the player's active status effects in the combat HUD.
    updateStatusEffects() {
        const container = document.getElementById('status-effects');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Player status effects
        gameState.statusEffects.player.forEach(effect => {
            const effectData = gameState.statusEffectsList[effect.name];
            if (!effectData) return;
            
            const effectElement = document.createElement('div');
            effectElement.className = `status-effect ${effect.name}`;
            effectElement.innerHTML = `
                <div class="status-icon">${effectData.icon}</div>
                <div class="status-info">
                    <div class="status-name">${effectData.name}</div>
                    <div class="status-turns">${effect.turnsRemaining} turns</div>
                </div>
            `;
            
            if (effect.turnsRemaining <= 1) {
                effectElement.classList.add('active');
            }
            
            container.appendChild(effectElement);
        });
    }

    // Hard-lock or unlock all combat inputs during turn resolution.
    setCombatInputsEnabled(enabled) {
        const buttons = document.querySelectorAll('.combat-btn');
        buttons.forEach(btn => {
            btn.disabled = !enabled;
            if (enabled) {
                btn.classList.remove('combat-action-delay');
            } else {
                btn.classList.add('combat-action-delay');
            }
        });
        
        const commandInput = document.getElementById('command-input');
        const submitBtn = document.getElementById('submit-btn');
        if (commandInput) {
            commandInput.disabled = !enabled;
        }
        if (submitBtn) {
            submitBtn.disabled = !enabled;
        }
    }

    // Guard player actions so they only fire during the correct turn window.
    canPlayerAct() {
        return gameState.inCombat && gameState.currentEnemy && !this.combatLocked && this.turnState === "player" && !this.actionCooldown;
    }

    // Mark the player turn as being consumed so double-inputs cannot stack.
    beginPlayerAction() {
        this.turnState = "resolve";
        this.setCombatInputsEnabled(false);
    }

    // Switch into the enemy phase before delayed enemy logic executes.
    beginEnemyTurn() {
        this.turnState = "enemy";
        this.setCombatInputsEnabled(false);
    }

    // Restore player control after the enemy has finished acting.
    finishEnemyTurn() {
        if (!gameState.inCombat || this.combatLocked) return;
        this.turnState = "player";
        this.setCombatInputsEnabled(true);
    }

    // Combat bonuses come from the best equipped weapon slot in use.
    getEquippedWeaponData() {
        const slots = ["twoHanded", "rightHand", "leftHand"];
        for (const slot of slots) {
            const itemName = gameState.equippedItems && gameState.equippedItems[slot];
            if (!itemName) continue;
            const itemData = gameState.items[itemName];
            if (itemData && itemData.type === "weapon") {
                return itemData;
            }
        }
        return null;
    }

    // Some crafted or special weapons deal extra damage to specific enemy categories.
    getWeaponDamageMultiplier() {
        const weapon = this.getEquippedWeaponData();
        if (!weapon || !weapon.bonusVs || !gameState.currentEnemy || !gameState.getEnemyCategory) return 1;
        const category = gameState.getEnemyCategory(gameState.currentEnemy.type, gameState.currentEnemy);
        const bonus = weapon.bonusVs[category];
        return bonus ? bonus : 1;
    }
    
    // Append a readable combat event to the battle log panel.
    addCombatMessage(text, type = 'player-action') {
        const combatLog = document.getElementById('combat-log');
        const message = document.createElement('div');
        message.classList.add('combat-message', type);
        message.textContent = text;
        combatLog.appendChild(message);
        combatLog.scrollTop = combatLog.scrollHeight;
    }
    
    // Add a short cooldown so repeated clicks or key presses cannot trigger duplicate actions.
    startActionCooldown() {
        if (this.actionCooldown || this.combatLocked || this.turnState !== "player") return false;
        
        this.actionCooldown = true;
        
        // Disable combat buttons
        const buttons = document.querySelectorAll('.combat-btn');
        buttons.forEach(btn => {
            btn.disabled = true;
            btn.classList.add('combat-action-delay');
        });
        
        setTimeout(() => {
            this.actionCooldown = false;
            if (!this.combatLocked && this.turnState === "player") {
                buttons.forEach(btn => {
                    btn.disabled = false;
                    btn.classList.remove('combat-action-delay');
                });
            }
        }, 500); // 0.5 second cooldown
        
        return true;
    }
    
    // Basic attack action with variance, crit chance, status processing, and turn handoff.
    playerAttack() {
        if (!this.canPlayerAct()) return;
        
        if (!this.startActionCooldown()) return;
        this.beginPlayerAction();
        
        // Check if player is stunned
        if (gameState.hasStatusEffect("player", "stun")) {
            this.addCombatMessage(`${gameState.username} is stunned and cannot attack!`, 'enemy-action');
            gameState.processStatusEffects("player");
            setTimeout(() => {
                this.enemyTurn();
            }, this.playerActionDelay);
            return;
        }
        
        const baseDamage = gameState.attack;
        const variance = Math.floor(Math.random() * 5) - 2;
        const damageMultiplier = this.getWeaponDamageMultiplier();
        let damage = Math.max(1, baseDamage + variance - gameState.currentEnemy.defense);
        damage = Math.max(1, Math.floor(damage * damageMultiplier));
        
        gameState.currentEnemy.health -= damage;
        
        this.addCombatMessage(`${gameState.username} attacks the ${gameState.currentEnemy.name} for ${damage} damage!`, 'player-action');
        
        // Check for critical hit (10% chance)
        if (Math.random() < 0.1) {
            const critDamage = Math.floor(damage * 1.5);
            gameState.currentEnemy.health -= critDamage;
            this.addCombatMessage(`CRITICAL HIT! Extra ${critDamage} damage!`, 'player-action');
        }
        
        // Visual effects
        if (gameState.combatAnimations) {
            document.getElementById('combat-container').classList.add('shake');
            setTimeout(() => {
                document.getElementById('combat-container').classList.remove('shake');
            }, 500);
            
            document.getElementById('enemy-image').classList.add('hit-flash');
            setTimeout(() => {
                document.getElementById('enemy-image').classList.remove('hit-flash');
            }, 500);
        }
        
        this.updateCombatHealthBars();
        
        // Check if enemy is defeated
        if (gameState.currentEnemy.health <= 0) {
            this.enemyDefeated();
            return;
        }
        
        // Process status effects
        const statusResults = gameState.processStatusEffects("player");
        statusResults.forEach(result => this.addCombatMessage(result, 'player-action'));
        
        // Increase special charge
        gameState.specialCharge = Math.min(100, gameState.specialCharge + 15);
        this.updateSpecialMeter();
        
        // Enemy turn
        this.addCombatMessage('The enemy prepares to strike...', 'enemy-action');
        setTimeout(() => {
            this.enemyTurn();
        }, this.playerActionDelay);
    }
    
    // Defensive action temporarily boosts defense for the incoming enemy hit.
    playerDefend() {
        if (!this.canPlayerAct()) return;
        
        if (!this.startActionCooldown()) return;
        this.beginPlayerAction();
        
        // Check if player is stunned
        if (gameState.hasStatusEffect("player", "stun")) {
            this.addCombatMessage(`${gameState.username} is stunned and cannot defend!`, 'enemy-action');
            gameState.processStatusEffects("player");
            setTimeout(() => {
                this.enemyTurn();
            }, this.playerActionDelay);
            return;
        }
        
        const originalDefense = gameState.defense;
        gameState.defense += 5;
        
        this.addCombatMessage(`${gameState.username} takes a defensive stance! Defense +5!`, 'player-action');
        
        // Process status effects
        const statusResults = gameState.processStatusEffects("player");
        statusResults.forEach(result => this.addCombatMessage(result, 'player-action'));
        
        // Increase special charge
        gameState.specialCharge = Math.min(100, gameState.specialCharge + 10);
        this.updateSpecialMeter();
        
        // Enemy attacks
        this.addCombatMessage('The enemy prepares to strike...', 'enemy-action');
        setTimeout(() => {
            this.enemyTurn();
            // Restore original defense after enemy attack
            gameState.defense = originalDefense;
        }, this.playerActionDelay);
    }
    
    // Spend a full special meter on a much stronger player attack.
    playerSpecial() {
        if (!this.canPlayerAct()) return;
        if (gameState.specialCharge < 100) return;
        
        if (!this.startActionCooldown()) return;
        this.beginPlayerAction();
        
        // Check if player is stunned
        if (gameState.hasStatusEffect("player", "stun")) {
            this.addCombatMessage(`${gameState.username} is stunned and cannot use special!`, 'enemy-action');
            gameState.processStatusEffects("player");
            setTimeout(() => {
                this.enemyTurn();
            }, this.specialActionDelay);
            return;
        }
        
        // Calculate special damage
        const damageMultiplier = this.getWeaponDamageMultiplier();
        let damage = gameState.attack * 3 - gameState.currentEnemy.defense;
        damage = Math.max(1, Math.floor(damage * damageMultiplier));
        
        // Apply damage
        gameState.currentEnemy.health -= damage;
        
        this.addCombatMessage(`${gameState.username} uses SPECIAL ATTACK! Deals ${damage} damage to the ${gameState.currentEnemy.name}!`, 'player-action');
        
        // Visual effect
        if (gameState.combatAnimations) {
            document.getElementById('combat-container').classList.add('shake');
            setTimeout(() => {
                document.getElementById('combat-container').classList.remove('shake');
            }, 800);
            
            const enemyImage = document.getElementById('enemy-image');
            enemyImage.classList.add('special-attack-animation');
            setTimeout(() => {
                enemyImage.classList.remove('special-attack-animation');
            }, 800);
            
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    document.getElementById('enemy-image').classList.add('hit-flash');
                    setTimeout(() => {
                        document.getElementById('enemy-image').classList.remove('hit-flash');
                    }, 200);
                }, i * 300);
            }
        }
        
        // Apply random status effect (30% chance)
        if (Math.random() < 0.3) {
            const effects = ["stun", "burn", "poison"];
            const randomEffect = effects[Math.floor(Math.random() * effects.length)];
            gameState.addStatusEffect("enemy", randomEffect);
            this.addCombatMessage(`${gameState.currentEnemy.name} is now ${randomEffect}ed!`, 'player-action');
        }
        
        // Reset special charge
        gameState.specialCharge = 0;
        this.updateSpecialMeter();
        
        this.updateCombatHealthBars();
        this.updateStatusEffects();
        
        // Check if enemy is defeated
        if (gameState.currentEnemy.health <= 0) {
            this.enemyDefeated();
            return;
        }
        
        // Process status effects
        const statusResults = gameState.processStatusEffects("player");
        statusResults.forEach(result => this.addCombatMessage(result, 'player-action'));
        
        // Enemy attacks back
        this.addCombatMessage('The enemy prepares to strike...', 'enemy-action');
        setTimeout(() => {
            this.enemyTurn();
        }, this.specialActionDelay);
    }
    
    // Resolve the enemy's turn, including status effects and special monster abilities.
    enemyTurn() {
        if (!gameState.inCombat || !gameState.currentEnemy || this.combatLocked) return;
        if (gameState.currentEnemy.health <= 0) return;
        this.beginEnemyTurn();
        
        // Check if enemy is stunned
        if (gameState.hasStatusEffect("enemy", "stun")) {
            this.addCombatMessage(`${gameState.currentEnemy.name} is stunned and cannot attack!`, 'player-action');
            gameState.processStatusEffects("enemy");
            setTimeout(() => this.finishEnemyTurn(), this.enemyActionDelay);
            return;
        }
        
        // Enemy abilities
        if (gameState.currentEnemy.abilities && gameState.currentEnemy.abilities.length > 0) {
            const ability = gameState.currentEnemy.abilities[Math.floor(Math.random() * gameState.currentEnemy.abilities.length)];
            
            switch (ability) {
                case "poison":
                    if (!gameState.hasStatusEffect("player", "poison")) {
                        gameState.addStatusEffect("player", "poison");
                        this.addCombatMessage(`${gameState.currentEnemy.name} poisons ${gameState.username}!`, 'enemy-action');
                    }
                    break;
                case "burn":
                    if (!gameState.hasStatusEffect("player", "burn")) {
                        gameState.addStatusEffect("player", "burn");
                        this.addCombatMessage(`${gameState.currentEnemy.name} sets ${gameState.username} on fire!`, 'enemy-action');
                    }
                    break;
                case "stun":
                    if (!gameState.hasStatusEffect("player", "stun")) {
                        gameState.addStatusEffect("player", "stun");
                        this.addCombatMessage(`${gameState.currentEnemy.name} stuns ${gameState.username}!`, 'enemy-action');
                    }
                    break;
                case "multi_attack":
                    // Multiple attacks
                    for (let i = 0; i < 3; i++) {
                        setTimeout(() => {
                            const damage = Math.max(1, Math.floor(gameState.currentEnemy.attack / 3) - gameState.defense);
                            gameState.health -= damage;
                            this.addCombatMessage(`${gameState.currentEnemy.name} strikes ${gameState.username} for ${damage} damage! (${i+1}/3)`, 'enemy-action');
                            this.updateCombatHealthBars();
                        }, i * 300);
                    }
                    break;
            }
        }
        
        // Regular attack (if no special ability triggered or after delay)
        setTimeout(() => {
            if (!gameState.inCombat || !gameState.currentEnemy) return;
            
            const baseDamage = gameState.currentEnemy.attack;
            const variance = Math.floor(Math.random() * 5) - 2;
            const damage = Math.max(1, baseDamage + variance - gameState.defense);
            
            gameState.health -= damage;
            
            this.addCombatMessage(`${gameState.currentEnemy.name} attacks ${gameState.username} for ${damage} damage!`, 'enemy-action');
            
            // Visual effect
            if (gameState.combatAnimations) {
                document.getElementById('combat-container').classList.add('shake');
                setTimeout(() => {
                    document.getElementById('combat-container').classList.remove('shake');
                }, 500);
                
                document.querySelector('.character-image').classList.add('hit-flash');
                setTimeout(() => {
                    document.querySelector('.character-image').classList.remove('hit-flash');
                }, 500);
            }
            
            this.updateCombatHealthBars();
            this.updateStatusEffects();
            
            // Process status effects
            const enemyStatusResults = gameState.processStatusEffects("enemy");
            enemyStatusResults.forEach(result => this.addCombatMessage(result, 'enemy-action'));
            
            const playerStatusResults = gameState.processStatusEffects("player");
            playerStatusResults.forEach(result => this.addCombatMessage(result, 'player-action'));
            
            // Check if player is defeated
            if (gameState.health <= 0) {
                this.playerDefeated();
                return;
            }
            
            this.finishEnemyTurn();
        }, this.enemyActionDelay);
    }
    
    // Award rewards, update journals, and schedule a clean shutdown after victory.
    enemyDefeated() {
        if (this.defeatProcessed) return;
        this.defeatProcessed = true;
        this.combatLocked = true;
        if (gameState.currentEnemy) {
            gameState.currentEnemy.defeated = true;
        }
        this.setCombatInputsEnabled(false);
        
        const enemyName = gameState.currentEnemy.name;
        this.addCombatMessage(`${gameState.username} has defeated the ${enemyName}!`, 'player-action');
        
        // Award XP and items
        gameState.score += gameState.currentEnemy.xp;
        
        const drops = gameState.getEnemyLoot ? gameState.getEnemyLoot(gameState.currentEnemy.type) : [];
        if (drops.length > 0) {
            drops.forEach(drop => {
                if (drop) {
                    gameState.addToInventory(drop);
                    this.addCombatMessage(`${gameState.username} found: ${drop}`, 'player-action');
                }
            });
        }
        
        // Award gold based on enemy rarity
        let goldReward = 0;
        switch (gameState.currentEnemy.rarity) {
            case "common": goldReward = 5; break;
            case "uncommon": goldReward = 15; break;
            case "rare": goldReward = 30; break;
            case "legendary": goldReward = 100; break;
        }
        gameState.gold += goldReward;
        this.addCombatMessage(`${gameState.username} found ${goldReward} gold!`, 'player-action');
        
        // Journey Book progression
        if (gameState.markEnemyDefeated) {
            gameState.markEnemyDefeated(gameState.currentEnemy.type);
        }
        if (window.uiController && typeof uiController.updateJourneyBook === 'function') {
            uiController.updateJourneyBook();
        }
        
        // Track defeated enemy
        gameState.defeatedEnemies[gameState.currentLocation] = gameState.currentEnemy.type;
        
        // Remove active enemy marker
        if (gameState.activeEnemies[gameState.currentLocation]) {
            delete gameState.activeEnemies[gameState.currentLocation];
        }
        
        // End combat after a delay
        setTimeout(() => {
            this.endCombat();
            gameState.saveGame();
        }, 2000);
    }
    
    // Handle either permadeath or respawn depending on the selected difficulty.
    playerDefeated() {
        this.addCombatMessage(`${gameState.username} has been defeated...`, 'enemy-action');
        
        if (gameState.difficulty === "hardcore") {
            // Permadeath in hardcore mode
            this.addCombatMessage('This is the end of your journey...', 'enemy-action');
            gameState.gameCompleted = true;
            
            setTimeout(() => {
                this.endCombat();
                const output = document.getElementById('game-output');
                const message = document.createElement('div');
                message.classList.add('message');
                message.textContent = `GAME OVER - ${gameState.username} has died in Hardcore Mode.`;
                output.appendChild(message);
                gameState.saveGame();
            }, 3000);
        } else {
            // Normal mode - respawn at start with half health
            setTimeout(() => {
                this.addCombatMessage(`${gameState.username} wakes up at the starting point with half health.`, 'player-action');
                gameState.health = Math.floor(gameState.maxHealth / 2);
                gameState.currentLocation = "start";
                this.endCombat();
                gameState.saveGame();
                
                if (window.uiController) {
                    window.uiController.updateGameDisplay();
                }
            }, 3000);
        }
    }
    
    // Reset combat-specific state and return control to exploration mode.
    endCombat() {
        gameState.inCombat = false;
        gameState.currentEnemy = null;
        gameState.statusEffects.player = [];
        gameState.statusEffects.enemy = [];
        this.defeatProcessed = false;
        this.combatLocked = false;
        this.turnState = "player";
        this.actionCooldown = false;
        const combatContainer = document.getElementById('combat-container');
        if (combatContainer) {
            combatContainer.classList.remove('show');
            combatContainer.style.display = 'none';
        }
        document.getElementById('combat-log').innerHTML = '';
        
        this.hideCombatOverlay();
        this.setCombatInputsEnabled(true);
        
        // Close item submenu if open
        const itemSubmenu = document.getElementById('item-submenu');
        if (itemSubmenu) {
            itemSubmenu.style.display = 'none';
        }
        
        // Hide Type Only Mode reminder
        const reminder = document.getElementById('combat-command-reminder');
        if (reminder) {
            reminder.style.display = 'none';
        }
        
        // Clear status effects display
        const statusContainer = document.getElementById('status-effects');
        if (statusContainer) {
            statusContainer.innerHTML = '';
        }

        const commandInput = document.getElementById('command-input');
        if (commandInput) {
            commandInput.disabled = false;
            setTimeout(() => commandInput.focus(), 0);
        }

        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
        }

        if (window.uiController) {
            window.uiController.updateGameDisplay();
        }
        if (window.mapSystem) {
            window.mapSystem.updateMapDisplay();
        }
    }
    
    // Attempt to escape and preserve the enemy in the room if the player succeeds.
    fleeCombat() {
        if (!this.canPlayerAct()) return;
        
        if (!this.startActionCooldown()) return;
        this.beginPlayerAction();
        
        // Flee chance depends on difficulty
        let fleeChance = 0.7;
        
        if (gameState.difficulty === "hardcore") {
            fleeChance = 0.4;
        }
        
        if (Math.random() < fleeChance) {
            this.addCombatMessage(`${gameState.username} successfully flees from combat!`, 'player-action');
            
            // Store the enemy with its current health for later re-engagement
            gameState.activeEnemies[gameState.currentLocation] = {
                type: gameState.currentEnemy.type,
                health: gameState.currentEnemy.health,
                name: gameState.currentEnemy.name
            };
            
            setTimeout(() => {
                this.endCombat();
                gameState.saveGame();
                
                // Update map to show flee marker
                if (window.mapSystem) {
                    window.mapSystem.updateMapDisplay();
                }
            }, 1000);
        } else {
            this.addCombatMessage(`${gameState.username} tries to flee but the enemy blocks the escape!`, 'player-action');
            // Enemy attacks
            this.addCombatMessage('The enemy prepares to strike...', 'enemy-action');
            setTimeout(() => {
                this.enemyTurn();
            }, this.playerActionDelay);
        }
    }
    
    // Open the battle item picker; actual item use happens in `useSelectedItem`.
    useItemInCombat() {
        if (!gameState.inCombat || !gameState.currentEnemy || this.actionCooldown || this.combatLocked || this.turnState !== "player") return;
        
        this.showItemSubmenu();
    }
    
    // Build a temporary menu of only combat-usable inventory items.
    showItemSubmenu() {
        const itemSubmenu = document.getElementById('item-submenu');
        const itemOptions = document.getElementById('item-options');
        
        itemOptions.innerHTML = '';
        
        // Get usable items from inventory (grouped by type)
        const itemGroups = {};
        gameState.inventory.forEach(item => {
            const itemData = gameState.items[item];
            if (itemData && itemData.type === "consumable") {
                if (!itemGroups[item]) {
                    itemGroups[item] = 0;
                }
                itemGroups[item]++;
            }
        });
        
        if (Object.keys(itemGroups).length === 0) {
            const noItems = document.createElement('div');
            noItems.classList.add('item-option');
            noItems.textContent = 'No usable items in inventory';
            itemOptions.appendChild(noItems);
        } else {
            Object.keys(itemGroups).forEach(item => {
                const itemData = gameState.items[item];
                const count = itemGroups[item];
                const icon = gameState.getItemIcon ? gameState.getItemIcon(item) : (itemData && itemData.icon ? itemData.icon : "📦");
                const itemOption = document.createElement('div');
                itemOption.classList.add('item-option');
                itemOption.innerHTML = `
                    ${icon} ${itemData.name} (${count})
                `;
                itemOption.addEventListener('click', () => {
                    this.useSelectedItem(item);
                    this.closeItemSubmenu();
                });
                itemOptions.appendChild(itemOption);
            });
        }
        
        itemSubmenu.style.display = 'flex';
    }
    
    // Close the combat item picker without consuming a turn.
    closeItemSubmenu() {
        const itemSubmenu = document.getElementById('item-submenu');
        if (itemSubmenu) {
            itemSubmenu.style.display = 'none';
        }
    }
    
    // Consume one selected item and then hand the turn over to the enemy.
    useSelectedItem(item) {
        if (!this.canPlayerAct()) return;
        
        if (!this.startActionCooldown()) return;
        this.beginPlayerAction();
        
        let healAmount = 0;
        let message = '';
        let cureEffect = null;
        
        const itemData = gameState.items[item];
        
        if (itemData && itemData.type === "consumable" && itemData.effect) {
            if (itemData.effect.health) {
                healAmount = itemData.effect.health;
                message = `${gameState.username} uses ${itemData.name} and restores ${healAmount} health.`;
            }
            if (itemData.effect.cure) {
                cureEffect = itemData.effect.cure;
                message = `${gameState.username} uses ${itemData.name} and is cured of ${cureEffect}!`;
            }
        } else if (item === "healing herb") {
            healAmount = 20;
            message = `${gameState.username} uses a healing herb and restores 20 health.`;
        } else if (item === "small health potion") {
            healAmount = 15;
            message = `${gameState.username} drinks a small health potion and restores 15 health.`;
        } else if (item === "health potion") {
            healAmount = 30;
            message = `${gameState.username} drinks a health potion and restores 30 health.`;
        } else if (item === "large health potion") {
            healAmount = 50;
            message = `${gameState.username} drinks a large health potion and restores 50 health.`;
        } else if (item === "antidote") {
            cureEffect = "poison";
            message = `${gameState.username} uses an antidote and is cured of poison!`;
        }
        
        if (healAmount > 0 || cureEffect) {
            // Remove ONE item from inventory (not all of that type)
            const itemIndex = gameState.inventory.indexOf(item);
            if (itemIndex !== -1) {
                gameState.inventory.splice(itemIndex, 1);
            }
            
            if (healAmount > 0) {
                gameState.health = Math.min(gameState.health + healAmount, gameState.maxHealth);
            }
            
            if (cureEffect) {
                // Remove the specific status effect
                gameState.statusEffects.player = gameState.statusEffects.player.filter(
                    effect => effect.name !== cureEffect
                );
            }
            
            this.addCombatMessage(message, 'player-action');
            this.updateCombatHealthBars();
            this.updateStatusEffects();
            
            // Update UI
            if (window.uiController) {
                window.uiController.updateGameDisplay();
            }
            
            // Increase special charge
            gameState.specialCharge = Math.min(100, gameState.specialCharge + 5);
            this.updateSpecialMeter();
            
            // Enemy attacks
            this.addCombatMessage('The enemy prepares to strike...', 'enemy-action');
            setTimeout(() => {
                this.enemyTurn();
            }, this.playerActionDelay);
        }
    }
    
    // Parse text commands while the game is in combat mode.
    handleCombatCommand(command) {
        if (!gameState.inCombat || !gameState.currentEnemy) {
            return false;
        }
        
        if (this.combatLocked || this.turnState !== "player") {
            return true;
        }
        
        command = command.toLowerCase().trim();
        
        switch (command) {
            case 'attack':
            case 'a':
                this.playerAttack();
                return true;
                
            case 'defend':
            case 'd':
                this.playerDefend();
                return true;
                
            case 'flee':
            case 'f':
                this.fleeCombat();
                return true;
                
            case 'special':
            case 's':
                this.playerSpecial();
                return true;
                
            case 'use item':
            case 'use':
                this.useItemInCombat();
                return true;
                
            case 'help combat':
            case 'combat help':
                this.showCombatHelp();
                return true;
                
            default:
                if (command.startsWith('use ')) {
                    const item = command.substring(4);
                    this.useSpecificItem(item);
                    return true;
                }
                return false;
        }
    }
    
    // Print the compact combat-specific help list into the battle log.
    showCombatHelp() {
        this.addCombatMessage('Combat Commands:', 'player-action');
        this.addCombatMessage('attack / a - Attack the enemy', 'player-action');
        this.addCombatMessage('defend / d - Defend against next attack', 'player-action');
        this.addCombatMessage('flee / f - Attempt to flee from combat', 'player-action');
        this.addCombatMessage('special / s - Use special attack (requires 100%)', 'player-action');
        this.addCombatMessage('use item - Use an item from inventory', 'player-action');
        this.addCombatMessage('use [item name] - Use a specific item', 'player-action');
    }
    
    // Allow typed `use <item>` commands to reuse the same combat item logic.
    useSpecificItem(itemName) {
        if (!gameState.inCombat || !gameState.currentEnemy || this.combatLocked) return;
        
        if (gameState.inventory.includes(itemName)) {
            this.useSelectedItem(itemName);
        } else {
            this.addCombatMessage(`${gameState.username} doesn't have ${itemName} in the inventory.`, 'player-action');
        }
    }
}

const combatSystem = new CombatSystem();

