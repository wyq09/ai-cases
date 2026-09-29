#!/bin/bash
# 构建单文件 park-radar/index.html（parts 顺序拼接）
set -e
cd "$(dirname "$0")"
cat \
  parts/00-head.html \
  parts/10-tokens.css \
  parts/11-components.css \
  parts/12-pages.css \
  parts/13-animations.css \
  parts/20-body.html \
  parts/30-data.js \
  parts/35-icons.js \
  parts/40-core.js \
  parts/45-agent.js \
  parts/50-ui.jsx \
  parts/60-page-list.jsx \
  parts/62-page-detail.jsx \
  parts/64-page-me.jsx \
  parts/66-page-chat.jsx \
  parts/70-app.jsx \
  parts/99-tail.html \
  > index.html
echo "built index.html ($(du -h index.html | cut -f1))"
