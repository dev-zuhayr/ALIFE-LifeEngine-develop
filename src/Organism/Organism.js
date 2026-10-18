const CellStates = require("./Cell/CellStates");
const Neighbors = require("../Grid/Neighbors");
const Hyperparams = require("../Hyperparameters");
const Directions = require("./Directions");
const Anatomy = require("./Anatomy");
const Brain = require("./Perception/Brain");
const FossilRecord = require("../Stats/FossilRecord");
const SerializeHelper = require("../Utils/SerializeHelper");
const LineageTracker = require("../Stats/LineageTracker")
class Organism {
    constructor(col, row, env, parent=null) {
        this.id = Organism.next_id++;
        this.parent_id = -1;
        this.generation = 0;
        this.c = col;
        this.r = row;
        this.env = env;
        this.lifetime = 0;
        this.food_collected = 0;
        this.living = true;
        this.anatomy = new Anatomy(this)
        this.direction = Directions.down; // direction of movement
        this.rotation = Directions.up; // direction of rotation
        this.move_count = 0;
        this.move_range = 4;
        this.ignore_brain_for = 0;
        this.mutability = 5;
        this.damage = 0;
        this.gauge_penalty = 0;
        this.gauge_tick = -1;
        this.brain = new Brain(this);
        if (parent != null) {
            this.inherit(parent);
        }
    }

    //*************************************** */Water Addition
    hasProducerCell() {
        return this.anatomy.cells.some(c => c.state == CellStates.producer);
    }

    // animal body = has a mover cell and no producer cell (checked on real cells, not flags)
    isAnimalBody() {
        return this.anatomy.cells.some(c => c.state == CellStates.mover) && !this.hasProducerCell();
    }

    canFly() {
        if (!this.isAnimalBody()) return false;   // wings only matter for animals
        for (const c of this.anatomy.cells)
            if (c.state == CellStates.wings) return true;
        return false;
    }

    randomMutationState() {
        let state = CellStates.getRandomLivingType();
        // wings only for animals (must move, must not be a producer), and only if the wings control is on
        const can_have_wings = Hyperparams.wingsCanMutate && this.isAnimalBody();
        while (state == CellStates.wings && !can_have_wings)
            state = CellStates.getRandomLivingType();
        return state;
    }

    stripUselessWings() {
        if (this.isAnimalBody()) return false;
        let stripped = false;
        for (const cell of [...this.anatomy.cells]) {
            if (cell.state != CellStates.wings) continue;
            if (cell.loc_col == 0 && cell.loc_row == 0) {
                // the centre cell can't be removed, so turn it back into a mouth
                this.anatomy.replaceCell(CellStates.mouth, 0, 0, false);
                stripped = true;
            }
            else
                stripped = this.anatomy.removeCell(cell.loc_col, cell.loc_row) || stripped;
        }
        return stripped;
    }

    inherit(parent) {
        this.parent_id = parent.id;
        this.generation = parent.generation + 1;
        this.move_range = parent.move_range;
        this.mutability = parent.mutability;
        this.species = parent.species;
        for (var c of parent.anatomy.cells){
            //deep copy parent cells
            this.anatomy.addInheritCell(c);
        }
        this.brain.copy(parent.brain);
    }

    // amount of food required before it can reproduce
    foodNeeded() {
        var base = this.anatomy.is_mover ? this.anatomy.cells.length + Hyperparams.extraMoverFoodCost : this.anatomy.cells.length;
        return base + this.gauge_penalty;
    }

    lifespan() {
        return this.anatomy.cells.length * Hyperparams.lifespanMultiplier;
    }

    maxHealth() {
        return this.anatomy.cells.length;
    }

    reproduce() {
        //produce mutated child
        //check nearby locations (is there room and a direct path)
        var org = new Organism(0, 0, this.env, this);
        if(Hyperparams.rotationEnabled){
            org.rotation = Directions.getRandomDirection();
        }
        var prob = this.mutability;
        if (Hyperparams.useGlobalMutability){
            prob = Hyperparams.globalMutability;
        }
        else {
            //mutate the mutability
            if (Math.random() <= 0.5)
                org.mutability++;
            else{ 
                org.mutability--;
                if (org.mutability < 1)
                    org.mutability = 1;
            }
        } 
        var mutated = false;
        if (this.calcRandomChance(prob)) {
            mutated = org.mutate();
        }

        var direction = Directions.getRandomScalar();
        var direction_c = direction[0];
        var direction_r = direction[1];
        var offset = (Math.floor(Math.random() * 3));
        var basemovement = this.anatomy.birth_distance;
        var new_c = this.c + (direction_c*basemovement) + (direction_c*offset);
        var new_r = this.r + (direction_r*basemovement) + (direction_r*offset);

        if (org.isClear(new_c, new_r, org.rotation, true) && 
            org.isStraightPath(new_c, new_r, this.c, this.r, this) && 
            this.env.canAddOrganism())
        {
            org.c = new_c;
            org.r = new_r;
            this.env.addOrganism(org);
            org.updateGrid();
            if (mutated) {
                FossilRecord.addSpecies(org, this.species);
            }
            else {
                org.species.addPop();
            }
        }
        Math.max(this.food_collected -= this.foodNeeded(), 0);
    }

    mutate() {
        let added = false;
        let changed = false;
        let removed = false;
        if (this.calcRandomChance(Hyperparams.addProb)) {
            let branch = this.anatomy.getRandomCell();
            let state = this.randomMutationState(); // branch.state;
            let growth_direction = Neighbors.all[Math.floor(Math.random() * Neighbors.all.length)];
            let c = branch.loc_col + growth_direction[0];
            let r = branch.loc_row + growth_direction[1];
            if (this.anatomy.canAddCellAt(c, r)) {
                added = true;
                this.anatomy.addRandomizedCell(state, c, r);

                // attempt symmetrical mutations across horizontal, vertical, and both diagonal axes
                const axes = ['h', 'v', 'd'];
                for (let axis of axes) {
                    if (this.calcRandomChance(Hyperparams.mutationSymmetryChance)) {
                        let mc = c;
                        let mr = r;
                        switch (axis) {
                            case 'h': // horizontal symmetry (mirror over x-axis)
                                mr = -r;
                                if (r === 0) {
                                    mr = c;
                                    mc = -r;
                                }
                                break;
                            case 'v': // vertical symmetry (mirror over y-axis)
                                mc = -c;
                                if (c === 0) {
                                    mr = -c;
                                    mc = r;
                                }
                                break;
                            case 'd': // diagonal symmetry (mirror over both axes)
                                mc = -c;
                                mr = -r;
                                break;
                        }
                        if (this.anatomy.canAddCellAt(mc, mr)) {
                            this.anatomy.addRandomizedCell(state, mc, mr);
                        }
                    }
                }
            }
        }
        if (this.calcRandomChance(Hyperparams.changeProb)){
            let cell = this.anatomy.getRandomCell();
            let state = this.randomMutationState();
            this.anatomy.replaceCell(state, cell.loc_col, cell.loc_row);
            changed = true;
        }
        if (this.calcRandomChance(Hyperparams.removeProb)){
            if(this.anatomy.cells.length > 1) {
                let cell = this.anatomy.getRandomCell();
                removed = this.anatomy.removeCell(cell.loc_col, cell.loc_row);
            }
        }
        if (this.anatomy.is_mover && this.calcRandomChance(Hyperparams.brainMutationChance)) { 
            if (this.anatomy.has_eyes) {
                this.brain.mutate();
            }
            this.move_range += Math.floor(Math.random() * 4) - 2;
            if (this.move_range <= 0){
                this.move_range = 1;
            };
        }
        
        // return true if a new species is created, which is only true for anatomy changes, not brain changes
        const stripped = this.stripUselessWings();
        return added || changed || removed || stripped;
    }

    calcRandomChance(prob) {
        return (Math.random() * 100) < prob;
    }

    attemptMove() {
        var direction = Directions.scalars[this.direction];
        var direction_c = direction[0];
        var direction_r = direction[1];
        var new_c = this.c + direction_c;
        var new_r = this.r + direction_r;
        if (this.isClear(new_c, new_r)) {
            for (var cell of this.anatomy.cells) {
                var real_c = this.c + cell.rotatedCol(this.rotation);
                var real_r = this.r + cell.rotatedRow(this.rotation);
                this.env.changeCell(real_c, real_r, CellStates.empty, null);
            }
            this.c = new_c;
            this.r = new_r;
            this.updateGrid();
            return true;
        }
        return false;
    }

    attemptRotate(rotation=null) {
        if(!Hyperparams.rotationEnabled){
            this.direction = Directions.getRandomDirection();
            this.move_count = 0;
            return true;
        }
        if(rotation == null){
            rotation = Directions.getRandomDirection();
        }
        if(this.isClear(this.c, this.r, rotation)){
            for (var cell of this.anatomy.cells) {
                var real_c = this.c + cell.rotatedCol(this.rotation);
                var real_r = this.r + cell.rotatedRow(this.rotation);
                this.env.changeCell(real_c, real_r, CellStates.empty, null);
            }
            this.rotation = rotation;
            this.direction = Directions.getRandomDirection();
            this.updateGrid();
            this.move_count = 0;
            return true;
        }
        return false;
    }

    changeDirection(dir) {
        this.direction = dir;
        this.move_count = 0;
    }

    // assumes either c1==c2 or r1==r2, returns true if there is a clear path from point 1 to 2
    isStraightPath(c1, r1, c2, r2, parent){
        if (c1 == c2) {
            if (r1 > r2){
                var temp = r2;
                r2 = r1;
                r1 = temp;
            }
            for (var i=r1; i!=r2; i++) {
                var cell = this.env.grid_map.cellAt(c1, i)
                if (!this.isPassableCell(cell, parent)){
                    return false;
                }
            }
            return true;
        }
        else {
            if (c1 > c2){
                var temp = c2;
                c2 = c1;
                c1 = temp;
            }
            for (var i=c1; i!=c2; i++) {
                var cell = this.env.grid_map.cellAt(i, r1);
                if (!this.isPassableCell(cell, parent)){
                    return false;
                }
            }
            return true;
        }
    }

    //*************************************** */Water Addition
    isPassableCell(cell, parent){
        if (cell == null) return false;
        if (cell.is_water && !this.canFly()) return false;   // NEW
        return cell.state == CellStates.water || cell.state == CellStates.empty ||
            cell.owner == this || cell.owner == parent || cell.state == CellStates.food;
    }

    //*************************************** */Water Addition
    isClear(col, row, rotation=this.rotation) {
        const flies = this.canFly();
        for(var loccell of this.anatomy.cells) {
            var cell = this.getRealCell(loccell, col, row, rotation);
            if (cell==null) {
                return false;
            }
            if (cell.is_water && !flies) {          // NEW: walkers never enter water tiles
                return false;
            }
            if (cell.owner==this || cell.state==CellStates.empty ||
                (flies && cell.state==CellStates.water) ||   // NEW: fliers may enter open water
                (!Hyperparams.foodBlocksReproduction && cell.state==CellStates.food)){
                continue;
            }
            return false;
        }
        return true;
    }

    harm() {
        this.damage++;
        if (this.damage >= this.maxHealth() || Hyperparams.instaKill) {
            this.die();
        }
    }

    // leave_seed: false for deaths that shouldn't leave a seed behind (see SeedBank.js)
    die(leave_seed=true) {
        if (leave_seed && this.living && this.env.seeds)
            this.env.seeds.tryLeaveSeed(this);
        for (var cell of this.anatomy.cells) {
            var real_c = this.c + cell.rotatedCol(this.rotation);
            var real_r = this.r + cell.rotatedRow(this.rotation);
            this.env.changeCell(real_c, real_r, CellStates.food, null, 'corpse');
        }
        this.species.decreasePop();
        this.living = false;
    }

    updateGrid() {
        for (var cell of this.anatomy.cells) {
            var real_c = this.c + cell.rotatedCol(this.rotation);
            var real_r = this.r + cell.rotatedRow(this.rotation);
            this.env.changeCell(real_c, real_r, cell.state, cell);
        }
    }

    update() {
        this.lifetime++;
        if (this.lifetime > this.lifespan()) {
            this.die();
            return this.living;
        }
        if (this.food_collected >= this.foodNeeded()) {
            this.reproduce();
        }
        for (var cell of this.anatomy.cells) {
            cell.performFunction();
            if (!this.living)
                return this.living
        }
        
        if (this.anatomy.is_mover) {
            const Decision = Brain.Decision;
            let brain_decision = Decision.neutral;
            let brain_direction = 0;
            if (this.anatomy.has_eyes) {
                let {decision, move_direction} = this.brain.decide();
                brain_decision = decision;
                brain_direction = move_direction;
            }
            let dontmove = false;
            switch (brain_decision) {
                case Decision.neutral:
                    // move move_range times, then randomly rotate/change direction
                    if (this.move_count > this.move_range) {
                        this.attemptRotate();
                        this.changeDirection(Directions.getRandomDirection());
                        this.move_count = 0;
                    }
                    break;
                case Decision.chase:
                    this.changeDirection(brain_direction);
                    break;
                case Decision.retreat:
                    this.changeDirection(Directions.getOppositeDirection(brain_direction));
                    break;
                case Decision.move_left:
                    this.changeDirection(Directions.getLeftDirection(brain_direction));
                    break;
                case Decision.move_right:
                    this.changeDirection(Directions.getRightDirection(brain_direction));
                    break;
                case Decision.turn_left:
                    // rotate left based on current rotation, brain direction irrelavent
                    this.attemptRotate(Directions.getLeftDirection(this.rotation));
                    dontmove = true;
                    break;
                case Decision.turn_right:
                    this.attemptRotate(Directions.getRightDirection(this.rotation));
                    dontmove = true;
                    break;
                case Decision.stop:
                    dontmove = true;
                    break;
            }
            if (!dontmove) {
                let moved = this.attemptMove();
                if (!moved) {
                    // if stuck, try to rotate or change direction
                    let rotated = this.attemptRotate();
                    if (!rotated) {
                        this.changeDirection(Directions.getRandomDirection());
                    }
                }
                else {
                    this.move_count++;
                }
            }
        }
        return this.living;
    }

    getRealCell(local_cell, c=this.c, r=this.r, rotation=this.rotation){
        var real_c = c + local_cell.rotatedCol(rotation);
        var real_r = r + local_cell.rotatedRow(rotation);
        return this.env.grid_map.cellAt(real_c, real_r);
    }

    isNatural() {
        let found_center = false;
        if (this.anatomy.cells.length === 0) {
            return false;
        }
        for (let i=0; i<this.anatomy.cells.length; i++) {
            let cell = this.anatomy.cells[i];
            for (let j=i+1; j<this.anatomy.cells.length; j++) {
                let toCompare = this.anatomy.cells[j];
                if (cell.loc_col === toCompare.loc_col && cell.loc_row === toCompare.loc_row) {
                    return false;
                }
            }
            if (cell.loc_col === 0 && cell.loc_row === 0) {
                found_center = true;
            }
        }
        return found_center;
    }

    serialize() {
        let org = SerializeHelper.copyNonObjects(this);
        org.anatomy = this.anatomy.serialize();
        if (this.anatomy.is_mover && this.anatomy.has_eyes)
            org.brain = this.brain.serialize();
        org.species_name = this.species.name;
        return org;
    }

    loadRaw(org) {
        SerializeHelper.overwriteNonObjects(org, this);
        this.anatomy.loadRaw(org.anatomy)
        if (org.brain)
            this.brain.copy(org.brain)
    }

}

Organism.next_id = 0;

module.exports = Organism;
