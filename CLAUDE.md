# Ready-Mix for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| tomorrow's pours, the plan for the day | `/pour-day` |
| what needs chasing | `/attention` |
| the pour schedule | `/pour-schedule` |
| batch a load, print a docket | `/ticket` |
| truck arrived, finished, signed, returned | `/arrive`, `/discharge`, `/sign`, `/return` |
| docket problems | `/docket-check` |
| samples, results, the lab | `/sample`, `/result`, `/results-due` |
| strength, mixes under grade | `/low-strength`, `/mix-performance` |
| sampling against production | `/test-frequency` |
| the plant engineer's review | `/plant-quality` |
| the Monday review | `/weekly-review` |
| invoices | `/uninvoiced`, `/invoice` |
| returned concrete | `/returned` |
| a truck's day | `/truck-day` |
| one order or docket | `/order`, `/docket` |
| new customer, site, mix, truck or order | `/add` |
| confirm, cancel, complete, credit hold | `/confirm`, `/cancel`, `/complete`, `/hold` |
| pour confirmation or results letter | `/draft-confirmation`, `/draft-results` |
| records against the rules | `/compliance` |
| bring data from Command Alkon | `/import` |
| change a field or rule | `/customise` |
| a new dashboard | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run mix -- help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- A printed docket keeps its batch time, volume, truck and order. Corrections are a credit or a new docket, never an edit.
- Never record a strength result without the lab report reference. Never change one.
- A result below grade goes to the plant engineer before any customer letter. Draft it, flag it, stop.
- The record checks in `docs/compliance.md` are house defaults. Do not tell anyone their concrete complies; say what the records show.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Command Alkon.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/command-alkon
