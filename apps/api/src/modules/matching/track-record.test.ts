import { describe, expect, it } from "vitest";
import { trackRecordFromRating } from "./track-record";

describe("track record rating component", () => {
  it("keeps a neutral prior when there are no eligible ratings", () => {
    expect(trackRecordFromRating(null, 0)).toBe(0.5);
  });
  it("normalizes 1–5 ratings while preserving neutral unknown components", () => {
    expect(trackRecordFromRating(1, 1)).toBeCloseTo(1 / 3);
    expect(trackRecordFromRating(3, 2)).toBe(0.5);
    expect(trackRecordFromRating(5, 3)).toBeCloseTo(2 / 3);
  });
});
