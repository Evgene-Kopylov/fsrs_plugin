import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";
import eslintComments from "eslint-plugin-eslint-comments";

export default tseslint.config(
    {
        languageOptions: {
            globals: {
                ...globals.browser,
            },
            parserOptions: {
                projectService: {
                    allowDefaultProject: [
                        "eslint.config.js",
                        "manifest.json",
                        "vitest.config.ts",
                    ],
                },
                tsconfigRootDir: import.meta.dirname,
                extraFileExtensions: [".json"],
            },
        },
    },
    ...obsidianmd.configs.recommended,
    {
        plugins: {
            obsidianmd,
        },
        rules: {
            "obsidianmd/ui/sentence-case": [
                "error",
                {
                    acronyms: ["FSRS"],
                    allowAutoFix: true,
                },
            ],
        },
    },
    {
        files: ["src/**/*.ts"],
        plugins: {
            "@typescript-eslint": tseslint.plugin,
            "eslint-comments": eslintComments,
        },
        rules: {
            // Строгие правила типизации
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-argument": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/require-await": "error",

            // Запрет console.log (warn, чтобы не ломать сборку)
            "no-console": "warn",

            // Правила для eslint-disable директив (как в валидаторе Obsidian)
            "eslint-comments/require-description": "error",
            "eslint-comments/no-restricted-disable": [
                "error",
                "@typescript-eslint/no-explicit-any",
            ],

            // no-unsupported-api — warn, т.к. метаданные не всегда точны
            "obsidianmd/no-unsupported-api": "warn",
        },
    },
    globalIgnores([
        "*.cjs",
        "*.js",
        "*.mjs",
        "dist",
        "esbuild.config.mjs",
        "eslint.config.js",
        "main.js",
        "node_modules",
        "scripts/",
        "tests/",
        "vitest.config.ts",
        "version-bump.mjs",
        "versions.json",
        "wasm-lib/pkg/",
        "wasm-lib/public/",
    ]),
);
