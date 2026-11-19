// build/copilot-cli.cmd con un Copilot y un WinGet de mentira, delante en el
// PATH: nunca se instala nada de verdad. Solo en Windows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'copilot-cli.cmd');
const skip = process.platform !== 'win32' && 'el instalador es de Windows';

// copilot responde si ya está «instalado»; winget apunta cada llamada, «actualiza
// su origen» o sale con FAKE_SOURCE, lo «desinstala» (queda limpio) y lo «instala»
// si está limpio o FAKE_WINGET es 0; si no, sale con FAKE_WINGET (los códigos con
// signo, como los HRESULT de WinGet)
const fakes = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-copilot-'));
  fs.writeFileSync(path.join(dir, 'copilot.cmd'), '@echo off\r\nif exist "%~dp0instalado" (echo GitHub Copilot CLI 9.9.9. & exit /b 0)\r\nexit /b 1\r\n');
  fs.mkdirSync(path.join(dir, 'Packages', 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe', 'LocalState', 'DiagOutputDir'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'winget.cmd'), '@echo off\r\necho %* >> "%~dp0winget-args"\r\nif "%1"=="source" (if defined FAKE_SOURCE_LOG echo LogHr 80072EE7 > "%LOCALAPPDATA%\\Packages\\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\\LocalState\\DiagOutputDir\\WinGet-prueba.log")\r\nif "%1"=="source" exit /b %FAKE_SOURCE%\r\nif "%1"=="uninstall" (type nul > "%~dp0limpio" & exit /b 0)\r\nif exist "%~dp0limpio" (type nul > "%~dp0instalado" & exit /b 0)\r\nif "%FAKE_WINGET%"=="0" (type nul > "%~dp0instalado" & exit /b 0)\r\nexit /b %FAKE_WINGET%\r\n');
  return dir;
};
// en Windows la variable puede venir como PATH o Path: una sola, con los de mentira delante
const withoutPath = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
const run = (dir, { install = false, winget = '0', source = '0', sourceLog = false } = {}) => execFileSync('cmd.exe', ['/d', '/c', SCRIPT, ...(install ? ['-Install'] : [])], { env: { ...withoutPath, Path: `${dir};${process.env.PATH}`, FAKE_WINGET: winget, FAKE_SOURCE: source, LOCALAPPDATA: dir, ...(sourceLog ? { FAKE_SOURCE_LOG: '1' } : {}) }, encoding: 'utf8' }).trim();
const hresult = (hex) => String(parseInt(hex, 16) - 2 ** 32);

test('ya instalado y responde: ok, sin llamar a WinGet', { skip }, () => {
  const dir = fakes();
  fs.writeFileSync(path.join(dir, 'instalado'), '');
  assert.equal(run(dir, { install: true }), 'SIA-COPILOT:ok');
  assert.equal(fs.existsSync(path.join(dir, 'winget-args')), false);
});

test('sin -Install, si no está solo lo dice', { skip }, () => {
  const dir = fakes();
  assert.equal(run(dir), 'SIA-COPILOT:falta');
  assert.equal(fs.existsSync(path.join(dir, 'winget-args')), false);
});

test('con -Install lo instala con WinGet por usuario, sin preguntas, y comprueba que responde', { skip }, () => {
  const dir = fakes();
  assert.equal(run(dir, { install: true }), 'SIA-COPILOT:ok');
  const args = fs.readFileSync(path.join(dir, 'winget-args'), 'utf8');
  for (const a of ['install', '--id GitHub.Copilot', '--exact', '--scope user', '--silent', '--accept-source-agreements', '--accept-package-agreements']) assert.ok(args.includes(a), a);
  assert.equal(args.includes('--disable-interactivity'), false); // no existe en WinGet anteriores a la 1.4
  assert.ok(args.indexOf('source update --name winget') < args.indexOf('install'), 'antes, su origen');
});

test('sin red WinGet no llega a su origen: aviso de descarga al momento, sin intentar instalar', { skip }, () => {
  const dir = fakes();
  assert.equal(run(dir, { install: true, source: hresult('80072EE7') }), 'SIA-COPILOT:descarga');
  assert.equal(fs.readFileSync(path.join(dir, 'winget-args'), 'utf8').includes('install'), false);
  assert.equal(run(fakes(), { install: true, source: hresult('8A15003A') }), 'SIA-COPILOT:politica');
});

test('sin red «source update» acaba bien, pero su registro dice 80072EE7: aviso de descarga, sin instalar', { skip }, () => {
  const dir = fakes();
  assert.equal(run(dir, { install: true, sourceLog: true }), 'SIA-COPILOT:descarga');
  assert.equal(fs.readFileSync(path.join(dir, 'winget-args'), 'utf8').includes('install'), false);
});

test('los fallos de WinGet: política, descarga y cualquier otro con su código', { skip }, () => {
  assert.equal(run(fakes(), { install: true, winget: hresult('8A15003A') }), 'SIA-COPILOT:politica');
  assert.equal(run(fakes(), { install: true, winget: hresult('8A15010F') }), 'SIA-COPILOT:politica');
  assert.equal(run(fakes(), { install: true, winget: hresult('8A150008') }), 'SIA-COPILOT:descarga');
  assert.equal(run(fakes(), { install: true, winget: hresult('8A150045') }), 'SIA-COPILOT:descarga');
  assert.equal(run(fakes(), { install: true, winget: hresult('8A150011') }), 'SIA-COPILOT:error:8A150011');
});

test('un registro roto de Copilot (8A150054): lo desinstala y lo vuelve a instalar, una vez', { skip }, () => {
  const dir = fakes();
  assert.equal(run(dir, { install: true, winget: hresult('8A150054') }), 'SIA-COPILOT:ok');
  const calls = fs.readFileSync(path.join(dir, 'winget-args'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.trim().split(' ')[0]);
  assert.deepEqual(calls, ['source', 'install', 'uninstall', 'install']);
});
