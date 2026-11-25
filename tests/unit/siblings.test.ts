import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { siblingIndex } from "@/lib/siblings";

describe("temporadas al lado de sus hermanas", () => {
  const item = (externalId: string | null, season?: string) => ({ externalId, attributes: (season ? { season } : {}) as Record<string, string> });
  // Matrix, Friends T1, Friends T3, Lost T1
  const contents = [item("movie:603"), item("tv:1668", "1"), item("tv:1668", "3"), item("tv:4607", "1")];

  it("entra entre la anterior y la siguiente", () => {
    assert.equal(siblingIndex(contents, "tv:1668", "2"), 2);
  });

  it("después de la última, y antes de la primera si es anterior a todas", () => {
    assert.equal(siblingIndex(contents, "tv:1668", "4"), 3);
    assert.equal(siblingIndex(contents, "tv:1668", "0"), 1);
  });

  it("sin hermanas, o sin catálogo, no dice nada", () => {
    assert.equal(siblingIndex(contents, "tv:999", "1"), null);
    assert.equal(siblingIndex(contents, null, "1"), null);
  });
});
