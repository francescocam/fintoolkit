const { spawn } = require('child_process');

const processes = [];
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runScript(args, label) {
  const child = spawn(npmCmd, args, { stdio: 'inherit' });
  processes.push({ child, label });
  child.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      return;
    }
    if (code !== 0) {
      console.error(`\n[dev] ${label} exited with code ${code}`);
    }
    shutdown(code ?? 0);
  });
  child.on('error', (error) => {
    console.error(`\n[dev] Failed to start ${label}:`, error);
    shutdown(1);
  });
}

function shutdown(code = 0) {
  while (processes.length) {
    const { child } = processes.pop();
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

runScript(['run', '--silent', 'dataroma-screener:server'], 'API server');
runScript(['run', '--silent', 'dev:vite'], 'Vite dev server');
