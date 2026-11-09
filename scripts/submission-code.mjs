import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Produce a portable JS Route Handler from the actual tested TS modules.
 * TypeScript parses imports/exports; no text replacements or second implementation.
 */
export function standaloneRoute() {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const files = [
    'src/lib/public-config.ts',
    'src/lib/panel-pipeline.ts',
    'src/app/api/chapters/[chapterId]/panels/route.ts',
  ];
  const parts = files.map((path, index) => {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const transformed = ts.transform(source, [
      (context) => (node) => {
        function visit(node) {
          if (ts.isImportDeclaration(node)) return undefined;
          // Only the actual route's supported Next.js exports remain public.
          if (index < 2 && node.kind === ts.SyntaxKind.ExportKeyword) return undefined;
          return ts.visitEachChild(node, visit, context);
        }
        return ts.visitNode(node, visit);
      },
    ]);
    try {
      return printer.printFile(transformed.transformed[0]);
    } finally {
      transformed.dispose();
    }
  });
  return ts.transpileModule(
    `import 'server-only';\nimport {createClient} from '@supabase/supabase-js';\n${parts.join('\n')}`,
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    },
  ).outputText;
}
