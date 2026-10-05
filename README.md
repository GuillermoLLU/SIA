# SIA

Sistema de uso de IA para equipos. Es un cliente de IA local: una UI que
conduce sesiones reales de CLI (Claude, Copilot, Codex, shell…) y las nutre con
el **conocimiento del equipo** (RAG vectorial en Supabase) vía MCP, más un
catálogo de skills compartido.

**Una instancia por cliente.** Cada cliente tiene su propia instancia de SIA
con su propia **base de la instancia** (un proyecto Supabase: personas, roles y
qué conocimiento ve cada una), indicada en `sia-instance.json`. Otro cliente es
otra instancia del mismo código. La **base de conocimiento** (el RAG, las
skills, los proyectos) es otro proyecto Supabase, uno por instancia; en
Personas se decide qué proyectos ve cada persona.

## Empezar

Requisitos: **Node 18+** y, para cada motor, su CLI instalado y con sesión
iniciada: `claude` (Claude Code), `copilot` (GitHub Copilot CLI) o `codex`
(OpenAI Codex CLI, `npm i -g @openai/codex` y `codex login`). Los que no
estén instalados salen deshabilitados al abrir un chat.

```bash
node dev.mjs
```

Instala dependencias si faltan y levanta las dos piezas. Abre
<http://localhost:5220> e **inicia sesión** con el email y la contraseña de tu
cuenta de la instancia (las da un administrador; ver «La base de la
instancia»). Con «Mantener la sesión» se entra solo la próxima vez.

Cada persona ve las **vistas** que se le den: el Chat siempre y, además,
Enlaces rápidos, Laboratorio, Administración y Personas. El rol solo pone las
de partida: un **agente** empieza con Chat y Enlaces; un **administrador**,
con todas.

- **Personas**: da de alta a la gente (con su rol y lo que verá, en un solo
  paso) y, en la ficha de cada uno, cambia su rol, enciende o apaga sus
  vistas, le genera una contraseña nueva, le corta el acceso o decide qué
  proyectos ve (o le copia los de otra persona). Quien recibe una
  contraseña de otro la cambia al entrar.
- La instancia tiene **una sola base de conocimiento** y trabaja contra ella
  todo el mundo, tenga proyectos asignados o no: no se conecta nada a mano.
- **Administración**: los proyectos de la base (crear, ver sus entradas y
  borrarlos). No hay grupos a la vista: por dentro, cada proyecto lleva su
  propio token de acceso (`server/projects/`), que es lo que la base exige.
  Pulsa **+** para abrir un chat: **Claude**, **Copilot** o **Codex**, ya
  conectados al conocimiento.

Sin conocimiento asignado los chats funcionan igual, pero sin la base del equipo ni sus skills.

> La primera búsqueda de conocimiento descarga el modelo de embeddings
> (~120 MB) una única vez; las siguientes son inmediatas.

## La base de la instancia

Quién entra, con qué rol y qué conocimiento ve vive en un proyecto Supabase
propio de la instancia (`sia-instance.json`: su URL y su clave publishable).
Se monta una vez:

1. SQL Editor del proyecto: ejecutar **`supabase-platform.sql`** entero
   (re-ejecutable, no borra datos).
2. Desplegar la Edge Function **`supabase/functions/sia-users`** (altas, bajas
   y contraseñas; es lo único que usa la clave secret, que se le pone como
   secreto de la función `SIA_SECRET_KEY` junto a `SIA_PUBLISHABLE_KEY`).
3. Crear la primera persona en Authentication → Users y nombrarla admin en el
   SQL Editor: `select platform.grant_admin('email');`.
4. Montar la base de conocimiento (otro proyecto Supabase): ejecutar en su
   SQL Editor el esquema con una clave de dueño nueva
   (`node server/base/schema-sql.js <clave>` lo imprime, con las skills
   comunes) y, en el SQL Editor de la instancia,
   `select platform.set_knowledge_base('Nombre', 'https://<ref>.supabase.co', 'sb_publishable_…', '<clave>');`.
5. Comprobar con **`scripts/platform-tests/verify.sql`** (todo en OK).

Endurecimiento recomendado en el panel: registro público cerrado, contraseñas
de 6 caracteres o más, SSL obligatorio y claves legacy
desactivadas. Las pruebas del SQL: `npm run test:platform` (Docker).

Vistas por persona (`platform.users.views`: links, lab, admin, people); el
rol (**admin** / **agent**) solo pone las de partida. La base de
conocimiento solo entiende de claves de poder, así que cada persona tiene en
ella su propia clave («SIA · email», en `platform.person_keys` y Vault) con
solo los permisos de sus vistas (Laboratorio, Enlaces); quien tiene
Administración usa la del dueño (skills comunes incluidas). La crea, la
ajusta y la quita el bridge de quien gestiona Personas, y el bridge de la
persona la recibe al iniciar sesión: nadie reparte claves a mano. Nadie
cambia su propio rol ni sus vistas ni se desactiva, así que siempre queda
alguien con Personas. Todo pasa por funciones de la base que comprueban
quién llama y sus vistas; las tablas no se pueden leer ni con la publishable.

En SIA, el bridge guarda la sesión de Supabase (el JWT solo en memoria; el
refresh token, en `~/.sia/config.json` si se marcó «Mantener la sesión») y da
a la web un token propio. Toda la API y el terminal exigen sesión, y cada
ruta de gestión exige su vista (`server/auth/views.js`): la web esconde lo
que no toca y el bridge lo rechaza igual. Lo asignado a cada persona se carga al iniciar sesión y
solo vive en memoria; un agente no recibe tokens ni claves en la web.

## Quién ve qué

Lo decide **la base**, no la aplicación. El SQL del esquema cierra todas las
tablas con Row Level Security y sin políticas abiertas: con la clave
publishable a secas no se ve ni se escribe nada. SIA manda en cada petición
dos cabeceras, `x-sia-tokens` (los tokens de grupo del usuario) y
`x-sia-power` (su clave de poder), y las políticas las comprueban contra
`access_grants` y `power_keys`: un token abre el conocimiento, las skills y
los enlaces de los proyectos que concede, y nada más. Da igual que alguien
use la clave publishable con otro cliente: Postgres le aplica las mismas
reglas. La clave *secret* del proyecto no entra en SIA (se rechaza al
pegarla y se descarta de las configuraciones antiguas): es la única que salta
las políticas y solo debe tenerla quien administra el proyecto en Supabase.

Los proyectos de cada persona (es decir, sus tokens) se eligen en su ficha de
Personas; las claves de poder, las pone SIA según sus vistas (ver «La base de
la instancia»).

Permisos que puede llevar una clave (`power_keys`):

- **Laboratorio**: crear y editar skills de los proyectos que se ven.
- **Administración**: los proyectos de conocimiento y sus entradas.
- **Editar enlaces**: añadir y quitar enlaces rápidos.

Las skills **comunes** (las que ve todo el mundo) solo las crea, edita o
borra el dueño de la base. Una base con un esquema anterior no deja ver nada
hasta que se vuelve a ejecutar su SQL (`node server/base/schema-sql.js`).

## Piezas

- `web/` — UI (Vite + xterm.js): pestañas multi-sesión, temas, lanzador,
  Laboratorio de skills, Administración, enlaces rápidos. Puerto **5220**.
- `server/` — bridge local: un PTY por sesión expuesto por WebSocket y la API
  HTTP. Por funcionalidad: `platform/` (cliente de la base de la instancia),
  `auth/` (sesión y vistas), `users/` (personas), `knowledge/` (conocimiento
  asignado y claves de cada persona), `access/` y `base/` (cabeceras,
  permisos y esquema de la base de conocimiento). A cada CLI se le pasa el MCP de la sesión a su manera: Claude con
  `--mcp-config`, Copilot con `--additional-mcp-config` y Codex con un
  perfil temporal (`-p`) que se borra al cerrar la sesión. Los puertos se eligen solos (pares 57413/57414 → 58527/58528 →
  59641/59642; `SIA_PORT` fuerza uno). Acceso desde el móvil por QR+PIN, en
  red local o en público (quick tunnel de Cloudflare con URL temporal y
  candado por inactividad).
- `mcp/` — servidor MCP `knowledge` (`search_knowledge`, `ingest_knowledge`,
  `list_contexts`, `list_entries`, `delete_entry`): embeddings en local (Xenova
  multilingual-e5-small, 384 dims) + búsqueda `match_chunks` en la base
  conectada. La conexión le llega del bridge por entorno en cada chat.
- `workspace/` — directorio de trabajo de las sesiones (en la app, dentro de
  su carpeta de datos; en dev, `~/.sia/workspace`). La base tiene su rincón
  en `bases/<id>/` (sus skills sincronizadas y los directorios de modo con
  `CLAUDE.md`/`AGENTS.md`, que instruyen consultar el conocimiento antes de
  responder).
- `supabase-schema.sql` — esquema completo de la base de conocimiento
  (idempotente). `node server/base/schema-sql.js <clave>` lo imprime con la
  clave de dueño puesta y, al final, las **skills comunes** de
  `skills/common/`: una base recién montada arranca con ellas y cada
  ejecución las deja al día.
- `supabase-platform.sql`, `supabase/functions/sia-users/` y
  `scripts/platform-tests/` — la base de la instancia, su Edge Function y sus
  pruebas y verificación.
- Configuración personal (Jira, GitHub, tema, sesión guardada):
  `~/.sia/config.json`, solo en esta máquina.

Variable de entorno solo para desarrollo: `SIA_WORKSPACE`.
Los scripts de mantenimiento (`scripts/copy-knowledge.mjs`,
`mcp/seed-skills.mjs`) escriben saltándose las políticas: se les pasa la
clave secret por entorno en el momento, nunca se guarda.

> **Multiplataforma:** Windows (ConPTY), macOS y Linux. App de escritorio con
> Electron: `npm run dist` (macOS) / tag → CI (`.exe`).
