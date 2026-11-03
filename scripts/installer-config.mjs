// Antes de generar el instalador de Windows (npm run dist:win): pasa al
// asistente NSIS (build/installer.nsh) la guía de certificados del cliente y
// los certificados que debe comprobar, sacados de sia-instance.json. Así el
// instalador y la app usan la misma configuración. Escribe
// build/installer-config.nsh (generado, fuera del repositorio).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCertsConfig } from '../server/platform/config.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let file = null;
try { file = JSON.parse(fs.readFileSync(path.join(root, 'sia-instance.json'), 'utf8')); } catch { /* sin fichero: sin comprobaciones */ }
const { helpUrl, required } = parseCertsConfig(file);

// Cadena NSIS: $ y " se escapan; el | separa nombres, así que no puede ir dentro de uno.
const nsis = (s) => s.replace(/\$/g, '$$$$').replace(/"/g, '$\\"');
const names = required.filter((n) => !n.includes('|') && !n.includes("'"));
// SIA_SIN_CERTS=1 (pruebas): pide además uno que no existe, para ver el aviso en un equipo que sí los tiene.
if (process.env.SIA_SIN_CERTS === '1') names.push('SIA prueba (no existe)');

const out = [
  '; Generado por scripts/installer-config.mjs desde sia-instance.json: no editar.',
  `!define SIA_CERTS_URL "${nsis(helpUrl)}"`,
  `!define SIA_CERTS_REQUIRED "${nsis(names.join('|'))}"`,
  '',
].join('\r\n');
fs.writeFileSync(path.join(root, 'build', 'installer-config.nsh'), `﻿${out}`); // con BOM: NSIS lo lee como UTF-8
console.log(`[installer] certificados: ${names.length ? names.join(', ') : 'sin comprobar'} · guía: ${helpUrl || 'sin configurar'}`);
