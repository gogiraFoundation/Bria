# Cursor skill links blocked in this checkout

Creating `.cursor/` failed with `EPERM` in this environment. Skills are installed under `.agents/skills/`.

To make Cursor discover them, run locally:

```bash
mkdir -p .cursor/skills
for s in .agents/skills/*/; do
  n=$(basename "$s")
  ln -s "../../.agents/skills/$n" ".cursor/skills/$n"
done
```
