from pathlib import Path

root = Path(__file__).resolve().parent
shell = (root / 'src/shell.html').read_text()
modules = []
for name in ['logic', 'art', 'audio', 'config-panel', 'game']:
    code = (root / f'src/{name}.js').read_text()
    assert '</script' not in code.lower(), f'Invalid closing script tag in {name}'
    modules.append(f'<script>\n{code}\n</script>')
assert shell.count('<!-- MODULE_SCRIPTS -->') == 1
output = shell.replace('<!-- MODULE_SCRIPTS -->', '\n'.join(modules))
(root / 'index.html').write_text(output)
print(f'Built index.html: {len(output.encode()) :,} bytes')
