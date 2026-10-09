const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");

// ============================================================================
// GAUGE CELL
// ----------------------------------------------------------------------------
// A sensory cell that measures how much food is lying around it. When food is
// scarce, it makes its owner "hold back" from reproducing: each child costs
// more food than normal, so the organism breeds more slowly.
//
// Nothing here decides survival or extinction. The gauge only changes the food
// cost of a child, based on what it measures in the world at that moment.
// Whether restraint helps or hurts a lineage is left to evolution:
//   * Gauge cells appear only through random mutation (like any other cell).
//   * Each gauge gets a random "sensitivity" when it first appears, which is
//     inherited unchanged by its descendants, so selection decides which
//     sensitivity (if any) survives.
// ============================================================================

// ---- Tunable settings (change these to run your experiments) ----
const GAUGE_RANGE = 5;            // how far the gauge looks: a (2*5+1) x (2*5+1) = 11x11 square
const MIN_SENSITIVITY = 0.02;     // lowest possible "scarce" threshold (2% of nearby tiles are food)
const MAX_SENSITIVITY = 0.20;     // highest possible "scarce" threshold (20% of nearby tiles are food)
const DEFAULT_SENSITIVITY = 0.08; // threshold used when you place a gauge by hand in the editor
const MAX_RESTRAINT = 1.0;        // at total scarcity a child costs (1 + 1.0) = 2x the normal food

class GaugeCell extends BodyCell {
    constructor(org, loc_col, loc_row) {
        super(CellStates.gauge, org, loc_col, loc_row);
    }

    // Child copies its parent's gauge exactly (also used when loading a saved world)
    initInherit(parent) {
        super.initInherit(parent);
        this.sensitivity = parent.sensitivity;
        if (this.sensitivity === undefined)
            this.sensitivity = DEFAULT_SENSITIVITY;
    }

    // A brand-new gauge created by mutation gets a random sensitivity
    initRandom() {
        this.sensitivity = MIN_SENSITIVITY + Math.random() * (MAX_SENSITIVITY - MIN_SENSITIVITY);
    }

    // A gauge placed by hand in the organism editor
    initDefault() {
        this.sensitivity = DEFAULT_SENSITIVITY;
    }

    // Runs once per tick, like every other cell's performFunction
    performFunction() {
        var org = this.org;

        // An organism can have several gauges. Reset the combined reading once
        // per tick (lifetime goes up by 1 every tick), then each gauge can raise it.
        if (org.gauge_tick !== org.lifetime) {
            org.gauge_tick = org.lifetime;
            org.gauge_penalty = 0;
        }

        var density = this.measureFoodDensity();

        // scarcity: 0 when density is at or above the threshold, 1 when there is no food at all
        var scarcity = 1 - (density / this.sensitivity);
        if (scarcity <= 0)
            return; // enough food around: this gauge applies no restraint

        // Extra food a child will cost, scaled by body size and how scarce food is
        var penalty = Math.ceil(org.anatomy.cells.length * MAX_RESTRAINT * scarcity);

        // With several gauges, the most pessimistic one wins
        if (penalty > org.gauge_penalty)
            org.gauge_penalty = penalty;
    }

    // Fraction of the tiles around this cell that are food (0 to 1)
    measureFoodDensity() {
        var grid_map = this.org.env.grid_map;
        var center_c = this.getRealCol();
        var center_r = this.getRealRow();
        var food = 0;
        var total = 0;
        for (var dc = -GAUGE_RANGE; dc <= GAUGE_RANGE; dc++) {
            for (var dr = -GAUGE_RANGE; dr <= GAUGE_RANGE; dr++) {
                var cell = grid_map.cellAt(center_c + dc, center_r + dr);
                if (cell == null)
                    continue;              // off the edge of the map
                if (cell.owner === this.org)
                    continue;              // ignore our own body
                total++;
                if (cell.state === CellStates.food)
                    food++;
            }
        }
        if (total === 0)
            return 0;
        return food / total;
    }
}

module.exports = GaugeCell;
