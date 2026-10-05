import { describe, expect, it } from "vitest";
import { OFFICIAL_SOURCE, activeSource, readChannel, readSource, sourceError } from "./catalogue-source";

// Clé publique minisign d'essai (crates/noyau/fixtures/cle-publication-1-essai.pub).
const KEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEJCRDA3NjdDQjBEQ0I0QzAKUldUQXROeXdmSGJRdXhYM3VZeXk2emV6MFpOWDRZckNMa1pQR2NkMDZYdXNNd0FjYkJ4d2hIS2oK";
const URL = "https://registre.exemple.fr/etabli/catalogue.json";

describe("source du catalogue", () => {
  it("la source officielle (adresse vide) est toujours correcte et n'envoie rien au moteur", () => {
    expect(sourceError(OFFICIAL_SOURCE)).toBeNull();
    expect(activeSource(OFFICIAL_SOURCE)).toBeNull();
    expect(activeSource({ url: "  ", key: "n'importe quoi" })).toBeNull();
  });

  it("une source correcte est envoyée telle quelle, sans espaces autour", () => {
    expect(sourceError({ url: URL, key: KEY })).toBeNull();
    expect(activeSource({ url: ` ${URL} `, key: `${KEY}\n` })).toEqual({ url: URL, key: KEY });
  });

  it("refuse les adresses douteuses", () => {
    for (const url of [
      "http://registre.exemple.fr/catalogue.json",
      "https://registre.exemple.fr",
      "https://registre.exemple.fr/catalogue.txt",
      "https://registre.exemple.fr/a b/catalogue.json",
      "https://registre.exemple.fr/catalogue.json?x=1",
      "https://moi@registre.exemple.fr/catalogue.json",
      "https://registre.exemple.fr/../catalogue.json",
    ]) {
      expect(sourceError({ url, key: KEY }), url).not.toBeNull();
      expect(activeSource({ url, key: KEY }), url).toBeNull();
    }
  });

  it("refuse une clé illisible : on ne retombe jamais sur une autre clé", () => {
    for (const key of ["", "pas une clé", "bm9uIG1pbmlzaWdu"]) {
      expect(sourceError({ url: URL, key }), key).toMatch(/Clé publique/);
      expect(activeSource({ url: URL, key }), key).toBeNull();
    }
  });

  it("relit des réglages anciens ou abîmés", () => {
    expect(readSource(undefined)).toEqual(OFFICIAL_SOURCE);
    expect(readSource({ url: 3, key: null })).toEqual(OFFICIAL_SOURCE);
    expect(readSource({ url: URL, key: KEY })).toEqual({ url: URL, key: KEY });
    expect(readChannel("beta")).toBe("beta");
    expect(readChannel("nightly")).toBe("stable");
    expect(readChannel(undefined)).toBe("stable");
  });
});
