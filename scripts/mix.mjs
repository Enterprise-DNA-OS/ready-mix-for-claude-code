#!/usr/bin/env node
// The one CLI for Ready-Mix for Claude Code. Human tables by default, --json for machines.
//   npm run mix -- help
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { table } from './lib/format.mjs';
import { parseCsv, pick, yesNo } from './lib/csv.mjs';

// Every read the dispatch office, the plant and the lab ask for, by name.
export const reads = {
  plants: 'select code,name,country,audit_ref,test_every_m3 from plants order by code',
  mixes: 'select code,description,grade_mpa,slump_mm,max_aggregate_mm,admixtures,price_per_m3,active from mixes order by code',
  customers: 'select code,name,email,phone,credit_hold from customers order by code',
  sites: 'select s.code,s.name,c.name customer,s.address from sites s join customers c on c.id=s.customer_id order by s.code',
  trucks: 'select code,rego,capacity_m3,active from trucks order by code',
  orders: 'select code,pour_date,status,customer,site,mix,ordered_m3,sent_m3,to_send_m3,loads from v_order_progress order by pour_date desc,code',
  'pour-schedule': 'select code,pour_date,start_time,status,customer,site,element,mix,plant,pump,ordered_m3,to_send_m3,loads_left,credit_hold from v_pour_schedule order by pour_date,start_time,code',
  tomorrow: 'select code,start_time,status,customer,site,element,mix,plant,pump,to_send_m3,loads_left,credit_hold from v_pour_schedule where pour_date=current_date+1 order by start_time,code',
  'order-progress': "select code,pour_date,status,customer,mix,ordered_m3,sent_m3,returned_m3,placed_m3,to_send_m3,loads from v_order_progress where status<>'cancelled' order by pour_date desc,code",
  dockets: 'select docket_no,day,order_code,customer,truck,mix,volume_m3,batched,arrived,discharged,batch_to_discharge_min,signed_by,returned_m3,invoice_ref from v_dockets order by day desc,docket_no',
  'docket-check': "select rule,record,issue from v_compliance where rule in ('DOCKET-INCOMPLETE','DISCHARGE-TIME','WATER-ADDED') order by rule,record",
  'test-frequency': 'select plant,test_every_m3,produced_m3,samples_needed,samples_taken,samples_short from v_test_frequency order by plant',
  samples: 'select sample,docket_no,customer,mix,grade_mpa,sampled_on,slump_mm,mpa_7,due_28,mpa_28 from v_samples order by sampled_on desc,sample',
  'results-due': "select sample,mix,customer,sampled_on,case when mpa_7 is null and due_7<=current_date then '7 day' else '28 day' end result,case when mpa_7 is null and due_7<=current_date then due_7 else due_28 end due,current_date-(case when mpa_7 is null and due_7<=current_date then due_7 else due_28 end) days_late,lab_ref from v_samples where mpa_28 is null and (due_28<=current_date or (mpa_7 is null and due_7<=current_date)) order by due,sample",
  'low-strength': 'select sample,docket_no,customer,site,mix,grade_mpa,mpa_7,mpa_28,round(mpa_28-grade_mpa,1) margin from v_samples where mpa_28 is not null and mpa_28<grade_mpa+3 order by margin,sample',
  'mix-performance': 'select mix,grade_mpa,count(mpa_28) results_28,round(avg(mpa_28),1) mean_28,min(mpa_28) lowest_28,round(avg(mpa_28)-grade_mpa,1) mean_margin from v_samples group by mix,grade_mpa order by mix',
  returned: 'select customer,mix,count(*) loads_with_return,sum(returned_m3) returned_m3,sum(volume_m3) sent_m3,round(100*sum(returned_m3)/sum(volume_m3),1) pct from v_dockets where returned_m3>0 group by customer,mix order by returned_m3 desc',
  'truck-day': 'select truck,count(*) loads,sum(volume_m3) m3,min(batched) first_batch,max(discharged) last_discharge,round(avg(travel_min)) avg_travel_min,round(avg(on_site_min)) avg_on_site_min from v_dockets where day=$date group by truck order by truck',
  uninvoiced: 'select docket_no,day,order_code,customer,mix,volume_m3,current_date-day days_since from v_dockets where invoice_ref is null order by day,docket_no',
  'customer-volume': "select customer,count(distinct order_code) orders,sum(volume_m3) sent_m3,sum(returned_m3) returned_m3,max(day) last_load from v_dockets where day>=current_date-90 group by customer order by sent_m3 desc",
  compliance: 'select rule,record,issue from v_compliance order by rule,record',
  attention: 'select kind,record,due,detail from v_attention order by due,kind,record',
};

const named = {
  plants: { by: 'code', names: true }, mixes: { by: 'code', names: 'description' }, customers: { by: 'code', names: true },
  sites: { by: 'code', names: true }, trucks: { by: 'code', names: 'rego' }, orders: { by: 'code' },
  dockets: { by: 'docket_no' }, samples: { by: 'code' },
};

// Exact code or id first, then a unique prefix or name match. Ambiguity lists candidates.
export async function resolve(db, entity, value) {
  if (!value) throw Error(`Supply a ${entity.replace(/s$/, '')} code, name or id prefix`);
  const { by, names } = named[entity];
  const exact = await db.query(`select * from ${entity} where lower(${by})=lower($1) or id::text=$1`, [String(value)]);
  if (exact.length === 1) return exact[0];
  const nameCol = names === true ? 'name' : names;
  const found = await db.query(`select * from ${entity} where starts_with(lower(${by}),lower($1)) or starts_with(id::text,$1)${nameCol ? ` or position(lower($1) in lower(${nameCol}))>0` : ''} order by ${by}`, [String(value)]);
  if (found.length === 1) return found[0];
  const list = found.map((r) => `${r[by]}${nameCol ? ' ' + r[nameCol] : ''}`).join('; ') || '(none)';
  throw Error(`${found.length ? 'Ambiguous' : 'No matching'} ${entity.replace(/s$/, '')}: ${value}. Candidates: ${list}`);
}

const required = (v, n) => { if (v === undefined || v === true || String(v).trim() === '') throw Error(`Required: ${n}`); return String(v).trim(); };
const number = (v, n, { positive = false, min } = {}) => {
  const x = Number(required(v, n));
  if (!Number.isFinite(x) || (positive && x <= 0) || (min !== undefined && x < min)) throw Error(`Invalid ${n}: ${v}`);
  return x;
};
const date = (v, n = 'date') => {
  required(v, n);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v) throw Error(`Invalid ${n}: use a real YYYY-MM-DD date`);
  return v;
};
// HH:MM is read on the docket's batch day; a full YYYY-MM-DDTHH:MM is taken as given.
const when = (v, day) => {
  const s = required(v, 'time (--at=HH:MM)');
  if (/^\d{2}:\d{2}$/.test(s)) return `${day}T${s}:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !Number.isNaN(Date.parse(s))) return s;
  throw Error(`Invalid time: ${s}. Use HH:MM or YYYY-MM-DDTHH:MM`);
};
const today = () => new Date().toISOString().slice(0, 10);
const dayOf = (ts) => new Date(ts).toISOString().slice(0, 10);

async function transaction(db, fn, dry = false) {
  await db.exec('begin');
  try { const out = await fn(); await db.exec(dry ? 'rollback' : 'commit'); return out; }
  catch (e) { await db.exec('rollback'); throw e; }
}

const entities = ['plants', 'mixes', 'customers', 'sites', 'trucks', 'orders', 'dockets', 'samples', 'results', 'notes'];

export const help = [
  ...Object.keys(reads),
  'order <code>', 'docket <docket_no>',
  'add plant <code> <name> --country=NZ|AU [--audit=ref] [--test-every=75]',
  'add mix <code> <description> --grade=32 --slump=100 --aggregate=19 [--admixtures=..] [--price=..]',
  'add customer <code> <name> [--email=..] [--phone=..]',
  'add site <code> <name> --customer=.. [--address=..]',
  'add truck <code> --capacity=7 [--rego=..]',
  'add order <code> --customer=.. --site=.. --plant=.. --mix=.. --date=YYYY-MM-DD --m3=.. [--start=HH:MM] [--element=..] [--pump] [--po=..]',
  'confirm <order>', 'cancel <order>', 'complete <order>', 'hold <customer> on|off',
  'ticket <order> --truck=.. --m3=.. [--at=HH:MM] [--water=litres] [--extra]',
  'arrive <docket> --at=HH:MM', 'discharge <docket> --at=HH:MM', 'sign <docket> --by=name', 'return <docket> <m3>',
  'sample <docket> --code=.. [--slump=mm] [--cylinders=3] [--lab=ref]',
  'result <sample> --age=7|28 --mpa=.. --lab=ref [--date=YYYY-MM-DD]',
  'invoice <docket|order> --ref=..', 'log <order> <note>',
  'import command-alkon <folder> [--dry-run] [--map=file.json]', 'export <folder>',
  'draft-confirmation <order>', 'draft-results <order>',
];

export async function run(db, args) {
  const flags = {}; const pos = [];
  for (const a of args) {
    if (a.startsWith('--')) { const i = a.indexOf('='); flags[a.slice(2, i < 0 ? undefined : i)] = i < 0 ? true : a.slice(i + 1); }
    else pos.push(a);
  }
  const [cmd = 'help', ...a] = pos;
  if (cmd === 'help') return help.map((command) => ({ command }));

  if (reads[cmd]) {
    if (reads[cmd].includes('$date')) return db.query(reads[cmd].replace('$date', '$1'), [flags.date ? date(flags.date) : today()]);
    return db.query(reads[cmd]);
  }

  if (cmd === 'order') {
    const o = await resolve(db, 'orders', a[0]);
    return {
      order: await db.query('select p.*,o.start_time,o.element,o.pump,o.po_ref,pl.code plant from v_order_progress p join orders o on o.id=p.order_id join plants pl on pl.id=o.plant_id where p.order_id=$1', [o.id]),
      dockets: await db.query('select docket_no,truck,volume_m3,batched,arrived,discharged,batch_to_discharge_min,signed_by,returned_m3,invoice_ref from v_dockets where order_code=$1 order by docket_no', [o.code]),
      samples: await db.query('select sample,docket_no,sampled_on,slump_mm,mpa_7,mpa_28 from v_samples where order_code=$1 order by sample', [o.code]),
      notes: await db.query('select created_at,body from notes where order_id=$1 order by created_at', [o.id]),
    };
  }
  if (cmd === 'docket') {
    const d = await resolve(db, 'dockets', a[0]);
    return { docket: await db.query('select * from v_dockets where docket_id=$1', [d.id]), samples: await db.query('select sample,sampled_on,slump_mm,mpa_7,mpa_28 from v_samples where docket_no=$1', [d.docket_no]) };
  }

  if (cmd === 'export') {
    const dir = path.resolve(required(a[0], 'export folder'));
    fs.mkdirSync(dir, { recursive: true });
    return transaction(db, async () => {
      await db.exec('set transaction isolation level repeatable read');
      const counts = [];
      for (const t of entities) {
        const rows = await db.query(`select * from ${t} order by id`);
        fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(rows, null, 2) + '\n');
        counts.push({ entity: t, rows: rows.length });
      }
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 1, at: new Date().toISOString(), counts }, null, 2) + '\n');
      return counts;
    });
  }

  if (cmd === 'import') return importCommandAlkon(db, a, flags);

  if (cmd === 'add') return transaction(db, () => add(db, a, flags));

  if (['confirm', 'cancel', 'complete'].includes(cmd)) return transaction(db, async () => {
    const o = await resolve(db, 'orders', a[0]);
    const from = { confirm: ['booked'], cancel: ['booked', 'confirmed'], complete: ['booked', 'confirmed'] }[cmd];
    if (!from.includes(o.status)) throw Error(`Order ${o.code} is ${o.status}: cannot ${cmd}`);
    if (cmd === 'cancel' && (await db.query('select 1 from dockets where order_id=$1 limit 1', [o.id])).length) throw Error(`Order ${o.code} has dockets: complete it instead`);
    const status = { confirm: 'confirmed', cancel: 'cancelled', complete: 'complete' }[cmd];
    return db.query('update orders set status=$2 where id=$1 returning code,status', [o.id, status]);
  });

  if (cmd === 'hold') return transaction(db, async () => {
    const c = await resolve(db, 'customers', a[0]);
    if (!['on', 'off'].includes(a[1])) throw Error('Use hold <customer> on|off');
    return db.query('update customers set credit_hold=$2 where id=$1 returning code,name,credit_hold', [c.id, a[1] === 'on']);
  });

  if (cmd === 'ticket') return transaction(db, async () => {
    await db.exec('lock table dockets in share row exclusive mode');
    const o = await resolve(db, 'orders', a[0]);
    if (o.status !== 'confirmed') throw Error(`Order ${o.code} is ${o.status}: only a confirmed order can be ticketed`);
    const c = (await db.query('select * from customers where id=$1', [o.customer_id]))[0];
    if (c.credit_hold) throw Error(`${c.name} is on credit hold: release the hold before batching`);
    const t = await resolve(db, 'trucks', flags.truck);
    if (!t.active) throw Error(`Truck ${t.code} is not active`);
    const m3 = number(flags.m3, 'm3', { positive: true });
    if (m3 > Number(t.capacity_m3)) throw Error(`Load ${m3} m3 is over truck ${t.code} capacity of ${t.capacity_m3} m3`);
    const p = (await db.query('select sent_m3 from v_order_progress where order_id=$1', [o.id]))[0];
    if (Number(p.sent_m3) + m3 > Number(o.volume_m3) && !flags.extra) throw Error(`Load takes order ${o.code} past ${o.volume_m3} m3 ordered: confirm the extra with the site, then add --extra`);
    const n = (await db.query('select count(*)::int n from dockets where order_id=$1', [o.id]))[0].n + 1;
    const batched = flags.at ? when(flags.at, today()) : new Date().toISOString();
    const docket = await db.query('insert into dockets(docket_no,order_id,truck_id,batched_at,volume_m3,water_added_l) values($1,$2,$3,$4,$5,$6) returning docket_no,volume_m3,batched_at',
      [`${o.code}-${String(n).padStart(2, '0')}`, o.id, t.id, batched, m3, flags.water ? number(flags.water, 'water litres', { min: 0 }) : 0]);
    if (Number(p.sent_m3) + m3 > Number(o.volume_m3)) await db.query('update orders set volume_m3=$2 where id=$1', [o.id, Number(p.sent_m3) + m3]);
    return docket;
  });

  if (['arrive', 'discharge', 'sign', 'return'].includes(cmd)) return transaction(db, async () => {
    const d = await resolve(db, 'dockets', a[0]);
    const day = dayOf(d.batched_at);
    if (cmd === 'arrive') return db.query('update dockets set arrived_at=$2 where id=$1 returning docket_no,arrived_at', [d.id, when(flags.at, day)]);
    if (cmd === 'discharge') {
      const at = when(flags.at, day);
      if (d.arrived_at && Date.parse(at) < Date.parse(d.arrived_at)) throw Error('Discharge cannot finish before arrival');
      return db.query('update dockets set discharged_at=$2 where id=$1 returning docket_no,discharged_at', [d.id, at]);
    }
    if (cmd === 'sign') return db.query('update dockets set signed_by=$2 where id=$1 returning docket_no,signed_by', [d.id, required(flags.by, 'signed by (--by)')]);
    const back = number(a[1], 'returned m3', { min: 0 });
    if (back > Number(d.volume_m3)) throw Error(`Returned ${back} m3 is more than the ${d.volume_m3} m3 on the docket`);
    return db.query('update dockets set returned_m3=$2 where id=$1 returning docket_no,volume_m3,returned_m3', [d.id, back]);
  });

  if (cmd === 'sample') return transaction(db, async () => {
    const d = await resolve(db, 'dockets', a[0]);
    return db.query('insert into samples(code,docket_id,sampled_on,slump_mm,cylinders,lab_ref) values($1,$2,$3,$4,$5,$6) returning code,sampled_on',
      [required(flags.code, 'sample code (--code)'), d.id, dayOf(d.batched_at), flags.slump ? number(flags.slump, 'slump', { min: 0 }) : null, flags.cylinders ? number(flags.cylinders, 'cylinders', { positive: true }) : 3, flags.lab || null]);
  });

  if (cmd === 'result') return transaction(db, async () => {
    const s = await resolve(db, 'samples', a[0]);
    const age = number(flags.age, 'age in days (--age)', { positive: true });
    const sampled = s.sampled_on instanceof Date ? s.sampled_on.toISOString().slice(0, 10) : String(s.sampled_on).slice(0, 10);
    const tested = flags.date ? date(flags.date) : new Date(Date.parse(sampled) + age * 86400000).toISOString().slice(0, 10);
    if (tested < sampled) throw Error('A result cannot be tested before the sample was taken');
    if (tested > today()) throw Error(`The ${age} day test falls on ${tested}, after today: record it once the lab has broken the cylinder`);
    return db.query('insert into results(sample_id,age_days,tested_on,mpa,lab_ref) values($1,$2,$3,$4,$5) returning age_days,tested_on,mpa',
      [s.id, age, tested, number(flags.mpa, 'MPa (--mpa)', { positive: true }), required(flags.lab, 'lab reference (--lab)')]);
  });

  if (cmd === 'invoice') return transaction(db, async () => {
    const ref = required(flags.ref, 'invoice reference (--ref)');
    const one = (await db.query('select id from dockets where lower(docket_no)=lower($1)', [a[0] || ''])).length;
    if (one) {
      const d = await resolve(db, 'dockets', a[0]);
      if (d.invoice_ref) throw Error(`Docket ${d.docket_no} is already on ${d.invoice_ref}`);
      return db.query('update dockets set invoice_ref=$2 where id=$1 returning docket_no,invoice_ref', [d.id, ref]);
    }
    const o = await resolve(db, 'orders', a[0]);
    const rows = await db.query('update dockets set invoice_ref=$2 where order_id=$1 and invoice_ref is null returning docket_no,invoice_ref', [o.id, ref]);
    if (!rows.length) throw Error(`Order ${o.code} has no dockets waiting for an invoice`);
    return rows;
  });

  if (cmd === 'log') return transaction(db, async () => {
    const o = await resolve(db, 'orders', a[0]);
    return db.query('insert into notes(order_id,body) values($1,$2) returning body', [o.id, required(a.slice(1).join(' '), 'note')]);
  });

  if (cmd === 'draft-confirmation' || cmd === 'draft-results') return draft(db, cmd, a[0]);

  throw Error(`Unknown command: ${cmd}. Run help.`);
}

async function add(db, a, flags) {
  const [type, code, ...rest] = a;
  const name = rest.join(' ');
  if (type === 'plant') return db.query('insert into plants(code,name,country,audit_ref,test_every_m3) values($1,$2,$3,$4,$5) returning code,name',
    [required(code, 'code'), required(name, 'name'), required(flags.country, 'country (--country=NZ|AU)'), flags.audit || null, flags['test-every'] ? number(flags['test-every'], 'test every m3', { positive: true }) : 75]);
  if (type === 'mix') return db.query('insert into mixes(code,description,grade_mpa,slump_mm,max_aggregate_mm,admixtures,price_per_m3) values($1,$2,$3,$4,$5,$6,$7) returning code,description',
    [required(code, 'code'), required(name, 'description'), number(flags.grade, 'grade MPa', { positive: true }), number(flags.slump, 'slump mm', { min: 0 }), number(flags.aggregate, 'aggregate mm', { positive: true }), flags.admixtures || null, flags.price ? number(flags.price, 'price', { min: 0 }) : null]);
  if (type === 'customer') return db.query('insert into customers(code,name,email,phone) values($1,$2,$3,$4) returning code,name', [required(code, 'code'), required(name, 'name'), flags.email || null, flags.phone || null]);
  if (type === 'site') {
    const c = await resolve(db, 'customers', flags.customer);
    return db.query('insert into sites(code,customer_id,name,address) values($1,$2,$3,$4) returning code,name', [required(code, 'code'), c.id, required(name, 'name'), flags.address || null]);
  }
  if (type === 'truck') return db.query('insert into trucks(code,rego,capacity_m3) values($1,$2,$3) returning code,capacity_m3', [required(code, 'code'), flags.rego || null, number(flags.capacity, 'capacity m3', { positive: true })]);
  if (type === 'order') {
    const c = await resolve(db, 'customers', flags.customer);
    const s = await resolve(db, 'sites', flags.site);
    if (s.customer_id !== c.id) throw Error(`Site ${s.code} belongs to another customer`);
    const p = await resolve(db, 'plants', flags.plant);
    const m = await resolve(db, 'mixes', flags.mix);
    if (!m.active) throw Error(`Mix ${m.code} is not active`);
    if (flags.start && !/^\d{2}:\d{2}$/.test(flags.start)) throw Error('Invalid start: use HH:MM');
    return db.query('insert into orders(code,customer_id,site_id,plant_id,mix_id,pour_date,start_time,volume_m3,element,pump,po_ref) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning code,pour_date,status',
      [required(code, 'code'), c.id, s.id, p.id, m.id, date(flags.date), flags.start || null, number(flags.m3, 'm3', { positive: true }), flags.element || null, Boolean(flags.pump), flags.po || null]);
  }
  throw Error('Add one of: plant, mix, customer, site, truck, order');
}

// Supported list exports. Report headings differ between installs: map them with --map.
const importFiles = [
  { match: /^customers?/, entity: 'customers', code: ['Customer Code', 'Customer Number', 'Code'], name: ['Customer Name', 'Name'] },
  { match: /^(projects?|sites?|jobs?)/, entity: 'sites', code: ['Project Code', 'Project Number', 'Site Code', 'Code'], name: ['Project Name', 'Site Name', 'Name'] },
  { match: /^(mix(es)?|products?)/, entity: 'mixes', code: ['Mix Code', 'Product Code', 'Code'], name: ['Mix Description', 'Description', 'Name'] },
  { match: /^(trucks?|vehicles?)/, entity: 'trucks', code: ['Truck Code', 'Truck Number', 'Vehicle', 'Code'], name: [] },
];

async function importCommandAlkon(db, a, flags) {
  if (a[0] !== 'command-alkon') throw Error('Supported import: command-alkon. See docs/replace-command-alkon.md');
  const dir = path.resolve(required(a[1], 'folder of CSV exports'));
  const mapping = flags.map ? JSON.parse(fs.readFileSync(flags.map, 'utf8')) : {};
  const files = fs.readdirSync(dir).filter((n) => /\.csv$/i.test(n)).sort();
  if (!files.length) throw Error(`No CSV files in ${dir}`);
  // Customers first, so projects can find their customer in the same run.
  const order = (f) => importFiles.findIndex((x) => x.match.test(f.toLowerCase())) ?? 9;
  files.sort((x, y) => order(x) - order(y));
  return transaction(db, async () => {
    const out = [];
    for (const file of files) {
      const spec = importFiles.find((x) => x.match.test(file.toLowerCase()));
      if (!spec) throw Error(`Unrecognised file ${file}: expected Customers, Projects, Mixes or Trucks. See docs/replace-command-alkon.md`);
      const rows = parseCsv(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (!rows.length) throw Error(`Empty file: ${file}`);
      let added = 0;
      for (const raw of rows) {
        const row = { ...raw };
        for (const [ours, theirs] of Object.entries(mapping[spec.entity] || {})) {
          if (!(theirs in raw)) throw Error(`${file}: mapped column "${theirs}" is not in the file`);
          row[ours] = raw[theirs];
        }
        const code = required(pick(row, ...spec.code), `${file}: code column`);
        if (spec.entity === 'customers') {
          await db.query('insert into customers(code,name,email,phone,credit_hold) values($1,$2,$3,$4,$5) on conflict(code) do update set name=excluded.name,email=excluded.email,phone=excluded.phone',
            [code, required(pick(row, ...spec.name), `${file}: name`), pick(row, 'Email', 'Email Address') || null, pick(row, 'Phone', 'Phone Number') || null, yesNo(pick(row, 'Credit Hold', 'On Hold'))]);
        } else if (spec.entity === 'sites') {
          const cust = required(pick(row, 'Customer Code', 'Customer Number', 'Customer'), `${file}: customer code`);
          const c = (await db.query('select id from customers where lower(code)=lower($1)', [cust]))[0];
          if (!c) throw Error(`${file}: project ${code} names customer ${cust}, which is not in the database or the Customers file`);
          await db.query('insert into sites(code,customer_id,name,address) values($1,$2,$3,$4) on conflict(code) do update set name=excluded.name,address=excluded.address',
            [code, c.id, required(pick(row, ...spec.name), `${file}: name`), pick(row, 'Address', 'Delivery Address', 'Site Address') || null]);
        } else if (spec.entity === 'mixes') {
          await db.query('insert into mixes(code,description,grade_mpa,slump_mm,max_aggregate_mm,admixtures,price_per_m3) values($1,$2,$3,$4,$5,$6,$7) on conflict(code) do update set description=excluded.description,price_per_m3=excluded.price_per_m3',
            [code, required(pick(row, ...spec.name), `${file}: description`), number(pick(row, 'Strength', 'Strength MPa', 'Grade'), `${file} ${code}: strength`, { positive: true }),
              number(pick(row, 'Slump', 'Slump mm'), `${file} ${code}: slump`, { min: 0 }), number(pick(row, 'Aggregate Size', 'Max Aggregate', 'Aggregate'), `${file} ${code}: aggregate size`, { positive: true }),
              pick(row, 'Admixtures') || null, pick(row, 'Price', 'Price per m3', 'Unit Price') ? number(pick(row, 'Price', 'Price per m3', 'Unit Price'), `${file} ${code}: price`, { min: 0 }) : null]);
        } else {
          await db.query('insert into trucks(code,rego,capacity_m3) values($1,$2,$3) on conflict(code) do update set rego=excluded.rego,capacity_m3=excluded.capacity_m3',
            [code, pick(row, 'Registration', 'Rego', 'Plate') || null, number(pick(row, 'Capacity', 'Capacity m3', 'Max Load'), `${file} ${code}: capacity`, { positive: true })]);
        }
        added++;
      }
      out.push({ file, entity: spec.entity, rows: added, dry_run: Boolean(flags['dry-run']) });
    }
    return out;
  }, Boolean(flags['dry-run']));
}

async function draft(db, cmd, ref) {
  const o = await resolve(db, 'orders', ref);
  const info = (await db.query('select o.code,o.pour_date,o.start_time,o.volume_m3,o.element,o.pump,o.po_ref,c.name customer,c.email,s.name site,s.address,m.code mix,m.description,pl.name plant from orders o join customers c on c.id=o.customer_id join sites s on s.id=o.site_id join mixes m on m.id=o.mix_id join plants pl on pl.id=o.plant_id where o.id=$1', [o.id]))[0];
  const dir = path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  const day = info.pour_date instanceof Date ? info.pour_date.toISOString().slice(0, 10) : String(info.pour_date).slice(0, 10);
  let body;
  if (cmd === 'draft-confirmation') {
    body = `# DRAFT: pour confirmation for ${info.code}\n\nTo: ${info.email || '(no email on file)'}\n\nHi ${info.customer},\n\nConfirming your concrete for ${info.site}${info.address ? ', ' + info.address : ''}.\n\n- Date: ${day}\n- First load: ${info.start_time ? String(info.start_time).slice(0, 5) : 'to be agreed'}\n- Mix: ${info.mix}, ${info.description}\n- Volume: ${info.volume_m3} m3${info.element ? ' for the ' + info.element : ''}\n- Pump: ${info.pump ? 'yes' : 'no'}\n- Your reference: ${info.po_ref || 'none given'}\n- From: ${info.plant}\n\nPlease call the dispatch office if the site, time or volume changes.\n\nFor review before sending. Nothing has been sent.\n`;
  } else {
    const rows = await db.query('select sample,docket_no,sampled_on,slump_mm,mpa_7,mpa_28,grade_mpa from v_samples where order_code=$1 order by sample', [info.code]);
    if (!rows.length) throw Error(`Order ${info.code} has no test samples`);
    const lines = rows.map((r) => `| ${r.sample} | ${r.docket_no} | ${String(r.sampled_on instanceof Date ? r.sampled_on.toISOString() : r.sampled_on).slice(0, 10)} | ${r.slump_mm ?? ''} | ${r.mpa_7 ?? 'pending'} | ${r.mpa_28 ?? 'pending'} |`).join('\n');
    const below = rows.filter((r) => r.mpa_28 !== null && Number(r.mpa_28) < Number(r.grade_mpa));
    body = `# DRAFT: test results for ${info.code}\n\nTo: ${info.email || '(no email on file)'}\n\nHi ${info.customer},\n\nTest results for the ${info.mix} (${info.description}) supplied to ${info.site} on ${day}.\n\n| Sample | Docket | Sampled | Slump mm | 7 day MPa | 28 day MPa |\n|---|---|---|---|---|---|\n${lines}\n\n${below.length ? `REVIEW BEFORE SENDING: ${below.map((r) => r.sample).join(', ')} tested below the specified ${below[0].grade_mpa} MPa. Agree the investigation and wording with the plant engineer first.\n\n` : ''}For review before sending. Nothing has been sent.\n`;
  }
  const file = path.join(dir, `${cmd.replace('draft-', '')}-${info.code}-${Date.now()}.md`);
  fs.writeFileSync(file, body);
  return [{ file, order: info.code }];
}

function print(value) {
  if (Array.isArray(value)) { console.log(table(value, Object.keys(value[0] || {}).map((key) => ({ key, label: key, format: fmt })))); return; }
  for (const [key, v] of Object.entries(value)) { console.log(`\n${key}`); print(Array.isArray(v) ? v : [v]); }
}
function fmt(v) {
  if (v instanceof Date) return v.toISOString().slice(0, v.getUTCHours() || v.getUTCMinutes() ? 16 : 10).replace('T', ' ');
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return v;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let db;
  try {
    db = await getDb();
    const out = await run(db, process.argv.slice(2));
    if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2)); else print(out);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  finally { await db?.close(); }
}
