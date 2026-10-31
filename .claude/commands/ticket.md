---
description: Batch a load: print the docket for one truck
---

Run `npm run mix -- ticket <order> --truck=<code> --m3=<load> [--at=HH:MM] [--water=litres]`. Only a confirmed order for a customer off credit hold can be ticketed. A load past the ordered volume needs the site to confirm the extra, then `--extra`. Read the docket number back.

Ambiguous names list the candidates and stop: ask which one. Never send anything; drafts stay in `drafts/`.
