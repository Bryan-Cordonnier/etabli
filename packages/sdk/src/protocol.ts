// Messages échangés entre le moteur et une mini-app (cahier des charges, section 8.5).
// La mini-app tourne dans un cadre isolé ; le moteur lui transmet un MessagePort privé,
// et tout passe ensuite par ce port.

/** Incrémenté à chaque changement incompatible du protocole. */
export const PROTOCOL_VERSION = 1;

/** Premier message, envoyé par le moteur avec le port de communication. */
export const CONNECT = "etabli:connect";

/** Variables de couleur du thème (mêmes noms que les variables CSS : `--surface`, `--accent`…). */
export type ThemeTokens = Record<string, string>;

export type ColorScheme = "light" | "dark";

export interface DocumentSnapshot<T = unknown> {
  /** `null` tant que le document n'a pas été enregistré (aucune modification encore). */
  id: string | null;
  title: string;
  data: T | null;
}

/**
 * Données qu'un plugin **publie** pour les autres (`provide`) : les fournisseurs, les machines…
 * Le moteur les garde et les relaie, en lecture seule, aux plugins qui déclarent une dépendance
 * (`dependencies` ou `optionalDependencies`) sur le plugin qui les fournit. Le nom du service est
 * la clé de `provides` dans le manifeste du fournisseur.
 */
export interface ServiceSnapshot<T = unknown> {
  /** Plugin qui fournit ces données. */
  plugin: string;
  /** Version du contrat de données (`provides` dans son manifeste). */
  version: string;
  /** `null` tant que le fournisseur n'a rien publié. */
  data: T | null;
}

export type Services = Record<string, ServiceSnapshot>;

/** Niveau d'accès d'une fonction de service : lire seulement, ou modifier des données chez le fournisseur. */
export type ServiceAccess = "lecture" | "ecriture";

/**
 * Codes d'erreur d'un appel de fonction de service (docs/24, A.1.3). Les sept premiers sont décidés par le
 * moteur ; `argument_invalide`, `introuvable`, `limite_atteinte`, `occupe`, `permission_refusee` et `erreur`
 * peuvent aussi venir du fournisseur (`SERVICE_PROVIDER_CODES`).
 */
export type ServiceErrorCode =
  | "service_absent"
  | "contrat_incompatible"
  | "permission_refusee"
  | "argument_invalide"
  | "introuvable"
  | "limite_atteinte"
  | "delai_depasse"
  | "occupe"
  | "profondeur_max"
  | "erreur";

export const SERVICE_ERROR_CODES: readonly ServiceErrorCode[] = [
  "service_absent",
  "contrat_incompatible",
  "permission_refusee",
  "argument_invalide",
  "introuvable",
  "limite_atteinte",
  "delai_depasse",
  "occupe",
  "profondeur_max",
  "erreur",
];

/** Codes qu'un fournisseur a le droit de renvoyer : jamais ceux qui décrivent l'état du moteur (absent, délai…). */
export const SERVICE_PROVIDER_CODES: readonly ServiceErrorCode[] = [
  "argument_invalide",
  "introuvable",
  "limite_atteinte",
  "occupe",
  "permission_refusee",
  "erreur",
];

/** Réponse à un appel : jamais d'exception, toujours l'un de ces deux cas. */
export type ServiceResult<T = unknown> = { ok: true; valeur: T } | { ok: false; code: ServiceErrorCode; message: string };

export interface ServiceCallOptions {
  /** Délai total en ms, file d'attente comprise (défaut 5 000, entre 100 et 10 000). */
  timeoutMs?: number;
}

export const SERVICE_TIMEOUT_DEFAULT_MS = 5000;
export const SERVICE_TIMEOUT_MIN_MS = 100;
export const SERVICE_TIMEOUT_MAX_MS = 10_000;

/** Contexte d'un appel reçu par un fournisseur : l'identité vient du moteur, jamais de l'appelant. */
export interface ServiceCallContext {
  /** Identifiant du plugin appelant, écrit par le moteur. */
  caller: string;
}

export type HostToPlugin =
  | {
      type: "init";
      protocol: number;
      pluginId: string;
      appId: string;
      document: DocumentSnapshot;
      theme: ThemeTokens;
      colorScheme: ColorScheme;
      /** Données publiées par les plugins dont celui-ci dépend (voir `ServiceSnapshot`). */
      services?: Services;
      /** Réglages du plugin, partagés par toutes ses mini-apps ; `null` s'il n'en a pas encore. */
      pluginData: unknown;
      /** Données envoyées par une autre mini-app (« Envoyer au calepinage »), ou `null`. */
      incoming: Incoming | null;
      /**
       * Raccourcis clavier réglés par l'utilisateur dans le moteur (« Ctrl+KeyT »…, voir `matchesShortcut`) :
       * la mini-app garde le clavier, elle ne renvoie au moteur que ces combinaisons. Aucun par défaut.
       */
      shortcuts?: string[];
    }
  | { type: "theme"; theme: ThemeTokens; colorScheme: ColorScheme }
  | { type: "services"; services: Services }
  | { type: "pluginData"; data: unknown }
  | { type: "shortcuts"; shortcuts: string[] }
  /** Réponse du moteur à un `serviceCall` de cette mini-app. */
  | { type: "serviceReply"; id: string; result: ServiceResult }
  /** Appel d'une fonction de service reçu par la page `serviceEntry` du fournisseur ; `caller` est écrit par le moteur. */
  | { type: "serviceInvoke"; id: string; service: string; fn: string; args: unknown; caller: string }
  /** Réponse du moteur à un message `reminders` de cette mini-app (ou de sa page `serviceEntry`). */
  | { type: "remindersResult"; id: string; result: RemindersResult };

export type PluginToHost =
  | { type: "update"; data: unknown }
  | { type: "title"; title: string }
  | { type: "summary"; summary: string }
  | { type: "notify"; text: string }
  | { type: "copy"; text: string }
  | { type: "height"; value: number }
  /** Thème appliqué et contenu dessiné après `init` : le moteur peut afficher le cadre (sans flash blanc). */
  | { type: "ready" }
  | { type: "shortcut"; key: string; code?: string; ctrl: boolean; shift: boolean; alt: boolean }
  | { type: "pluginData"; data: unknown }
  /** Publie des données pour les autres plugins ; `name` doit figurer dans `provides` du manifeste. */
  | { type: "provide"; name: string; data: unknown }
  /** Ouvre la page de réglages d'un autre plugin (`hash` : intention transmise à sa page, « add=scie »). */
  | { type: "openSettings"; plugin: string; hash?: string }
  | { type: "send"; kind: string; data: unknown }
  | { type: "saveFile"; file: SavedFile }
  /** Appelle la fonction `fn` du service `service` d'un autre plugin (permission `appelle:<service>:<accès>`). */
  | { type: "serviceCall"; id: string; service: string; fn: string; args: unknown; timeoutMs?: number }
  /** Page `serviceEntry` seulement : les gestionnaires de fonctions sont enregistrés, le moteur peut envoyer l'appel. */
  | { type: "serviceReady" }
  /** Page `serviceEntry` seulement : réponse à un `serviceInvoke`. */
  | { type: "serviceResult"; id: string; result: ServiceResult }
  /** Rappels sur le téléphone (permission `notifications`) : `set` remplace TOUS les rappels de ce plugin, `state` lit l'état. */
  | { type: "reminders"; id: string; op: "set"; items: Reminder[] }
  | { type: "reminders"; id: string; op: "state" };

/** Un rappel : une notification du téléphone à un instant précis (docs/24, A.1.5). Pas d'alarme : une notification seulement. */
export interface Reminder {
  /** Identifiant propre au plugin (rendu tel quel, unique dans son lot). */
  id: string;
  /** Instant de la notification, en millisecondes UTC. */
  at: number;
  title: string;
  text?: string;
}

/** Ce que le téléphone permet maintenant. */
export interface RemindersState {
  /** Notifications autorisées par l'utilisateur ; sinon rien n'est programmé (`programmes: 0`), sans que ce soit une erreur. */
  autorise: boolean;
  /** Alarmes exactes autorisées (Android 12 et plus) : sans elles, l'heure n'est pas garantie à la minute. */
  alarmeExacte: boolean;
  /** Rappels réellement programmés pour ce plugin. */
  programmes: number;
  /** Date jusqu'à laquelle les rappels sont programmés (horizon de 60 jours à compter de maintenant), en ms UTC : à renouveler à l'ouverture. */
  jusquau: number | null;
}

export type RemindersErrorCode = "telephone_seulement" | "argument_invalide" | "erreur";

export type RemindersResult = ({ ok: true } & RemindersState) | { ok: false; code: RemindersErrorCode; message: string };

/** Au plus ce nombre de rappels par plugin. */
export const REMINDERS_MAX = 200;
/** Horizon de programmation : les rappels plus lointains sont ignorés (et renouvelés quand l'agenda se rouvre). */
export const REMINDERS_HORIZON_MS = 60 * 24 * 3600 * 1000;

/** Fichier produit par une mini-app (DXF, CSV…) : le moteur ouvre « Enregistrer sous » puis l'écrit. */
export interface SavedFile {
  /** Nom proposé, sans chemin (« virole-500.dxf »). */
  name: string;
  /** Contenu texte. */
  content: string;
  /** Extension sans point (« dxf »). */
  extension: string;
  /** Libellé du type de fichier dans la boîte de dialogue (« Dessin DXF »). */
  description: string;
}

/**
 * Envoi d'une mini-app vers une autre (cahier des charges des plugins, section 3) : le moteur
 * ouvre, dans un nouvel onglet, une mini-app qui déclare accepter ce type dans son manifeste
 * (`"accepts": ["piece-plate"]`), et lui transmet les données à son ouverture.
 *
 * Types connus :
 * - `piece-plate` : une pièce plate rectangulaire `{ name, length, width, quantity, grain, thickness?, family? }`
 *   (longueur le long du sens de laminage si `grain`).
 */
export interface Incoming {
  kind: string;
  data: unknown;
  /** Nom de la mini-app qui a envoyé les données. */
  from: string;
}

/**
 * Un raccourci s'écrit « Ctrl+Alt+Shift+<code> » (modificateurs dans cet ordre), où <code> est
 * `KeyboardEvent.code` : la touche physique, donc la même en AZERTY et en QWERTY (« Ctrl+KeyT »,
 * « Ctrl+Digit1 », « Alt+ArrowLeft », « F5 »).
 */
export interface Accelerator {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  code: string;
}

export function parseAccelerator(text: string): Accelerator | null {
  const parts = text.split("+");
  const code = parts.pop();
  if (!code) return null;
  return { ctrl: parts.includes("Ctrl"), alt: parts.includes("Alt"), shift: parts.includes("Shift"), code };
}

/** Vrai si l'évènement clavier est exactement l'un des raccourcis de la liste. */
export function matchesShortcut(
  e: { code: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey?: boolean },
  shortcuts: readonly string[],
): boolean {
  if (e.metaKey) return false;
  return shortcuts.some((text) => {
    const a = parseAccelerator(text);
    return !!a && a.code === e.code && a.ctrl === e.ctrlKey && a.alt === e.altKey && a.shift === e.shiftKey;
  });
}
