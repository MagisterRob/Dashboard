// WorldEvolutionSystem.js
/*

Purpose:
- Applies runtime patches that expand the base game with area progression,
  shop support, combat fixes, map tweaks, and minigame hooks.

Key Systems:
- Quick action button injection
- Extra item/enemy/journal data
- Map visibility and camera patching
- Bootstrapping extension systems like AreaManager and ShopSystem

Flow:
- Waits for the core singletons to exist
- Patches their behavior in place
- Initializes the supporting extension modules

Design Notes:
- This file is intentionally invasive. It patches a bigger feature set onto the
  original architecture without asking the whole project to reincarnate first.
========================================
*/
(function () {
    class WorldEvolutionSystem {
        // Track whether the extension layer has already patched the live game.
        // Double-patching this file would be a quick route to chaos.
        constructor() {
            this.patched = false;
            this.debug = true;
            this.areaManager = null;
            this.shopSystem = null;
            this.combatStabilizer = null;
            this.minigameSystem = null;
        }

        // Centralized debug logger so all extension subsystems use the same prefix.
        log(msg, data) {
            if (!this.debug) return;
            if (typeof data === "undefined") console.log("[WES] " + msg);
            else console.log("[WES] " + msg, data);
        }

        // Patch the base game once all required singleton systems are available.
        // This waits until the singletons exist because patching `undefined`
        // tends to produce very short debugging sessions followed by very long ones.
        init() {
            if (this.patched) return;
            if (!window.gameState || !window.mapSystem || !window.main || !window.combatSystem || !window.uiController || !window.inventorySystem) return;

            this.injectQuickButtons();
            this.ensureState();
            this.extendData();
            this.patchMapAndCamera();
            this.patchIconsDropsJournal();

            this.areaManager = new window.AreaManager(this);
            this.areaManager.patchGeneration();
            this.areaManager.patchMovementAndProgression();
            this.areaManager.migrateWorld();

            this.shopSystem = new window.ShopSystem(this);
            this.shopSystem.init();

            this.combatStabilizer = new window.CombatStabilizer(this);
            this.combatStabilizer.init();

            if (window.MinigameSystem) {
                this.minigameSystem = new window.MinigameSystem(this);
                this.minigameSystem.init();
                window.minigameSystem = this.minigameSystem;
            }

            this.updateQuickButtons();
            if (uiController && uiController.updateGameDisplay) uiController.updateGameDisplay();
            if (mapSystem && mapSystem.updateMapDisplay) mapSystem.updateMapDisplay();

            this.patched = true;
            this.log("Initialized");
        }

        // Add extra quick-action buttons for features introduced by the extension layer.
        // These stay hidden until context makes them useful, which keeps the UI from shouting at the player all at once.
        injectQuickButtons() {
            const qa = document.getElementById("quick-actions");
            if (!qa) return;

            const ensureBtn = (id, text, handler) => {
                if (document.getElementById(id)) return;
                const b = document.createElement("button");
                b.id = id;
                b.className = "quick-btn";
                b.style.display = "none";
                b.textContent = text;
                b.addEventListener("click", handler);
                qa.appendChild(b);
            };

            ensureBtn("quick-enter-btn", "Enter", () => main.processCommand("enter"));
            ensureBtn("quick-exit-btn", "Exit", () => main.processCommand("exit"));
            ensureBtn("quick-shop-btn", "Shop", () => main.processCommand("shop"));
            ensureBtn("quick-play-btn", "Play", () => main.processCommand("play"));
        }

        // Create extension-owned state buckets if older saves do not contain them yet.
        // Saves age. This keeps old data from acting like it understands new features when it very much does not.
        ensureState() {
            if (!gameState.areaState) gameState.areaState = { currentWorldArea: "start", currentInternalArea: null, progressionUnlocked: {}, portalStack: [], nestedPortalDepth: 0 };
            if (!gameState.shopState) gameState.shopState = { open: false, activeShopId: null };
            if (!gameState.cameraState) gameState.cameraState = { clampEnabled: true };
            if (!gameState.combatState) gameState.combatState = { playerTurn: true, turnLock: false, indicator: "Player Turn" };
        }

        // Show or hide contextual quick buttons based on the current room and mode.
        updateQuickButtons() {
            const e = document.getElementById("quick-enter-btn");
            const x = document.getElementById("quick-exit-btn");
            const s = document.getElementById("quick-shop-btn");
            const p = document.getElementById("quick-play-btn");
            if (!e || !x || !s || !p) return;

            const world = gameState.getCurrentWorld();
            const loc = world[gameState.currentLocation];
            if (!loc) {
                e.style.display = "none";
                x.style.display = "none";
                s.style.display = "none";
                p.style.display = "none";
                return;
            }

            e.style.display = (loc.subArea && !loc.locked) ? "inline-block" : "none";
            x.style.display = (gameState.currentSubArea && (loc.hasPortalExit || loc.isPortalEntrance || loc.isProgressExit)) ? "inline-block" : "none";
            s.style.display = loc.isShop ? "inline-block" : "none";
            p.style.display = (this.minigameSystem && this.minigameSystem.hasActivitiesAtLocation(loc)) ? "inline-block" : "none";
        }

        // Central icon table used to repair or extend item emoji coverage.
        // Because apparently emoji consistency is a luxury item.
        icons() {
            return {
                "raw meat": "\u{1F969}", "small meat": "\u{1F356}", "feather": "\u{1FAB6}", "cloth": "\u{1F9F5}",
                "bone shard": "\u{1F9B4}", "hide": "\u{1F9F4}", "bow": "\u{1F3F9}", "dagger": "\u{1F5E1}\u{FE0F}",
                "rusty sword": "\u{1F5E1}\u{FE0F}", "health potion": "\u{1F9EA}", "small health potion": "\u{1F9EA}",
                "large health potion": "\u{1F9EA}", "antidote": "\u{1F48A}", "lantern": "\u{1F3EE}", "torch": "\u{1F526}",
                "leather armor": "\u{1F9E5}", "chainmail armor": "\u{1F6E1}\u{FE0F}", "blessed torch": "\u{1F525}"
            };
        }

        // Inject extra items, recipes, resistances, and lore into the base data model.
        // This is where the extension layer quietly teaches the original data set some new tricks.
        extendData() {
            const gs = gameState;
            const iconMap = this.icons();
            const ensure = (k, d) => {
                if (!gs.items[k]) gs.items[k] = d;
                if (!gs.items[k].icon && iconMap[k]) gs.items[k].icon = iconMap[k];
            };

            ensure("leather armor", { name:"Leather Armor", type:"armor", slot:"armor", description:"Flexible armor that reduces bleed damage.", value:40, rarity:"common", stats:{defense:4}, resistances:{bleed:0.4,poison:0.15}, downsides:{speed:-0.05} });
            ensure("chainmail armor", { name:"Chainmail Armor", type:"armor", slot:"armor", description:"Heavy armor with strong cut resistance.", value:95, rarity:"uncommon", stats:{defense:8}, resistances:{bleed:0.25,burn:0.1}, downsides:{speed:-0.12} });
            ensure("lantern", { name:"Lantern", type:"utility", slot:"lightSource", description:"Portable light source for caves.", value:30, rarity:"common", lightValue:2, resistances:{fear:0.2} });
            ensure("blessed torch", { name:"Blessed Torch", type:"utility", slot:"lightSource", description:"Holy flame that repels corruption.", value:80, rarity:"rare", lightValue:3, resistances:{fear:0.25,corruption:0.2} });

            if (gs.items.bow) {
                gs.items.bow.bonusVs = { beast: 1.35 };
                gs.items.bow.description = "A hunting bow that deals bonus damage vs animals.";
                if (!gs.items.bow.icon) gs.items.bow.icon = iconMap.bow;
            }

            if (!gs.craftingRecipes.feather_hunting_bow) {
                gs.craftingRecipes.feather_hunting_bow = {
                    name:"Feather Hunting Bow",
                    description:"Craft a bow with bonus damage vs animals.",
                    ingredients:[{item:"feather",quantity:3},{item:"hide",quantity:1},{item:"cloth",quantity:1}],
                    result:"bow",
                    difficulty:"easy",
                    category:"weapons",
                    campfireRequired:false
                };
            }

            if (!gs.enemyLore) gs.enemyLore = {};
            gs.enemyLore.deer = { habitat:"deep woods and meadow edges", drops:[{item:"raw meat",chance:70},{item:"hide",chance:50}] };
            gs.enemyLore.bird = { habitat:"forest canopies and open road trees", drops:[{item:"feather",chance:70},{item:"small meat",chance:35}] };

            gs.getLightLevel = function () {
                const equipped = this.equippedItems && this.equippedItems.lightSource;
                if (equipped && this.items[equipped]) return this.items[equipped].lightValue || 1;
                if (this.inventory && this.inventory.indexOf("torch") !== -1) return 1;
                return 0;
            };

            gs.getEquipmentModifiers = function () {
                const r = { attack:0, defense:0, resistances:{}, speedPenalty:0, light:0 };
                const slots = this.equippedItems || {};
                Object.keys(slots).forEach((s) => {
                    const id = slots[s];
                    const it = id && this.items[id];
                    if (!it) return;
                    if (it.stats) {
                        r.attack += it.stats.attack || 0;
                        r.defense += it.stats.defense || 0;
                    }
                    if (it.resistances) {
                        Object.keys(it.resistances).forEach((k) => {
                            r.resistances[k] = (r.resistances[k] || 0) + it.resistances[k];
                        });
                    }
                    if (it.downsides && it.downsides.speed) r.speedPenalty += it.downsides.speed;
                    r.light += it.lightValue || 0;
                });
                return r;
            };

            gs.getResistance = function (effectName) {
                const m = this.getEquipmentModifiers ? this.getEquipmentModifiers() : { resistances:{} };
                return Math.max(0, Math.min(0.85, m.resistances[effectName] || 0));
            };

            this.log("Data extensions applied");
        }

        // Build the restricted visibility context used by the patched hardcore map.
        hardcoreContext(world) {
            const visited = new Set();
            const seenLocked = new Set();
            const inSub = gameState.currentSubArea && gameState.subAreas[gameState.currentSubArea];
            const visitedList = inSub ? (gameState.subAreas[gameState.currentSubArea].visitedLocations || []) : (gameState.visitedLocations || []);
            visitedList.forEach((id) => { if (world[id]) visited.add(id); });
            if (world[gameState.currentLocation]) visited.add(gameState.currentLocation);
            const sl = gameState.seenLockedLocations;
            if (sl instanceof Set) sl.forEach((id) => { if (world[id]) seenLocked.add(id); });
            else if (Array.isArray(sl)) sl.forEach((id) => { if (world[id]) seenLocked.add(id); });
            return { visited: visited, seenLocked: seenLocked, current: gameState.currentLocation };
        }

        // Calculate world bounds so camera movement can be clamped inside meaningful space.
        bounds(world, scale) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            Object.keys(world).forEach((id) => {
                const c = world[id] && world[id].coordinates;
                if (!c) return;
                minX = Math.min(minX, c.x * scale);
                maxX = Math.max(maxX, c.x * scale);
                minY = Math.min(minY, c.y * scale);
                maxY = Math.max(maxY, c.y * scale);
            });
            if (!isFinite(minX)) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
            return { minX:minX, maxX:maxX, minY:minY, maxY:maxY };
        }

        // Prevent the expanded map camera from panning into empty off-map space.
        // Empty space is not content, no matter how dramatically the player drags toward it.
        clampCamera() {
            const container = document.getElementById("map-container");
            if (!container) return;
            const world = gameState.getCurrentWorld();
            const b = this.bounds(world, 60);
            const rect = container.getBoundingClientRect();
            const contentW = (b.maxX - b.minX) * gameState.mapScale + 50;
            const contentH = (b.maxY - b.minY) * gameState.mapScale + 50;
            const pad = 120;
            const minX = rect.width - contentW - pad;
            const maxX = -b.minX * gameState.mapScale + pad;
            const minY = rect.height - contentH - pad;
            const maxY = -b.minY * gameState.mapScale + pad;
            if (minX > maxX) mapSystem.mapOffset.x = (minX + maxX) / 2;
            else mapSystem.mapOffset.x = Math.max(minX, Math.min(maxX, mapSystem.mapOffset.x));
            if (minY > maxY) mapSystem.mapOffset.y = (minY + maxY) / 2;
            else mapSystem.mapOffset.y = Math.max(minY, Math.min(maxY, mapSystem.mapOffset.y));
        }

        // Override parts of MapSystem to support the evolved visibility and camera rules.
        // The original map was functional; this patch is about making it feel more intentional.
        patchMapAndCamera() {
            mapSystem.getMapVisibilityContext = (world) => {
                if (gameState.difficulty !== "hardcore") {
                    const visited = new Set(gameState.visitedLocations || []);
                    if (gameState.currentLocation) visited.add(gameState.currentLocation);
                    const seen = new Set(gameState.seenLockedLocations || []);
                    const neighbors = new Set();
                    visited.forEach((id) => {
                        const l = world[id];
                        if (!l || !l.exits) return;
                        Object.values(l.exits).forEach((to) => { if (world[to]) neighbors.add(to); });
                    });
                    return { visitedSet:visited, seenLockedSet:seen, neighborSet:neighbors, hardcoreVisibleSet:new Set([].concat(Array.from(visited), Array.from(neighbors), Array.from(seen))) };
                }
                const c = this.hardcoreContext(world);
                return { visitedSet:c.visited, seenLockedSet:c.seenLocked, neighborSet:new Set(), hardcoreVisibleSet:new Set([].concat(Array.from(c.visited), Array.from(c.seenLocked))), currentOnlyPaths:true, currentLocationId:c.current };
            };

            mapSystem.createMapConnections = (container, visibility) => {
                const world = gameState.getCurrentWorld();
                const scale = 60;
                if (gameState.difficulty === "hardcore") {
                    const fromId = visibility.currentLocationId || gameState.currentLocation;
                    const from = world[fromId];
                    if (!from || !from.exits) return;
                    const fx = from.coordinates.x * scale + 25;
                    const fy = from.coordinates.y * scale + 25;
                    Object.keys(from.exits).forEach((dir) => {
                        const toId = from.exits[dir];
                        const to = world[toId];
                        if (!to) return;
                        const tx = to.coordinates.x * scale + 25;
                        const ty = to.coordinates.y * scale + 25;
                        const dx = tx - fx;
                        const dy = ty - fy;
                        if (dx !== 0 && dy !== 0) return;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
                        const line = document.createElement("div");
                        line.className = "map-connection";
                        line.style.opacity = visibility.visitedSet.has(toId) ? "0.95" : "0.35";
                        line.style.width = dist + "px";
                        line.style.left = fx + "px";
                        line.style.top = fy + "px";
                        line.style.transform = "rotate(" + ang + "deg)";
                        container.appendChild(line);
                    });
                    return;
                }

                Object.keys(world).forEach((id) => {
                    const l = world[id];
                    if (!l || !l.exits) return;
                    const fx = l.coordinates.x * scale + 25;
                    const fy = l.coordinates.y * scale + 25;
                    Object.keys(l.exits).forEach((d) => {
                        const toId = l.exits[d];
                        const to = world[toId];
                        if (!to) return;
                        if (!visibility.hardcoreVisibleSet.has(id) || !visibility.hardcoreVisibleSet.has(toId)) return;
                        const tx = to.coordinates.x * scale + 25;
                        const ty = to.coordinates.y * scale + 25;
                        const dx = tx - fx;
                        const dy = ty - fy;
                        if (dx !== 0 && dy !== 0) return;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
                        const line = document.createElement("div");
                        line.className = "map-connection";
                        line.style.opacity = (visibility.visitedSet.has(id) && visibility.visitedSet.has(toId)) ? "0.95" : "0.5";
                        line.style.width = dist + "px";
                        line.style.left = fx + "px";
                        line.style.top = fy + "px";
                        line.style.transform = "rotate(" + ang + "deg)";
                        container.appendChild(line);
                    });
                });
            };

            mapSystem.updateMapContainer = (container) => {
                if (!container) return;
                container.innerHTML = "";
                const world = gameState.getCurrentWorld();
                const v = mapSystem.getMapVisibilityContext(world);
                const hc = gameState.difficulty === "hardcore";
                mapSystem.createMapConnections(container, v);

                Object.keys(world).forEach((id) => {
                    const l = world[id];
                    if (!l || !l.coordinates) return;
                    const visited = v.visitedSet.has(id);
                    const seenLock = v.seenLockedSet.has(id);
                    const show = hc ? (visited || seenLock) : true;
                    if (!show) return;

                    const c = document.createElement("div");
                    c.className = "map-cell";
                    c.setAttribute("data-location", id);
                    c.style.left = Math.round(l.coordinates.x * 60) + "px";
                    c.style.top = Math.round(l.coordinates.y * 60) + "px";

                    if (hc && !visited) {
                        c.classList.add("hidden", "unvisited");
                        c.style.opacity = "0.18";
                        c.innerHTML = "<span class='abbr'>?</span>";
                    } else if (visited) {
                        c.classList.add("visited");
                        c.innerHTML = "<span class='abbr'>" + l.short + "</span><span class='full-name'>" + l.name + "</span>";
                    } else {
                        c.classList.add("unvisited");
                        c.innerHTML = "<span class='abbr'>?</span>";
                    }

                    if (id === gameState.currentLocation) {
                        c.classList.add("current");
                        c.style.opacity = "1";
                    }

                    if (l.locked) {
                        c.classList.add("locked");
                        if (!visited) c.innerHTML = "<span class='abbr'>?</span><span class='lock-icon'>&#128274;</span>";
                        else c.innerHTML = "<span class='abbr'>" + l.short + "</span><span class='full-name'>" + l.name + "</span><span class='lock-icon'>&#128274;</span>";
                    }

                    if (gameState.inputMode === "both") {
                        c.addEventListener("click", () => {
                            if (mapSystem.mapExploreMode) {
                                mapSystem.centerMapOnLocation(id);
                                return;
                            }
                            const cur = world[gameState.currentLocation];
                            if (!cur || !cur.exits) return;
                            for (const d in cur.exits) {
                                if (cur.exits[d] === id) {
                                    main.processCommand("go " + d);
                                    break;
                                }
                            }
                        });
                    }
                    container.appendChild(c);
                });
            };

            const origTransform = mapSystem.updateMapTransform.bind(mapSystem);
            mapSystem.updateMapTransform = () => {
                this.clampCamera();
                origTransform();
            };

            mapSystem.handleMapZoom = (e) => {
                e.preventDefault();
                if (!mapSystem.mapExploreMode) return;
                const zin = e.deltaY < 0;
                const step = zin ? mapSystem.scaleStep : -mapSystem.scaleStep;
                const ns = Math.max(mapSystem.minScale, Math.min(mapSystem.maxScale, gameState.mapScale + step));
                if (ns === gameState.mapScale) return;
                const cont = document.getElementById("map-container");
                if (!cont) return;
                const r = cont.getBoundingClientRect();
                const mx = e.clientX - r.left;
                const my = e.clientY - r.top;
                const cx = (mx - mapSystem.mapOffset.x) / gameState.mapScale;
                const cy = (my - mapSystem.mapOffset.y) / gameState.mapScale;
                gameState.mapScale = ns;
                mapSystem.mapOffset.x = mx - cx * gameState.mapScale;
                mapSystem.mapOffset.y = my - cy * gameState.mapScale;
                this.clampCamera();
                origTransform();
                this.log("Zoom", { scale: gameState.mapScale });
            };

            mapSystem.resetMapView = () => {
                mapSystem.centerMapOnLocation(gameState.currentLocation);
                this.clampCamera();
                origTransform();
                this.log("Refresh snapped to player", { loc: gameState.currentLocation });
            };

            this.log("Map and camera patched");
        }

        // Patch icon lookup, enemy drops, and the journey book with expanded data.
        // Mostly quality-of-life, plus a little "please stop dropping nonsense loot."
        patchIconsDropsJournal() {
            const icons = this.icons();
            gameState.getItemIcon = (name) => {
                const d = gameState.items[name];
                if (icons[name]) return icons[name];
                if (d && d.icon && d.icon !== "??" && !d.icon.includes("Ã") && !d.icon.includes("ð") && !d.icon.includes("â") && !d.icon.includes("\uFFFD")) return d.icon;
                return "\u{1F4E6}";
            };

            const baseLoot = gameState.getEnemyLoot.bind(gameState);
            gameState.getEnemyLoot = (enemyType) => {
                const drops = [];
                const add = (i) => { if (i && drops.indexOf(i) === -1) drops.push(i); };
                const t = (enemyType || "").toLowerCase();
                if (t.indexOf("deer") !== -1) {
                    if (Math.random() < 0.70) add("raw meat");
                    if (Math.random() < 0.50) add("hide");
                    return drops;
                }
                if (t.indexOf("bird") !== -1) {
                    if (Math.random() < 0.70) add("feather");
                    if (Math.random() < 0.35) add("small meat");
                    return drops;
                }
                (baseLoot(enemyType) || []).forEach(add);
                return drops;
            };

            uiController.updateJourneyBook = () => {
                const g = document.getElementById("journey-grid");
                if (!g) return;
                g.innerHTML = "";
                Object.keys(gameState.enemies).forEach((k) => {
                    const e = gameState.enemies[k];
                    const enc = gameState.isEnemyEncountered(k);
                    const def = gameState.isEnemyDefeated(k);
                    const d = document.createElement("div");
                    d.className = "journey-entry";
                    if (!enc) d.classList.add("unknown");
                    if (def) {
                        d.classList.add("defeated", "clickable");
                        d.addEventListener("click", () => uiController.showJourneyDetail(k));
                    }
                    d.innerHTML = "<div class='journey-icon'><span class='enemy-icon'>" + e.icon + "</span><span class='enemy-unknown'>?</span><span class='enemy-defeated'>&#10060;</span></div><div class='journey-name'>" + (enc ? e.name : "Unknown") + "</div>";
                    g.appendChild(d);
                });
            };

            uiController.showJourneyDetail = (k) => {
                if (!gameState.isEnemyDefeated(k)) return;
                const e = gameState.enemies[k];
                if (!e) return;
                const box = document.getElementById("journey-detail");
                const n = document.getElementById("journey-detail-name");
                const d = document.getElementById("journey-detail-description");
                const l = document.getElementById("journey-drops-list");
                if (!box || !n || !d || !l) return;
                const lore = gameState.enemyLore[k] || {};
                const hab = lore.habitat || (e.biome ? e.biome.join(", ") : "unknown habitat");
                n.textContent = e.name;
                d.textContent = e.description + " Habitat: " + hab + ".";
                l.innerHTML = "";
                const drops = (lore.drops && lore.drops.length) ? lore.drops.map((x) => x.item + " (" + x.chance + "%)") : (e.loot && e.loot.length ? e.loot : ["No drop data"]);
                drops.forEach((txt) => {
                    const r = document.createElement("div");
                    r.className = "journey-drop-item";
                    r.textContent = txt;
                    l.appendChild(r);
                });
                box.style.display = "block";
            };

            this.log("Icons, drops, journal patched");
        }
    }

    window.worldEvolutionSystem = new WorldEvolutionSystem();
    const boot = () => window.worldEvolutionSystem.init();
    window.addEventListener("DOMContentLoaded", () => setTimeout(boot, 0));
    setTimeout(boot, 50);
})();
