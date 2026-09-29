import { describe, expect, it } from "vitest";
import { matchesShortcut, parseAccelerator } from "./protocol";

const key = (code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) => ({
  code,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  metaKey: !!mods.meta,
});

describe("parseAccelerator", () => {
  it("lit les modificateurs et la touche physique", () => {
    expect(parseAccelerator("Ctrl+Shift+KeyT")).toEqual({ ctrl: true, alt: false, shift: true, code: "KeyT" });
    expect(parseAccelerator("Alt+ArrowLeft")).toEqual({ ctrl: false, alt: true, shift: false, code: "ArrowLeft" });
    expect(parseAccelerator("F5")).toEqual({ ctrl: false, alt: false, shift: false, code: "F5" });
  });

  it("refuse un texte vide", () => {
    expect(parseAccelerator("")).toBeNull();
  });
});

describe("matchesShortcut", () => {
  it("ne reconnaît rien quand aucun raccourci n'est réglé", () => {
    expect(matchesShortcut(key("KeyT", { ctrl: true }), [])).toBe(false);
  });

  it("exige exactement les mêmes modificateurs", () => {
    const list = ["Ctrl+KeyT"];
    expect(matchesShortcut(key("KeyT", { ctrl: true }), list)).toBe(true);
    expect(matchesShortcut(key("KeyT", { ctrl: true, shift: true }), list)).toBe(false);
    expect(matchesShortcut(key("KeyT"), list)).toBe(false);
    expect(matchesShortcut(key("KeyW", { ctrl: true }), list)).toBe(false);
  });

  it("prend la touche physique : la même en AZERTY et en QWERTY", () => {
    expect(matchesShortcut(key("KeyQ", { ctrl: true }), ["Ctrl+KeyQ"])).toBe(true);
  });

  it("ignore la touche Windows", () => {
    expect(matchesShortcut(key("KeyT", { ctrl: true, meta: true }), ["Ctrl+KeyT"])).toBe(false);
  });

  it("reconnaît un raccourci parmi plusieurs", () => {
    expect(matchesShortcut(key("Digit1", { ctrl: true }), ["Ctrl+KeyT", "Ctrl+Digit1", "F5"])).toBe(true);
    expect(matchesShortcut(key("F5"), ["Ctrl+KeyT", "Ctrl+Digit1", "F5"])).toBe(true);
  });
});
