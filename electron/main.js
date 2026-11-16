// SIA: el host de Electron. Arranca el bridge (server/index.js) DENTRO del
// proceso principal y abre la UI (build estático de web/). Todo lo que ya
// funcionaba en dev corre igual: la web recibe los puertos elegidos por
// query string (?ws=&api=).
import { app, BrowserWindow, shell } from 'electron';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

app.setName('SIA');

// Las apps GUI de macOS arrancan con un PATH mínimo (sin /opt/homebrew/bin…),
// y sin él no se encuentran `copilot` ni `gh`. Recuperamos el PATH real
// de la shell de login del usuario antes de arrancar el bridge.
const fixPath = () => {
  if (os.platform() === 'win32') return;
  try {
    const shellBin = process.env.SHELL || '/bin/zsh';
    const real = execFileSync(shellBin, ['-ilc', 'echo -n "$PATH"'], { encoding: 'utf8', timeout: 4000 });
    if (real && real.length > (process.env.PATH || '').length) process.env.PATH = real;
  } catch { /* nos quedamos con el PATH que haya */ }
};

let win = null;
let ports = { ws: '', api: '' }; // los elige el bridge al arrancar
const createWindow = () => {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: 'SIA',
    backgroundColor: '#f5f6f8',
    webPreferences: { contextIsolation: true },
  });
  win.loadFile(path.join(ROOT, 'web', 'dist', 'index.html'), { query: { ws: String(ports.ws), api: String(ports.api) } });
  // los enlaces externos (p. ej. abrir un adjunto) van al navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
};

// instancia única: si SIA ya está abierto, enfocar su ventana en vez de duplicar
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

app.whenReady().then(async () => {
  fixPath();
  // todo lo escribible (skills sync, uploads, borradores, modos) vive en el
  // perfil del usuario — el .app instalado es de solo lectura
  process.env.SIA_WORKSPACE = path.join(app.getPath('userData'), 'workspace');
  const { startBridge } = await import(pathToFileURL(path.join(ROOT, 'server', 'index.js')).href);
  ports = await startBridge();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
