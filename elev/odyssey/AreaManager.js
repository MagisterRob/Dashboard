// AreaManager.js
/*
========================================
FILE OVERVIEW
----------------------------------------
Purpose:
- Rebuilds world and interior generation around major areas, progression gates,
  and nested portal-style sub-areas.

Key Systems:
- Overworld region generation
- Interior area generation
- Progression edge unlocking
- Movement and enter/exit command patching

Flow:
- Replaces parts of the original map generation and movement logic
- Builds richer area structures
- Unlocks world connections when players clear internal exits

Design Notes:
- AreaManager is the world-structure layer. It gives exploration more shape,
  more pacing, and fewer "wait, how did I get here already?" moments.
========================================
*/
(function () {
    class AreaManager {
        // Receive the extension context so this generator can report logs and request UI refreshes.
        constructor(context) {
            this.ctx = context;
            this.original = {};
        }

        // Keep AreaManager logs going through the same shared debug channel.
        log(msg, data) {
            if (this.ctx && this.ctx.log) this.ctx.log(msg, data);
        }

        // Mark a connection between two major overworld areas as permanently opened.
        setEdgeUnlocked(a, b) {
            gameState.areaState.progressionUnlocked[a + "|" + b] = true;
            gameState.areaState.progressionUnlocked[b + "|" + a] = true;
            this.log("Unlocked edge", { a: a, b: b });
        }

        // Check whether a gated overworld connection has already been unlocked.
        isEdgeUnlocked(a, b) {
            return !!gameState.areaState.progressionUnlocked[a + "|" + b];
        }

        // Major locations are the ones that act as progression nodes or portal entrances.
        isMajor(loc) {
            if (!loc) return false;
            return !!(loc.majorArea || loc.portalType);
        }

        // Deterministic hash helper for repeatable flavor text picks.
        // Translation: rooms keep their personality between loads instead of
        // rolling new vibes every time the page blinks.
        hash(value) {
            const text = String(value || "");
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                hash = ((hash << 5) - hash) + text.charCodeAt(i);
                hash |= 0;
            }
            return Math.abs(hash);
        }

        // Pick a stable text variant based on a key.
        // This keeps locations feeling authored instead of randomly rewriting
        // themselves every time the world gets rebuilt.
        pick(list, key) {
            if (!Array.isArray(list) || !list.length) return "";
            return list[this.hash(key) % list.length];
        }

        // Shared shuffle helper for generation steps that should still feel varied.
        // Looks innocent. Was not innocent to debug.
        shuffle(list) {
            const copy = list.slice();
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = copy[i];
                copy[i] = copy[j];
                copy[j] = temp;
            }
            return copy;
        }

        // Icons for the main areas.
        // Originally tried fancier emoji choices... ended up summoning icons
        // that had absolutely no business being there. These are the stable survivors.
        biomeIcon(biome) {
            const icons = {
                road: "🧭",
                forest: "🌲",
                mountains: "🏔️",
                bridge: "🌉",
                town: "🏘️",
                city: "🏙️",
                kingdom: "🏰",
                dungeon: "🏛️",
                house: "🏚️",
                cave: "🕳️",
                shop: "🏪",
                mall: "🏪",
                generic: "📍"
            };
            return icons[biome] || icons.generic;
        }

        // Generate short and detailed location text that matches both biome and route role.
        // The goal is for a place to feel like part of a larger region, not
        // just another square in a math problem wearing a forest hat.
        buildLocationText(name, biome, regionType, contextKey) {
            const key = `${contextKey}|${name}|${biome}|${regionType}`;
            const biomeText = {
                road: {
                    short: [
                        `${name} sits where several worn tracks meet.`,
                        `Ruts and footprints overlap at ${name}.`,
                        `${name} is a resting point between longer stretches of road.`
                    ],
                    look: [
                        `Wheel grooves, ash, and discarded cord suggest constant travel through this waypoint.`,
                        `You notice old markers, trampled grass, and signs of travelers camping here in every season.`,
                        `The ground is crowded with tracks heading in different directions, some fresh and some nearly gone.`
                    ]
                },
                forest: {
                    short: [
                        `${name} lies under dense boughs and muted green light.`,
                        `The path at ${name} narrows between roots, moss, and shadowed trunks.`,
                        `${name} feels enclosed by trees that crowd close on every side.`
                    ],
                    look: [
                        `Sap, damp bark, and snapped twigs fill the air while half-hidden game trails branch away from the main route.`,
                        `You spot claw marks on bark, old camps in the undergrowth, and fresh signs that wildlife still owns this stretch.`,
                        `The forest floor is layered with needles, fungus, and faint tracks that vanish almost as soon as you notice them.`
                    ]
                },
                mountains: {
                    short: [
                        `${name} clings to steep stone and cutting wind.`,
                        `Loose shale and exposed rock make ${name} feel treacherous.`,
                        `${name} overlooks a cold drop and a maze of ledges.`
                    ],
                    look: [
                        `You hear loose gravel skitter down the slopes while distant gusts scrape across the pass like a warning.`,
                        `Old cairns, broken ropes, and chipped footholds show how many travelers had to fight for this ground.`,
                        `The path doubles back along ridges and shelves, forcing any journey here to be careful and indirect.`
                    ]
                },
                bridge: {
                    short: [
                        `${name} hangs above open air and roaring wind.`,
                        `Timbers and stone supports at ${name} tremble with every gust.`,
                        `${name} offers no shelter from the canyon below.`
                    ],
                    look: [
                        `You notice old maintenance platforms, patched railings, and narrow service walkways disappearing beneath the span.`,
                        `Wind rushes through the supports while ropes, beams, and watch points create more routes than first appear.`,
                        `Far below, the gorge swallows sound; around you, every brace and tower suggests hidden ways across the bridgework.`
                    ]
                },
                town: {
                    short: [
                        `${name} is busy with trade, gossip, and passing carts.`,
                        `${name} opens into a knot of lanes and storefront chatter.`,
                        `Voices and wagon wheels keep ${name} lively even at a distance.`
                    ],
                    look: [
                        `Hanging signs, stacked crates, and side lanes create a tangle of options that loop back into the town core.`,
                        `You catch the smell of bread, forge smoke, and rain on stone while townsfolk slip easily through shortcuts you almost miss.`,
                        `Small courtyards and service alleys break up the main route here, making nearby places harder to reach than they first seem.`
                    ]
                },
                city: {
                    short: [
                        `${name} is swallowed by tall walls, balconies, and dense traffic.`,
                        `Crowded architecture makes ${name} feel layered and hard to read.`,
                        `${name} sits inside a district that never quite reveals its full shape.`
                    ],
                    look: [
                        `Stairs, cut-through alleys, and stacked storefronts turn the city into a vertical maze around you.`,
                        `Courier routes, arcades, and shuttered passages suggest faster ways through the district if you can learn them.`,
                        `The streets do not move in straight lines here; they bend around blocks, courtyards, and private gates that interrupt sightlines.`
                    ]
                },
                kingdom: {
                    short: [
                        `${name} feels formal, guarded, and deliberately planned.`,
                        `${name} sits among broad avenues and disciplined patrol routes.`,
                        `Ceremonial stonework makes ${name} feel imposing even when empty.`
                    ],
                    look: [
                        `Barracks roads, processional stairs, and restricted courts split the district into layers of access and control.`,
                        `You notice posted guards, messenger paths, and service corridors that slip around the grand public routes.`,
                        `The kingdom's order is deceptive; walls, gates, and side courts force long approaches to places that look close at hand.`
                    ]
                },
                dungeon: {
                    short: [
                        `${name} is cold, enclosed, and heavy with old warning signs.`,
                        `Stone and iron make ${name} feel built to contain something.`,
                        `${name} echoes like a place that expects intruders.`
                    ],
                    look: [
                        `Blocked arches, barred recesses, and old guard routes make the dungeon feel more like a trap than a corridor.`,
                        `You notice scrape marks, collapsed cells, and narrow maintenance passages that complicate the obvious route onward.`,
                        `The layout here is intentionally hostile, forcing detours through side halls and half-sealed chambers.`
                    ]
                },
                house: {
                    short: [
                        `${name} feels stale, enclosed, and unsettlingly still.`,
                        `Dust and warped floorboards make ${name} feel long abandoned.`,
                        `${name} is quiet in the way only old houses can be.`
                    ],
                    look: [
                        `Hidden doors, servant passages, and broken interior walls make the manor harder to navigate than its size suggests.`,
                        `You spot old portraits, disturbed dust, and narrow side routes that twist around the main rooms.`,
                        `The house folds in on itself through cramped halls and alternate passages, making nearby rooms awkward to reach.`
                    ]
                },
                cave: {
                    short: [
                        `${name} is damp, echoing, and uneven underfoot.`,
                        `Stone shelves and dark hollows make ${name} hard to read at a glance.`,
                        `${name} opens into natural rock that refuses a straight route.`
                    ],
                    look: [
                        `Dripping water, mineral seams, and split chambers suggest several routes threading through the rock.`,
                        `You notice crawlspaces, ledges, and old torch soot where earlier explorers tested different paths.`,
                        `The cave folds around itself in shelves and bends, turning short distances into long detours.`
                    ]
                },
                shop: {
                    short: [
                        `${name} is marked by open trade and neatly arranged stock.`,
                        `${name} stands out as a place of commerce amid the surrounding routes.`,
                        `Shelves, signs, and a well-kept threshold define ${name}.`
                    ],
                    look: [
                        `You notice careful displays, locked storage, and a practiced traffic flow guiding buyers through the space.`,
                        `Pricing boards, spare tools, and merchant notes reveal this shop is better supplied than it first appears.`,
                        `Behind the public counter sit back rooms, stacked crates, and evidence of brisk, regular business.`
                    ]
                },
                generic: {
                    short: [
                        `${name} marks another stretch of the journey.`,
                        `${name} feels like a useful waypoint between larger destinations.`,
                        `${name} offers just enough cover to pause and orient yourself.`
                    ],
                    look: [
                        `Small traces of recent travel suggest others pass through here even if no one stays for long.`,
                        `You notice worn edges, old camp signs, and faint route marks that reveal how the area fits together.`,
                        `What seemed simple at first glance turns out to connect to several quieter paths and practical detours.`
                    ]
                }
            };
            const roleText = {
                hub: {
                    short: ["Several routes branch away from here.", "This spot acts as a local anchor point."],
                    look: ["From here, the surrounding paths make more sense, even if none of them promise an easy route.", "You can read the traffic patterns here more clearly than anywhere nearby."]
                },
                approach: {
                    short: ["The route ahead feels well traveled.", "This stretch feeds back into the area's main flow."],
                    look: ["Side tracks and worn turnoffs show how the main route has been redirected over time.", "The most obvious path is not the only one; several smaller links peel away from the approach."]
                },
                branch: {
                    short: ["A narrower route breaks from the busier path.", "This offshoot feels quieter than the main way."],
                    look: ["The branch doubles back through less obvious ground, hiding useful shortcuts and awkward dead ends.", "You can tell this route was shaped by repeated detours rather than formal planning."]
                },
                entrance: {
                    short: ["A way deeper inside begins here.", "The threshold ahead leads into a more tangled space."],
                    look: ["Marks near the entrance suggest many people turned back before learning the layout within.", "The threshold is deceptively simple; beyond it, the routes quickly stop behaving like a straight corridor."]
                },
                connector: {
                    short: ["This stretch links one pocket of the area to another.", "The route here feels transitional rather than final."],
                    look: ["Several nearby passages seem close together, but the actual route between them winds awkwardly.", "You can tell this connector exists to bridge awkward gaps in the area's layout."]
                },
                exit: {
                    short: ["A promising route onward stands out here.", "This point feels like a way through rather than a stopping place."],
                    look: ["Signs of heavier use gather around the onward route, as if most explorers were relieved to find it.", "The path beyond looks deliberate, almost like it was meant to reward persistence."]
                },
                "nested-portal": {
                    short: ["Another entrance splits away from here.", "A second threshold interrupts the route here."],
                    look: ["The branching entrance suggests a whole extra layer of rooms beyond the current path.", "Whoever built this place liked hiding one interior network inside another."]
                }
            };

            const biomeSet = biomeText[biome] || biomeText.generic;
            const roleSet = roleText[regionType] || roleText.connector;
            return {
                shortDescription: `${this.pick(biomeSet.short, key)} ${this.pick(roleSet.short, `${key}|short`)}`.trim(),
                lookDescription: `${this.pick(biomeSet.look, `${key}|look`)} ${this.pick(roleSet.look, `${key}|detail`)}`.trim()
            };
        }

        // Factory helper that normalizes generated locations into the shape the rest of the game expects.
        // This is the "please stay consistent" checkpoint for generated rooms.
        loc(id, name, x, y, biome, desc, extra) {
            const e = extra || {};
            const text = this.buildLocationText(name, biome, e.regionType || biome, id);
            const safeIcon = e.icon && !e.icon.includes("ð") && !e.icon.includes("Ã") && !e.icon.includes("â") && !e.icon.includes("\uFFFD")
                ? e.icon
                : this.biomeIcon(biome);
            return {
                id:id,
                name:name,
                short:(name.split(" ").map((w)=>w[0]).join("").slice(0,2)||id.slice(0,2)||"MP").toUpperCase(),
                description:e.shortDescription||desc||text.shortDescription,
                shortDescription:e.shortDescription||desc||text.shortDescription,
                lookDescription:e.lookDescription||e.detailDescription||text.lookDescription,
                icon:safeIcon,
                items:e.items||[],
                exits:{},
                coordinates:{x:x,y:y},
                biome:biome,
                explored:id==="start",
                locked:!!e.locked,
                requiredKey:e.requiredKey||null,
                special:e.special||null,
                campfire:!!e.campfire,
                visited:false,
                lookedThisVisit:!!e.lookedThisVisit,
                subArea:e.subArea||null,
                portalType:e.portalType||null,
                regionType:e.regionType||biome,
                majorArea:!!e.majorArea,
                isShop:!!e.isShop,
                shopType:e.shopType||null,
                shopId:e.shopId||null,
                worldVersion:e.worldVersion||"wes-v4"
            };
        }

        // Create a bidirectional cardinal connection between two generated nodes.
        // If one room knows about the other, the other room should return the favor.
        link(world, a, dir, b) {
            const opp = { north:"south", south:"north", east:"west", west:"east" };
            world[a].exits[dir] = b;
            world[b].exits[opp[dir]] = a;
        }

        dirVector(dir) {
            return {
                north: { x: 0, y: -1 },
                south: { x: 0, y: 1 },
                east: { x: 1, y: 0 },
                west: { x: -1, y: 0 }
            }[dir] || { x: 0, y: 0 };
        }

        perpendicularDirs(dir) {
            return (dir === "north" || dir === "south") ? ["east", "west"] : ["north", "south"];
        }

        buildOuterNodeName(region, index, kind, depth) {
            const labels = region.nodeNames || ["Way"];
            const label = labels[index % labels.length];
            const prefix = kind === "trunk" ? region.outerPrefix : region.sidePrefix;
            return prefix + " " + label + " " + depth;
        }

        buildOuterNodeDescription(region, name, kind, step) {
            const routeText = kind === "trunk"
                ? "The main route through this district keeps pulling you onward."
                : "A side route bends away from the busiest path.";
            return region.flavor + " " + name + " marks another stretch of the overworld. " + routeText + " Distance from the hub: " + step + ".";
        }

        buildOuterNodeItems(region, ordinal) {
            const items = [];
            const pool = region.itemPool || [];
            if (!pool.length) return items;
            if (ordinal % 6 === 0) items.push(pool[ordinal % pool.length]);
            if (ordinal % 14 === 0) items.push(pool[(ordinal + 2) % pool.length]);
            return Array.from(new Set(items));
        }

        createOuterNode(world, region, id, ordinal, x, y, kind, depth) {
            const name = this.buildOuterNodeName(region, ordinal, kind, depth);
            const shopType = region.shopSpots && region.shopSpots[ordinal + 1] ? region.shopSpots[ordinal + 1] : null;
            const text = this.buildLocationText(name, region.outerBiome || region.biome, kind === "trunk" ? "approach" : "branch", id);
            world[id] = this.loc(
                id,
                name,
                x,
                y,
                region.outerBiome || region.biome,
                text.shortDescription,
                {
                    icon: region.outerIcon || region.icon,
                    items: this.buildOuterNodeItems(region, ordinal),
                    campfire: !!(region.campfireSpots && region.campfireSpots.indexOf(ordinal + 1) !== -1),
                    regionType: kind === "trunk" ? "approach" : "branch",
                    shortDescription: text.shortDescription,
                    lookDescription: `${region.flavor} ${text.lookDescription}`.trim(),
                    majorArea: false,
                    isShop: !!shopType,
                    shopType: shopType,
                    shopId: shopType ? region.id + "_" + shopType + "_outer_shop_" + (ordinal + 1) : null
                }
            );
        }

        canPlaceRegionNode(region, x, y, occupied) {
            const dx = x - region.x;
            const dy = y - region.y;
            const maxX = region.regionWidth || 7;
            const maxY = region.regionHeight || 6;
            if (Math.abs(dx) > maxX || Math.abs(dy) > maxY) return false;
            return !occupied.has(x + "," + y);
        }

        growRegionMaze(world, region, targetCount, counter, occupied) {
            if (targetCount <= 0 || !world[region.id]) return 0;

            const frontier = [{ id: region.id, depth: 0 }];
            let created = 0;
            let safety = 0;

            while (created < targetCount && frontier.length > 0 && safety < targetCount * 80) {
                safety++;
                const parentMeta = frontier[Math.max(0, frontier.length - 1 - (safety % Math.min(frontier.length, 5)))];
                const parent = world[parentMeta.id];
                if (!parent) {
                    frontier.pop();
                    continue;
                }

                const parentExitCount = Object.keys(parent.exits || {}).length;
                const parentLimit = parent.id === region.id ? 4 : (Math.random() < 0.18 ? 4 : 3);
                if (parentExitCount >= parentLimit) {
                    frontier.splice(frontier.indexOf(parentMeta), 1);
                    continue;
                }

                const options = this.shuffle(["north", "south", "east", "west"]).filter((dir) => {
                    if (parent.exits[dir]) return false;
                    const vec = this.dirVector(dir);
                    const nx = parent.coordinates.x + vec.x;
                    const ny = parent.coordinates.y + vec.y;
                    return this.canPlaceRegionNode(region, nx, ny, occupied);
                });

                if (!options.length) {
                    frontier.splice(frontier.indexOf(parentMeta), 1);
                    continue;
                }

                const expansions = parent.id === region.id
                    ? Math.min(options.length, Math.random() < 0.45 ? 2 : 3)
                    : Math.min(options.length, Math.random() < 0.24 && parentExitCount <= 1 ? 2 : 1);

                for (let i = 0; i < expansions && i < options.length && created < targetCount; i++) {
                    const dir = options[i];
                    const vec = this.dirVector(dir);
                    const nx = parent.coordinates.x + vec.x;
                    const ny = parent.coordinates.y + vec.y;
                    const nodeId = region.id + "_outer_" + String(counter.value + 1).padStart(2, "0");
                    const kind = parent.id === region.id ? "trunk" : "side";
                    this.createOuterNode(world, region, nodeId, counter.value, nx, ny, kind, parentMeta.depth + 1);
                    this.link(world, parent.id, dir, nodeId);
                    occupied.add(nx + "," + ny);
                    counter.value++;
                    created++;
                    frontier.push({ id: nodeId, depth: parentMeta.depth + 1 });
                }
            }

            return created;
        }

        // Build the evolved overworld with major-area pacing and unlockable routes.
        // Main reason this exists: letting players skip straight through the
        // world made exploration feel like checking boxes instead of going on a journey.
        buildWorld() {
            const w = {};
            const add = (id, name, x, y, biome, desc, extra) => { w[id] = this.loc(id, name, x, y, biome, desc, extra); };
            const regions = [
                {
                    id: "start",
                    name: "Wayfarer Crossroads",
                    x: 0,
                    y: 0,
                    biome: "road",
                    icon: "🧭",
                    description: "A central overworld hub where every journey eventually converges.",
                    flavor: "Weathered signposts and old camp tracks make this the safest place to regroup.",
                    items: ["torch", "rusty sword"],
                    campfire: true,
                    majorArea: true,
                    portalType: null,
                    subArea: null,
                    outerPrefix: "Crossroads",
                    sidePrefix: "Camp",
                    nodeNames: ["Track", "Lookout", "Marker", "Trail", "Switchback", "Rest"],
                    itemPool: ["torch", "bandage", "cloth"],
                    branchDirections: ["north", "south"],
                    campfireSpots: [6, 18, 31, 44],
                    outerCount: 49
                },
                {
                    id: "forest_gate",
                    name: "Elderpine Forest",
                    x: 18,
                    y: 0,
                    biome: "forest",
                    icon: "🌲",
                    description: "Dense forest trails disappear under towering boughs and heavy mist.",
                    flavor: "Pine needles soften every footstep and the deeper paths feel endless.",
                    portalType: "forest",
                    subArea: "forest_elderpine",
                    majorArea: true,
                    outerPrefix: "Elderpine",
                    sidePrefix: "Wildwood",
                    nodeNames: ["Trail", "Clearing", "Grove", "Path", "Thicket", "Copse"],
                    itemPool: ["healing herb", "feather", "hide", "raw meat"],
                    branchDirections: ["north", "south"],
                    campfireSpots: [9, 23, 41],
                    outerCount: 49
                },
                {
                    id: "mountain_pass",
                    name: "Stonejaw Pass",
                    x: 36,
                    y: 0,
                    biome: "mountains",
                    icon: "🏔️",
                    description: "Cliffside paths wind between sheer walls and icy gusts.",
                    flavor: "Loose shale and exposed ledges make every route through the pass feel earned.",
                    portalType: "mountain pass",
                    subArea: "pass_stonejaw",
                    majorArea: true,
                    outerPrefix: "Stonejaw",
                    sidePrefix: "Cliffside",
                    nodeNames: ["Ridge", "Shelf", "Spur", "Ledge", "Trail", "Lookout"],
                    itemPool: ["torch", "bone shard", "cloth"],
                    branchDirections: ["north", "south"],
                    campfireSpots: [12, 29, 45],
                    outerCount: 49
                },
                {
                    id: "long_bridge",
                    name: "Kingspan Bridge",
                    x: 54,
                    y: 0,
                    biome: "bridge",
                    icon: "🌉",
                    description: "An immense bridge crosses a canyon wide enough to swallow the horizon.",
                    flavor: "Every platform and support beam hums under the wind rushing through the gorge.",
                    portalType: "bridge",
                    subArea: "bridge_kingspan",
                    majorArea: true,
                    outerPrefix: "Kingspan",
                    sidePrefix: "Watch",
                    nodeNames: ["Span", "Ramp", "Tower", "Landing", "Buttress", "Platform"],
                    itemPool: ["torch", "cloth", "feather"],
                    branchDirections: ["north", "south"],
                    campfireSpots: [11, 27, 40],
                    outerCount: 49
                },
                {
                    id: "tharnwick_town",
                    name: "Tharnwick Town",
                    x: 72,
                    y: 0,
                    biome: "town",
                    icon: "🏘️",
                    description: "A fortified trade town buzzes with wagons, innkeepers, and wall patrols.",
                    flavor: "Stone lanes and market alleys spread out from the gate in tidy, busy rows.",
                    portalType: "town",
                    subArea: "town_tharnwick",
                    majorArea: true,
                    outerPrefix: "Tharnwick",
                    sidePrefix: "Market",
                    nodeNames: ["Lane", "Square", "Road", "Yard", "Quarter", "Market"],
                    itemPool: ["bandage", "small health potion", "cloth"],
                    branchDirections: ["north"],
                    campfireSpots: [14, 35],
                    shopSpots: { 8: "merchant", 19: "weapon", 33: "armor" },
                    outerCount: 49
                },
                {
                    id: "velmora_city",
                    name: "Velmora City",
                    x: 90,
                    y: 0,
                    biome: "city",
                    icon: "🏙️",
                    description: "High walls and dense districts make the city feel like a world of its own.",
                    flavor: "Crowded avenues, high balconies, and merchant courts pull you deeper into Velmora.",
                    portalType: "city",
                    subArea: "city_velmora",
                    majorArea: true,
                    outerPrefix: "Velmora",
                    sidePrefix: "District",
                    nodeNames: ["Avenue", "Court", "Row", "Ward", "Alley", "Market"],
                    itemPool: ["health potion", "bandage", "cloth", "lantern"],
                    branchDirections: ["north", "south"],
                    campfireSpots: [17, 34, 46],
                    shopSpots: { 6: "merchant", 15: "weapon", 24: "armor", 38: "clothing" },
                    outerCount: 49
                },
                {
                    id: "eldergate_kingdom",
                    name: "Eldergate Kingdom",
                    x: 108,
                    y: 0,
                    biome: "kingdom",
                    icon: "🏰",
                    description: "Royal roads lead through barracks, temples, and ceremonial plazas.",
                    flavor: "The capital feels ordered and monumental, with guards posted at every turn.",
                    portalType: "kingdom",
                    subArea: "kingdom_eldergate",
                    majorArea: true,
                    outerPrefix: "Eldergate",
                    sidePrefix: "Royal",
                    nodeNames: ["Avenue", "Plaza", "Ward", "Gate", "Court", "Promenade"],
                    itemPool: ["lantern", "bandage", "health potion"],
                    branchDirections: ["north", "south", "east"],
                    campfireSpots: [13, 28, 43],
                    shopSpots: { 10: "merchant", 26: "armor", 39: "weapon" },
                    outerCount: 49
                },
                {
                    id: "grimvault_dungeon",
                    name: "Grimvault Dungeon",
                    x: 72,
                    y: 18,
                    biome: "dungeon",
                    icon: "🏚️",
                    description: "A sealed dungeon descent waits behind heavy ironwork and old warning sigils.",
                    flavor: "Collapsed outworks and prison ruins surround the main descent into Grimvault.",
                    portalType: "dungeon",
                    subArea: "dungeon_grimvault",
                    majorArea: true,
                    locked: true,
                    requiredKey: "crypt key",
                    outerPrefix: "Grimvault",
                    sidePrefix: "Cellblock",
                    nodeNames: ["Approach", "Yard", "Hall", "Watch", "Post", "Court"],
                    itemPool: ["bone shard", "torch", "cloth"],
                    branchDirections: ["east", "west", "south"],
                    campfireSpots: [16, 32, 47],
                    outerCount: 49
                },
                {
                    id: "haunted_manor",
                    name: "Marrowfield Manor",
                    x: -18,
                    y: 0,
                    biome: "house",
                    icon: "🏚️",
                    description: "A haunted manor looms over broken hedges and a silent courtyard.",
                    flavor: "Rotting fences, collapsed servant paths, and dead gardens stretch around the estate.",
                    portalType: "haunted house",
                    subArea: "haunted_house_marrowfield",
                    majorArea: true,
                    outerPrefix: "Marrowfield",
                    sidePrefix: "Courtyard",
                    nodeNames: ["Path", "Gallery", "Garden", "Wing", "Walk", "Hall"],
                    itemPool: ["cloth", "bandage", "bone shard"],
                    branchDirections: ["north", "south"],
                    campfireSpots: [21, 42],
                    outerCount: 49
                },
                {
                    id: "moonfall_cave",
                    name: "Moonfall Cave",
                    x: -36,
                    y: 0,
                    biome: "cave",
                    icon: "🕳️",
                    description: "A damp cavern mouth opens into mineral tunnels and echoing chambers.",
                    flavor: "Water drips through stone arches while the air grows colder below the ridge.",
                    portalType: "cave",
                    subArea: "cave_moonfall",
                    majorArea: true,
                    outerPrefix: "Moonfall",
                    sidePrefix: "Tunnel",
                    nodeNames: ["Passage", "Chamber", "Grotto", "Shelf", "Hollow", "Bend"],
                    itemPool: ["torch", "bone shard", "hide", "raw meat"],
                    branchDirections: ["north", "south", "west"],
                    campfireSpots: [15, 30, 48],
                    outerCount: 49
                }
            ];

            regions.forEach((region) => {
                const regionText = this.buildLocationText(region.name, region.biome, "hub", region.id);
                add(region.id, region.name, region.x, region.y, region.biome, region.description, {
                    icon: region.icon,
                    items: region.items || [],
                    campfire: !!region.campfire,
                    majorArea: !!region.majorArea,
                    portalType: region.portalType || null,
                    subArea: region.subArea || null,
                    locked: !!region.locked,
                    requiredKey: region.requiredKey || null,
                    regionType: "hub",
                    shortDescription: region.description,
                    lookDescription: `${region.flavor} ${regionText.lookDescription}`.trim()
                });
            });

            this.link(w, "start", "east", "forest_gate");
            this.link(w, "forest_gate", "east", "mountain_pass");
            this.link(w, "mountain_pass", "east", "long_bridge");
            this.link(w, "long_bridge", "east", "tharnwick_town");
            this.link(w, "tharnwick_town", "east", "velmora_city");
            this.link(w, "velmora_city", "east", "eldergate_kingdom");
            this.link(w, "tharnwick_town", "south", "grimvault_dungeon");
            this.link(w, "start", "west", "haunted_manor");
            this.link(w, "haunted_manor", "west", "moonfall_cave");

            const occupied = new Set();
            Object.keys(w).forEach((id) => {
                const c = w[id].coordinates;
                occupied.add(c.x + "," + c.y);
            });

            regions.forEach((region) => {
                const counter = { value: 0 };
                let remaining = region.outerCount || 0;
                while (remaining > 0) {
                    const created = this.growRegionMaze(w, region, remaining, counter, occupied);
                    if (created <= 0) break;
                    remaining -= created;
                }
            });

            return w;
        }

        roomPool(type) {
            const p = {
                forest:["Forest Entrance","Trail Segment","Deep Woods","Clearing","Moss Path","Creek Bend","Forest Exit"],
                "mountain pass":["Pass Entrance","Rock Trail","Cliff Ledge","Wind Shelf","Pass Exit"],
                bridge:["Bridge Gate","Bridge Segment","Midspan","Bridge Exit"],
                town:["Town Gate","Main Road","Market Lane","Blacksmith Corner","Inn Street","Town Exit"],
                city:["City Gate","Main Road","Merchant District","Back Alley","Tavern Row","Warehouse","City Exit"],
                kingdom:["Outer Gate","Royal Avenue","Court Plaza","Military Ward","Temple Lane","Kingdom Exit"],
                dungeon:["Dungeon Entrance","Outer Hall","Cell Corridor","Trap Hall","Ritual Room","Dungeon Exit"],
                cave:["Cave Entrance","Narrow Tunnel","Echo Chamber","Crystal Chamber","Cave Exit"],
                "haunted house":["Entrance Hall","Broken Living Room","Flickering Corridor","Cursed Basement","Storage Room","Manor Exit"],
                mall:["Mall Entrance","Main Atrium","Clothing Store","Weapon Store","Food Stall","Mall Exit"],
                generic:["Entrance","Path","Connector","Chamber","Exit"]
            };
            return p[type] || p.generic;
        }

        nextMajor(worldId) {
            const w = gameState.world;
            const here = w[worldId];
            if (!here || !here.exits) return null;
            const dirs = ["east","north","south","west"];
            for (let i=0;i<dirs.length;i++) {
                const id = here.exits[dirs[i]];
                if (id && this.isMajor(w[id])) return id;
            }
            return null;
        }

        areaType(subId, hint) {
            if (subId.indexOf("city_") === 0) return "city";
            if (subId.indexOf("town_") === 0) return "town";
            if (subId.indexOf("forest_") === 0) return "forest";
            if (subId.indexOf("pass_") === 0) return "mountain pass";
            if (subId.indexOf("bridge_") === 0) return "bridge";
            if (subId.indexOf("mall_") === 0) return "mall";
            if (subId.indexOf("dungeon_") === 0) return "dungeon";
            if (subId.indexOf("kingdom_") === 0) return "kingdom";
            if (subId.indexOf("cave_") === 0) return "cave";
            if (subId.indexOf("haunted_house_") === 0) return "haunted house";
            return hint || "generic";
        }

        decorateShops(areaType, subAreaId, area) {
            const mark = (idx, type) => {
                const id = subAreaId + "_n_" + idx;
                if (!area[id]) return;
                area[id].isShop = true;
                area[id].shopType = type;
                area[id].shopId = subAreaId + "_" + type + "_shop";
            };
            if (areaType === "city") { mark(3,"weapon"); mark(5,"armor"); mark(7,"clothing"); mark(9,"merchant"); }
            if (areaType === "town") { mark(3,"merchant"); mark(6,"weapon"); }
            if (areaType === "mall") { mark(1,"clothing"); mark(2,"weapon"); mark(3,"merchant"); mark(4,"rare"); }
            if (areaType === "kingdom") { mark(4,"armor"); mark(6,"weapon"); mark(8,"merchant"); }
        }

        // Build an interior area that acts like a maze between entrance and progression exit.
        // Interiors are supposed to be earned, explored, and survived, not speedrun in one click.
        buildArea(subAreaId, entranceWorldId, themeHint) {
            const type = this.areaType(subAreaId, themeHint);
            const pool = this.roomPool(type);
            let size = 18;
            if (type === "city") size = 34;
            if (type === "town") size = 22;
            if (type === "mall") size = Math.max(10, Math.floor(34 * 0.7));
            if (type === "dungeon") size = 26;
            if (type === "kingdom") size = 36;
            if (type === "forest") size = 24;
            if (type === "bridge") size = 12;
            if (type === "haunted house") size = 18;

            const area = {};
            const ent = subAreaId + "_entrance";
            const ex = subAreaId + "_exit";

            const interiorBiome = type === "mall" ? "shop" : (type === "mountain pass" ? "mountains" : (type === "haunted house" ? "house" : type));
            const bounds = {
                city: { x: 5, y: 5 },
                town: { x: 4, y: 4 },
                mall: { x: 4, y: 3 },
                dungeon: { x: 5, y: 4 },
                kingdom: { x: 6, y: 5 },
                forest: { x: 5, y: 4 },
                bridge: { x: 6, y: 2 },
                cave: { x: 5, y: 4 },
                "haunted house": { x: 4, y: 4 },
                generic: { x: 4, y: 4 }
            }[type] || { x: 4, y: 4 };
            const itemPools = {
                forest: ["healing herb", "feather", "raw meat", "hide"],
                "mountain pass": ["cloth", "bone shard", "torch"],
                bridge: ["cloth", "feather", "torch"],
                town: ["bandage", "cloth", "small health potion"],
                city: ["bandage", "cloth", "health potion", "lantern"],
                kingdom: ["lantern", "bandage", "health potion"],
                dungeon: ["bone shard", "torch", "cloth"],
                cave: ["torch", "bone shard", "raw meat", "hide"],
                "haunted house": ["cloth", "bandage", "bone shard"],
                mall: ["cloth", "bandage", "health potion"],
                generic: ["cloth"]
            };
            const randomAreaItem = () => {
                const poolItems = itemPools[type] || itemPools.generic;
                if (Math.random() >= 0.24 || !poolItems.length) return [];
                return [poolItems[Math.floor(Math.random() * poolItems.length)]];
            };

            const entranceText = this.buildLocationText(pool[0], interiorBiome, "entrance", ent);
            area[ent] = this.loc(ent, pool[0], 0, 0, interiorBiome, entranceText.shortDescription, {
                portalType: type,
                regionType: "entrance",
                icon: "🚪",
                shortDescription: entranceText.shortDescription,
                lookDescription: entranceText.lookDescription
            });
            area[ent].isPortalEntrance = true;
            area[ent].hasPortalExit = true;

            const occupied = new Set(["0,0"]);
            const frontier = [{ id: ent, depth: 0 }];
            let index = 1;
            let safety = 0;

            while (index < size - 1 && frontier.length > 0 && safety < size * 90) {
                safety++;
                const parentMeta = frontier[Math.max(0, frontier.length - 1 - (safety % Math.min(frontier.length, 4)))];
                const parent = area[parentMeta.id];
                if (!parent) {
                    frontier.pop();
                    continue;
                }

                const exitCount = Object.keys(parent.exits || {}).filter((dir) => ["north", "south", "east", "west"].includes(dir)).length;
                const limit = parent.id === ent ? 3 : (Math.random() < 0.18 ? 4 : 3);
                if (exitCount >= limit) {
                    frontier.splice(frontier.indexOf(parentMeta), 1);
                    continue;
                }

                const options = this.shuffle(["north", "south", "east", "west"]).filter((dir) => {
                    if (parent.exits[dir]) return false;
                    const vec = this.dirVector(dir);
                    const nx = parent.coordinates.x + vec.x;
                    const ny = parent.coordinates.y + vec.y;
                    if (Math.abs(nx) > bounds.x || Math.abs(ny) > bounds.y) return false;
                    return !occupied.has(nx + "," + ny);
                });

                if (!options.length) {
                    frontier.splice(frontier.indexOf(parentMeta), 1);
                    continue;
                }

                const expansions = parent.id === ent
                    ? Math.min(options.length, 2)
                    : Math.min(options.length, Math.random() < 0.22 && exitCount <= 1 ? 2 : 1);

                for (let i = 0; i < expansions && i < options.length && index < size - 1; i++) {
                    const dir = options[i];
                    const vec = this.dirVector(dir);
                    const nx = parent.coordinates.x + vec.x;
                    const ny = parent.coordinates.y + vec.y;
                    const id = subAreaId + "_n_" + index;
                    const suffix = index >= pool.length ? " " + (Math.floor(index / pool.length) + 1) : "";
                    const name = pool[index % pool.length] + suffix;
                    const text = this.buildLocationText(name, interiorBiome, "connector", id);

                    area[id] = this.loc(id, name, nx, ny, interiorBiome, text.shortDescription, {
                        portalType: type,
                        regionType: "connector",
                        shortDescription: text.shortDescription,
                        lookDescription: text.lookDescription,
                        items: randomAreaItem()
                    });
                    this.link(area, parent.id, dir, id);
                    occupied.add(nx + "," + ny);
                    frontier.push({ id: id, depth: parentMeta.depth + 1 });
                    index++;
                }
            }

            const candidates = Object.keys(area)
                .filter((id) => id !== ent)
                .sort((a, b) => {
                    const ca = area[a].coordinates;
                    const cb = area[b].coordinates;
                    const da = Math.abs(ca.x) + Math.abs(ca.y);
                    const db = Math.abs(cb.x) + Math.abs(cb.y);
                    return db - da;
                });
            let exitParentId = ent;
            let exitDirection = "east";

            for (let i = 0; i < candidates.length; i++) {
                const candidateId = candidates[i];
                const candidate = area[candidateId];
                const dirs = this.shuffle(["north", "south", "east", "west"]);
                for (let j = 0; j < dirs.length; j++) {
                    const dir = dirs[j];
                    if (candidate.exits[dir]) continue;
                    const vec = this.dirVector(dir);
                    const nx = candidate.coordinates.x + vec.x;
                    const ny = candidate.coordinates.y + vec.y;
                    if (Math.abs(nx) > bounds.x + 1 || Math.abs(ny) > bounds.y + 1) continue;
                    if (occupied.has(nx + "," + ny)) continue;
                    exitParentId = candidateId;
                    exitDirection = dir;
                    break;
                }
                if (exitParentId !== ent || candidates.length === 0) break;
            }

            if (exitParentId === ent) {
                const entranceDirs = this.shuffle(["north", "south", "east", "west"]);
                for (let i = 0; i < entranceDirs.length; i++) {
                    const dir = entranceDirs[i];
                    if (area[ent].exits[dir]) continue;
                    const vec = this.dirVector(dir);
                    const nx = area[ent].coordinates.x + vec.x;
                    const ny = area[ent].coordinates.y + vec.y;
                    if (occupied.has(nx + "," + ny)) continue;
                    exitDirection = dir;
                    break;
                }
            }

            const exitParent = area[exitParentId];
            const exitVec = this.dirVector(exitDirection);
            const exitX = exitParent.coordinates.x + exitVec.x;
            const exitY = exitParent.coordinates.y + exitVec.y;
            const exitName = pool[pool.length - 1];
            const exitText = this.buildLocationText(exitName, interiorBiome, "exit", ex);
            area[ex] = this.loc(ex, exitName, exitX, exitY, interiorBiome, exitText.shortDescription, {
                portalType: type,
                regionType: "exit",
                icon: "🚪",
                shortDescription: exitText.shortDescription,
                lookDescription: `${exitText.lookDescription} Reaching this route should let you push back into the wider world.`
            });
            area[ex].isProgressExit = true;
            area[ex].hasPortalExit = true;
            area[ex].unlockTargetWorldId = this.nextMajor(entranceWorldId);
            this.link(area, exitParentId, exitDirection, ex);

            if (type === "city") {
                const mall = subAreaId + "_mall_entrance";
                const connectorIds = Object.keys(area).filter((id) => id.indexOf(subAreaId + "_n_") === 0);
                const anchorId = connectorIds[Math.floor(connectorIds.length / 3)] || ent;
                let mallX = area[anchorId].coordinates.x;
                let mallY = area[anchorId].coordinates.y + 1;
                const mallOffsets = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
                for (let i = 0; i < mallOffsets.length; i++) {
                    const optionX = area[anchorId].coordinates.x + mallOffsets[i].x;
                    const optionY = area[anchorId].coordinates.y + mallOffsets[i].y;
                    if (!occupied.has(optionX + "," + optionY)) {
                        mallX = optionX;
                        mallY = optionY;
                        occupied.add(optionX + "," + optionY);
                        break;
                    }
                }
                const mallText = this.buildLocationText("Mall Entrance", "shop", "nested-portal", mall);
                area[mall] = this.loc(mall, "Mall Entrance", mallX, mallY, "shop", mallText.shortDescription, {
                    portalType: "mall",
                    subArea: "mall_" + entranceWorldId,
                    regionType: "nested-portal",
                    icon: "🏪",
                    shortDescription: mallText.shortDescription,
                    lookDescription: mallText.lookDescription
                });
                area[mall].nestedPortal = true;
                area[mall].hasPortalExit = true;
                area[anchorId].exits.mall = mall;
                area[mall].exits.back = anchorId;
            }

            this.decorateShops(type, subAreaId, area);
            area.entrance = ent;
            area.entranceLocation = entranceWorldId;
            area.visitedLocations = [ent];
            area.fastExit = ex;
            return area;
        }

        // Replace the base map generators with the evolved overworld/interior builders.
        // We patch instead of rewriting the whole app because the base systems still do a lot right.
        patchGeneration() {
            this.original.generateWorld = mapSystem.generateWorld.bind(mapSystem);
            this.original.generateSubArea = mapSystem.generateSubArea.bind(mapSystem);
            mapSystem.generateWorld = () => this.buildWorld();
            mapSystem.generateSubArea = (subAreaId, entranceLocationId, theme) => {
                gameState.subAreas[subAreaId] = this.buildArea(subAreaId, entranceLocationId, theme);
                return subAreaId;
            };
            this.log("AreaManager generation patched");
        }

        // Patch movement commands so major-area progression must be earned through interiors.
        // Earlier versions let players breeze past whole areas, which was great for speed and terrible for game design.
        patchMovementAndProgression() {
            this.original.processCommand = main.processCommand.bind(main);
            this.original.go = main.handleGoCommand.bind(main);
            this.original.look = main.handleLookCommand ? main.handleLookCommand.bind(main) : null;
            this.original.help = main.showHelp.bind(main);

            main.processCommand = (command) => {
                const cmd = (command || "").toLowerCase().trim();
                if (cmd === "enter") {
                    main.handleEnterCommand();
                    if (this.ctx && this.ctx.updateQuickButtons) this.ctx.updateQuickButtons();
                    return;
                }
                if (cmd === "exit" || cmd === "leave") {
                    main.handleExitCommand();
                    if (this.ctx && this.ctx.updateQuickButtons) this.ctx.updateQuickButtons();
                    return;
                }
                this.original.processCommand(command);
            };

            main.handleGoCommand = (command) => {
                const dir = (command || "").toLowerCase().trim().replace(/^go\s+/, "");
                const world = gameState.getCurrentWorld();
                const here = world[gameState.currentLocation];
                if (!here || !here.exits || !here.exits[dir]) {
                    this.original.go(command);
                    return;
                }
                const targetId = here.exits[dir];
                const target = world[targetId];
                if (!target) {
                    this.original.go(command);
                    return;
                }

                if (!gameState.currentSubArea && this.isMajor(here) && this.isMajor(target) && here.subArea && !this.isEdgeUnlocked(here.id,target.id)) {
                    main.addMessage("You must travel through the " + here.name.toLowerCase() + " to reach " + target.name + ".");
                    main.addMessage("Type 'enter' and find the internal exit first.");
                    return;
                }

                if (target.locked && gameState.markLockedLocationSeen) {
                    gameState.markLockedLocationSeen(targetId);
                    mapSystem.updateMapDisplay();
                }

                this.original.go(command);

                const cw = gameState.getCurrentWorld();
                const cl = cw[gameState.currentLocation];
                if (gameState.currentSubArea && cl && cl.isProgressExit) {
                    const stack = gameState.areaState.portalStack || [];
                    const top = stack[stack.length - 1];
                    if (top && top.entranceWorldId && cl.unlockTargetWorldId) {
                        this.setEdgeUnlocked(top.entranceWorldId, cl.unlockTargetWorldId);
                    }
                }
                if (this.ctx && this.ctx.updateQuickButtons) this.ctx.updateQuickButtons();
            };

            main.handleEnterCommand = () => {
                const world = gameState.getCurrentWorld();
                const loc = world[gameState.currentLocation];
                if (!loc) return;

                if (!loc.subArea || loc.locked) {
                    if (loc.locked) main.addMessage("This area is locked. You need " + (loc.requiredKey || "a key") + ".");
                    else main.addMessage("There is nothing to enter here.");
                    return;
                }

                if (!gameState.subAreas[loc.subArea]) {
                    mapSystem.generateSubArea(loc.subArea, gameState.currentLocation, loc.portalType || loc.biome || "generic");
                }

                const area = gameState.subAreas[loc.subArea];
                if (!area || !area.entrance) {
                    main.addMessage("This area cannot be entered right now.");
                    return;
                }

                gameState.areaState.portalStack.push({
                    subAreaId: loc.subArea,
                    returnSubArea: gameState.currentSubArea || null,
                    returnLocation: gameState.currentLocation,
                    entranceWorldId: gameState.currentSubArea ? null : gameState.currentLocation
                });

                gameState.clearLocationLookState(gameState.currentLocation, world);
                gameState.currentSubArea = loc.subArea;
                gameState.currentMap = loc.subArea;
                gameState.currentLocation = area.entrance;
                gameState.areaState.currentInternalArea = loc.subArea;
                gameState.areaState.nestedPortalDepth = gameState.areaState.portalStack.length;
                gameState.prepareLocationForVisit(gameState.currentLocation, area);

                if (!area.visitedLocations) area.visitedLocations = [];
                if (area.visitedLocations.indexOf(area.entrance) === -1) area.visitedLocations.push(area.entrance);

                main.addMessage("You enter " + loc.name + ".");
                mapSystem.updateMapDisplay();
                mapSystem.updateMapTitle();
                uiController.updateGameDisplay();
                if (this.ctx && this.ctx.updateQuickButtons) this.ctx.updateQuickButtons();
            };

            main.handleExitCommand = () => {
                if (!gameState.currentSubArea || !gameState.areaState.portalStack.length) {
                    main.addMessage("You are not in an area interior.");
                    return;
                }
                const world = gameState.getCurrentWorld();
                const loc = world[gameState.currentLocation];

                if (loc && !loc.hasPortalExit && !loc.isPortalEntrance && !loc.isProgressExit) {
                    main.addMessage("Find an interior exit node before leaving.");
                    return;
                }

                const top = gameState.areaState.portalStack.pop();
                gameState.areaState.nestedPortalDepth = gameState.areaState.portalStack.length;

                if (top.returnSubArea) {
                    gameState.currentSubArea = top.returnSubArea;
                    gameState.currentMap = top.returnSubArea;
                    gameState.currentLocation = top.returnLocation;
                } else {
                    gameState.currentSubArea = null;
                    gameState.currentMap = "world";
                    gameState.currentLocation = top.returnLocation;
                    gameState.areaState.currentWorldArea = top.returnLocation;
                }

                gameState.areaState.currentInternalArea = gameState.currentSubArea;
                gameState.prepareLocationForVisit(gameState.currentLocation);
                main.addMessage("You return from the interior area.");
                mapSystem.updateMapDisplay();
                mapSystem.updateMapTitle();
                uiController.updateGameDisplay();
                if (this.ctx && this.ctx.updateQuickButtons) this.ctx.updateQuickButtons();
            };

            if (this.original.look) {
                main.handleLookCommand = () => {
                    const result = this.original.look();
                    if (result === false) return result;
                    const world = gameState.getCurrentWorld();
                    const loc = world[gameState.currentLocation];
                    if (!loc) return;
                    if (loc.subArea && !loc.locked) {
                        main.addMessage("Type 'enter' to enter this area.");
                    }
                    if (gameState.currentSubArea && (loc.hasPortalExit || loc.isPortalEntrance || loc.isProgressExit)) {
                        main.addMessage("Type 'exit' to leave this interior area.");
                    }
                    return result;
                };
            }

            main.showHelp = () => {
                this.original.help();
                main.addMessage("enter - Enter major areas and nested portals");
                main.addMessage("exit - Exit interior areas from valid exit nodes");
            };

            this.log("AreaManager movement patched");
        }

        // Replace incompatible worlds from older versions and re-anchor the player safely.
        // Not glamorous, but much better than leaving old saves to explode in creative ways.
        migrateWorld() {
            const w = gameState.world;
            const refresh = !w || !w.start || w.start.worldVersion !== "wes-v4";
            if (refresh) {
                gameState.world = this.buildWorld();
                gameState.currentLocation = "start";
                gameState.currentSubArea = null;
                gameState.currentMap = "world";
                gameState.subAreas = {};
                gameState.visitedLocations = ["start"];
                gameState.mapDiscovery.discoveredCells = new Set(["start"]);
                gameState.mapDiscovery.visiblePaths = new Set();
                this.log("World migrated by AreaManager");
            }
            const cur = gameState.world[gameState.currentLocation] || gameState.world.start;
            gameState.areaState.currentWorldArea = cur ? cur.id : "start";
        }
    }

    window.AreaManager = AreaManager;
})();
