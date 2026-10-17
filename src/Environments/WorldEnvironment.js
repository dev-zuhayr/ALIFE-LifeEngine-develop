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
const StormSystem = require('./StormSystem');

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
        this.storms = new StormSystem(this); // random storms, see StormSystem.js
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
        if (this.organisms.length === 0 && start_pop > 0) {
            if (WorldConfig.auto_pause)
                $('.pause-button')[0].click();
            else if(WorldConfig.auto_reset) {
                this.reset_count++;
                this.reset(false);
            }
        }
    }

    OriginOfLife() {
        var center = this.grid_map.getCenter();
        var org = new Organism(center[0], center[1], this);
        org.anatomy.addDefaultCell(CellStates.mouth, 0, 0);
        org.anatomy.addDefaultCell(CellStates.producer, 1, 1);
        org.anatomy.addDefaultCell(CellStates.producer, -1, -1);
        this.addOrganism(org);
        FossilRecord.addSpecies(org, null);
    }

    addOrganism(organism) {
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

    changeCell(c, r, state, owner) {
        super.changeCell(c, r, state, owner);
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
            org.die();
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
        let restart = false;
        if (this.engine.running) {
            this.engine.last_fps = this.engine.fps;
            this.engine.stop();
            restart = true;
        }
        this.organisms = [];
        this.grid_map.fillGrid(CellStates.empty, !WorldConfig.clear_walls_on_reset);
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.total_mutability = 0;
        this.total_ticks = 0;
        this.largest_cell_count = 0;
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
        env.controls = Hyperparams;
        return env;
    }

    loadRaw(env) { // species name->stats map, evolution controls, 
        this.organisms = [];
        FossilRecord.clear_record();
        let cell_size = env.grid.cell_size ? env.grid.cell_size : this.grid_map.cell_size;
        this.resizeGridColRow(cell_size, env.grid.cols, env.grid.rows)
        this.grid_map.loadRaw(env.grid);
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
        for (let name in species)
            FossilRecord.addSpeciesObj(species[name]);
        FossilRecord.loadRaw(env.fossil_record);
        SerializeHelper.overwriteNonObjects(env, this);
        if ($('#override-controls').is(':checked'))
            Hyperparams.loadJsonObj(env.controls)
        this.renderer.renderFullGrid(this.grid_map.grid);
    }
}

module.exports = WorldEnvironment;

