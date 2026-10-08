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
- **An agency is only a name and a contribution rate** (Bryan). The hourly rate, meal and travel allowances belong to each **mission**, since they change with every client. The pay rhythm (monthly or weekly) is the only other agency field kept so far, to be confirmed. The legal parts (10 % end-of-mission
  bonus, 10 % paid-leave allowance for temp work) come from the plugin's settings, never hard-coded.
- **Only signed contracts** are entered; their status is automatic: *planned*, *in progress*, *finished* (never "proposed").
- **Mockup validated in principle (Bryan, 8 October 2026):** two light blocks on top (current mission with a "days done / days total" gauge, the weekly hours in big figures with an hours/minutes spinner and a "+" to add extra time any number of times, the next pay date; next mission with "in N days" and its dates), then **one tab per contract type** (Interim, Reserve, CDD, CDI). Each tab shows the last three missions and "See all" opens the full history in a centred window over a fade veil, like the quick preview (never full screen). Each finished mission takes a **payslip** (amount received, optional PDF); the gap with the estimate feeds the **average accuracy**, which the recalibration of Mes finances reuses. Agencies are managed inside the Interim tab. Settings live in the engine's real Settings page, in a tab declared by the plugin.
- Open: does the reserve have its own payslip or a line on the agency one (searches found nothing certain)?
- Travail **does not write real money into Argent.** It **announces expected income** ("around 10 November, about 1 812 € net"). Mes finances shows it in the curve
  and the survival date, and records the real movement in Argent on pay day, with the amount actually received. Travail therefore works without any private plugin.

## 4. Courses (fifth plugin, Bryan)

Food is **its own plugin**, not a setting of Mes finances. It sets a **weekly budget** (shopping is usually done once a week); on the shopping day the amount is deducted, and the forecast shows it ahead of time.
Later it can look up prices through APIs. It announces its planned spending to Mes finances, like Travail announces income.

**Two pages (Bryan, mockup validated in principle):**

- **Courses** (dashboard): remaining weekly budget with a gauge, quick ticket entry, next shopping day; below, the weeks (last four plus the current one) on the left and the tickets on the right. Full ticket history opens in a centred window over a fade veil.
- **Shopping list**: a memo, one list per trip. A list can be created, edited and consulted (to shop with it) until it is **settled**. "Settle the trip" asks for the amount paid and the shop, then locks the list for good (no edit, history only) and adds the ticket to the week's budget.

**Later, not to be coded now (Bryan's ideas):**

1. **Receipt photo when settling.** The receipt is read; every price is kept in a local database with the exact brand and product. With it: cheapest-item estimates and a price per shop.
2. **AI-built shopping list.** From loose wishes, the number of meals in the week and the days with more guests, it optimises the list within the budget: picks a shop, picks dishes (searching the internet), and adds the list itself.

Both need the price database first; the data model of a settled list should therefore keep the article names as typed, so that a receipt can be matched to them later. Network access for the AI is an open question (the sandbox forbids it for plugins today, so it goes through an engine service).

## 4 bis. Calendar (validated mockup, Bryan, 8 October 2026)

Rename of the *agenda* plugin's page. Main layout: **a month of round days on the left (about two thirds)** and **the selected day on the right**, both the same height.

- **Month:** the month name between two arrows, centred. Each day is a round with its number, a border on today, and a **colour per contract type** (interim, reserve/army, CDD, CDI). Only the types present are listed in the legend. No "today" label.
- **Day:** a vertical strip from the **wake-up time to the estimated bedtime**, a name beside each block: preparation, trip, work, return trip, free time. Work shows the **contract's working time** (never computed from the strip, since the break would be counted). Arrows change the day.
- **Events:** the "+ Event" button creates **ordinary events only** (a name, an address, hours, optional repeat); **contracts come from Travail**. The address is looked up and the outward and return trip times are computed. **If an event starts soon after another** (gap under a setting, 90 min by default), the strip shows one **direct trip** and no return home.
- **Sleep:** a GitHub-style grid (green respects the target, red does not), the **average** in big figures, a "I am going to sleep now" button that sets the bedtime.
- **Trip:** a small square block with **two buttons only**, "I have left" and "I have arrived". The software works out which trip is meant from the time and from what was already noted, and **refuses** "arrived" when you are meant to leave, "left" when already left or when the next trip is more than an hour away. Real times are kept, to adjust the trip estimates and the arrival margin.
- Legal rest (48 h per week, 10 h per day, 11 h between two days) is a discreet line at the bottom.
- **Later:** live traffic (refreshed about every 3 minutes from the wake-up time, through an API reached by an engine service, since plugins have no network) to compute the departure time automatically. Providers to compare (price, limits) before any code.
- Open: where to edit or delete an event (a click on its block in the strip?).

## 5. Accounts (Bryan)

- **As many accounts as the user wants**, each with a **role**: *I live on it* (counts in "Argent actuel" and in the survival date), *safety money* (an account I could use in case of need:
  savings, a future PEA; counts in the survival date), or *outside the calculation* (cash, a business account...). The role is changed at any time in the plugin's settings.
- "Argent actuel" is the sum of the *I live on* accounts; "Tenu" counts *I live on* + *safety*; the curve states which accounts it counts.
- **Quick +/− and recalibration apply to the first *I live on* account** (the main one); a transfer moves money between any two accounts.
- **Linked accounts (later, Bryan):** an account that **comes from another application**, typically the **business account** of the ERP: money that Bryan pays himself (a salary
  from the company, seen as expected income) or money he sends there to invest. Requirements to settle before building: it must be **secure and consented**
  (explicit link, read-only by default, each direction of money an explicit transfer); and it is a **cross-application** link, so it needs the server and its organisations (two separate
  apps cannot share plugin services). Until then, a business account can simply be an ordinary account entered by hand, with the role *outside the calculation*.

## 6. The forecast curve stops 30 days after the break point (decision taken for Bryan)

The red part after the break point is kept for 30 days only: beyond that the figures are money that will not exist, and they squash the scale of the useful part.

## Still open

1. Agenda: does it keep its own reminders page, or become a service used by the others plus a page of its own (see the explanation given to Bryan)?
2. Names confirmed by Bryan: **Argent**, **Mes finances**, **Travail**, **Courses**.