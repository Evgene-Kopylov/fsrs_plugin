import { describe, it, expect } from "vitest";
import {
    DEFAULT_IGNORE_PATTERNS,
    shouldIgnoreFile,
    shouldIgnoreFileWithSettings,
    formatIgnorePatterns,
    parseIgnorePatterns,
    getAllIgnorePatterns,
} from "../../../src/utils/fsrs/fsrs-filter";

// Mock settings type
interface MockSettings {
    ignore_patterns: string[];
}

describe("fsrs-filter", () => {
    describe("DEFAULT_IGNORE_PATTERNS", () => {
        it("should contain default patterns", () => {
            expect(DEFAULT_IGNORE_PATTERNS).toEqual([
                ".obsidian/",
                "templates/",
                "attachments/",
                "media/",
                "images/",
                "_trash/",
                ".trash/",
                "*.canvas",
                "*.excalidraw.md",
            ]);
        });
    });

    describe("shouldIgnoreFile", () => {
        const defaultPatterns = [".obsidian/", "templates/", "*.excalidraw.md"];

        it("should ignore folder pattern", () => {
            expect(
                shouldIgnoreFile(".obsidian/config.json", defaultPatterns, []),
            ).toBe(true);
            expect(shouldIgnoreFile("notes/test.md", defaultPatterns, [])).toBe(
                false,
            );
            expect(
                shouldIgnoreFile(
                    "some/path/.obsidian/settings.json",
                    defaultPatterns,
                    [],
                ),
            ).toBe(true);
        });

        it("should ignore file extension pattern", () => {
            expect(
                shouldIgnoreFile("drawing.excalidraw.md", defaultPatterns, []),
            ).toBe(true);
            expect(shouldIgnoreFile("note.md", defaultPatterns, [])).toBe(
                false,
            );
            expect(
                shouldIgnoreFile(
                    "folder/drawing.excalidraw.md",
                    defaultPatterns,
                    [],
                ),
            ).toBe(true);
        });

        it("should handle exact filename pattern", () => {
            const patterns = ["specific.md"];
            expect(shouldIgnoreFile("specific.md", patterns, [])).toBe(true);
            expect(shouldIgnoreFile("folder/specific.md", patterns, [])).toBe(
                true,
            );
            expect(shouldIgnoreFile("other.md", patterns, [])).toBe(false);
        });

        it("should combine default and user patterns", () => {
            const userPatterns = ["*.pdf"];
            expect(
                shouldIgnoreFile("document.pdf", defaultPatterns, userPatterns),
            ).toBe(true);
            expect(
                shouldIgnoreFile(
                    ".obsidian/config.json",
                    defaultPatterns,
                    userPatterns,
                ),
            ).toBe(true);
            expect(
                shouldIgnoreFile("note.md", defaultPatterns, userPatterns),
            ).toBe(false);
        });

        it("should ignore empty patterns", () => {
            const patterns = ["", "  ", ".obsidian/"];
            expect(
                shouldIgnoreFile(".obsidian/config.json", patterns, []),
            ).toBe(true);
            expect(shouldIgnoreFile("note.md", patterns, [])).toBe(false);
        });
    });

    describe("formatIgnorePatterns", () => {
        it("should format patterns with newline separator", () => {
            const patterns = [".obsidian/", "*.pdf", "templates/"];
            expect(formatIgnorePatterns(patterns)).toBe(
                ".obsidian/\n*.pdf\ntemplates/",
            );
        });

        it("should filter empty patterns", () => {
            const patterns = ["", ".obsidian/", "  ", "*.pdf"];
            expect(formatIgnorePatterns(patterns)).toBe(".obsidian/\n*.pdf");
        });
    });

    describe("parseIgnorePatterns", () => {
        it("should parse string with newlines into array", () => {
            const input = ".obsidian/\n*.pdf\ntemplates/";
            expect(parseIgnorePatterns(input)).toEqual([
                ".obsidian/",
                "*.pdf",
                "templates/",
            ]);
        });

        it("should trim whitespace and filter empty lines", () => {
            const input = "  .obsidian/  \n\n*.pdf\n  \ntemplates/";
            expect(parseIgnorePatterns(input)).toEqual([
                ".obsidian/",
                "*.pdf",
                "templates/",
            ]);
        });
    });

    describe("getAllIgnorePatterns", () => {
        it("should combine default and user patterns", () => {
            const settings: MockSettings = {
                ignore_patterns: ["*.pdf", "backup/"],
            };
            const all = getAllIgnorePatterns(settings as any);
            expect(all).toEqual([
                ...DEFAULT_IGNORE_PATTERNS,
                "*.pdf",
                "backup/",
            ]);
        });
    });

    describe("shouldIgnoreFileWithSettings", () => {
        it("should use settings patterns", () => {
            const settings: MockSettings = { ignore_patterns: ["*.pdf"] };
            expect(
                shouldIgnoreFileWithSettings("document.pdf", settings as any),
            ).toBe(true);
            expect(
                shouldIgnoreFileWithSettings(
                    ".obsidian/config.json",
                    settings as any,
                ),
            ).toBe(true);
            expect(
                shouldIgnoreFileWithSettings("note.md", settings as any),
            ).toBe(false);
        });
    });
});
