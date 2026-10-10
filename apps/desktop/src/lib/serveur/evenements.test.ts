import { describe, expect, it } from "vitest";
import { analyserFlux, type Changement } from "./evenements";

describe("analyserFlux", () => {
  it("lit les messages complets et garde le reste pour la suite", () => {
    const recus: Changement[] = [];
    const reste = analyserFlux('data: {"type":"donnees","nom":"plugin.courses"}\n\ndata: {"type":"don', (c) => recus.push(c));
    expect(recus).toEqual([{ type: "donnees", nom: "plugin.courses" }]);
    expect(reste).toBe('data: {"type":"don');
    analyserFlux(reste + 'nees","nom":"plugin.agenda"}\n\n', (c) => recus.push(c));
    expect(recus.at(-1)).toEqual({ type: "donnees", nom: "plugin.agenda" });
  });

  it("ignore les battements, les commentaires et les messages illisibles", () => {
    const recus: Changement[] = [];
    analyserFlux(': battement\n\ndata: pas du json\n\ndata: {"type":1}\n\n', (c) => recus.push(c));
    expect(recus).toEqual([]);
  });
});