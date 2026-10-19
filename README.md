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
- Seeds and lineage tracking with every other project feature off, written to CSV files: `npm run experiment:lineage` (see [Testing seeds on their own](#testing-seeds-on-their-own))


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
- Gauge - Gold with a black dot in the middle, senses how much food is nearby and slows its organism's reproduction when food is scarce. *Implemented by Zuhayr Khot.* See [Gauge Cell](#gauge-cell-and-storms-implemented-by-zuhayr-khot) below.

## Organisms
Organisms are structures of cells that eat food, reproduce, and die.
When an organism dies, every cell in the grid that was occupied by a cell in its body will be changed to food.
Their lifespan is calculated by multiplying the number of cells they have by the hyperparameter `Lifespan Multiplier`. They will survive for that many ticks unless killed by another organism.
When touched by a killer cell, an organism will take damage. Once it has taken as much damage as it has cells in its body, it will die. If the hyperparameter `One touch kill` is on, an organism will immediatly die when touched by a killer cell.

## Reproduction
Once an organism has eaten as much food as it has cells in its body, it will attempt to reproduce. Organisms with a gauge cell may need extra food first if food around them is scarce (see [Gauge Cell](#gauge-cell-and-storms-implemented-by-zuhayr-khot)). 
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

## Gauge Cell and Storms (implemented by Zuhayr Khot)
### Purpose
Extinction in the simulation can have two very different causes: organisms driving themselves out of existence (evolutionary suicide), or something in the environment wiping them out. These two modifications test both sides.

The **gauge cell** gives organisms an evolvable way to hold back when food is running low. In early trials the dominant animal species ate out every plant species and then starved, so the gauge tests whether a species can evolve its way out of overconsumption, and whether it keeps that restraint once a cheaper, unrestrained mutant appears.

**Storms** strike random patches of the world regardless of species. They test whether a lineage is resilient or only doing well in one part of the map. Because every storm is logged, extinctions caused by the weather can be told apart from extinctions the organisms caused themselves.

### How it works
#### Gauge cell
- **Sensing:** every tick, each gauge cell counts the food tiles in an 11x11 square around itself (ignoring its own organism's body) and works out the **food density**, the fraction of those tiles that are food.
- **Sensitivity:** each gauge cell has its own scarcity threshold, between 2% and 20% food density. A gauge created by mutation gets a random sensitivity, which its descendants inherit unchanged. A gauge placed by hand in the editor uses 8%.
- **Scarcity:** if density is at or above the threshold, the gauge does nothing. Below it, `scarcity = 1 - density / sensitivity`, which is 0 at the threshold and 1 when there is no food at all.
- **Restraint:** the gauge adds `ceil(body size x MAX_RESTRAINT x scarcity)` extra food to the cost of producing a child. With the default `MAX_RESTRAINT = 1.0`, a child costs at most twice the normal food. The extra food is used up when the child is born, so restrained organisms produce fewer offspring while food is scarce.
- **Several gauges:** if an organism has more than one gauge, the highest penalty that tick (the most pessimistic gauge) is used.
- The penalty is recalculated every tick, so restraint stops as soon as food recovers.
- Gauge cells appear through random mutation (unless **Gauge cells can mutate** is off, see [Settings](#settings)), or when placed by hand in the organism editor.

#### Storms
- **Chance:** every tick there is a very small chance that a storm strikes (default **0.02%** per tick, about one storm every 5,000 ticks).
- **Area:** the storm lands on a random tile and affects a circle around it (default **radius 8 cells**).
- **Effect:** every organism with at least one cell inside the circle dies, and all food inside the circle is destroyed (including the bodies of the organisms it just killed). Walls and water are left alone because they are terrain, not life. An organism that is only partly inside the circle still dies, and the part of its body outside the circle turns into food, as with any death. Dormant plant seeds inside the circle are destroyed too (see [Plant Seeds and Lineage Tracking](#plant-seeds-and-lineage-tracking-implemented-by-dylan)).
- **Look:** the affected circle flashes light blue for about a second. This is only visual.
- **Time:** a storm happens in a single tick. It is not an ongoing weather system.

### Settings
#### Gauge cell
**Gauge cells can mutate** (Evolution Controls tab, default on): when off, mutation and random organisms never create gauge cells. Gauges that already exist are kept. It's saved and loaded with worlds and controls files, and "Reset all controls" turns it back on.

The constants at the top of `src/Organism/Cell/BodyCells/GaugeCell.js` can be changed for experiments:

| Constant | Default | Meaning |
|---|---|---|
| `GAUGE_RANGE` | 5 | Sensing radius (5 gives an 11x11 square) |
| `MIN_SENSITIVITY` | 0.02 | Lowest possible scarcity threshold |
| `MAX_SENSITIVITY` | 0.20 | Highest possible scarcity threshold |
| `DEFAULT_SENSITIVITY` | 0.08 | Threshold for gauges placed in the editor |
| `MAX_RESTRAINT` | 1.0 | Maximum extra cost of a child, as a multiple of body size |

#### Storms
These are in the **Evolution Controls** tab under **Storms**. They're saved and loaded with worlds and controls files, and "Reset all controls" puts them back to the defaults.

| Setting | Default | Meaning |
|---|---|---|
| Storms enabled | on | Whether storms can happen. Untick it for a no-storm baseline run. |
| Storm chance (% per tick) | 0.02 | Chance per tick that a storm strikes. |
| Storm radius (cells) | 8 | Radius of the circle a storm wipes. On a 160 x 100 map, radius 8 covers about 1% of the map, radius 16 about 5% and radius 40 about 31%. |

**Trigger storm now** strikes a random patch immediately, which is handy for testing, and **Download storm log** saves the storm log as a `.json` file. The **Statistics** tab shows how many storms there have been this run, the current storm chance and what the last storm did.

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

### Additional Info
- The storm chance is a fixed setting. It doesn't change with the seasonal booms.
- A gauge cell is also a body cell, so it makes the body one cell bigger. That raises the base food cost of every child, even when food is plentiful.
- A gauge works the same way on any organism that carries one, including plants.
- Gauge cells count water tiles when they sense, so near a coast they read a lower food density (see [Islands and Wings](#islands-and-wings-implemented-by-miguel-lavarinhas)).

### Files changed
- `src/Organism/Cell/BodyCells/GaugeCell.js` (new): the gauge cell's behaviour.
- `src/Organism/Cell/CellStates.js`: adds the `gauge` cell state, includes it in the lists of all and living cell types (so it can appear through mutation and is counted in the statistics charts), and draws a black dot in the middle of the gauge cell so it can't be mistaken for the mouth.
- `src/Organism/Cell/BodyCells/BodyCellFactory.js`: registers `GaugeCell`.
- `src/Organism/Organism.js`: adds `gauge_penalty` and `gauge_tick`, and adds `gauge_penalty` to `foodNeeded()`.
- `src/Organism/Perception/Brain.js`: when a saved brain is loaded, adds a default ("ignore") decision for any cell type it doesn't know about, so organisms saved before the gauge cell existed can still be loaded.
- `src/Rendering/ColorScheme.js`: adds a gauge color (gold, with a black dot) to each color scheme. The grayscale scheme stays gray but still gets the dot.
- `dist/css/style.css`: draws the same dot on the gauge swatches in the editor and the cell legend.
- `src/Controllers/EditorController.js` and `dist/index.html`: add the gauge cell to the organism editor and the cell legend.
- `src/Hyperparameters.js`, `src/Organism/Organism.js`, `src/Organism/RandomOrganismGenerator.js`, `src/Controllers/ControlPanel.js` and `dist/index.html`: the **Gauge cells can mutate** setting.
- `src/Environments/StormSystem.js` (new): all of the storm logic and the log.
- `src/Environments/WorldEnvironment.js`: creates the storm system, rolls for a storm at the start of each tick, and draws the flash after the normal drawing.
- `src/Hyperparameters.js`: adds `stormsEnabled`, `stormChance` and `stormRadius`.
- `src/Controllers/ControlPanel.js` and `dist/index.html`: add the Storms controls to the Evolution Controls tab and wire them up.
- `src/Stats/StatsPanel.js` and `dist/index.html`: add the storm line to the Statistics tab.

## Plant Seeds and Lineage Tracking (implemented by Dylan)
### Purpose
When the plant population crashes, food stops being produced and everything that depends on it starves. Seeds give plants a way to come back: a dying plant can leave a seed that sprouts after a random delay. This tests whether food can recover after a crash, and whether a lineage that looks extinct is really gone or only waiting in the soil.

Lineage tracking records what happens over the course of a run, so booms, crashes, recoveries and extinctions can be analysed afterwards: which lineages existed, how many individuals each had, which cell types they carried, and how much food and how many seeds there were.

### How it works
#### Plant seeds
- **Who leaves seeds:** a plant is any organism with producer cells and no mover cells. When a plant dies of old age, killer cells or a storm, it leaves a seed with probability **Seed chance** (default **10%**). Organisms removed by hand (the kill tool, or drawing walls over them) never leave seeds.
- **Where it falls:** on a random tile within **Seed scatter radius** cells of the plant's center (default **3**). Seeds are not drawn on the grid and nothing can eat them.
- **When it sprouts:** after a random delay between **Sprout delay min** and **max** (default **200** to **2000** ticks).
- **Same rules as a normal birth:** the sprout needs room on the grid, respects **Food blocks reproduction** and respects the organism limit. If it's blocked, it tries again every 20 ticks on the same spot. Scattering is what lets seeds find room after a total die-off: each plant's body turns into food where it stood, and with nothing alive to eat it, a seed dropped exactly there could never sprout.
- **Rotting:** a seed that still hasn't sprouted **Seed rots after** ticks after falling (default **5000**) is gone.
- **What sprouts:** an exact copy of the parent (no mutation) that joins the parent's species. If that species had died out in the meantime, it comes back: it's listed as extant again, keeps its lineage IDs, and its `revivals` count goes up by one.
- **Storms** destroy every seed inside their circle, including seeds that the plants they just killed dropped inside it.
- **Extinction and auto-reset:** dormant seeds don't keep a world going. As soon as no living organisms are left, the world auto-resets (or auto-pauses) as usual, and a reset clears the seeds too. To watch seeds bring back a world after a total die-off, turn auto-reset off.

#### Lineage tracking
- **Lineage IDs:** every species gets a lineage ID when it is created, together with its parent's lineage ID and a founder ID. The founder is the lineage at the root of the family tree, so a species with no ancestor is its own founder. An organism placed from the editor joins the species already in the world if one has the same name, and otherwise starts a new root lineage.
- **Samples:** every 100 ticks, one row is logged for each living lineage. It holds the lineage's population and the number of cells of each type its members have, plus world-wide values: total population, number of lineages, food on the grid by source, plant food produced since the last sample, average mutability and the seed numbers.
- **End rows:** just before a reset, a row with the event `end` is logged, so the state a run ended in is kept. When nothing is alive, a single row with lineage ID -1 and population 0 is logged, so extinction shows up in the data.
- **Runs:** rows are kept across resets and world loads. `run_id` goes up on every reset or load.
- **Lineage tree:** one row per lineage ever created in each run, with its parent, founder, start tick, end tick (-1 while it is still alive), cell counts and revivals.

### Settings
#### Plant seeds
All of these are in the **Evolution Controls** tab under **Seeds**. They're saved and loaded with worlds and controls files, and "Reset all controls" puts them back to the defaults.

| Setting | Default | Meaning |
|---|---|---|
| Seeds enabled | on | Whether dying plants can leave seeds. Seeds already in the ground still sprout or rot when this is off. |
| Seed chance (% per plant death) | 10 | Chance that a dying plant leaves a seed. 0 gives a no-seed baseline. |
| Sprout delay min / max (ticks) | 200 / 2000 | Each seed waits a random number of ticks in this range before it first tries to sprout. |
| Seed rots after (ticks) | 5000 | A seed that hasn't sprouted this long after falling rots. |
| Seed scatter radius (cells) | 3 | How far from the dying plant a seed can land. 0 drops it exactly where the plant was. |

The **Statistics** tab shows how many seeds are dormant, and how many have been dropped, sprouted, rotted and destroyed by storms this run.

#### Lineage tracking
Lineage tracking is always on. Its buttons are in the **World Controls** tab, next to Save World and Load World:
- **Download Lineage CSV** saves two files, `lineages.csv` (the samples) and `lineages_tree.csv` (the lineage tree).
- **Save As** changes the base name of those files.
- **Clear lineage log** deletes all logged rows after asking for confirmation. Logging continues from the current tick.

The lineage log is kept in memory and is not part of world saves, so download it before closing the page.

### The data
**`lineages.csv`**: one row per living lineage per sample.

| Column(s) | Meaning |
|---|---|
| `run_id`, `tick`, `event` | Which run, when, and whether the row is a `sample` or an `end` row |
| `lineage_id`, `parent_lineage_id`, `founder_id` | The lineage, its parent and the root of its family tree (-1 when there is none) |
| `population` | Living individuals of the lineage |
| `mouth`, `producer`, `mover`, `killer`, `armor`, `eye`, `gauge`, `wings` | Total cells of each type across the lineage's living individuals |
| `total_pop`, `num_lineages` | Living organisms and lineages in the whole world |
| `total_food`, `plant_food`, `corpse_food`, `other_food` | Food tiles on the grid, by source |
| `plant_food_produced` | Food made by producer cells since the previous sample |
| `avg_mutability` | Average mutability of the living organisms |
| `seed_chance` | The seed chance in effect, or 0 when seeds are off |
| `seeds_dormant` | Seeds waiting right now |
| `seeds_dropped`, `seeds_sprouted`, `seeds_rotted`, `seeds_destroyed` | Counts since the previous sample |

The world-wide columns repeat on every lineage row of the same sample. A row with `population` 0 means nothing is alive. With auto-reset on, that's the run's `end` row, and `seeds_dormant` can still be above 0 because the seeds are only cleared by the reset that follows. With auto-reset off, the world carries on and those seeds can still sprout.

**`lineages_tree.csv`**: one row per lineage per run, with the columns `run_id`, `lineage_id`, `parent_lineage_id`, `founder_id`, `start_tick`, `end_tick`, one column per cell type, and `revivals` (how many times the lineage came back from seed after going extinct).

Other places the data shows up:
- **Storm log:** each storm records `seeds_destroyed`.
- **World saves** include the dormant seeds, together with the species of seeds whose species has died out, so they can still bring it back after loading. Older saves without seeds still load.

### No hard-coded outcomes
Seeds never guarantee recovery. A seed only sprouts if there's room for it by the normal birth rules, and the sprouts then have to survive and reproduce like any other plant. In headless tests with **Food blocks reproduction** on and auto-reset off, seeds sprouted in every world after killing every organism. With scatter radius 1–5, the plants re-established in 5–6 of 8 worlds and died out again in the rest. With scatter radius 0, no seed ever sprouted. Lineage tracking only records what happens and never changes the simulation.

### Known quirks
- An organism with both producer and mover cells counts as an animal, not a plant, so it never leaves seeds.
- A seed that lands on water can never sprout, and rots (see [Islands and Wings](#islands-and-wings-implemented-by-miguel-lavarinhas)).
- Lineage logging keeps every row in memory, so very long runs can produce large CSV files.

### Testing seeds on their own
`npm run experiment:lineage` runs worlds headless with seeds and the lineage tracker as the only project features: storms, islands, wings, gauge cells, food decay and seasonal booms are all off. It runs each world twice, once with seed chance 0 (the baseline) and once with seeds, and writes `runs.csv` (one row per world: condition, how it ended, final counts), `lineages.csv`, `lineages_tree.csv` and `settings.json` to `test/experiments/output/<date and time>/`. The `run_id` column links the three CSVs.

Options: `--worlds` (per condition, default 8), `--ticks` (per world, default 10000; a world that dies out ends early), `--seed` (default 1; the same seed gives the same results), `--controls <file>` (a controls file saved from the Evolution Controls tab, used instead of the defaults, with the other features still off), `--world <file>` (a saved world to start every world from, instead of the single starting plant; its settings are used unless `--controls` is given) and `--out <folder>`. For example: `npm run experiment:lineage -- --worlds 20 --ticks 20000 --controls controls.json`.

`npm run experiment:batch` does the same with several copies running at once (by default one less than the number of CPU cores), then merges their results into one folder with `run_id` renumbered so it's unique. It takes the same options, plus `--jobs`; `--worlds` is the total per condition (default 28). Each job's own output is kept in `jobs/`, and `npm run experiment:batch -- --merge <batch folder>` merges those again without rerunning them.

To do the same in the browser: turn off storms, seasonal booms, wings and gauge mutation, set food lifetime to 0, turn off islands, then **reset** (islands only change on reset). Use seed chance 0 for the baseline. `test/experiments/controls/seeds-only.json` (seed chance 10%, scatter radius 3) and `seeds-only-baseline.json` (seed chance 0) have these settings ready: load one with **Load controls** in the Evolution Controls tab, then reset. They also work with `--controls`.

`test/experiments/worlds/basic-world.json` is a starting world with the same settings: a 308x146 grid (what **Fill Window** gives at cell size 5 on a 1920x1080 screen at 125% scaling) split into eight patches, each with three `6zwopgo1rm` plants, two `yqqohd0nda` plants and two `yihvwmi3yk` animals (the organisms are in `test/experiments/organisms/`). Load it with **Load World** (keep **Override Evolution Controls** ticked so its settings load too), and don't reset afterwards, or you'll be back to a single starting organism. A saved world keeps its own grid size, so to build it for a different window run `npm run make-world -- --cols <columns> --rows <rows>`.

Even with every project feature off, now and then the plants cover the map with food before animals evolve. Food blocks movement as well as births, so any animals that appear are stuck. This happens in the original engine too (1 of 16 headless worlds with seeds off), and it doesn't trigger an auto-reset because the plants are still alive. Reset by hand when it happens.

### Labelling extinctions
`test/experiments/analyze_extinctions.py` reads a results folder (from either script above, or the CSVs downloaded with **Download Lineage CSV** in the World Controls tab) and labels every animal species extinction. It only reads the CSVs; it isn't part of `npm test`. Set it up once with `python -m venv .venv` and `.venv/Scripts/pip install -r test/experiments/requirements.txt`, then run `.venv/Scripts/python test/experiments/analyze_extinctions.py <folder> [--plots]`.

- **Species:** the engine starts a new species on every body mutation. The script groups these so that a species is at least 3 cells different from the one it came from: each engine species joins its parent's species unless it is 3 or more cells away from that species' founding body. Bodies are compared by their cell counts per type (the only body information in the lineage tree), so a cell that only moved isn't counted. Plants and animals never share a species.
- **Labels:**
  - `mis_adaptation`: the species had at least 25% of all animals at its peak, then the plants were grazed down to 10% or less of their level while it rose, with food falling too.
  - `replaced_by_descendant`: a descendant species was still alive and growing when it died out.
  - `failure_to_adapt`: it wasn't a dominant species (this includes dying in a plant crash another species caused), or the plants were still healthy.
  - `ambiguous`: it was dominant, but the plants fell only part of the way, or they crashed under piled-up food (see below).
  - `never_established`: it never reached 10 animals at once. Most extinctions are these.
- **Smothered plants:** with food blocking reproduction, plants can die out without being eaten, because food covers the map and they can't reproduce. Then food goes up as the plants go down. Overgrazing makes food go down with the plants, so a crash only counts as `mis_adaptation` if food fell.

It writes `species.csv`, `extinctions.csv` (one row per extinction, with the numbers behind each label) and `summary.csv` (label counts per condition) to `<folder>/analysis/`, and with `--plots` a chart per run. The thresholds are constants at the top of the script. They were checked against a 14-world batch; check them against the plots of your own runs before relying on the counts.

### Files changed
- `src/Environments/SeedBank.js` (new): dropping, scattering, sprouting and rotting seeds, storm destruction, the counters, and saving and loading.
- `src/Stats/LineageTracker.js` (new): the sample log, the lineage tree and the CSV downloads.
- `src/Hyperparameters.js`: adds `seedsEnabled`, `seedChance`, `seedDelayMin`, `seedDelayMax`, `seedMaxDormancy` and `seedScatterRadius`.
- `src/Organism/Organism.js`: `die(leave_seed = true)` asks the seed bank for a seed before the body turns to food.
- `src/Environments/WorldEnvironment.js`: creates and updates the seed bank, clears it on reset and on world load, saves and loads it, and records a lineage sample every 100 ticks.
- `src/Controllers/EnvironmentController.js`: deaths caused by hand leave no seeds, and organisms placed from the editor join or start a lineage.
- `src/Environments/StormSystem.js`: storms destroy seeds in their circle and log `seeds_destroyed`.
- `src/Stats/FossilRecord.js` and `src/Stats/Species.js`: lineage IDs, the lineage tree, and species brought back from seed being extant again with `end_tick` -1 and a `revivals` count.
- `src/Controllers/ControlPanel.js`, `src/Stats/StatsPanel.js` and `dist/index.html`: the Seeds controls, the lineage buttons and the Statistics line.

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
