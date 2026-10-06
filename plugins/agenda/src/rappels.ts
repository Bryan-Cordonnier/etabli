// Rappels de l'Agenda (docs/24, A.1.5, étape 5) : des NOTIFICATIONS du téléphone, jamais des alarmes, jamais sur PC (décision de Bryan,
// 4 octobre 2026). L'Agenda est le seul plugin à déclarer la permission `notifications` : les autres lui confient leurs rappels
// (`rappels@1`) et il envoie au moteur la liste COMPLÈTE de tout ce qui doit sonner (le moteur remplace tout ce que l'Agenda avait programmé).
// Les rappels que l'Agenda calcule lui-même (« pars dans 5 min », « pars maintenant », « coucher ») viennent des événements avec trajet.
import { ajouterJours, jourDeInstant, localVersInstant, type Jour } from "@etabli/ui/civil";
import type { Reminder } from "@etabli/sdk";
import { chronologie, occurrences } from "./calculs";
import { CLES_GARDEES } from "./carnet";
import { ErreurAgenda, RAPPELS_MAX_PAR_APPELANT, UTILISATEUR, type Carnet, type RappelStocke } from "./types";
import { entier, liste, objet, texte, texteFacultatif } from "./validation";

/** Horizon des rappels : 60 jours à compter de maintenant (docs/24, M6). */
export const HORIZON_MS = 60 * 24 * 3600 * 1000;
/** Au plus ce nombre de rappels envoyés au téléphone (le moteur refuse au-delà). */
export const REMINDERS_MAX = 200;
/** Groupe des rappels de l'écran « Rappels » (essai d'un rappel). */
export const GROUPE_ESSAI = "essai";

const ID_RAPPEL = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,47}$/;
const GROUPE = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,23}$/;

export function groupeValide(v: unknown): string {
  if (typeof v !== "string" || !GROUPE.test(v)) throw new ErreurAgenda("argument_invalide", "« groupe » doit être un texte de 1 à 24 caractères (lettres, chiffres, . _ : @ -).");
  return v;
}

/**
 * Un rappel demandé par un plugin. Champs de la spec : `id`, `at` (instant UTC en ms, dans le FUTUR), `titre`, `texte`. `niveau` n'accepte que
 * « notification » (pas d'alarme) ; `ouvre` n'est pas géré (rejeté comme champ inconnu : un ajout futur ne casse rien).
 */
export function lireRappel(brut: unknown, maintenant: number): RappelStocke {
  const o = objet(brut, ["id", "at", "titre"], ["texte", "niveau"]);
  if (o.niveau !== undefined && o.niveau !== "notification") throw new ErreurAgenda("argument_invalide", "« niveau » : seules les notifications sont gérées, pas les alarmes.");
  if (typeof o.id !== "string" || !ID_RAPPEL.test(o.id)) throw new ErreurAgenda("argument_invalide", "« id » d'un rappel : 1 à 48 caractères (lettres, chiffres, . _ : @ -).");
  const at = entier(o.at, "rappel.at", 0, 8.64e15);
  if (at <= maintenant) throw new ErreurAgenda("argument_invalide", "« at » est dans le passé : un rappel sonne dans le futur.");
  return { id: o.id, at, titre: texte(o.titre, "rappel.titre", 120), texte: texteFacultatif(o.texte, "rappel.texte", 300) };
}

export const lireRappels = (brut: unknown, maintenant: number): RappelStocke[] => {
  const rappels = liste(brut, "rappels", (r) => lireRappel(r, maintenant), RAPPELS_MAX_PAR_APPELANT);
  if (new Set(rappels.map((r) => r.id)).size !== rappels.length) throw new ErreurAgenda("argument_invalide", "Deux rappels ont le même « id ».");
  return rappels;
};

// ——— Opérations sur le carnet ———

const total = (c: Carnet, plugin: string): number => Object.values(c.rappels[plugin] ?? {}).reduce((n, l) => n + l.length, 0);

/** Remplace tous les rappels du groupe (appelant, groupe). Rejouer la même `cle` ne change rien et rend la même réponse. */
export function remplacerRappels(c: Carnet, appelant: string, groupe: string, rappels: readonly RappelStocke[], cle: string): { valeur: { nombre: number; rejoue: boolean }; carnet: Carnet } {
  const vue = (c.cles[appelant] ?? []).find((m) => m.cle === `rappels:${cle}`);
  if (vue) return { valeur: { nombre: vue.ids.length, rejoue: true }, carnet: c };
  const sans = { ...(c.rappels[appelant] ?? {}) };
  delete sans[groupe];
  const suivant: Carnet = { ...c, rappels: { ...c.rappels, [appelant]: { ...sans, ...(rappels.length > 0 ? { [groupe]: [...rappels] } : {}) } } };
  if (total(suivant, appelant) > RAPPELS_MAX_PAR_APPELANT) {
    throw new ErreurAgenda("limite_atteinte", `« ${appelant} » a ${total(suivant, appelant)} rappels : au plus ${RAPPELS_MAX_PAR_APPELANT} par plugin.`);
  }
  const memoire = [...(c.cles[appelant] ?? []), { cle: `rappels:${cle}`, ids: rappels.map((r) => r.id) }].slice(-CLES_GARDEES);
  return { valeur: { nombre: rappels.length, rejoue: false }, carnet: { ...suivant, cles: { ...c.cles, [appelant]: memoire } } };
}

/** Annule les rappels du groupe (appelant, groupe). Naturellement idempotent. */
export function annulerRappels(c: Carnet, appelant: string, groupe: string): { valeur: { annules: number }; carnet: Carnet } {
  const groupes = c.rappels[appelant] ?? {};
  const annules = groupes[groupe]?.length ?? 0;
  if (annules === 0) return { valeur: { annules: 0 }, carnet: c };
  const reste = { ...groupes };
  delete reste[groupe];
  return { valeur: { annules }, carnet: { ...c, rappels: { ...c.rappels, [appelant]: reste } } };
}

// ——— Rappels calculés par l'Agenda ———

const heureCourte = (minutes: number): string => {
  const r = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
};

/**
 * « Pars dans X min », « Pars maintenant » pour chaque événement avec trajet, et un rappel de coucher pour le premier événement avec trajet de
 * chaque jour (le réveil et le coucher dépendent du premier départ). Seuls les instants à venir, dans l'horizon.
 */
export function rappelsHoraires(c: Carnet, maintenant: number): RappelStocke[] {
  if (!c.rappelsHoraires) return [];
  const debut: Jour = ajouterJours(jourDeInstant(maintenant), -1);
  const fin: Jour = ajouterJours(jourDeInstant(maintenant + HORIZON_MS), 1);
  const sortie: RappelStocke[] = [];
  const coucherFait = new Set<Jour>();
  for (const o of occurrences(c.evenements, debut, fin)) {
    if (o.trajetMin === null) continue;
    const ch = chronologie(o.debutMin, o.trajetMin, c.reglages);
    const cle = `${o.evenementId}@${o.jour}`;
    const ajouter = (genre: string, minute: number, titre: string, texte: string | null) => {
      const at = localVersInstant(o.jour, minute);
      if (at > maintenant && at <= maintenant + HORIZON_MS) sortie.push({ id: `${genre}:${cle}`, at, titre, texte });
    };
    ajouter("pre", ch.decisionMin - c.reglages.preAlerteMin, `Pars dans ${c.reglages.preAlerteMin} min`, o.titre);
    ajouter("depart", ch.decisionMin, "Pars maintenant", `${o.titre} à ${heureCourte(o.debutMin)}`);
    if (!coucherFait.has(o.jour)) {
      coucherFait.add(o.jour);
      ajouter("coucher", ch.coucherMin - c.reglages.rappelCoucherMin, `Coucher dans ${c.reglages.rappelCoucherMin} min`, `Réveil à ${heureCourte(ch.reveilMin)} pour « ${o.titre} »`);
    }
  }
  return sortie;
}

/** Tout ce qui doit sonner (autres plugins + l'Agenda), du plus proche au plus lointain, 200 au plus : la liste COMPLÈTE envoyée au moteur. */
export function rappelsPourLeMoteur(c: Carnet, maintenant: number): Reminder[] {
  const tous: Reminder[] = [];
  // Le moteur refuse un identifiant qui ne commence pas par une lettre ou un chiffre (donc pas « @utilisateur »), et refuse TOUTE la liste
  // s'il y en a un seul invalide ou en double : on écrit des préfixes sûrs et on dédoublonne en dernier recours.
  const prefixe = (plugin: string) => (plugin === UTILISATEUR ? "utilisateur" : plugin);
  for (const [plugin, groupes] of Object.entries(c.rappels)) {
    for (const [groupe, liste] of Object.entries(groupes)) {
      for (const r of liste) tous.push({ id: `${prefixe(plugin)}/${groupe}/${r.id}`, at: r.at, title: r.titre, ...(r.texte ? { text: r.texte } : {}) });
    }
  }
  for (const r of rappelsHoraires(c, maintenant)) tous.push({ id: `agenda/horaires/${r.id}`, at: r.at, title: r.titre, ...(r.texte ? { text: r.texte } : {}) });
  const vus = new Set<string>();
  return tous
    .filter((r) => r.at > maintenant)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    .filter((r) => !vus.has(r.id) && !!vus.add(r.id))
    .slice(0, REMINDERS_MAX);
}

/** Rappels de l'Agenda lui-même et de chaque plugin, pour l'écran : « paie : 3 », « agenda (horaires) : 12 ». */
export function resumeRappels(c: Carnet, maintenant: number): { source: string; groupe: string; nombre: number }[] {
  const lignes = Object.entries(c.rappels).flatMap(([plugin, groupes]) => Object.entries(groupes).map(([groupe, l]) => ({ source: plugin, groupe, nombre: l.length })));
  const horaires = rappelsHoraires(c, maintenant).length;
  return [...lignes, ...(horaires > 0 ? [{ source: "agenda", groupe: "horaires", nombre: horaires }] : [])];
}
