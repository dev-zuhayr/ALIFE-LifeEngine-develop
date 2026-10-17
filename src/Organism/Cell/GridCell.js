// A cell exists in a grid map.
class Cell{
    constructor(state, col, row, x, y){
        this.owner = null; // owner organism
        this.cell_owner = null; // specific body cell of the owner organism that occupies this grid cell
        this.setType(state);
        this.col = col;
        this.row = row;
        this.x = x;
        this.y = y;
    }

    // food_source records where food came from: 'plant' (producer cells), 'corpse' (dead organisms), or 'other' (random drops, painted, loaded)
    setType(state, food_source='other') {
        this.state = state;
        this.food_source = state.name === 'food' ? food_source : null;
    }
}

module.exports = Cell;
