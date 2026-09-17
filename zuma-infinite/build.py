from pathlib import Path
root = Path(__file__).resolve().parent
parts = []
for name in ('art.js', 'game.js'):
    file = root / name
    if file.exists():
        text = file.read_text()
        assert '</script' not in text.lower(), name
        parts.append('<script>\n' + text + '\n</script>')
html = (root / 'shell.html').read_text().replace('<!-- MODULE_SCRIPTS -->', '\n'.join(parts))
(root / 'index.html').write_text(html)
print(f'Built index.html: {len(html.encode()):,} bytes')
