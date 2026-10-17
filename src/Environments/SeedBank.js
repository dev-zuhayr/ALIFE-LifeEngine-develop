const Hyperparams = require('../Hyperparameters');
const Organism = require('../Organism/Organism');
const Directions = require('../Organism/Directions');
const FossilRecord = require('../Stats/FossilRecord');

// Seed bank
//
// When a plant dies there's a chance (seedChance) that it leaves a seed behind
// at its center cell. The seed lies dormant in the soil (it isn't drawn on the
// grid and nothing can eat it) for a random delay, then tries to sprout into an
// exact copy of the plant that dropped it. This gives the plant population a
// way to come back after a crash, even if every living plant has died.
//
// A "plant" is an organism with producer cells and no mover cells.
//
// Sprouting:
//   - a sprout follows the same placement rules as a normal birth: it needs
//     room on the grid, it respects "Food blocks reproduction" (so with that on,
//     food on the spot, including its parent's corpse, blocks it until eaten),
//     and it respects the organism limit
//   - a blocked seed tries again a little later
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
        let now = this.env.total_ticks;
        this.seeds.push({
            col: org.c,
            row: org.r,
            parent: org,          // the dead organism, so the sprout can inherit from it like a child
            species: org.species,
            drop_tick: now,
            sprout_tick: now + this.randomDelay(),
            rot_tick: now + Math.max(0, Hyperparams.seedMaxDormancy),
        });
        this.dropped++;
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
        let org = new Organism(seed.col, seed.row, env, seed.parent);
        if (Hyperparams.rotationEnabled)
            org.rotation = Directions.getRandomDirection();
        if (!org.isClear(seed.col, seed.row)) // the same check a normal birth uses
            return false;
        env.addOrganism(org); // draws the sprout on the grid (removing food under it if food doesn't block)
        if (org.species.extinct)
            FossilRecord.resurrect(org.species);
        org.species.addPop();
        return true;
    }

    count() {
        return this.seeds.length;
    }

    clear() {
        this.seeds = [];
        this.dropped = 0;
        this.sprouted = 0;
        this.rotted = 0;
    }
}

module.exports = SeedBank;
