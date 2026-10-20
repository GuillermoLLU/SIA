# SIA — guía para agentes de IA

Este repositorio es SIA, la plataforma de soporte con IA del equipo (bridge
local en `server/`, web en `web/`, servidor MCP en `mcp/`). Antes de tocar
código, lee:

- [docs/normas.md](docs/normas.md): cómo se trabaja (Gitflow, pull requests,
  arquitectura, pruebas).
- [docs/arquitectura.md](docs/arquitectura.md): cómo está montado, carpeta a
  carpeta.
- El RAG del equipo (contexto «SIA» del MCP `knowledge`), si está conectado:
  es la referencia de cada vista y cada decisión.

Reglas que no se negocian:

1. **Ramas**: todo cambio en una rama `feature/<nombre>` desde `develop`, con
   pull request a `develop`. Nunca un commit directo a `main` ni a `develop`.
2. **Slices**: cada funcionalidad en su carpeta (`server/<slice>/`,
   `web/src/<slice>/`) con dominio puro (sin E/S ni DOM) y su `*.test.js` al
   lado; la E/S y la vista reciben sus dependencias inyectadas.
   `server/index.js` y `web/src/main.js` solo cablean.
3. **Pruebas**: una regla nueva sin prueba no entra. `npm test` y
   `cd web && npx vite build` en verde antes de dar algo por hecho.
4. **Sin basura**: nada muerto, comentado, duplicado, de `TODO` ni exportado
   «por si acaso». Lo que deja de usarse se borra en el mismo cambio.
5. **Idioma y estilo**: código, comentarios, commits y textos de la interfaz en
   español; comentarios breves que expliquen el porqué; el estilo del código que
   ya hay.
6. **Datos**: ningún dato de clientes ni credencial va al repositorio.
7. **Conocimiento**: si un cambio deja desfasada una entrada del RAG, se
   reescribe en presente (con la confirmación de la persona).
