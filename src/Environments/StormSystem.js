const CellStates = require('../Organism/Cell/CellStates');
const Hyperparams = require('../Hyperparameters');

// Storm system
// Implemented by Zuhayr Khot
//
// Every tick there's a tiny chance that a storm hits a random circular patch
// of the map. The storm doesn't care what's there:
//   - every organism with even one cell inside the patch dies
//   - all the food inside the patch is destroyed (including the corpses of
//     the organisms it just killed, so nothing is left lying around)
//   - walls stay, because they're terrain and not living stuff
//   - dormant plant seeds inside the patch are destroyed too (see SeedBank.js)
//
// It never picks a species and never forces an extinction. Whether a lineage
// makes it depends on where it happens to be and how spread out it is. A
// species packed into one clump is way easier to wipe out than one scattered
// all over the map. Each storm gets written to a log (what it hit, which
// species died out) so we can tell extinctions caused by weather apart from
// extinctions the organisms did to themselves, which is what matters for
// evolutionary suicide.

const FLASH_MS = 1200;                    // how long a storm stays tinted on screen (real time, not ticks)
const FLASH_COLOR = 'rgba(190, 215, 255, 0.55)';

class StormSystem {
    constructor(env) {
        this.env = env;
        this.log = [];                    // one entry per storm, kept even when the world auto-resets
        this.flashes = [];                // storms currently tinted on screen (just for looks)
        this.storm_count = 0;
    }

    // Called once per tick at the start of WorldEnvironment.update()
    update() {
        if (!Hyperparams.stormsEnabled)
            return;
        let chance = this.currentChance(); // percent per tick
        if (chance > 0 && Math.random() * 100 < chance)
            this.triggerStorm();
    }

    // The real chance of a storm this tick, as a percent (0 to 100)
    currentChance() {
        return Math.min(100, Math.max(0, Hyperparams.stormChance));
    }

    // ---- The storm itself ----

    // col/row/radius are optional. If you leave them out the storm lands on a random tile.
    triggerStorm(col = null, row = null, radius = null, source = 'natural') {
        let env = this.env;
        let grid_map = env.grid_map;
        if (col === null)
            col = Math.floor(Math.random() * grid_map.cols);
        if (row === null)
            row = Math.floor(Math.random() * grid_map.rows);
        if (radius === null)
            radius = Hyperparams.stormRadius;
        radius = Math.max(0, Math.floor(radius));

        // 1. Work out what's inside the circle
        let area = [];
        let victims = new Set();
        let food_destroyed = 0;
        for (let dc = -radius; dc <= radius; dc++) {
            for (let dr = -radius; dr <= radius; dr++) {
                if (dc * dc + dr * dr > radius * radius)
                    continue;
                let cell = grid_map.cellAt(col + dc, row + dr);
                if (cell == null || cell.state === CellStates.wall)
                    continue;
                area.push(cell);
                if (cell.state === CellStates.food)
                    food_destroyed++;
                if (cell.owner != null)
                    victims.add(cell.owner);
            }
        }

        // 2. Kill every organism that got touched
        let species_hit = new Set();
        let organisms_killed = 0;
        for (let org of victims) {
            if (!org.living)
                continue;
            species_hit.add(org.species);
            org.die(); // a normal death: the body turns to food and the species population drops
            organisms_killed++;
        }

        // 3. Clean out the whole patch (old food plus the corpses we just made)
        for (let cell of area) {
            if (cell.state !== CellStates.empty)
                env.changeCell(cell.col, cell.row, CellStates.empty, null);
        }
        // ...and the seeds lying in it, including any the dead plants just dropped inside the circle
        let seeds_destroyed = env.seeds.destroyInArea(col, row, radius);

        // 4. Write down what happened
        let species_extinct = [];
        for (let s of species_hit) {
            if (s.extinct)
                species_extinct.push(s.name);
        }
        let population_after = 0;
        for (let org of env.organisms) {
            if (org.living)
                population_after++;
        }
        this.storm_count++;
        let event = {
            id: this.storm_count,
            source: source,
            tick: env.total_ticks,
            reset_count: env.reset_count,
            col: col,
            row: row,
            radius: radius,
            organisms_killed: organisms_killed,
            food_destroyed: food_destroyed,
            seeds_destroyed: seeds_destroyed,
            species_hit: Array.from(species_hit, s => s.name),
            species_extinct: species_extinct,
            population_after: population_after,
            wiped_out_world: organisms_killed > 0 && population_after === 0
        };
        this.log.push(event);

        // 5. Flash the patch on screen (looks only, doesn't affect the simulation)
        this.flashes.push({col: col, row: row, radius: radius, until: Date.now() + FLASH_MS});

        return event;
    }

    // ---- Drawing ----

    // Called from WorldEnvironment.render() after the normal cells are drawn
    render() {
        if (this.flashes.length === 0)
            return;
        let renderer = this.env.renderer;
        let grid_map = this.env.grid_map;
        let ctx = renderer.ctx;
        let now = Date.now();
        let still_active = [];
        for (let flash of this.flashes) {
            let expired = now >= flash.until;
            for (let dc = -flash.radius; dc <= flash.radius; dc++) {
                for (let dr = -flash.radius; dr <= flash.radius; dr++) {
                    if (dc * dc + dr * dr > flash.radius * flash.radius)
                        continue;
                    let cell = grid_map.cellAt(flash.col + dc, flash.row + dr);
                    if (cell == null)
                        continue;
                    renderer.renderCell(cell); // redraw the real cell first so the tint never builds up
                    if (!expired) {
                        ctx.fillStyle = FLASH_COLOR;
                        ctx.fillRect(cell.x, cell.y, renderer.cell_size, renderer.cell_size);
                    }
                }
            }
            if (!expired)
                still_active.push(flash);
        }
        this.flashes = still_active;
    }

    // ---- Log helpers ----

    // How many storms have hit since the last reset
    stormsInCurrentRun() {
        return this.log.filter(e => e.reset_count === this.env.reset_count).length;
    }

    clearLog() {
        this.log = [];
        this.storm_count = 0;
    }

    // Saves the storm log as a .json file (this is what the Download button uses)
    downloadLog(filename = 'storm_log.json') {
        let data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.log, null, 2));
        let downloadEl = document.getElementById('download-el');
        downloadEl.setAttribute("href", data);
        downloadEl.setAttribute("download", filename);
        downloadEl.click();
    }
}

module.exports = StormSystem;
