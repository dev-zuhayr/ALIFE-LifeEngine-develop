const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");

// Gauge cell
// Implemented by Zuhayr Khot
//
// The idea: our big animal species kept eating every plant and then starving,
// so I wanted to give organisms a way to "feel" when food is running low and
// hold back from breeding. The gauge looks at the tiles around it and, if
// there isn't much food, it makes having a child cost extra food.
//
// The gauge cell never kills anything and never stops an organism from breeding
// outright, it only makes children more expensive. Gauge cells only show up
// through normal random mutation, and every new gauge rolls its own
// sensitivity (which its descendants inherit), so it's up to natural selection
// whether being cautious actually helps or hurts a lineage.

const GAUGE_RANGE = 5;            // how far it looks: 5 gives an 11x11 square around the cell
const MIN_SENSITIVITY = 0.02;     // lowest "food is scarce" threshold (2% of nearby tiles are food)
const MAX_SENSITIVITY = 0.20;     // highest threshold (20% of nearby tiles are food)
const DEFAULT_SENSITIVITY = 0.08; // threshold for a gauge placed by hand in the editor
const MAX_RESTRAINT = 1.0;        // with zero food around, a child costs 2x the normal food (1 + 1.0)

class GaugeCell extends BodyCell {
    constructor(org, loc_col, loc_row) {
        super(CellStates.gauge, org, loc_col, loc_row);
    }

    // Children copy the parent's gauge exactly. This is also used when a saved world is loaded.
    initInherit(parent) {
        super.initInherit(parent);
        this.sensitivity = parent.sensitivity;
        if (this.sensitivity === undefined)
            this.sensitivity = DEFAULT_SENSITIVITY;
    }

    // A gauge that appears through mutation gets a random sensitivity
    initRandom() {
        this.sensitivity = MIN_SENSITIVITY + Math.random() * (MAX_SENSITIVITY - MIN_SENSITIVITY);
    }

    // A gauge dropped in by hand with the organism editor
    initDefault() {
        this.sensitivity = DEFAULT_SENSITIVITY;
    }

    // Runs once every tick, like the other cells
    performFunction() {
        var org = this.org;

        // An organism can have several gauges, so we reset the shared penalty
        // once per tick (lifetime goes up by 1 each tick) and then let every
        // gauge have a go at raising it.
        if (org.gauge_tick !== org.lifetime) {
            org.gauge_tick = org.lifetime;
            org.gauge_penalty = 0;
        }

        var density = this.measureFoodDensity();

        // 0 when there's enough food (at or above the threshold), 1 when there's none at all
        var scarcity = 1 - (density / this.sensitivity);
        if (scarcity <= 0)
            return; // plenty of food nearby, so no restraint

        // Extra food a child will cost: bigger bodies and emptier surroundings mean a bigger penalty
        var penalty = Math.ceil(org.anatomy.cells.length * MAX_RESTRAINT * scarcity);

        // If there are several gauges, the most worried one wins
        if (penalty > org.gauge_penalty)
            org.gauge_penalty = penalty;
    }

    // Looks at what fraction of the tiles around this cell are food (0 to 1)
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
                    continue;              // don't count our own body
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
