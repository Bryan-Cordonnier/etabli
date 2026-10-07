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

## 4. Consequences in the code (for the estimate, not yet done)

Manifest and validator (`apiVersion ^3`, `pages`, `apps`, `documents`), SDK types and a documents API, `registry` (pages), sidebar and tab views
(`page` replaces `plugin` and `app`), a page component with the four layouts, command palette (search pages), settings (`pluginOrder` becomes
`pageOrder`), removal of the document header from the shell, migration of the four plugins, tests and docs 06/07/19.

## Open questions

1. **Home.** Is there still a home page? Proposal: no home in the engine; the first page of the sidebar opens at start-up (a distribution may
   declare a start page).
2. **Several apps on one page.** Do they share the page's data (one `pluginData`, as today) or can they talk to each other? Proposal: same
   rules as today (shared plugin data, services between plugins); no direct app-to-app channel.
3. **Page title bar.** Does the engine show a thin bar with the page title and the plugin colour, or nothing at all? Proposal: nothing; the page
   draws its own header with the UI kit.
4. **Mobile.** Pages are the unit the phone interface will reorganise (bottom navigation, one page at a time). That interface is designed
   separately, with mock-ups, after the Windows application.