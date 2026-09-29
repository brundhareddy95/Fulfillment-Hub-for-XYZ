#!/bin/sh
# Concatenates src/ into one self-contained index.html (plus dist/combined.jsx for the tests).
set -e
cd "$(dirname "$0")"
mkdir -p dist
cat src/01_data.jsx src/02_helpers.jsx src/03_reducer.jsx src/05_ui.jsx src/06_office.jsx src/07_warehouse.jsx src/08_app.jsx > dist/combined.jsx
cat src/shell_head.html src/04_styles.css src/shell_mid.html dist/combined.jsx src/shell_tail.html > index.html
echo "Built index.html ($(wc -c < index.html) bytes)"
