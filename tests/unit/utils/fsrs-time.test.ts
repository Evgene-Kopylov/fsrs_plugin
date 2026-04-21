import { describe, it, expect } from "vitest";
import {
    getRussianNoun,
    formatOverdueTime,
} from "../../../src/utils/fsrs/fsrs-time";

describe("fsrs-time pure functions", () => {
    describe("getRussianNoun", () => {
        it("should return correct form for 1", () => {
            expect(getRussianNoun(1, "день", "дня", "дней")).toBe("день");
            expect(getRussianNoun(1, "час", "часа", "часов")).toBe("час");
            expect(getRussianNoun(1, "карточка", "карточки", "карточек")).toBe(
                "карточка",
            );
        });

        it("should return correct form for 2", () => {
            expect(getRussianNoun(2, "день", "дня", "дней")).toBe("дня");
            expect(getRussianNoun(2, "час", "часа", "часов")).toBe("часа");
            expect(getRussianNoun(2, "карточка", "карточки", "карточек")).toBe(
                "карточки",
            );
        });

        it("should return correct form for 5", () => {
            expect(getRussianNoun(5, "день", "дня", "дней")).toBe("дней");
            expect(getRussianNoun(5, "час", "часа", "часов")).toBe("часов");
            expect(getRussianNoun(5, "карточка", "карточки", "карточек")).toBe(
                "карточек",
            );
        });

        it("should handle numbers 11-19 (special case)", () => {
            expect(getRussianNoun(11, "день", "дня", "дней")).toBe("дней");
            expect(getRussianNoun(12, "час", "часа", "часов")).toBe("часов");
            expect(getRussianNoun(15, "карточка", "карточки", "карточек")).toBe(
                "карточек",
            );
        });

        it("should handle numbers 21-29", () => {
            expect(getRussianNoun(21, "день", "дня", "дней")).toBe("день");
            expect(getRussianNoun(22, "час", "часа", "часов")).toBe("часа");
            expect(getRussianNoun(25, "карточка", "карточки", "карточек")).toBe(
                "карточек",
            );
        });

        it("should handle large numbers", () => {
            expect(getRussianNoun(100, "день", "дня", "дней")).toBe("дней");
            expect(getRussianNoun(101, "день", "дня", "дней")).toBe("день");
            expect(getRussianNoun(102, "день", "дня", "дней")).toBe("дня");
            expect(getRussianNoun(105, "день", "дня", "дней")).toBe("дней");
        });

        it("should handle zero and negative numbers", () => {
            expect(getRussianNoun(0, "день", "дня", "дней")).toBe("дней");
            expect(getRussianNoun(-1, "день", "дня", "дней")).toBe("день");
            expect(getRussianNoun(-2, "день", "дня", "дней")).toBe("дня");
            expect(getRussianNoun(-5, "день", "дня", "дней")).toBe("дней");
        });
    });

    describe("formatOverdueTime", () => {
        it('should return "по графику" for zero or negative hours', () => {
            expect(formatOverdueTime(0)).toBe("по графику");
            expect(formatOverdueTime(-5)).toBe("по графику");
        });

        it("should format hours less than 24", () => {
            expect(formatOverdueTime(1)).toBe("1 час");
            expect(formatOverdueTime(2)).toBe("2 часа");
            expect(formatOverdueTime(5)).toBe("5 часов");
            expect(formatOverdueTime(12)).toBe("12 часов");
            expect(formatOverdueTime(23)).toBe("23 часа");
        });

        it("should format days only (exact multiples of 24)", () => {
            expect(formatOverdueTime(24)).toBe("1 день");
            expect(formatOverdueTime(48)).toBe("2 дня");
            expect(formatOverdueTime(72)).toBe("3 дня");
            expect(formatOverdueTime(96)).toBe("4 дня");
            expect(formatOverdueTime(120)).toBe("5 дней");
        });

        it("should format days and hours", () => {
            expect(formatOverdueTime(25)).toBe("1 день 1 час");
            expect(formatOverdueTime(26)).toBe("1 день 2 часа");
            expect(formatOverdueTime(30)).toBe("1 день 6 часов");
            expect(formatOverdueTime(49)).toBe("2 дня 1 час");
            expect(formatOverdueTime(73)).toBe("3 дня 1 час");
        });

        it("should handle decimal hours", () => {
            // функция использует Math.floor для дней, но оставляет дробные часы
            expect(formatOverdueTime(1.5)).toBe("1.5 часа");
            expect(formatOverdueTime(24.5)).toBe("1 день 0.5 часов");
            expect(formatOverdueTime(25.7)).toBe("1 день 1.7 часа");
        });

        it("should handle large values", () => {
            expect(formatOverdueTime(1000)).toBe("41 день 16 часов");
            // 1000 / 24 = 41.666... дней => 41 дней, остаток 16 часов
            // 41 дней: 41 % 100 = 41, 41 % 10 = 1 => "день"
            // 16 часов: 16 % 100 = 16 (11-19) => "часов"
        });
    });
});
