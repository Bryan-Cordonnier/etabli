# 28 — Pages and the application shell (DRAFT, to validate before any code)

> **Status: draft.** Written on 7 October 2026 from Bryan's feedback after installing Quotidien (first distribution). Nothing here is coded.
> Decisions marked **(Bryan)** are firm; the rest is a proposal. Open questions are at the end.

## Why

The engine's shell was designed for Établi, a toolbox of small calculators: the sidebar lists **plugins**, a plugin page lists its **mini-apps**
as cards, and every mini-app is wrapped in a "calculation" (a dated title, *New / Export / Duplicate / Delete*, a history of "old calculations").
That is wrong for an application such as Quotidien or the ERP, where opening a tab should show the thing itself (the budget curve, the
ledger, the calendar), and where "a calculation" does not exist.

## 1. Plugins declare pages (Bryan)

- A plugin's manifest declares **`pages`**. What the sidebar lists are **pages**, not plugins.
- **No compatibility mode (Bryan):** a plugin without `pages` is a plugin error. It is refused by `npm run valider` and by the engine
  when it loads; nothing tries to display it "the old way". A plugin that only offers a service declares `pages: []` explicitly.
  This is a new contract version (`apiVersion` `^3`); `miniApps` becomes `apps`, the list of mini-apps a page can show.
- A page has an `id`, a `title`, an `icon` and a **layout** that says which of the plugin's apps it shows and how:

```json
{
  "apps": [{ "id": "courbe", "name": "Courbe du mois", "entry": "apps/courbe/index.html" },
           { "id": "previsions", "name": "Prévisions", "entry": "apps/previsions/index.html" }],
  "pages": [
    { "id": "mois", "title": "Ce mois-ci", "icon": "chart", "layout": { "type": "app", "app": "courbe" } },
    { "id": "plan", "title": "Plan", "icon": "calendar", "layout": { "type": "columns", "apps": ["previsions", "courbe"] } }
  ]
}
```

- Layouts (first version): `app` (one app, full area), `columns` (apps side by side, widths in the layout), `tabs` (apps as tabs inside the
  page), `stack` (apps one under the other). Nothing else until a real page needs it.
- A page opened in the engine is a **tab** (the tab bar stays); opening a page twice focuses the existing tab.

## 2. Order and grouping (Bryan)

- The user **moves pages** in the sidebar to the order they want (drag and drop, as plugins are moved today); the order is saved in the
  settings. A page that is new to the user appears at the end of its plugin's group, in the order the plugin declared.
- The distribution only provides the default order (the order of its plugins and of their pages); it does not impose one.

## 3. The shell no longer knows "calculations" (Bryan)

What belongs to the **plugin**, not to the engine: a document title, *New / Duplicate / Export / Delete*, the history of past documents,
"recent documents", search inside a plugin's documents.

- The engine keeps **storage**: documents and plugin data, through the SDK. It displays **no** chrome around a page.
- An app that works with several documents (a future calculator, a procedure form) builds its own *New / Duplicate / History* with SDK
  calls (list, open, create, duplicate, delete documents of this app) and the UI kit's components.
- An app that does not need documents (calendar, ledger, budget) declares `"documents": false`: the engine creates none (today it creates a
  "Tableau de bord — 07/10 19:31" document just by opening the page).
- Engine-level features tied to the old model become **optional, set by the distribution**: favourites, home page with recent documents,
  quick preview window. A distribution turns on only what it uses.

## 4. The home page is a board of widgets (Bryan)

- The home page stays, and it is **fully editable**: a grid of **widgets** that the user adds, removes, moves and resizes (an *Edit* mode,
  as on a phone's home screen). The layout is saved in the settings.
- **Built-in widgets** (provided by the engine, only if the distribution turns them on): *favourite pages* (the old favourite mini-apps),
  *recently opened* (the old "recent calculations", for the plugins that have documents).
- **Plugins declare widgets** in the manifest, next to `apps` and `pages`: a title, an icon, an entry page, and the **sizes** it supports
  (in grid cells, for example `1x1`, `2x1`, `2x2`, `4x2`, with a default). The user picks among the declared sizes; the widget is told its
  size and redraws. Examples: *salary over the months* (payroll), *this month's curve* (budget), *next events* (agenda), *stock under the
  threshold* or *margin this quarter* (ERP).
- A widget is a small **sandboxed frame**, exactly like a mini-app (same isolation, same SDK, same permissions, same services: it reads what
  its plugin and the plugins it depends on publish, and updates live). It is **read-only by default**: it shows, and a click opens the
  related **page**; actions that change data stay in pages.
- A **distribution** gives the **default layout** (which widgets, where). The user's changes win and are kept.
- A phone shows the same board as a single column of widgets, which is why this model is also the base of the Android interface.
## 5. Consequences in the code (for the estimate, not yet done)

Manifest and validator (`apiVersion ^3`, `pages`, `apps`, `widgets`, `documents`), SDK types and a documents API, `registry` (pages), sidebar and tab views
(`page` replaces `plugin` and `app`), a page component with the four layouts, the home board (grid, edit mode, widget frames, built-in widgets, saved layout), command palette (search pages), settings (`pluginOrder` becomes
`pageOrder`), removal of the document header from the shell, migration of the four plugins, tests and docs 06/07/19.

## Decisions taken on 7 October 2026 (Bryan)

- Home: kept, as an editable **board of widgets** (section 4).
- Several apps on one page share the plugin's data as today, with no direct app-to-app channel.
- No engine title bar: each page draws its own header with the UI kit.
- The phone interface reorganises pages and the widget board; it is designed separately, with mock-ups, after the Windows application.

## Still open

1. **Widget grid**: fixed columns (for example 4 on a wide window, fewer on a narrow one) with free vertical growth? Proposal: yes.
2. **Widgets of the engine**: only *favourite pages* and *recently opened* at first, or also a clock/date and free notes? Proposal: the two first.
3. **Where is the board edited**: a pencil button on the home page, with an *Add widget* gallery listing every installed plugin's widgets.