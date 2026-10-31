// npm test: a temp database, migrate, seed twice, then every command and every rule.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { run, reads } from './mix.mjs';
import { parseCsv } from './lib/csv.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ready-mix-test-'));
// A blank URL keeps tests off any real database named in .env.
process.env.DATABASE_URL = ''; process.env.DATA_DIR = path.join(temp, 'db'); process.env.OUTPUT_DIR = temp;
let db; let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
const rejects = async (args, re) => { await assert.rejects(() => run(db, args), re); checks++; };
const child = (script, args = []) => {
  const p = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', script), ...args], { env: process.env, encoding: 'utf8', cwd: REPO_ROOT });
  assert.equal(p.status, 0, p.stderr || p.stdout); checks++; return p.stdout;
};
const today = new Date().toISOString().slice(0, 10);
const daysFrom = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

try {
  db = await getDb();
  eq((await migrate(db)).ran.length, 1); eq((await migrate(db)).ran.length, 0);
  const seed = fs.readFileSync(path.join(REPO_ROOT, 'supabase/seed.sql'), 'utf8');
  await db.exec(seed); await db.exec(seed);
  eq((await run(db, ['orders'])).length, 8); eq((await run(db, ['dockets'])).length, 44);

  for (const name of Object.keys(reads)) ok(Array.isArray(await run(db, [name])), name);

  // The demo has something to say on every rule.
  const rules = new Set((await run(db, ['compliance'])).map((r) => r.rule));
  for (const r of ['DISCHARGE-TIME', 'DOCKET-INCOMPLETE', 'WATER-ADDED', 'TEST-FREQUENCY', 'RESULT-OVERDUE', 'STRENGTH-BELOW-GRADE', 'PLANT-AUDIT-REF']) ok(rules.has(r), r);
  eq((await run(db, ['test-frequency'])).find((r) => r.plant === 'WHG').samples_short, 1);
  eq(Number((await run(db, ['order-progress'])).find((r) => r.code === 'RM103').to_send_m3), 4);
  eq((await run(db, ['tomorrow'])).map((r) => r.code), ['RM101']);
  eq((await run(db, ['results-due'])).map((r) => r.sample), ['S105', 'S108']);
  eq((await run(db, ['low-strength']))[0].sample, 'S104');
  eq(Number((await run(db, ['returned']))[0].returned_m3), 1.5);
  eq((await run(db, ['uninvoiced'])).length, 6);
  ok((await run(db, ['truck-day', `--date=${daysFrom(-20)}`])).length === 2);
  const attention = await run(db, ['attention']);
  for (const k of ['pour without confirmation', 'pour booked on credit hold', 'past pour still open', '7 day result due', '28 day result due', 'docket not invoiced', 'docket not signed']) ok(attention.some((r) => r.kind === k), k);
  eq((await run(db, ['order', 'rm105'])).dockets.length, 3);
  eq((await run(db, ['docket', 'RM104-01'])).samples[0].sample, 'S104');

  // Matching: partial codes and names, ambiguity lists candidates.
  await rejects(['add', 'site', 'X', 'Somewhere', '--customer=Harb'], /Ambiguous.*HARBOUR.*HARBOURCIV/);
  await rejects(['order', 'RM10'], /Ambiguous.*RM100.*RM107/);
  await rejects(['order', 'ZZZ'], /No matching order/);

  // Ticketing rules.
  await rejects(['ticket', 'RM101', '--truck=T01', '--m3=7'], /booked: only a confirmed/);
  await rejects(['ticket', 'RM102', '--truck=T01', '--m3=7'], /credit hold/);
  await rejects(['ticket', 'RM103', '--truck=T04', '--m3=4'], /not active/);
  await rejects(['ticket', 'RM103', '--truck=T03', '--m3=6'], /over truck T03 capacity/);
  await rejects(['ticket', 'RM103', '--truck=T01', '--m3=6'], /past 18.00 m3 ordered/);
  const t = await run(db, ['ticket', 'RM103', '--truck=T03', '--m3=4', '--at=10:00']);
  eq(t[0].docket_no, 'RM103-03');
  eq(Number((await run(db, ['order-progress'])).find((r) => r.code === 'RM103').to_send_m3), 0);
  await run(db, ['ticket', 'RM103', '--truck=T01', '--m3=2', '--at=11:00', '--extra']);
  eq(Number((await db.query("select volume_m3 from orders where code='RM103'"))[0].volume_m3), 20);
  await run(db, ['arrive', 'RM103-03', '--at=10:30']);
  await rejects(['discharge', 'RM103-03', '--at=10:20'], /before arrival/);
  await rejects(['arrive', 'RM103-03', '--at=09:00'], /check/);
  await run(db, ['discharge', 'RM103-03', '--at=11:00']);
  await run(db, ['sign', 'RM103-03', '--by=Pool foreman']);
  await rejects(['return', 'RM103-03', '5'], /more than/);
  await run(db, ['return', 'RM103-03', '0.5']);
  eq((await run(db, ['docket', 'RM103-03'])).docket[0].batch_to_discharge_min, 60);
  await assert.rejects(() => db.query("update dockets set volume_m3=1 where docket_no='RM103-03'"), /printed/); checks++;
  await assert.rejects(() => db.query("delete from dockets where docket_no='RM103-03'"), /kept/); checks++;

  // Status changes.
  await run(db, ['confirm', 'RM101']); await rejects(['confirm', 'RM101'], /confirmed: cannot confirm/);
  await rejects(['cancel', 'RM103'], /has dockets/);
  await run(db, ['complete', 'RM103']);
  await run(db, ['cancel', 'RM106']); eq((await db.query("select status from orders where code='RM106'"))[0].status, 'cancelled');
  await run(db, ['hold', 'RIDGE', 'off']); await run(db, ['ticket', 'RM102', '--truck=T01', '--m3=7', `--at=${daysFrom(0)}T09:00`]);
  await rejects(['hold', 'RIDGE', 'maybe'], /on\|off/);

  // Tests and results.
  await run(db, ['sample', 'RM102-01', '--code=S200', '--slump=95', '--lab=LAB-9000']);
  await rejects(['result', 'S200', '--age=28', '--mpa=25', '--lab=x'], /after today/);
  await rejects(['result', 'S105', '--age=28', '--mpa=44'], /lab reference/);
  await run(db, ['result', 'S105', '--age=28', '--mpa=44', '--lab=LAB-5531-28']);
  ok(!(await run(db, ['compliance'])).some((r) => r.rule === 'RESULT-OVERDUE' && r.record === 'S105'));
  await rejects(['result', 'S105', '--age=28', '--mpa=45', '--lab=again'], /unique|duplicate/);
  await run(db, ['sample', 'RM107-05', '--code=S201', '--lab=LAB-9001']);
  ok(!(await run(db, ['compliance'])).some((r) => r.rule === 'TEST-FREQUENCY' && r.record === 'WHG'));

  // Invoicing.
  await run(db, ['invoice', 'RM105', '--ref=INV-3001']);
  await rejects(['invoice', 'RM105', '--ref=INV-3002'], /no dockets waiting/);
  await rejects(['invoice', 'RM105-01', '--ref=INV-3003'], /already on INV-3001/);
  await run(db, ['invoice', 'RM100-10', '--ref=INV-3004']);

  // Adding records.
  await run(db, ['add', 'plant', 'TST', 'Test plant', '--country=NZ', '--audit=TEST-REF']);
  await run(db, ['add', 'mix', 'T30', '30 MPa test mix', '--grade=30', '--slump=100', '--aggregate=19', '--price=280']);
  await run(db, ['add', 'customer', 'TESTC', 'Test Customer', '--email=test@example.com']);
  await run(db, ['add', 'site', 'TESTS', 'Test site', '--customer=TESTC']);
  await run(db, ['add', 'truck', 'T09', '--capacity=8', '--rego=TEST9']);
  await rejects(['add', 'order', 'BAD', '--customer=TESTC', '--site=HB-MANGAWHAI', '--plant=TST', '--mix=T30', `--date=${today}`, '--m3=5'], /another customer/);
  await rejects(['add', 'order', 'BAD', '--customer=TESTC', '--site=TESTS', '--plant=TST', '--mix=T30', '--date=2026-02-30', '--m3=5'], /real YYYY-MM-DD/);
  await run(db, ['add', 'order', 'TST1', '--customer=TESTC', '--site=TESTS', '--plant=TST', '--mix=T30', `--date=${today}`, '--m3=8', '--start=07:00', '--pump']);
  await rejects(['add', 'truck', 'T10', '--capacity=-1'], /Invalid/);
  await run(db, ['log', 'TST1', 'Pump', 'booked', 'for', '7am']); eq((await run(db, ['order', 'TST1'])).notes.length, 1);

  // Import from Command Alkon list exports: dry run, real run, repeat, rollback, mapping.
  const fixtures = path.join(REPO_ROOT, 'tests/fixtures/command-alkon');
  await run(db, ['import', 'command-alkon', fixtures, '--dry-run']);
  eq((await db.query("select * from customers where code='IMP-CUST'")).length, 0);
  const imported = await run(db, ['import', 'command-alkon', fixtures]); await run(db, ['import', 'command-alkon', fixtures]);
  eq(imported.map((r) => r.entity), ['customers', 'sites', 'mixes', 'trucks']);
  eq((await db.query("select * from sites where code='IMP-SITE'")).length, 1);
  eq(Number((await db.query("select capacity_m3 from trucks where code='IMP-T9'"))[0].capacity_m3), 6.5);
  const bad = path.join(temp, 'bad'); fs.mkdirSync(bad);
  fs.writeFileSync(path.join(bad, 'Customers.csv'), 'Customer Code,Customer Name\nROLLBACK,Good row\nBROKEN,\n');
  await rejects(['import', 'command-alkon', bad], /Required/);
  eq((await db.query("select * from customers where code='ROLLBACK'")).length, 0);
  fs.writeFileSync(path.join(bad, 'Customers.csv'), 'Acct,Account Name\nMAPPED,Mapped Customer\n');
  const map = path.join(temp, 'map.json'); fs.writeFileSync(map, JSON.stringify({ customers: { 'Customer Code': 'Acct', 'Customer Name': 'Account Name' } }));
  await run(db, ['import', 'command-alkon', bad, `--map=${map}`]);
  eq((await db.query("select * from customers where code='MAPPED'")).length, 1);
  fs.writeFileSync(path.join(bad, 'Tickets.csv'), 'x\ny\n');
  await rejects(['import', 'command-alkon', bad], /Unrecognised/);
  await rejects(['import', 'other', bad], /Supported import/);
  eq(parseCsv('﻿Code,Name\r\nA,"Line one\nLine ""two"""\r\n')[0].Name, 'Line one\nLine "two"');

  // Export and drafts.
  const exported = await run(db, ['export', path.join(temp, 'export')]);
  eq(exported.length, 10); ok(fs.existsSync(path.join(temp, 'export', 'manifest.json')));
  const conf = await run(db, ['draft-confirmation', 'RM101']);
  ok(fs.readFileSync(conf[0].file, 'utf8').includes('Mangawhai townhouses'));
  const res = await run(db, ['draft-results', 'RM104']);
  ok(fs.readFileSync(res[0].file, 'utf8').includes('REVIEW BEFORE SENDING: S104'));
  await rejects(['draft-results', 'TST1'], /no test samples/);
  await db.close(); db = null;

  // The CLI as a process: --json, help, ambiguity exits 1.
  ok(JSON.parse(child('mix.mjs', ['pour-schedule', '--json'])).length > 0);
  ok(child('mix.mjs', ['help']).includes('ticket <order>'));
  const amb = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/mix.mjs'), 'order', 'RM10'], { env: process.env, encoding: 'utf8' });
  eq(amb.status, 1); ok(amb.stderr.includes('Candidates:'));
  child('view.mjs'); child('docs.mjs');
  for (const v of JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'views.json'), 'utf8'))) ok(fs.existsSync(path.join(temp, 'views', `${v.name}.html`)), v.name);
  ok(fs.readdirSync(path.join(temp, 'docs-out', 'delivery-docket')).length >= 40);
  ok(fs.readdirSync(path.join(temp, 'docs-out', 'test-certificate')).length >= 5);

  const commands = fs.readdirSync(path.join(REPO_ROOT, '.claude/commands')).filter((f) => f.endsWith('.md') && f !== 'README.md');
  for (const f of commands) ok(/^---\ndescription: .+\n---/m.test(fs.readFileSync(path.join(REPO_ROOT, '.claude/commands', f), 'utf8')), `${f} has a description`);
  console.log(`PASS: ${checks} assertions; ${Object.keys(reads).length} read commands; ${commands.length} slash commands; tickets, dockets, tests, invoices, import rollback, export, drafts and HTML.`);
} finally {
  await db?.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
