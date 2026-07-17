// @ts-nocheck
import {
  getRegionSearchExamples,
  getSuggestedLocalities,
} from "@/lib/location/location-intelligence";

const toKey = (item: {
  region?: string | null;
  name?: string | null;
  district?: string | null;
  geonameId?: number | null;
}) =>
  item.geonameId != null
    ? `id:${item.geonameId}`
    : `${String(item.region || "").toLowerCase()}:${String(item.name || "").toLowerCase()}:${String(
        item.district || "",
      ).toLowerCase()}`;

describe("ghana locality helpers", () => {
  it("prioritizes recent localities without reintroducing duplicates", () => {
    const suggestions = getSuggestedLocalities({
      region: "Ashanti",
      recent: [
        {
          name: "Mampong",
          region: "Ashanti",
          district: "Mampong",
          geonameId: 2298264,
        },
        {
          name: "Kumasi",
          region: "Ashanti",
          district: "Kumasi",
          geonameId: 2298890,
        },
      ],
      defaults: [
        {
          name: "Kumasi",
          region: "Ashanti",
          district: "Kumasi",
          geonameId: 2298890,
        },
        {
          name: "Obuase",
          region: "Ashanti",
          district: "Obuasi",
          geonameId: 2296606,
        },
        {
          name: "Ejura",
          region: "Ashanti",
          district: "Ejura Sekyedumase",
          geonameId: 2301217,
        },
      ],
      limit: 6,
    });

    expect(suggestions[0]?.name).toBe("Mampong");
    expect(new Set(suggestions.map(toKey)).size).toBe(suggestions.length);
    expect(suggestions.some((item) => item.name === "Kumasi")).toBe(true);
  });

  it("returns short unique search examples per region", () => {
    const examples = getRegionSearchExamples("Ashanti");

    expect(examples.length).toBeGreaterThan(0);
    expect(examples.length).toBeLessThanOrEqual(3);
    expect(new Set(examples.map((value) => value.toLowerCase())).size).toBe(examples.length);
  });

  it("keeps repeated helper lookups within a lightweight budget", () => {
    const startedAt = Date.now();
    for (let index = 0; index < 160; index += 1) {
      getRegionSearchExamples("Ashanti");
      getSuggestedLocalities({
        region: "Ashanti",
        recent: [
          {
            name: "Mampong",
            region: "Ashanti",
            district: "Mampong",
            geonameId: 2298264,
          },
        ],
        defaults: [
          {
            name: "Kumasi",
            region: "Ashanti",
            district: "Kumasi",
            geonameId: 2298890,
          },
          {
            name: "Obuase",
            region: "Ashanti",
            district: "Obuasi",
            geonameId: 2296606,
          },
        ],
        limit: 6,
      });
    }
    const durationMs = Date.now() - startedAt;

    expect(durationMs).toBeLessThan(500);
  });
});
