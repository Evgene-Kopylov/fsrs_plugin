import * as fs from "fs/promises";
import * as path from "path";

// Types from the plugin
interface ReviewSession {
    date: string;
    rating: string;
    stability: number;
    difficulty: number;
}

interface CardData {
    reviews: ReviewSession[];
    filePath: string;
}

interface ParseResult {
    success: boolean;
    card: CardData | null;
    error: string | undefined;
}

// Copy of parseYamlValue from fsrs-helper.ts
function parseYamlValue(value: string): any {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;

    const num = Number(value);
    if (!isNaN(num) && value.trim() !== "") {
        return num;
    }

    return value;
}

// Copy of parseYaml from fsrs-helper.ts (with fixes from debugging session)
function parseYaml(yaml: string): any {
    try {
        const lines = yaml.split("\n");
        const stack: Array<{ obj: any; key: string | null; indent: number }> =
            [];
        const root: any = {};
        let current: { obj: any; key: string | null; indent: number } = {
            obj: root,
            key: null,
            indent: -1,
        };
        let i = 0;

        while (i < lines.length) {
            const line = lines[i]!;
            const trimmed = line.trim();

            // Пропускаем пустые строки и комментарии
            if (trimmed === "" || trimmed.startsWith("#")) {
                i++;
                continue;
            }

            // Определяем уровень отступа
            const indent = line.search(/\S/);
            if (indent === -1) {
                i++;
                continue;
            }

            // Возвращаемся на нужный уровень в стеке
            while (
                stack.length > 0 &&
                indent <= stack[stack.length - 1]!.indent
            ) {
                stack.pop();
            }
            if (stack.length > 0) {
                current = stack[stack.length - 1]!;
            } else {
                current = { obj: root, key: null, indent: -1 };
            }

            // Обработка элемента массива
            if (trimmed.startsWith("- ")) {
                const content = trimmed.substring(2).trim();

                // Если текущий объект не массив, создаем его
                if (!Array.isArray(current.obj[current.key!])) {
                    current.obj[current.key!] = [];
                }

                const array = current.obj[current.key!] as any[];

                if (content.includes(":")) {
                    // Объект внутри массива - делим только по первому двоеточию
                    const colonIndex = content.indexOf(":");
                    const key = content.substring(0, colonIndex).trim();
                    const value = content.substring(colonIndex + 1).trim();

                    const item: any = {};
                    item[key] = parseYamlValue(value);
                    array.push(item);

                    // Добавляем в стек для возможных вложенных элементов
                    stack.push({
                        obj: item,
                        key: key,
                        indent: indent,
                    });
                } else {
                    // Простое значение в массиве
                    array.push(parseYamlValue(content));
                }
            } else if (trimmed.includes(":")) {
                // Обработка пары ключ-значение
                const colonIndex = trimmed.indexOf(":");
                const key = trimmed.substring(0, colonIndex).trim();
                let value = trimmed.substring(colonIndex + 1).trim();

                // Проверяем, является ли значение массивом (следующая строка начинается с '-')
                if (value === "" && i + 1 < lines.length) {
                    const nextLine = lines[i + 1]!;
                    const nextIndent = nextLine.search(/\S/);
                    if (
                        nextIndent > indent &&
                        nextLine.trim().startsWith("-")
                    ) {
                        // Это начало массива
                        current.obj[key] = [];
                        stack.push({
                            obj: current.obj,
                            key: key,
                            indent: indent,
                        });
                        i++;
                        continue;
                    }
                }

                // Обычное значение
                current.obj[key] = parseYamlValue(value);

                // Если значение объект (пустая строка после двоеточия), добавляем в стек
                if (value === "" && i + 1 < lines.length) {
                    const nextLine = lines[i + 1]!;
                    const nextIndent = nextLine.search(/\S/);
                    if (nextIndent > indent && nextLine.includes(":")) {
                        current.obj[key] = {};
                        stack.push({
                            obj: current.obj[key],
                            key: null,
                            indent: indent,
                        });
                    }
                }
            }

            i++;
        }

        return root;
    } catch (error) {
        console.error("Ошибка при парсинге YAML:", error);
        return null;
    }
}

// Copy of parseCardDataFromFrontmatter from fsrs-helper.ts
function parseCardDataFromFrontmatter(
    frontmatter: string,
    filePath: string,
): ParseResult {
    try {
        // Пробуем распарсить YAML
        const parsed = parseYaml(frontmatter);
        if (!parsed) {
            return {
                success: false,
                card: null,
                error: "Failed to parse YAML",
            };
        }

        // Проверяем наличие массива reviews
        if (!parsed.reviews || !Array.isArray(parsed.reviews)) {
            return {
                success: false,
                card: null,
                error: "reviews array is missing or invalid",
            };
        }

        // Валидируем каждую сессию
        const reviews: ReviewSession[] = [];
        for (const session of parsed.reviews) {
            if (
                !session.date ||
                session.rating == null ||
                typeof session.stability !== "number" ||
                typeof session.difficulty !== "number"
            ) {
                console.warn(`Invalid review session in ${filePath}:`, session);
                continue;
            }

            reviews.push({
                date: session.date,
                rating: session.rating,
                stability: session.stability,
                difficulty: session.difficulty,
            });
        }

        const card: CardData = {
            reviews,
            filePath,
        };

        return { success: true, card, error: undefined };
    } catch (error) {
        console.error(
            `Ошибка при парсинге FSRS полей из файла ${filePath}:`,
            error,
        );
        return {
            success: false,
            card: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

// Helper to extract frontmatter from markdown content
function extractFrontmatter(content: string): string | null {
    const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
    const match = frontmatterRegex.exec(content);
    return match ? match[1]! : null;
}

// Test cases for YAML parsing
const testYamlCases = [
    {
        name: "Simple YAML with ISO date with colon in timezone",
        yaml: `reviews:
  - date: 2026-04-12T10:30:00+02:00
    rating: Good
    stability: 2.5
    difficulty: 4.8`,
        expectedReviewsLength: 1,
    },
    {
        name: "Multiple reviews",
        yaml: `reviews:
  - date: 2026-05-14T10:00:00
    rating: Good
    stability: 6.5
    difficulty: 3.2
  - date: 2026-05-07T09:00:00
    rating: Easy
    stability: 3.2
    difficulty: 3.0`,
        expectedReviewsLength: 2,
    },
    {
        name: "Empty reviews array",
        yaml: `reviews: []`,
        expectedReviewsLength: 0,
    },
    {
        name: "No reviews field",
        yaml: `title: Test`,
        expectedReviewsLength: undefined,
        shouldFail: true,
    },
    {
        name: "Invalid reviews (not array)",
        yaml: `reviews: not_an_array`,
        expectedReviewsLength: undefined,
        shouldFail: true,
    },
];

async function runYamlTests() {
    console.log("=== Running YAML Parser Tests ===\n");

    let passed = 0;
    let failed = 0;

    for (const testCase of testYamlCases) {
        console.log(`Test: ${testCase.name}`);
        console.log(`YAML:\n${testCase.yaml}\n`);

        try {
            const parsed = parseYaml(testCase.yaml);

            if (testCase.shouldFail) {
                if (parsed && parsed.reviews && Array.isArray(parsed.reviews)) {
                    console.log(
                        "❌ FAIL: Expected parse to fail or reviews invalid, but got valid reviews:",
                        parsed,
                    );
                    failed++;
                } else {
                    console.log("✅ PASS: Parse failed as expected");
                    passed++;
                }
            } else {
                if (!parsed) {
                    console.log("❌ FAIL: Parse returned null");
                    failed++;
                } else if (!Array.isArray(parsed.reviews)) {
                    console.log("❌ FAIL: reviews is not an array");
                    failed++;
                } else if (
                    parsed.reviews.length !== testCase.expectedReviewsLength
                ) {
                    console.log(
                        `❌ FAIL: Expected ${testCase.expectedReviewsLength} reviews, got ${parsed.reviews.length}`,
                    );
                    failed++;
                } else {
                    console.log("✅ PASS: Parsed correctly");
                    console.log(
                        "Parsed structure:",
                        JSON.stringify(parsed, null, 2),
                    );
                    passed++;
                }
            }
        } catch (error) {
            console.log("❌ FAIL: Exception thrown:", error);
            failed++;
        }

        console.log("\n" + "-".repeat(80) + "\n");
    }

    console.log(
        `\n=== YAML Tests Summary: ${passed} passed, ${failed} failed ===`,
    );
}

async function runTestCards() {
    console.log("=== Testing Actual Test Cards ===\n");

    const testCardsDir = path.join(__dirname, "../../../TestCards");

    try {
        const files = await fs.readdir(testCardsDir);
        const mdFiles = files.filter(
            (f) => f.endsWith(".md") && f !== "README.md",
        );

        console.log(`Found ${mdFiles.length} test card files\n`);

        let passed = 0;
        let failed = 0;

        for (const file of mdFiles) {
            const filePath = path.join(testCardsDir, file);
            console.log(`Testing: ${file}`);

            try {
                const content = await fs.readFile(filePath, "utf-8");
                const frontmatter = extractFrontmatter(content);

                if (!frontmatter) {
                    console.log(`  ⚠️  No frontmatter found`);
                    // This might be expected for some test files
                    continue;
                }

                const result = parseCardDataFromFrontmatter(
                    frontmatter,
                    filePath,
                );

                if (result.success) {
                    console.log(`  ✅ Successfully parsed`);
                    console.log(`     Reviews: ${result.card!.reviews.length}`);
                    if (result.card!.reviews.length > 0) {
                        const lastReview =
                            result.card!.reviews[
                                result.card!.reviews.length - 1
                            ]!;
                        console.log(
                            `     Last review: ${lastReview.date} (${lastReview.rating})`,
                        );
                    }
                    passed++;
                } else {
                    console.log(`  ❌ Failed to parse: ${result.error}`);
                    failed++;
                }
            } catch (error) {
                console.log(`  ❌ Error reading/parsing file: ${error}`);
                failed++;
            }

            console.log();
        }

        console.log(
            `\n=== Test Cards Summary: ${passed} passed, ${failed} failed ===`,
        );
    } catch (error) {
        console.error(`Error reading test cards directory: ${error}`);
    }
}

async function main() {
    console.log("FSRS Plugin YAML Parser Debug Tool");
    console.log("===================================\n");

    await runYamlTests();
    console.log("\n\n");
    await runTestCards();

    console.log("\n===================================");
    console.log("Debug tool completed.");
}

// Determine if this module is being run directly
const isMainModule =
    process.argv[1]?.includes("test-parser.ts") ||
    process.argv[1]?.endsWith("test-parser.js");

if (isMainModule) {
    main().catch(console.error);
}

export { parseYaml, parseCardDataFromFrontmatter };
