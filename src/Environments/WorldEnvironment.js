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
const Perlin = require('../Utils/Perlin');

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
        FossilRecord.setEnv(this);
    }

    update() {
        var to_remove = [];
        for (var i in this.organisms) {
            var org = this.organisms[i];
            if (!org.living || !org.update()) {
                to_remove.push(i);
            }
        }
        this.removeOrganisms(to_remove);
        if (Hyperparams.foodDropProb > 0) {
            this.generateFood();
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
        var num_food = Math.max(Math.floor(this.grid_map.cols*this.grid_map.rows*Hyperparams.foodDropProb/50000), 1)
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
        //*************************************** */Water Addition
        this.clearWater();  
        //*************************************** */
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.total_mutability = 0;
        this.total_ticks = 0;
        this.largest_cell_count = 0;
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

    changeCell(c, r, state, owner) {
        // vacated water tiles revert to water instead of empty
        if (state == CellStates.empty && this.isWater(c, r))
            state = CellStates.water;
        super.changeCell(c, r, state, owner);
        this.renderer.addToRender(this.grid_map.cellAt(c, r));
        if (state == CellStates.wall)
            this.walls.push(this.grid_map.cellAt(c, r));
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

