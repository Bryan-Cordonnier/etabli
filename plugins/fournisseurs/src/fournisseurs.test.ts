import { describe, expect, it } from "vitest";
import { changeKind, cleanSuppliers, newItem, newSupplier, setNumber } from "./fournisseurs";

describe("newItem", () => {
  it("propose une barre de 6 m ou une tôle de 2500 × 1250", () => {
    expect(newItem("tube-rond")).toMatchObject({ length: 6000, width: null, price: null });
    expect(newItem("tole")).toMatchObject({ length: 2500, width: 1250 });
  });

  it("donne des identifiants différents", () => {
    expect(newItem().id).not.toBe(newItem().id);
    expect(newSupplier().items).toHaveLength(1);
  });
});

describe("cleanSuppliers", () => {
  it("rejette ce qui n'est pas une liste de fournisseurs", () => {
    expect(cleanSuppliers(null)).toEqual([]);
    expect(cleanSuppliers("nimporte quoi")).toEqual([]);
    expect(cleanSuppliers([{ nom: "sans identifiant" }, 12])).toEqual([]);
  });

  it("complète les champs d'un ancien fichier", () => {
    const [supplier] = cleanSuppliers([{ id: "a", name: "Métaux Nord", items: [{ id: "x", kind: "tole", length: 3000 }] }]);
    expect(supplier?.name).toBe("Métaux Nord");
    expect(supplier?.items[0]).toMatchObject({ id: "x", kind: "tole", length: 3000, width: 1250, tolMinus: 0, price: null, priceUnit: "piece" });
  });
});

describe("changeKind", () => {
  it("ajoute la largeur d'une tôle, et la retire pour une barre", () => {
    const item = newItem("tube-carre");
    changeKind(item, "tole");
    expect(item).toMatchObject({ kind: "tole", length: 2500, width: 1250 });
    changeKind(item, "plat");
    expect(item).toMatchObject({ kind: "plat", length: 6000, width: null });
  });

  it("garde les dimensions saisies quand on reste dans la même famille", () => {
    const item = newItem("tube-carre");
    item.length = 5000;
    changeKind(item, "tube-rond");
    expect(item.length).toBe(5000);
  });
});

describe("setNumber", () => {
  it("accepte la virgule décimale et refuse les valeurs négatives", () => {
    const item = newItem();
    setNumber(item, "tolPlus", "1,5");
    expect(item.tolPlus).toBe(1.5);
    setNumber(item, "tolMinus", "-3");
    expect(item.tolMinus).toBe(0);
  });

  it("champ vidé : 0 pour une dimension, rien pour le prix", () => {
    const item = newItem();
    item.price = 12;
    setNumber(item, "price", "");
    expect(item.price).toBeNull();
    setNumber(item, "length", "abc");
    expect(item.length).toBe(0);
  });
});
