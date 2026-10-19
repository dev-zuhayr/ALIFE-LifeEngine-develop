const Environment = require('./Environment');
const Renderer = require('../Rendering/Renderer');
const GridMap = require('../Grid/GridMap');
const Organism = require('../Organism/Organism');
const CellStates = require('../Organism/Cell/CellStates');
const EnvironmentController = require('../Controllers/EnvironmentController');
const Hyperparams = require('../Hyperparameters.js');
const FossilRecord = require('../Stats/FossilRecord');
const WorldConfig = require('../WorldConfig');
const SerializeHelper = require('../Utils/SerializeHelper');
const Species = require('../Stats/Species');
const LineageTracker = require('../Stats/LineageTracker');
const StormSystem = require('./StormSystem');
const SeedBank = require('./SeedBank');
const Perlin = require('../Utils/Perlin');

// Ticks for the decay cursor to make one full pass over the grid. This is a
// performance knob, not a balance knob: it bounds how many cells decayFood()
// inspects per tick while leaving food lifetime grid-size independent.
const DECAY_SWEEP_TICKS = 60;

class WorldEnvironment extends Environment{
    constructor(engine, cell_size) {
        super();
        this.engine = engine;
        this.renderer = new Renderer('env-canvas', 'env', cell_size);
        this.controller = new EnvironmentController(this, this.renderer.canvas);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.grid_map = new GridMap(this.num_cols, this.num_rows, cell_size);
        this.organisms = [];
        this.walls = [];
        this.total_mutability = 0;
        this.largest_cell_count = 0;
        this.reset_count = 0;
        this.total_ticks = 0;
        this.data_update_rate = 100;
        this.plant_food_produced = 0; // food made by producer cells since the last sampleFood()
        this.storms = new StormSystem(this); // random storms, see StormSystem.js
        this.seeds = new SeedBank(this); // dormant plant seeds, see SeedBank.js
        this.season_multiplier = 1;
        this.boom_ticks_left = 0;
        this.decay_cursor = 0;
        FossilRecord.setEnv(this);
    }

    update() {
        this.storms.update(); // roll for a storm before anything else moves this tick
        var to_remove = [];
        for (var i in this.organisms) {
            var org = this.organisms[i];
            if (!org.living || !org.update()) {
                to_remove.push(i);
            }
        }
        this.removeOrganisms(to_remove);
        this.seeds.update(); // sprout or rot dormant seeds; sprouts start acting next tick
        if (Hyperparams.seasonsEnabled) {
            this.updateSeason();
        }
        if (Hyperparams.foodDropProb > 0) {
            this.generateFood();
        }
        if (Hyperparams.foodLifetime > 0) {
            this.decayFood();
        }
        this.total_ticks ++;
        if (this.total_ticks % this.data_update_rate == 0) {
            FossilRecord.updateData();
            LineageTracker.record(this);
        }
    }

    render() {
        if (WorldConfig.headless) {
            this.renderer.cells_to_render.clear();
            return;
        }
        this.renderer.renderCells();
        this.renderer.renderHighlights();
        this.storms.render(); // draw the storm flash on top
    }

    renderFull() {
        this.renderer.renderFullGrid(this.grid_map.grid);
    }

    removeOrganisms(org_indeces) {
        let start_pop = this.organisms.length;
        for (var i of org_indeces.reverse()){
            this.total_mutability -= this.organisms[i].mutability;
            this.organisms.splice(i, 1);
        }
        // dormant seeds don't count: with auto-reset on, the reset clears them too
        if (this.organisms.length === 0 && start_pop > 0)
            this.handleExtinction();
    }

    // total extinction: no living organisms left
    handleExtinction() {
        if (WorldConfig.auto_pause)
            $('.pause-button')[0].click();
        else if(WorldConfig.auto_reset) {
            this.reset_count++;
            this.reset(false);
        }
    }

    OriginOfLife() {
        if (Hyperparams.islandsEnabled) // checked here, so changing the setting takes effect on the next reset
            this.generateIslands();
        var center = this.grid_map.getCenter();
        var org = new Organism(center[0], center[1], this);
        org.anatomy.addDefaultCell(CellStates.mouth, 0, 0);
        org.anatomy.addDefaultCell(CellStates.producer, 1, 1);
        org.anatomy.addDefaultCell(CellStates.producer, -1, -1);
        this.addOrganism(org);
        FossilRecord.addSpecies(org, null);
    }

    addOrganism(organism) {
        organism.stripUselessWings(); // catches saved worlds and editor drops; no-op for normal births
        organism.updateGrid();
        this.total_mutability += organism.mutability;
        this.organisms.push(organism);
        if (organism.anatomy.cells.length > this.largest_cell_count) 
            this.largest_cell_count = organism.anatomy.cells.length;
    }

    canAddOrganism() {
        return this.organisms.length < Hyperparams.maxOrganisms || Hyperparams.maxOrganisms < 0;
    }

    averageMutability() {
        if (this.organisms.length < 1)
            return 0;
        if (Hyperparams.useGlobalMutability) {
            return Hyperparams.globalMutability;
        }
        return this.total_mutability / this.organisms.length;
    }

    changeCell(c, r, state, owner, food_source) {
        //*************************************** */Water Addition
        // vacated water tiles revert to water instead of empty
        if (state == CellStates.empty && this.isWater(c, r))
            state = CellStates.water;
        super.changeCell(c, r, state, owner, food_source);
        this.renderer.addToRender(this.grid_map.cellAt(c, r));
        if(state == CellStates.wall)
            this.walls.push(this.grid_map.cellAt(c, r));
    }

    clearWalls() {
        for(var wall of this.walls){
            let wcell = this.grid_map.cellAt(wall.col, wall.row);
            if (wcell && wcell.state == CellStates.wall)
                this.changeCell(wall.col, wall.row, CellStates.empty, null);
        }
    }

    clearOrganisms() {
        for (var org of this.organisms)
            org.die(false); // cleared by hand, so no seeds
        this.organisms = [];
    }
    
    clearDeadOrganisms() {
        let to_remove = [];
        for (let i in this.organisms) {
            let org = this.organisms[i];
            if (!org.living)
                to_remove.push(i);
        }
        this.removeOrganisms(to_remove);
    }

    generateFood() {
        var num_food = Math.max(Math.floor(this.grid_map.cols*this.grid_map.rows*Hyperparams.foodDropProb*this.season_multiplier/50000), 1)
        var prob = Hyperparams.foodDropProb;
        for (var i=0; i<num_food; i++) {
            if (Math.random() <= prob){
                var c=Math.floor(Math.random() * this.grid_map.cols);
                var r=Math.floor(Math.random() * this.grid_map.rows);

                if (this.grid_map.cellAt(c, r).state == CellStates.empty){
                    this.changeCell(c, r, CellStates.food, null);
                }
            }
        }
    }

    // counts food on the grid by source, plus plant food produced since the last call (which resets that counter)
    sampleFood() {
        let counts = {total_food: 0, plant_food: 0, corpse_food: 0, other_food: 0};
        for (let col of this.grid_map.grid) {
            for (let cell of col) {
                if (cell.state !== CellStates.food)
                    continue;
                counts.total_food++;
                counts[cell.food_source + '_food']++;
            }
        }
        counts.plant_food_produced = this.plant_food_produced;
        this.plant_food_produced = 0;
        return counts;
    }

    // Seasons scale food production through season_multiplier rather than by
    // writing to Hyperparams, which is serialized into saved worlds -- saving
    // mid boom would otherwise bake the boosted rate in as the user's setting.
    // The multiplier is read by ProducerCell.performFunction() and generateFood().
    updateSeason() {
        if (this.boom_ticks_left > 0) {
            this.boom_ticks_left--;
            if (this.boom_ticks_left === 0)
                this.season_multiplier = 1;
            return;
        }
        if (Math.random() * 100 < Hyperparams.boomChance) {
            this.startBoom();
        }
    }

    // Also the manual trigger for testing: env.startBoom(5, 500)
    startBoom(strength=null, duration=null) {
        this.season_multiplier = strength !== null ? strength : Hyperparams.boomStrength;
        this.boom_ticks_left = duration !== null ? duration : Hyperparams.boomDuration;
    }

    // Food decays probabilistically. Rather than scan the whole grid every tick,
    // a cursor walks a slice of it and completes a full pass every
    // DECAY_SWEEP_TICKS ticks, which keeps the per tick cost fixed regardless of
    // grid size or how much food exists. Reading only cell.state means there is
    // no per cell bookkeeping to fall out of sync with fillGrid, loadRaw or
    // resize, all of which write the grid without going through changeCell.
    decayFood() {
        let cols = this.grid_map.cols;
        let total = cols * this.grid_map.rows;
        let budget = Math.max(Math.ceil(total / DECAY_SWEEP_TICKS), 1);
        let prob = DECAY_SWEEP_TICKS / Hyperparams.foodLifetime;
        for (let i = 0; i < budget; i++) {
            let idx = (this.decay_cursor + i) % total;
            let cell = this.grid_map.cellAt(idx % cols, Math.floor(idx / cols));
            if (cell != null && cell.state == CellStates.food && Math.random() < prob) {
                // must go through changeCell so the cell is queued for render
                this.changeCell(cell.col, cell.row, CellStates.empty, null);
            }
        }
        this.decay_cursor = (this.decay_cursor + budget) % total;
    }

    reset(confirm_reset=true, reset_life=true) {
        if (confirm_reset && !confirm('The current environment will be lost. Proceed?'))
            return false;
        // log the state the run ended in (e.g. population 0 on extinction)
        LineageTracker.record(this, 'end');
        LineageTracker.newRun();
        let restart = false;
        if (this.engine.running) {
            this.engine.last_fps = this.engine.fps;
            this.engine.stop();
            restart = true;
        }
        this.organisms = [];
        this.grid_map.fillGrid(CellStates.empty, !WorldConfig.clear_walls_on_reset);
        //*************************************** */Water Addition
        this.clearWater();  
        //*************************************** */
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.total_mutability = 0;
        this.total_ticks = 0;
        this.largest_cell_count = 0;
        this.plant_food_produced = 0;
        this.seeds.clear();
        this.season_multiplier = 1;
        this.boom_ticks_left = 0;
        this.decay_cursor = 0;
        FossilRecord.clear_record();
        if (reset_life)
            this.OriginOfLife();
        if (restart)
            this.engine.start(this.engine.last_fps);
        return true;
    }

    resizeGridColRow(cell_size, cols, rows) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillShape(rows*cell_size, cols*cell_size);
        this.grid_map.resize(cols, rows, cell_size);
    }

    resizeFillWindow(cell_size) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillWindow('env');
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.grid_map.resize(this.num_cols, this.num_rows, cell_size);
    }

    serialize() {
        this.clearDeadOrganisms();
        let env = SerializeHelper.copyNonObjects(this);
        env.grid = this.grid_map.serialize();
        env.organisms = [];
        for (let org of this.organisms){
            env.organisms.push(org.serialize());
        }
        env.fossil_record = FossilRecord.serialize();
        env.seed_bank = this.seeds.serialize();
        env.controls = Hyperparams;
        //*************************************** */Water Addition
        env.water = [];
        for (let c = 0; c < this.grid_map.cols; c++)
            for (let r = 0; r < this.grid_map.rows; r++)
                if (this.grid_map.cellAt(c, r).is_water) env.water.push([c, r]);
        //*************************************** */
        return env;
    }

    loadRaw(env) { // species name->stats map, evolution controls, 
        this.organisms = [];
        this.seeds.clear(); // seeds from the previous world mustn't sprout into the loaded one
        // saves restore these below (overwriteNonObjects); older saves without them start out of season
        this.season_multiplier = 1;
        this.boom_ticks_left = 0;
        this.decay_cursor = 0;
        LineageTracker.newRun(); // archive the previous world's lineage tree before it is cleared
        FossilRecord.clear_record();
        let cell_size = env.grid.cell_size ? env.grid.cell_size : this.grid_map.cell_size;
        this.resizeGridColRow(cell_size, env.grid.cols, env.grid.rows)
        this.grid_map.loadRaw(env.grid);
        //********************** */ Water Addition
        this.clearWater();
        for (const [c, r] of (env.water || [])) {
            const cell = this.grid_map.cellAt(c, r);
            if (cell) { cell.is_water = true; if (cell.state == CellStates.empty) cell.state = CellStates.water; }
        }
        //********************** */
        for (let wall of env.grid.walls) {
            this.walls.push(this.grid_map.cellAt(wall.c, wall.r));
        }

        // create species map
        let species = {};
        for (let name in env.fossil_record.species) {
            let s = new Species(null, null, 0);
            SerializeHelper.overwriteNonObjects(env.fossil_record.species[name], s)
            species[name] = s; // the species needs an anatomy obj still
        }

        for (let orgRaw of env.organisms) {
            let org = new Organism(orgRaw.col, orgRaw.row, this);
            org.loadRaw(orgRaw);
            this.addOrganism(org);
            let s = species[orgRaw.species_name];
            if (!s){ // ideally, every organisms species should exists, but there is a bug that misses some species sometimes
                s = new Species(org.anatomy, null, env.total_ticks);
                species[orgRaw.species_name] = s;
            }
            if (!s.anatomy) {
                //if the species doesn't have anatomy we need to initialize it
                s.anatomy = org.anatomy;
                s.calcAnatomyDetails();
            }
            s.name = orgRaw.species_name;
            org.species = s;
        }

        // dormant seeds (saves from before seeds existed have none). Seeds whose species has died
        // out come back with that species, which stays extinct until one of them sprouts.
        let seed_species = env.seed_bank ? this.seeds.loadRaw(env.seed_bank, species) : [];

        // continue organism ids after the highest loaded id, counting the seeds' dead parents too
        let max_id = -1;
        for (let org of this.organisms)
            max_id = Math.max(max_id, org.id);
        for (let seed of this.seeds.seeds)
            max_id = Math.max(max_id, seed.parent.id);
        Organism.next_id = max_id + 1;

        // saves from before lineage tracking have no lineage ids; treat each species as its own founder
        for (let s of Object.values(species).concat(seed_species)) {
            if (s.lineage_id === -1) {
                s.lineage_id = FossilRecord.next_lineage_id++;
                s.parent_lineage_id = -1;
                s.founder_id = s.lineage_id;
            }
            FossilRecord.addLineageEntry(s);
        }

        for (let name in species)
            FossilRecord.addSpeciesObj(species[name]);
        FossilRecord.loadRaw(env.fossil_record);
        SerializeHelper.overwriteNonObjects(env, this);
        if ($('#override-controls').is(':checked'))
            Hyperparams.loadJsonObj(env.controls)
        this.renderer.renderFullGrid(this.grid_map.grid);
    }

    //*************************************** */Water Addition
    isWater(c, r) {
        const cell = this.grid_map.cellAt(c, r);
        return !!cell && cell.is_water === true;
    }

    clearWater() {
        for (let c = 0; c < this.grid_map.cols; c++)
            for (let r = 0; r < this.grid_map.rows; r++)
                this.grid_map.cellAt(c, r).is_water = false;
    }

    /*generateIslands(num_islands = 6, land_fraction = 0.35, wobble = 0.3, spacing = 2.6) {
        const cols = this.grid_map.cols, rows = this.grid_map.rows;
        const R = Math.sqrt(land_fraction * cols * rows / (num_islands * Math.PI));
        const center = this.grid_map.getCenter();
        const centres = [{c: center[0], r: center[1]}];   // island 1 holds the start
        for (let tries = 0; centres.length < num_islands && tries < 5000; tries++) {
            const c = R + Math.random() * (cols - 2 * R);
            const r = R + Math.random() * (rows - 2 * R);
            if (centres.every(p => Math.hypot(p.c - c, p.r - r) > spacing * R))
                centres.push({c, r});
        }
        console.log('islands placed:', centres.length, 'of', num_islands, 'radius', R.toFixed(1));
        Perlin.seed();
        const scale = 0.08;
        let water = 0;
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const cell = this.grid_map.cellAt(c, r);
                if (cell.state != CellStates.empty) continue;
                let d = Infinity;
                for (const p of centres) d = Math.min(d, Math.hypot(c - p.c, r - p.r));
                const edge = R * (1 + wobble * 1.4 * Perlin.get(c * scale, r * scale));
                if (d > edge) {
                    cell.is_water = true;
                    this.changeCell(c, r, CellStates.water, null);
                    water++;
                }
            }
        }
        console.log('water %:', (100 * water / (cols * rows)).toFixed(1));
    }*/
   generateIslands(scale = 0.04, water_below = 0.008, spawn_clear_radius = 8) {
        console.log('generateIslands called', this.grid_map.cols, this.grid_map.rows);
        Perlin.seed(); // new random layout; skip this line when loading a saved world
        const center = this.grid_map.getCenter(); // [col, row], same call OriginOfLife uses
        for (let c = 0; c < this.grid_map.cols; c++) {
            for (let r = 0; r < this.grid_map.rows; r++) {
                const cell = this.grid_map.cellAt(c, r);
                if (cell.state != CellStates.empty) continue;
                // keep the starting area dry so the first organism isn't in the ocean
                if (Math.hypot(c - center[0], r - center[1]) < spawn_clear_radius) continue;
                if (Perlin.get(c * scale, r * scale) < water_below) {
                    cell.is_water = true;
                    this.changeCell(c, r, CellStates.water, null);
                }
            }
        }
    }
}

module.exports = WorldEnvironment;

