// Mises à jour automatiques : Établi regarde sur GitHub (dernière version publiée) si une version
// plus récente existe. Rien ne s'installe sans l'accord de l'utilisateur : l'installation ferme et
// relance l'application, on la déclenche quand on a fini son calcul. Le paquet téléchargé est signé :
// Tauri refuse un fichier dont la signature ne correspond pas à la clé publique de tauri.conf.json.
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { inTauri } from "$lib/api";

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

  get busy(): boolean {
    return this.status === "checking" || this.status === "downloading" || this.status === "installing";
  }

  /**
   * Cherche une mise à jour. `silent` (au démarrage) : une erreur (pas de réseau, GitHub
   * injoignable, aucune version publiée) ne s'affiche pas.
   */
  async check(silent = false): Promise<void> {
    if (!inTauri || this.busy) return;
    this.status = "checking";
    this.error = "";
    try {
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

  /** Télécharge et installe la version proposée, puis relance Établi. */
  async install(): Promise<void> {
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
