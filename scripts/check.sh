#!/bin/sh
# Локальный прогон всех проверок перед коммитом.
# Заменяет CI-джобы: cargo fmt, clippy, test, npm test, tsc, eslint, build.
# Запуск: sh scripts/check.sh

set -e

echo "=== 1. cargo fmt ==="
cd wasm-lib
cargo fmt -- --check
cd ..

echo ""
echo "=== 2. cargo clippy ==="
cd wasm-lib
cargo clippy -- -D warnings
cd ..

echo ""
echo "=== 3. cargo test ==="
cd wasm-lib
cargo test
cd ..

echo ""
echo "=== 4. npm run build ==="
npm run build

echo ""
echo "=== 5. npm run lint ==="
npm run lint

echo ""
echo "=== 6. npm test ==="
npm test

echo ""
echo "Все проверки пройдены."
