// Food decay and seasonal booms (WorldEnvironment.decayFood / updateSeason / startBoom).
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/headless');
const {Hyperparams, CellStates, BodyCellFactory} = h;

const foodCount = env => env.grid_map.grid.flat().filter(c => c.state === CellStates.food).length;

// An empty world with food on every other row
function foodWorld(params = {}) {
    const env = h.setup(params, 0, {life: false});
    for (let c = 0; c < env.grid_map.cols; c++)
        for (let r = 0; r < env.grid_map.rows; r += 2)
            env.changeCell(c, r, CellStates.food, null);
    return env;
}

test.describe('food decay', () => {
    test('with a lifetime of 0, food never decays', () => {
        const env = foodWorld({foodLifetime: 0});
        const before = foodCount(env);
        h.run(env, 300);
        assert.equal(foodCount(env), before);
    });

    test('food lasts about foodLifetime ticks on average', () => {
        // each food cell is checked once per 60-tick sweep with chance 60 / foodLifetime,
        // so after one lifetime about 0.9^10 = 35% is left (close to e^-1 = 37%)
        const env = foodWorld({foodLifetime: 600});
        const before = foodCount(env);
        h.run(env, 600);
        const share = foodCount(env) / before;
        assert.ok(share > 0.3 && share < 0.4, `${(share * 100).toFixed(1)}% left, expected about 35%`);
    });

    test('decayed food on a water tile turns back into water', () => {
        const env = h.setup({foodLifetime: 1}, 0, {life: false});
        env.generateIslands();
        const cell = env.grid_map.grid.flat().find(c => c.is_water);
        env.changeCell(cell.col, cell.row, CellStates.food, null);
        h.run(env, 120); // two full sweeps, and every food cell decays when checked
        assert.equal(cell.state, CellStates.water);
    });
});

test.describe('seasonal booms', () => {
    test('with seasons off, no boom ever starts', () => {
        const env = h.setup({seasonsEnabled: false, boomChance: 100}, 0, {life: false});
        h.run(env, 50);
        assert.equal(env.season_multiplier, 1);
    });

    test('a boom multiplies production for boomDuration ticks, then ends', () => {
        const env = h.setup({seasonsEnabled: true, boomChance: 100, boomStrength: 4, boomDuration: 10}, 0, {life: false});
        env.update();
        assert.equal(env.season_multiplier, 4);
        Hyperparams.boomChance = 0;
        h.run(env, 9);
        assert.equal(env.season_multiplier, 4, 'boom ended early');
        env.update();
        assert.equal(env.season_multiplier, 1, 'boom did not end');
    });

    test('a boom raises auto food drops', () => {
        const env = h.setup({foodDropProb: 50}, 0, {life: false});
        h.run(env, 10);
        const normal = foodCount(env);
        assert.ok(normal > 0, 'auto food drop produced nothing');
        env.reset(false, false);
        env.startBoom(4, 1000);
        h.run(env, 10);
        assert.ok(foodCount(env) > normal * 2, `boom: ${foodCount(env)}, normal: ${normal}`);
    });

    test('a boom strength of 0 stops producer cells', () => {
        const env = h.setup({foodProdProb: 100}, 0, {life: false});
        const plant = h.placeOrganism(env, 50, 50, [[CellStates.producer, 0, 0]]);
        const producer = plant.anatomy.cells[0];
        env.startBoom(0, 1000);
        for (let i = 0; i < 50; i++)
            producer.performFunction();
        assert.equal(env.plant_food_produced, 0);
    });

    test('reset ends a boom', () => {
        const env = h.setup({}, 0);
        env.startBoom(4, 1000);
        env.reset(false);
        assert.equal(env.season_multiplier, 1);
        assert.equal(env.boom_ticks_left, 0);
    });
});

test.describe('saving and loading', () => {
    test('a save keeps its boom, and a save from before seasons loads out of season', () => {
        const env = h.setup({}, 100);
        env.startBoom(3, 500);
        const save = JSON.parse(JSON.stringify(env.serialize()));
        env.reset(false);
        env.loadRaw(save);
        assert.equal(env.season_multiplier, 3);
        assert.equal(env.boom_ticks_left, 500);

        delete save.season_multiplier;
        delete save.boom_ticks_left;
        delete save.decay_cursor;
        env.loadRaw(save); // still mid boom from the previous load
        assert.equal(env.season_multiplier, 1);
        assert.equal(env.boom_ticks_left, 0);
        assert.equal(env.decay_cursor, 0);
    });
});
