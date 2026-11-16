# Cómo está montada SIA

Tres piezas de código y dos bases por instancia. El detalle de cada vista y
cada decisión está en el RAG del equipo (contexto «SIA»); aquí, el mapa.

## Las piezas

```
web/        la interfaz (Vite)                   ──┐
server/     el bridge local (API + chats)          ├─ una máquina por persona
mcp/        el servidor MCP `knowledge` (el RAG)  ──┘
            ↕
Supabase    base de la instancia  +  base de conocimiento   (una pareja por cliente)
```

### `web/` — la interfaz

Vite, puerto **5220** en desarrollo. `src/main.js` solo arranca
(descubrir el bridge, la sesión, montar las vistas); cada funcionalidad vive
en su carpeta de `src/` con su dominio puro probado (`*.test.js` al lado), su
API y su vista:

| Carpeta | Qué es |
|---|---|
| `app/` | Descubrir el bridge, la navegación (`nav.js`, puro: qué iconos lleva el dock de cada persona, cómo va la barra de arriba, con qué vista se abre y a cuál se vuelve desde el Chat), qué vista se ve (`views.js`), la barra de arriba, el dock, el selector de Métricas y la relectura de permisos (`perms.js`) |
| `auth/` | Inicio de sesión y la sesión en el navegador |
| `chat/` | El chat: su arranque (`start.js`: Copilot, conocimiento autónomo y todo lo accesible), protocolo con el bridge, reconciliación entre dispositivos y adjuntos; la conversación (`conversation/`: el hilo con burbujas y Markdown, las herramientas plegadas, las tarjetas de pregunta, plan y «sin sesión», la caja de escribir y la búsqueda) y el menú de modelo y esfuerzo; la terminal (xterm) de los CLIs que aún van en un PTY |
| `issues/` | La mesa de issues de cada persona, la pantalla de trabajo de una issue (con su chat, o Reclamar respuesta y Traspasar si espera a un tercero), Resolver (`resolve-view.js`, con el editor de fichas de imagen `tag-editor.js`) y el origen SGA/SISU de cada issue (`origin.js`, el espejo del del bridge) |
| `backlog/` | Backlog: la cola del equipo entera para quien reparte (tarjetas que filtran, orden por regla, buscador, panel lateral con asignar), el editor de reglas de priorización (`rule-editor.js`, chips) en Configuración → Priorización (`rules-view.js`); una vista sobre el dominio de Issues |
| `metrics/` | Métricas: reglas (`rules.js`) y cálculo por pestaña en módulos puros; el HTML de cada pestaña en `metrics/tabs/` |
| `work/` | Equipo soporte: una vista sobre el dominio de Métricas |
| `users/` | Equipo (en Configuración): la lista, la ficha y el alta (`people-view.js`), los roles (`roles-view.js`) y la regla de priorización de cada cual; las reglas, en `people.js` |
| `knowledge/`, `projects/` | Conocimiento asignado y la sección Administración de Configuración |
| `lab/`, `links/`, `skills/` | Laboratorio de skills, Enlaces (la columna de Configuración y su formulario) y la paleta ⌘K |
| `settings/`, `lock/`, `theme/` | Configuración (sus cajas por sección y su cabecera, `head.js`; Proveedores IA, `providers-view.js`: la cuenta de Copilot), candado y temas |
| `ui/` | Lo común: `api.js` (el único cliente HTTP), diálogos, toast, html, tiempo, el selector (`picker.js`), la entrada en cascada de una vista (`enter.js`) y el aviso de lo que falta para la red del cliente (`net-warning.js`, `net-warning-view.js`: certificados y VPN; lo usan el inicio de sesión y Métricas) |

### `server/` — el bridge local

Un proceso Node por persona: sirve la API HTTP, abre los chats por WebSocket
(Copilot sin terminal, por el protocolo de su SDK; Claude y Codex en un PTY) y
habla con las dos bases. `index.js`
solo monta las piezas (`startBridge()`, nada ocurre al importar) y `router.js`
las encamina por capas: cortafuegos, web y ping, sesión y vista exigida, y
las rutas de cada slice.

| Carpeta | Qué es |
|---|---|
| `platform/` | Cliente de la base de la instancia y `sia-instance.json` |
| `auth/` | Sesiones (en memoria), inicio de sesión, contraseña y qué vista exige cada ruta; la comprobación al pulsar la S (`preflight.js`: certificados del cliente y VPN) |
| `users/`, `knowledge/` | Equipo: personas, roles y reglas; conocimiento asignado, la base en uso en este bridge (`assigned-base.js`) y claves de poder de cada persona |
| `base/` | Cliente de la base de conocimiento, permisos y el esquema SQL |
| `projects/` | Administración: crear y eliminar proyectos |
| `issues/`, `backlog/`, `metrics/` | Issues (cola por criterios `queue.js`, reglas `rules.js`, mesa, estadísticas), Backlog (la cola entera, asignar y las reglas de priorización, sobre el dominio de Issues) y Métricas (cada actualización pide a Snowflake, con `snowflake-sdk` y el SSO de cada persona, solo las incidencias de Remedy nuevas o cambiadas desde la última, y las suma a un repositorio SQLite local con `node:sqlite`, `incidencias.sqlite`, que no sale del equipo; de él salen los datos por columnas; el periodo se elige por fechas) |
| `skills/`, `links/`, `uploads/` | Laboratorio y sincronización de skills, enlaces rápidos, adjuntos |
| `config/`, `lock/` | Configuración personal (`~/.sia/config.json`: Jira, GitHub) y candado |
| `chats/` | El chat de Copilot sin terminal: el protocolo de su SDK (`copilot.js`: JSON-RPC por stdio y cada evento convertido en piezas de la conversación), su proceso (`copilot-session.js`), el cableado con quien lo mira (`session.js`: streaming por tandas, lo que lleva dicho, las preguntas) y la tarjeta de «sin sesión» (`auth.js`) |
| `providers/` | La cuenta de Copilot (Configuración → Proveedores IA): estado y cupo, login por código de dispositivo y cierre de sesión, hablando con su CLI |
| `launchers/`, `workspace/` | Los CLIs (Claude, Copilot, Codex), sus argumentos y su MCP por sesión; la clave de GitHub de los repos aparte de la cuenta de Copilot (`repo-key.js`); los directorios de modo y skills por base |
| `terminal/` | Las sesiones de chat, el protocolo WebSocket y quién entra por él (`ws-auth.js`: desde esta máquina, con sesión y con la vista Chat o, el de una issue, Issues) |
| `updates/`, `shared/` | `/api/version`; lo común (HTTP, CSV, ids, puertos, cabeceras, permisos, el troceo de entradas de Remedy, los certificados del sistema, la VPN del cliente y el error de lo que falta para su red, `client-network.js`) |

Cosas que conviene saber:

- A cada CLI se le pasa el MCP de la sesión a su manera: Copilot al crear la
  sesión por su protocolo, Claude con `--mcp-config` y Codex con un perfil
  temporal (`-p`) que se borra al cerrar la sesión.
- Copilot corre en su modo programable (`copilot --headless --stdio`, el
  protocolo de su SDK oficial) y la web pinta la conversación; su cuenta es la
  de Proveedores IA y nunca ve la clave de GitHub de los repos (Copilot toma
  como suya cualquier `GH_TOKEN` de su entorno): esa clave solo llega al shell
  de los comandos que ejecuta, por `BASH_ENV` (en Windows no hay equivalente).
- Los puertos se eligen solos (pares 57413/57414 → 58527/58528 →
  59641/59642; `SIA_PORT` fuerza uno). Si en un par ya hay un SIA de la misma
  versión, se adopta.
- El bridge solo escucha en esta máquina (`127.0.0.1`) y rechaza lo que llega
  con cabeceras de proxy. No sirve la web: llega por `file://` o por Vite.
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
  vistas: Laboratorio (crear y editar skills), Administración (proyectos) y
  Enlaces (editar enlaces). Quien tiene Administración usa la del
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
