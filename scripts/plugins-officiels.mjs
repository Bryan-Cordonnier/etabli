// Rassemble les plugins officiels compilés (plugins/<id>/dist) dans
// apps/desktop/src-tauri/plugins-officiels/<id>, que l'installateur copie dans les ressources de
// l'application (resources/plugins). Lancé à la fin de `npm run build:plugins` : un nouveau plugin
// est inclus sans rien toucher à la configuration de Tauri.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "plugins");
const target = join(root, "apps", "desktop", "src-tauri", "plugins-officiels");

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
// Le dossier doit exister même vide : Tauri vérifie les ressources à chaque compilation.
writeFileSync(join(target, ".gitkeep"), "");

const copied = [];
for (const id of readdirSync(source)) {
  const dist = join(source, id, "dist");
  if (!existsSync(join(dist, "manifest.json"))) continue;
  cpSync(dist, join(target, id), { recursive: true });
  copied.push(id);
}
console.log(`Plugins officiels pour l'installateur : ${copied.join(", ") || "aucun"}`);
