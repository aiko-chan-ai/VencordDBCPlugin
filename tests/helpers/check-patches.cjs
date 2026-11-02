// Self-contained so the same verifier can run in Node and inside the app's renderer.
module.exports = function checkPatches(patches, factories, buildNumber = -1) {
    const results = [];
    const sources = Object.entries(factories).map(([id, factory]) => [id, String(factory)]);
    const applies = item => !(item.predicate && !item.predicate()) && (buildNumber < 0
        || ((item.fromBuild == null || buildNumber >= item.fromBuild) && (item.toBuild == null || buildNumber <= item.toBuild)));
    const matches = (source, pattern) => typeof pattern === 'string' ? source.includes(pattern)
        : new RegExp(pattern.source, pattern.flags).test(source);
    const expression = source => `0,${source.startsWith('(') || source.startsWith('function') ? source
        : `function${source.slice(source.indexOf('('))}`}`;
    const edited = new Map();
    for (const patch of patches) {
        const result = { find: String(patch.find), status: 'PASS', modules: [], replacements: 0, errors: [] };
        results.push(result);
        if (!applies(patch)) { result.status = 'SKIP'; continue; }
        const found = sources.filter(([, source]) => matches(source, patch.find));
        result.modules = found.map(([id]) => id);
        if (!found.length) {
            result.status = 'UNLOADED';
            result.errors.push('No matching loaded module; open the relevant view or load its lazy chunk, then retry.');
            continue;
        }
        if (!patch.all && found.length > 1) {
            result.status = 'FAIL';
            result.errors.push('find matches multiple modules; Vencord may consume this patch on the wrong one.');
            continue;
        }
        for (const [id, original] of found) {
            let source = edited.get(id) ?? expression(original);
            for (const [index, replacement] of [patch.replacement].flat().entries()) {
                if (!applies(replacement)) continue;
                const pattern = typeof replacement.match === 'string' ? replacement.match
                    : new RegExp(replacement.match.source, replacement.match.flags);
                const next = source.replace(pattern, replacement.replace);
                if (next === source) {
                    if (patch.group || !(replacement.noWarn || patch.noWarn)) {
                        result.status = 'FAIL';
                        result.errors.push(`${id} replacement ${index + 1} has no effect: ${replacement.match}`);
                    }
                    continue;
                }
                try {
                    // Compile only: never invoke a Discord module or any injected helper.
                    new Function(`return (${next});`);
                    source = next;
                    result.replacements++;
                } catch (error) {
                    result.status = 'FAIL';
                    result.errors.push(`${id} replacement ${index + 1} is invalid JavaScript: ${error.message}`);
                }
            }
            if (!(patch.group && result.status === 'FAIL')) edited.set(id, source);
        }
    }
    return results;
};
