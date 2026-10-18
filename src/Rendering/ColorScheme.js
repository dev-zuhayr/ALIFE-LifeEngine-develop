const CellStates = require("../Organism/Cell/CellStates");

const color_schemes = {
    "neon":{
        "empty":"#0E1318",
        "food":"#2F7AB7",
        "wall":"white",
        "mouth":"#DEB14D",
        "producer":"#15DE59",
        "mover":"#60D4FF",
        "killer":"#F82380",
        "armor":"#7230DB",
        "eye":"#B6C1EA",
        "gauge":"#FFD700",
        "gauge-dot":"black",
        "eye-slit": "#0E1318",
        "wings":"#FF7A33",
        "water":"#0A2A4A"
    },
    "classic":{
        "empty":"#121D29",
        "food":"green",
        "wall":"gray",
        "mouth":"orange",
        "producer":"pink",
        "mover":"blue",
        "killer":"red",
        "armor":"purple",
        "eye":"yellow",
        "gauge":"gold",
        "gauge-dot":"black",
        "eye-slit": "#121D29",
        "wings":"cyan",
        "water":"#0B3D6B"
    },
    "soft":{
        "empty":"#0B0E11",
        "food":"#4F86B2",
        "wall":"#5F6F78",
        "mouth":"#B89A6A",
        "producer":"#4EA17B",
        "mover":"#6BA2C4",
        "killer":"#B06B85",
        "armor":"#7C69B5",
        "eye":"#AEB4C2",
        "gauge":"#E8BE2E",
        "gauge-dot":"black",
        "eye-slit": "#0B0E11",
        "wings":"#D9824B",
        "water":"#14283A"
    },
    "dark":{
        "empty":"black",
        "food":"#225986",
        "wall":"#56616E",
        "mouth":"#AD8A45",
        "producer":"#198D4F",
        "mover":"#278BB0",
        "killer":"#992E5E",
        "armor":"#5632B5",
        "eye":"#8892B3",
        "gauge":"#C9A21A",
        "gauge-dot":"black",
        "eye-slit": "black",
        "wings":"#B8622E",
        "water":"#0A1A2E"
    },
    "grayscale":{
        "empty":"black",
        "food":"#777777",
        "wall":"#EEEEEE",
        "mouth":"#FFFFFF",
        "producer":"#CCCCCC",
        "mover":"#BBBBBB",
        "killer":"#AAAAAA",
        "armor":"#999999",
        "eye":"#888888",
        "gauge":"#666666",
        "gauge-dot":"black",
        "eye-slit": "black",
        "wings":"#555555",
        "water":"#222222"
    }
}
const color_scheme_names = Object.keys(color_schemes);

// Renderer controls access to a canvas. There is one renderer for each canvas
class ColorSchemeSingleton {
    constructor() {
        this.world_env = null;
        this.editor_env = null;
    }
    setEnvironment(world_env, editor_env) {
        this.world_env = world_env;
        this.editor_env = editor_env;
    }
    loadColorScheme(scheme_name='neon') {
        const color_scheme = color_schemes[scheme_name];
        for (var state of CellStates.all) {
            state.color = color_scheme[state.name];
        }
        CellStates.eye.slit_color=color_scheme['eye-slit']
        CellStates.gauge.dot_color=color_scheme['gauge-dot']
        for (var cell_type in color_scheme) {
            $('#'+cell_type+'.cell-type ').css('background-color', color_scheme[cell_type]);
            $('#'+cell_type+'.cell-legend-type').css('background-color', color_scheme[cell_type]);
            
        }
        this.world_env.renderer.renderFullGrid(this.world_env.grid_map.grid);
        this.editor_env.renderer.renderFullGrid(this.editor_env.grid_map.grid);
    }
}

const ColorScheme = new ColorSchemeSingleton();
module.exports = {
    ColorScheme,
    color_scheme_names
}