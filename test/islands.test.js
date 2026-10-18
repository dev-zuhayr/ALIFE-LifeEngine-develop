// Islands/water (WorldEnvironment.generateIslands) and food source tagging (WorldEnvironment.changeCell).
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/headless');
const {Hyperparams, CellStates} = h;

// generateIslands logs every call; keep the test output readable
const log = console.log;
console.log = (...args) => { if (!String(args[0]).startsWith('generateIslands')) log(...args); };

const waterTiles = env => env.grid_map.grid.flat().filter(c => c.is_water).length;
const waterStates = env => env.grid_map.grid.flat().filter(c => c.state === CellStates.water).length;

test.describe('islands setting', () => {
    test('islands on: the world starts with water', () => {
        const env = h.setup({islandsEnabled: true}, 0);
        assert.ok(waterTiles(env) > 0, 'no water tiles');
        assert.equal(waterStates(env), waterTiles(env), 'every water tile should show as water');
    });

    test('islands off: the world starts with no water', () => {
        const env = h.setup({islandsEnabled: false}, 0);
        assert.equal(waterTiles(env), 0);
        assert.equal(waterStates(env), 0);
    });

    test('turning islands off keeps the current water until the next reset', () => {
        const env = h.setup({islandsEnabled: true}, 0);
        const before = waterTiles(env);
        Hyperparams.islandsEnabled = false;
        h.run(env, 50);
        assert.equal(waterTiles(env), before, 'water changed before a reset');
        env.reset(false);
        assert.equal(waterTiles(env), 0, 'water left after the reset');
        assert.equal(waterStates(env), 0);
    });

    test('turning islands on adds water only on the next reset', () => {
        const env = h.setup({islandsEnabled: false}, 0);
        Hyperparams.islandsEnabled = true;
        h.run(env, 50);
        assert.equal(waterTiles(env), 0, 'water appeared before a reset');
        env.reset(false);
        assert.ok(waterTiles(env) > 0, 'no water after the reset');
    });

    test('the setting is reset to on by "Reset all controls"', () => {
        Hyperparams.islandsEnabled = false;
        Hyperparams.setDefaults();
        assert.equal(Hyperparams.islandsEnabled, true);
    });
});

test.describe('food sources', () => {
    // regression: a second changeCell() override dropped food_source, so all food was logged as 'other'
    for (const islandsEnabled of [false, true]) {
        test(`plant and corpse food are tagged as such (islands ${islandsEnabled ? 'on' : 'off'})`, () => {
            const env = h.setup({islandsEnabled}, 200);
            assert.ok(env.sampleFood().plant_food > 0, 'no food tagged plant');
            h.killAll(env);
            assert.ok(env.sampleFood().corpse_food > 0, 'no food tagged corpse');
        });
    }

    test('food eaten off a water tile turns it back into water', () => {
        const env = h.setup({islandsEnabled: true}, 0);
        const cell = env.grid_map.grid.flat().find(c => c.is_water);
        env.changeCell(cell.col, cell.row, CellStates.food, null, 'corpse');
        assert.equal(cell.food_source, 'corpse');
        env.changeCell(cell.col, cell.row, CellStates.empty, null);
        assert.equal(cell.state, CellStates.water);
    });
});
