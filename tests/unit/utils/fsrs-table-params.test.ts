import { describe, it, expect } from "vitest";
import { AVAILABLE_FIELDS } from "../../../src/utils/fsrs-table-params";
import { parseSqlBlock } from "../../../src/utils/fsrs-table-params";

describe("fsrs-table-params", () => {
    describe("AVAILABLE_FIELDS", () => {
        it("should contain all expected fields", () => {
            const expectedFields = [
                "file",
                "reps",
                "stability",
                "difficulty",
                "retrievability",
                "due",
                "state",
                "elapsed",
                "scheduled",
            ];

            expect(AVAILABLE_FIELDS.size).toBe(expectedFields.length);

            for (const field of expectedFields) {
                expect(AVAILABLE_FIELDS.has(field)).toBe(true);
            }
        });

        it("should not contain unexpected fields", () => {
            // Ensure we haven't accidentally added extra fields
            const allowedFields = new Set([
                "file",
                "reps",
                "stability",
                "difficulty",
                "retrievability",
                "due",
                "state",
                "elapsed",
                "scheduled",
            ]);

            for (const field of AVAILABLE_FIELDS) {
                expect(allowedFields.has(field)).toBe(true);
            }
        });

        it("should have exactly 9 fields", () => {
            expect(AVAILABLE_FIELDS.size).toBe(9);
        });
    });

    describe("parseSqlBlock", () => {
        it("парсит дефолтный запрос с алиасами и date_format", () => {
            const sql = [
                'SELECT file as " ", difficulty as "D",',
                '       stability as "S", retrievability as "R",',
                "       date_format(due, '%d.%m.%Y') as \"Следующее\"",
                "LIMIT 20",
            ].join("\n");

            const params = parseSqlBlock(sql);

            expect(params.columns).toHaveLength(5);
            expect(params.columns[0]).toMatchObject({
                field: "file",
                title: " ",
            });
            expect(params.columns[1]).toMatchObject({
                field: "difficulty",
                title: "D",
            });
            expect(params.columns[2]).toMatchObject({
                field: "stability",
                title: "S",
            });
            expect(params.columns[3]).toMatchObject({
                field: "retrievability",
                title: "R",
            });
            expect(params.limit).toBe(20);
        });
    });
});
