const CellStates = require("../Organism/Cell/CellStates");
const FossilRecord = require("./FossilRecord");
const Hyperparams = require("../Hyperparameters");

// Logs per-lineage population, cell type counts and world food levels, and exports them as CSV.
// Rows persist across resets so a run that ends in extinction can be analysed afterwards;
// each row carries a run_id that increases on every reset or world load.
const LineageTracker = {
    init: function() {
        this.cell_names = CellStates.living.map(c => c.name);
        this.rows = []; // one CSV line per lineage per sample
        this.tree_rows = []; // lineage tree CSV lines from finished runs
        this.run_id = 0;
    },

    header: function() {
        return ['run_id', 'tick', 'event', 'lineage_id', 'parent_lineage_id', 'founder_id', 'population']
            .concat(this.cell_names)
            .concat(['total_pop', 'num_lineages', 'total_food', 'plant_food', 'corpse_food', 'other_food',
                     'plant_food_produced', 'avg_mutability',
                     'seed_chance', 'seeds_dormant', 'seeds_dropped', 'seeds_sprouted', 'seeds_rotted', 'seeds_destroyed'])
            .join(',');
    },

    treeHeader: function() {
        return ['run_id', 'lineage_id', 'parent_lineage_id', 'founder_id', 'start_tick', 'end_tick']
            .concat(this.cell_names)
            .concat(['revivals'])
            .join(',');
    },

    // called every data_update_rate ticks with event 'sample', and with event 'end' just before a reset.
    // an 'end' row can share a tick with a 'sample' row, since organisms can all die after that tick was sampled
    record: function(env, event='sample') {
        let lineages = {};
        let total_pop = 0;
        for (let org of env.organisms) {
            if (!org.living)
                continue;
            total_pop++;
            let s = org.species;
            let l = lineages[s.lineage_id];
            if (!l) {
                l = lineages[s.lineage_id] = {
                    parent_lineage_id: s.parent_lineage_id,
                    founder_id: s.founder_id,
                    population: 0,
                    cells: this.emptyCellCounts(),
                };
            }
            l.population++;
            for (let cell of org.anatomy.cells)
                l.cells[cell.state.name]++;
        }

        let food = env.sampleFood();
        // seed counts are since the last sample, except seeds_dormant which is how many are waiting right now
        let seeds = env.seeds.sampleCounts();
        let world = [total_pop, Object.keys(lineages).length, food.total_food, food.plant_food, food.corpse_food,
                     food.other_food, food.plant_food_produced, env.averageMutability().toFixed(3),
                     Hyperparams.seedsEnabled ? Hyperparams.seedChance : 0, env.seeds.count(),
                     seeds.dropped, seeds.sprouted, seeds.rotted, seeds.destroyed];

        // with no living organisms, still log a row so the extinction shows up in the data
        if (total_pop === 0) {
            this.rows.push(this.lineageRow(env.total_ticks, event, -1, {parent_lineage_id: -1, founder_id: -1,
                population: 0, cells: this.emptyCellCounts()}, world));
            return;
        }
        for (let id in lineages)
            this.rows.push(this.lineageRow(env.total_ticks, event, id, lineages[id], world));
    },

    lineageRow: function(tick, event, lineage_id, l, world) {
        return [this.run_id, tick, event, lineage_id, l.parent_lineage_id, l.founder_id, l.population]
            .concat(this.cell_names.map(name => l.cells[name]))
            .concat(world)
            .join(',');
    },

    emptyCellCounts: function() {
        let counts = {};
        for (let name of this.cell_names)
            counts[name] = 0;
        return counts;
    },

    treeRowsFor: function(run_id, tree) {
        let rows = [];
        for (let id in tree) {
            let t = tree[id];
            rows.push([run_id, id, t.parent_lineage_id, t.founder_id, t.start_tick, t.end_tick]
                .concat(this.cell_names.map(name => t.cell_counts ? t.cell_counts[name] : 0))
                .concat([t.revivals || 0])
                .join(','));
        }
        return rows;
    },

    // archives the current run's lineage tree before FossilRecord clears it, then starts a new run
    newRun: function() {
        this.tree_rows = this.tree_rows.concat(this.treeRowsFor(this.run_id, FossilRecord.lineage_tree));
        this.run_id++;
    },

    toCSV: function() {
        return this.header() + '\n' + this.rows.join('\n');
    },

    treeToCSV: function() {
        let current = this.treeRowsFor(this.run_id, FossilRecord.lineage_tree);
        return this.treeHeader() + '\n' + this.tree_rows.concat(current).join('\n');
    },

    // downloads <name>.csv (samples) and <name>_tree.csv (lineage tree)
    download: function(name='lineages') {
        this.downloadFile(name + '.csv', this.toCSV());
        this.downloadFile(name + '_tree.csv', this.treeToCSV());
    },

    downloadFile: function(filename, text) {
        // a Blob url rather than a data: uri, since long runs can produce many megabytes
        let url = URL.createObjectURL(new Blob([text], {type: 'text/csv'}));
        let downloadEl = document.getElementById('download-el');
        downloadEl.setAttribute('href', url);
        downloadEl.setAttribute('download', filename);
        downloadEl.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    clear: function() {
        this.rows = [];
        this.tree_rows = [];
    },
}

LineageTracker.init();

module.exports = LineageTracker;
