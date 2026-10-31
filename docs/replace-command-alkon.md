# Moving off Command Alkon

Command Alkon's products (COMMANDseries, Integra and the newer Command Cloud) hold your customers, projects, mixes, trucks, orders and tickets. How you export depends on which product you run and how it was set up: most installs can save list reports to CSV, and some producers have database access through their own server. Ask your Command Alkon administrator what your install can export before you plan the move.

## What imports in one command

Save four list reports as CSV into one folder, named so the file says what it holds:

| File | Becomes | Headings read |
|---|---|---|
| `Customers.csv` | customers | Customer Code, Customer Name, Email, Phone, Credit Hold |
| `Projects.csv` (or Sites, Jobs) | delivery sites | Project Code, Customer Code, Project Name, Address |
| `Mixes.csv` (or Products) | mixes | Mix Code, Description, Strength, Slump, Aggregate Size, Admixtures, Price |
| `Trucks.csv` (or Vehicles) | trucks | Truck Code, Registration, Capacity |

```bash
npm run mix -- import command-alkon ./export --dry-run
npm run mix -- import command-alkon ./export
```

The dry run reads every file and checks every row, then rolls back. A bad row stops the whole import and nothing is written. Running the import again updates names, contacts and prices without duplicating anything.

## When your headings differ

Report headings change between installs. Write a mapping file from our heading to yours:

```json
{ "customers": { "Customer Code": "Acct No", "Customer Name": "Account Name" },
  "mixes": { "Strength": "MPa" } }
```

Then run the import with `--map=mapping.json`. Or ask Claude Code to read your file and write the mapping for you.

## What does not carry over in the free version

- **Order and ticket history.** Past orders, tickets and their times need a mapping to this schema and a check against your invoices. Enterprise DNA does this as part of a switch, or you ask Claude Code to write it for your export.
- **Test results.** Bring them from your laboratory system or QC records, with the lab report references.
- **Pricing rules.** Customer-specific prices, zone and cartage charges, short load and waiting time fees are not modelled here. They are a common first customisation.
- **Batch panel and truck tracking connections.** These are custom work against your plant control system and telematics provider.

## Before you switch

1. Import the lists and compare the counts with Command Alkon.
2. Run a week of orders in parallel and compare dockets and m3.
3. Agree who records arrival, discharge and signatures, and how.
4. Set your plant sampling rates and discharge limit in `/customise`.
5. Point the database at a hosted Postgres with backups before live use.
