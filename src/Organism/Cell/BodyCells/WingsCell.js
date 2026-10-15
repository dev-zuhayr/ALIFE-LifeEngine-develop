const CellStates = require("../CellStates");
const BodyCell = require("./BodyCell");

class WingsCell extends BodyCell{
    constructor(org, loc_col, loc_row){
        super(CellStates.wings, org, loc_col, loc_row);
    }
}

module.exports = WingsCell;