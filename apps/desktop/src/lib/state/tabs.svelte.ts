import { distribution } from "$lib/distribution";
import { load, save } from "$lib/storage";
import type { Tab, View } from "$lib/types";
import { ui } from "./ui.svelte";

interface Session {
  views: View[];
  active: number;
}

const HOME: View = { kind: "home" };

/**
 * Une page de réglages de plugin peut recevoir une intention (« add=scie ») : elle n'est jamais
 * enregistrée, ni dans la session ni dans l'historique, pour ne pas être rejouée en revenant sur la page.
 */
function withoutHash(view: View): View {
  if (view.kind !== "settings" || view.hash === undefined) return view;
  const { hash: _hash, nonce: _nonce, ...rest } = view;
  return rest;
}

/** Même page, sans tenir compte du `nonce` (voir types.ts). */
function sameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "home":
    case "plugins":
      return true;
    case "settings":
      return b.kind === "settings" && a.section === b.section;
    case "page":
      return b.kind === "page" && a.pluginId === b.pluginId && a.pageId === b.pageId;
  }
}

let nonce = Date.now();

/** Chaque ouverture d'une page de plugin (ou d'une page de réglages avec intention) reçoit un nouveau `nonce` : l'écran est recréé. */
const fresh = (view: View): View =>
  view.kind === "page" || (view.kind === "settings" && view.hash !== undefined) ? { ...view, nonce: ++nonce } : view;

class Tabs {
  list = $state<Tab[]>([]);
  activeId = $state(0);
  active = $derived(this.list.find((t) => t.id === this.activeId));

  #nextId = 1;
  #closed: View[] = [];

  constructor() {
    const session = load<Session | null>("session", null);
    // Une session enregistrée par une version qui avait un catalogue rouvre la page des plugins.
    // Une session enregistrée par une version plus ancienne (catalogue, plugin, app) rouvre une page qui existe aujourd'hui.
    const ancien = (v: View): View => {
      const kind = v.kind as string;
      return kind === "catalogue" ? { kind: "plugins" } : kind === "plugin" || kind === "app" ? HOME : v;
    };
    let views = session?.views.length ? session.views.map(ancien) : [HOME];
    // Sans onglets : une seule page à la fois, celle qui était active.
    if (!distribution.tabs) views = [views[Math.min(session?.active ?? 0, views.length - 1)] ?? HOME];
    for (const view of views) this.#create(fresh(view));
    const restored = this.list[Math.min(session?.active ?? 0, this.list.length - 1)];
    this.activeId = restored?.id ?? 0;
  }

  #create(view: View): Tab {
    this.list.push({ id: this.#nextId++, view, history: [] });
    return this.list[this.list.length - 1]!;
  }

  /** Ouvre un nouvel onglet ; renvoie son identifiant. */
  open(view: View, focus = true): number {
    // Sans onglets, « ouvrir » remplace la page affichée.
    if (!distribution.tabs && this.list.length > 0) {
      this.navigate(view);
      return this.activeId;
    }
    const tab = this.#create(fresh(view));
    if (focus) this.activeId = tab.id;
    return tab.id;
  }

  /** Bouton « + » et raccourci « Nouvel onglet » : comme un navigateur, un onglet neuf, prêt pour la recherche. */
  newTab(): void {
    ui.focusSearch = true;
    this.open(HOME);
  }

  activate(id: number): void {
    if (this.list.some((t) => t.id === id)) this.activeId = id;
  }

  close(id: number): void {
    const index = this.list.findIndex((t) => t.id === id);
    if (index < 0) return;
    const [removed] = this.list.splice(index, 1);
    if (removed) this.#closed.push(withoutHash($state.snapshot(removed.view)));

    if (this.list.length === 0) {
      this.open(HOME);
      return;
    }
    // Comme un navigateur : on active l'onglet de droite, sinon celui de gauche.
    if (this.activeId === id) this.activeId = this.list[Math.min(index, this.list.length - 1)]!.id;
  }

  reopenClosed(): void {
    const view = this.#closed.pop();
    if (view) this.open(view);
  }

  /** Règles de navigation du cahier des charges (section 5.7). */
  navigate(view: View, options: { newTab?: boolean } = {}): void {
    // Une page de plugin déjà ouverte : on bascule sur son onglet.
    if (view.kind === "page") {
      const open = this.list.find((t) => sameView(t.view, view));
      if (open) {
        this.activeId = open.id;
        return;
      }
    }
    // Un seul onglet Paramètres, un seul onglet Plugins.
    if (view.kind === "settings" || view.kind === "plugins") {
      const open = this.list.find((t) => t.view.kind === view.kind);
      if (open) {
        if (view.kind === "settings" && view.section) open.view = fresh(view);
        this.activeId = open.id;
        return;
      }
    }

    const tab = this.active;
    // Une page enregistre ses données au fil de l'eau : changer de page dans l'onglet ne perd rien.
    if ((options.newTab && distribution.tabs) || !tab) {
      this.open(view);
      return;
    }
    if (sameView(tab.view, view)) return;
    tab.history.push(withoutHash($state.snapshot(tab.view)));
    tab.view = fresh(view);
  }

  back(): void {
    const tab = this.active;
    const previous = tab?.history.pop();
    if (tab && previous) tab.view = fresh(previous);
  }

  cycle(delta: number): void {
    const count = this.list.length;
    const index = this.list.findIndex((t) => t.id === this.activeId);
    const next = this.list[(index + delta + count) % count];
    if (next) this.activeId = next.id;
  }

  /** Ctrl+1 à Ctrl+8 : onglet n ; Ctrl+9 : dernier onglet, comme dans un navigateur. */
  goTo(position: number): void {
    const tab = position >= 9 ? this.list[this.list.length - 1] : this.list[position - 1];
    if (tab) this.activeId = tab.id;
  }

  move(id: number, toIndex: number): void {
    const from = this.list.findIndex((t) => t.id === id);
    if (from < 0 || from === toIndex) return;
    const [tab] = this.list.splice(from, 1);
    if (tab) this.list.splice(toIndex, 0, $state.snapshot(tab));
  }

  /** Mémorise les onglets ouverts pour les restaurer au prochain démarrage. */
  persist(): void {
    save("session", {
      views: this.list.map((t) => withoutHash($state.snapshot(t.view))),
      active: Math.max(0, this.list.findIndex((t) => t.id === this.activeId)),
    } satisfies Session);
  }
}

export const tabs = new Tabs();
