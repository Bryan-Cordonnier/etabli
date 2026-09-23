import { load, save } from "$lib/storage";
import type { Tab, View } from "$lib/types";

interface Session {
  views: View[];
  active: number;
}

const HOME: View = { kind: "home" };

const sameView = (a: View, b: View): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Accueil, grille d'un plugin et Paramètres sont des pages de navigation ; une mini-app contient du travail. */
const isNavigation = (view: View): boolean => view.kind !== "app";

class Tabs {
  list = $state<Tab[]>([]);
  activeId = $state(0);
  active = $derived(this.list.find((t) => t.id === this.activeId));

  #nextId = 1;
  #closed: View[] = [];

  constructor() {
    const session = load<Session | null>("session", null);
    const views = session?.views.length ? session.views : [HOME];
    for (const view of views) this.#create(view);
    const restored = this.list[Math.min(session?.active ?? 0, this.list.length - 1)];
    this.activeId = restored?.id ?? 0;
  }

  #create(view: View): Tab {
    this.list.push({ id: this.#nextId++, view, history: [] });
    return this.list[this.list.length - 1]!;
  }

  open(view: View, focus = true): void {
    const tab = this.#create(view);
    if (focus) this.activeId = tab.id;
  }

  activate(id: number): void {
    if (this.list.some((t) => t.id === id)) this.activeId = id;
  }

  close(id: number): void {
    const index = this.list.findIndex((t) => t.id === id);
    if (index < 0) return;
    const [removed] = this.list.splice(index, 1);
    if (removed) this.#closed.push($state.snapshot(removed.view));

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
    // Un document déjà ouvert : on bascule sur son onglet.
    if (view.kind === "app" && view.docId) {
      const open = this.list.find((t) => sameView(t.view, view));
      if (open) {
        this.activeId = open.id;
        return;
      }
    }
    // Un seul onglet Paramètres.
    if (view.kind === "settings") {
      const open = this.list.find((t) => t.view.kind === "settings");
      if (open) {
        if (view.section) open.view = view;
        this.activeId = open.id;
        return;
      }
    }

    const tab = this.active;
    // Ne jamais remplacer un travail en cours : une mini-app ouverte reste dans son onglet.
    if (options.newTab || !tab || !isNavigation(tab.view)) {
      this.open(view);
      return;
    }
    if (sameView(tab.view, view)) return;
    tab.history.push($state.snapshot(tab.view));
    tab.view = view;
  }

  back(): void {
    const tab = this.active;
    const previous = tab?.history.pop();
    if (tab && previous) tab.view = previous;
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
      views: this.list.map((t) => $state.snapshot(t.view)),
      active: Math.max(0, this.list.findIndex((t) => t.id === this.activeId)),
    } satisfies Session);
  }
}

export const tabs = new Tabs();
