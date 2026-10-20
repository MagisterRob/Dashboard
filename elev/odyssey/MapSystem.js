// MapSystem.js - Complete implementation with sub-areas, Hardcore mode visibility, and structured grid
/*
========================================
FILE OVERVIEW
----------------------------------------
Purpose:
- Generates and renders the world map, including the main overworld and sub-areas.

Key Systems:
- World generation and dungeon generation
- Map pan/zoom controls
- Visibility rules for normal and hardcore mode
- Click-to-move integration with the main game loop

Flow:
- Builds the world data consumed by `gameState`
- Converts coordinates into DOM map cells and connection lines
- Keeps the map centered and synchronized with player movement

Design Notes:
- This file combines procedural generation with rendering because the map needs
  to understand both how the world is built and how it should look once the player starts poking at it.
========================================
*/
class MapSystem {
    constructor() {
        this.isMapDragging = false;
        this.lastPanX = 0;
        this.lastPanY = 0;
        this.mapOffset = { x: 0, y: 0 };
        this.mapScale = 1;
        this.isMapExpanded = false;
        this.mapExploreMode = false;
        this.exploreScale = 0.6;
        this.minScale = 0.5;
        this.maxScale = 3.0;
        this.scaleStep = 0.25;
        this.originalZoomButtons = null;
        this.originalRefreshButtons = null;
        this.currentMapTitle = "World Map";
    }
    
    // Initialize the map UI once the DOM is ready.
    initialize() {
        this.setupEventListeners();
        this.setupMapPanning();
        this.setupMapControls();
    }
    
    // Cache button markup so expanded mode can swap icons and later restore them.
    setupMapControls() {
        const expandBtn = document.getElementById('expand-map-btn');
        const resetBtn = document.getElementById('reset-view-btn');
        
        if (expandBtn && resetBtn) {
            this.originalZoomButtons = expandBtn.innerHTML;
            this.originalRefreshButtons = resetBtn.innerHTML;
        }
        
        const expandBtnMobile = document.getElementById('expand-map-btn-mobile');
        const resetBtnMobile = document.getElementById('reset-view-btn-mobile');
        
        if (expandBtnMobile && resetBtnMobile) {
            this.originalZoomButtonsMobile = expandBtnMobile.innerHTML;
            this.originalRefreshButtonsMobile = resetBtnMobile.innerHTML;
        }
    }
    
    // Attach click, wheel, touch, and keyboard listeners related to map interaction.
    setupEventListeners() {
        const expandBtn = document.getElementById('expand-map-btn');
        const resetBtn = document.getElementById('reset-view-btn');
        
        if (expandBtn) {
            expandBtn.addEventListener('click', () => this.toggleMapExpand());
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetMapView());
        }
        
        const expandBtnMobile = document.getElementById('expand-map-btn-mobile');
        const resetBtnMobile = document.getElementById('reset-view-btn-mobile');
        
        if (expandBtnMobile) {
            expandBtnMobile.addEventListener('click', () => this.toggleMapExpand());
        }
        if (resetBtnMobile) {
            resetBtnMobile.addEventListener('click', () => this.resetMapView());
        }
        
        const mapContainer = document.getElementById('map-container');
        if (mapContainer) {
            mapContainer.addEventListener('wheel', (e) => this.handleMapZoom(e));
        }
        
        this.setupTouchZoom();
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isMapExpanded) {
                this.toggleMapExpand();
            }
        });
    }
    
    // Register drag handlers for both mouse and touch panning.
    setupMapPanning() {
        const mapContainer = document.getElementById('map-container');
        const mapContent = document.getElementById('map-content');
        
        if (!mapContainer || !mapContent) return;
        
        mapContainer.addEventListener('mousedown', (e) => this.startMapDrag(e));
        mapContainer.addEventListener('mousemove', (e) => this.dragMap(e));
        mapContainer.addEventListener('mouseup', () => this.endMapDrag());
        mapContainer.addEventListener('mouseleave', () => this.endMapDrag());
        
        mapContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        mapContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        mapContainer.addEventListener('touchend', () => this.endMapDrag());
    }
    
    // Support pinch zoom while the map is in expanded exploration mode.
    // Tiny map, giant fingers, modern problems.
    setupTouchZoom() {
        let initialDistance = null;
        const mapContainer = document.getElementById('map-container');
        
        if (!mapContainer) return;
        
        mapContainer.addEventListener('touchstart', (e) => {
            if (!this.mapExploreMode) return;
            if (e.touches.length === 2) {
                initialDistance = this.getTouchDistance(e);
            }
        });
        
        mapContainer.addEventListener('touchmove', (e) => {
            if (!this.mapExploreMode) return;
            if (e.touches.length === 2 && initialDistance !== null) {
                e.preventDefault();
                const currentDistance = this.getTouchDistance(e);
                const scaleChange = currentDistance / initialDistance;
                
                const newScale = gameState.mapScale * scaleChange;
                this.setMapScale(Math.max(this.minScale, Math.min(this.maxScale, newScale)));
                
                initialDistance = currentDistance;
            }
        });
        
        mapContainer.addEventListener('touchend', () => {
            initialDistance = null;
        });
    }
    
    // Utility helper for pinch zoom calculations.
    getTouchDistance(e) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // Begin a drag gesture unless the player is interacting with a cell or control.
    startMapDrag(e) {
        if (!this.mapExploreMode) return;
        if (e.target.closest('.map-cell') || e.target.closest('.map-control-btn')) return;
        
        this.isMapDragging = true;
        const mapContainer = document.getElementById('map-container');
        
        if (e.type === 'touchstart') {
            this.lastPanX = e.touches[0].clientX;
            this.lastPanY = e.touches[0].clientY;
        } else {
            this.lastPanX = e.clientX;
            this.lastPanY = e.clientY;
        }
        
        mapContainer.style.cursor = 'grabbing';
        mapContainer.classList.add('dragging');
        e.preventDefault();
    }
    
    // Move the map viewport by the drag delta while preserving the current zoom.
    dragMap(e) {
        if (!this.isMapDragging) return;
        
        let clientX, clientY;
        
        if (e.type === 'touchmove') {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        const deltaX = clientX - this.lastPanX;
        const deltaY = clientY - this.lastPanY;
        
        this.mapOffset.x += deltaX;
        this.mapOffset.y += deltaY;
        
        this.updateMapTransform();
        
        this.lastPanX = clientX;
        this.lastPanY = clientY;
        e.preventDefault();
    }
    
    // End the current drag gesture and restore the default cursor.
    endMapDrag() {
        this.isMapDragging = false;
        const mapContainer = document.getElementById('map-container');
        if (mapContainer) {
            mapContainer.style.cursor = 'grab';
            mapContainer.classList.remove('dragging');
        }
    }
    
    // Single-touch start maps to the same drag behavior as mouse input.
    handleTouchStart(e) {
        if (e.touches.length === 1) {
            this.startMapDrag(e);
        }
    }
    
    // Single-touch movement also reuses the same drag logic.
    handleTouchMove(e) {
        if (e.touches.length === 1) {
            this.dragMap(e);
        }
    }
    
    // Mouse wheel zooms around the cursor so the player can inspect precise regions.
    handleMapZoom(e) {
        e.preventDefault();
        if (!this.mapExploreMode) return;
        
        const zoomIn = e.deltaY < 0;
        const scaleChange = zoomIn ? this.scaleStep : -this.scaleStep;
        const newScale = Math.max(this.minScale, Math.min(this.maxScale, gameState.mapScale + scaleChange));
        
        const mapContainer = document.getElementById('map-container');
        const rect = mapContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const contentX = (mouseX - this.mapOffset.x) / gameState.mapScale;
        const contentY = (mouseY - this.mapOffset.y) / gameState.mapScale;
        
        this.setMapScale(newScale);
        
        this.mapOffset.x = mouseX - contentX * gameState.mapScale;
        this.mapOffset.y = mouseY - contentY * gameState.mapScale;
        
        this.updateMapTransform();
    }
    
    // Update the shared zoom scale stored on `gameState`.
    setMapScale(newScale) {
        gameState.mapScale = newScale;
        this.updateMapTransform();
    }
    
    // Apply the current pan and zoom transform to the map content layer.
    updateMapTransform() {
        const mapContent = document.getElementById('map-content');
        if (mapContent) {
            mapContent.style.transform = `translate(${this.mapOffset.x}px, ${this.mapOffset.y}px) scale(${gameState.mapScale})`;
        }
    }
    
    // Toggle the fullscreen-style map exploration mode.
    // This is "inspect the world" mode, not "accidentally walk three rooms east" mode.
    toggleMapExpand() {
        const mapContainer = document.getElementById('map-container');
        const expandBtn = document.getElementById('expand-map-btn');
        const resetBtn = document.getElementById('reset-view-btn');
        const expandBtnMobile = document.getElementById('expand-map-btn-mobile');
        const resetBtnMobile = document.getElementById('reset-view-btn-mobile');
        
        this.mapExploreMode = !this.mapExploreMode;
        this.isMapExpanded = this.mapExploreMode;
        
        if (this.mapExploreMode) {
            mapContainer.classList.add('expanded');
            document.body.classList.add('map-expanded');
            
            if (expandBtn) expandBtn.innerHTML = '<i class="fas fa-compress-alt"></i>';
            if (expandBtnMobile) expandBtnMobile.innerHTML = '<i class="fas fa-compress-alt"></i>';
            if (resetBtn) resetBtn.style.display = 'block';
            if (resetBtnMobile) resetBtnMobile.style.display = 'block';
            
            setTimeout(() => {
                this.setMapScale(this.exploreScale);
                this.centerMapOnLocation(gameState.currentLocation);
            }, 100);
        } else {
            mapContainer.classList.remove('expanded');
            document.body.classList.remove('map-expanded');
            
            if (expandBtn) expandBtn.innerHTML = this.originalZoomButtons || '<i class="fas fa-expand-alt"></i>';
            if (expandBtnMobile) expandBtnMobile.innerHTML = this.originalZoomButtonsMobile || '<i class="fas fa-expand-alt"></i>';
            if (resetBtn) resetBtn.style.display = 'block';
            if (resetBtnMobile) resetBtnMobile.style.display = 'block';
            
            this.resetMapView();
        }
    }
    
    // Restore default zoom/pan and recenter the map on the player's current location.
    resetMapView() {
        this.mapOffset = { x: 0, y: 0 };
        gameState.mapScale = 1;
        this.mapExploreMode = false;
        this.isMapExpanded = false;
        const mapContainer = document.getElementById('map-container');
        if (mapContainer) {
            mapContainer.classList.remove('expanded');
        }
        document.body.classList.remove('map-expanded');
        const expandBtn = document.getElementById('expand-map-btn');
        const expandBtnMobile = document.getElementById('expand-map-btn-mobile');
        if (expandBtn) expandBtn.innerHTML = this.originalZoomButtons || '<i class="fas fa-expand-alt"></i>';
        if (expandBtnMobile) expandBtnMobile.innerHTML = this.originalZoomButtonsMobile || '<i class="fas fa-expand-alt"></i>';
        this.updateMapTransform();
        this.centerMapOnLocation(gameState.currentLocation);
    }

    // Helper used by other systems to know whether the map is currently capturing navigation.
    isExploreModeActive() {
        return this.mapExploreMode;
    }
    
    // Center the map camera on a specific location by coordinate.
    centerMapOnLocation(locationId) {
        const world = gameState.getCurrentWorld();
        const location = world[locationId];
        if (!location) return;

        const mapContainer = document.getElementById('map-container');
        const mapContent = document.getElementById('map-content');

        if (!mapContainer || !mapContent) return;

        const scale = 60;
        const targetX = location.coordinates.x * scale;
        const targetY = location.coordinates.y * scale;

        const containerRect = mapContainer.getBoundingClientRect();

        // Account for current map scale in centering calculation
        this.mapOffset.x = containerRect.width / 2 - targetX * gameState.mapScale - 25;
        this.mapOffset.y = containerRect.height / 2 - targetY * gameState.mapScale - 25;

        this.updateMapTransform();
    }
    
    // Keep the visible map title aligned with either the main world or the active sub-area.
    updateMapTitle() {
        const mapHeader = document.querySelector('.map-header h3');
        if (mapHeader) {
            if (gameState.currentSubArea) {
                // Capitalize and format the sub-area name
                const subAreaName = gameState.currentSubArea
                    .split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                this.currentMapTitle = `${subAreaName} Map`;
            } else {
                this.currentMapTitle = "World Map";
            }
            mapHeader.textContent = this.currentMapTitle;
        }
    }
    
    // Generate the large overworld grid that the adventure starts in.
    // The world is big on purpose: exploration only feels like exploration if there is room to get lost a little.
    generateWorld() {
        console.log('Generating structured 500-location world grid for BOTH difficulties...');
        
        const world = {};
        const locationTypes = {
            forest: ["clearing", "path", "thicket", "grove", "meadow", "woods", "trail", "copse", "glade", "wilds"],
            cave: ["cavern", "tunnel", "grotto", "chasm", "passage", "chamber", "hall", "pit", "crevasse", "gallery"],
            house: ["room", "chamber", "hall", "corridor", "closet", "cellar", "attic", "library", "kitchen", "bedroom"],
            mountains: ["peak", "slope", "ridge", "cliff", "summit", "foothill", "valley", "pass", "ledge", "bluff"],
            ruins: ["crypt", "temple", "shrine", "dungeon", "lair", "nest", "den", "hut", "cottage"],
            water: ["river", "lake", "shore", "pond", "stream", "brook", "creek", "waterfall", "spring", "marsh"],
            road: ["path", "trail", "road", "highway", "lane", "way", "route", "track", "byway", "passage"],
            mine: ["shaft", "tunnel", "vein", "quarry", "dig", "excavation", "pit", "gallery", "chamber", "passage"],
            town: ["square", "street", "alley", "market", "plaza", "district", "quarter", "lane", "road", "avenue"],
            shop: ["store", "market", "boutique", "emporium", "outpost", "stall", "stand", "counter", "shop", "bazaar"]
        };
        
        const adjectives = ["ancient", "mysterious", "forgotten", "hidden", "dark", "bright", "spooky", "peaceful", "grand", "small"];
        const nouns = ["stone", "crystal", "ivory", "obsidian", "marble", "gold", "silver", "bronze", "iron", "wood"];
        
        // Create structured grid for BOTH difficulties (same layout)
        const gridSize = 25; // 25x25 grid = 625 max locations, we'll use ~500
        const center = Math.floor(gridSize / 2);
        
        // Start location at center
        world["start"] = {
            id: "start",
            name: "Starting Point",
            short: "ST",
            description: "You find yourself at the beginning of your adventure. The world stretches out before you, full of mystery and danger.",
            icon: "🏕️",
            items: ["rusty sword", "torch"],
            exits: {},
            coordinates: { x: 0, y: 0 },
            biome: "forest",
            explored: true,
            locked: false,
            special: null,
            campfire: false,
            requiredKey: null,
            visited: false, // Will be set to true when visited
            subArea: null
        };
        
        let locationCount = 1;
        const maxLocations = 500;
        const queue = [{ id: "start", x: 0, y: 0, biome: "forest" }];
        const usedCoordinates = new Set();
        usedCoordinates.add("0,0");
        const campfireLocations = [];
        const lockedLocations = [];
        
        // Define special locations with their grid positions
        const specialLocations = [
            { 
                id: "blacksmith", 
                name: "Blacksmith's Forge", 
                short: "BF", 
                biome: "town", 
                special: "shop", 
                items: ["iron ingot", "hammer"], 
                locked: false, 
                campfire: false,
                requiredKey: null,
                coordinates: { x: 8, y: 8 },
                subArea: null
            },
            { 
                id: "potion_shop", 
                name: "Potion Shop", 
                short: "PS", 
                biome: "town", 
                special: "shop", 
                items: ["health potion", "healing herb"], 
                locked: false, 
                campfire: false,
                requiredKey: null,
                coordinates: { x: -8, y: 8 },
                subArea: null
            },
            { 
                id: "mining_area", 
                name: "Mining Area", 
                short: "MA", 
                biome: "mine", 
                special: "minigame", 
                items: ["pickaxe"], 
                locked: false, 
                campfire: false,
                requiredKey: null,
                coordinates: { x: 8, y: -8 },
                subArea: null
            },
            { 
                id: "dragon_lair", 
                name: "Dragon's Lair Entrance", 
                short: "DL", 
                biome: "cave", 
                special: "dungeon", 
                items: [], 
                locked: true, 
                campfire: false,
                requiredKey: "magic key",
                coordinates: { x: 12, y: 12 },
                subArea: "dragon_lair_dungeon"
            },
            { 
                id: "lich_tomb", 
                name: "Lich King's Tomb Entrance", 
                short: "LT", 
                biome: "ruins", 
                special: "dungeon", 
                items: [], 
                locked: true, 
                campfire: false,
                requiredKey: "crypt key",
                coordinates: { x: -12, y: 12 },
                subArea: "lich_tomb_dungeon"
            },
            { 
                id: "spider_queen", 
                name: "Spider Queen's Nest Entrance", 
                short: "SQ", 
                biome: "cave", 
                special: "dungeon", 
                items: [], 
                locked: true, 
                campfire: false,
                requiredKey: "spider_key",
                coordinates: { x: 12, y: -12 },
                subArea: "spider_queen_dungeon"
            },
            { 
                id: "treasure_vault", 
                name: "Treasure Vault Entrance", 
                short: "TV", 
                biome: "ruins", 
                special: "treasure", 
                items: [], 
                locked: true, 
                campfire: false,
                requiredKey: "treasure_key",
                coordinates: { x: -12, y: -12 },
                subArea: "treasure_vault_dungeon"
            }
        ];
        
        // Add special locations to grid
        specialLocations.forEach(specialLoc => {
            const coordKey = `${specialLoc.coordinates.x},${specialLoc.coordinates.y}`;
            if (!usedCoordinates.has(coordKey) && locationCount < maxLocations) {
                world[specialLoc.id] = {
                    id: specialLoc.id,
                    name: specialLoc.name,
                    short: specialLoc.short,
                    description: this.generateDescription(specialLoc.biome, specialLoc.name.split(' ').pop(), "ancient"),
                    icon: this.getIconForBiome(specialLoc.biome),
                    items: specialLoc.items,
                    exits: {},
                    coordinates: specialLoc.coordinates,
                    biome: specialLoc.biome,
                    explored: false,
                    locked: specialLoc.locked,
                    requiredKey: specialLoc.requiredKey,
                    special: specialLoc.special,
                    campfire: specialLoc.campfire,
                    visited: false,
                    subArea: specialLoc.subArea
                };
                
                usedCoordinates.add(coordKey);
                locationCount++;
                if (specialLoc.locked) {
                    lockedLocations.push(specialLoc.id);
                }
            }
        });
        
        // Generate structured grid-based world with STRICT GRID SNAPPING
        while (locationCount < maxLocations && queue.length > 0) {
            const current = queue.shift();
            const currentLocation = world[current.id];
            
            const directions = [
                { dir: "north", dx: 0, dy: -1 },
                { dir: "south", dx: 0, dy: 1 },
                { dir: "east", dx: 1, dy: 0 },
                { dir: "west", dx: -1, dy: 0 }
            ];
            
            // Structured grid: create locations to fill grid with strict adjacency
            for (let i = 0; i < directions.length; i++) {
                const direction = directions[i];
                const newX = current.x + direction.dx;
                const newY = current.y + direction.dy;
                const coordKey = `${newX},${newY}`;
                
                // Stay within grid bounds - STRICT GRID
                if (Math.abs(newX) > 12 || Math.abs(newY) > 12) continue;
                
                const shouldCreate = !usedCoordinates.has(coordKey) && 
                                     locationCount < maxLocations &&
                                     Math.random() < 0.7; // 70% chance to create connected location
                
                if (shouldCreate) {
                    const newId = `loc_${locationCount}`;
                    
                    let biome = current.biome;
                    // Occasionally change biome for variety
                    if (Math.random() < 0.2) {
                        const compatibleBiomes = this.getCompatibleBiomes(biome);
                        biome = compatibleBiomes[Math.floor(Math.random() * compatibleBiomes.length)];
                    }
                    
                    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
                    const noun = nouns[Math.floor(Math.random() * nouns.length)];
                    const locationType = locationTypes[biome][Math.floor(Math.random() * locationTypes[biome].length)];
                    const name = `${adjective.charAt(0).toUpperCase() + adjective.slice(1)} ${noun} ${locationType}`;
                    const short = this.getLocationAbbreviation(name);
                    
                    const distanceFromStart = Math.sqrt(newX * newX + newY * newY);
                    
                    let campfire = false;
                    if (distanceFromStart > 3 && distanceFromStart < 10 && 
                        campfireLocations.length < 20 && 
                        Math.random() < 0.1) {
                        campfire = true;
                        campfireLocations.push(newId);
                    }
                    
                    let locked = false;
                    let requiredKey = null;
                    let subArea = null;
                    
                    // Only lock areas that are far from start and not already special locations
                    if (distanceFromStart > 6 && distanceFromStart < 12 && 
                        Math.random() < 0.05 && lockedLocations.length < 8) {
                        locked = true;
                        const keys = ["magic key", "crypt key", "spider_key", "treasure_key"];
                        requiredKey = keys[Math.floor(Math.random() * keys.length)];
                        
                        // Determine sub-area type based on key
                        if (requiredKey === "magic key") subArea = "ancient_cave";
                        else if (requiredKey === "crypt key") subArea = "forbidden_crypt";
                        else if (requiredKey === "spider_key") subArea = "dark_caverns";
                        else if (requiredKey === "treasure_key") subArea = "hidden_vault";
                        
                        lockedLocations.push(newId);
                    }
                    
                    world[newId] = {
                        id: newId,
                        name: name,
                        short: short,
                        description: this.generateDescription(biome, locationType, adjective),
                        icon: this.getIconForBiome(biome),
                        items: this.generateItemsForLocation(biome, locationType),
                        exits: {},
                        coordinates: { x: newX, y: newY },
                        biome: biome,
                        explored: false,
                        locked: locked,
                        requiredKey: requiredKey,
                        special: null,
                        campfire: campfire,
                        visited: false,
                        subArea: subArea
                    };
                    
                    // Create bidirectional connection - STRICT GRID MOVEMENT
                    currentLocation.exits[direction.dir] = newId;
                    world[newId].exits[this.getOppositeDirection(direction.dir)] = current.id;
                    
                    queue.push({ id: newId, x: newX, y: newY, biome: biome });
                    usedCoordinates.add(coordKey);
                    locationCount++;
                    
                    if (locationCount >= maxLocations) break;
                }
            }
            
            // If queue is empty but we still need locations, add random unexplored locations
            if (queue.length === 0 && locationCount < maxLocations) {
                const locationIds = Object.keys(world);
                for (let i = 0; i < 10 && locationCount < maxLocations; i++) {
                    const randomLocationId = locationIds[Math.floor(Math.random() * locationIds.length)];
                    const randomLocation = world[randomLocationId];
                    
                    // Try to create connections from this location
                    const dirs = ['north', 'south', 'east', 'west'];
                    for (const dir of dirs) {
                        const dirInfo = directions.find(d => d.dir === dir);
                        if (!dirInfo) continue;
                        
                        const newX = randomLocation.coordinates.x + dirInfo.dx;
                        const newY = randomLocation.coordinates.y + dirInfo.dy;
                        const coordKey = `${newX},${newY}`;
                        
                        if (Math.abs(newX) <= 12 && Math.abs(newY) <= 12 && 
                            !usedCoordinates.has(coordKey) && 
                            locationCount < maxLocations) {
                            
                            const newId = `loc_${locationCount}`;
                            const biome = randomLocation.biome;
                            const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
                            const noun = nouns[Math.floor(Math.random() * nouns.length)];
                            const locationType = locationTypes[biome][Math.floor(Math.random() * locationTypes[biome].length)];
                            const name = `${adjective.charAt(0).toUpperCase() + adjective.slice(1)} ${noun} ${locationType}`;
                            const short = this.getLocationAbbreviation(name);
                            
                            world[newId] = {
                                id: newId,
                                name: name,
                                short: short,
                                description: this.generateDescription(biome, locationType, adjective),
                                icon: this.getIconForBiome(biome),
                                items: this.generateItemsForLocation(biome, locationType),
                                exits: {},
                                coordinates: { x: newX, y: newY },
                                biome: biome,
                                explored: false,
                                locked: false,
                                requiredKey: null,
                                special: null,
                                campfire: false,
                                visited: false,
                                subArea: null
                            };
                            
                            randomLocation.exits[dir] = newId;
                            world[newId].exits[this.getOppositeDirection(dir)] = randomLocationId;
                            
                            queue.push({ id: newId, x: newX, y: newY, biome: biome });
                            usedCoordinates.add(coordKey);
                            locationCount++;
                            break;
                        }
                    }
                }
            }
        }
        
        // Ensure enough campfires
        while (campfireLocations.length < 15 && locationCount <= maxLocations) {
            const locationIds = Object.keys(world);
            for (let i = 0; i < locationIds.length && campfireLocations.length < 15; i++) {
                const locId = locationIds[i];
                const location = world[locId];
                const distanceFromStart = Math.sqrt(
                    location.coordinates.x * location.coordinates.x + 
                    location.coordinates.y * location.coordinates.y
                );
                
                if (!location.campfire && !location.locked && 
                    distanceFromStart > 2 && distanceFromStart < 11 &&
                    Math.random() < 0.1) {
                    location.campfire = true;
                    campfireLocations.push(locId);
                }
            }
        }
        
        this.connectSpecialLocations(world);
        
        console.log(`Generated ${locationCount} locations in structured grid layout`);
        console.log(`Campfires: ${campfireLocations.length}`);
        console.log(`Locked areas: ${lockedLocations.length}`);
        console.log(`Grid bounds: ±12, ±12 (25x25 grid)`);
        
        if (Object.keys(world).length !== maxLocations) {
            console.warn(`Warning: World has ${Object.keys(world).length} locations, expected ${maxLocations}`);
        }
        
        return world;
    }
    
    // Generate sub-area (cave/dungeon/ruins)
    // Build a smaller interior map for dungeons, caves, and other enterable spaces.
    // Interiors are maze-like on purpose so entering a major area feels like a commitment, not a loading screen.
    generateSubArea(subAreaId, entranceLocationId, theme = "cave") {
        console.log(`Generating sub-area: ${subAreaId} with theme: ${theme}`);
        
        const world = gameState.world;
        const entranceLocation = world[entranceLocationId];
        if (!entranceLocation) {
            console.error(`Cannot generate sub-area: Entrance location ${entranceLocationId} not found`);
            return null;
        }
        
        const subArea = {};
        const subAreaSize = 15 + Math.floor(Math.random() * 10); // 15-25 locations
        
        // Determine theme based on sub-area ID
        let actualTheme = theme;
        if (subAreaId.includes('dragon')) actualTheme = "dragon_lair";
        else if (subAreaId.includes('lich') || subAreaId.includes('crypt')) actualTheme = "crypt";
        else if (subAreaId.includes('spider')) actualTheme = "cave";
        else if (subAreaId.includes('treasure')) actualTheme = "vault";
        else if (subAreaId.includes('cave')) actualTheme = "cave";
        
        // Theme-specific configurations
        const themeConfigs = {
            cave: {
                biome: "cave",
                icon: "🕳️",
                adjectives: ["dark", "damp", "echoing", "cavernous", "gloomy"],
                locationTypes: ["cavern", "tunnel", "chamber", "grotto", "passage", "crevasse", "gallery", "hollow", "pit", "cave"],
                itemPool: ["torch", "rope", "rock", "mushroom", "cave moss", "glowing fungus"]
            },
            dragon_lair: {
                biome: "cave",
                icon: "🐉",
                adjectives: ["fiery", "scorched", "ancient", "treasure-filled", "massive"],
                locationTypes: ["lair", "hoard chamber", "nest", "treasure vault", "dragon's den", "burning cavern"],
                itemPool: ["dragon scale", "gold coin", "gemstone", "ancient artifact", "charred bone"]
            },
            crypt: {
                biome: "ruins",
                icon: "💀",
                adjectives: ["ancient", "haunted", "cursed", "forgotten", "decaying"],
                locationTypes: ["crypt", "tomb", "burial chamber", "ossuary", "catacomb", "sepulcher", "mausoleum"],
                itemPool: ["bone shard", "ancient coin", "rusted key", "ceremonial dagger", "tomb relic"]
            },
            vault: {
                biome: "ruins",
                icon: "🗝️",
                adjectives: ["secure", "treasure-filled", "hidden", "ancient", "guarded"],
                locationTypes: ["vault", "treasury", "strongroom", "cache", "storehouse", "secret chamber"],
                itemPool: ["gold coin", "gemstone", "jewelry", "gold ingot", "silver goblet", "ancient coin"]
            }
        };
        
        const config = themeConfigs[actualTheme] || themeConfigs.cave;
        
        // Create entrance location
        const entranceId = `${subAreaId}_entrance`;
        subArea[entranceId] = {
            id: entranceId,
            name: `Entrance to ${entranceLocation.name}`,
            short: "ENT",
            description: `You are at the entrance of ${entranceLocation.name}. The way back to the main world is behind you.`,
            icon: config.icon,
            items: [],
            exits: { out: entranceLocationId }, // Exit back to main world
            coordinates: { x: 0, y: 0 },
            biome: config.biome,
            explored: true,
            locked: false,
            requiredKey: null,
            special: null,
            campfire: false,
            visited: true,
            subArea: null
        };
        
        gameState.subAreas[subAreaId] = subArea;
        gameState.subAreas[subAreaId].entrance = entranceId;
        gameState.subAreas[subAreaId].entranceLocation = entranceLocationId;
        gameState.subAreas[subAreaId].visitedLocations = [entranceId];
        
        let subLocationCount = 1;
        const subQueue = [{ id: entranceId, x: 0, y: 0 }];
        const subUsedCoordinates = new Set();
        subUsedCoordinates.add("0,0");
        
        // Generate sub-area locations
        while (subLocationCount < subAreaSize && subQueue.length > 0) {
            const current = subQueue.shift();
            const currentLocation = subArea[current.id];
            
            const directions = [
                { dir: "north", dx: 0, dy: -1 },
                { dir: "south", dx: 0, dy: 1 },
                { dir: "east", dx: 1, dy: 0 },
                { dir: "west", dx: -1, dy: 0 }
            ];
            
            // Shuffle directions for variety
            this.shuffleArray(directions);
            
            // Create 1-3 connections from each location
            const connections = Math.min(
                Math.floor(Math.random() * 3) + 1,
                directions.length
            );
            
            let createdConnections = 0;
            
            for (let i = 0; i < directions.length && createdConnections < connections && subLocationCount < subAreaSize; i++) {
                const direction = directions[i];
                const newX = current.x + direction.dx;
                const newY = current.y + direction.dy;
                const coordKey = `${newX},${newY}`;
                
                // Limit sub-area size - STRICT GRID
                if (Math.abs(newX) > 3 || Math.abs(newY) > 3) continue;
                
                const shouldCreate = !subUsedCoordinates.has(coordKey) && 
                                     subLocationCount < subAreaSize &&
                                     Math.random() < 0.8;
                
                if (shouldCreate) {
                    const newId = `${subAreaId}_loc_${subLocationCount}`;
                    
                    const adjective = config.adjectives[Math.floor(Math.random() * config.adjectives.length)];
                    const locationType = config.locationTypes[Math.floor(Math.random() * config.locationTypes.length)];
                    const name = `${adjective.charAt(0).toUpperCase() + adjective.slice(1)} ${locationType}`;
                    const short = this.getLocationAbbreviation(name);
                    
                    // Chance for items
                    const items = [];
                    if (Math.random() < 0.3) {
                        const item = config.itemPool[Math.floor(Math.random() * config.itemPool.length)];
                        items.push(item);
                    }
                    
                    // Chance for campfire (rare in sub-areas)
                    const campfire = Math.random() < 0.05;
                    
                    subArea[newId] = {
                        id: newId,
                        name: name,
                        short: short,
                        description: this.generateSubAreaDescription(config.biome, locationType, adjective, actualTheme),
                        icon: config.icon,
                        items: items,
                        exits: {},
                        coordinates: { x: newX, y: newY },
                        biome: config.biome,
                        explored: false,
                        locked: false,
                        requiredKey: null,
                        special: null,
                        campfire: campfire,
                        visited: false,
                        subArea: null
                    };
                    
                    // Create bidirectional connection - STRICT GRID
                    currentLocation.exits[direction.dir] = newId;
                    subArea[newId].exits[this.getOppositeDirection(direction.dir)] = current.id;
                    
                    subQueue.push({ id: newId, x: newX, y: newY });
                    subUsedCoordinates.add(coordKey);
                    subLocationCount++;
                    createdConnections++;
                }
            }
        }
        
        // Add a special boss or treasure room for themed sub-areas
        if (actualTheme === "dragon_lair" || actualTheme === "crypt") {
            this.addBossRoomToSubArea(subAreaId, subArea, actualTheme);
        } else if (actualTheme === "vault") {
            this.addTreasureRoomToSubArea(subAreaId, subArea);
        }
        
        console.log(`Generated sub-area ${subAreaId} with ${subLocationCount} locations`);
        return subAreaId;
    }
    
    // Produce themed flavor text for generated sub-area rooms.
    generateSubAreaDescription(biome, locationType, adjective, theme) {
        const themeDescriptions = {
            cave: `You are in a ${adjective} ${locationType} deep underground. The air is cool and damp.`,
            dragon_lair: `You stand in a ${adjective} ${locationType}. The heat is intense and the smell of sulfur fills the air.`,
            crypt: `This ${adjective} ${locationType} is filled with the scent of decay. Ancient tombs line the walls.`,
            vault: `The ${adjective} ${locationType} glitters with hidden treasures. Security seems tight here.`
        };
        
        return themeDescriptions[theme] || `You are in a ${adjective} ${locationType}.`;
    }
    
    // Attach a boss endpoint to an existing sub-area so major dungeons culminate in a fight.
    addBossRoomToSubArea(subAreaId, subArea, theme) {
        // Find a location to connect the boss room to
        const locationIds = Object.keys(subArea);
        const connectToId = locationIds[Math.floor(Math.random() * locationIds.length)];
        
        const bossRoomId = `${subAreaId}_boss_room`;
        const bossName = theme === "dragon_lair" ? "Dragon's Hoard" : "Lich King's Throne Room";
        const bossDescription = theme === "dragon_lair" 
            ? "A massive cavern filled with mountains of gold and treasure. A powerful presence watches from the shadows."
            : "A throne room filled with necromantic energy. The undead ruler of this place awaits challengers.";
        
        subArea[bossRoomId] = {
            id: bossRoomId,
            name: bossName,
            short: "BOSS",
            description: bossDescription,
            icon: theme === "dragon_lair" ? "🐉" : "💀",
            items: theme === "dragon_lair" ? ["dragon's hoard", "ancient crown"] : ["lich king's phylactery", "necrotic tome"],
            exits: { back: connectToId },
            coordinates: { x: 10, y: 10 }, // Far from main area
            biome: theme === "dragon_lair" ? "cave" : "ruins",
            explored: false,
            locked: false,
            requiredKey: null,
            special: "boss",
            campfire: false,
            visited: false,
            subArea: null
        };
        
        // Connect the boss room
        subArea[connectToId].exits.boss = bossRoomId;
    }
    
    // Add a treasure endpoint to reward deep exploration of a sub-area branch.
    addTreasureRoomToSubArea(subAreaId, subArea) {
        const locationIds = Object.keys(subArea);
        const connectToId = locationIds[Math.floor(Math.random() * locationIds.length)];
        
        const treasureRoomId = `${subAreaId}_treasure_room`;
        
        subArea[treasureRoomId] = {
            id: treasureRoomId,
            name: "Treasure Vault",
            short: "TRS",
            description: "A room overflowing with gold, gems, and priceless artifacts. This is the motherlode!",
            icon: "💰",
            items: ["treasure chest", "gold ingot", "diamond", "royal scepter", "enchanted amulet"],
            exits: { back: connectToId },
            coordinates: { x: 10, y: 10 },
            biome: "ruins",
            explored: false,
            locked: false,
            requiredKey: null,
            special: "treasure",
            campfire: false,
            visited: false,
            subArea: null
        };
        
        subArea[connectToId].exits.treasure = treasureRoomId;
    }
    
    // Shared shuffle helper used during procedural generation.
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    
    // Control which biome types are allowed to border one another in world generation.
    getCompatibleBiomes(biome) {
        const compatibility = {
            forest: ["road", "mountains", "water"],
            cave: ["mountains", "ruins", "mine"],
            house: ["road", "forest", "town"],
            mountains: ["forest", "cave", "mine"],
            ruins: ["cave", "forest", "mine"],
            water: ["forest", "road"],
            road: ["forest", "house", "water", "town"],
            mine: ["cave", "mountains", "ruins"],
            town: ["road", "house"],
            shop: ["town"]
        };
        return compatibility[biome] || ["forest"];
    }
    
    // Produce readable room descriptions for the overworld generator.
    generateDescription(biome, locationType, adjective) {
        const descriptions = {
            forest: `You are in a ${adjective} ${locationType} in the forest. The air is fresh and filled with the sounds of wildlife.`,
            cave: `You stand in a ${adjective} ${locationType} within the cave system. The air is cool and damp.`,
            house: `You are inside a ${adjective} house ${locationType}. The atmosphere is ${adjective === 'spooky' ? 'eerie' : 'comfortable'}.`,
            mountains: `You are on a ${adjective} mountain ${locationType}. The view is ${adjective === 'grand' ? 'breathtaking' : 'humbling'}.`,
            ruins: `You stand among ${adjective} ruins in a ${locationType}. Ancient history surrounds you.`,
            water: `You are at a ${adjective} water ${locationType}. The sound of water is soothing.`,
            road: `You are on a ${adjective} ${locationType}. The path stretches ahead.`,
            mine: `You are in a ${adjective} mine ${locationType}. The air smells of earth and minerals.`,
            town: `You are in a ${adjective} town ${locationType}. People go about their business.`,
            shop: `You enter a ${adjective} shop. Goods are displayed around you.`
        };
        
        return descriptions[biome] || `You are in a ${adjective} ${locationType}.`;
    }
    
    // Select a map icon that visually matches the biome.
    getIconForBiome(biome) {
        const icons = {
            forest: "🌲",
            cave: "🕳️",
            house: "🏠",
            mountains: "🏔️",
            ruins: "🏛️",
            water: "🌊",
            road: "🛣️",
            mine: "⛏️",
            town: "🏘️",
            shop: "🏪"
        };
        return icons[biome] || "❓";
    }
    
    // Randomly seed a location with biome-appropriate loot and occasional rare keys.
    generateItemsForLocation(biome, locationType) {
        const items = [];
        
        const biomeSpawnChances = {
            forest: 0.2,
            cave: 0.15,
            house: 0.3,
            mountains: 0.1,
            ruins: 0.4,
            water: 0.15,
            road: 0.1,
            mine: 0.5,
            town: 0.05,
            shop: 0.8
        };
        
        const rareItemChance = 0.04;
        
        const commonItems = {
            forest: ["healing herb", "berries", "stick", "feather"],
            cave: ["torch", "rope", "rock", "mushroom"],
            house: ["lantern", "book", "candle", "blanket"],
            mountains: ["climbing rope", "pickaxe", "mineral", "eagle feather"],
            ruins: ["ancient coin", "broken pottery", "old map", "rusted key"],
            water: ["fishing rod", "pearl", "shell", "driftwood"],
            road: ["waterskin", "rations", "compass", "traveler's journal"],
            mine: ["iron ore", "pickaxe", "mineral", "coal"],
            town: ["bread", "apple", "cloth", "coin purse"],
            shop: ["health potion", "torch", "rope", "dagger"]
        };
        
        const rareItems = ["magic key", "crypt key", "spider_key", "treasure_key", "enchanted amulet", "crystal of power", "ancient artifact"];
        
        if (Math.random() < biomeSpawnChances[biome]) {
            const availableItems = commonItems[biome] || commonItems.forest;
            items.push(availableItems[Math.floor(Math.random() * availableItems.length)]);
        }
        
        if (Math.random() < rareItemChance) {
            items.push(rareItems[Math.floor(Math.random() * rareItems.length)]);
        }
        
        return items;
    }
    
    // Wire handcrafted special locations back into the generated overworld.
    connectSpecialLocations(world) {
        const specialIds = ["blacksmith", "potion_shop", "mining_area", "dragon_lair", "lich_tomb", "spider_queen", "treasure_vault"];
        
        specialIds.forEach(specialId => {
            if (world[specialId]) {
                let closestLoc = null;
                let minDistance = Infinity;
                
                Object.keys(world).forEach(locId => {
                    if (locId === specialId || !locId.startsWith("loc_")) return;
                    
                    const loc = world[locId];
                    const specialLoc = world[specialId];
                    const distance = Math.sqrt(
                        Math.pow(loc.coordinates.x - specialLoc.coordinates.x, 2) + 
                        Math.pow(loc.coordinates.y - specialLoc.coordinates.y, 2)
                    );
                    
                    if (distance < minDistance && distance > 0) {
                        minDistance = distance;
                        closestLoc = loc;
                    }
                });
                
                if (closestLoc) {
                    let direction = "north";
                    if (world[specialId].coordinates.x > closestLoc.coordinates.x) {
                        direction = "east";
                    } else if (world[specialId].coordinates.x < closestLoc.coordinates.x) {
                        direction = "west";
                    } else if (world[specialId].coordinates.y > closestLoc.coordinates.y) {
                        direction = "south";
                    }
                    
                    const oppositeDir = this.getOppositeDirection(direction);
                    closestLoc.exits[direction] = specialId;
                    world[specialId].exits[oppositeDir] = closestLoc.id;
                }
            }
        });
    }
    
    // Utility helper for building reciprocal exits.
    getOppositeDirection(dir) {
        const opposites = {
            north: "south",
            south: "north",
            east: "west",
            west: "east",
            up: "down",
            down: "up",
            in: "out",
            out: "in"
        };
        return opposites[dir] || "unknown";
    }
    
    // Create the short two-letter map abbreviation used inside cells.
    getLocationAbbreviation(name) {
        const words = name.split(' ');
        let abbreviation = '';
        for (const word of words) {
            if (word.length > 0 && abbreviation.length < 2) {
                abbreviation += word[0].toUpperCase();
            }
        }
        return abbreviation.length === 2 ? abbreviation : '??';
    }

    // Build the visibility sets used to decide which rooms and paths may be drawn.
    getMapVisibilityContext(world) {
        const visitedSet = new Set();
        let visitedList = [];

        if (gameState.currentSubArea && gameState.subAreas[gameState.currentSubArea]) {
            visitedList = gameState.subAreas[gameState.currentSubArea].visitedLocations || [];
        } else {
            visitedList = gameState.visitedLocations || [];
        }

        visitedList.forEach(id => {
            if (world[id]) {
                visitedSet.add(id);
            }
        });

        if (gameState.currentLocation && world[gameState.currentLocation]) {
            visitedSet.add(gameState.currentLocation);
        }

        const seenLockedSet = new Set();
        if (gameState.seenLockedLocations) {
            if (gameState.seenLockedLocations instanceof Set) {
                gameState.seenLockedLocations.forEach(id => {
                    if (world[id]) {
                        seenLockedSet.add(id);
                    }
                });
            } else if (Array.isArray(gameState.seenLockedLocations)) {
                gameState.seenLockedLocations.forEach(id => {
                    if (world[id]) {
                        seenLockedSet.add(id);
                    }
                });
            }
        }

        const neighborSet = new Set();
        visitedSet.forEach(id => {
            const loc = world[id];
            if (!loc || !loc.exits) return;
            Object.values(loc.exits).forEach(exitId => {
                const exitLoc = world[exitId];
                if (!exitLoc) return;
                if (exitLoc.locked && !seenLockedSet.has(exitId)) {
                    return;
                }
                neighborSet.add(exitId);
            });
        });

        const hardcoreVisibleSet = new Set();
        visitedSet.forEach(id => hardcoreVisibleSet.add(id));
        neighborSet.forEach(id => hardcoreVisibleSet.add(id));
        seenLockedSet.forEach(id => hardcoreVisibleSet.add(id));

        return {
            visitedSet,
            seenLockedSet,
            neighborSet,
            hardcoreVisibleSet
        };
    }
    
    // Refresh both desktop and mobile map containers.
    updateMapDisplay() {
        const mapContent = document.getElementById('map-content');
        const mapContentMobile = document.getElementById('map-content-mobile');
        
        this.updateMapContainer(mapContent);
        if (mapContentMobile) {
            this.updateMapContainer(mapContentMobile);
        }
        
        // Update map title
        this.updateMapTitle();
    }
    
    // Render one map container from the current world and visibility rules.
    updateMapContainer(container) {
        if (!container) return;
        
        container.innerHTML = '';
        
        const world = gameState.getCurrentWorld();
        const visibility = this.getMapVisibilityContext(world);
        
        // Create connections FIRST (so they appear behind cells)
        this.createMapConnections(container, visibility);
        
        // FIRST: Render all locations to ensure grid integrity
        Object.keys(world).forEach(locationId => {
            const location = world[locationId];
            if (!location || !location.coordinates) return;
            
            const cell = document.createElement('div');
            cell.classList.add('map-cell');
            cell.setAttribute('data-location', locationId);
            
            // STRICT GRID SNAPPING - integer coordinates only
            const scale = 60;
            const x = location.coordinates.x * scale;
            const y = location.coordinates.y * scale;
            
            // Round to nearest pixel for strict grid alignment
            cell.style.left = `${Math.round(x)}px`;
            cell.style.top = `${Math.round(y)}px`;
            
            const isVisited = visibility.visitedSet.has(locationId);
            const isSeenLocked = visibility.seenLockedSet.has(locationId);
            const isHardcore = gameState.difficulty === "hardcore";
            const shouldShow = isHardcore ? visibility.hardcoreVisibleSet.has(locationId) : true;
            
            if (!shouldShow) {
                return;
            }
            
            if (isVisited) {
                cell.innerHTML = `
                    <span class="abbr">${location.short}</span>
                    <span class="full-name">${location.name}</span>
                `;
                cell.classList.add('visited');
            } else {
                cell.innerHTML = `<span class="abbr">?</span>`;
                cell.classList.add('unvisited');
                
                if (isHardcore && !isSeenLocked) {
                    cell.classList.add('hidden');
                }
            }
            
            // Apply current location styling
            if (locationId === gameState.currentLocation) {
                cell.classList.add('current');
            }
            
            // Handle locked locations
            if (location.locked) {
                const showLocked = isHardcore ? isSeenLocked || isVisited : true;
                
                if (showLocked) {
                    cell.classList.add('locked');
                    
                    // Add lock icon to the cell content
                    if (!isVisited) {
                        // In Normal mode, unvisited locked locations show as ? with lock
                        cell.innerHTML = `<span class="abbr">?</span><span class="lock-icon">🔒</span>`;
                    } else {
                        // Visited locked locations show their name with lock
                        cell.innerHTML = `
                            <span class="abbr">${location.short}</span>
                            <span class="full-name">${location.name}</span>
                            <span class="lock-icon">🔒</span>
                        `;
                    }
                    
                    // Check if player has the key
                    if (location.requiredKey && gameState.inventory.includes(location.requiredKey)) {
                        cell.classList.add('key-available');
                    }
                } else if (!isHardcore && !isVisited) {
                    // Normal mode hint for unvisited locked locations
                    cell.classList.add('locked-hint');
                    cell.innerHTML = `<span class="abbr">?</span>`;
                }
            }
            
            // Handle campfires
            if (location.campfire) {
                if (isVisited) {
                    cell.classList.add('campfire');
                } else if (!isHardcore) {
                    cell.classList.add('campfire-hint');
                }
            }
            
            // Handle items
            if (location.items && location.items.length > 0 && isVisited) {
                const hasRareItem = location.items.some(item => 
                    gameState.items[item] && (gameState.items[item].rarity === "rare" || 
                    gameState.items[item].rarity === "legendary")
                );
                
                if (hasRareItem) {
                    cell.classList.add('has-rare-item');
                } else {
                    cell.classList.add('has-item');
                }
            }
            
            // Handle active enemies
            if (gameState.activeEnemies[locationId] && isVisited) {
                cell.classList.add('flee-marker');
            }
            
            // Add click handler for Type + Click mode
            if (gameState.inputMode === "both") {
                cell.addEventListener('click', () => {
                    if (this.mapExploreMode) {
                        this.centerMapOnLocation(locationId);
                        return;
                    }
                    if (isVisited) {
                        this.centerMapOnLocation(locationId);
                        const currentWorld = gameState.getCurrentWorld();
                        const currentLoc = currentWorld[gameState.currentLocation];
                        if (currentLoc && Object.values(currentLoc.exits).includes(locationId)) {
                            for (const [dir, exitId] of Object.entries(currentLoc.exits)) {
                                if (exitId === locationId) {
                                    main.processCommand(`go ${dir}`);
                                    break;
                                }
                            }
                        }
                    }
                });
            }
            
            container.appendChild(cell);
        });
    }
    
    // Draw the lines between map cells after visibility filtering has been applied.
    createMapConnections(container, visibility) {
        const world = gameState.getCurrentWorld();
        const scale = 60;
        const context = visibility || this.getMapVisibilityContext(world);
        const isHardcore = gameState.difficulty === "hardcore";
        
        // First pass: collect all connections that should be visible
        const connectionsToDraw = [];
        
        Object.keys(world).forEach(locationId => {
            const location = world[locationId];
            if (!location) return;
            
            const fromX = location.coordinates.x * scale + 25;
            const fromY = location.coordinates.y * scale + 25;
            
            const fromVisited = context.visitedSet.has(locationId);
            const fromVisible = isHardcore ? context.hardcoreVisibleSet.has(locationId) : true;
            
            if (!fromVisible) return;
            
            Object.keys(location.exits).forEach(direction => {
                const targetLocationId = location.exits[direction];
                const targetLocation = world[targetLocationId];
                
                if (!targetLocation) return;
                
                const toVisited = context.visitedSet.has(targetLocationId);
                const toVisible = isHardcore ? context.hardcoreVisibleSet.has(targetLocationId) : true;
                
                if (!fromVisible || !toVisible) return;
                
                // Only draw if at least one end is discovered (prevents ? -> ? lines)
                if (!fromVisited && !toVisited) return;
                
                const toX = targetLocation.coordinates.x * scale + 25;
                const toY = targetLocation.coordinates.y * scale + 25;
                
                const dx = toX - fromX;
                const dy = toY - fromY;
                
                // Enforce straight, grid-aligned paths only
                if (dx !== 0 && dy !== 0) {
                    return;
                }
                
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                
                connectionsToDraw.push({
                    fromX, fromY, toX, toY, distance, angle, dx, dy,
                    fromVisited, toVisited
                });
            });
        });
        
        // Draw connections
        connectionsToDraw.forEach(conn => {
            const connection = document.createElement('div');
            connection.classList.add('map-connection');
            
            if (conn.fromVisited && conn.toVisited) {
                connection.classList.add('discovered');
            } else {
                connection.classList.add('partial');
                connection.style.opacity = '0.5';
            }
            
            connection.style.width = `${conn.distance}px`;
            connection.style.left = `${conn.fromX}px`;
            connection.style.top = `${conn.fromY}px`;
            connection.style.transform = `rotate(${conn.angle}deg)`;
            
            container.appendChild(connection);
            
            // Add arrow for discovered connections
            if (conn.fromVisited && conn.toVisited) {
                const arrow = document.createElement('div');
                arrow.classList.add('connection-arrow');
                arrow.style.left = `${conn.fromX + conn.dx * 0.7}px`;
                arrow.style.top = `${conn.fromY + conn.dy * 0.7}px`;
                arrow.style.transform = `rotate(${conn.angle}deg)`;
                container.appendChild(arrow);
            }
        });
    }
}

const mapSystem = new MapSystem();
