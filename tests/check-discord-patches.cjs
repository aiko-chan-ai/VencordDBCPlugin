const checkPatches = require('./helpers/check-patches.cjs');

async function evaluate(port, expression) {
    let targets;
    try {
        targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
    } catch {
        throw new Error(`No DevTools endpoint on localhost:${port}. Start DBC with --remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`);
    }
    const target = targets.find(item => item.type === 'page' && /^https:\/\/(?:canary\.|ptb\.)?discord\.com\//.test(item.url));
    if (!target) throw new Error('Discord renderer not found. Log into DBC first.');
    const endpoint = new URL(target.webSocketDebuggerUrl);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.protocol !== 'ws:') throw new Error('Expected a localhost DevTools WebSocket');
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(endpoint);
        const finish = (error, value) => { clearTimeout(timeout); socket.close(); error ? reject(error) : resolve(value); };
        const timeout = setTimeout(() => finish(new Error('Timed out inspecting the Discord renderer')), 15000);
        socket.addEventListener('error', () => finish(new Error('DevTools connection failed')));
        socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
            expression, awaitPromise: true, returnByValue: true,
        } })));
        socket.addEventListener('message', event => {
            const response = JSON.parse(event.data);
            if (response.id !== 1) return;
            if (response.error || response.result?.exceptionDetails) finish(new Error('Renderer check failed: ' + (response.error?.message ?? response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text)));
            else finish(null, response.result.result.value);
        });
    });
}

async function main() {
    const port = Number(process.argv[2] ?? 9222);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Expected a DevTools port between 1 and 65535');
    const report = await evaluate(port, `(() => {
        const W = globalThis.Vencord?.Webpack;
        const plugin = globalThis.Vencord?.Plugins.plugins.BotClient;
        if (!W?.wreq?.m || !plugin?.patches?.length) throw Error('Enable BotClient and wait for Discord to load');
        return (${checkPatches.toString()})(plugin.patches, W.wreq.m, globalThis.Vencord.WebpackPatcher?.getBuildNumber() ?? -1);
    })()`);
    for (const result of report) {
        console.log(`${result.status} ${result.find} [${result.modules.join(',') || 'no loaded module'}] (${result.replacements} replacements)`);
        for (const error of result.errors) console.log('  ' + error);
    }
    const failed = report.filter(result => ['FAIL', 'UNLOADED'].includes(result.status));
    console.log(`\n${report.length - failed.length}/${report.length} patches compatible or explicitly disabled. No messages sent; no modules executed.`);
    process.exitCode = failed.length ? 1 : 0;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
