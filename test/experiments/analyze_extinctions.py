"""Labels every animal species extinction in a batch of runs. Analysis only: it reads the lineage
CSVs and changes nothing in the simulation. Not part of npm test.

    .venv/Scripts/python test/experiments/analyze_extinctions.py <folder> [--plots]

<folder> holds lineages.csv and lineages_tree.csv (from run-batch.js, seed-lineage.js, or the
Statistics tab's Download Lineage CSV) and optionally runs.csv, which gives each run its condition.

Species
    The engine makes a new species on every body mutation. Here those are grouped into species that
    differ by at least SPECIES_THRESHOLD cells: walking the lineage tree, each engine species joins
    its parent's species unless its body is SPECIES_THRESHOLD or more cells away from that species'
    founding body, in which case it founds a new species. Plants (producer cells, no movers), animals
    (mover cells) and others (neither) never share a species.

    Bodies are compared by cell counts per type, the only body information the lineage tree has:
    the difference is the larger of the cells gained and the cells lost, so changing a cell's type
    counts as 1. A cell that only moved is invisible to this.

Labels, for each animal species that died out (checked in this order)
    never_established       its population never reached MIN_PEAK in the samples
    mis_adaptation          it was dominant (at least DOMINANT_SHARE of all animals at its peak), the
                            plants then fell to CRASH_FRACTION or less of their level while it rose,
                            and they were eaten: food didn't pile up (see FOOD_PILEUP)
    replaced_by_descendant  a descendant species that reached MIN_PEAK was still alive afterwards,
                            and was growing over the REPLACE_WINDOW ticks before the extinction
    failure_to_adapt        it wasn't dominant (so whatever happened to the plants, it didn't cause
                            it), or it was dominant but the plants stayed at HEALTHY_FRACTION or more
    ambiguous               it was dominant, but the plants fell only part of the way, or they crashed
                            while food piled up

Plant level is plant biomass: the producer cells of all plant species, summed. The level "while it
rose" is the highest plant level between the species first reaching 10% of its peak and its peak,
so the plants' own early boom and die-back, before the species mattered, isn't blamed on it.

Plants can crash without being eaten: with food blocking reproduction, a map covered in food stops
plants reproducing and they die of old age. Then food goes up as the plants go down. A crash only
counts as overgrazing if total food at the plants' low point is at most FOOD_PILEUP times what it
was at the species' peak.

Writes to <folder>/analysis/:
    species.csv      every species, with the engine species (lineage ids) it's made of
    extinctions.csv  one row per animal species extinction, with the label and the numbers behind it
    summary.csv      label counts per condition (also printed)
    plots/           with --plots, one chart per run
"""
import argparse
import sys
from pathlib import Path

import pandas as pd

SPECIES_THRESHOLD = 3
MIN_PEAK = 10            # smallest peak population that counts as an established species
DOMINANT_SHARE = 0.25    # share of all animals at its peak; several species often graze plants down together
CRASH_FRACTION = 0.1     # plants at or below this fraction of their level while it rose = crashed
HEALTHY_FRACTION = 0.5   # plants at or above this fraction = healthy
FOOD_PILEUP = 1.0        # food rising at all while plants crash = smothered, not eaten (grazing makes it fall)
REPLACE_WINDOW = 1000    # ticks before an extinction over which a descendant must have grown

LABELS = ['mis_adaptation', 'replaced_by_descendant', 'failure_to_adapt', 'ambiguous', 'never_established']


def body_kind(counts):
    if counts['mover'] > 0:
        return 'animal'
    if counts['producer'] > 0:
        return 'plant'
    return 'other'


def body_difference(a, b, cell_types):
    gained = sum(max(0, a[c] - b[c]) for c in cell_types)
    lost = sum(max(0, b[c] - a[c]) for c in cell_types)
    return max(gained, lost)


def group_species(tree, cell_types):
    """Returns (species list, lineage_id -> species index) for one run's lineage tree."""
    species = []
    species_of = {}
    for row in tree.sort_values('lineage_id').itertuples(index=False):
        counts = {c: getattr(row, c) for c in cell_types}
        kind = body_kind(counts)
        parent = species_of.get(row.parent_lineage_id)
        if (parent is not None and species[parent]['kind'] == kind
                and body_difference(counts, species[parent]['founding_body'], cell_types) < SPECIES_THRESHOLD):
            s = parent
        else:
            s = len(species)
            species.append({'species_id': s, 'kind': kind, 'founding_lineage': row.lineage_id,
                            'parent_species': -1 if parent is None else parent,
                            'founding_body': counts, 'lineages': [], 'start_tick': row.start_tick,
                            'ends': []})
        species_of[row.lineage_id] = s
        species[s]['lineages'].append(row.lineage_id)
        species[s]['start_tick'] = min(species[s]['start_tick'], row.start_tick)
        species[s]['ends'].append(row.end_tick)
    for sp in species:
        # alive at the end of the run if any of its engine species still is
        sp['end_tick'] = -1 if -1 in sp['ends'] else max(sp['ends'])
    return species, species_of


def time_series(samples, species, species_of):
    """Population per species, plant biomass, total animals and total food at every sampled tick."""
    food = samples.groupby('tick')['total_food'].first()  # a world column, the same on every row of a tick
    samples = samples[samples['lineage_id'] != -1].copy()
    ticks = sorted(samples['tick'].unique())
    samples['species'] = samples['lineage_id'].map(species_of)
    samples = samples.dropna(subset=['species'])
    samples['species'] = samples['species'].astype(int)
    pop = samples.pivot_table(index='tick', columns='species', values='population', aggfunc='sum')
    pop = pop.reindex(ticks, fill_value=0).fillna(0)
    kinds = {sp['species_id']: sp['kind'] for sp in species}
    samples['kind'] = samples['species'].map(kinds)
    plants = samples[samples['kind'] == 'plant'].groupby('tick')['producer'].sum().reindex(ticks, fill_value=0)
    animal_cols = [s for s in pop.columns if kinds[s] == 'animal']
    animals = pop[animal_cols].sum(axis=1) if animal_cols else pd.Series(0, index=pop.index)
    return pop, plants, animals, food.reindex(ticks).ffill().fillna(0)


def descendants_of(s, species):
    children = {}
    for sp in species:
        children.setdefault(sp['parent_species'], []).append(sp['species_id'])
    found, todo = [], list(children.get(s, []))
    while todo:
        d = todo.pop()
        found.append(d)
        todo.extend(children.get(d, []))
    return found


def classify(sp, species, pop, plants, animals, food):
    s, end = sp['species_id'], sp['end_tick']
    series = pop[s][pop.index <= end] if s in pop.columns else pd.Series(dtype=float)
    row = {'species_id': s, 'founding_lineage': sp['founding_lineage'], 'start_tick': sp['start_tick'],
           'extinct_tick': end, 'engine_species': len(sp['lineages'])}
    peak = series.max() if len(series) else 0
    row['peak_pop'] = int(peak)
    if peak < MIN_PEAK:
        row['label'] = 'never_established'
        return row
    t_peak = series.idxmax()
    row['peak_tick'] = int(t_peak)
    row['peak_share'] = round(peak / animals[t_peak], 3) if animals[t_peak] else 0
    rise_start = series[series >= 0.1 * peak].index[0]
    plants_before = plants[(plants.index >= rise_start) & (plants.index <= t_peak)].max()
    after = plants[(plants.index > t_peak) & (plants.index <= end)]
    t_low = after.idxmin() if len(after) else t_peak
    plants_low = plants[t_low]
    row['plants_while_rising'] = int(plants_before)
    row['plants_low_after_peak'] = int(plants_low)
    row['plants_low_tick'] = int(t_low)
    ratio = plants_low / plants_before if plants_before else 0
    row['plant_ratio'] = round(ratio, 3)
    row['food_at_peak'] = int(food[t_peak])
    row['food_at_plants_low'] = int(food[t_low])
    smothered = food[t_low] > FOOD_PILEUP * max(food[t_peak], 1)

    # established descendants still alive after the extinction, and growing just before it
    growing = []
    for d in descendants_of(s, species):
        dsp = species[d]
        if dsp['kind'] != 'animal' or d not in pop.columns or pop[d].max() < MIN_PEAK:
            continue
        if dsp['end_tick'] != -1 and dsp['end_tick'] <= end:
            continue
        window = pop[d][(pop.index >= end - REPLACE_WINDOW) & (pop.index <= end)]
        if len(window) and window.iloc[-1] > window.iloc[0]:
            growing.append(d)
    row['growing_descendants'] = ' '.join(map(str, growing))

    dominant = row['peak_share'] >= DOMINANT_SHARE
    if dominant and ratio <= CRASH_FRACTION and not smothered:
        row['label'] = 'mis_adaptation'
    elif growing:
        row['label'] = 'replaced_by_descendant'
    elif not dominant or ratio >= HEALTHY_FRACTION:
        row['label'] = 'failure_to_adapt'
    else:
        row['label'] = 'ambiguous'
    return row


def plot_run(run_id, condition, species, pop, plants, extinctions, path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    colors = {'mis_adaptation': '#d62728', 'replaced_by_descendant': '#2ca02c',
              'failure_to_adapt': '#1f77b4', 'ambiguous': '#7f7f7f'}
    fig, (top, bottom) = plt.subplots(2, 1, figsize=(11, 7), sharex=True, height_ratios=[2, 1])
    animal_cols = [s for s in pop.columns if species[s]['kind'] == 'animal']
    for s in sorted(animal_cols, key=lambda c: pop[c].max(), reverse=True)[:8]:
        top.plot(pop.index, pop[s], label=f'species {s}')
    for e in extinctions:
        if e['label'] in colors:
            top.axvline(e['extinct_tick'], color=colors[e['label']], alpha=0.6, linestyle='--')
    top.set_ylabel('animal population')
    top.set_title(f'Run {run_id} ({condition}): the 8 largest animal species; dashed lines are extinctions')
    top.legend(fontsize=7, loc='upper right')
    handles = [plt.Line2D([], [], color=c, linestyle='--', label=l) for l, c in colors.items()]
    top.add_artist(top.legend(handles=handles, fontsize=7, loc='upper left'))
    bottom.plot(plants.index, plants, color='#2ca02c')
    bottom.set_ylabel('plant biomass\n(producer cells)')
    bottom.set_xlabel('tick')
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('folder', type=Path)
    parser.add_argument('--plots', action='store_true', help='draw one chart per run')
    args = parser.parse_args()
    folder = args.folder
    for name in ['lineages.csv', 'lineages_tree.csv']:
        if not (folder / name).exists():
            sys.exit(f'{folder / name} not found')

    tree = pd.read_csv(folder / 'lineages_tree.csv')
    samples = pd.read_csv(folder / 'lineages.csv')
    cell_types = list(tree.columns[tree.columns.get_loc('end_tick') + 1:tree.columns.get_loc('revivals')])
    conditions = {}
    if (folder / 'runs.csv').exists():
        runs = pd.read_csv(folder / 'runs.csv')
        conditions = dict(zip(runs['run_id'], runs['condition']))

    # where a run has both a sample and an 'end' row at the same tick, keep the 'end' one (it's later)
    end_ticks = samples[samples['event'] == 'end'][['run_id', 'tick']].drop_duplicates()
    samples = samples.merge(end_ticks.assign(has_end=True), on=['run_id', 'tick'], how='left')
    samples = samples[(samples['event'] == 'end') | samples['has_end'].isna()].drop(columns='has_end')

    out = folder / 'analysis'
    out.mkdir(exist_ok=True)
    if args.plots:
        (out / 'plots').mkdir(exist_ok=True)
    species_rows, extinction_rows = [], []
    for run_id, run_tree in tree.groupby('run_id'):
        condition = conditions.get(run_id, 'all')
        species, species_of = group_species(run_tree, cell_types)
        run_samples = samples[samples['run_id'] == run_id]
        if run_samples.empty:
            continue
        pop, plants, animals, food = time_series(run_samples, species, species_of)
        run_extinctions = []
        for sp in species:
            species_rows.append({'run_id': run_id, 'condition': condition, 'species_id': sp['species_id'],
                                 'kind': sp['kind'], 'parent_species': sp['parent_species'],
                                 'founding_lineage': sp['founding_lineage'], 'start_tick': sp['start_tick'],
                                 'end_tick': sp['end_tick'],
                                 'peak_pop': int(pop[sp['species_id']].max()) if sp['species_id'] in pop.columns else 0,
                                 'lineage_ids': ' '.join(map(str, sp['lineages']))})
            if sp['kind'] == 'animal' and sp['end_tick'] != -1:
                row = classify(sp, species, pop, plants, animals, food)
                run_extinctions.append(row)
                extinction_rows.append({'run_id': run_id, 'condition': condition, **row})
        if args.plots:
            plot_run(run_id, condition, species, pop, plants, run_extinctions, out / 'plots' / f'run_{run_id}.png')

    pd.DataFrame(species_rows).to_csv(out / 'species.csv', index=False)
    extinctions = pd.DataFrame(extinction_rows)
    extinctions.to_csv(out / 'extinctions.csv', index=False)
    if extinctions.empty:
        print('No animal species died out in these runs.')
        return
    summary = (extinctions.groupby(['condition', 'label']).size().unstack(fill_value=0)
               .reindex(columns=LABELS, fill_value=0))
    summary.insert(0, 'runs', [len({r for r, c in conditions.items() if c == cond}) or tree['run_id'].nunique()
                               for cond in summary.index])
    summary.to_csv(out / 'summary.csv')
    print(f'Animal species extinctions by label ({SPECIES_THRESHOLD}+ cells apart = a different species):')
    print(summary.to_string())
    print(f'\nResults in {out}')


if __name__ == '__main__':
    main()
