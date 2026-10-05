# SIA

Sistema de uso de IA para equipos. Es un cliente de IA local: una UI que
conduce sesiones reales de CLI (Claude, Copilot, Codex, shell…) y las nutre con
el **conocimiento del equipo** (RAG vectorial en Supabase) vía MCP, más un
catálogo de skills compartido.

**Una instancia por cliente.** Cada cliente tiene su propia instancia de SIA
con su propia **base de la instancia** (un proyecto Supabase: personas, roles y
qué conocimiento ve cada una), indicada en `sia-instance.json`. Otro cliente es
otra instancia del mismo código. Las **bases de conocimiento** (el RAG, las
skills, los grupos) son otros proyectos Supabase; un administrador decide qué
grupos de cuáles ve cada persona.

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

- **Agente**: su conocimiento ya viene asignado; pulsa **+** para abrir un
  chat. En ⚙️ → Conocimiento lo ve en solo lectura.
- **Administrador**: en **Personas** da de alta a la gente (con su rol y lo
  que verá, en un solo paso) y, en la ficha de cada uno, cambia su rol, le
  genera una contraseña nueva, le corta el acceso o decide qué bases y grupos
  ve (o le copia los de otra persona). En la pestaña **Bases de
  conocimiento** añade las bases de la instancia con su clave de poder de
  Administración, que se guarda cifrada y con la que SIA lee sus grupos: así
  nadie maneja tokens a mano. Quien recibe una contraseña de un administrador
  la cambia al entrar. Además puede conectar bases propias:

1. **⚙️ Configuración → Conocimiento** (solo administradores): ponle un nombre a la base, pega el
   Project ID de tu proyecto Supabase (o su URL) y su clave *publishable*
   (`sb_publishable_…`) y pulsa **Conectar**. Si al proyecto le faltan las
   tablas, el asistente te guía en tres pasos (copiar el SQL, ejecutarlo en
   el SQL Editor de Supabase, verificar) y te deja como owner de esa base.
   La clave *secret* del proyecto no se pide nunca (SIA la rechaza): ver
   «Quién ve qué».
   Puedes conectar **varias bases** (la tuya y la de otro equipo, cada una con
   sus tokens de grupo y su clave de poder). Cada chat trabaja contra una sola
   base, que se elige al crearlo si hay más de una, y usa el conocimiento y las
   skills de esa base. Laboratorio, Administración y Enlaces también actúan
   sobre una base: si varias te la abren, la eliges al entrar.
2. Pulsa **+** para abrir un chat: **Libre** (shell), **Claude**, **Copilot** o
   **Codex**, ya conectados al conocimiento.

Sin conocimiento asignado SIA funciona como terminal, sin conocimiento ni skills.

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
4. Comprobar con **`scripts/platform-tests/verify.sql`** (todo en OK).

Endurecimiento recomendado en el panel: registro público cerrado, contraseñas
de 12+ con los cuatro tipos de carácter, SSL obligatorio y claves legacy
desactivadas. Las pruebas del SQL: `npm run test:platform` (Docker).

Roles: **admin** (gestiona personas, bases y lo que ve cada una) y **agent**
(usa lo asignado). Nadie cambia su propio rol ni se desactiva, así que
siempre queda un admin. Todo pasa por funciones de la base que comprueban
quién llama; las tablas no se pueden leer ni con la publishable.

En SIA, el bridge guarda la sesión de Supabase (el JWT solo en memoria; el
refresh token, en `~/.sia/config.json` si se marcó «Mantener la sesión») y da
a la web un token propio. Toda la API y el terminal exigen sesión, y lo de
gestión (Laboratorio, Administración, claves, montar bases, editar enlaces)
es solo de admins. Lo asignado a cada persona se carga al iniciar sesión y
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

Para dar acceso a alguien: ⚙️ → esa base → Conocimiento → **Invitar…**, marcar
uno o varios grupos y copiar. Es un texto `sia-invite:…` con el proyecto,
su clave publishable y los tokens de esos grupos; quien lo recibe lo pega en
⚙️ → Conocimiento → Añadir base y queda conectado con ellos (si ya tenía la
base, se le añaden los grupos que le faltaban). Invita el owner, que elige
entre todos los grupos, o una clave de poder con el permiso **Invitar**, que
solo puede compartir los grupos a los que ella misma tiene token. En esa
misma vista, el owner y las claves con Administración ven todos los grupos de
la base con un interruptor para activar los que quieren usar en sus chats.

## Quién manda en una base

Las claves de poder viven **en cada base** (tabla `power_keys`), no en el
programa, y se guardan por base en ⚙️ → Conocimiento → tarjeta de la base →
**Clave de poder**. Quien monta una base es su **owner**: el SQL que copia
del asistente lleva su clave de dueño recién generada, y al verificar queda
guardada en su equipo (volver a ejecutar el SQL desde el asistente genera
otra: así se recupera si se pierde). Su clave lo abre todo y ve en ⚙️ la
pestaña **Claves**, donde crea claves nuevas (nombre + vistas que abre) y las
borra; los cambios aplican al momento. Quien conecta a la base de otro
necesita los tokens de grupo de esa base y, para las vistas de gestión, una
clave que le dé el owner. Con varias bases, una vista (Laboratorio,
Administración, Enlaces) aparece si alguna base la abre: si solo una, se entra
directo; si varias, se elige base al entrar, como al crear un chat. Las claves
de cada base se gestionan en ⚙️ → Conocimiento → esa base → Claves (solo el
owner).

Permisos que puede llevar una clave:

- **Laboratorio**: crear y editar skills de los grupos a los que se tiene token.
- **Administración**: grupos, proyectos de conocimiento, accesos y enlaces.
- **Editar enlaces**: añadir y quitar enlaces rápidos.
- **Invitar**: generar invitaciones a los grupos a los que se tiene token.

Las skills **comunes** (las que ven todos los grupos) solo las crea, edita o
borra el owner de la base.

Una base montada con un esquema anterior (SIA 0.1, conectada con la
clave secret) no deja ver nada con la publishable hasta que su dueño vuelve a
ejecutar el SQL: ⚙️ → esa base → Configuración → Cambiar conexión → Conectar
abre el asistente. El conocimiento, las skills, los grupos y las claves de
poder que ya había se conservan; solo la clave del dueño se renueva.

## Piezas

- `web/` — UI (Vite + xterm.js): pestañas multi-sesión, temas, lanzador,
  Laboratorio de skills, Administración, enlaces rápidos. Puerto **5220**.
- `server/` — bridge local: un PTY por sesión expuesto por WebSocket y la API
  HTTP. Por funcionalidad: `platform/` (cliente de la base de la instancia),
  `auth/` (sesión), `users/` (personas), `knowledge/` (conocimiento asignado),
  `access/` y `base/` (bases de conocimiento). A cada CLI se le pasa el MCP de la sesión a su manera: Claude con
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
  su carpeta de datos; en dev, `~/.sia/workspace`). Cada base tiene su rincón
  en `bases/<id>/` (sus skills sincronizadas y los directorios de modo con
  `CLAUDE.md`/`AGENTS.md`, que instruyen consultar el conocimiento antes de
  responder), así cada chat ve las skills de su base.
- `supabase-schema.sql` — esquema completo de la base (idempotente). El
  asistente de montaje sirve ese fichero con la clave de dueño puesta y, al
  final, las **skills comunes** de `skills/common/` (`server/base/schema-sql.js`):
  una base recién montada arranca con ellas y cada ejecución las deja al día.
- `supabase-platform.sql`, `supabase/functions/sia-users/` y
  `scripts/platform-tests/` — la base de la instancia, su Edge Function y sus
  pruebas y verificación.
- Configuración personal (bases propias de un admin con sus tokens de grupo,
  Jira, GitHub, sesión guardada): `~/.sia/config.json`, solo en esta máquina.

Variables de entorno solo para desarrollo: `SIA_SUPABASE_URL` /
`SIA_SUPABASE_KEY` (conexión sin pasar por Ajustes), `SIA_ADMIN_KEY` /
`SIA_SUPERADMIN_KEY` (claves de poder sin pasar por la base), `SIA_WORKSPACE`.
Los scripts de mantenimiento (`scripts/copy-knowledge.mjs`,
`mcp/seed-skills.mjs`) escriben saltándose las políticas: se les pasa la
clave secret por entorno en el momento, nunca se guarda.

> **Multiplataforma:** Windows (ConPTY), macOS y Linux. App de escritorio con
> Electron: `npm run dist` (macOS) / tag → CI (`.exe`).
