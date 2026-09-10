#!/usr/bin/env bash
# 单文件构建：src/shell.html + src/{art,audio,fx,game}.js -> index.html
set -e
cd "$(dirname "$0")"
python3 build.py
