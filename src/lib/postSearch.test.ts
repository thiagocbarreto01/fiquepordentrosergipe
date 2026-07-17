import { describe, it, expect } from "vitest";
import { sanitizeSearch, escapeIlike, maceioDayBoundsIso } from "./postSearch";

describe("sanitizeSearch", () => {
  it("remove vírgula, parênteses, aspas e barra invertida", () => {
    expect(sanitizeSearch(`notícia (Sergipe), "aspas" \\`)).toBe("notícia Sergipe aspas");
  });
  it("preserva %, _ e acentos (escape é responsabilidade do ILIKE)", () => {
    expect(sanitizeSearch("100% de acréscimo")).toBe("100% de acréscimo");
    expect(sanitizeSearch("Rua_A da região")).toBe("Rua_A da região");
    expect(sanitizeSearch("São Cristóvão")).toBe("São Cristóvão");
  });
  it("colapsa espaços e trima", () => {
    expect(sanitizeSearch("   ola    mundo  ")).toBe("ola mundo");
  });
});

describe("escapeIlike", () => {
  it("escapa curingas do ILIKE", () => {
    expect(escapeIlike("100%")).toBe("100\\%");
    expect(escapeIlike("Rua_A")).toBe("Rua\\_A");
    expect(escapeIlike("a\\b")).toBe("a\\\\b");
    expect(escapeIlike("50% em Rua_1")).toBe("50\\% em Rua\\_1");
  });
  it("é seguro para acentos e texto normal", () => {
    expect(escapeIlike("São Cristóvão")).toBe("São Cristóvão");
    expect(escapeIlike("aspas texto")).toBe("aspas texto");
  });
});

describe("maceioDayBoundsIso — fronteira do dia (America/Maceio, UTC-3)", () => {
  // A referência é 2026-06-15 12:00 UTC = 09:00 em Maceió (dentro do dia 15).
  const ref = new Date("2026-06-15T12:00:00Z");

  it("dia atual começa 03:00Z e termina 02:59:59.999Z do dia seguinte", () => {
    const { startIso, endIso } = maceioDayBoundsIso(0, ref);
    expect(startIso).toBe("2026-06-15T03:00:00.000Z");
    expect(endIso).toBe("2026-06-16T02:59:59.999Z");
  });

  it("23:59:59 do dia anterior (Maceió) NÃO está no dia atual", () => {
    // 23:59:59 do dia 14 em Maceió = 02:59:59Z do dia 15
    const priorEnd = new Date("2026-06-15T02:59:59.000Z").toISOString();
    const { startIso } = maceioDayBoundsIso(0, ref);
    expect(priorEnd < startIso).toBe(true);
  });

  it("00:00:00 do dia atual (Maceió) ESTÁ no dia atual", () => {
    // 00:00:00 dia 15 Maceió = 03:00:00Z dia 15
    const dayStart = new Date("2026-06-15T03:00:00.000Z").toISOString();
    const { startIso, endIso } = maceioDayBoundsIso(0, ref);
    expect(dayStart >= startIso && dayStart <= endIso).toBe(true);
  });

  it("23:59:59 do dia atual (Maceió) ESTÁ no dia atual", () => {
    // 23:59:59 dia 15 Maceió = 02:59:59Z dia 16
    const dayEnd = new Date("2026-06-16T02:59:59.000Z").toISOString();
    const { startIso, endIso } = maceioDayBoundsIso(0, ref);
    expect(dayEnd >= startIso && dayEnd <= endIso).toBe(true);
  });

  it("00:00:00 do dia seguinte (Maceió) NÃO está no dia atual", () => {
    // 00:00:00 dia 16 Maceió = 03:00:00Z dia 16
    const nextStart = new Date("2026-06-16T03:00:00.000Z").toISOString();
    const { endIso } = maceioDayBoundsIso(0, ref);
    expect(nextStart > endIso).toBe(true);
  });
});
