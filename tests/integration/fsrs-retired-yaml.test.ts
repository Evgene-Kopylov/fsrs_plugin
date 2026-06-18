import { describe, it, expect } from "vitest";
import {
    getCardYamlAfterReview,
    getNewCardYaml,
} from "../../src/utils/fsrs/fsrs-wasm";
import type { CardData } from "../../src/interfaces/fsrs";

const now = new Date("2026-06-18T10:00:00Z");

describe("retired: YAML без поля retired", () => {
    it("getCardYamlAfterReview для retired-карточки", () => {
        const card: CardData = {
            filePath: "retired-card.md",
            retired: true,
            reviews: [{ date: "2026-01-01T10:00:00Z", rating: 2 }],
        };

        const yaml = getCardYamlAfterReview(
            card,
            3,
            {
                request_retention: 0.9,
                maximum_interval: 365,
                w: [
                    0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14,
                    0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61,
                ],
            },
            now,
        );

        expect(yaml).not.toContain("retired");
    });

    it("getNewCardYaml для новой карточки", () => {
        const yaml = getNewCardYaml();

        expect(yaml).toContain("reviews");
        expect(yaml).not.toContain("retired");
    });
});
