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
- Gauge - Amber (brown in the classic scheme), senses how much food is nearby and slows its organism's reproduction when food is scarce. *Implemented by Zuhayr Khot.* See [Gauge Cell](#gauge-cell-implemented-by-zuhayr-khot) below.

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
- `src/Rendering/ColorScheme.js`: adds a gauge color to each color scheme.
- `src/Controllers/EditorController.js` and `dist/index.html`: add the gauge cell to the organism editor and the cell legend.
