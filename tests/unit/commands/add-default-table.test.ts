import { describe, it, expect } from "vitest";
import { DEFAULT_TABLE_BLOCK } from "../../../src/commands/add-default-table";

// Импортируем findInsertLine — чистая функция, не требует моков
import { findInsertLine } from "../../../src/commands/add-default-table";

describe("findInsertLine (чистая функция)", () => {
    it("находит пустую строку на позиции курсора", () => {
        const lines = ["строка", "", "строка"];
        expect(findInsertLine(lines, 1)).toBe(1);
    });

    it("находит пустую строку ниже курсора", () => {
        const lines = ["строка", "строка", "", "строка"];
        expect(findInsertLine(lines, 0)).toBe(2);
    });

    it("находит строку из пробелов", () => {
        const lines = ["строка", "   ", "строка"];
        expect(findInsertLine(lines, 0)).toBe(1);
    });

    it("находит строку из табов", () => {
        const lines = ["строка", "\t\t", "строка"];
        expect(findInsertLine(lines, 0)).toBe(1);
    });

    it("возвращает lines.length если пустых строк ниже нет", () => {
        const lines = ["строка1", "строка2", "строка3"];
        expect(findInsertLine(lines, 0)).toBe(3);
    });

    it("не ищет выше курсора", () => {
        const lines = ["", "строка", "строка", "строка"];
        // пустая строка есть выше (индекс 0), но курсор на 2 — должны искать вниз
        expect(findInsertLine(lines, 2)).toBe(4); // lines.length
    });

    it("пустой массив возвращает 0", () => {
        expect(findInsertLine([], 0)).toBe(0);
    });

    it("находит пустую строку на последней позиции", () => {
        const lines = ["строка", ""];
        expect(findInsertLine(lines, 1)).toBe(1);
    });
});

describe("DEFAULT_TABLE_BLOCK", () => {
    it("содержит корректный SQL", () => {
        expect(DEFAULT_TABLE_BLOCK).toContain("SELECT file");
        expect(DEFAULT_TABLE_BLOCK).toContain("d as");
        expect(DEFAULT_TABLE_BLOCK).toContain("s as");
        expect(DEFAULT_TABLE_BLOCK).toContain("r as");
        expect(DEFAULT_TABLE_BLOCK).toContain("LIMIT 20");
        expect(DEFAULT_TABLE_BLOCK).toContain("```fsrs-table");
        expect(DEFAULT_TABLE_BLOCK.endsWith("\n")).toBe(true);
    });

    it("корректный фрагмент markdown", () => {
        const lines = DEFAULT_TABLE_BLOCK.trim().split("\n");
        expect(lines[0]).toBe("```fsrs-table");
        expect(lines[lines.length - 1]).toBe("```");
    });
});
