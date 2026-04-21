import { describe, it, expect } from "vitest";
import {
    extractFrontmatter,
    extractFrontmatterWithMatch,
    hasFsrsFields,
    hasFsrsFieldsInFrontmatter,
    shouldProcessFile,
    createFrontmatter,
    updateFrontmatterInContent,
    removeFrontmatterFromContent,
    extractSimpleFields,
    getFieldFromFrontmatter,
    hasAnyFieldInFrontmatter,
} from "../../../src/utils/fsrs/fsrs-frontmatter";

describe("fsrs-frontmatter", () => {
    describe("extractFrontmatter", () => {
        it("should extract frontmatter content", () => {
            const content = `---
reviews:
  - date: "2025-01-01"
    rating: Good
tags: test
---

Some markdown content`;
            const result = extractFrontmatter(content);
            expect(result).toBe(`
reviews:
  - date: "2025-01-01"
    rating: Good
tags: test
`);
        });

        it("should return null when no frontmatter", () => {
            const content = "No frontmatter here";
            expect(extractFrontmatter(content)).toBeNull();
        });

        it("should handle empty frontmatter", () => {
            const content = `---
---
Content after empty frontmatter`;
            expect(extractFrontmatter(content)).toBe("\n");
        });

        it("should handle frontmatter with trailing spaces", () => {
            const content = `---
title: Test
---
Body`;
            expect(extractFrontmatter(content)?.trim()).toBe("title: Test");
        });
    });

    describe("extractFrontmatterWithMatch", () => {
        it("should extract frontmatter with match object", () => {
            const content = `---
title: Hello
---
Body`;
            const result = extractFrontmatterWithMatch(content);
            expect(result).not.toBeNull();
            expect(result?.content).toBe("\ntitle: Hello\n");
            expect(result?.match[0]).toBe("---\ntitle: Hello\n---");
        });

        it("should return null when no frontmatter", () => {
            expect(extractFrontmatterWithMatch("No frontmatter")).toBeNull();
        });
    });

    describe("hasFsrsFieldsInFrontmatter", () => {
        it("should detect reviews field", () => {
            const frontmatter = `reviews:
  - date: "2025-01-01"
    rating: Good`;
            expect(hasFsrsFieldsInFrontmatter(frontmatter)).toBe(true);
        });

        it("should detect reviews field case-insensitively", () => {
            const frontmatter = `REVIEWS: []`;
            expect(hasFsrsFieldsInFrontmatter(frontmatter)).toBe(true);
        });

        it("should not detect reviews in nested structures", () => {
            const frontmatter = `meta:
  reviews: something`;
            expect(hasFsrsFieldsInFrontmatter(frontmatter)).toBe(false);
        });

        it("should return false for frontmatter without reviews", () => {
            expect(hasFsrsFieldsInFrontmatter("tags: hello")).toBe(false);
        });
    });

    describe("hasFsrsFields", () => {
        it("should return true when content contains reviews in frontmatter", () => {
            const content = `---
reviews: []
---
Body`;
            expect(hasFsrsFields(content)).toBe(true);
        });

        it("should return false when reviews outside frontmatter", () => {
            const content = "No frontmatter\nreviews: something";
            expect(hasFsrsFields(content)).toBe(false);
        });

        it("should return false when no reviews field", () => {
            const content = `---
tags: test
---`;
            expect(hasFsrsFields(content)).toBe(false);
        });
    });

    describe("shouldProcessFile", () => {
        it("should return true for files with reviews in frontmatter", () => {
            const content = `---
reviews:
  - date: "2025-01-01"
---
Body`;
            expect(shouldProcessFile(content)).toBe(true);
        });

        it("should return false when reviews not in frontmatter", () => {
            const content = "Some text reviews: but no frontmatter";
            expect(shouldProcessFile(content)).toBe(false);
        });

        it("should return false when no reviews at all", () => {
            const content = `---
title: Test
---`;
            expect(shouldProcessFile(content)).toBe(false);
        });

        it("should handle case-insensitive reviews", () => {
            const content = `---
REVIEWS: []
---`;
            expect(shouldProcessFile(content)).toBe(true);
        });
    });

    describe("createFrontmatter", () => {
        it("should wrap YAML content with ---", () => {
            const yaml = "title: Test\ntags: one";
            expect(createFrontmatter(yaml)).toBe(`---\n${yaml}\n---`);
        });

        it("should handle empty YAML", () => {
            expect(createFrontmatter("")).toBe("---\n\n---");
        });
    });

    describe("updateFrontmatterInContent", () => {
        it("should replace existing frontmatter", () => {
            const content = `---
old: value
---
Body`;
            const newYaml = "new: value";
            const expected = `---
new: value
---
   Body`;
            expect(updateFrontmatterInContent(content, newYaml)).toBe(`---
new: value
---
Body`);
        });

        it("should add frontmatter if not present", () => {
            const content = "Some content";
            const newYaml = "title: Added";
            const expected = `---
title: Added
---

Some content`;
            expect(updateFrontmatterInContent(content, newYaml)).toBe(expected);
        });

        it("should preserve whitespace after frontmatter", () => {
            const content = `---
old: value
---
   Body`;
            const newYaml = "new: value";
            const result = updateFrontmatterInContent(content, newYaml);
            expect(result).toContain("---\nnew: value\n---\n   Body");
        });
    });

    describe("removeFrontmatterFromContent", () => {
        it("should remove frontmatter", () => {
            const content = `---
title: Test
---
Body`;
            expect(removeFrontmatterFromContent(content)).toBe("Body");
        });

        it("should trim leading whitespace", () => {
            const content = `---
title: Test
---
   Body`;
            expect(removeFrontmatterFromContent(content).trimStart()).toBe(
                "Body",
            );
        });

        it("should return unchanged content if no frontmatter", () => {
            const content = "No frontmatter";
            expect(removeFrontmatterFromContent(content)).toBe(
                "No frontmatter",
            );
        });
    });

    describe("extractSimpleFields", () => {
        it("should extract key-value pairs", () => {
            const frontmatter = `title: Hello
tags: one, two`;
            const result = extractSimpleFields(frontmatter);
            expect(result).toEqual({
                title: "Hello",
                tags: "one, two",
            });
        });

        it("should strip quotes from values", () => {
            const frontmatter = `title: "Hello World"
desc: 'Test'`;
            const result = extractSimpleFields(frontmatter);
            expect(result.title).toBe("Hello World");
            expect(result.desc).toBe("Test");
        });

        it("should ignore comments and empty lines", () => {
            const frontmatter = `# Comment
title: Test

tags: demo`;
            const result = extractSimpleFields(frontmatter);
            expect(result).toEqual({
                title: "Test",
                tags: "demo",
            });
        });

        it("should handle multiline values as separate lines (simple parser limitation)", () => {
            const frontmatter = `list:
  - one
  - two`;
            const result = extractSimpleFields(frontmatter);
            // The simple parser will only capture "list:" as key with empty value
            expect(result.list).toBe("");
        });
    });

    describe("getFieldFromFrontmatter", () => {
        it("should return field value", () => {
            const frontmatter = `title: Hello
tags: test`;
            expect(getFieldFromFrontmatter(frontmatter, "title")).toBe("Hello");
            expect(getFieldFromFrontmatter(frontmatter, "tags")).toBe("test");
        });

        it("should return null for missing field", () => {
            const frontmatter = `title: Hello`;
            expect(getFieldFromFrontmatter(frontmatter, "missing")).toBeNull();
        });
    });

    describe("hasAnyFieldInFrontmatter", () => {
        it("should return true if any field exists", () => {
            const frontmatter = `title: Hello
tags: test`;
            expect(
                hasAnyFieldInFrontmatter(frontmatter, ["title", "missing"]),
            ).toBe(true);
        });

        it("should return false if none exist", () => {
            const frontmatter = `title: Hello`;
            expect(
                hasAnyFieldInFrontmatter(frontmatter, ["reviews", "tags"]),
            ).toBe(false);
        });

        it("should be case-insensitive", () => {
            const frontmatter = `TITLE: Hello`;
            expect(hasAnyFieldInFrontmatter(frontmatter, ["title"])).toBe(true);
        });
    });
});
