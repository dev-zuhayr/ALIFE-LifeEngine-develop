// Experiment, not a test: compares seed settings over several runs and prints tables.
// Takes a few minutes.  npm run experiment:seeds -- [runs per setting, default 8]
const h = require('../helpers/headless');
const {Hyperparams} = h;

const RUNS = Number(process.argv[2]) || 8;

console.log(`Total die-off with "Food blocks reproduction" on: how often do the plants come back? (${RUNS} runs each)`);
console.log('Each run grows a world for 4000 ticks, kills every organism (each plant leaves a seed), then runs up to 6000 more ticks.');
for (const radius of [0, 1, 3, 5]) {
    let recovered = 0;
    const first_sprouts = [];
    for (let k = 0; k < RUNS; k++) {
        const env = h.setup({seedChance: 0, seedScatterRadius: radius}, 4000);
        h.WorldConfig.auto_reset = false; // an empty world would otherwise reset straight away and clear the seeds
        Hyperparams.seedChance = 100;
        h.killAll(env);
        Hyperparams.seedChance = 10;
        let n = 0, first = -1;
        while (env.reset_count === 0 && n < 6000) {
            env.update();
            n++;
            if (first < 0 && env.reset_count === 0 && env.organisms.length > 0) first = n;
        }
        if (env.reset_count === 0 && env.organisms.length > 0) recovered++;
        if (first > 0) first_sprouts.push(first);
    }
    console.log(`  scatter radius ${radius}: alive after 6000 ticks in ${recovered}/${RUNS}` +
        (first_sprouts.length ? `, median first sprout after ${h.median(first_sprouts)} ticks` : ', no seed ever sprouted'));
}

console.log(`\nNormal 10,000-tick runs, default settings otherwise (${RUNS} runs each)`);
for (const chance of [0, 10, 50]) {
    const pops = [];
    let resets = 0;
    for (let k = 0; k < RUNS; k++) {
        const env = h.setup({seedChance: chance}, 10000);
        pops.push(env.organisms.length);
        resets += env.reset_count;
    }
    console.log(`  seed chance ${String(chance).padStart(2)}%: median population ${h.median(pops)}, ` +
        `range ${Math.min(...pops)}-${Math.max(...pops)}, auto-resets ${resets}`);
}
