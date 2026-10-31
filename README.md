<h1 align="center">Ready-Mix for Claude Code</h1>

<p align="center">
  <strong>The open-source ready-mix concrete order, docket and test system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Command Alkon data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=command-alkon">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/command-alkon?utm_source=github&utm_medium=readme&utm_campaign=command-alkon">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-command-alkon">Instead of Command Alkon</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Ready-Mix for Claude Code does the job you pay Command Alkon for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Command Alkon dashboard cannot.

Command Alkon does not publish its prices: dispatch, batch, quality and billing are sold as subscriptions on a quote, and plant control and truck tracking connections are priced on top. Ask for your own invoice total before you compare.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=command-alkon).

It is for ready-mix concrete producers with one to a handful of plants in New Zealand and Australia. It holds the order book, delivery dockets, test samples and strength results in one database: what is pouring tomorrow, what each truck did, which loads were late or had water added, which plant is short of samples and which results the lab still owes. It does not run your batch panel or track trucks live.

The fictional Kaipara Readymix demo has three plants, four trucks and eight orders. One pour tomorrow is unconfirmed, one customer is on credit hold with a pour booked, one load took 110 minutes from batching to discharge, one 40 MPa sample broke at 38, a 28 day result is a week late and the Whangarei plant is a sample short for its production.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/ready-mix-for-claude-code.git
cd ready-mix-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/pour-day` for tomorrow's plan, or `/attention` for everything that needs chasing. `npm run view` writes the week, plant quality and docket check views to `views/`; `npm run docs` writes dockets, test results, pour confirmations and customer statements to `docs-out/`, in the brand set in `brand.json`.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

The working week, in the dispatch office's and the plant's words: `/pour-day` the afternoon before, `/ticket` as each truck loads, `/docket-check` at the end of the day, `/plant-quality` for the plant engineer, `/weekly-review` on Monday.

| Command | What it does |
|---|---|
| `/add` | Add a plant, mix, customer, site, truck or order |
| `/arrive` | Record when a truck arrived on site |
| `/attention` | What needs chasing today: unconfirmed pours, credit holds, results due, dockets unsigned or not invoiced |
| `/cancel` | Cancel a pour that has no loads sent |
| `/complete` | Close an order once the last load is on site |
| `/compliance` | Check the records against the rules this industry lives under (the ones listed in docs/compliance.md) and report what is missing, late, or about to breach, with the rule cited. |
| `/confirm` | Confirm a booked pour with the customer |
| `/customer-volume` | m3 delivered and returned per customer over the last 90 days |
| `/customers` | Customers, contacts and who is on credit hold |
| `/customise` | Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it. |
| `/discharge` | Record when a truck finished discharging |
| `/docket-check` | Dockets missing times or a signature, over the discharge limit, or with water added unsigned |
| `/docket` | One docket with its times and any samples taken from it |
| `/dockets` | Every docket with batch, arrival and discharge times |
| `/draft-confirmation` | Draft the pour confirmation for a customer |
| `/draft-results` | Draft a customer's strength results letter for an order |
| `/export` | Export every record to JSON files |
| `/hold` | Put a customer on or off credit hold |
| `/import` | Bring customers, projects, mixes and trucks across from Command Alkon list exports |
| `/invoice` | Record the invoice reference for a docket or every open docket on an order |
| `/log` | Add a note to an order |
| `/low-strength` | 28 day results below or within 3 MPa of the specified grade |
| `/mix-performance` | Mean and lowest 28 day strength for each mix against its grade |
| `/mixes` | The mix list: strength grade, slump, aggregate, admixtures and price per m3 |
| `/new-view` | Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view`. |
| `/order-progress` | Ordered, sent, returned and placed m3 for each order |
| `/order` | One order with its dockets, samples and notes |
| `/orders` | Every order with ordered, sent and outstanding m3 |
| `/plant-quality` | The plant engineer review: sampling, results due and strength margins |
| `/plants` | Plants, their country, audit reference and sampling rule |
| `/pour-day` | The dispatch office's check before tomorrow |
| `/pour-schedule` | Every live pour by date and start time, with loads left on the largest truck |
| `/result` | Record a strength result from the lab report |
| `/results-due` | Strength results the lab owes, oldest first |
| `/return` | Record concrete returned to the plant |
| `/returned` | Returned concrete by customer and mix |
| `/sample` | Record a test sample taken from a load |
| `/samples` | Every test sample with its 7 and 28 day results |
| `/sign` | Record who signed the docket on site |
| `/sites` | Delivery sites and the customer each belongs to |
| `/test-frequency` | Samples taken against production for each plant over the last 90 days |
| `/ticket` | Batch a load: print the docket for one truck |
| `/tomorrow` | Tomorrow's pours in start order, with credit holds flagged |
| `/truck-day` | Loads, m3, travel and time on site for each truck on one day |
| `/trucks` | Trucks, registration, capacity and whether they are active |
| `/uninvoiced` | Dockets delivered with no invoice reference, oldest first |
| `/weekly-review` | The Monday review written from the schedule, the dockets and the lab |

Every command runs `npm run mix -- <command>`; add `--json` for machine output. Codes and names match without case; a prefix works when it is unique. An ambiguous name lists the candidates and exits with status 1. Dockets keep their batch time, volume, truck and order once printed, and dockets and results cannot be deleted.

## Ten questions to ask

Each one runs against the demo today.

1. Which pours tomorrow are still not confirmed, and who is on credit hold? `attention`
2. Which plant is short of test samples for what it produced in the last 90 days? `test-frequency`
3. Which 28 day results does the lab still owe us, and how late are they? `results-due`
4. Which mixes came in under grade or within 3 MPa of it? `low-strength`
5. Which loads took more than 90 minutes from batching to discharge? `docket-check`
6. Where was water added on site with nobody signing for it? `docket-check`
7. Which customers send back the most concrete, and on which mixes? `returned`
8. How long did each truck spend on site on a given day? `truck-day --date=YYYY-MM-DD`
9. Which delivered loads have no invoice yet? `uninvoiced`
10. How is each mix performing at 28 days against its grade? `mix-performance`

## Your first hour: ten things to ask for

1. Put our business name, logo and colours in brand.json.
2. Import our customers, projects, mixes and trucks from Command Alkon and compare the counts.
3. Set each plant's sampling rate to what our audit expects.
4. Change the discharge limit to the one in our supply terms.
5. Add cartage and short load charges to orders.
6. Add a pump operator and pump size to each pour.
7. Add slump tolerance checks to the docket.
8. Add a view of tomorrow's pours by plant for the batch operators.
9. Put our supply terms on the pour confirmation.
10. Move the database to a hosted Postgres with backups.

## Instead of Command Alkon

Save your customer, project, mix and truck lists as CSV and run `/import`, dry run first. [docs/replace-command-alkon.md](docs/replace-command-alkon.md) covers the headings, mapping files and what does not carry over in the free version (order and ticket history, pricing rules, batch panel and tracking connections).

The record checks and their sources are in [docs/compliance.md](docs/compliance.md). They check your records; they do not certify concrete or replace your plant engineer.

Not affiliated with or endorsed by Command Alkon.

## Architecture

```
ready-mix-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Ready-Mix for Claude Code for your business, migrates your Command Alkon data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=command-alkon)
- Read more: [enterprisedna.co/omni/instead-of/command-alkon](https://enterprisedna.co/omni/instead-of/command-alkon?utm_source=github&utm_medium=readme&utm_campaign=command-alkon)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
