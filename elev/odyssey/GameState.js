// GameState.js - Fixed duplicate welcome messages, invalidated old saves, enhanced difficulty/locked area systems
/*
========================================
FILE OVERVIEW
----------------------------------------
Purpose:
- Stores the persistent game state, core data tables, and save/load behavior.

Key Systems:
- Player stats, inventory, equipment, and progression flags
- World, sub-area, and map discovery state
- Enemy, item, and recipe definitions
- Account management, saves, and utility helpers

Flow:
- Most runtime systems read from and write to this object
- Save/load serializes the current state for the active account
- Helper methods centralize common rules such as loot, visibility, and status effects

Design Notes:
- This file is the source of truth. Other systems can render it, patch it, or
  argue with it, but this is still where the real state lives.
========================================
*/
class GameState {
    // Build the root state object, load account data, and populate static game data.
    constructor() {
        this.resetState();
        
        this.accounts = this.loadAccounts();
        this.currentAccount = null;
        this.isLoggedIn = false;
        
        // Old saves sometimes know just enough to be dangerous.
        // If their structure no longer matches the live systems, it is safer to
        // invalidate them than pretend everything will be fine.
        this.invalidateOldSaves();
        
        this.translations = {
            en: {
                "gameTitle": "ENHANCED ODYSSEY BETA",
                "welcomePlayer": "Welcome, {username}!",
                "selectDifficulty": "Select your difficulty",
                "selectMode": "Select your game mode",
                "beginAdventure": "Begin Your Adventure",
                "backToDifficulty": "Back to Difficulty Selection",
                "backToMode": "Back to Mode Selection",
                "normal": "Normal",
                "hardcore": "Hardcore",
                "typeOnly": "Type Only Mode",
                "typeClick": "Type + Click Mode",
                "worldMap": "World Map",
                "playerStatus": "Player Status",
                "inventory": "Inventory",
                "health": "Health",
                "attack": "Attack",
                "defense": "Defense",
                "score": "Score",
                "gold": "Gold",
                "lookAround": "Look Around",
                "goNorth": "Go North",
                "goEast": "Go East", 
                "goSouth": "Go South",
                "goWest": "Go West",
                "history": "History",
                "crafting": "Crafting",
                "armory": "Armory",
                "settings": "Settings",
                "battleEngaged": "BATTLE ENGAGED!",
                "player": "Player",
                "enemy": "Enemy",
                "attack": "Attack",
                "defend": "Defend",
                "special": "Special",
                "useItem": "Use Item",
                "flee": "Flee",
                "selectItem": "Select Item to Use",
                "cancel": "Cancel",
                "welcome": "Welcome to Enhanced Odyssey BETA! Your journey begins now...",
                "helpPrompt": "Type 'help' for a list of commands or use quick actions below.",
                "noUnderstand": "I don't understand",
                "typeHelp": "Type 'help' for available commands.",
                "cannotGo": "You cannot go",
                "fromHere": "from here.",
                "noItem": "There is no",
                "hereToTake": "here to take.",
                "dontHave": "You don't have a",
                "toUse": "to use.",
                "inventoryEmpty": "Your inventory is empty.",
                "noRecipes": "You haven't discovered any recipes yet.",
                "noCraftingCategory": "No recipes available in this category.",
                "mustBeAtCampfire": "You must be at a campfire to craft items.",
                "noShopHere": "There's no shop here.",
                "noMinigameHere": "There's no minigame to play here.",
                "successfulFlee": "You successfully flee from combat!",
                "failedFlee": "You try to flee but the enemy blocks your escape!",
                "defeated": "You have been defeated...",
                "gameOver": "GAME OVER - You have died in Hardcore Mode.",
                "refreshToRestart": "Refresh the page to start a new game.",
                "finalScore": "FINAL SCORE:",
                "thanksForPlaying": "Thanks for playing Enhanced Odyssey BETA!",
                "gameSettings": "Game Settings",
                "autoSave": "Auto-save progress",
                "combatAnimations": "Combat animations",
                "achievementUnlocked": "Achievement Unlocked!",
                "beginnerAdventurer": "Beginner Adventurer",
                "explorer": "Explorer",
                "powerUnleashed": "Power Unleashed",
                "recipeLearned": "Recipe Learned",
                "dragonSlayer": "Dragon Slayer",
                "arachnophobiaConquered": "Arachnophobia Conquered", 
                "darkLordVanquished": "Dark Lord Vanquished",
                "legendaryHero": "Legendary Hero"
            }
        };
        
        this.language = "en";
        
        // Bad word filter
        this.badWords = [
            'fuck', 'shit', 'ass', 'bitch', 'cunt', 'dick', 'pussy', 'cock',
            'nigga', 'nigger', 'fag', 'faggot', 'retard', 'whore', 'slut',
            'damn', 'hell', 'bastard', 'motherfucker', 'shitty', 'asshole'
        ];
        
        // Initialize game data
        this.initializeGameData();
    }
    
    // Reset all runtime gameplay fields to a clean new-game baseline.
    resetState() {
        this.currentLocation = "start";
        this.currentMap = "world"; // Tracks which map we're on: "world" or sub-area IDs
        this.health = 100;
        this.maxHealth = 100;
        this.attack = 10;
        this.defense = 5;
        this.score = 0;
        this.inventory = [];
        this.visitedLocations = []; // Start empty for Hardcore, will add "start" when visited
        this.specialCharge = 0;
        this.inCombat = false;
        this.currentEnemy = null;
        this.gameCompleted = false;
        this.mapExpanded = false;
        this.mapOffset = { x: 0, y: 0 };
        this.mapScale = 1;
        this.world = {};
        this.lastLocation = null;
        this.gameMode = "normal";
        this.inputMode = "both";
        this.difficulty = "normal";
        this.gold = 50;
        this.craftingRecipes = {};
        this.minigameActive = false;
        this.activeEnemies = {};
        this.defeatedEnemies = {};
        this.discoveredRecipes = [];
        this.username = "Adventurer";
        this.autoSave = true;
        this.combatAnimations = true;
        this.hasShownWelcome = false;
        
        // Track locked locations the player has at least discovered.
        // This matters mostly for map readability: a locked place should still
        // be remembered even if it cannot be entered yet.
        this.seenLockedLocations = new Set();
        
        // Sub-areas tracking
        this.subAreas = {}; // Stores sub-area maps
        this.currentSubArea = null; // Current sub-area ID if in one
        
        // Status effects
        this.statusEffects = {
            player: [],
            enemy: []
        };
        
        // Encounter tracking
        this.encountersSinceLastCombat = 0;
        this.lastCombatLocation = null;
        
        // Combat cooldown
        this.combatCooldown = false;
        
        this.baseStats = {
            health: 100,
            attack: 10,
            defense: 5
        };
        
        this.equippedItems = {
            head: null,
            chest: null,
            legs: null,
            feet: null,
            leftHand: null,
            rightHand: null,
            twoHanded: null
        };
        
        // Progressive loot system
        this.lootStats = {
            baseChance: 0.2,
            streakBonus: 0.05,
            currentStreak: 0,
            maxBonus: 0.5
        };
        
        // Map discovery tracking for Hardcore mode - START EMPTY
        this.mapDiscovery = {
            discoveredCells: new Set(),
            visiblePaths: new Set()
        };

        // Enemy journey tracking
        this.enemyJournal = {
            encountered: new Set(),
            defeated: new Set()
        };

        this.areaState = {
            currentWorldArea: "start",
            currentInternalArea: null,
            progressionUnlocked: {},
            portalStack: [],
            nestedPortalDepth: 0
        };
        this.shopState = {
            open: false,
            activeShopId: null
        };
        this.cameraState = {
            clampEnabled: true
        };
        this.combatState = {
            playerTurn: true,
            turnLock: false,
            indicator: "Player Turn"
        };
    }
    
    // Old save formats are cleared so newer world/map structures do not break at runtime.
    invalidateOldSaves() {
        const accountsData = localStorage.getItem('zorkAccounts');
        if (accountsData) {
            try {
                const accounts = JSON.parse(accountsData);
                let needsUpdate = false;
                
                // Check if any account has old save format
                Object.keys(accounts).forEach(username => {
                    const account = accounts[username];
                    if (account.gameState) {
                        // Check for old format without currentMap or mapDiscovery
                        if (!account.gameState.currentMap || !account.gameState.mapDiscovery) {
                            console.log(`Invalidating old save for ${username}`);
                            account.gameState = null; // Clear old save
                            needsUpdate = true;
                        }
                    }
                });
                
                if (needsUpdate) {
                    localStorage.setItem('zorkAccounts', JSON.stringify(accounts));
                    console.log('Invalidated old saves to prevent corruption');
                }
            } catch (e) {
                console.error('Error invalidating old saves:', e);
            }
        }
    }
    
    // Populate all large data catalogs such as enemies, items, recipes, and status effects.
    initializeGameData() {
        // Initialize 50+ unique enemies with status effects
        this.enemies = {
            // Tier 1: Basic Enemies
            "goblin": {
                name: "Goblin Scout",
                health: 25,
                maxHealth: 25,
                attack: 6,
                defense: 2,
                icon: "👹",
                description: "A small, green-skinned creature wielding a crude club.",
                loot: ["goblin ear", "small health potion"],
                xp: 10,
                biome: ["forest", "cave"],
                rarity: "common",
                entranceEffect: "normal",
                abilities: []
            },
            "giant_rat": {
                name: "Giant Rat",
                health: 20,
                maxHealth: 20,
                attack: 5,
                defense: 1,
                icon: "🐀",
                description: "A large rodent with sharp teeth and matted fur.",
                loot: ["rat tail", "cheese"],
                xp: 8,
                biome: ["cave", "sewer"],
                rarity: "common",
                entranceEffect: "normal",
                abilities: []
            },
            "skeleton": {
                name: "Skeleton Warrior",
                health: 35,
                maxHealth: 35,
                attack: 8,
                defense: 3,
                icon: "💀",
                description: "An animated skeleton armed with a rusty sword.",
                loot: ["bone shard", "rusted sword"],
                xp: 15,
                biome: ["ruins", "crypt"],
                rarity: "common",
                entranceEffect: "normal",
                abilities: []
            },
            "bat_swarm": {
                name: "Bat Swarm",
                health: 15,
                maxHealth: 15,
                attack: 4,
                defense: 0,
                icon: "🦇",
                description: "A swarm of frenzied bats.",
                loot: ["bat wing", "guano"],
                xp: 6,
                biome: ["cave"],
                rarity: "common",
                entranceEffect: "swarm",
                abilities: []
            },
            "slime": {
                name: "Green Slime",
                health: 30,
                maxHealth: 30,
                attack: 7,
                defense: 1,
                icon: "🟢",
                description: "A pulsating mass of acidic goo.",
                loot: ["slime core", "acidic goo"],
                xp: 12,
                biome: ["cave", "swamp"],
                rarity: "common",
                entranceEffect: "normal",
                abilities: ["poison"]
            },
            
            // Tier 2: Intermediate Enemies
            "orc_warrior": {
                name: "Orc Warrior",
                health: 50,
                maxHealth: 50,
                attack: 12,
                defense: 5,
                icon: "👹",
                description: "A muscular orc brandishing a heavy axe.",
                loot: ["orc tusk", "orcish axe"],
                xp: 25,
                biome: ["forest", "mountains"],
                rarity: "uncommon",
                entranceEffect: "normal",
                abilities: ["rage"]
            },
            "cave_troll": {
                name: "Cave Troll",
                health: 75,
                maxHealth: 75,
                attack: 15,
                defense: 8,
                icon: "👹",
                description: "A massive troll with rocky skin.",
                loot: ["troll hide", "large health potion"],
                xp: 35,
                biome: ["cave", "mountains"],
                rarity: "uncommon",
                entranceEffect: "normal",
                abilities: ["stun"]
            },
            "dark_elf": {
                name: "Dark Elf Archer",
                health: 40,
                maxHealth: 40,
                attack: 14,
                defense: 3,
                icon: "🧝🏿",
                description: "A nimble elf with poisoned arrows.",
                loot: ["elf ear", "poisoned arrow"],
                xp: 30,
                biome: ["forest", "ruins"],
                rarity: "uncommon",
                entranceEffect: "normal",
                abilities: ["poison", "dodge"]
            },
            "stone_golem": {
                name: "Stone Golem",
                health: 90,
                maxHealth: 90,
                attack: 18,
                defense: 12,
                icon: "🗿",
                description: "A construct of living stone.",
                loot: ["stone core", "adamant ore"],
                xp: 40,
                biome: ["ruins", "dungeon"],
                rarity: "uncommon",
                entranceEffect: "normal",
                abilities: ["crush"]
            },
            "fire_sprite": {
                name: "Fire Sprite",
                health: 35,
                maxHealth: 35,
                attack: 16,
                defense: 2,
                icon: "🔥",
                description: "A being of pure flame.",
                loot: ["fire essence", "ember"],
                xp: 28,
                biome: ["volcano", "desert"],
                rarity: "uncommon",
                entranceEffect: "normal",
                abilities: ["burn"]
            },
            
            // Tier 3: Advanced Enemies
            "lich": {
                name: "Lich",
                health: 120,
                maxHealth: 120,
                attack: 25,
                defense: 10,
                icon: "🧙🏿",
                description: "An undead wizard of immense power.",
                loot: ["phylactery shard", "necrotic tome"],
                xp: 80,
                biome: ["crypt", "dungeon"],
                rarity: "rare",
                entranceEffect: "boss",
                abilities: ["curse", "summon", "life_drain"],
                bossIntro: true,
                bossTitle: "LICH KING RISES",
                bossDescription: "Death magic fills the air!"
            },
            "hydra": {
                name: "Hydra",
                health: 150,
                maxHealth: 150,
                attack: 22,
                defense: 15,
                icon: "🐍",
                description: "A multi-headed serpent that regenerates.",
                loot: ["hydra head", "regeneration gland"],
                xp: 90,
                biome: ["swamp", "lake"],
                rarity: "rare",
                entranceEffect: "boss",
                abilities: ["regenerate", "multi_attack"],
                bossIntro: true,
                bossTitle: "HYDRA AWAKENS",
                bossDescription: "Multiple heads strike at once!"
            },
            "beholder": {
                name: "Beholder",
                health: 130,
                maxHealth: 130,
                attack: 28,
                defense: 8,
                icon: "👁️",
                description: "A floating orb with multiple magical eyes.",
                loot: ["eye stalk", "arcane orb"],
                xp: 85,
                biome: ["dungeon", "void"],
                rarity: "rare",
                entranceEffect: "boss",
                abilities: ["paralyze", "disintegrate", "charm"],
                bossIntro: true,
                bossTitle: "BEHOLDER GAZES",
                bossDescription: "Its eyes emit deadly rays!"
            },
            "dragon_whelp": {
                name: "Dragon Whelp",
                health: 100,
                maxHealth: 100,
                attack: 30,
                defense: 12,
                icon: "🐉",
                description: "A young but dangerous dragon.",
                loot: ["dragon scale", "fiery breath gland"],
                xp: 75,
                biome: ["mountains", "volcano"],
                rarity: "rare",
                entranceEffect: "normal",
                abilities: ["fire_breath", "fear"]
            },
            "spider_queen": {
                name: "Spider Queen",
                health: 110,
                maxHealth: 110,
                attack: 20,
                defense: 10,
                icon: "🕷️",
                description: "A massive arachnid that spins webs of death.",
                loot: ["spider silk", "venom sac", "queen's fang"],
                xp: 70,
                biome: ["cave", "forest"],
                rarity: "rare",
                entranceEffect: "boss",
                abilities: ["poison", "web", "summon_spiders"],
                bossIntro: true,
                bossTitle: "SPIDER QUEEN EMERGES",
                bossDescription: "Venom drips from her fangs!"
            },
            
            // Tier 4: Legendary Enemies
            "ancient_dragon": {
                name: "Ancient Dragon",
                health: 250,
                maxHealth: 250,
                attack: 35,
                defense: 20,
                icon: "🐉",
                description: "A legendary beast from the dawn of time.",
                loot: ["dragon heart", "ancient scale", "dragon's hoard"],
                xp: 150,
                biome: ["volcano", "sky"],
                rarity: "legendary",
                entranceEffect: "boss",
                abilities: ["fire_storm", "earthquake", "fear_aura"],
                bossIntro: true,
                bossTitle: "ANCIENT DRAGON AWAKENS",
                bossDescription: "A being of primordial power!"
            },
            "titan": {
                name: "Stone Titan",
                health: 300,
                maxHealth: 300,
                attack: 40,
                defense: 25,
                icon: "🗿",
                description: "A mountain given life and fury.",
                loot: ["titan's heart", "mountain core", "adamantium"],
                xp: 180,
                biome: ["mountains", "ruins"],
                rarity: "legendary",
                entranceEffect: "boss",
                abilities: ["quake", "crush", "stone_skin"],
                bossIntro: true,
                bossTitle: "TITAN STIRS",
                bossDescription: "The very earth shakes!"
            },
            "void_entity": {
                name: "Void Entity",
                health: 200,
                maxHealth: 200,
                attack: 45,
                defense: 15,
                icon: "🌌",
                description: "A being from beyond reality.",
                loot: ["void essence", "reality shard", "cosmic dust"],
                xp: 200,
                biome: ["void", "dungeon"],
                rarity: "legendary",
                entranceEffect: "boss",
                abilities: ["void_blast", "teleport", "reality_warp"],
                bossIntro: true,
                bossTitle: "VOID ENTITY MANIFESTS",
                bossDescription: "Reality bends around it!"
            },
            "phoenix": {
                name: "Phoenix",
                health: 180,
                maxHealth: 180,
                attack: 38,
                defense: 18,
                icon: "🔥",
                description: "A mythical bird of fire and rebirth.",
                loot: ["phoenix feather", "eternal flame", "ash of rebirth"],
                xp: 160,
                biome: ["volcano", "sky"],
                rarity: "legendary",
                entranceEffect: "boss",
                abilities: ["rebirth", "fire_storm", "healing_flame"],
                bossIntro: true,
                bossTitle: "PHOENIX ASCENDS",
                bossDescription: "Flames of eternity ignite!"
            }
        };
        
        // Add 30 more enemy types (simplified for brevity)
        const additionalEnemies = [
            {name: "Zombie", icon: "🧟", rarity: "common"},
            {name: "Ghost", icon: "👻", rarity: "common"},
            {name: "Wolf", icon: "🐺", rarity: "common"},
            {name: "Bear", icon: "🐻", rarity: "uncommon"},
            {name: "Giant", icon: "👹", rarity: "rare"},
            {name: "Wraith", icon: "👻", rarity: "uncommon"},
            {name: "Minotaur", icon: "🐮", rarity: "rare"},
            {name: "Basilisk", icon: "🐍", rarity: "rare"},
            {name: "Griffin", icon: "🦅", rarity: "rare"},
            {name: "Manticore", icon: "🦁", rarity: "rare"},
            {name: "Elemental", icon: "💧", rarity: "uncommon"},
            {name: "Witch", icon: "🧙", rarity: "uncommon"},
            {name: "Vampire", icon: "🧛", rarity: "rare"},
            {name: "Werewolf", icon: "🐺", rarity: "uncommon"},
            {name: "Gorgon", icon: "🐍", rarity: "rare"},
            {name: "Kraken", icon: "🐙", rarity: "legendary"},
            {name: "Djinn", icon: "🪔", rarity: "rare"},
            {name: "Banshee", icon: "👻", rarity: "uncommon"},
            {name: "Chimera", icon: "🦁", rarity: "rare"},
            {name: "Siren", icon: "🧜", rarity: "uncommon"},
            {name: "Cyclops", icon: "👁️", rarity: "rare"},
            {name: "Wendigo", icon: "👹", rarity: "rare"},
            {name: "Golem", icon: "🗿", rarity: "uncommon"},
            {name: "Specter", icon: "👻", rarity: "uncommon"},
            {name: "Harpy", icon: "🦅", rarity: "uncommon"},
            {name: "Troll", icon: "👹", rarity: "common"},
            {name: "Imp", icon: "👹", rarity: "common"},
            {name: "Succubus", icon: "👿", rarity: "rare"},
            {name: "Barghest", icon: "🐺", rarity: "uncommon"},
            {name: "Kelpie", icon: "🐎", rarity: "uncommon"}
        ];
        
        // Generate additional enemies with varied stats
        additionalEnemies.forEach((enemy, index) => {
            const key = enemy.name.toLowerCase().replace(/\s+/g, '_');
            const baseHealth = enemy.rarity === "common" ? 20 : 
                             enemy.rarity === "uncommon" ? 40 : 
                             enemy.rarity === "rare" ? 80 : 120;
            
            this.enemies[key] = {
                name: enemy.name,
                health: baseHealth,
                maxHealth: baseHealth,
                attack: Math.floor(baseHealth / 4),
                defense: Math.floor(baseHealth / 8),
                icon: enemy.icon,
                description: `A dangerous ${enemy.name.toLowerCase()}.`,
                loot: [],
                xp: baseHealth / 2,
                biome: ["forest", "cave", "mountains", "ruins"],
                rarity: enemy.rarity,
                entranceEffect: "normal",
                abilities: []
            };
        });
        
        // Enemy drop pools by category (logical materials)
        this.enemyDropPools = {
            beast: {
                common: ["raw meat", "hide", "fang", "bone shard", "feather"],
                uncommon: ["thick hide", "claw"],
                rare: ["pristine hide"]
            },
            humanoid: {
                common: ["cloth", "scrap metal", "crude weapon parts"],
                uncommon: ["leather strip", "iron scrap"],
                rare: ["iron ingot"]
            },
            undead: {
                common: ["bone shard", "rotting flesh", "ancient dust"],
                uncommon: ["ectoplasm"],
                rare: ["cursed bone"]
            },
            spirit: {
                common: ["ectoplasm"],
                uncommon: ["wisp essence"],
                rare: ["spectral core"]
            },
            arachnid: {
                common: ["chitin", "venom sac", "silk"],
                uncommon: ["hardened chitin"],
                rare: ["venom gland"]
            },
            dragon: {
                common: ["dragon scale", "dragon claw"],
                uncommon: ["fire gland"],
                rare: ["ancient scale"]
            },
            elemental: {
                common: ["elemental shard", "ember"],
                uncommon: ["elemental core"],
                rare: ["pure essence"]
            },
            construct: {
                common: ["stone fragment", "metal shard"],
                uncommon: ["golem core"],
                rare: ["adamant shard"]
            },
            aquatic: {
                common: ["scale", "seaweed", "ink sac"],
                uncommon: ["tough hide"],
                rare: ["abyssal pearl"]
            },
            demon: {
                common: ["demonic ash", "dark ichor"],
                uncommon: ["infernal shard"],
                rare: ["hellstone"]
            }
        };
        
        this.items = {
            "rusty sword": {
                name: "Rusty Sword",
                type: "weapon",
                description: "An old, rusty sword that still has some fight in it.",
                value: 10,
                rarity: "common",
                stats: { attack: 5 },
                icon: "🗡️",
                slot: "oneHanded"
            },
            "health potion": {
                name: "Health Potion",
                type: "consumable",
                description: "Restores 30 health points.",
                value: 20,
                rarity: "common",
                effect: { health: 30 },
                icon: "🧪",
                stackable: true
            },
            "small health potion": {
                name: "Small Health Potion",
                type: "consumable",
                description: "Restores 15 health points.",
                value: 10,
                rarity: "common",
                effect: { health: 15 },
                icon: "🧪",
                stackable: true
            },
            "large health potion": {
                name: "Large Health Potion",
                type: "consumable",
                description: "Restores 50 health points.",
                value: 35,
                rarity: "uncommon",
                effect: { health: 50 },
                icon: "🧪",
                stackable: true
            },
            "antidote": {
                name: "Antidote",
                type: "consumable",
                description: "Cures poison effects.",
                value: 25,
                rarity: "uncommon",
                effect: { cure: "poison" },
                icon: "💊",
                stackable: true
            },
            "bandage": {
                name: "Bandage",
                type: "consumable",
                description: "A simple bandage that restores 10 health.",
                value: 8,
                rarity: "common",
                effect: { health: 10 },
                icon: "🩹",
                stackable: true
            },
            "feather": {
                name: "Feather",
                type: "material",
                description: "A light feather from a bird.",
                value: 3,
                rarity: "common",
                icon: "🪶",
                stackable: true
            },
            "basic salve": {
                name: "Basic Salve",
                type: "consumable",
                description: "A basic herbal salve that restores 18 health.",
                value: 12,
                rarity: "common",
                effect: { health: 18 },
                icon: "🧴",
                stackable: true
            },
            "cooked meat": {
                name: "Cooked Meat",
                type: "consumable",
                description: "Hearty cooked meat that restores 25 health.",
                value: 15,
                rarity: "common",
                effect: { health: 25 },
                icon: "🍖",
                stackable: true
            },
            "healing herb": {
                name: "Healing Herb",
                type: "consumable",
                description: "A medicinal herb that restores 20 health.",
                value: 6,
                rarity: "common",
                effect: { health: 20 },
                icon: "🌿",
                stackable: true
            },
            "raw meat": {
                name: "Raw Meat",
                type: "material",
                description: "Uncooked meat. Can be cooked at a campfire.",
                value: 5,
                rarity: "common",
                icon: "🍖",
                stackable: true
            },
            "hide": {
                name: "Hide",
                type: "material",
                description: "A tough animal hide.",
                value: 6,
                rarity: "common",
                icon: "🧥",
                stackable: true
            },
            "thick hide": {
                name: "Thick Hide",
                type: "material",
                description: "A thick, durable hide.",
                value: 10,
                rarity: "uncommon",
                icon: "🧥",
                stackable: true
            },
            "pristine hide": {
                name: "Pristine Hide",
                type: "material",
                description: "A flawless hide suitable for fine crafting.",
                value: 20,
                rarity: "rare",
                icon: "🧥",
                stackable: true
            },
            "tough hide": {
                name: "Tough Hide",
                type: "material",
                description: "A hide cured by the sea air.",
                value: 12,
                rarity: "uncommon",
                icon: "🧥",
                stackable: true
            },
            "fang": {
                name: "Fang",
                type: "material",
                description: "A sharp fang from a beast.",
                value: 6,
                rarity: "common",
                icon: "🦷",
                stackable: true
            },
            "claw": {
                name: "Claw",
                type: "material",
                description: "A jagged claw.",
                value: 6,
                rarity: "common",
                icon: "🐾",
                stackable: true
            },
            "bone shard": {
                name: "Bone Shard",
                type: "material",
                description: "A fragment of bone.",
                value: 5,
                rarity: "common",
                icon: "🦴",
                stackable: true
            },
            "rotting flesh": {
                name: "Rotting Flesh",
                type: "material",
                description: "Unpleasant, but still useful for some recipes.",
                value: 4,
                rarity: "common",
                icon: "🍖",
                stackable: true
            },
            "ancient dust": {
                name: "Ancient Dust",
                type: "material",
                description: "Dust from ancient remains.",
                value: 8,
                rarity: "common",
                icon: "✨",
                stackable: true
            },
            "cursed bone": {
                name: "Cursed Bone",
                type: "material",
                description: "A bone infused with dark energy.",
                value: 18,
                rarity: "rare",
                icon: "🦴",
                stackable: true
            },
            "ectoplasm": {
                name: "Ectoplasm",
                type: "material",
                description: "A wispy residue from spirits.",
                value: 12,
                rarity: "uncommon",
                icon: "👻",
                stackable: true
            },
            "wisp essence": {
                name: "Wisp Essence",
                type: "material",
                description: "A faintly glowing spirit essence.",
                value: 16,
                rarity: "uncommon",
                icon: "✨",
                stackable: true
            },
            "spectral core": {
                name: "Spectral Core",
                type: "material",
                description: "A dense core of spectral energy.",
                value: 28,
                rarity: "rare",
                icon: "👻",
                stackable: true
            },
            "chitin": {
                name: "Chitin",
                type: "material",
                description: "A hard insect-like shell.",
                value: 8,
                rarity: "common",
                icon: "🪲",
                stackable: true
            },
            "hardened chitin": {
                name: "Hardened Chitin",
                type: "material",
                description: "Dense chitin reinforced by age.",
                value: 14,
                rarity: "uncommon",
                icon: "🪲",
                stackable: true
            },
            "silk": {
                name: "Silk",
                type: "material",
                description: "Strong, fine silk.",
                value: 10,
                rarity: "common",
                icon: "🧵",
                stackable: true
            },
            "venom sac": {
                name: "Venom Sac",
                type: "material",
                description: "A sac filled with potent venom.",
                value: 14,
                rarity: "common",
                icon: "🧪",
                stackable: true
            },
            "venom gland": {
                name: "Venom Gland",
                type: "material",
                description: "A concentrated gland of venom.",
                value: 24,
                rarity: "rare",
                icon: "🧪",
                stackable: true
            },
            "cloth": {
                name: "Cloth",
                type: "material",
                description: "Basic cloth used for crafting.",
                value: 4,
                rarity: "common",
                icon: "🧵",
                stackable: true
            },
            "leather strip": {
                name: "Leather Strip",
                type: "material",
                description: "A strip of leather.",
                value: 6,
                rarity: "uncommon",
                icon: "🧥",
                stackable: true
            },
            "scrap metal": {
                name: "Scrap Metal",
                type: "material",
                description: "Bent and worn metal scraps.",
                value: 6,
                rarity: "common",
                icon: "⚙️",
                stackable: true
            },
            "crude weapon parts": {
                name: "Crude Weapon Parts",
                type: "material",
                description: "Bits of crude weaponry.",
                value: 8,
                rarity: "common",
                icon: "⚙️",
                stackable: true
            },
            "iron scrap": {
                name: "Iron Scrap",
                type: "material",
                description: "Useful iron scraps for crafting.",
                value: 10,
                rarity: "uncommon",
                icon: "⚙️",
                stackable: true
            },
            "iron ingot": {
                name: "Iron Ingot",
                type: "material",
                description: "A refined iron ingot.",
                value: 20,
                rarity: "uncommon",
                icon: "⚙️",
                stackable: true
            },
            "stone fragment": {
                name: "Stone Fragment",
                type: "material",
                description: "A fragment of stone.",
                value: 5,
                rarity: "common",
                icon: "🪨",
                stackable: true
            },
            "metal shard": {
                name: "Metal Shard",
                type: "material",
                description: "A shard of metal.",
                value: 8,
                rarity: "common",
                icon: "⚙️",
                stackable: true
            },
            "golem core": {
                name: "Golem Core",
                type: "material",
                description: "A core from a construct.",
                value: 25,
                rarity: "uncommon",
                icon: "🪨",
                stackable: true
            },
            "adamant shard": {
                name: "Adamant Shard",
                type: "material",
                description: "A rare and sturdy shard.",
                value: 35,
                rarity: "rare",
                icon: "💎",
                stackable: true
            },
            "elemental shard": {
                name: "Elemental Shard",
                type: "material",
                description: "A shard infused with elemental energy.",
                value: 12,
                rarity: "common",
                icon: "🔮",
                stackable: true
            },
            "ember": {
                name: "Ember",
                type: "material",
                description: "A glowing ember.",
                value: 8,
                rarity: "common",
                icon: "🔥",
                stackable: true
            },
            "elemental core": {
                name: "Elemental Core",
                type: "material",
                description: "A dense core of elemental power.",
                value: 26,
                rarity: "uncommon",
                icon: "🔮",
                stackable: true
            },
            "pure essence": {
                name: "Pure Essence",
                type: "material",
                description: "Refined elemental essence.",
                value: 40,
                rarity: "rare",
                icon: "💫",
                stackable: true
            },
            "dragon scale": {
                name: "Dragon Scale",
                type: "material",
                description: "A scale from a dragon.",
                value: 30,
                rarity: "uncommon",
                icon: "🐉",
                stackable: true
            },
            "dragon claw": {
                name: "Dragon Claw",
                type: "material",
                description: "A heavy claw from a dragon.",
                value: 28,
                rarity: "uncommon",
                icon: "🐉",
                stackable: true
            },
            "fire gland": {
                name: "Fire Gland",
                type: "material",
                description: "A gland still warm to the touch.",
                value: 35,
                rarity: "uncommon",
                icon: "🔥",
                stackable: true
            },
            "ancient scale": {
                name: "Ancient Scale",
                type: "material",
                description: "A scale from an ancient dragon.",
                value: 55,
                rarity: "rare",
                icon: "🐉",
                stackable: true
            },
            "scale": {
                name: "Scale",
                type: "material",
                description: "A slick aquatic scale.",
                value: 6,
                rarity: "common",
                icon: "🐟",
                stackable: true
            },
            "seaweed": {
                name: "Seaweed",
                type: "material",
                description: "Slimy but useful.",
                value: 4,
                rarity: "common",
                icon: "🌿",
                stackable: true
            },
            "ink sac": {
                name: "Ink Sac",
                type: "material",
                description: "A sac of dark ink.",
                value: 10,
                rarity: "common",
                icon: "🦑",
                stackable: true
            },
            "abyssal pearl": {
                name: "Abyssal Pearl",
                type: "material",
                description: "A rare pearl from deep waters.",
                value: 35,
                rarity: "rare",
                icon: "💎",
                stackable: true
            },
            "demonic ash": {
                name: "Demonic Ash",
                type: "material",
                description: "Smoldering ash from a demonic foe.",
                value: 12,
                rarity: "common",
                icon: "🔥",
                stackable: true
            },
            "dark ichor": {
                name: "Dark Ichor",
                type: "material",
                description: "A viscous, dark fluid.",
                value: 14,
                rarity: "common",
                icon: "🧪",
                stackable: true
            },
            "infernal shard": {
                name: "Infernal Shard",
                type: "material",
                description: "A shard warm with infernal heat.",
                value: 26,
                rarity: "uncommon",
                icon: "🔥",
                stackable: true
            },
            "hellstone": {
                name: "Hellstone",
                type: "material",
                description: "A stone infused with demonic power.",
                value: 40,
                rarity: "rare",
                icon: "🔥",
                stackable: true
            },
            "crude dagger": {
                name: "Crude Dagger",
                type: "weapon",
                description: "A poorly made dagger.",
                value: 12,
                rarity: "common",
                stats: { attack: 3 },
                icon: "🗡️",
                slot: "oneHanded"
            },
            "rusted sword": {
                name: "Rusted Sword",
                type: "weapon",
                description: "A rusted but usable sword.",
                value: 15,
                rarity: "common",
                stats: { attack: 4 },
                icon: "🗡️",
                slot: "oneHanded"
            },
            "orcish axe": {
                name: "Orcish Axe",
                type: "weapon",
                description: "A heavy axe favored by orcs.",
                value: 28,
                rarity: "uncommon",
                stats: { attack: 7 },
                icon: "🪓",
                slot: "twoHanded"
            },
            "dark elven dagger": {
                name: "Dark Elven Dagger",
                type: "weapon",
                description: "A slender, sharp dagger.",
                value: 22,
                rarity: "uncommon",
                stats: { attack: 5 },
                icon: "🗡️",
                slot: "oneHanded"
            },
            "ritual dagger": {
                name: "Ritual Dagger",
                type: "weapon",
                description: "A dagger used in dark rites.",
                value: 20,
                rarity: "uncommon",
                stats: { attack: 5 },
                icon: "🗡️",
                slot: "oneHanded"
            },
            "heavy axe": {
                name: "Heavy Axe",
                type: "weapon",
                description: "A hefty axe built for brute force.",
                value: 35,
                rarity: "rare",
                stats: { attack: 9 },
                icon: "🪓",
                slot: "twoHanded"
            },
            "silvered dagger": {
                name: "Silvered Dagger",
                type: "weapon",
                description: "A dagger plated with silver.",
                value: 30,
                rarity: "rare",
                stats: { attack: 6 },
                icon: "🗡️",
                slot: "oneHanded"
            },
            "dagger": {
                name: "Dagger",
                type: "weapon",
                description: "A simple, balanced dagger.",
                value: 8,
                rarity: "common",
                stats: { attack: 2 },
                icon: "🗡️",
                slot: "oneHanded"
            },
            "bow": {
                name: "Hunting Bow",
                type: "weapon",
                description: "A simple bow suited for hunting beasts.",
                value: 18,
                rarity: "uncommon",
                stats: { attack: 2 },
                bonusVs: { beast: 1.3 },
                icon: "🏹",
                slot: "twoHanded"
            },
            "magic key": {
                name: "Magic Key",
                type: "key",
                description: "A key that glows with magical energy. Unlocks the Dragon's Lair.",
                value: 50,
                rarity: "uncommon",
                icon: "🔑",
                unlocks: ["dragon_lair"]
            },
            "crypt key": {
                name: "Crypt Key",
                type: "key",
                description: "An ancient key made of bone. Unlocks the Lich King's Tomb.",
                value: 50,
                rarity: "uncommon",
                icon: "💀",
                unlocks: ["lich_tomb"]
            },
            "spider_key": {
                name: "Spider Key",
                type: "key",
                description: "A key shaped like a spider. Unlocks the Spider Queen's Nest.",
                value: 50,
                rarity: "uncommon",
                icon: "🕷️",
                unlocks: ["spider_queen"]
            },
            "treasure_key": {
                name: "Treasure Key",
                type: "key",
                description: "A golden key encrusted with jewels. Unlocks the Treasure Vault.",
                value: 50,
                rarity: "uncommon",
                icon: "🗝️",
                unlocks: ["treasure_vault"]
            }
        };
        
        this.craftingRecipes = {
            "bandage": {
                name: "Bandage",
                description: "A simple bandage for quick healing.",
                ingredients: [
                    { item: "cloth", quantity: 2 }
                ],
                result: "bandage",
                difficulty: "easy",
                category: "tools",
                campfireRequired: false
            },
            "basic_salve": {
                name: "Basic Salve",
                description: "A small herbal salve for minor wounds.",
                ingredients: [
                    { item: "healing herb", quantity: 1 },
                    { item: "cloth", quantity: 1 }
                ],
                result: "basic salve",
                difficulty: "easy",
                category: "potions",
                campfireRequired: false
            },
            "health_potion": {
                name: "Health Potion",
                description: "A potion that restores 30 health.",
                ingredients: [
                    { item: "healing herb", quantity: 2 }
                ],
                result: "health potion",
                difficulty: "easy",
                category: "potions",
                campfireRequired: false
            },
            "cooked_meat": {
                name: "Cooked Meat",
                description: "Cook raw meat into a hearty meal.",
                ingredients: [
                    { item: "raw meat", quantity: 1 }
                ],
                result: "cooked meat",
                difficulty: "easy",
                category: "food",
                campfireRequired: true
            },
            "hunting_bow": {
                name: "Hunting Bow",
                description: "A simple bow for hunting beasts.",
                ingredients: [
                    { item: "feather", quantity: 3 },
                    { item: "hide", quantity: 1 },
                    { item: "cloth", quantity: 1 }
                ],
                result: "bow",
                difficulty: "easy",
                category: "weapons",
                campfireRequired: false
            }
        };
        
        // Status effect definitions
        this.statusEffectsList = {
            "poison": {
                name: "Poisoned",
                icon: "💀",
                description: "Lose health each turn",
                color: "#7cfc00",
                duration: 3,
                damagePerTurn: 5
            },
            "burn": {
                name: "Burning",
                icon: "🔥",
                description: "Take fire damage each turn",
                color: "#ff4500",
                duration: 2,
                damagePerTurn: 3
            },
            "stun": {
                name: "Stunned",
                icon: "💫",
                description: "Cannot act this turn",
                color: "#ffd700",
                duration: 1
            },
            "freeze": {
                name: "Frozen",
                icon: "❄️",
                description: "Reduced speed and defense",
                color: "#00bfff",
                duration: 2,
                defenseReduction: 3
            },
            "bleed": {
                name: "Bleeding",
                icon: "🩸",
                description: "Lose health over time",
                color: "#dc143c",
                duration: 3,
                damagePerTurn: 4
            },
            "regeneration": {
                name: "Regenerating",
                icon: "💚",
                description: "Heal each turn",
                color: "#32cd32",
                duration: 3,
                healPerTurn: 10
            }
        };
    }
    
    // LOCALIZATION AND DIFFICULTY HELPERS
    // -----------------------------------
    // These methods expose small pieces of shared logic that many other
    // systems rely on, such as translated UI text and combat difficulty values.

    // Resolves a translated UI string and injects the current username when needed.
    // Called by UI-facing systems that want language-aware labels.
    // Inputs:
    // - `key`: The translation key to look up.
    // Returns:
    // - A display-ready string.
    // Why it is designed this way:
    // - Centralizing translation lookup keeps presentation text out of gameplay
    //   systems and allows username replacement to stay consistent.
    t(key) {
        let text = this.translations[this.language][key] || key;
        text = text.replace("{username}", this.username);
        return text;
    }
    
    // Returns the current difficulty multipliers.
    // Called mostly by combat setup and any other system that needs the active
    // challenge scaling values.
    // Inputs:
    // - None.
    // Returns:
    // - An object with health, attack, and defense multipliers.
    // Why it is designed this way:
    // - Difficulty should scale from one clear source so enemies and systems do
    //   not accidentally interpret "hardcore" in conflicting ways.
    getDifficultyModifier() {
        switch (this.difficulty) {
            case "normal":
                return { health: 1.0, attack: 1.0, defense: 1.0 };
            case "hardcore":
                return { health: 1.4, attack: 1.4, defense: 1.4 };
            default:
                return { health: 1.0, attack: 1.0, defense: 1.0 };
        }
    }
    
    // ACCOUNT MANAGEMENT
    // -----------------------------------
    // Account data sits above the current run. It remembers who the player is,
    // which preferences they chose, and which save slot belongs to them.

    // Reads the account database from localStorage.
    // Called during construction before any login flow begins.
    // Inputs:
    // - None.
    // Returns:
    // - An object keyed by username.
    // Why it is designed this way:
    // - Keeping accounts separate from the live game state allows multiple
    //   players to share one browser without overwriting each other.
    loadAccounts() {
        const accountsData = localStorage.getItem('zorkAccounts');
        if (accountsData) {
            return JSON.parse(accountsData);
        }
        return {};
    }
    
    // Writes the in-memory account database back to localStorage.
    // Called whenever account metadata or save payloads change.
    // Inputs:
    // - None.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - A single save point for account storage reduces the chance of partial
    //   account updates being handled differently in different methods.
    saveAccounts() {
        localStorage.setItem('zorkAccounts', JSON.stringify(this.accounts));
    }
    
    // Creates a new player account.
    // Called from the login/register UI when the user chooses to register.
    // Inputs:
    // - `username`: The requested account name.
    // - `password`: The plain-text password entered in the UI.
    // Returns:
    // - A result object describing success and a user-facing message.
    // Why it is designed this way:
    // - Validation lives here instead of the UI so the underlying rules stay
    //   consistent even if the front-end changes later.
    createAccount(username, password) {
        // Check for bad words
        if (this.containsBadWord(username)) {
            return { success: false, message: "Username contains inappropriate content." };
        }
        
        // Check if username exists
        if (this.accounts[username]) {
            return { success: false, message: "Username already exists." };
        }
        
        // Create account with default values
        this.accounts[username] = {
            password: btoa(password), // Simple encoding (not secure for production)
            createdAt: new Date().toISOString(),
            lastPlayed: new Date().toISOString(),
            difficulty: null, // Not set yet
            inputMode: null, // Not set yet
            gameState: null // Will be populated when game starts
        };
        
        this.saveAccounts();
        return { success: true, message: "Account created successfully!" };
    }
    
    // Logs a player into an existing account.
    // Called from the login UI after the user submits credentials.
    // Inputs:
    // - `username`: The account to log into.
    // - `password`: The password to verify.
    // Returns:
    // - A result object describing success and a user-facing message.
    // Why it is designed this way:
    // - Login restores account preferences immediately so the UI can decide
    //   whether to resume a save or continue through setup screens.
    login(username, password) {
        const account = this.accounts[username];
        if (!account) {
            return { success: false, message: "Account not found." };
        }
        
        if (account.password !== btoa(password)) {
            return { success: false, message: "Incorrect password." };
        }
        
        this.currentAccount = username;
        this.isLoggedIn = true;
        this.username = username;
        
        // Set game state from account preferences
        if (account.difficulty) {
            this.difficulty = account.difficulty;
        }
        if (account.inputMode) {
            this.inputMode = account.inputMode;
        }
        
        // Reset welcome message flag
        this.hasShownWelcome = false;
        
        // Update last played
        this.accounts[username].lastPlayed = new Date().toISOString();
        this.saveAccounts();
        
        return { success: true, message: "Login successful!" };
    }
    
    // Logs the current player out.
    // Called by UIController when the player returns to the lobby.
    // Inputs:
    // - None.
    // Returns:
    // - A result object indicating success.
    // Why it is designed this way:
    // - Saving before clearing state protects progress if the logout was a
    //   navigation choice rather than an error or page refresh.
    logout() {
        this.saveGame(); // Save before logout
        this.currentAccount = null;
        this.isLoggedIn = false;
        this.resetState();
        return { success: true, message: "Logged out successfully." };
    }
    
    // Saves account-level setup choices such as difficulty and input mode.
    // Called when the player completes setup screens before starting a run.
    // Inputs:
    // - `difficulty`: The chosen difficulty string.
    // - `inputMode`: The chosen input mode string.
    // Returns:
    // - `true` on success, otherwise `false`.
    // Why it is designed this way:
    // - These settings matter even before a save exists, so they are stored at
    //   the account level instead of only inside the run state.
    saveAccountPreferences(difficulty, inputMode) {
        if (!this.isLoggedIn || !this.currentAccount) {
            console.error('Cannot save preferences: No user logged in');
            return false;
        }
        
        const account = this.accounts[this.currentAccount];
        if (account) {
            console.log(`Saving account preferences: difficulty=${difficulty}, inputMode=${inputMode}`);
            
            // Save to account
            account.difficulty = difficulty;
            account.inputMode = inputMode;
            
            // Update current game state
            this.difficulty = difficulty;
            this.inputMode = inputMode;
            
            // Save accounts to localStorage
            this.saveAccounts();
            
            console.log('Account preferences saved successfully');
            return true;
        }
        
        console.error('Failed to save account preferences: Account not found');
        return false;
    }
    
    // Checks text against the built-in word filter.
    // Called mainly during account creation.
    // Inputs:
    // - `text`: The text to inspect.
    // Returns:
    // - `true` if blocked content was found, otherwise `false`.
    // Why it is designed this way:
    // - The rule is simple, but centralizing it makes future moderation changes easier.
    containsBadWord(text) {
        const lowerText = text.toLowerCase();
        return this.badWords.some(word => lowerText.includes(word));
    }
    
    // SAVE AND LOAD
    // -----------------------------------
    // This section serializes the live run into storage and reconstructs it
    // later. It is especially important because several fields use Sets and
    // nested objects that do not survive JSON unchanged.

    // Serializes the current run into the active account's save slot.
    // Called by auto-save, logout, and some explicit transitions.
    // Inputs:
    // - None.
    // Returns:
    // - `true` if a save was written, otherwise `false`.
    // Why it is designed this way:
    // - Save data is written as plain JSON-friendly structures so browser
    //   storage can persist the run without a backend.
    saveGame() {
        if (!this.isLoggedIn || !this.autoSave) return false;
        
        const saveData = {
            currentLocation: this.currentLocation,
            currentMap: this.currentMap,
            currentSubArea: this.currentSubArea,
            health: this.health,
            maxHealth: this.maxHealth,
            attack: this.attack,
            defense: this.defense,
            score: this.score,
            inventory: this.inventory,
            visitedLocations: this.visitedLocations,
            gold: this.gold,
            equippedItems: this.equippedItems,
            discoveredRecipes: this.discoveredRecipes,
            difficulty: this.difficulty,
            inputMode: this.inputMode,
            gameMode: this.gameMode,
            world: this.world,
            subAreas: this.subAreas,
            activeEnemies: this.activeEnemies,
            defeatedEnemies: this.defeatedEnemies,
            statusEffects: this.statusEffects,
            encountersSinceLastCombat: this.encountersSinceLastCombat,
            lastCombatLocation: this.lastCombatLocation,
            specialCharge: this.specialCharge,
            lootStats: this.lootStats,
            combatAnimations: this.combatAnimations,
            autoSave: this.autoSave,
            hasShownWelcome: this.hasShownWelcome,
            seenLockedLocations: Array.from(this.seenLockedLocations || []),
            enemyJournal: {
                encountered: Array.from(this.enemyJournal.encountered || []),
                defeated: Array.from(this.enemyJournal.defeated || [])
            },
            mapDiscovery: {
                discoveredCells: Array.from(this.mapDiscovery.discoveredCells),
                visiblePaths: Array.from(this.mapDiscovery.visiblePaths)
            },
            areaState: this.areaState,
            shopState: this.shopState,
            cameraState: this.cameraState,
            combatState: this.combatState
        };
        
        this.accounts[this.currentAccount].gameState = saveData;
        this.saveAccounts();
        return true;
    }
    
    // Restores a saved run from the active account.
    // Called during game initialization after login succeeds.
    // Inputs:
    // - None.
    // Returns:
    // - `true` if save data existed and was restored, otherwise `false`.
    // Why it is designed this way:
    // - JSON cannot directly preserve structures like `Set`, so load logic
    //   must rebuild them or later map/journal systems would break.
    loadGame() {
        if (!this.isLoggedIn) return false;
        
        const account = this.accounts[this.currentAccount];
        if (!account || !account.gameState) return false;
        
        const data = account.gameState;
        
        // Restore all game state
        Object.keys(data).forEach(key => {
            if (this.hasOwnProperty(key)) {
                if (key === 'mapDiscovery' && data[key]) {
                    // Special handling for mapDiscovery
                    this.mapDiscovery.discoveredCells = new Set(data[key].discoveredCells || []);
                    this.mapDiscovery.visiblePaths = new Set(data[key].visiblePaths || []);
                } else if (key === 'enemyJournal' && data[key]) {
                    // Special handling for enemyJournal
                    this.enemyJournal.encountered = new Set(data[key].encountered || []);
                    this.enemyJournal.defeated = new Set(data[key].defeated || []);
                } else if (key === 'seenLockedLocations' && data[key]) {
                    // Special handling for seenLockedLocations
                    this.seenLockedLocations = new Set(data[key]);
                } else {
                    this[key] = data[key];
                }
            }
        });
        
        if (!this.enemyJournal) {
            this.enemyJournal = {
                encountered: new Set(),
                defeated: new Set()
            };
        }

        if (!this.areaState) {
            this.areaState = {
                currentWorldArea: this.currentLocation || "start",
                currentInternalArea: this.currentSubArea || null,
                progressionUnlocked: {},
                portalStack: [],
                nestedPortalDepth: 0
            };
        }

        if (!this.shopState) {
            this.shopState = {
                open: false,
                activeShopId: null
            };
        }

        if (!this.cameraState) {
            this.cameraState = {
                clampEnabled: true
            };
        }

        if (!this.combatState) {
            this.combatState = {
                playerTurn: true,
                turnLock: false,
                indicator: "Player Turn"
            };
        }
        
        return true;
    }
    
    // Deletes only the current run while keeping the account record itself.
    // Called during restart or similar account-reset flows.
    // Inputs:
    // - None.
    // Returns:
    // - `true` on success, otherwise `false`.
    // Why it is designed this way:
    // - Separating "delete save" from "delete account" is safer for players
    //   who want a fresh run without losing their account identity.
    deleteSave() {
        if (!this.isLoggedIn) return false;
        
        this.accounts[this.currentAccount].gameState = null;
        this.saveAccounts();
        this.resetState();
        return true;
    }
    
    // Clears setup choices so the account must go through the intro flow again.
    // Called by the restart flow.
    // Inputs:
    // - None.
    // Returns:
    // - `true` on success, otherwise `false`.
    // Why it is designed this way:
    // - Restarting is meant to feel like a fresh campaign, not just a cleared
    //   save standing on top of old difficulty/input decisions.
    resetAccountSetup() {
        if (!this.isLoggedIn) return false;
        
        const account = this.accounts[this.currentAccount];
        if (account) {
            account.difficulty = null;
            account.inputMode = null;
            account.gameState = null;
            this.saveAccounts();
            this.resetState();
            return true;
        }
        return false;
    }
    
    // WORLD AND LOCATION STATE
    // -----------------------------------
    // These helpers let the rest of the game ask simple questions about "where
    // the player is" without caring whether that means the main world or an interior map.

    // Returns the currently active map object.
    // Called by movement, map rendering, UI updates, and room inspection logic.
    // Inputs:
    // - None.
    // Returns:
    // - The main world object or the active sub-area object.
    // Why it is designed this way:
    // - Systems should not need to duplicate "if in sub-area" checks every time
    //   they want the current room data.
    getCurrentWorld() {
        if (this.currentSubArea && this.subAreas[this.currentSubArea]) {
            return this.subAreas[this.currentSubArea];
        }
        return this.world;
    }

    // Safely resolves one location from the active world context.
    // Called throughout the codebase anywhere room data is needed.
    // Inputs:
    // - `locationId`: Optional location ID; defaults to the current location.
    // - `world`: Optional explicit world override.
    // Returns:
    // - The location object or `null`.
    // Why it is designed this way:
    // - A safe accessor avoids repeated defensive checks scattered across the code.
    getLocation(locationId = this.currentLocation, world = null) {
        const activeWorld = world || this.getCurrentWorld();
        if (!activeWorld) return null;
        return activeWorld[locationId] || null;
    }

    // Checks whether the player has already used `look` in this room visit.
    // Called by exploration commands and UI quick-button state updates.
    // Inputs:
    // - `locationId`: Optional location override.
    // - `world`: Optional world override.
    // Returns:
    // - `true` if the room has already been searched this visit.
    // Why it is designed this way:
    // - The "look once per visit" rule is a gameplay pacing rule, so it belongs
    //   in shared state rather than in a UI-only flag.
    hasLookedAround(locationId = this.currentLocation, world = null) {
        const location = this.getLocation(locationId, world);
        return !!(location && location.lookedThisVisit);
    }

    // Prepares a room for a new visit by clearing its one-time look state.
    prepareLocationForVisit(locationId = this.currentLocation, world = null) {
        const location = this.getLocation(locationId, world);
        if (!location) return false;
        location.lookedThisVisit = false;
        return true;
    }

    // Marks that the player has already spent their detailed search in this room visit.
    markLocationLooked(locationId = this.currentLocation, world = null) {
        const location = this.getLocation(locationId, world);
        if (!location) return false;
        location.lookedThisVisit = true;
        return true;
    }

    // Clears the look flag manually when another system needs to force a fresh visit.
    clearLocationLookState(locationId = this.currentLocation, world = null) {
        const location = this.getLocation(locationId, world);
        if (!location) return false;
        location.lookedThisVisit = false;
        return true;
    }
    
    // Enters an interior map from an overworld entrance.
    // Called after `Main` validates an enter action.
    // Inputs:
    // - `subAreaId`: The ID of the area to enter.
    // - `entranceLocationId`: The overworld node that owns that entrance.
    // Returns:
    // - `true` if the context switch succeeded, otherwise `false`.
    // Why it is designed this way:
    // - Sub-areas are stored separately from the overworld so the game can
    //   treat interiors like their own small maps without losing return context.
    enterSubArea(subAreaId, entranceLocationId) {
        if (!this.world[entranceLocationId] || !this.world[entranceLocationId].subArea) {
            return false;
        }
        
        // Generate sub-area if it doesn't exist
        if (!this.subAreas[subAreaId]) {
            console.log(`Generating sub-area: ${subAreaId}`);
            // This will be generated by MapSystem
            return false; // MapSystem will handle generation
        }
        
        const subArea = this.subAreas[subAreaId];
        if (!subArea.entrance) {
            return false;
        }
        
        // Store the entrance location for returning
        this.currentSubArea = subAreaId;
        this.currentMap = subAreaId;
        this.currentLocation = subArea.entrance;
        
        // Add entrance to visited locations in sub-area
        if (!subArea.visitedLocations) {
            subArea.visitedLocations = [];
        }
        if (!subArea.visitedLocations.includes(subArea.entrance)) {
            subArea.visitedLocations.push(subArea.entrance);
        }
        
        console.log(`Entered sub-area: ${subAreaId}`);
        return true;
    }
    
    // Exits the current interior map and returns to its overworld entrance.
    // Called when the player leaves a sub-area.
    // Inputs:
    // - None.
    // Returns:
    // - `true` if the exit succeeded, otherwise `false`.
    // Why it is designed this way:
    // - This keeps the overworld/sub-area transition reversible and explicit.
    exitSubArea() {
        if (!this.currentSubArea || !this.subAreas[this.currentSubArea]) {
            return false;
        }
        
        const subArea = this.subAreas[this.currentSubArea];
        if (!subArea.entranceLocation) {
            return false;
        }
        
        // Return to the entrance location in the main world
        this.currentMap = "world";
        this.currentSubArea = null;
        this.currentLocation = subArea.entranceLocation;
        
        console.log(`Exited sub-area, returned to: ${subArea.entranceLocation}`);
        return true;
    }
    
    // Checks whether a location should be visible on the map.
    // Called mainly by map rendering logic.
    // Inputs:
    // - `locationId`: The location being considered for display.
    // Returns:
    // - `true` if the location may be shown.
    // Why it is designed this way:
    // - Hardcore mode intentionally hides information so navigation feels more
    //   dangerous and discovery matters more.
    isLocationVisible(locationId) {
        if (this.difficulty === "normal") {
            return true; // All locations visible in Normal mode
        }
        
        // Hardcore mode: only show visited locations
        if (this.currentSubArea && this.subAreas[this.currentSubArea]) {
            // In sub-area
            const subArea = this.subAreas[this.currentSubArea];
            if (subArea.visitedLocations && subArea.visitedLocations.includes(locationId)) {
                return true;
            }
        } else {
            // In main world
            if (this.visitedLocations.includes(locationId)) {
                return true;
            }
        }
        
        // Also show locked locations that have been seen (attempted to enter)
        if (this.seenLockedLocations && this.seenLockedLocations.has(locationId)) {
            return true;
        }
        
        return false;
    }
    
    // Updates persistent map discovery after the player reaches a new room.
    // Called after successful movement, especially in hardcore mode.
    // Inputs:
    // - `newLocationId`: The location the player just entered.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Discovery is stored separately from just "current position" so the map
    //   can reveal knowledge gradually instead of always knowing everything.
    updateMapDiscovery(newLocationId) {
        const world = this.getCurrentWorld();
        const location = world[newLocationId];
        if (!location) return;
        
        // Add to discovered cells
        this.mapDiscovery.discoveredCells.add(newLocationId);
        
        // Add visited location (for Hardcore visibility)
        if (this.currentSubArea && this.subAreas[this.currentSubArea]) {
            // In sub-area
            if (!this.subAreas[this.currentSubArea].visitedLocations) {
                this.subAreas[this.currentSubArea].visitedLocations = [];
            }
            if (!this.subAreas[this.currentSubArea].visitedLocations.includes(newLocationId)) {
                this.subAreas[this.currentSubArea].visitedLocations.push(newLocationId);
            }
        } else {
            // In main world
            if (!this.visitedLocations.includes(newLocationId)) {
                this.visitedLocations.push(newLocationId);
            }
        }
        
        // Add visible paths from this location
        if (location.exits) {
            for (const dir in location.exits) {
                const exitId = location.exits[dir];
                const pathKey = `${newLocationId}-${exitId}`;
                this.mapDiscovery.visiblePaths.add(pathKey);
            }
        }
    }
    
    // Records that the player has seen a locked destination.
    // Called when they attempt to move into or otherwise discover a locked area.
    // Inputs:
    // - `locationId`: The locked location that was discovered.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Even in hardcore mode, the player should remember that a locked place
    //   exists. The map hides certainty, not memory.
    markLockedLocationSeen(locationId) {
        if (!this.seenLockedLocations) {
            this.seenLockedLocations = new Set();
        }
        this.seenLockedLocations.add(locationId);
        console.log(`Marked locked location as seen: ${locationId}`);
    }

    // ENEMY MEMORY AND ENCOUNTER PACING
    // -----------------------------------
    // These helpers feed the journey book and control how often random combat
    // interrupts exploration.

    // Marks an enemy type as encountered for journal purposes.
    markEnemyEncountered(enemyType) {
        if (!this.enemyJournal) {
            this.enemyJournal = {
                encountered: new Set(),
                defeated: new Set()
            };
        }
        this.enemyJournal.encountered.add(enemyType);
    }

    // Marks an enemy type as defeated, which also implies it has been encountered.
    markEnemyDefeated(enemyType) {
        if (!this.enemyJournal) {
            this.enemyJournal = {
                encountered: new Set(),
                defeated: new Set()
            };
        }
        this.enemyJournal.encountered.add(enemyType);
        this.enemyJournal.defeated.add(enemyType);
    }

    // Checks whether this enemy has ever been seen.
    isEnemyEncountered(enemyType) {
        return this.enemyJournal && this.enemyJournal.encountered && this.enemyJournal.encountered.has(enemyType);
    }

    // Checks whether this enemy has ever been defeated.
    isEnemyDefeated(enemyType) {
        return this.enemyJournal && this.enemyJournal.defeated && this.enemyJournal.defeated.has(enemyType);
    }
    
    // Determines whether a random encounter should happen now.
    // Called after movement and certain exploration actions.
    // Inputs:
    // - None.
    // Returns:
    // - `true` if combat should begin.
    // Why it is designed this way:
    // - Encounters are spaced out so the world feels dangerous without turning
    //   every step into a fight. The increasing chance creates tension.
    shouldEncounterEnemy() {
        // Don't encounter if we just had combat
        if (this.currentLocation === this.lastCombatLocation) {
            return false;
        }
        
        // Increase counter
        this.encountersSinceLastCombat++;
        
        // 5-10 locations between encounters
        if (this.encountersSinceLastCombat < 5) return false;
        
        // Chance increases with distance from last combat
        const encounterChance = Math.min(0.3 + (this.encountersSinceLastCombat - 5) * 0.1, 0.8);
        
        if (Math.random() < encounterChance) {
            this.encountersSinceLastCombat = 0;
            this.lastCombatLocation = this.currentLocation;
            return true;
        }
        
        return false;
    }
    
    // STATUS EFFECTS
    // -----------------------------------
    // Status effects are stored here because both combat logic and UI need a
    // shared understanding of what effects exist and how long they last.

    // Adds a timed status effect to the player or enemy.
    // Called by combat abilities, items, and special attacks.
    // Inputs:
    // - `target`: `"player"` or `"enemy"`.
    // - `effectName`: The key in `statusEffectsList`.
    // - `duration`: Optional override duration.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Storing the effect data in one place prevents combat code from having
    //   to manually recreate effect durations and metadata every time.
    addStatusEffect(target, effectName, duration = null) {
        const effect = this.statusEffectsList[effectName];
        if (!effect) return;
        
        const newEffect = {
            name: effectName,
            turnsRemaining: duration || effect.duration,
            data: { ...effect }
        };
        
        this.statusEffects[target].push(newEffect);
    }
    
    // Advances status timers and applies turn-based effects.
    // Called at combat turn boundaries.
    // Inputs:
    // - `target`: `"player"` or `"enemy"`.
    // Returns:
    // - An array of combat-log text strings describing what happened.
    // Why it is designed this way:
    // - Returning text summaries keeps combat UI messaging synchronized with
    //   the exact state changes that just occurred.
    processStatusEffects(target) {
        const effects = this.statusEffects[target];
        const results = [];
        
        for (let i = effects.length - 1; i >= 0; i--) {
            const effect = effects[i];
            effect.turnsRemaining--;
            
            // Apply effect
            const effectData = this.statusEffectsList[effect.name];
            if (effectData.damagePerTurn && target === "enemy" && gameState.currentEnemy) {
                gameState.currentEnemy.health -= effectData.damagePerTurn;
                results.push(`${gameState.currentEnemy.name} takes ${effectData.damagePerTurn} damage from ${effectData.name}!`);
            }
            
            if (effectData.damagePerTurn && target === "player") {
                gameState.health -= effectData.damagePerTurn;
                results.push(`${this.username} takes ${effectData.damagePerTurn} damage from ${effectData.name}!`);
            }
            
            if (effectData.healPerTurn && target === "player") {
                gameState.health = Math.min(gameState.health + effectData.healPerTurn, gameState.maxHealth);
                results.push(`${this.username} heals ${effectData.healPerTurn} health from ${effectData.name}!`);
            }
            
            // Remove expired effects
            if (effect.turnsRemaining <= 0) {
                effects.splice(i, 1);
                results.push(`${effectData.name} effect wears off.`);
            }
        }
        
        return results;
    }
    
    // Checks whether a target currently has a named status effect.
    hasStatusEffect(target, effectName) {
        return this.statusEffects[target].some(effect => effect.name === effectName);
    }
    
    
    // INVENTORY AND LOOT
    
    // This section keeps the underlying item model simple: each item is stored
    // as an entry in an array, while the UI is responsible for grouping counts.

    // Adds one item to inventory.
    // Called by pickups, loot drops, crafting rewards, shops, and minigames.
    // Inputs:
    // - `itemName`: The item to add.
    // Returns:
    // - Nothing.
    // Why it is designed this way:
    // - Storing duplicates as separate entries makes "remove one potion" style
    //   actions straightforward and avoids manual stack bookkeeping.
    addToInventory(itemName) {
        const itemData = this.items[itemName];
        if (itemData && itemData.stackable) {
            // Check if we already have this stackable item
            const existingIndex = this.inventory.findIndex(item => item === itemName);
            if (existingIndex !== -1) {
                // For stackable items, we store each as separate entry
                // The UI handles grouping them
                this.inventory.push(itemName);
            } else {
                this.inventory.push(itemName);
            }
        } else {
            this.inventory.push(itemName);
        }
    }
    
    // Removes one copy of an item from inventory.
    removeFromInventory(itemName) {
        const index = this.inventory.indexOf(itemName);
        if (index !== -1) {
            this.inventory.splice(index, 1);
            return true;
        }
        return false;
    }
    
    // Counts how many copies of one item are currently held.
    getInventoryCount(itemName) {
        return this.inventory.filter(item => item === itemName).length;
    }

    // Resolves an icon for one item, using safe fallbacks when necessary.
    getItemIcon(itemName) {
        const itemData = this.items[itemName];
        const fallback = {
            "raw meat": "🍖",
            "cooked meat": "🍗",
            "hide": "🟫",
            "thick hide": "🟫",
            "pristine hide": "🟫",
            "tough hide": "🟫",
            "cloth": "🧵",
            "bandage": "🩹",
            "feather": "🪶",
            "bone shard": "🦴",
            "fang": "🦷",
            "claw": "🐾",
            "crude weapon parts": "⚙️",
            "scrap metal": "⚙️",
            "iron scrap": "⚙️",
            "iron ingot": "⚙️",
            "bow": "🏹",
            "dagger": "🗡️",
            "rusty sword": "🗡️",
            "health potion": "🧪",
            "small health potion": "🧪",
            "large health potion": "🧪",
            "antidote": "💊",
            "healing herb": "🌿",
            "basic salve": "🧴",
            "torch": "🔥",
            "rope": "🪢",
            "climbing rope": "🪢",
            "pickaxe": "⛏️",
            "hammer": "🔨"
        };

        if (fallback[itemName]) return fallback[itemName];

        const icon = itemData && itemData.icon;
        if (icon && typeof icon === "string" && icon.trim() !== "" && !icon.includes("Ã") && !icon.includes("ð") && !icon.includes("â") && !icon.includes("\uFFFD")) {
            return icon;
        }

        return "📦";
    }
    
    // Calculates the current bonus loot chance created by repeated empty searches.
    calculateLootChance() {
        const baseChance = this.lootStats.baseChance;
        const streakBonus = Math.min(
            this.lootStats.streakBonus * this.lootStats.currentStreak,
            this.lootStats.maxBonus
        );
        return baseChance + streakBonus;
    }
    
    // Updates the progressive search streak after a room search succeeds or fails.
    updateLootStreak(foundLoot) {
        if (foundLoot) {
            this.lootStats.currentStreak = 0;
        } else {
            this.lootStats.currentStreak++;
        }
    }

    // Returns guaranteed or themed drop tendencies for certain enemy families.
    getSpecificEnemyDrops(enemyType, enemy) {
        const drops = [];
        const type = (enemyType || '').toLowerCase();
        const name = ((enemy && enemy.name) ? enemy.name : enemyType).toLowerCase();

        const addDrop = (item) => {
            if (item && !drops.includes(item)) {
                drops.push(item);
            }
        };

        if (type.includes('goblin') || name.includes('goblin')) {
            addDrop('scrap metal');
            addDrop('crude weapon parts');
        }

        if (type.includes('wolf') || name.includes('wolf')) {
            addDrop('hide');
            addDrop('fang');
        }

        if (type.includes('deer') || name.includes('deer')) {
            addDrop('raw meat');
            addDrop('hide');
        }

        if (type.includes('bird') || name.includes('bird') || type.includes('phoenix') || name.includes('phoenix') || type.includes('harpy') || name.includes('harpy')) {
            addDrop('feather');
        }

        return drops;
    }

    // Normalizes enemy names into broader categories used by loot and weapon bonuses.
    getEnemyCategory(enemyType, enemy) {
        const type = (enemyType || '').toLowerCase();
        const name = ((enemy && enemy.name) ? enemy.name : enemyType).toLowerCase();

        const has = (keywords) => keywords.some(keyword => type.includes(keyword) || name.includes(keyword));

        if (has(['dragon'])) return 'dragon';
        if (has(['spider', 'arachnid'])) return 'arachnid';
        if (has(['ghost', 'wraith', 'specter', 'banshee'])) return 'spirit';
        if (has(['skeleton', 'zombie', 'lich', 'vampire'])) return 'undead';
        if (has(['golem', 'titan'])) return 'construct';
        if (has(['elemental', 'sprite', 'djinn', 'phoenix'])) return 'elemental';
        if (has(['kraken', 'kelpie', 'siren'])) return 'aquatic';
        if (has(['imp', 'succubus', 'void'])) return 'demon';
        if (has(['goblin', 'orc', 'elf', 'witch', 'minotaur', 'giant', 'troll', 'cyclops', 'bandit'])) return 'humanoid';
        if (has(['wolf', 'bear', 'rat', 'bat', 'hydra', 'chimera', 'manticore', 'griffin', 'basilisk', 'gorgon', 'barghest', 'wendigo', 'harpy', 'boar', 'bird', 'deer'])) return 'beast';

        return 'beast';
    }

    // Rolls for an occasional weapon drop based on the defeated enemy type.
    getEnemyWeaponDrop(enemyType, enemy) {
        if (!enemy) return null;

        const weaponPools = {
            goblin: ["crude dagger"],
            orc_warrior: ["orcish axe"],
            skeleton: ["rusted sword"],
            dark_elf: ["dark elven dagger"],
            witch: ["ritual dagger"],
            minotaur: ["heavy axe"],
            vampire: ["silvered dagger"],
            bandit: ["rusted sword"]
        };

        const pool = weaponPools[enemyType];
        if (!pool || pool.length === 0) return null;

        let chance = 0;
        switch (enemy.rarity) {
            case "common": chance = 0.10; break;
            case "uncommon": chance = 0.05; break;
            case "rare": chance = 0.01; break;
            case "legendary": chance = 0.01; break;
            default: chance = 0.05; break;
        }

        if (Math.random() < chance) {
            return pool[Math.floor(Math.random() * pool.length)];
        }

        return null;
    }

    // Builds the final loot list for one defeated enemy.
    // Called when combat resolves in the player's favor.
    // Inputs:
    // - `enemyType`: The defeated enemy key.
    // Returns:
    // - An array of item names.
    // Why it is designed this way:
    // - Loot is intentionally logical rather than trophy-only. Beasts tend to
    //   drop meat, hide, fang, or feathers because those materials connect back
    //   into crafting and survival systems in believable ways.
    getEnemyLoot(enemyType) {
        const enemy = this.enemies[enemyType];
        if (!enemy) return [];

        const category = this.getEnemyCategory(enemyType, enemy);
        const pools = this.enemyDropPools || {};
        const pool = pools[category] || pools.beast || { common: [], uncommon: [], rare: [] };

        const drops = [];
        const addDrop = (item) => {
            if (item && !drops.includes(item)) {
                drops.push(item);
            }
        };

        const specificDrops = this.getSpecificEnemyDrops(enemyType, enemy);
        specificDrops.forEach(item => addDrop(item));

        if (pool.common && pool.common.length > 0) {
            addDrop(pool.common[Math.floor(Math.random() * pool.common.length)]);
        }

        let extraChance = 0.2;
        switch (enemy.rarity) {
            case "common": extraChance = 0.2; break;
            case "uncommon": extraChance = 0.3; break;
            case "rare": extraChance = 0.4; break;
            case "legendary": extraChance = 0.5; break;
        }

        if (Math.random() < extraChance && pool.uncommon && pool.uncommon.length > 0) {
            addDrop(pool.uncommon[Math.floor(Math.random() * pool.uncommon.length)]);
        }

        let rareChance = 0.05;
        if (enemy.rarity === "rare") rareChance = 0.15;
        if (enemy.rarity === "legendary") rareChance = 0.25;

        if (Math.random() < rareChance && pool.rare && pool.rare.length > 0) {
            addDrop(pool.rare[Math.floor(Math.random() * pool.rare.length)]);
        }

        const weaponDrop = this.getEnemyWeaponDrop(enemyType, enemy);
        if (weaponDrop) {
            addDrop(weaponDrop);
        }

        return drops;
    }
    
    // Filters the enemy roster down to what makes sense at one location.
    // Called before rolling a random encounter.
    // Inputs:
    // - `location`: The room the player is currently in.
    // Returns:
    // - An array of valid enemy type keys.
    // Why it is designed this way:
    // - Spawn tables are derived from biome and inferred room type so the world
    //   feels coherent without needing a unique hand-authored enemy list per node.
    getEnemiesForLocation(location) {
        const locationType = this.getLocationType(location);
        const biome = location.biome;
        
        let enemyTypes = Object.keys(this.enemies).filter(type => 
            this.enemies[type].biome.includes(biome)
        );
        
        if (locationType) {
            enemyTypes = enemyTypes.filter(type => 
                this.enemies[type].locationTypes && 
                this.enemies[type].locationTypes.includes(locationType)
            );
        }
        
        if (enemyTypes.length === 0) {
            enemyTypes = Object.keys(this.enemies).filter(type => 
                this.enemies[type].biome.includes(biome)
            );
        }
        
        return enemyTypes;
    }
    
    // Infer a location type from its text so enemy spawning can become more specific.
    getLocationType(location) {
        const name = location.name.toLowerCase();
        const description = location.description.toLowerCase();
        
        if (name.includes('graveyard') || name.includes('crypt') || description.includes('grave') || description.includes('tomb')) {
            return 'graveyard';
        }
        if (name.includes('house') || name.includes('cottage') || name.includes('hut') || description.includes('house')) {
            return 'house';
        }
        if (name.includes('cave') || name.includes('cavern') || name.includes('tunnel') || description.includes('cave')) {
            return 'cave';
        }
        if (name.includes('dungeon') || name.includes('lair') || description.includes('dungeon')) {
            return 'dungeon';
        }
        if (name.includes('forest') || name.includes('woods') || description.includes('forest')) {
            return 'forest';
        }
        
        return null;
    }
}

const gameState = new GameState();





