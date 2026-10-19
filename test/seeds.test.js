// Plant seeds (src/Environments/SeedBank.js). Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/headless');
const {Hyperparams, FossilRecord, LineageTracker, Organism, SeedBank, EnvironmentController, CellStates, WorldConfig} = h;

test.describe('dropping seeds', () => {
    test('seedChance 0 drops no seeds', () => {
        const env = h.setup({seedChance: 0}, 5000);
        assert.equal(env.seeds.dropped, 0);
        assert.equal(env.seeds.count(), 0);
    });

    test('seedChance 100 drops seeds that sprout', () => {
        const env = h.setup({seedChance: 100}, 5000);
        assert.ok(env.seeds.dropped > 0, 'no seeds dropped');
        assert.ok(env.seeds.sprouted > 0, 'no seeds sprouted');
    });

    test('dormant seeds rot 5000 ticks after falling, wait at least 200 ticks, and land within the scatter radius', () => {
        const env = h.setup({seedChance: 100}, 5000);
        assert.ok(env.seeds.count() > 0);
        for (const s of env.seeds.seeds) {
            assert.equal(s.rot_tick - s.drop_tick, 5000);
            assert.ok(s.sprout_tick - s.drop_tick >= 200);
            assert.ok((s.col - s.parent.c) ** 2 + (s.row - s.parent.r) ** 2 <= 9, 'seed landed outside radius 3');
        }
    });

    test('scatter radius 0 lands on the center; radius 5 stays inside the circle and reaches its edge', () => {
        const env = h.setup({}, 0);
        Hyperparams.seedScatterRadius = 0;
        for (let i = 0; i < 1000; i++)
            assert.deepEqual(env.seeds.randomScatter(), [0, 0]);
        Hyperparams.seedScatterRadius = 5;
        let edge = 0;
        for (let i = 0; i < 20000; i++) {
            const [dc, dr] = env.seeds.randomScatter();
            assert.ok(dc * dc + dr * dr <= 25);
            if (dc * dc + dr * dr === 25) edge++;
        }
        assert.ok(edge > 0, 'never reached the edge of the circle');
    });

    test('the sprout delay stays between min and max, even when min > max', () => {
        const env = h.setup({seedDelayMin: 300, seedDelayMax: 100}, 0);
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < 20000; i++) {
            const d = env.seeds.randomDelay();
            lo = Math.min(lo, d); hi = Math.max(hi, d);
        }
        assert.deepEqual([lo, hi], [100, 300]);
    });
});

test.describe('which deaths leave seeds', () => {
    test('the kill tool, drawing walls and clearOrganisms leave no seeds', () => {
        const env = h.setup({seedChance: 0}, 3000);
        Hyperparams.seedChance = 100;
        const ctrl = Object.create(EnvironmentController.prototype);
        ctrl.env = env;
        let p = h.plants(env)[0];
        ctrl.cur_cell = env.grid_map.cellAt(p.c, p.r);
        ctrl.killNearOrganisms();
        p = h.plants(env)[0];
        ctrl.dropCellType(p.c, p.r, CellStates.wall, true);
        const everyone = env.organisms;
        env.organisms = [h.plants(env)[0]];
        env.clearOrganisms();
        env.organisms = everyone.filter(o => o.living);
        assert.equal(env.seeds.dropped, 0);
        assert.equal(h.warnings(), 0);
    });

    test('random walls leave no seeds; old age and killer damage do', () => {
        const env = h.setup({seedChance: 0}, 3000);
        Hyperparams.seedChance = 100;
        const ctrl = Object.create(EnvironmentController.prototype);
        ctrl.env = env;
        ctrl.randomizeWalls();
        assert.equal(env.seeds.dropped, 0, 'random walls left seeds');
        let p = h.plants(env)[0];
        p.lifetime = p.lifespan();
        p.update(); // dies of old age
        assert.equal(env.seeds.dropped, 1, 'old age left no seed');
        p = h.plants(env)[0];
        for (let i = 0; i < p.maxHealth(); i++)
            p.harm(); // what killer cells do
        assert.equal(env.seeds.dropped, 2, 'killer damage left no seed');
    });

    test('organisms with mover cells never leave seeds', () => {
        const env = h.setup({seedChance: 100}, 0, {life: false});
        const mover = h.placeOrganism(env, 50, 50, [[CellStates.mouth, 0, 0], [CellStates.producer, 1, 0], [CellStates.mover, 0, 1]]);
        mover.die();
        assert.equal(env.seeds.dropped, 0);
    });
});

test.describe('sprouting', () => {
    test('every sprout is an exact clone of its parent, a plant, in its species, and blocked attempts use up no ids', () => {
        let sprouts = 0, clones = 0, id_gaps = 0;
        const original = SeedBank.prototype.sprout;
        SeedBank.prototype.sprout = function (seed) {
            const id_before = Organism.next_id, n = this.env.organisms.length;
            const ok = original.call(this, seed);
            if (ok) {
                sprouts++;
                const org = this.env.organisms[n];
                if (h.anatomySignature(org) === h.anatomySignature(seed.parent) && org.species === seed.parent.species && this.isPlant(org))
                    clones++;
                if (Organism.next_id !== id_before + 1) id_gaps++;
            }
            else if (Organism.next_id !== id_before) id_gaps++;
            return ok;
        };
        try {
            h.setup({seedChance: 100}, 5000);
        } finally {
            SeedBank.prototype.sprout = original;
        }
        assert.ok(sprouts > 0, 'nothing sprouted');
        assert.equal(clones, sprouts);
        assert.equal(id_gaps, 0);
    });

    test('a seed on its own corpse is blocked when food blocks reproduction, and grows through the food when it does not', () => {
        // alone in an empty world, so only its own corpse can be in the way (its center lands on it whatever the rotation)
        const env = h.setup({seedChance: 100, seedScatterRadius: 0}, 0, {life: false});
        h.placeOrganism(env, 50, 50, [[CellStates.mouth, 0, 0], [CellStates.producer, 1, 0], [CellStates.producer, -1, -1]]).die();
        const seed = env.seeds.seeds[0];
        Hyperparams.foodBlocksReproduction = true;
        assert.equal(env.seeds.sprout(seed), false);
        Hyperparams.foodBlocksReproduction = false;
        assert.equal(env.seeds.sprout(seed), true);
    });

    test('after a total die-off with auto-reset off (scatter 3, food blocks on), seeds sprout in every world', () => {
        for (let k = 0; k < 5; k++) {
            const env = h.setup({seedChance: 0}, 4000);
            WorldConfig.auto_reset = false; // otherwise the empty world resets and the seeds go with it
            Hyperparams.seedChance = 100; // every plant in the die-off leaves a seed
            h.killAll(env);
            Hyperparams.seedChance = 10;
            let n = 0;
            while (env.reset_count === 0 && env.organisms.length === 0 && n < 2000) {
                env.update();
                n++;
            }
            assert.equal(env.reset_count, 0, `world ${k} reset before any seed sprouted`);
            assert.ok(env.organisms.length > 0, `world ${k}: nothing sprouted in 2000 ticks`);
        }
    });

    test('species brought back by a seed keep their lineage ids, are extant again and are counted as revivals', () => {
        const env = h.setup({seedChance: 100, seedDelayMin: 50, seedDelayMax: 100});
        WorldConfig.auto_reset = false; // keep the empty world so the seeds can bring it back
        env.seeds.clear();
        const lineage_before = new Map(env.organisms.map(o => [o.species, o.species.lineage_id]));
        h.killAll(env);
        h.run(env, 400);
        const revived = [...lineage_before.keys()].filter(s => s.revivals > 0);
        assert.ok(revived.length > 0, 'no species came back');
        for (const s of revived) {
            assert.equal(s.lineage_id, lineage_before.get(s));
            if (s.population > 0) {
                assert.equal(FossilRecord.extant_species[s.name], s);
                assert.equal(s.end_tick, -1);
                assert.equal(FossilRecord.lineage_tree[s.lineage_id].end_tick, -1);
                assert.equal(FossilRecord.lineage_tree[s.lineage_id].revivals, s.revivals);
            }
        }
        assert.equal(h.warnings(), 0);
    });
});

test.describe('storms', () => {
    test('a storm destroys every seed in its circle and logs how many', () => {
        const env = h.setup({seedChance: 100}, 4000);
        const {col, row} = env.seeds.seeds[0];
        const radius = 10;
        const inside_before = env.seeds.seeds.filter(s => h.inCircle(s, col, row, radius)).length;
        const event = env.storms.triggerStorm(col, row, radius, 'manual');
        assert.equal(env.seeds.seeds.filter(s => h.inCircle(s, col, row, radius)).length, 0);
        assert.ok(event.seeds_destroyed >= inside_before); // plus seeds its victims dropped inside the circle
        assert.equal(env.seeds.destroyed, event.seeds_destroyed);
    });
});

test.describe('extinction and auto-reset', () => {
    test('with dormant seeds left, the world still resets on the next tick, only once, and the seeds are cleared', () => {
        const env = h.setup({seedChance: 100, seedDelayMin: 5000, seedDelayMax: 5000, seedMaxDormancy: 100000});
        h.killAll(env);
        assert.ok(env.seeds.count() > 0, 'test setup left no seeds');
        env.update();
        assert.equal(env.reset_count, 1);
        assert.equal(env.seeds.count(), 0);
        h.run(env, 100);
        assert.equal(env.reset_count, 1);
    });

    test('with no seeds, the world resets on the next tick, as before', () => {
        const env = h.setup({seedChance: 0});
        h.killAll(env);
        env.update();
        assert.equal(env.reset_count, 1);
    });

    test('auto-pause pauses once on the next tick, even with dormant seeds', () => {
        const env = h.setup({seedChance: 100, seedDelayMin: 5000, seedDelayMax: 5000, seedMaxDormancy: 300});
        WorldConfig.auto_pause = true;
        h.killAll(env);
        env.update();
        assert.equal(h.stubs.pause_clicks, 1);
        h.run(env, 400);
        assert.equal(h.stubs.pause_clicks, 1);
    });

    test('reset clears the seed bank', () => {
        const env = h.setup({seedChance: 100}, 2000);
        env.reset(false);
        assert.equal(env.seeds.count(), 0);
        assert.equal(env.seeds.dropped, 0);
    });
});

test.describe('saving and loading', () => {
    // a world where some species have died out but left seeds behind
    function savedWorld() {
        const env = h.setup({seedChance: 100, seedDelayMin: 3000, seedDelayMax: 4000}, 3000);
        for (const o of env.organisms.slice(0, Math.floor(env.organisms.length / 2)))
            if (o.living) o.die();
        env.update();
        return env;
    }
    const describeSeeds = env => env.seeds.seeds.map(s => [s.col, s.row, s.drop_tick, s.sprout_tick, s.rot_tick,
        s.species.name, s.species.lineage_id, h.anatomySignature(s.parent), s.parent.id].join(';')).sort();

    test('a save/load round trip keeps every seed and the totals', () => {
        const env = savedWorld();
        const before = describeSeeds(env), totals = env.seeds.totals();
        assert.ok(before.length > 0);
        const loaded = h.makeEnv();
        loaded.loadRaw(JSON.parse(JSON.stringify(env.serialize())));
        assert.deepEqual(describeSeeds(loaded), before);
        assert.deepEqual(loaded.seeds.totals(), totals);
    });

    test('species of saved seeds that had died out stay extinct, and come back when their seeds sprout', () => {
        const env = savedWorld();
        const extinct = new Set(env.seeds.seeds.filter(s => s.species.extinct).map(s => s.species.name));
        assert.ok(extinct.size > 0, 'test setup made no extinct species with seeds');
        const loaded = h.makeEnv();
        loaded.loadRaw(JSON.parse(JSON.stringify(env.serialize())));
        const seeds = loaded.seeds.seeds.filter(s => extinct.has(s.species.name));
        for (const s of seeds) {
            assert.ok(s.species.extinct);
            assert.equal(FossilRecord.extant_species[s.species.name], undefined);
            assert.ok(FossilRecord.lineage_tree[s.species.lineage_id], 'no lineage tree entry');
        }
        const max_id = Math.max(...loaded.seeds.seeds.map(s => s.parent.id), ...loaded.organisms.map(o => o.id));
        assert.ok(Organism.next_id > max_id, "new ids would reuse a seed parent's id");
        h.resetWarnings();
        h.run(loaded, 5000);
        assert.ok(seeds.some(s => s.species.revivals > 0), 'no extinct species came back after loading');
        assert.equal(h.warnings(), 0);
    });

    test('saves from before seeds existed still load and run', () => {
        const raw = JSON.parse(JSON.stringify(savedWorld().serialize()));
        delete raw.seed_bank;
        const loaded = h.makeEnv();
        loaded.loadRaw(raw);
        h.run(loaded, 500);
        assert.ok(loaded.organisms.length > 0);
    });
});

test.describe('lineage CSVs', () => {
    test('the seed columns are at the end of every row and add up, and seed_chance follows a mid-run change', () => {
        LineageTracker.clear();
        const env = h.setup({seedChance: 10}, 3000);
        Hyperparams.seedChance = 50;
        h.run(env, 1000); // ends on tick 4000, right after a sample
        const [header, ...lines] = LineageTracker.toCSV().split('\n');
        const head = header.split(',');
        assert.deepEqual(head.slice(-6), ['seed_chance', 'seeds_dormant', 'seeds_dropped', 'seeds_sprouted', 'seeds_rotted', 'seeds_destroyed']);
        const rows = lines.map(l => l.split(','));
        for (const r of rows)
            assert.equal(r.length, head.length);
        // one row per lineage per sample, all with the same world columns, so take one per sample
        const samples = new Map(rows.filter(r => r[0] === String(LineageTracker.run_id)).map(r => [r[1] + r[2], r]));
        const col = name => head.indexOf(name);
        const dropped = [...samples.values()].reduce((sum, r) => sum + Number(r[col('seeds_dropped')]), 0);
        assert.equal(dropped, env.seeds.dropped);
        const chances = [...samples.values()].map(r => Number(r[col('seed_chance')]));
        assert.equal(chances[0], 10);
        assert.equal(chances[chances.length - 1], 50);
    });

    test('the lineage tree CSV has a revivals column on every row', () => {
        h.setup({seedChance: 50}, 2000);
        const [header, ...lines] = LineageTracker.treeToCSV().split('\n');
        const head = header.split(',');
        assert.equal(head[head.length - 1], 'revivals');
        for (const l of lines)
            assert.equal(l.split(',').length, head.length);
    });
});
