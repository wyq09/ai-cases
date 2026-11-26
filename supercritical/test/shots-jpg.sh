#!/bin/bash
# Convert the PNGs written by test/ui-verify.mjs into the JPEGs the README embeds, then drop the PNGs.
# usage: bash supercritical/test/shots-jpg.sh
cd "$(dirname "$0")/../shots" || exit 1
shopt -s nullglob
for f in *.png; do
  sips -s format jpeg -s formatOptions 88 "$f" --out "${f%.png}.jpg" >/dev/null 2>&1 && rm -f "$f"
done
ls -la
