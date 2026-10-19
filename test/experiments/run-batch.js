// Experiment, not a test: runs seed-lineage.js several times in parallel and merges the results
// into one folder, ready for analyze_extinctions.py.
//
//     npm run experiment:batch -- [--worlds 28] [--jobs 7] [--ticks 10000] [--seed 1]
//                                 [--controls controls.json] [--world world.json] [--out dir]
//
//   --worlds    worlds per condition, in total (default 28)
//   --jobs      how many run at once (default: one less than the number of CPU cores)
//   --seed      random seed of the first job; job i uses seed + i, so a batch can be repeated exactly
//               with the same --worlds, --jobs and --seed
//   --out       output folder (default test/experiments/output/batch-<date and time>)
//   --ticks, --controls and --world are passed on to seed-lineage.js
//
//     npm run experiment:batch -- --merge <batch folder>
//
//   merges the finished jobs in <batch folder>/jobs/ again without rerunning them, e.g. if the merge failed
//
// Each job writes to <out>/jobs/job-<i>/. The merged runs.csv, lineages.csv and lineages_tree.csv
// go in <out>/, with run_id renumbered so it's unique across jobs; runs.csv also says which job
// and which of its run_ids each run came from.
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const {spawn} = require('child_process');
const {once} = require('events');

const args = {worlds: 28, jobs: Math.max(1, os.cpus().length - 1), ticks: 10000, seed: 1, controls: null, world: null,
    out: null, merge: null};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in args) || argv[i + 1] === undefined) {
        console.error(`Unknown or incomplete option: ${argv[i]}`);
        process.exit(1);
    }
    args[key] = ['worlds', 'jobs', 'ticks', 'seed'].includes(key) ? Number(argv[i + 1]) : argv[i + 1];
}
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const out = args.merge || args.out || path.join(__dirname, 'output', 'batch-' + stamp);
const jobs = Math.min(args.jobs, args.worlds);

function runJob(i, worlds) {
    const job_out = path.join(out, 'jobs', `job-${i}`);
    const job_args = [path.join(__dirname, 'seed-lineage.js'), '--worlds', worlds, '--ticks', args.ticks,
        '--seed', args.seed + i, '--out', job_out];
    if (args.controls) job_args.push('--controls', args.controls);
    if (args.world) job_args.push('--world', args.world);
    const child = spawn(process.execPath, job_args.map(String), {stdio: ['ignore', 'pipe', 'inherit']});
    readline.createInterface({input: child.stdout}).on('line', line => {
        if (line.startsWith('  world'))
            console.log(`[job ${i}]${line}`);
    });
    return new Promise(resolve => child.on('close', code => resolve({i, code, dir: job_out})));
}

// Copies a job's CSV into the merged one, swapping its run_id (the first column) for the global one.
// Reads the file in chunks rather than with a readline loop: pausing a readline loop for the
// output to drain can crash with ERR_USE_AFTER_CLOSE on big files.
async function appendCSV(ws, file, run_ids, with_header) {
    let first = true;
    let rest = '';
    const convert = line => {
        line = line.replace(/\r$/, '');
        if (first) {
            first = false;
            return with_header ? line + '\n' : '';
        }
        if (!line) return '';
        const comma = line.indexOf(',');
        const run_id = run_ids.get(line.slice(0, comma));
        return run_id === undefined ? '' : run_id + line.slice(comma) + '\n';
    };
    for await (const chunk of fs.createReadStream(file, 'utf8')) {
        const lines = (rest + chunk).split('\n');
        rest = lines.pop(); // the last line may continue in the next chunk
        const text = lines.map(convert).join('');
        if (text && !ws.write(text))
            await once(ws, 'drain');
    }
    if (rest)
        ws.write(convert(rest));
}

// --merge: the jobs of an earlier batch, to merge again without rerunning them
function finishedJobs() {
    const dir = path.join(out, 'jobs');
    if (!fs.existsSync(dir)) {
        console.error(`No jobs folder in ${out}`);
        process.exit(1);
    }
    const results = fs.readdirSync(dir).filter(d => /^job-\d+$/.test(d))
        .map(d => ({i: Number(d.slice(4)), code: 0, dir: path.join(dir, d)}))
        .sort((a, b) => a.i - b.i);
    const unfinished = results.filter(r => !fs.existsSync(path.join(r.dir, 'runs.csv')));
    if (!results.length || unfinished.length) {
        console.error(results.length ? `${unfinished.map(r => 'job-' + r.i).join(', ')} didn't finish (no runs.csv)` : `No jobs in ${dir}`);
        process.exit(1);
    }
    return results.map((r, index) => Object.assign(r, {i: index}));
}

async function main() {
    const t0 = Date.now();
    let results;
    if (args.merge) {
        results = finishedJobs();
        console.log(`Merging the ${results.length} jobs in ${path.join(out, 'jobs')}`);
    }
    else {
        console.log(`${args.worlds} worlds per condition, ${args.ticks} ticks each, in ${jobs} jobs at once`);
        const per_job = [...Array(jobs)].map((_, i) => Math.floor(args.worlds / jobs) + (i < args.worlds % jobs ? 1 : 0));
        results = await Promise.all(per_job.map((n, i) => runJob(i, n)));
        const failed = results.filter(r => r.code !== 0);
        if (failed.length) {
            console.error(`Jobs ${failed.map(r => r.i).join(', ')} failed, so nothing was merged. Job output is in ${path.join(out, 'jobs')}`);
            process.exit(1);
        }
    }

    // runs.csv: number the runs 1, 2, 3, ... across jobs
    const run_ids = [];
    const merged_runs = [];
    let header = null;
    let next = 1;
    for (const r of results) {
        const [head, ...lines] = fs.readFileSync(path.join(r.dir, 'runs.csv'), 'utf8').split('\n').filter(l => l);
        header = header || head;
        const ids = new Map();
        for (const line of lines) {
            const comma = line.indexOf(',');
            const job_run_id = line.slice(0, comma);
            ids.set(job_run_id, next);
            merged_runs.push(`${next}${line.slice(comma)},${r.i},${job_run_id}`);
            next++;
        }
        run_ids.push(ids);
    }
    fs.writeFileSync(path.join(out, 'runs.csv'), [header + ',job,job_run_id'].concat(merged_runs).join('\n') + '\n');

    for (const name of ['lineages.csv', 'lineages_tree.csv']) {
        const ws = fs.createWriteStream(path.join(out, name));
        for (const r of results)
            await appendCSV(ws, path.join(r.dir, name), run_ids[r.i], r.i === 0);
        ws.end();
        await once(ws, 'finish');
    }
    const settings = JSON.parse(fs.readFileSync(path.join(results[0].dir, 'settings.json'), 'utf8'));
    if (!args.merge) // when merging again, keep the original batch's arguments
        settings.args = Object.assign({}, args, {jobs});
    else if (fs.existsSync(path.join(out, 'settings.json')))
        settings.args = JSON.parse(fs.readFileSync(path.join(out, 'settings.json'), 'utf8')).args;
    fs.writeFileSync(path.join(out, 'settings.json'), JSON.stringify(settings, null, 2));

    const rows = merged_runs.map(l => l.split(','));
    const col = header.split(',');
    for (const condition of ['no_seeds', 'seeds']) {
        const rs = rows.filter(r => r[col.indexOf('condition')] === condition);
        const survived = rs.filter(r => r[col.indexOf('outcome')] === 'survived').length;
        console.log(`${condition.padEnd(8)} survived ${survived}/${rs.length}`);
    }
    console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s. Results in ${out}`);
}

main();
