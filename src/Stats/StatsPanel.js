const PopulationChart = require("./Charts/PopulationChart");
const SpeciesChart = require("./Charts/SpeciesChart");
const MutationChart = require("./Charts/MutationChart");
const CellsChart = require("./Charts/CellsChart");
const FossilRecord = require("./FossilRecord");
const Hyperparams = require("../Hyperparameters");


const ChartSelections = [PopulationChart, SpeciesChart, CellsChart, MutationChart];

class StatsPanel {
    constructor(env) {
        this.defineControls();
        this.chart_selection = 0;
        this.setChart();
        this.env = env;
        this.last_reset_count=env.reset_count;
    }

    setChart(selection=this.chart_selection) {
        this.chart_controller = new ChartSelections[selection]();
        this.chart_controller.setData();
        this.chart_controller.render();
    }

    startAutoRender() {
        this.setChart();
        this.render_loop = setInterval(function(){this.updateChart();}.bind(this), 1000);
    }

    stopAutoRender() {
        clearInterval(this.render_loop);
    }

    defineControls() {
        $('#chart-option').change ( function() {
            this.chart_selection = $("#chart-option")[0].selectedIndex;
            this.setChart();
        }.bind(this));
    }

    updateChart() {
        if (this.last_reset_count < this.env.reset_count){
            this.reset()
        }
        this.last_reset_count = this.env.reset_count;
        this.chart_controller.updateData();
        this.chart_controller.render();
    }

    updateDetails() {
        var org_count = this.env.organisms.length;
        $('#org-count').text("Total Population: " + org_count);
        $('#species-count').text("Number of Species: " + FossilRecord.numExtantSpecies());
        let top_species = FossilRecord.getMostPopulousSpecies();
        if (top_species)
            $('#top-species').text("Most Populous Species: \"" + top_species.name + "\" (" + top_species.population + " organisms)");
        else    
            $('#top-species').text("Most Populous Species: None");
        $('#largest-org').text("Largest Organism Ever: " + this.env.largest_cell_count + " cells");
        $('#avg-mut').text("Average Mutation Rate: " + Math.round(this.env.averageMutability() * 100) / 100);
        let storms = this.env.storms;
        let last = storms.log.length > 0 ? storms.log[storms.log.length - 1] : null;
        $('#storm-stats').text("Storms this run: " + storms.stormsInCurrentRun() + " (" + storms.storm_count + " total)" +
            " | Current storm chance: " + Math.round(storms.currentChance() * 10000) / 10000 + "% per tick" +
            (last ? " | Last storm: tick " + last.tick + ", killed " + last.organisms_killed + " organisms" : ""));
        let seeds = this.env.seeds;
        $('#seed-stats').text("Seeds this run: " + seeds.count() + " dormant" +
            " | dropped " + seeds.dropped + ", sprouted " + seeds.sprouted + ", rotted " + seeds.rotted +
            ", destroyed by storms " + seeds.destroyed +
            " | Seed chance: " + (Hyperparams.seedsEnabled ? Hyperparams.seedChance + "% per plant death" : "off"));
    }

    reset() {
        this.setChart();
    }
    
}

module.exports = StatsPanel;