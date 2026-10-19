// Experiment, not a test: runs worlds with only seeds and the lineage tracker active, with and
// without seeds, and writes the lineage CSVs to files. Every other project feature is off: storms,
// islands, wings, gauge cells, food decay and seasonal booms.
//
//     npm run experiment:lineage -- [--worlds 8] [--ticks 10000] [--seed 1] [--controls controls.json]
//                                   [--world world.json] [--out dir]
//
//   --worlds    worlds per condition (default 8)
//   --ticks     ticks per world (default 10000). A world that goes extinct ends early.
//   --seed      random seed (default 1). The same seed gives the same results, and world k of both
//               conditions starts from the same random numbers, so they only differ once seeds matter.
//   --controls  a controls file saved from the Evolution Controls tab, used instead of the defaults.
//               The features above are still switched off.
//   --world     a world saved with "Save World" to start every world from, instead of the single
//               starting plant. Its settings are used unless --controls is given.
//   --out       output folder (default test/experiments/output/<date and time>)
//
// For many worlds at once, run-batch.js runs several copies of this in parallel.
//
// Conditions: "no_seeds" (seed chance 0) and "seeds" (the seed chance from the defaults or --controls).
// Seed chance 0 rather than seeds disabled, so both conditions make the same random calls.
//
// Writes:
//   runs.csv           one row per world: run_id, condition, how it ended, and the final counts
//   lineages.csv       the lineage tracker's samples, as from the Statistics tab (run_id matches runs.csv)
//   lineages_tree.csv  the lineage tree of every world
//   settings.json      the settings used
const fs = require('fs');
const path = require('path');
const h = require('../helpers/headless');
const {Hyperparams, WorldConfig, LineageTracker, FossilRecord} = h;

const args = {worlds: 8, ticks: 10000, seed: 1, controls: null, world: null, out: null};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in args) || argv[i + 1] === undefined) {
        console.error(`Unknown or incomplete option: ${argv[i]}`);
        process.exit(1);
    }
    args[key] = ['worlds', 'ticks', 'seed'].includes(key) ? Number(argv[i + 1]) : argv[i + 1];
}
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const out = args.out || path.join(__dirname, 'output', stamp);

// Small seedable generator (mulberry32), so a run can be repeated exactly
function seededRandom(seed) {
    let a = seed >>> 0;
    return function() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const world = args.world ? JSON.parse(fs.readFileSync(args.world, 'utf8')) : null;
const controls = args.controls ? JSON.parse(fs.readFileSync(args.controls, 'utf8')) : (world ? world.controls : {});
const isolate = {
    stormsEnabled: false, islandsEnabled: false, wingsCanMutate: false, gaugeCanMutate: false,
    foodLifetime: 0, seasonsEnabled: false, seedsEnabled: true,
};
const settings = Object.assign({}, controls, isolate);

// world 0 is a placeholder made by setup(); each real world comes from reset() or, with --world,
// from loading the save. Both archive the previous world's lineage tree and start a new run_id,
// the same as a reset or a load in the browser.
Math.random = seededRandom(args.seed);
const env = h.setup(settings, 0, {life: false});
const seed_chance = Hyperparams.seedChance;
WorldConfig.auto_reset = false; // a world that dies out ends here instead of starting over
if (seed_chance <= 0)
    console.warn('Warning: the seed chance is 0, so both conditions are the same');
const conditions = [['no_seeds', 0], ['seeds', seed_chance]];

console.log(`${args.worlds} worlds per condition, ${args.ticks} ticks each, random seed ${args.seed}, seed chance ${seed_chance}%` +
    (world ? `, starting from ${path.basename(args.world)}` : ''));
const runs = [];
const t0 = Date.now();
for (let k = 0; k < args.worlds; k++) {
    for (const [condition, chance] of conditions) {
        Math.random = seededRandom(args.seed * 100003 + k);
        Hyperparams.seedChance = chance;
        if (world) {
            if (runs.length > 0)
                LineageTracker.record(env, 'end'); // reset() logs this itself, loading doesn't
            env.loadRaw(JSON.parse(JSON.stringify(world))); // a fresh copy, since loading changes it
        }
        else {
            env.reset(false);
        }
        if (runs.length === 0)
            LineageTracker.clear(); // drop the rows reset() logged for the empty placeholder world
        const run_id = LineageTracker.run_id;
        let ticks = 0;
        while (ticks < args.ticks && env.organisms.length > 0) {
            env.update();
            ticks++;
        }
        const animals = env.organisms.filter(o => o.anatomy.is_mover).length;
        const food = env.sampleFood().total_food;
        const row = {run_id, condition, seed_chance: chance, world: k, ticks_run: ticks,
            outcome: env.organisms.length === 0 ? 'extinct' : 'survived',
            final_pop: env.organisms.length, final_animals: animals, final_plants: env.organisms.length - animals,
            final_food: food, species_ever: FossilRecord.next_lineage_id,
            seeds_dropped: env.seeds.dropped, seeds_sprouted: env.seeds.sprouted};
        runs.push(row);
        console.log(`  world ${k + 1}/${args.worlds} ${condition.padEnd(8)} ${row.outcome.padEnd(8)} after ${ticks} ticks, ` +
            `pop ${row.final_pop} (${animals} animals), food ${food}, seeds sprouted ${row.seeds_sprouted}`);
    }
}
LineageTracker.record(env, 'end'); // the last world gets its 'end' row like the others did on reset

fs.mkdirSync(out, {recursive: true});
const header = Object.keys(runs[0]);
fs.writeFileSync(path.join(out, 'runs.csv'), [header.join(',')].concat(runs.map(r => header.map(k => r[k]).join(','))).join('\n'));
fs.writeFileSync(path.join(out, 'lineages.csv'), LineageTracker.toCSV());
fs.writeFileSync(path.join(out, 'lineages_tree.csv'), LineageTracker.treeToCSV());
fs.writeFileSync(path.join(out, 'settings.json'), JSON.stringify(Object.assign({}, Hyperparams, {seedChance: seed_chance}, {args}), null, 2));

for (const [condition] of conditions) {
    const rs = runs.filter(r => r.condition === condition);
    const survived = rs.filter(r => r.outcome === 'survived').length;
    const with_animals = rs.filter(r => r.final_animals > 0).length;
    console.log(`${condition.padEnd(8)} survived ${survived}/${rs.length}, animals alive at the end in ${with_animals}/${rs.length}, ` +
        `median final pop ${h.median(rs.map(r => r.final_pop))}`);
}
console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s. Results in ${out}`);
