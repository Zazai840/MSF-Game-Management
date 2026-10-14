// The volunteer first load: the entry chunk and everything it statically imports,
// with their CSS and the assets (fonts) that CSS references. The app-shell worker
// caches exactly these files and the size budget measures exactly these files.
// dynamicImports are intentionally excluded: the lead area is never first-load.
export function firstLoadFiles(manifest) {
  const entry = Object.keys(manifest).find(key => manifest[key].isEntry);
  if (!entry) throw new Error('No volunteer entry in build manifest');
  const seen = new Set(), files = new Set();
  function visit(key) {
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing build chunk: ${key}`);
    if (seen.has(key)) return;
    seen.add(key);
    files.add(chunk.file);
    for (const file of [...(chunk.css || []), ...(chunk.assets || [])]) files.add(file);
    for (const imported of chunk.imports || []) visit(imported);
  }
  visit(entry);
  return [...files];
}
