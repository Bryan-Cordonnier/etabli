# 29 — Plugins Argent, Mes finances and Travail (DRAFT, to validate before any code)

> **Status: draft** (7 October 2026). Replaces the split of [24](24-spec-plugins-budget.md) into `finances` / `budget` / `paie` / `agenda`
> for the money side. Decisions by Bryan are marked **(Bryan)**. Nothing is coded.

## The four plugins

| Plugin | Visible | Public | Role |
| --- | --- | --- | --- |
| **Argent** | no (service only, `pages: []`) | yes, reused by the ERP | accounts ("coffres") and movements, transfers, balances |
| **Mes finances** | one page | **no, stays private (Bryan)** | estimate of the money, forecast curve, next payments, survival date, quick +/−, recalibration |
| **Travail** | one page with several apps | yes | contracts, agencies, missions, reserve; announces **expected income** |
| **Courses** | one page | to decide | weekly food budget, deducted on the shopping day (later: prices) |
| **Agenda** | (unchanged for now) | to decide | time, missions on the calendar, phone reminders |

Existing code is reused: the register of `finances` becomes Argent, the curve maths of `budget` move into Mes finances, `paie` becomes Travail.

## 1. Argent (service)

- Entities: **account** (name, type, opening balance, archived), **movement** (account, signed amount in cents, date, optional label, free tag, origin plugin,
  `annule` for the cancelled movement), **transfer** (two linked movements between two accounts: neither an expense nor an income).
- **Append-only register (kept):** a movement is never edited or deleted; an error is cancelled by an inverse movement. For the ERP this is also the base of
  the legal immutability of cash records.
- No categories in Argent: each plugin classifies in its own way (private: "groceries"; business: "parts, VAT 20 %").
- Balance at a date, daily series, movements by period, idempotent calls (a replayed call creates no duplicate). Same contract style as today
  (`comptes.*`, `ecritures.*` become `comptes.*`, `mouvements.*`, `virements.*`); a new version of the contract, not a patch.
- Limit: Argent is a **cash ledger, not accounting**. Invoices, VAT and the general ledger are a future ERP plugin on top.

## 2. Mes finances (private, one page)

One page, one layout (`app`): a dashboard.

- **Estimated money now** (sum of the chosen accounts, derived from Argent) with the **accuracy** figure (below).
- **Forecast curve**: how the balance goes up and down day by day and month by month, driven by rent, subscriptions, food allowance, expected income.
- **Next payments**: a scrollable list, by month.
- **Survival date ("jusqu'à quand je tiens")**, computed from today's balance, fixed charges, the food allowance, and the expected income announced by Travail.
  Two scenarios: **with** the planned missions, and **without any new mission** after the last one. The threshold is a **setting** (0 €, or a cushion). Shown
  in days and months, with a colour that says at once whether it is tight.
- **Quick adjustment (Bryan):** one amount field with **+** and **−** buttons (default account, optional label): an incoming transfer, money received for any reason.
- **Recalibrate (Bryan):** the user types the real balance shown by the bank; the plugin records the **difference as an adjustment movement** in Argent.
- **Where charges and income are entered:** a side panel of the same page ("Charges and planned income"), or the plugin's settings page; never a second page.
- Removed from the old dashboard: the expenses-by-category chart.

### Planned payments become real (Bryan)

- **Default: on the day**, a planned payment becomes a real movement in Argent automatically.
- **Option:** instead of acting alone, the plugin sends a **notification on the phone** asking to validate each one (on the PC, an "to confirm" list on the page,
  since reminders exist on the phone only).
- The recalibration catches whatever drifted.

### Accuracy figure (Bryan: "a % of how precise the software is against the real bank accounts")

At each recalibration *i*: `error_i = |real_i − estimated_i|`, `flow_i` = sum of the absolute amounts of the movements recorded since the previous recalibration,
`accuracy_i = max(0, 1 − error_i / flow_i)`. Shown: the **average of ALL the recalibrations since the start** (Bryan): a first recalibration at 98 %, then one at 89 %, gives 93,5 %. A trend arrow compares the last one to the average, and "not measured yet" appears before the first one.
The figure is **published as a value other plugins can read** (`precision`), not just displayed.
Example of one recalibration: 3 000 € of movements and an error of 150 € give 95 %. Dividing by the flow and not by the balance prevents a big balance from hiding errors.
A secondary hint shows the days since the last recalibration.

## 3. Travail (public, one page with apps)

- Contracts: temp work (intérim), fixed-term (CDD), permanent (CDI), reservist.
- **Agencies** with their own settings (hourly rate, meal allowances, travel allowances, weekly advances or monthly pay, pay day). The legal parts (10 % end-of-mission
  bonus, 10 % paid-leave allowance for temp work) come from settings, never hard-coded.
- The main page shows the **current or next mission**, and the apps (contracts, agencies, reserve, payslips) below, as in the original structure.
- Travail **does not write real money into Argent.** It **announces expected income** ("around 10 November, about 1 812 € net"). Mes finances shows it in the curve
  and the survival date, and records the real movement in Argent on pay day, with the amount actually received. Travail therefore works without any private plugin.

## 4. Courses (fifth plugin, Bryan)

Food is **its own plugin**, not a setting of Mes finances. It sets a **weekly budget** (shopping is usually done once a week); on the shopping day the amount is deducted, and the forecast shows it ahead of time.
Later it can look up prices through APIs. It announces its planned spending to Mes finances, like Travail announces income.

## 5. Accounts counted in the forecast (Bryan)

Settable per account: **counted as the money I live on**, counted as a **safety margin** (savings, a future PEA: shown separately and optionally added to the survival date), or **excluded**.
Whether a safety-margin account counts toward survival is a switch the user can flip; both results are shown.

## Still open

1. Agenda: does it keep its own reminders page, or become a service used by the others plus a page of its own (see the explanation given to Bryan)?
2. Names confirmed by Bryan: **Argent**, **Mes finances**, **Travail**, **Courses**.