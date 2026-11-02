const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const path = require('node:path');

// Expand files here so the same command works on Windows and Unix, independent of cwd.
const files = readdirSync(__dirname).filter(file => file.endsWith('.test.cjs')).sort().map(file => path.join(__dirname, file));
if (!files.length) throw new Error('No BotClient tests found');
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
