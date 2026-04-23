// Тест функции replaceReviewsInFrontmatter
// Этот файл можно запустить с помощью Node.js: node test-replace.js

// Пример из реального случая, который продолжает дублироваться:
// ---
// reviews:
// - date: '2023-04-05T21:37:07Z'
//   rating: Hard
//   stability: 131.48
//   difficulty: 9.62
// ---

/**
 * Копия функции replaceReviewsInFrontmatter из src/commands/review/review-card.ts
 * для тестирования без компиляции TypeScript
 */
function replaceReviewsInFrontmatter(frontmatter, reviewsYaml) {
    const lines = frontmatter.split("\n");
    const resultLines = [];
    let i = 0;
    let firstReviewsIndex = -1;
    let firstReviewsIndent = 0;
    let foundAnyReviews = false;

    // Проходим по всем строкам
    while (i < lines.length) {
        const line = lines[i];
        const match = line.match(/^(\s*)reviews\s*:/);

        if (match) {
            foundAnyReviews = true;
            const baseIndent = match[1].length;

            // Запоминаем позицию и отступ первого блока reviews
            if (firstReviewsIndex === -1) {
                firstReviewsIndex = resultLines.length;
                firstReviewsIndent = baseIndent;
            }

            // Пропускаем весь блок reviews
            i++; // Переходим к следующей строке после "reviews:"

            // Пропускаем все строки, которые являются частью блока reviews
            while (i < lines.length) {
                const nextLine = lines[i];
                const indent = nextLine.search(/\S/);

                if (indent === -1) {
                    // Пустая строка - часть блока
                    i++;
                } else if (indent > baseIndent) {
                    // Строка с большим отступом - часть блока
                    i++;
                } else if (
                    indent === baseIndent &&
                    nextLine.substring(indent).startsWith("- ")
                ) {
                    // Строка с тем же отступом, начинающаяся с "- " - элемент YAML списка, часть блока
                    i++;
                } else {
                    // Строка с отступом <= baseIndent и не элемент списка - конец блока
                    break;
                }
            }
            // Продолжаем цикл, не добавляя старый блок в результат
            continue;
        }

        // Если это не блок reviews, добавляем строку в результат
        resultLines.push(line);
        i++;
    }

    // Подготавливаем новый блок reviews с правильным отступом
    const newBlockLines = reviewsYaml.split("\n").map((line) => {
        if (line.trim() === "") return line;
        // Если нашли блок reviews, используем его отступ, иначе без отступа
        const indent = foundAnyReviews ? firstReviewsIndent : 0;
        return " ".repeat(indent) + line;
    });

    // Вставляем новый блок reviews
    if (foundAnyReviews && firstReviewsIndex !== -1) {
        // Вставляем на позицию первого блока
        resultLines.splice(firstReviewsIndex, 0, ...newBlockLines);
    } else {
        // Блоков reviews не было, добавляем в конец
        // Не добавляем пустую строку перед блоком reviews
        resultLines.push(...newBlockLines);
    }

    return resultLines.join("\n");
}

// Вспомогательная функция для сравнения результатов
function testCase(name, frontmatter, reviewsYaml, expected) {
    console.log(`\n=== ${name} ===`);
    const result = replaceReviewsInFrontmatter(frontmatter, reviewsYaml);

    // Нормализуем строки для сравнения (убираем лишние пробелы в конце)
    const normalizedResult = result
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n");
    const normalizedExpected = expected
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n");

    console.log("Результат:");
    console.log(result);
    console.log("\nОжидаемый:");
    console.log(expected);

    const passed = normalizedResult === normalizedExpected;
    console.log(passed ? "✅ PASS" : "❌ FAIL");
    if (!passed) {
        console.log("\nРазличия:");
        console.log("Результат:", JSON.stringify(result));
        console.log("Ожидаемый:", JSON.stringify(expected));
    }
    return passed;
}

// Тестовые данные
const newYaml = `reviews:
  - date: 2025-01-02T12:00:00+00:00
    rating: Good`;

// Тестовые данные для случая без отступа после дефиса (как в реальном примере)
const newYamlNoIndent = `reviews:
- date: 2025-01-02T12:00:00+00:00
  rating: Good`;

// Запуск тестов
console.log("Тестирование функции replaceReviewsInFrontmatter");
console.log("================================================");

let allPassed = true;

// Тест 1: простой блок reviews
const frontmatter1 = `title: Card
reviews:
  - date: 2025-01-01T12:00:00+00:00
    rating: Good
tags: [flashcard]`;
const expected1 = `title: Card
reviews:
  - date: 2025-01-02T12:00:00+00:00
    rating: Good
tags: [flashcard]`;
allPassed =
    testCase(
        "Тест 1: простой блок reviews",
        frontmatter1,
        newYaml,
        expected1,
    ) && allPassed;

// Тест 2: блок reviews с кавычками и Z
const frontmatter2 = `title: Card
reviews:
  - date: '2025-01-01T12:00:00Z'
    rating: Good
tags: [flashcard]`;
const expected2 = `title: Card
reviews:
  - date: 2025-01-02T12:00:00+00:00
    rating: Good
tags: [flashcard]`;
allPassed =
    testCase(
        "Тест 2: блок reviews с кавычками и Z",
        frontmatter2,
        newYaml,
        expected2,
    ) && allPassed;

// Тест 3: блок reviews с пустыми строками внутри
const frontmatter3 = `title: Card
reviews:
  - date: 2025-01-01T12:00:00+00:00
    rating: Good

  - date: 2025-01-02T12:00:00+00:00
    rating: Easy
tags: [flashcard]`;
const expected3 = `title: Card
reviews:
  - date: 2025-01-02T12:00:00+00:00
    rating: Good
tags: [flashcard]`;
allPassed =
    testCase(
        "Тест 3: блок reviews с пустыми строками внутри",
        frontmatter3,
        newYaml,
        expected3,
    ) && allPassed;

// Тест 4: блок reviews в конце frontmatter
const frontmatter4 = `title: Card
reviews:
  - date: 2025-01-01T12:00:00+00:00
    rating: Good`;
const expected4 = `title: Card
reviews:
  - date: 2025-01-02T12:00:00+00:00
    rating: Good`;
allPassed =
    testCase(
        "Тест 4: блок reviews в конце frontmatter",
        frontmatter4,
        newYaml,
        expected4,
    ) && allPassed;

// Тест 5: блок reviews отсутствует
const frontmatter5 = `title: Card
tags: [flashcard]`;
const expected5 = `title: Card
tags: [flashcard]
reviews:
  - date: 2025-01-02T12:00:00+00:00
    rating: Good`;
allPassed =
    testCase(
        "Тест 5: блок reviews отсутствует",
        frontmatter5,
        newYaml,
        expected5,
    ) && allPassed;

// Тест 6: блок reviews с отступом (весь frontmatter с отступом)
const frontmatter6 = `  title: Card
  reviews:
    - date: 2025-01-01T12:00:00+00:00
      rating: Good
  tags: [flashcard]`;
const expected6 = `  title: Card
  reviews:
    - date: 2025-01-02T12:00:00+00:00
      rating: Good
  tags: [flashcard]`;
allPassed =
    testCase(
        "Тест 6: блок reviews с отступом",
        frontmatter6,
        newYaml,
        expected6,
    ) && allPassed;

// Тест 7: несколько блоков reviews (должны быть удалены все)
const frontmatter7 = `title: Card
reviews:
  - date: 2025-01-01T12:00:00+00:00
    rating: Good
reviews:
  - date: 2025-01-02T12:00:00+00:00
    rating: Good
tags: [flashcard]`;
const expected7 = `title: Card
reviews:
  - date: 2025-01-02T12:00:00+00:00
    rating: Good
tags: [flashcard]`;
allPassed =
    testCase(
        "Тест 7: несколько блоков reviews",
        frontmatter7,
        newYaml,
        expected7,
    ) && allPassed;

// Тест 8: reviews с комментарием
const frontmatter8 = `title: Card
reviews: # комментарий
  - date: 2025-01-01T12:00:00+00:00
    rating: Good
tags: [flashcard]`;
const expected8 = `title: Card
reviews:
  - date: 2025-01-02T12:00:00+00:00
    rating: Good
tags: [flashcard]`;
allPassed =
    testCase(
        "Тест 8: reviews с комментарием",
        frontmatter8,
        newYaml,
        expected8,
    ) && allPassed;

// Тест 9: проверка дублирования - симуляция двух повторений
console.log("\n=== Тест 9: проверка дублирования ===");
let frontmatter = `title: Card
reviews:
  - date: 2025-01-01T12:00:00+00:00
    rating: Good`;
const newYaml1 = `reviews:
  - date: 2025-01-02T12:00:00+00:00
    rating: Good`;
const newYaml2 = `reviews:
  - date: 2025-01-03T12:00:00+00:00
    rating: Good`;

let updated = replaceReviewsInFrontmatter(frontmatter, newYaml1);
console.log("После первого повторения:");
console.log(updated);

updated = replaceReviewsInFrontmatter(updated, newYaml2);
console.log("\nПосле второго повторения:");
console.log(updated);

const count = (updated.match(/^reviews\s*:/gm) || []).length;
console.log(`\nКоличество блоков reviews: ${count}`);
if (count === 1) {
    console.log("✅ PASS: нет дублирования");
} else {
    console.log("❌ FAIL: обнаружено дублирование");
    allPassed = false;
}

// Тест 10: сложный случай с вложенными структурами
console.log("\n=== Тест 10: сложный frontmatter ===");
const frontmatter10 = `title: Card
aliases:
  - Note
reviews:
  - date: 2025-01-01T12:00:00+00:00
    rating: Good
    extra:
      field: value
tags:
  - flashcard
  - test`;
const expected10 = `title: Card
aliases:
  - Note
reviews:
  - date: 2025-01-02T12:00:00+00:00
    rating: Good
tags:
  - flashcard
  - test`;
allPassed =
    testCase(
        "Тест 10: сложный frontmatter",
        frontmatter10,
        newYaml,
        expected10,
    ) && allPassed;

// Тест 11: YAML список без отступа после дефиса (реальный случай дублирования)
const frontmatter11 = `reviews:
- date: '2023-04-05T21:37:07Z'
  rating: Hard
  stability: 131.48
  difficulty: 9.62`;
const expected11 = `reviews:
- date: 2025-01-02T12:00:00+00:00
  rating: Good`;
allPassed =
    testCase(
        "Тест 11: YAML список без отступа после дефиса",
        frontmatter11,
        newYamlNoIndent,
        expected11,
    ) && allPassed;

// Тест 12: Смешанный формат с отступами и без
const frontmatter12 = `title: Card
reviews:
- date: '2023-04-05T21:37:07Z'
  rating: Hard
  stability: 131.48
  difficulty: 9.62
tags: [flashcard]`;
const expected12 = `title: Card
reviews:
- date: 2025-01-02T12:00:00+00:00
  rating: Good
tags: [flashcard]`;
allPassed =
    testCase(
        "Тест 12: Смешанный формат с отступами и без",
        frontmatter12,
        newYamlNoIndent,
        expected12,
    ) && allPassed;

// Тест 13: Точный сценарий пользователя с кавычками и Z (продолжает дублироваться)
const frontmatter13 = `reviews:
- date: '2023-04-05T21:37:07Z'
  rating: Hard
  stability: 131.48
  difficulty: 9.62`;
const expected13 = `reviews:
- date: 2025-01-02T12:00:00+00:00
  rating: Good`;
allPassed =
    testCase(
        "Тест 13: Точный сценарий пользователя с кавычками и Z",
        frontmatter13,
        newYamlNoIndent,
        expected13,
    ) && allPassed;

// Тест 14: Несколько блоков reviews в последовательности (реальный случай дублирования)
const frontmatter14 = `reviews:
- date: '2023-04-05T21:37:07Z'
  rating: Hard
  stability: 131.48
  difficulty: 9.62

reviews:
- date: 2023-04-05T21:37:07+00:00
  rating: Hard
  stability: 131.48
  difficulty: 9.62
- date: 2026-04-23T06:23:32.812+00:00
  rating: Hard
  stability: 191.2654393041637
  difficulty: 10.0

- date: '2023-04-05T21:37:07Z'
  rating: Hard
  stability: 131.48
  difficulty: 9.62`;
const expected14 = `reviews:
- date: 2025-01-02T12:00:00+00:00
  rating: Good`;
allPassed =
    testCase(
        "Тест 14: Несколько блоков reviews в последовательности",
        frontmatter14,
        newYamlNoIndent,
        expected14,
    ) && allPassed;

// Итог
console.log("\n================================================");
console.log(
    allPassed
        ? "✅ Все тесты пройдены успешно!"
        : "❌ Некоторые тесты не пройдены",
);
process.exit(allPassed ? 0 : 1);
