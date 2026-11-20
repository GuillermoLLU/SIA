import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data } from './fixture.js';
import { COLORS, defaultColors, freeColor, dayOf, coverage, freeCompany, withoutSide, togglePerson, filterKey, pickSys, teamPeopleOf, sidesOfPeople } from './view.js';

test('colores: los dos de partida y el primero libre', () => {
  assert.deepEqual(defaultColors(), [COLORS[0][0], COLORS[1][0]]);
  assert.equal(freeColor(COLORS[0][0]), COLORS[1][0]);
  assert.equal(freeColor(COLORS[1][0]), COLORS[0][0]);
});

test('la fecha de carga, en UTC', () => {
  assert.equal(dayOf('2026-10-14T23:30:00Z'), '14 de oct');
  assert.equal(dayOf('2026-01-01T00:10:00Z'), '1 de ene');
});

test('la empresa libre para un lado nuevo: la primera que no tenga el otro', () => {
  assert.deepEqual(freeCompany({ company: 0 }), { company: 1 });
  assert.deepEqual(freeCompany({ company: 1 }), { company: 0 });
  assert.deepEqual(freeCompany({ people: new Set([1]) }), { company: 0 });
  assert.deepEqual(freeCompany(null), { company: 0 });
});

test('quitar un lado: queda el otro como A, con su color', () => {
  const sides = [{ company: 0 }, { company: 1 }], colors = ['a', 'b'];
  assert.deepEqual(withoutSide(sides, colors, 0), { sides: [{ company: 1 }, null], colors: ['b', 'a'] });
  assert.deepEqual(withoutSide(sides, colors, 1), { sides: [{ company: 0 }, null], colors: ['a', 'b'] });
});

test('marcar personas: se añaden y se quitan; sin ninguna, una empresa libre', () => {
  assert.deepEqual(togglePerson([{ company: 0 }, { company: 1 }], 0, 5), { people: new Set([5]) });
  assert.deepEqual(togglePerson([{ people: new Set([5]) }, { company: 1 }], 0, 7), { people: new Set([5, 7]) });
  assert.deepEqual(togglePerson([{ people: new Set([5]) }, { company: 1 }], 0, 5), { company: 0 });
});

test('el periodo entre dos meses, en cualquier orden, y las claves de los filtros', () => {
  assert.deepEqual(filterKey('mo:12'), ['mo', 12]);
  assert.deepEqual(filterKey('month:0'), ['month', 0]);
});

test('cobertura: el periodo elegido, recortado a la primera y la última apertura', () => {
  const m = createModel(data()), at = (mo, d) => (Date.UTC(2026, mo, d) - Date.UTC(2026, 0, 1)) / 6e4;
  assert.equal(coverage(m), 'Datos desde 01/01/2026 hasta 11/03/2026');
  m.setPeriod(at(0, 15), at(1, 16));
  assert.equal(coverage(m), 'Datos desde 15/01/2026 hasta 15/02/2026');
  m.setPeriod(at(2, 5), at(2, 12));
  assert.equal(coverage(m), 'Datos desde 05/03/2026 hasta 11/03/2026');
  const d = data(); d.meta.last = at(2, 3);
  const early = createModel(d);
  early.setPeriod(at(2, 5), at(2, 12));
  assert.equal(coverage(early), 'Sin incidencias del 05/03/2026 al 11/03/2026');
});

test('cobertura con más de un año', () => {
  const d = data(), year = 365 * 1440;
  d.meta.start = 2025; d.meta.first = 0; d.meta.last = 99800 + year; d.meta.snapshot += year;
  const m = createModel(d);
  assert.equal(coverage(m), 'Datos desde 01/01/2025 hasta 11/03/2026');   // sin elegir, todo lo cargado
  m.resetPeriod();
  assert.equal(coverage(m), 'Datos desde 01/03/2025 hasta 11/03/2026');   // el de partida: desde el mes de la abierta más antigua
  m.setPeriod(m.MIN_D, m.END_D);
  assert.equal(coverage(m), 'Datos desde 01/01/2025 hasta 11/03/2026');
  m.setPeriod(0, year);
  assert.equal(coverage(m), 'Datos desde 01/01/2025 hasta 31/12/2025');
});

test('Quitar filtros: si hay alguno (de la barra, la búsqueda o de una pestaña) y quitarlos todos, sin tocar el periodo ni lo que se compara', async () => {
  const { anyFilter, clearFilters } = await import('./view.js');
  const m = createModel(data()), ui = {};
  assert.equal(anyFilter(m.S, ui), false);
  for (const set of [(S) => { S.f.pr = new Set([1]); }, (S) => { S.q = 'etiqueta'; }, (S, u) => { u.cliFilter = 'quiet'; }, (S, u) => { u.jiraPick = [2]; }, (S, u) => { u.escNoJira = true; }]) {
    const u = {}; set(m.S, u); assert.equal(anyFilter(m.S, u), true);
    clearFilters(m.S, u); assert.equal(anyFilter(m.S, u), false);
  }
  m.S.f.ss = new Set(); assert.equal(anyFilter(m.S, ui), false);   // uno vacío no cuenta
  const period = [m.S.d0, m.S.d1], sides = m.S.sides;
  m.S.f.mo = new Set([1]); m.S.q = 'x'; clearFilters(m.S, ui);
  assert.deepEqual(m.S.f, {}); assert.equal(m.S.q, ''); assert.deepEqual([m.S.d0, m.S.d1], period); assert.equal(m.S.sides, sides);
});

test('Filtros con Ctrl: en un selector, clic deja solo esa y Ctrl+clic la suma o, si ya estaba, la quita (sin ninguna, todas); en una celda de dos, Ctrl+clic sobre lo marcado lo quita', async () => {
  const { pickOnly, pickBoth, isPicked } = await import('./view.js');
  const f = {};
  pickOnly(f, 'pr', 1); assert.deepEqual([...f.pr], [1]);
  pickOnly(f, 'pr', 2, true); assert.deepEqual([...f.pr], [1, 2]);       // sumar
  assert.ok(isPicked(f, 'pr', 1) && isPicked(f, 'pr', 2) && !isPicked(f, 'pr', null));
  pickOnly(f, 'pr', 1, true); assert.deepEqual([...f.pr], [2]);          // quitar la ya marcada
  pickOnly(f, 'pr', 2, true); assert.equal(f.pr, undefined);             // sin ninguna: todas
  assert.ok(isPicked(f, 'pr', null));
  pickOnly(f, 'pr', 3); pickOnly(f, 'pr', 4); assert.deepEqual([...f.pr], [4]);   // sin Ctrl, solo esa
  pickOnly(f, 'pr', 4); assert.equal(f.pr, undefined);                    // otro clic en la marcada: la quita
  pickOnly(f, 'pr', 3); pickOnly(f, 'pr', 4, true); pickOnly(f, 'pr', 3); assert.deepEqual([...f.pr], [4]);   // de varias, quita esa
  pickOnly(f, 'pr', null); assert.equal(f.pr, undefined);
  // celdas de dos
  const g = {};
  pickBoth(g, [['sit', 1], ['age', 0]]); assert.deepEqual([[...g.sit], [...g.age]], [[1], [0]]);
  pickBoth(g, [['sit', 1], ['age', 0]]); assert.deepEqual(g, {});                                  // otro clic: se suelta
  pickBoth(g, [['sit', 1], ['age', 0]]); pickBoth(g, [['sit', 2], ['age', 1]]);
  assert.deepEqual([[...g.sit], [...g.age]], [[2], [1]]);                                           // clic en otra: cambia
  pickBoth(g, [['sit', 1], ['age', 0]], true); assert.deepEqual([[...g.sit], [...g.age]], [[2, 1], [1, 0]]);   // con Ctrl: se suman
  pickBoth(g, [['sit', 1], ['age', 0]], true); assert.deepEqual([[...g.sit], [...g.age]], [[2], [1]]);          // y se quitan
  const h = {}; pickBoth(h, [['sit', 1], ['sit', 2]]); assert.deepEqual([...h.sit], [1, 2]);       // dos de la misma (Asignada)
  pickBoth(h, [['sit', 1], ['sit', 2]]); assert.deepEqual(h, {});
});

test('pickSys: el selector SISU / SGA de la corona (clic, solo ese; otra vez, los dos; Ctrl+clic, compararlos)', () => {
  const S = { f: {} }, ui = {};
  pickSys(S, ui, 0, false); assert.deepEqual([...S.f.ss], [0]);
  pickSys(S, ui, 1, false); assert.deepEqual([...S.f.ss], [1]);   // el otro: cambiar a él
  pickSys(S, ui, 1, false); assert.equal(S.f.ss, undefined);      // otra vez: los dos
  pickSys(S, ui, 0, true); assert.equal(ui.ssCmp, true); assert.equal(S.f.ss, undefined);   // Ctrl: compararlos, con los dos
  pickSys(S, ui, 0, false); assert.equal(ui.ssCmp, false); assert.deepEqual([...S.f.ss], [0]);   // comparando, un clic: solo ese
  pickSys(S, ui, 1, true); pickSys(S, ui, 1, true); assert.equal(ui.ssCmp, false); assert.equal(S.f.ss, undefined);   // Ctrl otra vez: dejar de comparar
});

test('Equipo soporte y el selector de Indra y técnicos: a quién mira su tabla según los lados, y al revés', () => {
  assert.deepEqual(teamPeopleOf([{ company: 0 }, null]), []);                              // Indra: todo el equipo
  assert.deepEqual(teamPeopleOf([{ people: new Set([7]) }, null]), [7]);
  assert.deepEqual(teamPeopleOf([{ people: new Set([7]) }, { people: new Set([9]) }]), [7, 9]);   // uno frente a otro
  assert.deepEqual(teamPeopleOf([{ people: new Set([7, 8, 5]) }, { company: 0 }]), [7, 8]);     // como mucho dos
  assert.deepEqual(sidesOfPeople([]), [{ company: 0 }, null]);
  assert.deepEqual(sidesOfPeople([7]), [{ people: new Set([7]) }, null]);
  assert.deepEqual(sidesOfPeople([7, 9]), [{ people: new Set([7]) }, { people: new Set([9]) }]);
  for (const c of [[], [7], [7, 9]]) assert.deepEqual(teamPeopleOf(sidesOfPeople(c)), c);
});
