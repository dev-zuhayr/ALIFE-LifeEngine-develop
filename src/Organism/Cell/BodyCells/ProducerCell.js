const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");
const Hyperparams = require("../../../Hyperparameters");

class ProducerCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.producer, org, loc_col, loc_row);
        this.org.anatomy.is_producer = true;
    }

    performFunction() {
        if (this.org.anatomy.is_mover && !Hyperparams.moversCanProduce)
            return;
        var env = this.org.env;
        // Seasons scale how productive plants are, rather than raining extra food
        // from nowhere. The organism editor has no season state, hence the fallback.
        var prob = Hyperparams.foodProdProb * (env.season_multiplier || 1);
        var real_c = this.getRealCol();
        var real_r = this.getRealRow();
        if (Math.random() * 100 <= prob) {
            var loc = Hyperparams.growableNeighbors[Math.floor(Math.random() * Hyperparams.growableNeighbors.length)]
            var loc_c=loc[0];
            var loc_r=loc[1];
            var cell = env.grid_map.cellAt(real_c+loc_c, real_r+loc_r);
            if (cell != null && cell.state == CellStates.empty){
                env.changeCell(real_c+loc_c, real_r+loc_r, CellStates.food, null, 'plant');
                env.plant_food_produced++;
                return;
            }
        }
    }
}

module.exports = ProducerCell;
