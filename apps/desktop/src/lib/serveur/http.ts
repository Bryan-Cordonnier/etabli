// Client HTTP de l'API du serveur Établi (docs/17). Aucune dépendance à l'interface : testable avec un faux `fetch`.

/** Réponse d'erreur du serveur (code HTTP + phrase en français). */
export class ErreurApi extends Error {
  constructor(
    readonly statut: number,
    message: string,
    /** Pour un conflit (409) : la version actuelle du calcul sur le serveur. */
    readonly versionActuelle?: number,
    /** Pour un blocage (429) : secondes à attendre. */
    readonly retryApres?: number,
  ) {
    super(message);
    this.name = "ErreurApi";
  }
}

/** Le serveur est injoignable (hors ligne, coupure, délai dépassé). */
export class ErreurReseau extends Error {
  constructor(message = "Le serveur est injoignable.") {
    super(message);
    this.name = "ErreurReseau";
  }
}

export interface OptionsClient {
  /** Adresse du serveur sans « / » final ; vide = même origine que la page. */
  base: string;
  jeton?: string;
  fetch?: typeof fetch;
  /** Délai maximal d'une requête, en millisecondes. */
  delai?: number;
}

export type Corps = unknown | Uint8Array | Blob;

export class ClientApi {
  readonly base: string;
  jeton: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #delai: number;

  constructor(options: OptionsClient) {
    this.base = options.base.replace(/\/+$/, "");
    this.jeton = options.jeton;
    this.#fetch = options.fetch ?? ((...args) => fetch(...args));
    this.#delai = options.delai ?? 15_000;
  }

  /** Requête JSON. Renvoie `undefined` pour une réponse vide (204). */
  async requete<T = unknown>(methode: string, chemin: string, corps?: Corps): Promise<T> {
    const reponse = await this.envoyer(methode, chemin, corps);
    if (reponse.status === 204) return undefined as T;
    const texte = await reponse.text();
    if (!texte) return undefined as T;
    try {
      return JSON.parse(texte) as T;
    } catch {
      throw new ErreurApi(reponse.status, "Réponse inattendue du serveur.");
    }
  }

  /** Requête dont la réponse est un fichier (export de la base). */
  async fichier(methode: string, chemin: string): Promise<Blob> {
    return (await this.envoyer(methode, chemin)).blob();
  }

  private async envoyer(methode: string, chemin: string, corps?: Corps): Promise<Response> {
    const en_tetes: Record<string, string> = {};
    if (this.jeton) en_tetes.Authorization = `Bearer ${this.jeton}`;
    let body: BodyInit | undefined;
    if (corps instanceof Uint8Array || (typeof Blob !== "undefined" && corps instanceof Blob)) {
      en_tetes["Content-Type"] = "application/octet-stream";
      body = corps as BodyInit;
    } else if (corps !== undefined) {
      en_tetes["Content-Type"] = "application/json";
      body = JSON.stringify(corps);
    }
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), this.#delai);
    let reponse: Response;
    try {
      reponse = await this.#fetch(`${this.base}${chemin}`, { method: methode, headers: en_tetes, body, signal: arret.signal });
    } catch {
      throw new ErreurReseau();
    } finally {
      clearTimeout(minuteur);
    }
    if (reponse.ok) return reponse;
    let message = `Erreur du serveur (${reponse.status}).`;
    let versionActuelle: number | undefined;
    try {
      const donnees = (await reponse.json()) as { erreur?: string; versionActuelle?: number };
      if (typeof donnees.erreur === "string") message = donnees.erreur;
      if (typeof donnees.versionActuelle === "number") versionActuelle = donnees.versionActuelle;
    } catch {
      // Réponse sans corps JSON (proxy, page d'erreur) : on garde le message générique.
    }
    // 502/503/504 : le proxy répond à la place d'un serveur éteint, ce qui équivaut à « injoignable ».
    if ([502, 503, 504].includes(reponse.status)) throw new ErreurReseau(message);
    const retry = Number(reponse.headers.get("retry-after"));
    throw new ErreurApi(reponse.status, message, versionActuelle, Number.isFinite(retry) && retry > 0 ? retry : undefined);
  }
}

/** Vrai si l'erreur signifie « pas de réseau » plutôt que « le serveur a refusé ». */
export const estHorsLigne = (e: unknown): e is ErreurReseau => e instanceof ErreurReseau;
