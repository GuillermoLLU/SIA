# Cómo está montada SIA

Tres piezas de código y dos bases por instancia. El detalle de cada vista y
cada decisión está en el RAG del equipo (contexto «SIA»); aquí, el mapa.

## Las piezas

```
web/        la interfaz (Vite + xterm.js)        ──┐
server/     el bridge local (API + chats)          ├─ una máquina por persona
mcp/        el servidor MCP `knowledge` (el RAG)  ──┘
            ↕
Supabase    base de la instancia  +  base de conocimiento   (una pareja por cliente)
```

### `web/` — la interfaz

Vite + xterm.js, puerto **5220** en desarrollo. `src/main.js` solo arranca
(descubrir el bridge, la sesión, montar las vistas); cada funcionalidad vive
en su carpeta de `src/` con su dominio puro probado (`*.test.js` al lado), su
API y su vista:

| Carpeta | Qué es |
|---|---|
| `app/` | Descubrir el bridge, la barra lateral (qué icono ve cada persona) y la relectura de permisos |
| `auth/` | Inicio de sesión y la sesión en el navegador |
| `chat/` | El chat: su arranque (`start.js`: Claude, conocimiento autónomo y todo lo accesible), protocolo con el bridge, reconciliación entre dispositivos, terminal y adjuntos |
| `issues/` | La mesa de issues de cada persona y la pantalla de trabajo de una issue (con su chat) |
| `backlog/` | Backlog: la cola del equipo entera para quien reparte (tarjetas que filtran, orden por regla, buscador, panel lateral con asignar), el editor de reglas de priorización (`rule-editor.js`, chips) y su modal; una vista sobre el dominio de Issues |
| `metrics/` | Métricas: reglas (`rules.js`) y cálculo por pestaña en módulos puros; el HTML de cada pestaña en `metrics/tabs/` |
| `work/` | Equipo soporte: una vista sobre el dominio de Métricas |
| `users/` | Personas y roles |
| `knowledge/`, `projects/` | Conocimiento asignado y Administración de proyectos |
| `lab/`, `links/`, `skills/` | Laboratorio de skills, Enlaces rápidos y la paleta ⌘K |
| `settings/`, `lock/`, `mobile/`, `theme/` | Configuración, candado, acceso desde el móvil y temas |
| `ui/` | Lo común: `api.js` (el único cliente HTTP), diálogos, toast, html, tiempo, el selector de persona (`picker.js`) y el aviso de lo que falta para la red del cliente (`net-warning.js`, `net-warning-view.js`: certificados y VPN; lo usan el inicio de sesión y Métricas) |

### `server/` — el bridge local

Un proceso Node por persona: sirve la API HTTP, abre los chats por WebSocket
(un PTY por sesión con el CLI elegido) y habla con las dos bases. `index.js`
solo monta las piezas (`startBridge()`, nada ocurre al importar) y `router.js`
las encamina por capas: cortafuegos, web y ping, sesión y vista exigida, y
las rutas de cada slice.

| Carpeta | Qué es |
|---|---|
| `platform/` | Cliente de la base de la instancia y `sia-instance.json` |
| `auth/` | Sesiones (en memoria), inicio de sesión, contraseña y qué vista exige cada ruta; la comprobación al pulsar la S (`preflight.js`: certificados del cliente y VPN) |
| `users/`, `knowledge/` | Personas y roles; conocimiento asignado y claves de poder de cada persona |
| `base/` | Cliente de la base de conocimiento, permisos y el esquema SQL |
| `projects/` | Administración: proyectos y sus entradas |
| `issues/`, `backlog/`, `metrics/` | Issues (cola por criterios `queue.js`, reglas `rules.js`, mesa, estadísticas), Backlog (la cola entera, asignar y las reglas de priorización, sobre el dominio de Issues) y Métricas (cada actualización pide a Snowflake, con `snowflake-sdk` y el SSO de cada persona, solo las incidencias de Remedy nuevas o cambiadas desde la última, y las suma a un repositorio SQLite local con `node:sqlite`, `incidencias.sqlite`, que no sale del equipo; de él salen los datos por columnas; el periodo se elige por fechas) |
| `skills/`, `links/`, `uploads/` | Laboratorio y sincronización de skills, enlaces rápidos, adjuntos |
| `config/`, `lock/` | Configuración personal (`~/.sia/config.json`: tema, Jira, GitHub) y candado |
| `launchers/`, `workspace/` | Los CLIs (Claude, Copilot, Codex), sus argumentos y su MCP por sesión; los directorios de modo y skills por base |
| `remote/` | Acceso desde el móvil: emparejar por QR + PIN, candado, túnel de Cloudflare |
| `terminal/` | Las sesiones de chat y el protocolo WebSocket |
| `updates/`, `shared/` | `/api/version`; lo común (HTTP, CSV, ids, puertos, cabeceras, permisos, el troceo de entradas de Remedy, los certificados del sistema, la VPN del cliente y el error de lo que falta para su red, `client-network.js`) |

Cosas que conviene saber:

- A cada CLI se le pasa el MCP de la sesión a su manera: Claude con
  `--mcp-config`, Copilot con `--additional-mcp-config` y Codex con un perfil
  temporal (`-p`) que se borra al cerrar la sesión.
- Los puertos se eligen solos (pares 57413/57414 → 58527/58528 →
  59641/59642; `SIA_PORT` fuerza uno). Si en un par ya hay un SIA de la misma
  versión, se adopta.
- Acceso desde el móvil por QR + PIN, en red local o en público (quick tunnel
  de Cloudflare con URL temporal y candado por inactividad).
- Variable de entorno solo para desarrollo: `SIA_WORKSPACE`.

### `mcp/` — el servidor MCP `knowledge`

El RAG que usan los chats (`search_knowledge`, `ingest_knowledge`,
`list_contexts`, `list_entries`, `delete_entry`): embeddings en local (Xenova
multilingual-e5-small, 384 dims) y búsqueda `match_chunks` en la base
conectada. La conexión le llega del bridge por entorno en cada chat. La
primera búsqueda descarga el modelo (~120 MB) una única vez.

### `workspace/`

El directorio de trabajo de las sesiones (en la app, dentro de su carpeta de
datos; en dev, `~/.sia/workspace`). La base tiene su rincón en `bases/<id>/`
(sus skills sincronizadas y los directorios de modo con `CLAUDE.md` /
`AGENTS.md`, que instruyen consultar el conocimiento antes de responder). De
aquí solo va al repositorio `workspace/modes/{auto,demand}/`.

## Las dos bases

Cada cliente tiene su propia instancia de SIA: otro cliente es otra instancia
del mismo código.

- **Base de la instancia** (un proyecto Supabase, en `sia-instance.json`):
  personas, roles y qué conocimiento ve cada una. Su SQL es
  `supabase-platform.sql`; sus altas, bajas y contraseñas pasan por la Edge
  Function `supabase/functions/sia-users/`.
- **Base de conocimiento** (otro proyecto Supabase): el RAG, las skills, los
  proyectos y los enlaces. Su SQL es `supabase-schema.sql`
  (`node server/base/schema-sql.js <clave>` lo imprime con la clave de dueño y
  las skills comunes de `skills/common/`). La instancia tiene **una sola** y
  trabaja contra ella todo el mundo.

Cómo se montan y se administran: [instancia.md](instancia.md).

## Quién ve qué

Lo decide **la base**, no la aplicación.

- La base de conocimiento cierra todas sus tablas con Row Level Security: con
  la clave publishable a secas no se ve ni se escribe nada. SIA manda en cada
  petición dos cabeceras, `x-sia-tokens` (los tokens de los proyectos de la
  persona) y `x-sia-power` (su clave de poder), y las políticas las comprueban
  contra `access_grants` y `power_keys`. Da igual con qué cliente se use la
  clave publishable: Postgres aplica las mismas reglas.
- Los **proyectos** de cada persona se eligen en su ficha de Personas; por
  dentro cada proyecto lleva su propio token (`server/projects/`).
- La **clave de poder** de cada persona («SIA · email», en
  `platform.person_keys` y Vault) la crea, ajusta y quita el bridge según sus
  vistas: Laboratorio (crear y editar skills), Administración (proyectos y
  entradas) y Enlaces (editar enlaces). Quien tiene Administración usa la del
  dueño (skills comunes incluidas). Nadie reparte claves a mano.
- La clave **secret** del proyecto no entra en SIA: solo la tiene quien
  administra el proyecto en Supabase. Los scripts de mantenimiento
  (`scripts/copy-knowledge.mjs`, `mcp/seed-skills.mjs`) la reciben por entorno
  en el momento y no la guardan.
- En SIA, el bridge guarda la sesión de Supabase (el JWT en memoria; el
  refresh token en `~/.sia/config.json` si se marcó «Mantener la sesión») y da
  a la web un token propio. Toda la API y los chats exigen sesión, y cada ruta
  de gestión exige su vista (`server/auth/views.js`): la web esconde lo que no
  toca y el bridge lo rechaza igual.
