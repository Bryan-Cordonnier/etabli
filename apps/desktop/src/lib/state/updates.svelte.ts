// Mises à jour automatiques : Établi regarde sur GitHub (dernière version publiée) si une version
// plus récente existe. Rien ne s'installe sans l'accord de l'utilisateur : l'installation ferme et
// relance l'application, on la déclenche quand on a fini son calcul. Le paquet téléchargé est signé :
// Tauri refuse un fichier dont la signature ne correspond pas à la clé publique de tauri.conf.json.
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, system } from "$lib/api";
import { distribution } from "$lib/distribution";
import { estAndroid } from "$lib/plateforme";
import { versionPlusRecente } from "$lib/versions";

export type UpdateStatus = "idle" | "checking" | "uptodate" | "available" | "downloading" | "installing" | "error";

class Updates {
  status = $state<UpdateStatus>("idle");
  /** Version proposée et ses notes (le message de la version publiée). */
  version = $state("");
  notes = $state("");
  /** Progression du téléchargement, de 0 à 1 (NaN si la taille est inconnue). */
  progress = $state(0);
  error = $state("");
  /** « Plus tard » : le bandeau se cache jusqu'au prochain démarrage. */
  dismissed = $state(false);
  lastCheck = $state<Date | null>(null);
  #update: Update | null = null;
  /** Android : adresse de l'APK de la version proposée. */
  #apk = "";

  get busy(): boolean {
    return this.status === "checking" || this.status === "downloading" || this.status === "installing";
  }

  /**
   * Cherche une mise à jour. `silent` (au démarrage) : une erreur (pas de réseau, GitHub
   * injoignable, aucune version publiée) ne s'affiche pas.
   */
  async check(silent = false): Promise<void> {
    if (!api.capacites.miseAJour || this.busy) return;
    this.status = "checking";
    this.error = "";
    try {
      if (estAndroid) return await this.#verifierAndroid();
      const update = await check();
      this.lastCheck = new Date();
      this.#update = update;
      if (update) {
        this.version = update.version;
        this.notes = update.body?.trim() ?? "";
        this.status = "available";
      } else {
        this.status = "uptodate";
      }
    } catch (err) {
      this.status = silent ? "idle" : "error";
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  /** Android : pas d'installateur intégré. On lit le latest.json de la distribution ; l'installation ouvre le téléchargement de l'APK. */
  async #verifierAndroid(): Promise<void> {
    const adresse = distribution.androidUpdateUrl;
    if (!adresse) throw new Error("Aucune adresse de mise à jour pour Android.");
    const reponse = await fetch(adresse, { cache: "no-store" });
    if (!reponse.ok) throw new Error(`Recherche de mise à jour impossible (${reponse.status}).`);
    const donnees = (await reponse.json()) as { version?: unknown; notes?: unknown; android?: { url?: unknown } };
    const actuelle = (await system.appInfo()).version;
    this.lastCheck = new Date();
    const url = donnees.android?.url;
    if (typeof donnees.version === "string" && typeof url === "string" && url.startsWith("https://") && versionPlusRecente(donnees.version, actuelle)) {
      this.version = donnees.version;
      this.notes = typeof donnees.notes === "string" ? donnees.notes.trim() : "";
      this.#apk = url;
      this.status = "available";
    } else this.status = "uptodate";
  }

  /** Télécharge et installe la version proposée, puis relance Établi. */
  async install(): Promise<void> {
    if (estAndroid) {
      if (this.#apk) await openUrl(this.#apk);
      return;
    }
    const update = this.#update;
    if (!update || this.busy) return;
    this.status = "downloading";
    this.progress = 0;
    let total = 0;
    let received = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          this.progress = total > 0 ? Math.min(1, received / total) : NaN;
        } else {
          this.status = "installing";
        }
      });
      // Sous Windows, l'installateur ferme Établi lui-même et le relance ; sinon on relance ici.
      await relaunch();
    } catch (err) {
      this.status = "error";
      this.error = err instanceof Error ? err.message : String(err);
    }
  }
}

export const updates = new Updates();
