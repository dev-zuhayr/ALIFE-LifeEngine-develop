const Hyperparams = require('../Hyperparameters');
const Organism = require('../Organism/Organism');
const Directions = require('../Organism/Directions');
const FossilRecord = require('../Stats/FossilRecord');
const Species = require('../Stats/Species');
const SerializeHelper = require('../Utils/SerializeHelper');

// Seed bank
//
// When a plant dies there's a chance (seedChance) that it leaves a seed behind.
// The seed falls on a random tile within seedScatterRadius of the plant's
// center and lies dormant there (it isn't drawn on the grid and nothing can eat
// it) for a random delay, then tries to sprout into an exact copy of the plant
// that dropped it. This gives the plant population a way to come back after a
// crash, even if every living plant has died.
//
// A "plant" is an organism with producer cells and no mover cells.
//
// Which deaths leave seeds: old age, killer cells and storms do. Deaths caused
// by hand (the kill tool, drawing walls over an organism) don't, see
// Organism.die(leave_seed). A storm destroys every seed inside its circle,
// including the seeds of the plants it just killed if they fell inside it.
//
// Sprouting:
//   - a sprout follows the same placement rules as a normal birth: it needs
//     room on the grid, it respects "Food blocks reproduction" (so with that on,
//     food on the spot, such as its parent's corpse, blocks it until eaten),
//     and it respects the organism limit. Scattering is what lets seeds find a
//     free spot after a die-off, when nothing is left alive to eat the corpses.
//   - a blocked seed tries again a little later, on the same spot
//   - a seed that hasn't sprouted seedMaxDormancy ticks after being dropped rots
//   - the sprout is a clone (no mutation) and joins its parent's species,
//     bringing the species back if it had gone extinct in the meantime

const RETRY_TICKS = 20; // how long a blocked seed waits before trying to sprout again

class SeedBank {
    constructor(env) {
        this.env = env;
        this.seeds = [];   // dormant seeds: {col, row, parent, species, drop_tick, sprout_tick, rot_tick}
        this.dropped = 0;  // totals for the current run
        this.sprouted = 0;
        this.rotted = 0;
        this.destroyed = 0; // by storms
        this.last_sample = this.totals(); // totals at the last sampleCounts() call
    }

    isPlant(org) {
        return org.anatomy.is_producer && !org.anatomy.is_mover;
    }

    // Called from Organism.die(), before the body turns to food
    tryLeaveSeed(org) {
        if (!Hyperparams.seedsEnabled || !this.isPlant(org))
            return;
        if (Math.random() * 100 >= Hyperparams.seedChance)
            return;
        let [dc, dr] = this.randomScatter();
        let now = this.env.total_ticks;
        this.seeds.push({
            col: org.c + dc,
            row: org.r + dr,
            parent: org,          // the dead organism, so the sprout can inherit from it like a child
            species: org.species,
            drop_tick: now,
            sprout_tick: now + this.randomDelay(),
            rot_tick: now + Math.max(0, Hyperparams.seedMaxDormancy),
        });
        this.dropped++;
    }

    // Random offset inside a circle of radius seedScatterRadius (0 = the plant's own center)
    randomScatter() {
        let radius = Math.max(0, Math.floor(Hyperparams.seedScatterRadius));
        let dc, dr;
        do {
            dc = Math.floor(Math.random() * (2 * radius + 1)) - radius;
            dr = Math.floor(Math.random() * (2 * radius + 1)) - radius;
        } while (dc * dc + dr * dr > radius * radius);
        return [dc, dr];
    }

    // Random number of ticks between seedDelayMin and seedDelayMax (inclusive)
    randomDelay() {
        let lo = Math.max(0, Math.min(Hyperparams.seedDelayMin, Hyperparams.seedDelayMax));
        let hi = Math.max(0, Math.max(Hyperparams.seedDelayMin, Hyperparams.seedDelayMax));
        return lo + Math.floor(Math.random() * (hi - lo + 1));
    }

    // Called once per tick from WorldEnvironment.update()
    update() {
        if (this.seeds.length === 0)
            return;
        let now = this.env.total_ticks;
        let still_dormant = [];
        for (let seed of this.seeds) {
            if (now >= seed.rot_tick) {
                this.rotted++;
                continue;
            }
            if (now >= seed.sprout_tick) {
                if (this.sprout(seed)) {
                    this.sprouted++;
                    continue;
                }
                seed.sprout_tick = now + RETRY_TICKS; // blocked, try again later
            }
            still_dormant.push(seed);
        }
        this.seeds = still_dormant;
    }

    // Grows the seed into a copy of its parent. Returns false if it's blocked.
    sprout(seed) {
        let env = this.env;
        if (!env.canAddOrganism())
            return false;
        let rotation = Hyperparams.rotationEnabled ? Directions.getRandomDirection() : Directions.up;
        // The parent has the same body as the sprout, so ask it whether there's room (the same check a
        // normal birth uses). This avoids creating, and using up an id for, an organism that can't fit.
        if (!seed.parent.isClear(seed.col, seed.row, rotation))
            return false;
        let org = new Organism(seed.col, seed.row, env, seed.parent);
        org.rotation = rotation;
        env.addOrganism(org); // draws the sprout on the grid (removing food under it if food doesn't block)
        if (org.species.extinct)
            FossilRecord.resurrect(org.species);
        org.species.addPop();
        return true;
    }

    // Storms: removes every seed inside the circle. Returns how many were destroyed.
    destroyInArea(col, row, radius) {
        let before = this.seeds.length;
        this.seeds = this.seeds.filter(seed => {
            let dc = seed.col - col;
            let dr = seed.row - row;
            return dc * dc + dr * dr > radius * radius;
        });
        let destroyed = before - this.seeds.length;
        this.destroyed += destroyed;
        return destroyed;
    }

    count() {
        return this.seeds.length;
    }

    totals() {
        return {dropped: this.dropped, sprouted: this.sprouted, rotted: this.rotted, destroyed: this.destroyed};
    }

    // What happened since the last call (for the lineage log, like WorldEnvironment.sampleFood())
    sampleCounts() {
        let now = this.totals();
        let since = {};
        for (let key in now)
            since[key] = now[key] - this.last_sample[key];
        this.last_sample = now;
        return since;
    }

    clear() {
        this.seeds = [];
        this.dropped = 0;
        this.sprouted = 0;
        this.rotted = 0;
        this.destroyed = 0;
        this.last_sample = this.totals();
    }

    // ---- Saving and loading ----

    // Seeds whose species has died out aren't in the fossil record's save, so the
    // species data needed to bring them back is saved here too.
    serialize() {
        let raw = this.totals();
        raw.seeds = [];
        raw.species = {};
        for (let seed of this.seeds) {
            raw.seeds.push({
                col: seed.col,
                row: seed.row,
                drop_tick: seed.drop_tick,
                sprout_tick: seed.sprout_tick,
                rot_tick: seed.rot_tick,
                parent: seed.parent.serialize(),
            });
            if (!raw.species[seed.species.name])
                raw.species[seed.species.name] = SerializeHelper.copyNonObjects(seed.species);
        }
        return raw;
    }

    // species_map: name -> Species for the species loaded from the fossil record.
    // Returns the extinct species that had to be rebuilt from the seed bank's own save.
    loadRaw(raw, species_map) {
        this.clear();
        let extinct = {};
        for (let raw_seed of raw.seeds || []) {
            let name = raw_seed.parent.species_name;
            let parent = new Organism(raw_seed.parent.col, raw_seed.parent.row, this.env);
            parent.loadRaw(raw_seed.parent);
            let species = species_map[name] || extinct[name];
            if (!species) {
                species = new Species(null, null, 0);
                if (raw.species && raw.species[name])
                    SerializeHelper.overwriteNonObjects(raw.species[name], species);
                species.name = name;
                extinct[name] = species;
            }
            if (!species.anatomy) {
                species.anatomy = parent.anatomy;
                species.calcAnatomyDetails();
            }
            parent.species = species;
            this.seeds.push({
                col: raw_seed.col,
                row: raw_seed.row,
                parent: parent,
                species: species,
                drop_tick: raw_seed.drop_tick,
                sprout_tick: raw_seed.sprout_tick,
                rot_tick: raw_seed.rot_tick,
            });
        }
        this.dropped = raw.dropped || 0;
        this.sprouted = raw.sprouted || 0;
        this.rotted = raw.rotted || 0;
        this.destroyed = raw.destroyed || 0;
        this.last_sample = this.totals();
        return Object.values(extinct);
    }
}

module.exports = SeedBank;
