import { describe, expect, it } from "vitest";
import { ecrireConnexion, lireConnexion, lireDerniere, normaliserAdresse, ouvrirSession, sonderServeur } from "./connexion";

function memoire() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}
const json = (c: unknown, statut = 200) => new Response(JSON.stringify(c), { status: statut });

describe("connexion mémorisée", () => {
  const serveur = { mode: "serveur" as const, url: "https://s.fr", jeton: "jeton", utilisateur: { id: "u1", nom: "alice", role: "utilisateur" as const } };

  it("aller-retour, mode seul, et rien de mémorisé", () => {
    const s = memoire();
    expect(lireConnexion(s)).toBeNull();
    ecrireConnexion(serveur, s);
    expect(lireConnexion(s)).toEqual(serveur);
    ecrireConnexion({ mode: "local" }, s);
    expect(lireConnexion(s)).toEqual({ mode: "local" });
    ecrireConnexion(null, s);
    expect(lireConnexion(s)).toBeNull();
  });

  it("garde l'adresse et l'identifiant (jamais le jeton) pour préremplir la connexion", () => {
    const s = memoire();
    ecrireConnexion(serveur, s);
    ecrireConnexion(null, s);
    expect(lireDerniere(s)).toEqual({ url: "https://s.fr", nom: "alice" });
    expect(s.m.get("etabli.derniere-connexion")).not.toContain("jeton");
  });

  it("contenu corrompu ou incomplet : comme si rien n'était mémorisé", () => {
    for (const brut of ["pas du json", '{"mode":"serveur"}', '{"mode":"serveur","url":"x","jeton":"","utilisateur":{"id":"1"}}', '{"mode":"inconnu"}', "null"]) {
      const s = memoire();
      s.setItem("etabli.connexion", brut);
      expect(lireConnexion(s), brut).toBeNull();
    }
  });
});

describe("adresse du serveur", () => {
  it("nettoie et complète", () => {
    expect(normaliserAdresse("")).toEqual({ url: "" });
    expect(normaliserAdresse("etabli.exemple.fr")).toEqual({ url: "https://etabli.exemple.fr" });
    expect(normaliserAdresse("  https://etabli.exemple.fr/chemin/ignore?x=1  ")).toEqual({ url: "https://etabli.exemple.fr" });
    expect(normaliserAdresse("https://etabli.exemple.fr:4300")).toEqual({ url: "https://etabli.exemple.fr:4300" });
  });

  it("http seulement pour une machine locale ou un réseau privé", () => {
    for (const ok of ["http://localhost:4300", "http://127.0.0.1:4300", "http://192.168.1.20:4300", "http://10.0.0.5", "http://172.16.4.2", "http://100.101.102.103:4300", "http://serveur.local", "http://pc.tail1234.ts.net:4300"]) {
      expect("url" in normaliserAdresse(ok), ok).toBe(true);
    }
    for (const ko of ["http://etabli.exemple.fr", "http://8.8.8.8", "http://172.32.0.1", "http://100.128.0.1"]) {
      expect("erreur" in normaliserAdresse(ko), ko).toBe(true);
    }
  });

  it("refuse les autres protocoles", () => {
    for (const ko of ["javascript:alert(1)", "ftp://x.fr", "file:///etc/passwd", "data:text/html,x"]) {
      expect("erreur" in normaliserAdresse(ko), ko).toBe(true);
    }
  });
});

describe("sonde et ouverture de session", () => {
  it("reconnaît un serveur Établi, installé ou non", async () => {
    expect(await sonderServeur("https://s.fr", (async () => json({ serveur: "etabli", version: "0.4.0", installe: true })) as unknown as typeof fetch)).toEqual({ installe: true, version: "0.4.0" });
    expect(await sonderServeur("https://s.fr", (async () => json({ serveur: "etabli", version: "0.4.0", installe: false })) as unknown as typeof fetch)).toMatchObject({ installe: false });
  });

  it("autre chose qu'un serveur Établi : null", async () => {
    expect(await sonderServeur("", (async () => json({ serveur: "autre" })) as unknown as typeof fetch)).toBeNull();
    expect(await sonderServeur("", (async () => new Response("<html></html>")) as unknown as typeof fetch)).toBeNull();
    expect(await sonderServeur("", (async () => Promise.reject(new TypeError("réseau"))) as unknown as typeof fetch)).toBeNull();
  });

  it("session ouverte : jeton et utilisateur retenus", async () => {
    const f = (async () => json({ jeton: "J", utilisateur: { id: "u1", nom: "alice", role: "utilisateur" } })) as unknown as typeof fetch;
    expect(await ouvrirSession("https://s.fr", "alice", "x", f)).toEqual({
      mode: "serveur",
      url: "https://s.fr",
      jeton: "J",
      utilisateur: { id: "u1", nom: "alice", role: "utilisateur" },
    });
  });
});
