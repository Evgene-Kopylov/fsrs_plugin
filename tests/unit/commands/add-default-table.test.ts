import { describe, it, expect } from "vitest";
import {
    addDefaultTableToContent,
    DEFAULT_TABLE_BLOCK,
} from "../../../src/commands/add-default-table";

describe("addDefaultTableToContent (чистая функция)", () => {
    const EXPECTED_PREFIX = "\n" + DEFAULT_TABLE_BLOCK + "\n";

    it("добавляет блок в пустую строку", () => {
        const result = addDefaultTableToContent("");
        expect(result).toBe(EXPECTED_PREFIX);
    });

    it("добавляет блок перед простым содержимым", () => {
        const result = addDefaultTableToContent("Простой контент");
        expect(result).toBe(EXPECTED_PREFIX + "Простой контент");
    });

    it("добавляет блок перед содержимым с frontmatter", () => {
        const content = `---
title: Тест
tags: fsrs
---

Основной текст заметки.`;
        const result = addDefaultTableToContent(content);
        expect(result).toBe(EXPECTED_PREFIX + content);
    });

    it("добавляет блок перед содержимым с ведущими пробелами", () => {
        const content = "   текст с отступом";
        const result = addDefaultTableToContent(content);
        expect(result).toBe(EXPECTED_PREFIX + content);
    });

    it("добавляет блок перед многострочным содержимым", () => {
        const content = `строка 1
строка 2
строка 3`;
        const result = addDefaultTableToContent(content);
        expect(result).toBe(EXPECTED_PREFIX + content);
    });

    it("сохраняет trailing newline исходного содержимого", () => {
        const content = "текст с переносом\n";
        const result = addDefaultTableToContent(content);
        expect(result).toBe(EXPECTED_PREFIX + content);
    });

    it("содержимое не изменяется при повторном вызове", () => {
        const content = "один вызов";
        const first = addDefaultTableToContent(content);
        const second = addDefaultTableToContent(first);
        expect(second).toBe(EXPECTED_PREFIX + first);
        // второй вызов не затирает первый блок
        expect(second).toContain(DEFAULT_TABLE_BLOCK);
        expect(second).toContain(content);
    });

    it("блок начинается с пустой строки", () => {
        const content = "test";
        const result = addDefaultTableToContent(content);
        expect(result.startsWith("\n")).toBe(true);
    });

    it("между блоком и содержимым есть пустая строка", () => {
        const content = "test";
        const result = addDefaultTableToContent(content);
        // после блока идёт \n, потом содержимое
        const blockEnd = "\n" + DEFAULT_TABLE_BLOCK + "\n";
        expect(result).toBe(blockEnd + content);
    });

    it("DEFAULT_TABLE_BLOCK содержит корректный SQL", () => {
        expect(DEFAULT_TABLE_BLOCK).toContain("SELECT file");
        expect(DEFAULT_TABLE_BLOCK).toContain("retrievability");
        expect(DEFAULT_TABLE_BLOCK).toContain("LIMIT 20");
        expect(DEFAULT_TABLE_BLOCK).toContain("```fsrs-table");
        expect(DEFAULT_TABLE_BLOCK.endsWith("\n")).toBe(true);
    });

    it("DEFAULT_TABLE_BLOCK — корректный фрагмент markdown", () => {
        // блок должен начинаться с ``` и заканчиваться ```
        const lines = DEFAULT_TABLE_BLOCK.trim().split("\n");
        expect(lines[0]).toBe("```fsrs-table");
        expect(lines[lines.length - 1]).toBe("```");
    });

    it("перед блоком ровно одна пустая строка", () => {
        const result = addDefaultTableToContent("test");
        // индекс первого вхождения блока
        const idx = result.indexOf(DEFAULT_TABLE_BLOCK);
        expect(idx).toBe(1); // \n (1 символ) перед блоком
        expect(result[idx - 1]).toBe("\n");
        // перед этим \n нет второго \n подряд
        expect(result.startsWith("\n\n")).toBe(false);
    });

    it("после блока не менее одной пустой строки", () => {
        const content = "test";
        const result = addDefaultTableToContent(content);
        // блок заканчивается на \n, после него идёт \n (разделитель), потом контент
        const idxAfterBlock =
            result.indexOf(DEFAULT_TABLE_BLOCK) + DEFAULT_TABLE_BLOCK.length;
        expect(result[idxAfterBlock]).toBe("\n");
        // после разделителя сразу начинается контент
        expect(result.slice(idxAfterBlock + 1)).toBe(content);
    });
});
