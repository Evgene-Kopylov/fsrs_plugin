import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.js", "manifest.json"],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
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
		"version-bump.mjs",
		"versions.json",
		"wasm-lib/pkg/",
		"wasm-lib/public/",
	]),
);
