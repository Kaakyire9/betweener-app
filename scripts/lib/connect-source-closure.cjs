/* global __dirname */
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto'), ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
function edgeSourceClosure(entrypoint, read = file => fs.readFileSync(path.join(root, file))) {
  const files = new Map(), external = new Set();
  const visit = file => {
    if (!file.startsWith('supabase/functions/') || file.includes('..') || !file.endsWith('.ts')) throw Error('connect_source_path_invalid');
    if (files.has(file)) return;
    const bytes = read(file); files.set(file, { path: file, sha256: sha256(bytes), bytes });
    const syntax = ts.createSourceFile(file, bytes.toString('utf8'), ts.ScriptTarget.Latest, true);
    const imports = [];
    const walk = node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) throw Error('connect_dynamic_import_unpinned');
        imports.push(node.arguments[0].text);
      }
      ts.forEachChild(node, walk);
    };
    walk(syntax);
    for (const name of imports) {
      if (name.startsWith('.')) visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), name)));
      else external.add(name);
    }
  };
  visit(entrypoint);
  return { files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), external: [...external].sort() };
}
module.exports = { edgeSourceClosure, sha256, root };
