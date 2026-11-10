import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// The commit the app is built from, for problem reports ('dev' where git isn't there).
const version = (() => { try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'; } catch { return 'dev'; } })();

export default defineConfig({ define: { __BTD_VERSION__: JSON.stringify(version) } });
