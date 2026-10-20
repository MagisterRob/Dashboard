/*
========================================
FILE OVERVIEW
----------------------------------------
Purpose:
- Provides small location-based side activities that reward gold or items.

Key Systems:
- Activity registry by biome
- Hub menu for available local games
- Several simple minigame types
- Reward distribution and cleanup

Flow:
- Checks the current location for matching activity tags
- Opens a hub or direct game view
- Rewards the player and returns them to exploration

Design Notes:
- These minigames are intentionally lightweight. They add flavor and pacing
  variety without hijacking the main adventure every five minutes.
========================================
*/
(function () {
    class MinigameSystem {
        // MINIGAME SYSTEM SETUP
        // -----------------------------------
        // This subsystem adds optional side activities to otherwise normal map
        // locations. The activities are intentionally small so they enrich the
        // world without competing with the main exploration loop.

        // Creates the minigame subsystem and prebuilds its activity registry.
        // Called by the world extension layer during startup.
        // Inputs:
        // - `context`: Shared extension context used for logging.
        // Returns:
        // - A configured `MinigameSystem` instance.
        // Why it is designed this way:
        // - The registry is built once so location checks stay fast and do not
        //   rebuild the whole minigame catalog every time the player moves.
        constructor(context) {
            this.ctx = context;
            this.activeGame = null;
            this.games = this.buildGameRegistry();
        }

        // Sends minigame debug output through the shared extension logger.
        log(message, data) {
            if (this.ctx && this.ctx.log) {
                this.ctx.log(message, data);
            }
        }

        // Builds the master list of location-based activities.
        // Called once during construction.
        // Inputs:
        // - None.
        // Returns:
        // - An array of activity definitions.
        // Why it is designed this way:
        // - Each activity is tied to biome tags so procedural or patched areas
        //   can still offer sensible content without hand-placing every event.
        buildGameRegistry() {
            return [
                { id: "ore_tap", name: "Ore Vein Strike", biome: ["mountains", "cave"], type: "timing", reward: { gold: 12, items: ["bone shard"] } },
                { id: "deep_mining", name: "Deep Mining Helper", biome: ["mountains", "cave"], type: "choice", reward: { gold: 18, items: ["cloth"] } },
                { id: "timber_cut", name: "Timber Cut", biome: ["forest"], type: "timing", reward: { gold: 10, items: ["cloth"] } },
                { id: "hunter_shot", name: "Hunter's Shot", biome: ["forest", "plains"], type: "timing", reward: { items: ["raw meat", "feather"] } },
                { id: "snare_line", name: "Snare Line", biome: ["forest"], type: "choice", reward: { items: ["hide"] } },
                { id: "river_cast", name: "River Cast", biome: ["forest", "bridge"], type: "timing", reward: { gold: 8, items: ["raw meat"] } },
                { id: "mushroom_sort", name: "Mushroom Sort", biome: ["forest"], type: "pattern", reward: { gold: 9, items: ["healing herb"] } },
                { id: "herbal_brew", name: "Herbal Brew", biome: ["forest", "town"], type: "choice", reward: { items: ["health potion"] } },
                { id: "market_haggle", name: "Market Haggle", biome: ["town", "city", "kingdom"], type: "choice", reward: { gold: 20 } },
                { id: "dice_corner", name: "Dice Corner", biome: ["town", "city"], type: "gamble", reward: { gold: 30 } },
                { id: "cup_shuffle", name: "Cup Shuffle", biome: ["town", "city"], type: "pattern", reward: { gold: 24 } },
                { id: "forge_bellows", name: "Forge Bellows", biome: ["town", "city", "kingdom"], type: "timing", reward: { items: ["dagger"] } },
                { id: "armor_polish", name: "Armor Polish", biome: ["city", "kingdom"], type: "choice", reward: { gold: 14, items: ["leather armor"] } },
                { id: "street_delivery", name: "Street Delivery", biome: ["city"], type: "choice", reward: { gold: 16 } },
                { id: "archive_lock", name: "Archive Lock", biome: ["city", "kingdom"], type: "pattern", reward: { gold: 22 } },
                { id: "sewer_dash", name: "Sewer Dash", biome: ["city", "dungeon"], type: "timing", reward: { gold: 19 } },
                { id: "lantern_trim", name: "Lantern Trim", biome: ["city", "cave"], type: "choice", reward: { items: ["lantern"] } },
                { id: "bridge_balance", name: "Bridge Balance", biome: ["bridge"], type: "timing", reward: { gold: 15 } },
                { id: "toll_guess", name: "Toll Guess", biome: ["bridge"], type: "gamble", reward: { gold: 26 } },
                { id: "wind_steps", name: "Wind Steps", biome: ["mountains"], type: "pattern", reward: { gold: 18 } },
                { id: "cliff_marks", name: "Cliff Marks", biome: ["mountains"], type: "choice", reward: { items: ["torch"] } },
                { id: "echo_count", name: "Echo Count", biome: ["cave"], type: "pattern", reward: { gold: 12 } },
                { id: "crystal_tap", name: "Crystal Tap", biome: ["cave"], type: "timing", reward: { gold: 17 } },
                { id: "torch_run", name: "Torch Run", biome: ["cave", "dungeon"], type: "timing", reward: { items: ["torch"] } },
                { id: "glyph_match", name: "Glyph Match", biome: ["dungeon", "kingdom"], type: "pattern", reward: { gold: 20 } },
                { id: "trap_wire", name: "Trap Wire", biome: ["dungeon"], type: "choice", reward: { gold: 18 } },
                { id: "relic_guess", name: "Relic Guess", biome: ["dungeon"], type: "gamble", reward: { gold: 28 } },
                { id: "crypt_prayer", name: "Crypt Prayer", biome: ["dungeon", "haunted house"], type: "choice", reward: { items: ["blessed torch"] } },
                { id: "ghost_pattern", name: "Ghost Pattern", biome: ["haunted house"], type: "pattern", reward: { gold: 21 } },
                { id: "candle_guard", name: "Candle Guard", biome: ["haunted house"], type: "timing", reward: { items: ["cloth"] } },
                { id: "portrait_riddle", name: "Portrait Riddle", biome: ["haunted house", "house"], type: "choice", reward: { gold: 13 } },
                { id: "pantry_sort", name: "Pantry Sort", biome: ["house", "town"], type: "pattern", reward: { items: ["small health potion"] } },
                { id: "courier_route", name: "Courier Route", biome: ["town", "kingdom"], type: "choice", reward: { gold: 16 } },
                { id: "banner_stitch", name: "Banner Stitch", biome: ["kingdom"], type: "timing", reward: { items: ["cloth"] } },
                { id: "royal_seal", name: "Royal Seal", biome: ["kingdom"], type: "pattern", reward: { gold: 25 } },
                { id: "kitchen_flare", name: "Kitchen Flare", biome: ["city", "town", "kingdom"], type: "timing", reward: { items: ["raw meat"] } },
                { id: "stable_feed", name: "Stable Feed", biome: ["town", "kingdom"], type: "choice", reward: { gold: 11 } },
                { id: "mall_pitch", name: "Mall Pitch", biome: ["shop", "city"], type: "choice", reward: { gold: 18 } },
                { id: "boutique_pick", name: "Boutique Pick", biome: ["shop"], type: "pattern", reward: { items: ["cloth"] } },
                { id: "vendor_spin", name: "Vendor Spin", biome: ["shop", "town"], type: "gamble", reward: { gold: 32 } },
                { id: "warehouse_stack", name: "Warehouse Stack", biome: ["city", "town"], type: "timing", reward: { gold: 17 } },
                { id: "guard_shift", name: "Guard Shift", biome: ["kingdom", "city"], type: "choice", reward: { gold: 19 } },
                { id: "lost_satchel", name: "Lost Satchel", biome: ["forest", "city", "town"], type: "choice", reward: { gold: 14, items: ["bandage"] } },
                { id: "coin_flip", name: "Coin Flip", biome: ["town", "bridge"], type: "gamble", reward: { gold: 18 } },
                { id: "fletcher_line", name: "Fletcher Line", biome: ["forest", "town"], type: "timing", reward: { items: ["feather"] } },
                { id: "bowyer_string", name: "Bowyer String", biome: ["forest", "town"], type: "choice", reward: { items: ["bow"] } },
                { id: "beast_track", name: "Beast Track", biome: ["forest", "mountains"], type: "pattern", reward: { items: ["hide"] } },
                { id: "altar_light", name: "Altar Light", biome: ["kingdom", "dungeon"], type: "timing", reward: { items: ["blessed torch"] } },
                { id: "scribe_copy", name: "Scribe Copy", biome: ["city", "kingdom"], type: "pattern", reward: { gold: 16 } },
                { id: "furnace_draw", name: "Furnace Draw", biome: ["mountains", "town"], type: "timing", reward: { items: ["bone shard"] } },
                { id: "camp_guess", name: "Camp Guess", biome: ["forest", "bridge"], type: "gamble", reward: { gold: 20 } }
            ];
        }

        // Finishes subsystem startup.
        // The current implementation is mostly data-driven, so this mainly
        // exists as a lifecycle hook for consistency with other extension systems.
        init() {
            this.log("MinigameSystem initialized");
        }

        // ACTIVITY DISCOVERY
        // -----------------------------------
        // These helpers decide which activities fit the current room and whether
        // the UI should advertise them to the player.

        // Extracts biome-like tags from a location for activity matching.
        getBiomeTags(location) {
            const tags = [];
            if (!location) return tags;
            if (location.biome) tags.push(String(location.biome).toLowerCase());
            if (location.portalType) tags.push(String(location.portalType).toLowerCase());
            if (location.name && location.name.toLowerCase().indexOf("mall") !== -1) tags.push("shop");
            if (location.isShop) tags.push("shop");
            return tags;
        }

        // Filters the full activity registry down to what fits one location.
        // Keeps side activities grounded in the room theme instead of feeling randomly air-dropped in.
        getAvailableGamesForLocation(location) {
            const tags = this.getBiomeTags(location);
            return this.games.filter((game) => game.biome.some((tag) => tags.indexOf(tag) !== -1)).slice(0, 6);
        }

        // Checks whether the location has any playable activities at all.
        hasActivitiesAtLocation(location) {
            return this.getAvailableGamesForLocation(location).length > 0;
        }

        // Resolves the outer minigame modal container from the DOM.
        getContainer() {
            return document.getElementById("minigame-container");
        }

        // Resolves the inner minigame content mount point from the DOM.
        getContent() {
            return document.getElementById("minigame-content");
        }

        // HUB AND GAME SELECTION
        // -----------------------------------
        // The hub gives the player a readable menu of local activities before
        // they commit to a specific minigame.

        // Opens the activity hub for the current room.
        // Called by the `play` command or quick button.
        // Inputs:
        // - None.
        // Returns:
        // - Nothing.
        // Why it is designed this way:
        // - A shared hub lets one location host multiple activities without
        //   making the player memorize every possible event name.
        openHub() {
            const world = gameState.getCurrentWorld();
            const location = world[gameState.currentLocation];
            const activities = this.getAvailableGamesForLocation(location);

            if (!activities.length) {
                if (window.main) main.addMessage("There are no local activities here right now.");
                return;
            }

            const container = this.getContainer();
            const content = this.getContent();
            if (!container || !content) return;

            gameState.minigameActive = true;
            content.innerHTML = '<div class="minigame-panel"><h3>Local Activities</h3><p>Select an event available at this location.</p><div class="minigame-list"></div></div>';
            const list = content.querySelector(".minigame-list");

            activities.forEach((game) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "quick-btn";
                button.style.display = "block";
                button.style.width = "100%";
                button.style.marginBottom = "8px";
                button.textContent = game.name + " [" + game.type + "]";
                button.addEventListener("click", () => this.startMinigame(game.id));
                list.appendChild(button);
            });

            container.style.display = "flex";
        }

        // Supports typed `play <name>` commands by fuzzy-matching visible activities.
        // Helpful when the player remembers "it was something with mushrooms" and not the exact title.
        playByName(name) {
            const world = gameState.getCurrentWorld();
            const location = world[gameState.currentLocation];
            const match = this.getAvailableGamesForLocation(location).find((game) => game.name.toLowerCase().indexOf(name.toLowerCase()) !== -1);
            if (!match) {
                if (window.main) main.addMessage("That activity is not available here.");
                return;
            }
            this.startMinigame(match.id);
        }

        // Starts one specific minigame by routing it to the correct renderer.
        startMinigame(gameId) {
            const game = this.games.find((entry) => entry.id === gameId);
            const content = this.getContent();
            if (!game || !content) return;

            this.activeGame = game;
            gameState.minigameActive = true;

            if (game.type === "timing") {
                this.renderTimingGame(game);
            } else if (game.type === "pattern") {
                this.renderPatternGame(game);
            } else if (game.type === "gamble") {
                this.renderGambleGame(game);
            } else {
                this.renderChoiceGame(game);
            }
        }

        // MINIGAME TYPES
        // -----------------------------------
        // Each renderer produces a different tiny gameplay pattern while still
        // sharing the same reward and cleanup flow.

        // Renders a timing-based minigame.
        // The player must stop a moving marker within a target region.
        // Simple on purpose: it adds variety without turning the whole game into an arcade cabinet.
        renderTimingGame(game) {
            const content = this.getContent();
            const target = 40 + Math.floor(Math.random() * 30);
            content.innerHTML = '<div class="minigame-panel"><h3>' + game.name + '</h3><p>Stop the moving marker near the center band.</p><div style="height:14px;background:#1b2838;border-radius:999px;overflow:hidden;margin:16px 0;position:relative"><div id="mg-zone" style="position:absolute;left:' + target + '%;width:12%;top:0;bottom:0;background:rgba(78,191,132,.55)"></div><div id="mg-marker" style="position:absolute;left:0;width:10px;top:-3px;bottom:-3px;background:#f4d690;border-radius:6px"></div></div><button id="mg-stop" class="quick-btn">Stop</button></div>';

            let progress = 0;
            let direction = 1;
            const marker = document.getElementById("mg-marker");
            const timer = setInterval(() => {
                progress += direction * 2.1;
                if (progress >= 100) {
                    progress = 100;
                    direction = -1;
                }
                if (progress <= 0) {
                    progress = 0;
                    direction = 1;
                }
                if (marker) marker.style.left = progress + "%";
            }, 30);

            document.getElementById("mg-stop").addEventListener("click", () => {
                clearInterval(timer);
                const success = progress >= target && progress <= target + 12;
                this.finishGame(success, game, success ? "Clean hit." : "You missed the rhythm.");
            });
        }

        // Renders a pattern-memory minigame.
        renderPatternGame(game) {
            const content = this.getContent();
            const sequence = ["North", "East", "South", "West"].sort(() => Math.random() - 0.5).slice(0, 3);
            content.innerHTML = '<div class="minigame-panel"><h3>' + game.name + '</h3><p>Repeat this sequence: <strong>' + sequence.join(" -> ") + '</strong></p><div id="mg-pattern-buttons"></div></div>';
            const holder = document.getElementById("mg-pattern-buttons");
            const picked = [];

            ["North", "East", "South", "West"].forEach((option) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "quick-btn";
                button.style.margin = "4px";
                button.textContent = option;
                button.addEventListener("click", () => {
                    picked.push(option);
                    if (picked.length === sequence.length) {
                        const success = picked.join("|") === sequence.join("|");
                        this.finishGame(success, game, success ? "Pattern solved." : "The sequence slips away.");
                    }
                });
                holder.appendChild(button);
            });
        }

        // Renders a gamble minigame where risk changes the odds and reward.
        // Mildly evil, but mathematically honest.
        renderGambleGame(game) {
            const content = this.getContent();
            content.innerHTML = '<div class="minigame-panel"><h3>' + game.name + '</h3><p>Choose a wager. High risk gives a bigger return.</p><div id="mg-gamble-buttons"></div></div>';
            const holder = document.getElementById("mg-gamble-buttons");

            [5, 10, 20].forEach((bet) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "quick-btn";
                button.style.margin = "4px";
                button.textContent = "Bet " + bet + "g";
                button.disabled = gameState.gold < bet;
                button.addEventListener("click", () => {
                    gameState.gold -= bet;
                    const success = Math.random() < (bet === 20 ? 0.35 : bet === 10 ? 0.5 : 0.65);
                    const reward = Object.assign({}, game.reward || {});
                    if (success) {
                        reward.gold = Math.max(reward.gold || 0, bet * 2);
                    }
                    this.finishGame(success, Object.assign({}, game, { reward: reward }), success ? "Fortune favors you." : "The table takes your wager.", !success);
                });
                holder.appendChild(button);
            });
        }

        // Renders a choice-based minigame where each approach has a different success rate.
        renderChoiceGame(game) {
            const content = this.getContent();
            const outcomes = [
                { label: "Careful", success: 0.8 },
                { label: "Balanced", success: 0.6 },
                { label: "Aggressive", success: 0.45 }
            ];

            content.innerHTML = '<div class="minigame-panel"><h3>' + game.name + '</h3><p>Choose how you want to approach the task.</p><div id="mg-choice-buttons"></div></div>';
            const holder = document.getElementById("mg-choice-buttons");

            outcomes.forEach((option) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "quick-btn";
                button.style.display = "block";
                button.style.margin = "6px 0";
                button.textContent = option.label;
                button.addEventListener("click", () => {
                    const success = Math.random() < option.success;
                    this.finishGame(success, game, success ? option.label + " pays off." : option.label + " comes up short.");
                });
                holder.appendChild(button);
            });
        }

        // REWARDS AND CLEANUP
        // -----------------------------------
        // These methods return the player to the main game loop and make sure
        // any earned gold or items are reflected in the real game state.

        // Applies rewards and produces readable reward summary text.
        rewardPlayer(reward) {
            if (!reward) return [];
            const lines = [];

            if (reward.gold) {
                gameState.gold += reward.gold;
                lines.push("+" + reward.gold + " gold");
            }

            (reward.items || []).forEach((item) => {
                if (gameState.addToInventory) {
                    gameState.addToInventory(item);
                } else {
                    gameState.inventory.push(item);
                }
                lines.push("+" + item);
            });

            return lines;
        }

        // Resolves the current minigame and shows the result screen.
        // Rewards go straight into the real game state so these side activities
        // feel connected instead of living in a weird parallel universe.
        finishGame(success, game, message, keepLossOnly) {
            const content = this.getContent();
            if (!content) return;

            let rewards = [];
            if (success && !keepLossOnly) {
                rewards = this.rewardPlayer(game.reward);
            }

            if (window.uiController) uiController.updateGameDisplay();
            if (window.main) main.addMessage(game.name + ": " + message + (rewards.length ? " Rewards: " + rewards.join(", ") + "." : ""));

            content.innerHTML = '<div class="minigame-panel"><h3>' + game.name + '</h3><p>' + message + '</p><p>' + (rewards.length ? "Rewards earned: " + rewards.join(", ") : "No rewards earned this time.") + '</p><button id="mg-back" class="quick-btn">Back To Activities</button><button id="mg-close" class="quick-btn" style="margin-left:8px">Close</button></div>';
            document.getElementById("mg-back").addEventListener("click", () => this.openHub());
            document.getElementById("mg-close").addEventListener("click", () => this.closeMinigame());
        }

        // Closes the minigame modal and hands control back to exploration mode.
        closeMinigame() {
            this.activeGame = null;
            gameState.minigameActive = false;
            const container = this.getContainer();
            if (container) container.style.display = "none";
            if (window.uiController) uiController.updateGameDisplay();
        }
    }

    window.MinigameSystem = MinigameSystem;
})();
