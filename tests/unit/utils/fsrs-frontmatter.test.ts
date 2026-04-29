import { describe, it, expect } from "vitest";
import {
    extractFrontmatter,
    extractFrontmatterWithMatch,
    createFrontmatter,
    updateFrontmatterInContent,
    removeFrontmatterFromContent,
} from "../../../src/utils/fsrs/fsrs-frontmatter";

describe("fsrs-frontmatter", () => {
    describe("extractFrontmatter", () => {
        it("should extract frontmatter content at file start", () => {
            const content = `---
reviews:
  - date: "2026-01-01"
    rating: Good
tags: test
---

Some markdown content`;
            const result = extractFrontmatter(content);
            expect(result).toBe(`
reviews:
  - date: "2026-01-01"
    rating: Good
tags: test
`);
        });

        it("should return null when no frontmatter", () => {
            const content = "No frontmatter here";
            expect(extractFrontmatter(content)).toBeNull();
        });

        it("should handle empty frontmatter at file start", () => {
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

        it("should return null when frontmatter is not at file start", () => {
            const content = `Some text before frontmatter
---
reviews: []
---
Body`;
            expect(extractFrontmatter(content)).toBeNull();
        });

        it("should return null when frontmatter has leading whitespace", () => {
            const content = `
---
reviews: []
---
Body`;
            expect(extractFrontmatter(content)).toBeNull();
        });

        it("should return null when frontmatter is indented", () => {
            const content = `    ---
    reviews: []
    ---

This is indented, not a real frontmatter.`;
            expect(extractFrontmatter(content)).toBeNull();
        });

        it("should return null when frontmatter appears as code example", () => {
            const content = `Here is an example of frontmatter in markdown:

\`\`\`yaml
---
reviews:
  - date: "2026-01-01"
    rating: Good
---
\`\`\`

This is not a real frontmatter.`;
            expect(extractFrontmatter(content)).toBeNull();
        });
    });

    describe("extractFrontmatterWithMatch", () => {
        it("should extract frontmatter with match object at file start", () => {
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

        it("should return null when frontmatter is not at file start", () => {
            const content = `Some text before frontmatter
---
reviews: []
---
Body`;
            expect(extractFrontmatterWithMatch(content)).toBeNull();
        });

        it("should return null when frontmatter has leading whitespace", () => {
            const content = `
---
reviews: []
---
Body`;
            expect(extractFrontmatterWithMatch(content)).toBeNull();
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

        it("should handle content without frontmatter but with leading whitespace", () => {
            const content = "   Some content";
            const newYaml = "title: Added";
            const result = updateFrontmatterInContent(content, newYaml);
            expect(result).toContain("---\ntitle: Added\n---\n   Some content");
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

        it("should handle content with only frontmatter", () => {
            const content = `---
title: Test
---`;
            expect(removeFrontmatterFromContent(content)).toBe("");
        });
    });
});
