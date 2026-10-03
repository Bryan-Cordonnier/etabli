// Import des données de l'ancien mode « seul » (ce navigateur) vers le compte du serveur (docs/16, §5).
// L'import n'écrase jamais rien : un calcul, une donnée ou des réglages déjà présents sur le serveur sont gardés.
// Les données locales restent en place, comme sauvegarde.
import type { DocumentFile, ExportComplet } from "../fond/types";
import { creerFondWeb } from "../fond/web";
import { ErreurApi, type ClientApi } from "./http";

export interface Apercu {
  documents: number;
  donnees: number;
  reglages: boolean;
}

/** Contenu local de ce navigateur, ou `null` s'il n'y a rien à importer. */
export async function lireLocal(): Promise<ExportComplet | null> {
  try {
    const tout = await creerFondWeb().exporterTout?.();
    if (!tout) return null;
    const vide = tout.documents.length === 0 && Object.keys(tout.donnees).length === 0 && Object.keys(tout.reglages).length === 0;
    return vide ? null : tout;
  } catch {
    return null;
  }
}

export const apercu = (tout: ExportComplet): Apercu => ({
  documents: tout.documents.length,
  donnees: Object.keys(tout.donnees).length,
  reglages: Object.keys(tout.reglages).length > 0,
});

export interface Bilan {
  documentsImportes: number;
  documentsDejaPresents: number;
  donneesImportees: number;
  donneesDejaPresentes: number;
  reglagesImportes: boolean;
  refus: string[];
}

export async function importer(client: ClientApi, tout: ExportComplet, progression: (fait: number, total: number) => void = () => {}): Promise<Bilan> {
  const bilan: Bilan = { documentsImportes: 0, documentsDejaPresents: 0, donneesImportees: 0, donneesDejaPresentes: 0, reglagesImportes: false, refus: [] };
  const total = tout.documents.length + Object.keys(tout.donnees).length + 1;
  let fait = 0;
  const avance = () => progression(++fait, total);

  const existants = new Set((await client.requete<{ id: string }[]>("GET", "/api/documents")).map((d) => d.id));
  for (const doc of tout.documents as DocumentFile[]) {
    if (existants.has(doc.id)) {
      bilan.documentsDejaPresents++;
    } else {
      try {
        await client.requete("PUT", "/api/documents", {
          id: doc.id,
          pluginId: doc.pluginId,
          appId: doc.appId,
          dataVersion: doc.dataVersion,
          title: doc.title,
          summary: doc.summary,
          data: doc.data,
        });
        bilan.documentsImportes++;
      } catch (e) {
        bilan.refus.push(`« ${doc.title} » : ${e instanceof ErreurApi ? e.message : "échec de l'envoi"}`);
      }
    }
    avance();
  }

  for (const [nom, valeur] of Object.entries(tout.donnees)) {
    try {
      const actuelle = await client.requete<unknown>("GET", `/api/donnees/${encodeURIComponent(nom)}`);
      if (actuelle !== null && actuelle !== undefined) bilan.donneesDejaPresentes++;
      else {
        await client.requete("PUT", `/api/donnees/${encodeURIComponent(nom)}`, valeur);
        bilan.donneesImportees++;
      }
    } catch (e) {
      bilan.refus.push(`données « ${nom} » : ${e instanceof ErreurApi ? e.message : "échec de l'envoi"}`);
    }
    avance();
  }

  if (Object.keys(tout.reglages).length > 0) {
    try {
      const actuels = await client.requete<Record<string, unknown>>("GET", "/api/reglages");
      if (Object.keys(actuels ?? {}).length === 0) {
        await client.requete("PUT", "/api/reglages", tout.reglages);
        bilan.reglagesImportes = true;
      }
    } catch (e) {
      bilan.refus.push(`réglages : ${e instanceof ErreurApi ? e.message : "échec de l'envoi"}`);
    }
  }
  avance();
  return bilan;
}
