# Record checks for concrete producers

Sources checked 31 October 2026. This system checks your own records against the rules below and lists what is missing, late or out of line. It does not certify concrete, replace your plant engineer, your laboratory or your audit, or decide whether a result is acceptable under a contract.

## The standards

[NZS 3104:2021 Specification for concrete production](https://codehub.building.govt.nz/resources/nzs-31042021) sets "the minimum requirements for the production of fresh concrete" in New Zealand, including the sampling and testing a plant runs to show its concrete meets the specified strength. [The Plant Audit Scheme](https://rmcplantaudit.org.nz/) audits the quality systems of Concrete NZ member ready mixed plants against NZS 3104:2021.

[AS 1379:2026 Specification and supply of concrete](https://store.standards.org.au/product/as-1379-2026), published in May 2026 and replacing [AS 1379-2007](https://store.standards.org.au/product/as-1379-2007), is the Australian supply standard. It covers the production and delivery of plastic concrete, sampling, testing and compliance, and the identification certificate that travels with each load, commonly called the delivery docket.

Both standards are sold documents. The thresholds below are defaults in this system, set so the demo has something to check. Read them against your purchased copy, your audit scheme and your customer contracts, then set them with `/customise`.

## Implemented checks

| Rule | What it finds | Default | Basis |
|---|---|---|---|
| TEST-FREQUENCY | A plant with fewer samples in the last 90 days than its production needs | One sample per 75 m3, set per plant in `plants.test_every_m3` | NZS 3104 sampling frequency, as audited under the Concrete NZ scheme. Set your plant's own rate. |
| RESULT-OVERDUE | A sample with no 28 day result more than two days after it fell due | 28 days from sampling, two days grace | Strength is specified at 28 days. The grace period is a house rule. |
| STRENGTH-BELOW-GRADE | A 28 day result below the mix's specified grade | Any single result under grade | A flag for the plant engineer, not a compliance verdict. Both standards assess strength statistically over a run of results. |
| DOCKET-INCOMPLETE | A docket more than a day old missing arrival time, discharge time or a site signature | Arrival, discharge and signature | The AS 1379 identification certificate; your own proof of delivery. |
| DISCHARGE-TIME | Discharge finished more than 90 minutes after batching | 90 minutes | A common supply limit. Many specifications set a shorter one in hot weather or allow longer with a retarder. Set yours. |
| WATER-ADDED | Water added on site with no signature to accept it | Any water with no signature | House rule: water added changes the concrete, so someone on site accepts it in writing. |
| PLANT-AUDIT-REF | A plant with no audit or certification reference | Missing reference | Operator checklist. It does not check that the audit is current. |

`/low-strength` also lists results within 3 MPa of grade, so a mix drifting down is seen before it fails. `/mix-performance` shows the mean and lowest 28 day result for each mix.

## What it does not do

- It does not run the statistical compliance assessment either standard sets out. Your plant engineer does that from the results this system holds.
- It does not check that a docket carries every field your standard requires. `npm run docs` prints a docket from the fields held here; compare it with the standard before using it as your delivery record.
- It does not hold laboratory reports. Each result carries the lab report reference; keep the reports themselves.
- It does not lodge anything with an audit scheme. `/plant-quality` drafts the review your engineer reads before the quarterly report.
