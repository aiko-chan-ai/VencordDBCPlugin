const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

module.exports = function loadTypescript(file, imports = {}, globals = {}) {
    const filename = path.resolve(__dirname, '../..', file);
    const { outputText, diagnostics } = ts.transpileModule(readFileSync(filename, 'utf8'), {
        fileName: filename, reportDiagnostics: true,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    });
    if (diagnostics?.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => process.cwd(), getCanonicalFileName: file => file, getNewLine: () => '\n',
    }));
    const mod = { exports: {} };
    vm.runInNewContext(outputText, {
        module: mod, exports: mod.exports, atob, btoa, Uint8Array, ...globals,
        require(name) {
            if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected import in ${file}: ${name}`);
            return imports[name];
        },
    }, { filename });
    return mod.exports;
};
