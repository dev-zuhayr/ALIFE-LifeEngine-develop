// Runs the real simulation code in Node, without a browser.
//
// The engine only touches the page in a few places (jQuery for auto-pause and a
// few controls, the canvas renderer), so those are replaced with small stubs and
// everything else is the real code from src/.
//
//     const h = require('./helpers/headless');
//     const env = h.setup({seedChance: 50}, 3000); // defaults + overrides, then run 3000 ticks
//     h.Hyperparams, h.FossilRecord, h.CellStates, ...  // the real modules
//
// The modules are singletons (Hyperparams, FossilRecord, LineageTracker), so
// makeEnv()/setup() reset them for each new world. Each test file runs in its own
// process, so tests in different files can't affect each other.
const stubs = {pause_clicks: 0};
global.$ = () => ({click() {}, is() { return false; }, 0: {click() { stubs.pause_clicks++; }}});
global.document = {};
global.alert = () => {};

// FossilRecord and friends warn through console.warn; count them so tests can check there were none
let warning_count = 0;
console.warn = () => { warning_count++; };

const src = '../../src/';
const WorldEnvironment = require(src + 'Environments/WorldEnvironment');
const EnvironmentController = require(src + 'Controllers/EnvironmentController');
const GridMap = require(src + 'Grid/GridMap');
const StormSystem = require(src + 'Environments/StormSystem');
const SeedBank = require(src + 'Environments/SeedBank');
const FossilRecord = require(src + 'Stats/FossilRecord');
const LineageTracker = require(src + 'Stats/LineageTracker');
const Organism = require(src + 'Organism/Organism');
const BodyCellFactory = require(src + 'Organism/Cell/BodyCells/BodyCellFactory');
const Hyperparams = require(src + 'Hyperparameters');
const WorldConfig = require(src + 'WorldConfig');
const CellStates = require(src + 'Organism/Cell/CellStates');

// A WorldEnvironment with a fake renderer and engine. life=false gives an empty world.
function makeEnv({cols = 200, rows = 120, life = true} = {}) {
    const env = Object.create(WorldEnvironment.prototype);
    Object.assign(env, {
        renderer: {addToRender() {}, renderFullGrid() {}, fillShape() {}, cells_to_render: new Set(), cell_size: 5},
        engine: {running: false, stop() {}, start() {}},
        grid_map: new GridMap(cols, rows, 5), organisms: [], walls: [], total_mutability: 0,
        largest_cell_count: 0, reset_count: 0, total_ticks: 0, data_update_rate: 100,
        plant_food_produced: 0, num_cols: cols, num_rows: rows,
        season_multiplier: 1, boom_ticks_left: 0, decay_cursor: 0,
    });
    env.storms = new StormSystem(env);
    env.seeds = new SeedBank(env);
    FossilRecord.setEnv(env);
    if (life)
        env.OriginOfLife();
    return env;
}

// Default settings (storms and islands off, so they don't interfere unless a test turns them on),
// then `params` on top, then `ticks` ticks of simulation.
function setup(params = {}, ticks = 3000, env_options = {}) {
    Hyperparams.setDefaults();
    Hyperparams.stormsEnabled = false;
    Hyperparams.islandsEnabled = false;
    Object.assign(Hyperparams, params);
    WorldConfig.auto_reset = true;
    WorldConfig.auto_pause = false;
    stubs.pause_clicks = 0;
    warning_count = 0;
    const env = makeEnv(env_options);
    run(env, ticks);
    return env;
}

function run(env, ticks) {
    for (let t = 0; t < ticks; t++)
        env.update();
}

// Places an organism by hand. cells: [[state, col, row], ...] relative to (c, r). Gets its own species.
function placeOrganism(env, c, r, cells) {
    const org = new Organism(c, r, env);
    for (const [state, col, row] of cells)
        org.anatomy.addDefaultCell(state, col, row);
    env.addOrganism(org);
    FossilRecord.addSpecies(org, null);
    return org;
}

const plants = env => env.organisms.filter(o => o.living && env.seeds.isPlant(o));
const killAll = env => { for (const o of env.organisms) if (o.living) o.die(); };
// A comparable description of a body: every cell's position and type
const anatomySignature = org => org.anatomy.cells.map(c => `${c.loc_col},${c.loc_row},${c.state.name}`).sort().join('|');
const inCircle = (thing, col, row, r) => (thing.col - col) ** 2 + (thing.row - row) ** 2 <= r * r;
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

module.exports = {
    stubs, makeEnv, setup, run, placeOrganism, plants, killAll, anatomySignature, inCircle, median,
    warnings: () => warning_count,
    resetWarnings: () => { warning_count = 0; },
    WorldEnvironment, EnvironmentController, GridMap, StormSystem, SeedBank, FossilRecord, LineageTracker,
    Organism, BodyCellFactory, Hyperparams, WorldConfig, CellStates,
};
