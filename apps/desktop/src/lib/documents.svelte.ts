// Un calcul ouvert dans une mini-app : chargement, enregistrement automatique, historique
// (cahier des charges, section 7). Utilisé par l'onglet d'une mini-app et par l'aperçu rapide.
import type { DocumentSnapshot, PluginToHost } from "@etabli/sdk/protocol";
import { api, type DocumentMeta } from "./api";
import { stamp } from "./dates";
import type { MiniAppRef } from "./plugins/registry";
import { ui } from "./state/ui.svelte";

const SAVE_DELAY = 1000;

export class DocumentSession {
  meta = $state<DocumentMeta | null>(null);
  title = $state("");
  /** Document transmis à la mini-app à son ouverture ; null tant qu'il n'est pas chargé. */
  initial = $state<DocumentSnapshot | null>(null);
  missing = $state(false);
  history = $state<DocumentMeta[]>([]);

  readonly #ref: MiniAppRef;
  readonly #onCreated: (id: string) => void;
  // Données courantes de la mini-app : pas affichées ici, donc pas besoin de réactivité.
  #data: unknown = null;
  #summary = "";
  #dirty = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #queue: Promise<void> = Promise.resolve();

  constructor(ref: MiniAppRef, onCreated: (id: string) => void = () => {}) {
    this.#ref = ref;
    this.#onCreated = onCreated;
  }

  get pluginId(): string {
    return this.#ref.plugin.id;
  }

  get appId(): string {
    return this.#ref.app.id;
  }

  /** Un nouveau calcul n'est enregistré qu'après une première modification (section 7.2). */
  get hasContent(): boolean {
    return this.meta !== null || this.#data !== null;
  }

  async load(docId?: string): Promise<void> {
    if (docId) {
      try {
        const doc = await api.documentRead(docId);
        this.meta = doc;
        this.title = doc.title;
        this.#summary = doc.summary;
        this.#data = doc.data;
        this.initial = { id: doc.id, title: doc.title, data: doc.data };
      } catch {
        this.missing = true;
      }
    }
    if (!this.initial) {
      this.title = `${this.#ref.app.name} — ${stamp()}`;
      this.initial = { id: null, title: this.title, data: null };
    }
  }

  async refreshHistory(): Promise<void> {
    this.history = await api.documentsList({ pluginId: this.pluginId, appId: this.appId }).catch(() => []);
  }

  /** Messages de la mini-app. Renvoie false pour ceux que l'appelant doit traiter (raccourcis). */
  handle(message: PluginToHost): boolean {
    switch (message.type) {
      case "update":
        this.#data = message.data;
        this.scheduleSave();
        return true;
      case "summary":
        this.#summary = message.summary;
        if (this.hasContent) this.scheduleSave();
        return true;
      case "title":
        this.title = message.title;
        if (this.hasContent) this.scheduleSave();
        return true;
      case "notify":
        ui.notify(message.text);
        return true;
      case "copy":
        navigator.clipboard.writeText(message.text).then(
          () => ui.notify(`Copié : ${message.text}`),
          () => ui.notify("Copie impossible"),
        );
        return true;
      default:
        return false;
    }
  }

  /** Titre modifié par l'utilisateur. */
  rename(title: string): void {
    this.title = title;
    if (this.hasContent) this.scheduleSave();
  }

  scheduleSave(): void {
    this.#dirty = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.saveNow(), SAVE_DELAY);
  }

  /** Les enregistrements passent l'un après l'autre : un nouveau calcul n'est jamais créé deux fois. */
  saveNow(): Promise<void> {
    clearTimeout(this.#timer);
    this.#queue = this.#queue.then(() => this.#write());
    return this.#queue;
  }

  async #write(): Promise<void> {
    if (!this.#dirty) return;
    this.#dirty = false;
    try {
      const saved = await api.documentSave({
        id: this.meta?.id,
        pluginId: this.pluginId,
        appId: this.appId,
        dataVersion: this.#ref.app.dataVersion,
        title: this.title.trim() || `${this.#ref.app.name} — ${stamp()}`,
        summary: this.#summary,
        data: this.#data,
      });
      const created = this.meta === null;
      this.meta = saved;
      if (created) this.#onCreated(saved.id);
      await this.refreshHistory();
    } catch (err) {
      this.#dirty = true;
      ui.notify(`Enregistrement impossible : ${err}`);
    }
  }

  /** Copie du calcul ; renvoie l'identifiant de la copie. */
  async duplicate(): Promise<string | null> {
    await this.saveNow();
    if (!this.meta) return null;
    const copy = await api.documentSave({
      pluginId: this.pluginId,
      appId: this.appId,
      dataVersion: this.#ref.app.dataVersion,
      title: `${this.title} (copie)`,
      summary: this.#summary,
      data: this.#data,
    });
    return copy.id;
  }

  /** Déplace le calcul dans la corbeille du dossier de travail. */
  async remove(): Promise<void> {
    if (!this.meta) return;
    clearTimeout(this.#timer);
    this.#dirty = false;
    await this.#queue;
    await api.documentDelete(this.meta.id);
  }

  /** À appeler en quittant l'écran : enregistre ce qui ne l'a pas encore été. */
  dispose(): void {
    if (this.#dirty) void this.saveNow();
  }
}
