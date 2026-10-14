// CSV (RFC 4180): comillas dobles, "" dentro de comillas y saltos de línea
// dentro de un campo. La primera fila es la cabecera; cada fila con algo
// sale como objeto por la cabecera (lo que falte, '').
//
// csvReader(onRow) lee por trozos, para ficheros que no caben en memoria:
// push(texto) tantas veces como haga falta y end() al acabar. Un trozo puede
// cortar por cualquier sitio (dentro de comillas, entre \r y \n…).

export const csvReader = (onRow) => {
  let head = null, row = [], field = '';
  let quoted = false;   // dentro de un campo entre comillas
  let quote = false;    // la última comilla de un campo entrecomillado, a falta de ver si es ""
  let lf = false;       // venía de un \r: un \n justo detrás es el mismo salto
  let started = false;

  const emit = () => {
    row.push(field);
    if (!head) head = row;
    else if (row.some(Boolean)) onRow(Object.fromEntries(head.map((h, i) => [h, row[i] ?? ''])));
    row = []; field = '';
  };

  const push = (text) => {
    let s = String(text);
    if (!started && s) { s = s.replace(/^﻿/, ''); started = true; }
    const n = s.length;
    let i = 0;
    while (i < n) {
      if (lf) { lf = false; if (s.charCodeAt(i) === 10) { i++; continue; } }
      if (quote) {
        quote = false;
        if (s.charCodeAt(i) === 34) { field += '"'; i++; continue; }
        quoted = false;
      }
      if (quoted) {
        const q = s.indexOf('"', i);
        if (q < 0) { field += s.slice(i); break; }
        field += s.slice(i, q);
        i = q + 1;
        quote = true;
        continue;
      }
      let j = i;
      for (let c = s.charCodeAt(j); j < n && c !== 44 && c !== 10 && c !== 13 && c !== 34; c = s.charCodeAt(++j));
      field += s.slice(i, j);
      if (j === n) break;
      const c = s.charCodeAt(j);
      i = j + 1;
      if (c === 34) quoted = true;
      else if (c === 44) { row.push(field); field = ''; }
      else { lf = c === 13; emit(); }
    }
  };

  const end = () => {
    if (field || row.length) emit();
  };

  return { push, end };
};

// Un CSV entero que ya está en memoria → filas.
export const parseCsv = (text) => {
  const rows = [];
  const reader = csvReader((r) => rows.push(r));
  reader.push(text);
  reader.end();
  return rows;
};
