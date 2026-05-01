import { describe, it, expect } from "vitest";
import {
    extractDisplayName,
    translateState,
    formatError,
} from "../../../src/utils/fsrs-table-format";

describe("fsrs-table-format pure functions", () => {
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
