// État partagé par les deux écrans de Budget : le plan (réglages du plugin) et ce que Finances rend (solde, comptes, catégories).
// Règle de sécurité : un plan illisible n'est JAMAIS remplacé par un plan vide ; l'écran le dit et n'écrit rien.
import { connect } from "@etabli/sdk";
import { jourDeInstant, type Jour } from "@etabli/ui/civil";
import { chargerFinances, confirmer, messageIndisponible, type Appeler, type DonneesFinances } from "./finances";
import { abandonner, realiser } from "./operations";
import { lirePlan, synchroniser } from "./plan";
import { ErreurBudget, type Plan } from "./types";

type Hote = Awaited<ReturnType<typeof connect<unknown>>>;

export class Session {
  plan = $state<Plan | null>(null);
  illisible = $state("");
  finances = $state<DonneesFinances | null>(null);
  /** Phrase affichée quand Finances ne répond pas (absent, désactivé, version incompatible…). */
  indisponible = $state("");
  message = $state("");
  occupe = $state(false);
  aujourdhui = $state<Jour>(jourDeInstant(Date.now()));
  #hote: Hote | undefined;

  async demarrer(): Promise<void> {
    const hote = await connect<unknown>();
    this.#hote = hote;
    this.#recevoir(hote.settings.data);
    hote.settings.onChange((d) => this.#recevoir(d));
    await this.recharger();
  }

  #recevoir(donnees: unknown): void {
    try {
      this.aujourdhui = jourDeInstant(Date.now());
      const lu = lirePlan(donnees);
      const synchro = synchroniser(lu, this.aujourdhui);
      this.plan = synchro;
      this.illisible = "";
      // Les échéances manquantes des virements et abonnements sont enregistrées une fois (la lecture suivante n'a plus rien à ajouter).
      if (synchro !== lu) this.#hote?.settings.update(synchro);
    } catch (e) {
      this.plan = null;
      this.illisible = e instanceof ErreurBudget ? e.message : "Plan illisible.";
    }
  }

  readonly appeler: Appeler = async (fonction, args) => {
    if (!this.#hote) return { ok: false, code: "erreur", message: "Pas encore connecté au moteur." };
    return this.#hote.services.call("finances", fonction, args, { timeoutMs: 8000 });
  };

  /** Relit Finances (comptes, catégories, solde d'aujourd'hui, sorties du mois). */
  async recharger(): Promise<void> {
    this.aujourdhui = jourDeInstant(Date.now());
    const r = await chargerFinances(this.appeler, this.aujourdhui);
    if (r.ok) {
      this.finances = r.donnees;
      this.indisponible = "";
    } else {
      this.finances = null;
      this.indisponible = messageIndisponible(r.code, r.message);
    }
  }

  /** Une modification du plan : enregistrée en entier dans les réglages du plugin. Rend vrai si elle a eu lieu. */
  appliquer(travail: (p: Plan) => Plan): boolean {
    this.message = "";
    if (!this.plan || !this.#hote) return false;
    try {
      const suivant = travail(this.plan);
      this.#hote.settings.update(suivant);
      this.plan = suivant;
      return true;
    } catch (e) {
      this.message = e instanceof ErreurBudget ? e.message : "Une erreur est survenue : rien n'a été enregistré.";
      return false;
    }
  }

  abandonnerPrevision(id: string): void {
    this.appliquer((p) => abandonner(p, id));
  }

  /** Ajoute l'écriture réelle dans Finances (sans doublon possible), puis marque la prévision réalisée. */
  async confirmerPrevision(id: string): Promise<void> {
    this.message = "";
    const p = this.plan?.previsions.find((x) => x.id === id);
    if (!p || this.occupe) return;
    this.occupe = true;
    try {
      const r = await confirmer(this.appeler, p, Date.now());
      if (!r.ok) {
        this.message = messageIndisponible(r.code, r.message);
        return;
      }
      this.appliquer((plan) => realiser(plan, id, r.ecritureId));
      await this.recharger();
    } finally {
      this.occupe = false;
    }
  }
}
