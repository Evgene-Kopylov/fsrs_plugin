#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

console.log("=== Testing get_fsrs_yaml Output ===\n");

// Path to the WASM module
const wasmModulePath = path.join(
    __dirname,
    "..",
    "wasm-lib",
    "pkg",
    "wasm_lib.js",
);

// Expected YAML output - should not contain srs: true
const expectedPatterns = [
    {
        pattern: /^reviews:\s*$/m,
        description: "Should start with reviews field",
    },
    {
        pattern: /^  - /m,
        optional: true,
        description: "May contain array items (optional)",
    },
];

const forbiddenPatterns = [
    {
        pattern: /srs:\s*true/,
        description: "Should NOT contain srs: true field",
    },
    {
        pattern: /srs:\s*false/,
        description: "Should NOT contain srs: false field",
    },
    { pattern: /^srs:/m, description: "Should NOT contain srs field at all" },
];

async function runTest() {
    console.log("1. Checking WASM module existence...");
    if (!fs.existsSync(wasmModulePath)) {
        console.log(`   ⚠️  WASM module not found at: ${wasmModulePath}`);
        console.log(
            '   ℹ️  Run "npm run build-wasm" first to build the module',
        );
        return;
    }
    console.log("   ✅ WASM module found\n");

    console.log("2. Testing YAML output format...");

    try {
        // Dynamically import the WASM module
        const wasmModule = require(wasmModulePath);

        // Initialize WASM if needed
        if (wasmModule.default && typeof wasmModule.default === "function") {
            await wasmModule.default();
        }

        // Call get_fsrs_yaml function
        const yamlOutput = wasmModule.get_fsrs_yaml();

        console.log("   Raw YAML output:");
        console.log("   " + "─".repeat(50));
        console.log(yamlOutput);
        console.log("   " + "─".repeat(50) + "\n");

        // Check expected patterns
        console.log("3. Validating YAML structure...");
        let allPassed = true;

        for (const { pattern, description, optional } of expectedPatterns) {
            const match = pattern.test(yamlOutput);
            if (match) {
                console.log(`   ✅ ${description}`);
            } else if (optional) {
                console.log(`   ⚠️  ${description} (optional, not found)`);
            } else {
                console.log(`   ❌ ${description}`);
                allPassed = false;
            }
        }

        // Check forbidden patterns
        console.log("\n4. Checking for removed srs field...");
        for (const { pattern, description } of forbiddenPatterns) {
            const match = pattern.test(yamlOutput);
            if (match) {
                console.log(`   ❌ ${description}`);
                allPassed = false;
            } else {
                console.log(`   ✅ ${description}`);
            }
        }

        // Additional validation
        console.log("\n5. Additional validation...");

        // Check if it's valid YAML (basic check)
        if (yamlOutput.includes("reviews:")) {
            console.log('   ✅ Contains "reviews:" field');

            // Try to parse as YAML if js-yaml is available
            try {
                const yaml = require("js-yaml");
                const parsed = yaml.load(yamlOutput);

                if (parsed && typeof parsed === "object") {
                    console.log("   ✅ Valid YAML structure");

                    if (Array.isArray(parsed.reviews)) {
                        console.log('   ✅ "reviews" is an array');
                    } else {
                        console.log('   ❌ "reviews" is not an array');
                        allPassed = false;
                    }

                    if (parsed.srs !== undefined) {
                        console.log(
                            "   ❌ Contains srs field (should be removed)",
                        );
                        allPassed = false;
                    } else {
                        console.log("   ✅ No srs field present");
                    }
                } else {
                    console.log("   ❌ Invalid YAML structure");
                    allPassed = false;
                }
            } catch (error) {
                console.log(
                    `   ⚠️  Cannot parse YAML (js-yaml not installed or error): ${error.message}`,
                );
                console.log(
                    "   ℹ️  Install js-yaml for full validation: npm install js-yaml",
                );
            }
        } else {
            console.log('   ❌ Missing "reviews:" field');
            allPassed = false;
        }

        // Summary
        console.log("\n" + "=".repeat(60));
        if (allPassed) {
            console.log("✅ All tests passed! YAML output format is correct.");
        } else {
            console.log("❌ Some tests failed. Check the output above.");
            process.exit(1);
        }
    } catch (error) {
        console.error(`   ❌ Error testing WASM module: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

// Handle promise rejection
runTest().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
});
