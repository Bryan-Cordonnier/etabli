// Routage des appels de fonctions entre plugins (docs/24, A.1.2). Un plugin demande « la fonction X du service Y de
// l'autre plugin, avec ces arguments » ; ce module décide si c'est permis, met l'appel en file chez le fournisseur,
// et rend toujours une réponse typée. Aucune exception ne sort d'ici : un plugin absent ou lent n'est jamais une panne.
//
// Module pur (pas de Svelte, pas de DOM) : le chargement du cadre invisible du fournisseur est fourni par
// `EnvAppels.executer` (voir state/appels.svelte.ts), ce qui permet de tester tout le routage sans navigateur.
import { satisfies } from "@etabli/sdk/deps";
import {
  SERVICE_TIMEOUT_DEFAULT_MS,
  SERVICE_TIMEOUT_MAX_MS,
  SERVICE_TIMEOUT_MIN_MS,
  type ServiceErrorCode,
  type ServiceResult,
} from "@etabli/sdk/protocol";
import { LIMITES } from "./garde";
import { estStrict, permissionAppel } from "./permissions";

/** Ce que le routage lit d'un manifeste (sous-ensemble de `PluginManifest`). */
export interface PluginAppel {
  id: string;
  apiVersion: string;
  permissions: readonly string[];
  dependencies: Readonly<Record<string, string>>;
  optionalDependencies: Readonly<Record<string, string>>;
  provides: Readonly<Record<string, string>>;
  /** Plages de version de contrat que ce plugin accepte, par service. */
  services: Readonly<Record<string, string>>;
  serviceEntry: string | null;
  functions: Readonly<Record<string, Readonly<Record<string, "lecture" | "ecriture">>>>;
}

/** Appel prêt à être exécuté chez le fournisseur : tout y est écrit par le moteur. */
export interface Invocation {
  /** Identifiant propre au moteur (jamais celui choisi par l'appelant). */
  id: string;
  fournisseur: string;
  /** Page `serviceEntry` du fournisseur. */
  entree: string;
  service: string;
  fn: string;
  args: unknown;
  /** Identité de l'appelant, imposée par le moteur. */
  appelant: string;
}

export interface EnvAppels {
  plugins(): readonly PluginAppel[];
  /** Installé ET activé. */
  actif(pluginId: string): boolean;
  /**
   * Charge la page `serviceEntry` du fournisseur dans un cadre invisible isolé, lui transmet l'appel, rend sa réponse
   * et ferme le cadre. Doit rendre la main au plus tard après `delaiMs` (`delai_depasse`) ; ne doit pas jeter.
   */
  executer(invocation: Invocation, delaiMs: number): Promise<ServiceResult>;
  /** Horloge, remplaçable dans les tests. */
  maintenant?(): number;
}

export interface LimitesAppels {
  /** Appels en attente ou en cours chez un même fournisseur. */
  parFournisseur: number;
  /** Appels en attente ou en cours pour un même appelant, tous fournisseurs confondus. */
  parAppelant: number;
}

export const LIMITES_APPELS: LimitesAppels = { parFournisseur: 20, parAppelant: 8 };

/** Un appel déjà contrôlé par le garde (forme, taille). */
export interface DemandeAppel {
  service: string;
  fn: string;
  args: unknown;
  timeoutMs?: number;
}

const erreur = (code: ServiceErrorCode, message: string): ServiceResult => ({ ok: false, code, message });
const possede = (objet: object | undefined, cle: string): boolean => objet !== undefined && Object.hasOwn(objet, cle);

interface Tache {
  invocation: Invocation;
  echeance: number;
  resolve: (r: ServiceResult) => void;
  commencee: boolean;
  minuteur: ReturnType<typeof setTimeout>;
}

interface File {
  actif: boolean;
  attente: Tache[];
}

export class RouteurAppels {
  #env: EnvAppels;
  #limites: LimitesAppels;
  #files = new Map<string, File>();
  #parAppelant = new Map<string, number>();
  #compteur = 0;

  constructor(env: EnvAppels, limites: LimitesAppels = LIMITES_APPELS) {
    this.#env = env;
    this.#limites = limites;
  }

  /** Appels en attente ou en cours chez un fournisseur (pour les réglages et les tests). */
  enAttente(fournisseur: string): number {
    const f = this.#files.get(fournisseur);
    return f ? f.attente.length + (f.actif ? 1 : 0) : 0;
  }

  /**
   * Route un appel. `appelant` est l'identité du cadre qui a envoyé le message, connue de l'hôte : elle ne vient jamais du
   * contenu du message. `depuisService` : l'appel vient du cadre `serviceEntry` d'un fournisseur (profondeur 1 : refusé).
   */
  async appeler(appelant: string, demande: DemandeAppel, options: { depuisService?: boolean } = {}): Promise<ServiceResult> {
    try {
      return await this.#router(appelant, demande, options.depuisService === true);
    } catch {
      return erreur("erreur", "Appel impossible.");
    }
  }

  #router(appelantId: string, d: DemandeAppel, depuisService: boolean): Promise<ServiceResult> {
    const maintenant = this.#env.maintenant ?? Date.now;
    if (depuisService) {
      return Promise.resolve(erreur("profondeur_max", "Un fournisseur ne peut pas appeler un autre service pendant qu'il répond à un appel."));
    }
    const plugins = this.#env.plugins();
    const appelant = plugins.find((p) => p.id === appelantId);
    if (!appelant || !this.#env.actif(appelantId)) return Promise.resolve(erreur("permission_refusee", "Plugin appelant inconnu ou désactivé."));
    if (!estStrict(appelant.apiVersion)) return Promise.resolve(erreur("permission_refusee", "Les appels de service sont réservés aux plugins de contrat ^2."));

    // 1. Permission : le plugin a-t-il déclaré vouloir appeler CE service ? (avant tout, pour ne rien révéler de ce qui est installé)
    const acces = new Set(appelant.permissions.map(permissionAppel).filter((p) => p?.service === d.service).map((p) => p!.acces));
    if (acces.size === 0) return Promise.resolve(erreur("permission_refusee", `Permission « appelle:${d.service}:… » non déclarée.`));

    // 2. Fournisseur : un plugin dont l'appelant dépend (obligatoirement ou non) et qui publie ce service.
    const candidats = plugins.filter((p) => p.id !== appelantId && possede(p.provides, d.service));
    const declares = candidats.filter((p) => possede(appelant.dependencies, p.id) || possede(appelant.optionalDependencies, p.id));
    if (declares.length === 0) {
      return Promise.resolve(
        candidats.length > 0
          ? erreur("permission_refusee", `Déclarez le plugin qui offre « ${d.service} » dans dependencies ou optionalDependencies.`)
          : erreur("service_absent", `Le service « ${d.service} » n'est offert par aucun plugin installé.`),
      );
    }
    const fournisseur = declares.find((p) => this.#env.actif(p.id));
    if (!fournisseur) return Promise.resolve(erreur("service_absent", `Le plugin qui offre « ${d.service} » est désactivé.`));

    // 3. Version du CONTRAT (pas celle du plugin).
    if (!possede(appelant.services, d.service)) {
      return Promise.resolve(erreur("contrat_incompatible", `Déclarez la plage de contrat de « ${d.service} » dans « services » du manifeste.`));
    }
    const contrat = fournisseur.provides[d.service]!;
    const plage = appelant.services[d.service]!;
    if (!satisfies(contrat, plage)) {
      return Promise.resolve(erreur("contrat_incompatible", `Contrat « ${d.service} » en version ${contrat}, ${plage} attendu : mettez à jour le plus ancien des deux plugins.`));
    }

    // 4. Fonction déclarée par le fournisseur, et accès permis à l'appelant.
    const declaree = possede(fournisseur.functions, d.service) ? fournisseur.functions[d.service] : undefined;
    if (!declaree || !possede(declaree, d.fn)) return Promise.resolve(erreur("introuvable", `Fonction « ${d.fn} » inconnue dans « ${d.service} ».`));
    const requis = declaree[d.fn]!;
    if (!acces.has(requis)) return Promise.resolve(erreur("permission_refusee", `Permission « appelle:${d.service}:${requis} » non déclarée.`));
    if (!fournisseur.serviceEntry) return Promise.resolve(erreur("erreur", "Le fournisseur n'a pas de point d'entrée de service."));

    // 5. Taille (le garde l'a déjà vérifiée : ceinture et bretelles, le routeur peut être appelé d'ailleurs).
    let taille: number;
    try {
      taille = JSON.stringify(d.args ?? null).length;
    } catch {
      return Promise.resolve(erreur("argument_invalide", "Arguments illisibles."));
    }
    if (taille > LIMITES.donnees) return Promise.resolve(erreur("argument_invalide", "Arguments trop volumineux."));

    // 6. Plafonds : un appelant ou un fournisseur ne peut pas noyer la file.
    if (this.enAttente(fournisseur.id) >= this.#limites.parFournisseur) return Promise.resolve(erreur("occupe", "Le fournisseur a trop d'appels en attente."));
    if ((this.#parAppelant.get(appelantId) ?? 0) >= this.#limites.parAppelant) return Promise.resolve(erreur("occupe", "Trop d'appels en attente pour ce plugin."));

    const file = this.#files.get(fournisseur.id) ?? { actif: false, attente: [] };
    this.#files.set(fournisseur.id, file);
    const delai = Math.min(SERVICE_TIMEOUT_MAX_MS, Math.max(SERVICE_TIMEOUT_MIN_MS, d.timeoutMs ?? SERVICE_TIMEOUT_DEFAULT_MS));
    const invocation: Invocation = {
      id: `i${++this.#compteur}`,
      fournisseur: fournisseur.id,
      entree: fournisseur.serviceEntry,
      service: d.service,
      fn: d.fn,
      args: d.args ?? null,
      appelant: appelantId,
    };
    this.#parAppelant.set(appelantId, (this.#parAppelant.get(appelantId) ?? 0) + 1);

    return new Promise<ServiceResult>((resolve) => {
      const tache: Tache = {
        invocation,
        echeance: maintenant() + delai,
        commencee: false,
        resolve: (r) => {
          clearTimeout(tache.minuteur);
          this.#parAppelant.set(appelantId, Math.max(0, (this.#parAppelant.get(appelantId) ?? 1) - 1));
          resolve(r);
        },
        // Le délai couvre aussi l'attente en file : un appel qui n'a pas démarré à temps n'est jamais exécuté.
        minuteur: setTimeout(() => {
          if (tache.commencee) return;
          const i = file.attente.indexOf(tache);
          if (i >= 0) file.attente.splice(i, 1);
          tache.resolve(erreur("delai_depasse", "Le fournisseur n'a pas répondu à temps."));
        }, delai),
      };
      file.attente.push(tache);
      void this.#pomper(fournisseur.id, file);
    });
  }

  /** Un appel à la fois par fournisseur, dans l'ordre d'arrivée : un registre n'est jamais modifié par deux appels ensemble. */
  async #pomper(fournisseur: string, file: File): Promise<void> {
    if (file.actif) return;
    const maintenant = this.#env.maintenant ?? Date.now;
    file.actif = true;
    try {
      for (let tache = file.attente.shift(); tache; tache = file.attente.shift()) {
        const reste = tache.echeance - maintenant();
        if (reste <= 0) {
          tache.resolve(erreur("delai_depasse", "Le fournisseur n'a pas répondu à temps."));
          continue;
        }
        tache.commencee = true;
        clearTimeout(tache.minuteur);
        tache.resolve(await this.#executer(tache.invocation, reste));
      }
    } finally {
      file.actif = false;
      if (file.attente.length === 0) this.#files.delete(fournisseur);
    }
  }

  async #executer(invocation: Invocation, delai: number): Promise<ServiceResult> {
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const limite = new Promise<ServiceResult>((resolve) => {
      // Filet si l'exécuteur ne respecte pas son délai : la file ne reste jamais bloquée.
      minuteur = setTimeout(() => resolve(erreur("delai_depasse", "Le fournisseur n'a pas répondu à temps.")), delai + 250);
    });
    try {
      return await Promise.race([this.#env.executer(invocation, delai), limite]);
    } catch {
      return erreur("erreur", "Le fournisseur a échoué.");
    } finally {
      clearTimeout(minuteur);
    }
  }
}
