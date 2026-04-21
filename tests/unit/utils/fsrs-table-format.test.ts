import { describe, it, expect } from "vitest";
import {
    formatOverdue,
    extractDisplayName,
    translateState,
    createDefaultTableBlock,
    formatError,
} from "../../../src/utils/fsrs-table-format";

describe("fsrs-table-format pure functions", () => {
    describe("formatOverdue", () => {
        it('returns "—" for zero or negative hours', () => {
            expect(formatOverdue(0)).toBe("—");
            expect(formatOverdue(-5)).toBe("—");
        });

        it("formats minutes for less than 1 hour", () => {
            expect(formatOverdue(0.1)).toBe("6м"); // 0.1 * 60 = 6
            expect(formatOverdue(0.5)).toBe("30м");
            expect(formatOverdue(0.9)).toBe("54м");
        });

        it("formats hours for less than 24 hours", () => {
            expect(formatOverdue(1)).toBe("1ч");
            expect(formatOverdue(2.5)).toBe("2.5ч");
            expect(formatOverdue(12)).toBe("12ч");
            expect(formatOverdue(23.9)).toBe("23.9ч");
        });

        it("formats days for 24 hours or more", () => {
            expect(formatOverdue(24)).toBe("1д");
            expect(formatOverdue(48)).toBe("2д");
            expect(formatOverdue(72.5)).toBe("3д");
            expect(formatOverdue(100)).toBe("4.2д"); // 100/24 = 4.166..., округление до десятых
        });
    });

    describe("extractDisplayName", () => {
        it("removes .md extension", () => {
            expect(extractDisplayName("note.md")).toBe("note");
            expect(extractDisplayName("folder/note.md")).toBe("note");
            expect(extractDisplayName("path/to/note.md")).toBe("note");
        });

        it("returns last path component without extension", () => {
            expect(extractDisplayName("folder/subfolder/file.md")).toBe("file");
            expect(extractDisplayName("file")).toBe("file");
            expect(extractDisplayName("file.txt")).toBe("file.txt");
        });

        it("handles edge cases", () => {
            expect(extractDisplayName("")).toBe("");
            expect(extractDisplayName(".md")).toBe("");
            expect(extractDisplayName("path/")).toBe("");
        });
    });

    describe("translateState", () => {
        it("translates known states to Russian", () => {
            expect(translateState("New")).toBe("Новая");
            expect(translateState("Learning")).toBe("Изучение");
            expect(translateState("Review")).toBe("Повторение");
            expect(translateState("Relearning")).toBe("Переучивание");
            expect(translateState("due")).toBe("Повторить");
        });

        it("returns unchanged for unknown state", () => {
            expect(translateState("Unknown")).toBe("Unknown");
            expect(translateState("")).toBe("");
        });
    });

    describe("createDefaultTableBlock", () => {
        it("returns correct fsrs-table block", () => {
            const result = createDefaultTableBlock();
            expect(result).toBe(`\`\`\`fsrs-table
SELECT file, reps, overdue, state, due
LIMIT 20
\`\`\``);
        });
    });

    describe("formatError", () => {
        it("formats error message with dataview style", () => {
            const error = "Something went wrong";
            const result = formatError(error);
            expect(result).toContain("FSRS: Error:");
            expect(result).toContain(
                "-- PARSING FAILED --------------------------------------------------",
            );
            expect(result).toContain(error);
        });

        it("truncates long error messages", () => {
            const longError = "x".repeat(600);
            const result = formatError(longError);
            expect(result).toContain("... [truncated]");
            expect(result.length).toBeLessThan(600);
        });

        it("does not truncate short messages", () => {
            const shortError = "short";
            const result = formatError(shortError);
            expect(result).not.toContain("... [truncated]");
            expect(result).toContain(shortError);
        });
    });
});
