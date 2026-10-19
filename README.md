This is the readme for my evolution simulator, The Life Engine. 

FOR FEATURE REQUESTS, USE THE DISCUSSIONS TAB. FOR BUG REPORTS, USE THE ISSUES TAB. :)

# The Life Engine
[Play here!](https://thelifeengine.net/)

The life engine is a cellular automaton designed to simulate the long term processes of biological evolution. It allows organisms to eat, reproduce, mutate, and adapt.
Unlike genetic algorithms, the life engine does not manually select the most "fit" organism for some given task, but rather allows true natural selection to 
run its course. Organisms that survive, successfully produce offspring, and out-compete their neighbors naturally propogate througout the environment.

This is the second version of the [original evolution simulator](https://github.com/MaxRobinsonTheGreat/EvolutionSimulator), which I started in high school.


# How to Run and Modify the Code
 - [Install node and npm](https://nodejs.org/en/download/)
 - Download or clone this repository
 - Open a terminal or powershell comand prompt, go to the repository and run `npm install`
 - Run `npm run build` (or `npm run build-watch` for a better developer experience)
   - If you get a `Can't resolve jquery` error message run `npm install --save jquery`
 - Open `dist/index.html` in your browser. The simulation should start running.

To load custom creations (found in `/dist/assets`), you must have a simple web server that serves all files in the dist directory. I do this with python:
 - [Install python](https://www.python.org/downloads/)
 - run `python -m http.server --directory dist` from the repository root
 - Open `http://localhost:8000/` in your browser

### Npm build commands
- Production mode (minified): `npm run build`
- Watch mode (dev mode that auto-builds when you save a file): `npm run build-watch`
- Dev mode (better error messages): `npm run build-dev` 
- Local web server, an alternative to the python one above: `npm start`, then open `http://localhost:8000/`
- Tests (runs the simulation headless in Node): `npm test`


# How the Simulation Works
## The Environment
The environment is a simple grid system made up of cells, which at every tick have a certain type. The environment is populated by organisms, which are structures of multiple cells.

## Cells
A cell can be one of the following types.
### Independent Cells
Independent cells are not part of organisms. 
- Empty - Dark blue, inert.
- Food - Grayish-blue, provides nourishment for organisms.
- Wall - Gray, blocks organisms movement and reproduction.
### Organism Cells
Organism Cells are only found in organisms, and cannot exist on their own in the grid.
- Mouth - Orange, eats food in directly adjacent cells.
- Producer - Green, randomly generates food in directly adjacent empty cells.
- Mover - Light blue, allows the organism to move and rotate randomly.
- Killer - Red, harms organisms in directly adjacent cells (besides itself).
- Armor - Purple, negates the effects of killer cells.
- Eye - Light purple with a slit, allows the organism to see and move intelligently. See further description below.
- Gauge - Gold with a black dot in the middle, senses how much food is nearby and slows its organism's reproduction when food is scarce. *Implemented by Zuhayr Khot.* See [Gauge Cell](#gauge-cell-implemented-by-zuhayr-khot) below.

## Organisms
Organisms are structures of cells that eat food, reproduce, and die.
When an organism dies, every cell in the grid that was occupied by a cell in its body will be changed to food.
Their lifespan is calculated by multiplying the number of cells they have by the hyperparameter `Lifespan Multiplier`. They will survive for that many ticks unless killed by another organism.
When touched by a killer cell, an organism will take damage. Once it has taken as much damage as it has cells in its body, it will die. If the hyperparameter `One touch kill` is on, an organism will immediatly die when touched by a killer cell.

## Reproduction
Once an organism has eaten as much food as it has cells in its body, it will attempt to reproduce. Organisms with a gauge cell may need extra food first if food around them is scarce (see [Gauge Cell](#gauge-cell-implemented-by-zuhayr-khot)). 
First, offspring is formed by cloning the current organism and possibly mutating it (see below).
The offspring birth location is then chosen a certain number of cells in a random direction (up, down, left, right). This number is calculated programmatically such that it is far enough away that it can't intersect with it's parent.
Additionally, a random value between 1 and 3 is added to the location to introduce a little variance.
Reproduction can fail if the offspring attempts to occupy non-empty cells, like other organisms and food. If reproduction fails, the food required to produce a child is wasted.

## Mutation
Offspring can mutate their anatomies in 3 different ways: change a cell, lose a cell, or add a cell. Changing a cell sets a random cell to a random type. Losing a cell removes a random cell. Note that this can result in organisms with "gaps" and cells disconnected from the rest of its body. I consider this a feature, not a bug.
To add a cell the organism first selects a cell it already has in its body, then grows a new cell with a random type in a location adjacent to the selected cell.

If an organism mutates, there is a 10% chance that mutation will alter the movement patterns of the organism (see below).

## Movement and Rotation
Organisms with mover cells (light blue) are permitted to move freely about the grid. Only a single mover cell is required and adding more doesn't do anything. By default, an organism selects a random direction and moves one cell per tick in that direction for a certain number of ticks. This number is called "Move range", and it can mutate over time.

Organims can also rotate around a central pivot cell. This cell can never be removed by mutation, though it can change type. Movers rotate randomly when they change direction, and their rotation is not necessarily the same as their movement direction, ie, they aren't always facing the direction they are moving. Offspring of all organisms (including static ones) rotate randomly during reproduction. This rotation can be toggled in the simulation controls.

## Eyes and Brains
Any organism can evolve eyes, but when an organism has both eyes and mover cells it is given a brain. The eye, unlike other cells, has a direction, which is denoted by the direction of the slit in the cell. It "looks" forward in this direction and "sees" the first non-empty cell within a certain range. It checks the type of the cell and informs the brain, which then decideds how to move. The brain can either ignore (keep moving in whatever direction), chase (move towards the observed cell), or retreat (move in the opposite direction of the observed cell). The brain maps different observed cell types to different actions. For instance, the brain will chase when it sees food and retreat when it sees a killer cell. These behaviors can mutate over time. 

# Project Modifications (CSC4044Z Artificial Life, 2026 – Forward Facing Crabs)
This repository is the LifeEngine `develop` branch with modifications made for the CSC4044Z project *Reproducing Evolutionary Suicide*.

## Gauge Cell (implemented by Zuhayr Khot)
### Purpose
In our trials, our dominant animal species ate out every plant species and then starved. The gauge cell tests whether that collapse is genuine evolutionary suicide: it gives an organism a simple way to read its surroundings and hold back from reproducing when food is running out. Gauge cells only appear through random mutation, so whether restraint helps or hurts a lineage is decided by natural selection, not by the code.

### How it works
- **Sensing:** every tick, each gauge cell counts the food tiles in an 11x11 square around itself (ignoring its own organism's body) and works out the **food density**, the fraction of those tiles that are food.
- **Sensitivity:** each gauge cell has its own scarcity threshold, between 2% and 20% food density. A gauge created by mutation gets a random sensitivity, which its descendants inherit unchanged. A gauge placed by hand in the editor uses 8%.
- **Scarcity:** if density is at or above the threshold, the gauge does nothing. Below it, `scarcity = 1 - density / sensitivity`, which is 0 at the threshold and 1 when there is no food at all.
- **Restraint:** the gauge adds `ceil(body size x MAX_RESTRAINT x scarcity)` extra food to the cost of producing a child. With the default `MAX_RESTRAINT = 1.0`, a child costs at most twice the normal food. The extra food is used up when the child is born, so restrained organisms produce fewer offspring while food is scarce.
- **Several gauges:** if an organism has more than one gauge, the highest penalty that tick (the most pessimistic gauge) is used.
- The penalty is recalculated every tick, so restraint stops as soon as food recovers.

### No hard-coded outcomes
The gauge cell never kills an organism and never blocks reproduction completely. It only changes the food cost of a child, based on what it measures in the world at that moment. It also gives its own organism no direct advantage, so any survival or extinction outcome is emergent.

### Settings
The constants at the top of `src/Organism/Cell/BodyCells/GaugeCell.js` can be changed for experiments:

| Constant | Default | Meaning |
|---|---|---|
| `GAUGE_RANGE` | 5 | Sensing radius (5 gives an 11x11 square) |
| `MIN_SENSITIVITY` | 0.02 | Lowest possible scarcity threshold |
| `MAX_SENSITIVITY` | 0.20 | Highest possible scarcity threshold |
| `DEFAULT_SENSITIVITY` | 0.08 | Threshold for gauges placed in the editor |
| `MAX_RESTRAINT` | 1.0 | Maximum extra cost of a child, as a multiple of body size |

### Files changed
- `src/Organism/Cell/BodyCells/GaugeCell.js` (new): the gauge cell's behaviour.
- `src/Organism/Cell/CellStates.js`: adds the `gauge` cell state and includes it in the lists of all and living cell types, so it can appear through mutation and is counted in the statistics charts.
- `src/Organism/Cell/BodyCells/BodyCellFactory.js`: registers `GaugeCell`.
- `src/Organism/Organism.js`: adds `gauge_penalty` and `gauge_tick`, and adds `gauge_penalty` to `foodNeeded()`.
- `src/Organism/Perception/Brain.js`: when a saved brain is loaded, adds a default ("ignore") decision for any cell type it doesn't know about, so organisms saved before the gauge cell existed can still be loaded.
- `src/Rendering/ColorScheme.js`: adds a gauge color (gold, with a black dot) to each color scheme. The grayscale scheme stays gray but still gets the dot.
- `src/Organism/Cell/CellStates.js` also draws the black dot in the middle of the gauge cell, so it can't be mistaken for the mouth.
- `dist/css/style.css`: draws the same dot on the gauge swatches in the editor and the cell legend.
- `src/Controllers/EditorController.js` and `dist/index.html`: add the gauge cell to the organism editor and the cell legend.

## Storms (implemented by Zuhayr Khot)
### Purpose
Extinction in the simulation can have two very different causes: the organisms doing it to themselves (evolutionary suicide) or something in the environment simply wiping them out. Storms are an outside disturbance we can switch on or off, so a run with storms can be compared with the same run without them. That helps separate extinctions the organisms caused from extinctions the weather caused.

### How it works
- **Chance:** every tick there is a very small chance that a storm strikes (default **0.02%** per tick, about one storm every 5,000 ticks).
- **Area:** the storm lands on a random tile and affects a circle around it (default **radius 8 cells**).
- **Effect:** every organism with at least one cell inside the circle dies, and all food inside the circle is destroyed (including the bodies of the organisms it just killed). Walls are left alone because they are terrain, not life. An organism that is only partly inside the circle still dies, and the part of its body outside the circle turns into food, as with any death. Dormant plant seeds inside the circle are destroyed too (see [Plant Seeds](#plant-seeds)).
- **Look:** the affected circle flashes light blue for about a second. This is only visual.
- **Time:** a storm happens in a single tick. It is not an ongoing weather system.

### Using it in the simulation
Open the **Evolution Controls** tab and scroll down to **Storms**:
- **Storms enabled**: turn storms on or off (they are on by default, so untick this for a no-storm baseline run).
- **Storm chance (% per tick)** and **Storm radius (cells)**.
- **Trigger storm now**: strikes a random patch immediately, handy for testing.
- **Download storm log**: saves the storm log as a `.json` file.

The **Statistics** tab shows how many storms there have been this run, the current storm chance and what the last storm did. The three storm settings are saved and loaded with worlds like the other evolution controls, and "Reset all controls" puts them back to the defaults.

### The storm log
Every storm adds an entry to a log (kept in memory, and kept when the world auto-resets after total extinction). **It is not part of world save files, so download it before closing the page.** Each entry records:

| Field | Meaning |
|---|---|
| `id`, `source` | Storm number, and whether it was `natural` or `manual` (the button) |
| `tick`, `reset_count` | When it happened, and which run (auto-reset count) |
| `col`, `row`, `radius` | Where it landed and how big it was |
| `organisms_killed`, `food_destroyed`, `seeds_destroyed` | What it destroyed |
| `species_hit`, `species_extinct` | Species it touched, and which of them it drove extinct |
| `population_after`, `wiped_out_world` | Living organisms left, and whether the storm killed the entire population |

Any extinction listed under `species_extinct` was caused by a storm, so it should not be counted as evolutionary suicide.

### No hard-coded outcomes
Storms never choose a species and never force an extinction. They hit a random patch and affect whatever is in it, so whether a lineage survives depends on where it lives and how spread out it is. If a storm ever wipes out the whole population, the engine's normal "reset on total extinction" setting takes over, exactly as it would for any other extinction.

### Files changed
- `src/Environments/StormSystem.js` (new): all of the storm logic and the log.
- `src/Environments/WorldEnvironment.js`: creates the storm system, rolls for a storm at the start of each tick, and draws the flash after the normal drawing.
- `src/Hyperparameters.js`: adds `stormsEnabled`, `stormChance` and `stormRadius`.
- `src/Controllers/ControlPanel.js` and `dist/index.html`: add the Storms controls to the Evolution Controls tab and wire them up.
- `src/Stats/StatsPanel.js` and `dist/index.html`: add the storm line to the Statistics tab.

## Plant Seeds
### Purpose
When the plant population crashes, food stops being produced and everything that depends on it starves. Seeds give plants a way to come back: a dying plant can leave a seed that sprouts after a random delay. This lets us test whether food can recover after a crash, and whether a lineage that looks extinct is really gone or only waiting in the soil.

### How it works
- **Who leaves seeds:** a plant is any organism with producer cells and no mover cells. When a plant dies of old age, killer cells or a storm, it leaves a seed with probability **Seed chance** (default **10%**). Organisms removed by hand (the kill tool, or drawing walls over them) never leave seeds.
- **Where it falls:** on a random tile within **Seed scatter radius** cells of the plant's center (default **3**). Seeds are not drawn on the grid and nothing can eat them.
- **When it sprouts:** after a random delay between **Sprout delay min** and **max** (default **200** to **2000** ticks).
- **Same rules as a normal birth:** the sprout needs room on the grid, respects **Food blocks reproduction** and respects the organism limit. If it's blocked, it tries again every 20 ticks on the same spot. Scattering is what lets seeds find room after a total die-off: each plant's body turns into food where it stood, and with nothing alive to eat it, a seed dropped exactly there could never sprout.
- **Rotting:** a seed that still hasn't sprouted **Seed rots after** ticks after falling (default **5000**) is gone.
- **What sprouts:** an exact copy of the parent (no mutation) that joins the parent's species. If that species had died out in the meantime, it comes back: it's listed as extant again, keeps its lineage IDs, and its `revivals` count goes up by one.
- **Storms** destroy every seed inside their circle, including seeds that the plants they just killed dropped inside it.
- **Extinction and auto-reset:** dormant seeds don't keep a world going. As soon as no living organisms are left, the world auto-resets (or auto-pauses) as usual, and a reset clears the seeds too. To watch seeds bring back a world after a total die-off, turn auto-reset off.

### Settings
All of these are in the **Evolution Controls** tab under **Seeds**. They're saved and loaded with worlds and controls files, and "Reset all controls" puts them back to the defaults.

| Setting | Default | Meaning |
|---|---|---|
| Seeds enabled | on | Whether dying plants can leave seeds. Seeds already in the ground still sprout or rot when this is off. |
| Seed chance (% per plant death) | 10 | Chance that a dying plant leaves a seed. 0 gives a no-seed baseline. |
| Sprout delay min / max (ticks) | 200 / 2000 | Each seed waits a random number of ticks in this range before it first tries to sprout. |
| Seed rots after (ticks) | 5000 | A seed that hasn't sprouted this long after falling rots. |
| Seed scatter radius (cells) | 3 | How far from the dying plant a seed can land. 0 drops it exactly where the plant was. |

The **Statistics** tab shows how many seeds are dormant, and how many have been dropped, sprouted, rotted and destroyed by storms this run.

### The data
- **Lineage CSV** (`lineages.csv`): six new columns at the end of each row:
  - `seed_chance`: the chance in effect, or 0 when seeds are off.
  - `seeds_dormant`: seeds waiting right now.
  - `seeds_dropped`, `seeds_sprouted`, `seeds_rotted`, `seeds_destroyed`: counts since the previous sample.

  A row with `population` 0 and `seeds_dormant` above 0 means nothing is alive but the world hasn't ended yet.
- **Lineage tree CSV** (`lineages_tree.csv`): a new `revivals` column at the end, showing how many times each lineage came back from seed after going extinct.
- **Storm log:** each storm records `seeds_destroyed`.
- **World saves** include the dormant seeds, together with the species of seeds whose species has died out, so they can still bring it back after loading. Older saves without seeds still load.

### No hard-coded outcomes
Seeds never guarantee recovery. A seed only sprouts if there's room for it by the normal birth rules, and the sprouts then have to survive and reproduce like any other plant. In headless tests with **Food blocks reproduction** on and auto-reset off, seeds sprouted in every world after killing every organism. With scatter radius 1–5, the plants re-established in 5–6 of 8 worlds and died out again in the rest. With scatter radius 0, no seed ever sprouted.

### Files changed
- `src/Environments/SeedBank.js` (new): dropping, scattering, sprouting and rotting seeds, storm destruction, the counters, and saving and loading.
- `src/Hyperparameters.js`: adds `seedsEnabled`, `seedChance`, `seedDelayMin`, `seedDelayMax`, `seedMaxDormancy` and `seedScatterRadius`.
- `src/Organism/Organism.js`: `die(leave_seed = true)` asks the seed bank for a seed before the body turns to food.
- `src/Environments/WorldEnvironment.js`: creates and updates the seed bank, clears it on reset and on world load, and saves and loads it.
- `src/Controllers/EnvironmentController.js`: deaths caused by hand leave no seeds.
- `src/Environments/StormSystem.js`: storms destroy seeds in their circle and log `seeds_destroyed`.
- `src/Stats/FossilRecord.js` and `src/Stats/Species.js`: species brought back from seed are extant again, with `end_tick` -1 and a `revivals` count.
- `src/Stats/LineageTracker.js`: the seed columns and the `revivals` column.
- `src/Controllers/ControlPanel.js`, `src/Stats/StatsPanel.js` and `dist/index.html`: the Seeds controls and the Statistics line.

## Food Decay and Seasons (implemented by Lawton Springbok)
### Purpose
In the original engine, food never goes away until something eats it, so a world can keep a large stockpile of food even after its plants are gone. Food decay makes food a resource that has to be produced continuously. Seasonal booms make plant production vary over time, so we can see whether populations that grow during good times overshoot and collapse afterwards.

### How it works
- **Decay:** every food tile (plant food, corpses and dropped food alike) rots after **Avg food lifetime** ticks on average. Rotted food becomes an empty tile, or water on a water tile. To keep the cost per tick fixed, the grid is checked in slices: every tile is checked once every 60 ticks, with a chance of `60 / lifetime` of rotting. A lifetime of 60 or less means food rots at its first check.
- **Booms:** with seasons on, every tick outside a boom has a **Boom chance** of starting one. During a boom, producer cells are **Boom strength** times as likely to make food, and the automatic food drop releases that many times as much food. A boom lasts **Boom duration** ticks, then production goes back to normal. A strength of 0 stops all plant production for the duration (a bust).
- The boom multiplier is kept on the world, not in the settings, so saving during a boom doesn't save the boosted rate as the setting. World saves do keep the boom that is in progress, and loading a save from before seasons existed starts out of season.

### Settings
These are in the **Evolution Controls** tab. They're saved and loaded with worlds and controls files, and "Reset all controls" puts them back to the defaults.

| Setting | Default | Meaning |
|---|---|---|
| Avg food lifetime (ticks, 0 = never) | 0 | Average number of ticks a food tile lasts. 0 turns decay off. |
| Enable seasonal booms | off | Whether booms can happen. |
| Boom chance (% per tick) | 0.05 | Chance per tick that a boom starts. |
| Boom strength (x) | 4 | Food production multiplier during a boom. |
| Boom duration (ticks) | 400 | How long a boom lasts. |

Both are off by default, so existing saved worlds behave as they were balanced.

### Files changed
- `src/Environments/WorldEnvironment.js`: `decayFood()`, `updateSeason()` and `startBoom()`. The boom state is cleared on reset, and saved and loaded with worlds.
- `src/Organism/Cell/BodyCells/ProducerCell.js`: production is multiplied by the boom multiplier.
- `src/Hyperparameters.js`: adds `foodLifetime`, `seasonsEnabled`, `boomChance`, `boomStrength` and `boomDuration`.
- `src/Controllers/ControlPanel.js` and `dist/index.html`: the controls.
- `serve.js` (new): a small local web server (`npm start`).

## Islands and Wings (implemented by Miguel Lavarinhas)
### Purpose
In a single open world, a species that overexploits its food can spread everywhere and take every population down with it. Islands split the world into patches separated by water, so populations can be isolated from each other. Wings let animals cross the water, so whether moving between islands helps or hurts a lineage is left to evolution.

### How it works
- **Islands:** when a world starts or resets with **Islands enabled**, Perlin noise turns roughly half of the map into water (47–56% in headless tests). The area within 8 cells of the first organism is always land. The layout is new every time.
- **Water:** organisms that can't fly can't move onto water, and they can't be born or sprout onto it. A tile that an organism or food leaves turns back into water. Food can lie on water, for example when a flying organism dies over it.
- **Who can fly:** an organism flies if it has at least one wings cell, at least one mover cell and no producer cells.
- **Wings mutation:** with **Wings can mutate** on, mutation can create wings cells, but only in animals (mover cells and no producer cells). An organism that isn't an animal loses any wings it has: on mutation, when it's placed in the world and when it's generated randomly. A wings cell in the centre becomes a mouth, because the centre cell can't be removed.
- **Saving:** water is saved with worlds. Older saves without water load as flat worlds.

### Settings
These are in the **Evolution Controls** tab, saved and loaded with worlds and controls files.

| Setting | Default | Meaning |
|---|---|---|
| Wings can mutate | on | Whether mutation and random organisms can create wings cells. Existing wings are kept when this is turned off. |
| Islands enabled | on | Whether worlds are generated with islands. **Takes effect on the next reset**; the current world keeps its water, or stays flat, until then. |

### Known quirks
- Eyes see water as a cell type, so an eye stops at the first water tile and doesn't see food beyond it.
- Gauge cells count water tiles in the area they sense, so near the coast they read a lower food density.
- A seed that lands on water can never sprout, and rots.
- "Reset with this organism" from the editor gives a world with no water.

### Files changed
- `src/Environments/WorldEnvironment.js`: island generation, water on tiles that are vacated, and saving and loading water.
- `src/Organism/Organism.js`: who can fly, water blocking movement and births, wings only for animals.
- `src/Organism/Cell/BodyCells/WingsCell.js` (new), `src/Organism/Cell/CellStates.js` and `src/Organism/Cell/BodyCells/BodyCellFactory.js`: the wings and water cell types.
- `src/Organism/RandomOrganismGenerator.js` and `src/Environments/OrganismEditor.js`: random organisms follow the wings rules.
- `src/Rendering/ColorScheme.js`: wings and water colours for each colour scheme.
- `src/Hyperparameters.js`, `src/Controllers/ControlPanel.js`, `src/Controllers/EditorController.js` and `dist/index.html`: the settings, the wings cell in the editor, and the wings and water legend entries.
