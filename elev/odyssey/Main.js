/* so this acts as the main gameplay controller for exploration, command parsing, and room flow.

Key Systems:
- Game startup and save loading
- Exploration command routing
- Movement, items, sub-areas, and encounters
- Achievement and message output

Flow:
- Receives typed or clicked commands from the UI
- Validates the current game state
- Updates `gameState`, then asks UI and map systems to redraw

Design Notes:
- This file is the traffic controller. It keeps most commands in one place so
  the other systems can stay specialized instead of all trying to drive at once.
*/

// Main.js - Main initialization and game loop (Updated to fix duplicate welcome messages)
// Main owns the exploration loop once the player has entered the game.
class Main {
    // MAIN GAME LOOP SETUP
    // -----------------------------------
    // This class is the central coordinator for exploration mode. It sits
    // between the UI layer and the specialized systems, deciding what should
    // happen when the player types a command or clicks a quick action.

    // Creates the main gameplay controller.
    // Runs once when the file is loaded and the singleton is created.
    // Inputs:
    // - None.
    // Returns:
    // - A configured `Main` instance.
    // Why it is designed this way:
    // - Runtime systems such as map, combat, and UI are singletons in this
    //   project, so `Main` is also kept as one shared coordinator.
    constructor() {
        this.commandHistory = [];
        this.gameInitialized = false;
        this.isInitializing = false;
        this.startButtonLocked = false;
        this.hasShownWelcome = false; // Track if welcome has been shown
    }
    
    // Initializes the live play session.
    // Called after the player has passed login/setup and presses the start button.
    // Inputs:
    // - None.
    // Returns:
    // - Nothing. It hydrates world state and updates the visible UI.
    // Why it is designed this way:
    // - Startup is guarded so the game cannot accidentally initialize twice,
    //   which would cause duplicate timers, duplicate welcome messages, and
    //   potentially corrupted screen state.
    init() {
        if (this.isInitializing || this.gameInitialized) {
            console.warn('Game initialization already in progress or completed');
            return;
        }
        
        this.isInitializing = true;
        console.log('Initializing game systems...');
        
        try {
            // No logged-in user means no active campaign to initialize. Simple,
            // boring, and much better than building a world for nobody.
            if (!gameState.isLoggedIn) {
                console.log('No user logged in, showing login screen');
                this.isInitializing = false;
                return;
            }
            
            // Reset welcome flag
            this.hasShownWelcome = false;
            
            // Load saved game if exists
            let loadedFromSave = false;
            if (gameState.loadGame()) {
                console.log('Loaded saved game for', gameState.username);
                loadedFromSave = true;
            } else {
                console.log('Starting new game for', gameState.username);
            }
            
            // The world may already exist in a loaded save. If it does not,
            // generate it now so all later systems have valid map data.
            if (!gameState.world || Object.keys(gameState.world).length === 0) {
                console.log('Generating new world...');
                if (window.mapSystem && typeof mapSystem.generateWorld === 'function') {
                    gameState.world = mapSystem.generateWorld();
                }
            }
            
            // This is a defensive fallback for damaged saves or incomplete worlds.
            if (!gameState.world["start"]) {
                gameState.world["start"] = {
                    id: "start",
                    name: "Starting Point",
                    short: "ST",
                    description: "You stand at the beginning of your adventure.",
                    shortDescription: "You stand at the beginning of your adventure.",
                    lookDescription: "A rough camp and a handful of old markers show where countless journeys have begun.",
                    icon: "🧭",
                    items: ["rusty sword"],
                    exits: {},
                    coordinates: { x: 0, y: 0 },
                    biome: "forest",
                    explored: true,
                    locked: false,
                    campfire: false,
                    requiredKey: null,
                    subArea: null
                };
            }
            
            // If the stored location is invalid, fail safely by snapping the
            // player back to the known start node instead of crashing.
            if (!gameState.world[gameState.currentLocation]) {
                gameState.currentLocation = "start";
            }

            gameState.prepareLocationForVisit(gameState.currentLocation);
            
            if (!gameState.visitedLocations.includes(gameState.currentLocation)) {
                gameState.visitedLocations = [gameState.currentLocation];
            }
            
            // Initialize UI
            if (uiController) {
                uiController.updateGameDisplay();
                uiController.updateModeIndicator();
                uiController.updateInputMode(gameState.inputMode);
                
                if (gameState.inputMode === "type") {
                    uiController.showInputModeReminder();
                }
            }
            
            // Initialize map
            if (mapSystem) {
                mapSystem.centerMapOnLocation(gameState.currentLocation);
                mapSystem.updateMapDisplay();
                
                // Update map title based on current map
                mapSystem.updateMapTitle();
            }
            
            // Auto-save stays in the main loop because it depends on the game
            // being fully active, not just on the account existing.
            setInterval(() => {
                if (gameState.autoSave) {
                    gameState.saveGame();
                }
            }, 30000);
            
            this.gameInitialized = true;
            console.log('Game initialization complete');
            
            // Show welcome message only once
            if (!gameState.hasShownWelcome) {
                if (loadedFromSave) {
                    this.addMessage(`Welcome back, ${gameState.username}!`);
                } else {
                    this.addMessage(`Welcome ${gameState.username}! Your journey begins now...`);
                    this.addMessage('Type "help" for a list of commands or use quick actions below.');
                }
                gameState.hasShownWelcome = true;
            }
            
        } catch (error) {
            console.error('Game initialization failed:', error);
            this.addMessage('Game initialization failed. Please refresh the page.');
        } finally {
            this.isInitializing = false;
        }
    }
    
    // COMMAND ROUTING
    // -----------------------------------
    // This section decides which subsystem should respond to a player command.
    // It also prevents systems from overlapping, such as moving during combat
    // or typing exploration commands while inside a minigame.

    // Routes a player command during exploration mode.
    // Called by the command input box, quick buttons, and some helper systems.
    // Inputs:
    // - `command`: Raw player input before or after UI shortcuts normalize it.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Keeping command parsing centralized means typed input and clicked input
    //   behave the same way, which makes the game easier to maintain and learn.
    processCommand(command) {
        if (gameState.gameCompleted) {
            this.addMessage('The game is over. Refresh the page to start a new game.');
            return;
        }
        
        if (gameState.inCombat) {
            if (combatSystem.handleCombatCommand(command)) {
                return;
            }
            
            if (gameState.inputMode === "type") {
                this.addMessage('You are in combat! Type commands like: attack, defend, flee, special, use item');
                this.addMessage('Type "help combat" for detailed combat commands.');
            } else {
                this.addMessage('You are in combat! Use the combat buttons or type commands.');
            }
            return;
        }
        
        if (gameState.minigameActive) {
            this.addMessage('You are in a minigame! Finish it first.');
            return;
        }
        
        command = command.toLowerCase().trim();
        
        if (command === '') {
            return;
        }
        
        this.addToHistory(command);

        if (window.mapSystem && mapSystem.isExploreModeActive && mapSystem.isExploreModeActive()) {
            // Map explore mode is intentionally non-movement mode. Without this
            // guard, players could pan around the map and accidentally walk at
            // the same time, which would feel confusing.
            if (this.isMovementCommand(command)) {
                this.addMessage('Map explore mode is active. Close it to move.');
                return;
            }
        }
        
        if (command === 'look' || command === 'l' || command === 'look around') {
            this.handleLookCommand();
        } 
        else if (command.startsWith('go ')) {
            this.handleGoCommand(command);
        }
        else if (command === 'inventory' || command === 'i') {
            uiController.openInventoryModal();
        }
        else if (command === 'help' || command === 'h') {
            this.showHelp();
        }
        else if (command === 'score') {
            this.addMessage(`Your score is: ${gameState.score}`);
        }
        else if (command.startsWith('take ')) {
            this.handleTakeCommand(command);
        }
        else if (command.startsWith('use ')) {
            this.handleUseCommand(command);
        }
        else if (command === 'quit') {
            this.addMessage('Thanks for playing!');
            this.addMessage(`Final Score: ${gameState.score}`);
        }
        else if (['north', 'south', 'east', 'west', 'up', 'down'].includes(command)) {
            this.handleGoCommand(`go ${command}`);
        }
        else if (command === 'back' || command === 'return') {
            this.handleBackCommand();
        }
        else if (command === 'craft') {
            uiController.openCraftingPanel();
        }
        else if (command === 'shop') {
            if (window.shopSystem && typeof shopSystem.openShop === 'function') {
                shopSystem.openShop();
            } else {
                this.addMessage('There is no shop system available right now.');
            }
        }
        else if (command === 'minigame' || command === 'play' || command === 'games') {
            if (window.minigameSystem && typeof minigameSystem.openHub === 'function') {
                minigameSystem.openHub();
            } else {
                this.addMessage('There is no playable event here right now.');
            }
        }
        else if (command.startsWith('play ')) {
            if (window.minigameSystem && typeof minigameSystem.playByName === 'function') {
                minigameSystem.playByName(command.substring(5));
            } else {
                this.addMessage('That activity is not available right now.');
            }
        }
        else if (command.startsWith('equip ')) {
            this.handleEquipCommand(command);
        }
        else if (command.startsWith('unequip ')) {
            this.handleUnequipCommand(command);
        }
        else if (command === 'map') {
            this.addMessage('Checking map...');
            if (mapSystem) {
                mapSystem.updateMapDisplay();
                mapSystem.updateMapTitle();
            }
        }
        else if (command === 'help combat') {
            this.addMessage('Combat Commands (when in combat):');
            this.addMessage('attack / a - Attack the enemy');
            this.addMessage('defend / d - Defend against next attack');
            this.addMessage('flee / f - Attempt to flee from combat');
            this.addMessage('special / s - Use special attack (requires 100%)');
            this.addMessage('use item - Use an item from inventory');
            this.addMessage('use [item name] - Use a specific item');
        }
        else if (command === 'logout') {
            uiController.handleLogout();
        }
        else if (command === 'restart') {
            uiController.restartGame();
        }
        else if (command.startsWith('unlock ') || command === 'unlock') {
            this.handleUnlockCommand(command);
        }
        else if (command === 'enter' || command === 'enter dungeon' || command === 'enter cave') {
            this.handleEnterCommand();
        }
        else if (command === 'exit' || command === 'leave') {
            this.handleExitCommand();
        }
        else {
            this.addMessage(`I don't understand "${command}". Type "help" for available commands.`);
        }
    }
    
    // LOCATION DESCRIPTION
    // -----------------------------------
    // These helpers describe the room the player is in and explain which
    // systems are currently interactable there.

    // Explains context-sensitive interactions available at a location.
    // Called during arrival text and detailed look text.
    // Inputs:
    // - `location`: The current location object.
    // Returns:
    // - Nothing. It writes messages to the output panel.
    // Why it is designed this way:
    // - Players should not have to guess whether a shop, portal, or minigame
    //   is usable. Explicit hints reduce friction without reducing discovery.
    describeLocationInteractions(location) {
        if (!location) return;

        if (location.subArea && !location.locked) {
            this.addMessage('You can enter this area. Type "enter" to move inside.');
        }

        if (location.isShop) {
            this.addMessage('You can shop here. Type "shop" to browse goods.');
        }

        if (window.minigameSystem && typeof minigameSystem.hasActivitiesAtLocation === 'function' && minigameSystem.hasActivitiesAtLocation(location)) {
            this.addMessage('There is an activity here. Type "play" to open local events.');
        }
    }

    // Chooses the short description used during normal movement.
    // Called when the player arrives somewhere but has not explicitly searched.
    // Inputs:
    // - `location`: The location being described.
    // Returns:
    // - A short descriptive string.
    // Why it is designed this way:
    // - Separating short and detailed descriptions makes movement brisk while
    //   still rewarding players who choose to inspect rooms more closely.
    getShortLocationDescription(location) {
        if (!location) return 'There is little to note here.';
        return location.shortDescription || location.description || `You are at ${location.name}.`;
    }

    // Chooses the detailed description used by `look`.
    // Called when the player spends an action inspecting the current room.
    // Inputs:
    // - `location`: The location being described.
    // Returns:
    // - A more detailed descriptive string.
    // Why it is designed this way:
    // - This supports the game's text-adventure feel by separating movement
    //   narration from deliberate observation.
    getDetailedLocationDescription(location) {
        if (!location) return 'There is little to inspect here.';
        return location.lookDescription || location.detailDescription || location.description || this.getShortLocationDescription(location);
    }

    // Prints the standard arrival message for a newly entered location.
    // Called immediately after movement or after entering/exiting a sub-area.
    // Inputs:
    // - `location`: The location object the player has arrived at.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Arrival text keeps movement informative but compact, leaving the full
    //   room investigation to the separate `look` command.
    describeArrival(location) {
        if (!location) return;

        this.addMessage(`You arrive at: ${location.name}`);
        this.addMessage(this.getShortLocationDescription(location));

        if (location.campfire) {
            this.addMessage('A campfire crackles nearby.');
        }

        if (location.locked) {
            const requiredKey = location.requiredKey || "magic key";
            const hasKey = gameState.inventory.includes(requiredKey);
            this.addMessage(`This area is locked. ${hasKey ? `You have the ${requiredKey} to unlock it!` : `You need a ${requiredKey} to unlock it.`}`);
        }

        this.describeLocationInteractions(location);

        const exitDirections = Object.keys(location.exits || {});
        if (exitDirections.length > 0) {
            this.addMessage(`Exits: ${exitDirections.join(', ')}`);
        } else {
            this.addMessage('No visible exits.');
        }
    }

    // EXPLORATION ACTIONS
    // -----------------------------------
    // These methods perform the player's non-combat actions: looking, moving,
    // looting, item use, and interaction with area entrances.

    // Lets the player perform a detailed search of the current room.
    // Called when the player types `look` or presses the look quick button.
    // Inputs:
    // - None.
    // Returns:
    // - `true` if the look action succeeded, `false` if it was blocked.
    // Why it is designed this way:
    // - The "once per visit" rule creates pacing and prevents players from
    //   spamming the same room forever without moving through the world.
    handleLookCommand() {
        const world = gameState.getCurrentWorld();
        const location = world[gameState.currentLocation];
        if (!location) {
            this.addMessage('Error: Current location not found in world.');
            return false;
        }

        if (gameState.hasLookedAround(gameState.currentLocation, world)) {
            this.addMessage('You have already looked around here. Move to another location before searching again.');
            return false;
        }

        gameState.markLocationLooked(gameState.currentLocation, world);
        this.addMessage(`You are at: ${location.name}`);
        this.addMessage(this.getDetailedLocationDescription(location));
        
        if (location.items && location.items.length > 0) {
            this.addMessage(`You see: ${location.items.join(', ')}`);
            gameState.updateLootStreak(true);
        } else {
            gameState.updateLootStreak(false);
            // The progressive loot hint teaches the player that empty searches
            // are not wasted; they improve the odds of future discoveries.
            const lootChance = gameState.calculateLootChance();
            this.addMessage(`You search carefully but find nothing. (Next search: ${Math.round(lootChance * 100)}% chance)`);
        }
        
            if (location.campfire) {
                this.addMessage('There is a campfire here where you can cook food and craft campfire recipes.');
            }
        
        if (location.locked) {
            const requiredKey = location.requiredKey || "magic key";
            const hasKey = gameState.inventory.includes(requiredKey);
            this.addMessage(`This area is locked. ${hasKey ? `You have the ${requiredKey} to unlock it!` : `You need a ${requiredKey} to unlock it.`}`);
        }

        this.describeLocationInteractions(location);
        
        const exitDirections = Object.keys(location.exits);
        if (exitDirections.length > 0) {
            this.addMessage(`Exits: ${exitDirections.join(', ')}`);
        } else {
            this.addMessage('No visible exits.');
        }
        
        this.checkForEncounter();
        if (uiController) {
            uiController.updateGameDisplay();
        }
        return true;
    }
    
    // Moves the player to an adjacent location if the route is valid.
    // Called after command parsing resolves a movement direction.
    // Inputs:
    // - `command`: A normalized movement command such as `go north`.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Movement is where multiple systems meet: map discovery, locked areas,
    //   score gain, arrival text, and encounters all need to stay in sync.
    handleGoCommand(command) {
        const direction = command.substring(3);
        const world = gameState.getCurrentWorld();
        const location = world[gameState.currentLocation];
        
        if (!location) {
            this.addMessage('Error: Current location not found.');
            return;
        }
        
        if (location.exits[direction]) {
            const targetLocationId = location.exits[direction];
            const targetLocation = world[targetLocationId];
            
            if (!targetLocation) {
                this.addMessage('Error: Target location not found.');
                return;
            }
            
            if (targetLocation.locked) {
                // Locked areas slow progression on purpose. They force the
                // player to explore, gather keys, and earn access rather than
                // skipping straight to late-game spaces.
                const requiredKey = targetLocation.requiredKey || "magic key";
                if (gameState.inventory.includes(requiredKey)) {
                    this.addMessage(`You use the ${requiredKey} to unlock the area.`);
                    targetLocation.locked = false;
                    gameState.inventory = gameState.inventory.filter(item => item !== requiredKey);
                    
                    if (gameState.difficulty === "normal") {
                        this.triggerLockedAreaFeedback(targetLocationId);
                    }
                    
                    // If this is a sub-area entrance, generate the sub-area
                    if (targetLocation.subArea && !gameState.subAreas[targetLocation.subArea]) {
                        this.addMessage(`You have unlocked the entrance to ${targetLocation.name}!`);
                        this.addMessage(`Type 'enter' to go inside.`);
                    }
                } else {
                    this.addMessage(`The ${targetLocation.name} is locked. You need a ${requiredKey}.`);
                    return;
                }
            }
            
            const previousLocationId = gameState.currentLocation;
            gameState.clearLocationLookState(previousLocationId, world);
            gameState.lastLocation = previousLocationId;
            gameState.currentLocation = targetLocationId;
            gameState.prepareLocationForVisit(gameState.currentLocation, world);
            
            // Hardcore mode hides information by design, so discovery data only
            // expands as the player survives and physically reaches new rooms.
            if (gameState.difficulty === "hardcore") {
                gameState.updateMapDiscovery(gameState.currentLocation);
            }
            
            if (!gameState.visitedLocations.includes(gameState.currentLocation)) {
                gameState.visitedLocations.push(gameState.currentLocation);
                gameState.score += 10;
                this.showAchievement(`Explorer: Discovered ${world[gameState.currentLocation].name}`);
            }
            
            const newLocation = world[gameState.currentLocation];
            this.addMessage(`You go ${direction}.`);
            this.describeArrival(newLocation);
            
            if (uiController) {
                uiController.updateGameDisplay();
            }
            
            if (mapSystem) {
                mapSystem.centerMapOnLocation(gameState.currentLocation);
                mapSystem.updateMapDisplay();
            }
            
            setTimeout(() => {
                this.checkForEncounter();
            }, 500);
        } else {
            this.addMessage(`You cannot go ${direction} from here.`);
        }
    }
    
    // Picks up an item from the current room.
    // Called when the player types `take <item>` or clicks a room item in hybrid mode.
    // Inputs:
    // - `command`: The full take command string.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Some items intentionally have special-case rewards so important gear
    //   feels meaningful the moment the player acquires it.
    handleTakeCommand(command) {
        const item = command.substring(5);
        const world = gameState.getCurrentWorld();
        const location = world[gameState.currentLocation];
        
        if (!location) {
            this.addMessage('Error: Current location not found.');
            return;
        }
        
        if (location.items && location.items.includes(item)) {
            gameState.inventory.push(item);
            location.items = location.items.filter(i => i !== item);
            this.addMessage(`You take the ${item}.`);
            gameState.score += 5;
            
            if (item === "crystal of power") {
                this.addMessage('The crystal pulses with immense power! Your stats are boosted!');
                gameState.maxHealth = 150;
                gameState.health = 150;
                gameState.attack += 10;
                gameState.defense += 5;
                gameState.score += 50;
                this.showAchievement('Power Unleashed');
            }
            
            if (item === "rusty sword") {
                gameState.attack += 5;
                this.addMessage('The rusty sword feels solid in your hand. Attack +5!');
            }
            
            if (item === "leather armor") {
                gameState.defense += 3;
                this.addMessage('You put on the leather armor. Defense +3!');
            }
            
            if (uiController) {
                uiController.updateGameDisplay();
            }
        } else {
            this.addMessage(`There is no ${item} here to take.`);
        }
    }
    
    // Uses an item outside combat.
    // Called by typed `use` commands or by inventory modal action buttons.
    // Inputs:
    // - `command`: The full use command string.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Exploration item use is kept separate from combat item use because the
    //   turn system, timing, and UI constraints are completely different.
    handleUseCommand(command) {
        const item = command.substring(4);
        
        if (gameState.inventory.includes(item)) {
            const itemData = gameState.items[item];
            
            if (itemData && itemData.type === "consumable" && itemData.effect) {
                if (itemData.effect.health) {
                    gameState.health = Math.min(gameState.health + itemData.effect.health, gameState.maxHealth);
                    this.addMessage(`You use ${itemData.name} and restore ${itemData.effect.health} health.`);
                }
                
                if (itemData.effect.cure) {
                    gameState.statusEffects.player = gameState.statusEffects.player.filter(
                        effect => effect.name !== itemData.effect.cure
                    );
                    this.addMessage(`You use ${itemData.name} and are cured of ${itemData.effect.cure}!`);
                }
                
                gameState.inventory = gameState.inventory.filter(i => i !== item);
                if (uiController) uiController.updateGameDisplay();
            } else if (item === "healing herb") {
                gameState.health = Math.min(gameState.health + 20, gameState.maxHealth);
                gameState.inventory = gameState.inventory.filter(i => i !== item);
                this.addMessage('You use a healing herb and restore 20 health.');
                if (uiController) uiController.updateGameDisplay();
            } else if (item === "health potion") {
                gameState.health = Math.min(gameState.health + 30, gameState.maxHealth);
                gameState.inventory = gameState.inventory.filter(i => i !== item);
                this.addMessage('You drink a health potion and restore 30 health.');
                if (uiController) uiController.updateGameDisplay();
            } else if (item === "small health potion") {
                gameState.health = Math.min(gameState.health + 15, gameState.maxHealth);
                gameState.inventory = gameState.inventory.filter(i => i !== item);
                this.addMessage('You drink a small health potion and restore 15 health.');
                if (uiController) uiController.updateGameDisplay();
            } else if (item === "large health potion") {
                gameState.health = Math.min(gameState.health + 50, gameState.maxHealth);
                gameState.inventory = gameState.inventory.filter(i => i !== item);
                this.addMessage('You drink a large health potion and restore 50 health.');
                if (uiController) uiController.updateGameDisplay();
            } else if (item === "antidote") {
                // Remove poison effect
                gameState.statusEffects.player = gameState.statusEffects.player.filter(
                    effect => effect.name !== "poison"
                );
                gameState.inventory = gameState.inventory.filter(i => i !== item);
                this.addMessage('You use an antidote and are cured of poison!');
                if (uiController) uiController.updateGameDisplay();
            } else {
                this.addMessage(`You use the ${item}, but nothing happens.`);
            }
        } else {
            this.addMessage(`You don't have a ${item} to use.`);
        }
    }

    // Checks whether a command would move the player through the world.
    // Used before allowing input while the map is in inspect-only mode.
    // Inputs:
    // - `command`: A normalized command string.
    // Returns:
    // - `true` if the command is movement-related, otherwise `false`.
    // Why it is designed this way:
    // - Movement can be expressed in several syntaxes, so one helper keeps the
    //   blocking rule easy to maintain.
    isMovementCommand(command) {
        if (command.startsWith('go ')) return true;
        const moves = ['north', 'south', 'east', 'west', 'up', 'down', 'enter', 'exit', 'leave', 'back', 'return'];
        return moves.includes(command);
    }
    
    // Attempts to return to the player's previous location.
    // Called by the `back` or `return` command.
    // Inputs:
    // - None.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Backtracking is helpful, but it still respects real room topology
    //   instead of acting like a teleport button.
    handleBackCommand() {
        if (gameState.lastLocation) {
            const world = gameState.getCurrentWorld();
            const currentLocation = world[gameState.currentLocation];
            for (const direction in currentLocation.exits) {
                if (currentLocation.exits[direction] === gameState.lastLocation) {
                    this.handleGoCommand(`go ${direction}`);
                    return;
                }
            }
            this.addMessage("You can't go back the way you came.");
        } else {
            this.addMessage("You don't remember where you came from.");
        }
    }
    
    // Forwards an equip command into InventorySystem.
    // Called when typed input resolves to `equip <item>`.
    // Inputs:
    // - `command`: The raw equip command.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - `Main` keeps responsibility for parsing commands, while InventorySystem
    //   keeps responsibility for equipment rules.
    handleEquipCommand(command) {
        const itemName = command.substring(6);
        if (window.inventorySystem) {
            window.inventorySystem.equipItem(itemName);
        }
    }
    
    // Forwards an unequip command into InventorySystem.
    // Called when typed input resolves to `unequip <slot>`.
    // Inputs:
    // - `command`: The raw unequip command.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Slot logic should stay in one place so the game cannot accidentally
    //   interpret slot names differently in different systems.
    handleUnequipCommand(command) {
        const slot = command.substring(8);
        if (window.inventorySystem) {
            window.inventorySystem.unequipItem(slot);
        }
    }
    
    // Unlocks the current location if the player has the required key.
    // Called by the `unlock` command at locked entrances.
    // Inputs:
    // - `command`: The raw unlock command. It is currently unused but kept for
    //   consistency with the rest of the command handlers.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Explicit unlocking makes progression feel intentional and gives space
    //   for feedback before entering the newly opened area.
    handleUnlockCommand(command) {
        const world = gameState.getCurrentWorld();
        const location = world[gameState.currentLocation];
        
        if (!location) return;
        
        if (location.locked) {
            const requiredKey = location.requiredKey || "magic key";
            if (gameState.inventory.includes(requiredKey)) {
                this.addMessage(`You use the ${requiredKey} to unlock the area.`);
                location.locked = false;
                gameState.inventory = gameState.inventory.filter(item => item !== requiredKey);
                
                if (gameState.difficulty === "normal") {
                    this.triggerLockedAreaFeedback(gameState.currentLocation);
                }
                
                if (location.subArea) {
                    this.addMessage(`You have unlocked the entrance to ${location.name}!`);
                    this.addMessage(`Type 'enter' to go inside.`);
                } else {
                    this.addMessage(`The ${location.name} is now unlocked!`);
                }
                
                if (uiController) {
                    uiController.updateGameDisplay();
                }
                
                if (mapSystem) {
                    mapSystem.updateMapDisplay();
                }
            } else {
                this.addMessage(`You need a ${requiredKey} to unlock this area.`);
            }
        } else {
            this.addMessage('This area is not locked.');
        }
    }
    
    // Enters a sub-area connected to the current overworld location.
    // Called by the `enter` command when the player is standing at a valid entrance.
    // Inputs:
    // - None.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Sub-areas exist to slow progression and add authored interior pacing,
    //   so they are entered deliberately rather than automatically on contact.
    handleEnterCommand() {
        const world = gameState.getCurrentWorld();
        const location = world[gameState.currentLocation];
        
        if (!location) return;
        
        if (location.subArea && !location.locked) {
            gameState.clearLocationLookState(gameState.currentLocation, world);
            // Interiors are generated lazily so the world can stay lightweight
            // until the player actually chooses to explore them.
            if (!gameState.subAreas[location.subArea] && mapSystem) {
                const success = mapSystem.generateSubArea(location.subArea, gameState.currentLocation);
                if (!success) {
                    this.addMessage('Unable to enter the area right now.');
                    return;
                }
            }
            
            // Enter the sub-area
            if (gameState.enterSubArea(location.subArea, gameState.currentLocation)) {
                this.addMessage(`You enter ${location.name}...`);
                gameState.prepareLocationForVisit(gameState.currentLocation);
                this.describeArrival(gameState.getLocation());
                
                // Update UI
                if (uiController) {
                    uiController.updateGameDisplay();
                }
                
                if (mapSystem) {
                    mapSystem.updateMapDisplay();
                    mapSystem.updateMapTitle();
                }
            } else {
                this.addMessage('You cannot enter this area.');
            }
        } else if (location.locked) {
            const requiredKey = location.requiredKey || "magic key";
            this.addMessage(`This area is locked. You need a ${requiredKey} to enter.`);
        } else {
            this.addMessage('There is nothing to enter here.');
        }
    }
    
    // Leaves the current sub-area and restores the parent world context.
    // Called by the `exit` command.
    // Inputs:
    // - None.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Entering and leaving interiors is explicit so players always understand
    //   whether they are navigating the overworld or an internal maze.
    handleExitCommand() {
        if (gameState.currentSubArea) {
            if (gameState.exitSubArea()) {
                this.addMessage(`You exit back to the main world.`);
                gameState.prepareLocationForVisit(gameState.currentLocation);
                this.describeArrival(gameState.getLocation());
                
                // Update UI
                if (uiController) {
                    uiController.updateGameDisplay();
                }
                
                if (mapSystem) {
                    mapSystem.updateMapDisplay();
                    mapSystem.updateMapTitle();
                }
            } else {
                this.addMessage('You cannot exit right now.');
            }
        } else {
            this.addMessage('You are not in a sub-area to exit from.');
        }
    }
    
    // Prints the exploration help text.
    // Called by `help` and also useful after new players first enter the game.
    // Inputs:
    // - None.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Text adventures are command-heavy, so keeping help readable reduces the
    //   learning curve without simplifying the systems themselves.
    showHelp() {
        this.addMessage('Available Commands:');
        this.addMessage('-------------------');
        this.addMessage('look, l - Look around in detail (once per visit)');
        this.addMessage('go [direction] - Move in a direction (north, south, east, west)');
        this.addMessage('inventory, i - Check your inventory');
        this.addMessage('take [item] - Pick up an item');
        this.addMessage('use [item] - Use an item');
        this.addMessage('craft - Open crafting panel');
        this.addMessage('shop - Open a shop when standing in one');
        this.addMessage('play / minigame - Open local activities and events');
        this.addMessage('equip [item] - Equip an item');
        this.addMessage('unequip [slot] - Unequip an item from a slot');
        this.addMessage('map - Check the map');
        this.addMessage('score - Check your score');
        this.addMessage('logout - Return to login screen');
        this.addMessage('help combat - Show combat commands');
        this.addMessage('unlock - Unlock a locked area (if you have the key)');
        this.addMessage('enter - Enter a sub-area (cave/dungeon)');
        this.addMessage('exit - Exit a sub-area and return to main world');
    }
    
    // ENCOUNTERS AND OUTPUT
    // -----------------------------------
    // These methods manage the transition from peaceful exploration into
    // combat, and they also handle shared output such as messages and history.

    // Checks whether an encounter should begin at the current location.
    // Called after movement and some room interactions.
    // Inputs:
    // - None.
    // Returns:
    // - `true` if combat was started, otherwise `false`.
    // Why it is designed this way:
    // - The system balances authored room exploration with randomness. Enemies
    //   are weighted by rarity so the world feels varied without becoming chaos.
    checkForEncounter() {
        const world = gameState.getCurrentWorld();
        const location = world[gameState.currentLocation];
        if (!location || gameState.inCombat || gameState.minigameActive) return false;
        
        if (gameState.activeEnemies[gameState.currentLocation]) {
            // Fleeing does not erase danger. The enemy stays in the room so the
            // world feels persistent and escape has a meaningful tradeoff.
            const enemy = gameState.activeEnemies[gameState.currentLocation];
            this.addMessage(`The ${enemy.name} is still here!`);
            if (combatSystem) {
                combatSystem.startCombat(enemy.type, enemy.health);
            }
            return true;
        }
        
        if (gameState.shouldEncounterEnemy()) {
            const enemyTypes = gameState.getEnemiesForLocation(location);
            
            if (enemyTypes.length === 0) return false;
            
            const weightedEnemies = [];
            enemyTypes.forEach(type => {
                const enemy = gameState.enemies[type];
                let weight = 1;
                switch (enemy.rarity) {
                    case "common": weight = 5; break;
                    case "uncommon": weight = 3; break;
                    case "rare": weight = 1; break;
                    case "legendary": weight = 0.5; break;
                }
                for (let i = 0; i < weight; i++) {
                    weightedEnemies.push(type);
                }
            });
            
            if (weightedEnemies.length > 0) {
                const enemyType = weightedEnemies[Math.floor(Math.random() * weightedEnemies.length)];
                
                if (combatSystem) {
                    combatSystem.startCombat(enemyType);
                }
                return true;
            }
        }
        
        return false;
    }
    
    // Sends a narrative message to the main output panel.
    // Used by almost every exploration action.
    // Inputs:
    // - `text`: The text to display to the player.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Output routing is centralized so other systems do not need to care
    //   whether UIController is present or whether a fallback path is needed.
    addMessage(text) {
        if (uiController && typeof uiController.addMessage === 'function') {
            uiController.addMessage(text);
        } else {
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
    
    // Appends a command to the visible command history.
    // Called after non-empty commands are accepted for processing.
    // Inputs:
    // - `command`: The normalized command string.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Keeping history visible helps players learn the command language and
    //   review what led to the current game state.
    addToHistory(command) {
        this.commandHistory.push(command);
        const historyContent = document.getElementById('history-content');
        if (historyContent) {
            const message = document.createElement('div');
            message.classList.add('message');
            message.textContent = `> ${command}`;
            historyContent.appendChild(message);
            historyContent.scrollTop = historyContent.scrollHeight;
        }
    }
    
    // Shows a temporary achievement toast.
    // Called when the player discovers a new area or triggers a milestone.
    // Inputs:
    // - `text`: The achievement text to show.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Achievements should feel rewarding, but they should not interrupt the
    //   reading flow of a text-heavy game.
    showAchievement(text) {
        const achievement = document.getElementById('achievement');
        const achievementText = document.getElementById('achievement-text');
        
        if (achievement && achievementText) {
            achievementText.textContent = text; 
            achievement.classList.add('show');
            
            setTimeout(() => {
                achievement.classList.remove('show');
            }, 3000);
        }
    }
    
    // Briefly highlights a newly unlocked map node.
    // Called after the player opens a gated area in normal mode.
    // Inputs:
    // - `locationId`: The location whose map cell should animate.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Visual confirmation helps the player connect the key they used with the
    //   change they just caused in the world.
    triggerLockedAreaFeedback(locationId) {
        const mapCell = document.querySelector(`.map-cell[data-location="${locationId}"]`);
        if (mapCell) {
            mapCell.classList.add('unlocked-feedback');
            setTimeout(() => {
                mapCell.classList.remove('unlocked-feedback');
            }, 2000);
        }
    }
}

const main = new Main();
window.gameState = gameState;
window.mapSystem = mapSystem;
window.combatSystem = combatSystem;
window.inventorySystem = inventorySystem;
window.uiController = uiController;
window.main = main;

// The UIController now handles all initialization
console.log('Main.js loaded, ready for game initialization via UIController');
