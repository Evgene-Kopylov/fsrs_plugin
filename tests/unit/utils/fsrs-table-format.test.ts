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
            expect(formatOverdue(0.1)).toBe("6 m"); // 0.1 * 60 = 6
            expect(formatOverdue(0.5)).toBe("30 m");
            expect(formatOverdue(0.9)).toBe("54 m");
        });

        it("formats hours for 1 to 72 hours", () => {
            expect(formatOverdue(1)).toBe("1 h");
            expect(formatOverdue(2.5)).toBe("3 h"); // округление до целого
            expect(formatOverdue(12)).toBe("12 h");
            expect(formatOverdue(23.9)).toBe("24 h"); // округление до целого
            expect(formatOverdue(48)).toBe("48 h");
            expect(formatOverdue(72)).toBe("72 h");
        });

        it("formats days for more than 72 hours", () => {
            expect(formatOverdue(72.5)).toBe("3 d");
            expect(formatOverdue(100)).toBe("4 d"); // 100/24 = 4.166..., округление до целого
            expect(formatOverdue(168)).toBe("7 d"); // ровно неделя
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
        it("returns English state names by default", () => {
            expect(translateState("New")).toBe("New");
            expect(translateState("Learning")).toBe("Learning");
            expect(translateState("Review")).toBe("Review");
            expect(translateState("Relearning")).toBe("Relearning");
            expect(translateState("due")).toBe("Due");
        });

        it("returns state name as fallback for unknown state", () => {
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
