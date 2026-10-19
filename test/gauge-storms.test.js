// Gauge cells (src/Organism/Cell/BodyCells/GaugeCell.js) and storms (src/Environments/StormSystem.js).
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/headless');
const {Hyperparams, FossilRecord, Organism, BodyCellFactory, CellStates} = h;
const RandomOrganismGenerator = require('../src/Organism/RandomOrganismGenerator');

const gaugesOf = org => org.anatomy.cells.filter(c => c.state === CellStates.gauge);

// What the README says a gauge should ask for: ceil(body size x MAX_RESTRAINT x scarcity), with MAX_RESTRAINT 1
const expectedPenalty = (org, gauge) =>
    Math.max(0, Math.ceil(org.anatomy.cells.length * (1 - gauge.measureFoodDensity() / gauge.sensitivity)));

function dropFood(env, c, r, share) {
    for (let dc = -5; dc <= 5; dc++)
        for (let dr = -5; dr <= 5; dr++) {
            const cell = env.grid_map.cellAt(c + dc, r + dr);
            if (cell.state === CellStates.empty && Math.random() < share)
                env.changeCell(c + dc, r + dr, CellStates.food, null);
        }
}

test.describe('gauge cells', () => {
    test('gauge cells appear through mutation', () => {
        h.setup({}, 8000);
        const with_gauge = Object.values(FossilRecord.lineage_tree).filter(l => l.cell_counts && l.cell_counts.gauge > 0);
        assert.ok(with_gauge.length > 0, 'no species with a gauge cell in 8000 ticks');
    });

    test('with gauge mutation off, no gauge cells appear through mutation or in random organisms', () => {
        FossilRecord.clear_record(); // setup() keeps the lineage tree, which has the previous test's gauge species
        const env = h.setup({gaugeCanMutate: false}, 8000);
        const with_gauge = Object.values(FossilRecord.lineage_tree).filter(l => l.cell_counts && l.cell_counts.gauge > 0);
        assert.equal(with_gauge.length, 0);
        for (let i = 0; i < 200; i++)
            assert.equal(gaugesOf(RandomOrganismGenerator.generate(env)).length, 0);
    });

    test('with no food around, a gauge doubles the cost of a child', () => {
        const env = h.setup({}, 0, {life: false});
        const org = h.placeOrganism(env, 50, 50, [[CellStates.mouth, 0, 0], [CellStates.producer, 1, 0], [CellStates.gauge, 0, 1]]);
        gaugesOf(org)[0].performFunction();
        assert.equal(org.gauge_penalty, 3);
        assert.equal(org.foodNeeded(), 6);
    });

    test('with plenty of food around, a gauge adds nothing', () => {
        const env = h.setup({}, 0, {life: false});
        const org = h.placeOrganism(env, 50, 50, [[CellStates.mouth, 0, 0], [CellStates.producer, 1, 0], [CellStates.gauge, 0, 1]]);
        dropFood(env, 50, 51, 1);
        gaugesOf(org)[0].performFunction();
        assert.equal(org.gauge_penalty, 0);
        assert.equal(org.foodNeeded(), 3);
    });

    test('below the threshold, the penalty follows the scarcity formula', () => {
        const env = h.setup({}, 0, {life: false});
        const org = h.placeOrganism(env, 50, 50, [[CellStates.mouth, 0, 0], [CellStates.producer, 1, 0], [CellStates.gauge, 0, 1]]);
        const gauge = gaugesOf(org)[0];
        // 5 food tiles out of the 118 the gauge sees (121 minus its own body) is 4.2%, below the 8% default
        for (const [c, r] of [[46, 47], [47, 55], [53, 48], [54, 54], [55, 51]])
            env.changeCell(c, r, CellStates.food, null);
        assert.equal(gauge.measureFoodDensity(), 5 / 118);
        gauge.performFunction();
        assert.equal(org.gauge_penalty, Math.ceil(3 * (1 - (5 / 118) / 0.08))); // = 2
    });

    test('with several gauges, the most worried one sets the penalty', () => {
        const env = h.setup({}, 0, {life: false});
        const org = h.placeOrganism(env, 50, 50, [[CellStates.mouth, 0, 0], [CellStates.producer, 1, 0],
            [CellStates.gauge, 0, 1], [CellStates.gauge, -1, 0]]);
        const [a, b] = gaugesOf(org);
        a.sensitivity = 0.20;
        b.sensitivity = 0.02;
        dropFood(env, 50, 50, 0.1);
        a.performFunction();
        b.performFunction();
        assert.equal(org.gauge_penalty, Math.max(expectedPenalty(org, a), expectedPenalty(org, b)));
        assert.ok(org.gauge_penalty > 0);
    });

    test('the penalty is recalculated every tick', () => {
        const env = h.setup({}, 0, {life: false});
        const org = h.placeOrganism(env, 50, 50, [[CellStates.mouth, 0, 0], [CellStates.producer, 1, 0], [CellStates.gauge, 0, 1]]);
        const gauge = gaugesOf(org)[0];
        gauge.performFunction();
        assert.equal(org.gauge_penalty, 3);
        dropFood(env, 50, 51, 1);
        org.lifetime++; // next tick
        gauge.performFunction();
        assert.equal(org.gauge_penalty, 0);
    });

    test('mutated gauges get a random sensitivity between 2% and 20%, and children copy it exactly', () => {
        const env = h.setup({}, 0, {life: false});
        const parent = new Organism(50, 50, env);
        for (let i = 0; i < 1000; i++) {
            const g = BodyCellFactory.createRandom(parent, CellStates.gauge, 0, 0);
            assert.ok(g.sensitivity >= 0.02 && g.sensitivity <= 0.20);
        }
        parent.anatomy.addRandomizedCell(CellStates.gauge, 0, 0);
        const child = new Organism(0, 0, env, parent);
        assert.equal(gaugesOf(child)[0].sensitivity, gaugesOf(parent)[0].sensitivity);
    });

    test('a gauge placed in the editor uses 8%', () => {
        const env = h.setup({}, 0, {life: false});
        const org = new Organism(50, 50, env);
        org.anatomy.addDefaultCell(CellStates.gauge, 0, 0);
        assert.equal(gaugesOf(org)[0].sensitivity, 0.08);
    });
});

test.describe('storms', () => {
    test('a storm kills what it touches, clears food, keeps walls and logs it', () => {
        const env = h.setup({}, 0, {life: false});
        const inside = h.placeOrganism(env, 50, 50, [[CellStates.mouth, 0, 0], [CellStates.producer, 1, 0]]);
        // its center is on the edge of the circle; its other two cells stick out
        const partly = h.placeOrganism(env, 55, 50, [[CellStates.mouth, 0, 0], [CellStates.producer, 1, 0], [CellStates.producer, 2, 0]]);
        const outside = h.placeOrganism(env, 70, 70, [[CellStates.mouth, 0, 0], [CellStates.producer, 1, 0]]);
        env.changeCell(48, 50, CellStates.food, null);
        env.changeCell(80, 80, CellStates.food, null);
        env.changeCell(52, 52, CellStates.wall, null);

        const event = env.storms.triggerStorm(50, 50, 5, 'manual');

        assert.equal(inside.living, false);
        assert.equal(partly.living, false);
        assert.equal(outside.living, true);
        for (let dc = -5; dc <= 5; dc++)
            for (let dr = -5; dr <= 5; dr++) {
                if (dc * dc + dr * dr > 25) continue;
                const cell = env.grid_map.cellAt(50 + dc, 50 + dr);
                assert.ok(cell.state === CellStates.empty || cell.state === CellStates.wall, `cell ${50 + dc},${50 + dr} is ${cell.state.name}`);
            }
        assert.equal(env.grid_map.cellAt(52, 52).state, CellStates.wall);
        assert.equal(env.grid_map.cellAt(80, 80).state, CellStates.food);
        assert.equal(env.grid_map.cellAt(56, 50).state, CellStates.food, 'the part outside the circle should turn to food');
        assert.equal(env.grid_map.cellAt(57, 50).state, CellStates.food);

        assert.equal(event.organisms_killed, 2);
        assert.equal(event.food_destroyed, 1);
        assert.deepEqual(new Set(event.species_hit), new Set([inside.species.name, partly.species.name]));
        assert.deepEqual(new Set(event.species_extinct), new Set([inside.species.name, partly.species.name]));
        assert.equal(event.population_after, 1);
        assert.equal(event.wiped_out_world, false);
        assert.equal(env.storms.log.length, 1);
    });

    test('storms only strike when enabled', () => {
        const env = h.setup({stormsEnabled: false, stormChance: 100}, 0, {life: false});
        h.run(env, 50);
        assert.equal(env.storms.storm_count, 0);
        Hyperparams.stormsEnabled = true;
        h.run(env, 50);
        assert.equal(env.storms.storm_count, 50);
    });
});
