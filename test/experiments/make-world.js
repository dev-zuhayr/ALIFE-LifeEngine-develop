// Builds a starting world save for testing seeds, to load with "Load World" in the browser
// (keep "Override Evolution Controls" ticked so its settings load too).
//
//     npm run make-world -- [--cols 308] [--rows 146] [--out test/experiments/worlds/basic-world.json]
//
// The default size is what "Fill Window" gives at cell size 5 on a 1920x1080 screen at 125% scaling.
// The map is split into patches of about 77x73 cells. Each patch gets three 6zwopgo1rm plants, two
// yqqohd0nda plants and two yihvwmi3yk animals (from test/experiments/organisms/), each organism
// keeping its species name. Settings come from test/experiments/controls/seeds-only.json.
const fs = require('fs');
const path = require('path');
const h = require('../helpers/headless');
const {Hyperparams, Organism, FossilRecord} = h;

const args = {cols: 308, rows: 146, out: path.join(__dirname, 'worlds', 'basic-world.json')};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in args) || argv[i + 1] === undefined) {
        console.error(`Unknown or incomplete option: ${argv[i]}`);
        process.exit(1);
    }
    args[key] = key === 'out' ? argv[i + 1] : Number(argv[i + 1]);
}

const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const controls = read('controls/seeds-only.json');
const plant_a = read('organisms/6zwopgo1rm.json');
const plant_b = read('organisms/yqqohd0nda.json');
const animal = read('organisms/yihvwmi3yk.json');

Hyperparams.setDefaults();
Object.assign(Hyperparams, controls);
const env = h.makeEnv({cols: args.cols, rows: args.rows, life: false});
FossilRecord.clear_record();

// the first organism of each kind founds its species (under the name from its file); the rest are copies of it
const founders = new Map();
let skipped = 0;
function place(raw, c, r) {
    let org;
    const founder = founders.get(raw);
    if (founder) {
        org = new Organism(c, r, env, founder);
    } else {
        org = new Organism(c, r, env);
        const id = org.id;
        org.loadRaw(raw);
        Object.assign(org, {id, c, r, parent_id: -1});
    }
    if (!org.isClear(c, r)) {
        skipped++;
        return;
    }
    env.addOrganism(org);
    if (founder) {
        org.species.addPop();
        return;
    }
    const species = FossilRecord.addSpecies(org, null);
    delete FossilRecord.extant_species[species.name];
    species.name = raw.species_name;
    FossilRecord.extant_species[species.name] = species;
    founders.set(raw, org);
}

const patch_cols = Math.max(1, Math.round(args.cols / 77));
const patch_rows = Math.max(1, Math.round(args.rows / 73));
for (let i = 0; i < patch_cols; i++) {
    for (let j = 0; j < patch_rows; j++) {
        const pc = Math.floor((i + 0.5) * args.cols / patch_cols);
        const pr = Math.floor((j + 0.5) * args.rows / patch_rows);
        for (const [dc, dr] of [[0, 0], [0, -9], [0, 9]])
            place(plant_a, pc + dc, pr + dr);
        for (const [dc, dr] of [[-9, 0], [9, 0]])
            place(plant_b, pc + dc, pr + dr);
        for (const [dc, dr] of [[16, 7], [-16, -7]])
            place(animal, pc + dc, pr + dr);
    }
}

fs.mkdirSync(path.dirname(args.out), {recursive: true});
fs.writeFileSync(args.out, JSON.stringify(env.serialize()));
const count = name => env.organisms.filter(o => o.species.name === name).length;
console.log(`${args.cols}x${args.rows} world, ${patch_cols * patch_rows} patches: ` +
    `${count(plant_a.species_name)} ${plant_a.species_name}, ${count(plant_b.species_name)} ${plant_b.species_name}, ` +
    `${count(animal.species_name)} ${animal.species_name}` + (skipped ? `, ${skipped} skipped for lack of room` : ''));
console.log(`Saved to ${args.out}`);
