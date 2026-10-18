const Neighbors = require("./Grid/Neighbors");

const Hyperparams = {
    setDefaults: function() {
        this.lifespanMultiplier = 100;
        this.foodProdProb = 5;
        this.killableNeighbors = Neighbors.adjacent;
        this.edibleNeighbors = Neighbors.adjacent;
        this.growableNeighbors = Neighbors.adjacent;

        this.useGlobalMutability = false;
        this.globalMutability = 5;
        this.addProb = 25;
        this.changeProb = 25;
        this.removeProb = 25;
        this.brainMutationChance = 25;
        this.mutationSymmetryChance = 10;
        
        this.rotationEnabled = true;

        this.foodBlocksReproduction = true;
        this.moversCanProduce = false;

        this.instaKill = false;
        this.dontKillSameSpecies = false;

        this.wingsCanMutate = true;
        this.islandsEnabled = true; // water and islands are generated when a world starts or resets

        this.lookRange = 30;
        this.seeThroughSelf = false;
        this.evolveIndependentEyeDecisions = true;

        this.foodDropProb = 0;

        this.extraMoverFoodCost = 0;

        this.maxOrganisms = -1;

        // Storms (by Zuhayr Khot, the logic lives in Environments/StormSystem.js)
        this.stormsEnabled = true;
        this.stormChance = 0.02;   // % chance each tick that a storm hits (before any season modifier is applied)
        this.stormRadius = 8;      // how big the storm patch is, in grid cells

        // Plant seeds (the logic lives in Environments/SeedBank.js)
        this.seedsEnabled = true;
        this.seedChance = 10;        // % chance that a dying plant leaves a seed
        this.seedDelayMin = 200;     // fewest ticks before a seed tries to sprout
        this.seedDelayMax = 2000;    // most ticks before a seed tries to sprout
        this.seedMaxDormancy = 5000; // a seed that hasn't sprouted this many ticks after being dropped rots
        this.seedScatterRadius = 3;  // seeds land on a random tile up to this many cells from the plant's center (0 = on it)
    },

    loadJsonObj(obj) {
        for (let key in obj) {
            this[key] = obj[key];
        }
    }
}

Hyperparams.setDefaults();

module.exports = Hyperparams;