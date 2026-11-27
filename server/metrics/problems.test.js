import test from 'node:test';
import assert from 'node:assert/strict';
import { commonProblem, PROBLEM_NAMES } from './problems.js';

const is = (summary, notes, name) => assert.equal(PROBLEM_NAMES[commonProblem(summary, notes)], name, `${summary} · ${notes}`);

test('problemas comunes: por el título y la descripción del centro, sin la línea de plantilla; el más concreto primero', () => {
  is('100626 Media AYS UK-NORTHAMPTON CADENAS - CLIPPER [ALTA TRANS]', 'Teléfono Contacto: 600\nNecesitamos configuración de los servicios', 'Alta de transporte o transportista');
  is('100711 High PAQUETERIA - Limpieza puesto paletizado', 'Contact Phone: 1\nPlease clean the position', 'Puesto de paletizado (limpiar o liberar)');
  is('100812 Média ECOM - STORAGE [POS] Posiciones', 'Telefone Contato: 1\nCriar posições', 'Crear o modificar posiciones');
  is('x - Pedidos en stock pending', 'Contact Phone: 1\nThe following two orders are stuck in stock pending status', 'Pedidos atascados, pausados o sin avanzar');
  is('x - ', 'Contact Phone: 1\nThese orders contain dangerous goods, please cancel them', 'Cancelar o anular pedidos');
  is('x - Bultos a rechazo', '', 'Contenedores o bultos a rechazo o recirculando');
  is('x - Kleidersortierer (Sorter)\Der Sorter startet nicht', '', 'Automatismo parado (PLC, grúa, shuttle, MSR)');
  is('x - Peticion cambio configuracion mesas', '', 'Mesas y puestos de packing');   // lo concreto (mesas) antes que lo general (configuración)
  is('x - Sisu packing caido', '', 'Lentitud, caídas y errores generales');
  is('x - Algo raro', 'Contact Phone: 1\nHola, os escribimos por lo de ayer.', 'Sin clasificar');
  assert.equal(commonProblem(undefined, undefined), 0);
  assert.equal(PROBLEM_NAMES[0], 'Sin clasificar');
});
