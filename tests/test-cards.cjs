const fs = require("fs");
const path = require("path");

// Helper function to parse YAML (simplified from plugin)
function parseYamlValue(valueStr) {
	if (valueStr === "true") return true;
	if (valueStr === "false") return false;
	if (valueStr === "null") return null;
	if (valueStr === "[]") return [];
	if (valueStr === "{}") return {};

	const num = parseFloat(valueStr);
	if (!isNaN(num) && valueStr.trim() === num.toString()) {
		return num;
	}

	if (
		(valueStr.startsWith('"') && valueStr.endsWith('"')) ||
		(valueStr.startsWith("'") && valueStr.endsWith("'"))
	) {
		return valueStr.substring(1, valueStr.length - 1);
	}

	return valueStr;
}

function parseYaml(yaml) {
	try {
		const lines = yaml.split("\n");
		const stack = [];
		const root = {};
		let current = { obj: root, key: null, indent: -1 };
		let i = 0;

		while (i < lines.length) {
			const line = lines[i];
			const trimmed = line.trim();

			if (trimmed === "" || trimmed.startsWith("#")) {
				i++;
				continue;
			}

			const indent = line.search(/\S/);
			if (indent === -1) {
				i++;
				continue;
			}

			while (
				stack.length > 0 &&
				indent <= stack[stack.length - 1].indent
			) {
				stack.pop();
			}
			if (stack.length > 0) {
				current = stack[stack.length - 1];
			} else {
				current = { obj: root, key: null, indent: -1 };
			}

			if (trimmed.startsWith("- ")) {
				const content = trimmed.substring(2).trim();

				if (!Array.isArray(current.obj[current.key])) {
					current.obj[current.key] = [];
				}

				const array = current.obj[current.key];

				if (content.includes(":")) {
					const colonIndex = content.indexOf(":");
					const key = content.substring(0, colonIndex).trim();
					const value = content.substring(colonIndex + 1).trim();

					const item = {};
					item[key] = parseYamlValue(value);
					array.push(item);

					stack.push({
						obj: item,
						key: key,
						indent: indent,
					});
				} else {
					array.push(parseYamlValue(content));
				}
			} else if (trimmed.includes(":")) {
				const colonIndex = trimmed.indexOf(":");
				const key = trimmed.substring(0, colonIndex).trim();
				let value = trimmed.substring(colonIndex + 1).trim();

				if (value === "" && i + 1 < lines.length) {
					const nextLine = lines[i + 1];
					const nextIndent = nextLine.search(/\S/);
					if (
						nextIndent > indent &&
						nextLine.trim().startsWith("-")
					) {
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

				current.obj[key] = parseYamlValue(value);

				if (value === "" && i + 1 < lines.length) {
					const nextLine = lines[i + 1];
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
		console.error("Error parsing YAML:", error);
		return null;
	}
}

// Extract frontmatter from markdown content
function extractFrontmatter(content) {
	const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
	const match = frontmatterRegex.exec(content);
	return match ? match[1] : null;
}

// Parse FSRS card from frontmatter
function parseModernFsrsFromFrontmatter(frontmatter, filePath) {
	try {
		const parsed = parseYaml(frontmatter);
		if (!parsed) {
			return {
				success: false,
				card: null,
				error: "Failed to parse YAML",
			};
		}

		// Check for reviews field - this determines if it's an FSRS card
		if (!parsed.reviews || !Array.isArray(parsed.reviews)) {
			return {
				success: false,
				card: null,
				error: "reviews array is missing or invalid",
			};
		}

		const reviews = [];
		for (const session of parsed.reviews) {
			if (
				!session.date ||
				!session.rating ||
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

		const card = {
			reviews,
			filePath,
		};

		return { success: true, card, error: undefined };
	} catch (error) {
		console.error(`Error parsing FSRS fields from ${filePath}:`, error);
		return {
			success: false,
			card: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

// Main test function
async function testCards() {
	console.log("=== Testing FSRS Plugin YAML Parser ===\n");

	// Go up two directories from plugin folder to find TestCards
	const testCardsDir = path.join(__dirname, "../../../TestCards");
	console.log(`Looking for test cards in: ${testCardsDir}`);

	try {
		const files = fs.readdirSync(testCardsDir);
		const mdFiles = files.filter(
			(f) => f.endsWith(".md") && f !== "README.md",
		);

		console.log(`Found ${mdFiles.length} test card files:\n`);

		let passed = 0;
		let failed = 0;
		let skipped = 0;

		for (const file of mdFiles) {
			const filePath = path.join(testCardsDir, file);
			console.log(`Testing: ${file}`);

			try {
				const content = fs.readFileSync(filePath, "utf-8");
				const frontmatter = extractFrontmatter(content);

				if (!frontmatter) {
					console.log(
						`  ⚠️  No frontmatter found (might be expected)`,
					);
					skipped++;
					continue;
				}

				const result = parseModernFsrsFromFrontmatter(
					frontmatter,
					filePath,
				);

				if (result.success) {
					console.log(`  ✅ Successfully parsed`);
					console.log(`     Reviews: ${result.card.reviews.length}`);
					if (result.card.reviews.length > 0) {
						const lastReview =
							result.card.reviews[result.card.reviews.length - 1];
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

		console.log(`=== Summary ===`);
		console.log(`Total files: ${mdFiles.length}`);
		console.log(`Passed: ${passed}`);
		console.log(`Failed: ${failed}`);
		console.log(`Skipped (no frontmatter): ${skipped}`);

		// Also test the README example
		console.log("\n=== Testing README example ===\n");
		const readmePath = path.join(testCardsDir, "README.md");
		try {
			const readmeContent = fs.readFileSync(readmePath, "utf-8");
			const readmeMatch = /```yaml\n([\s\S]*?)\n```/.exec(readmeContent);
			if (readmeMatch) {
				const exampleYaml = readmeMatch[1];
				console.log("Example YAML from README:");
				console.log(exampleYaml);
				console.log("\nParsing result:");
				const parsed = parseYaml(exampleYaml);
				if (parsed) {
					console.log(JSON.stringify(parsed, null, 2));
					console.log("\n✅ Example parsed successfully");
				} else {
					console.log("❌ Failed to parse example");
				}
			}
		} catch (error) {
			console.log(`Error testing README: ${error}`);
		}
	} catch (error) {
		console.error(`Error reading test cards directory: ${error}`);
		console.log(`Current directory: ${__dirname}`);
	}
}

// Run tests
testCards().catch(console.error);
