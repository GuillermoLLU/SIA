# SIA

La plataforma de soporte con IA del equipo. Es una aplicación local: una UI que
conduce sesiones reales de CLI (Claude, Copilot o Codex) y las nutre con el
**conocimiento del equipo** (RAG vectorial en Supabase) vía MCP, más un
catálogo de skills compartido, la mesa de trabajo de las **issues** del
servicio y las **métricas** del equipo.

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
Issues, Equipo soporte, Métricas,
Enlaces rápidos, Laboratorio, Administración y Personas. Lo cómodo es darlas
con un **rol** (un nombre y unas vistas): asignar un rol pone sus vistas y
editarlo las cambia a todos los que lo tienen. Vienen **Administrador** (todas,
fijo) y **Agente** (Chat y Enlaces, el de toda alta), y en Personas → **Roles**
se crean los que hagan falta. Tocar una vista suelta de alguien lo deja con
vistas **personalizadas**, que ya no siguen a ningún rol.

- **Personas**: da de alta a la gente (con su rol y lo que verá, en un solo
  paso) y, en la ficha de cada uno, cambia su rol, enciende o apaga sus
  vistas (personalizándolas), le genera una contraseña nueva, le corta el acceso o decide qué
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

Vistas por persona (`platform.users.views`; la lista, en
`platform.known_views()`: issues, work, metrics, links, lab, admin, people) y
roles (`platform.roles`): con rol, sus vistas son las del rol y cambian con
él; sin rol, personalizadas. Nadie edita el rol que tiene, y Administrador
no se toca. La base de
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

- `web/` — UI (Vite + xterm.js), puerto **5220** en desarrollo. `src/main.js`
  solo arranca (descubrir el bridge, la sesión, montar las vistas); cada
  funcionalidad vive en su carpeta de `src/` con su dominio puro probado
  (`*.test.js` al lado), su API y su vista: `app/` (bridge, barra y permisos),
  `auth/`, `chat/` (sesiones, protocolo, adjuntos, pestañas, terminal),
  `issues/`, `metrics/` (reglas y cálculo por pestaña en módulos puros; el
  HTML de cada pestaña en `metrics/tabs/`), `work/` (Equipo soporte, una vista
  sobre el dominio de Métricas), `users/` (Personas), `knowledge/`,
  `projects/` (Administración), `lab/`, `links/`, `skills/` (la paleta),
  `settings/`, `lock/`, `mobile/`, `theme/` y `ui/` (el cliente HTTP único
  `api.js`, diálogos, toast, html, tiempo).
- `server/` — bridge local: un PTY por sesión expuesto por WebSocket y la API
  HTTP. `index.js` solo monta las piezas (`startBridge()`) y `router.js` las
  encamina; cada funcionalidad vive en su carpeta, con su dominio puro
  probado: `platform/` (cliente de la base de la instancia), `auth/` (sesión y
  vistas), `users/` (personas), `knowledge/` (conocimiento asignado y claves
  de cada persona), `base/` (cliente, permisos y esquema de la base de
  conocimiento), `projects/` (Administración), `skills/` (Laboratorio y
  sincronización), `links/`, `uploads/`, `issues/`, `metrics/`, `config/`
  (config personal), `lock/` (candado), `remote/` (acceso desde el móvil y
  túnel), `launchers/` (los CLIs y su MCP por sesión), `workspace/` (modos y
  skills por base), `terminal/` (los chats) y `shared/` (lo común). A cada CLI se le pasa el MCP de la sesión a su manera: Claude con
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

## Trabajar en el repositorio

Estas son las normas del equipo. GitHub no las impone (el repositorio es
privado en una cuenta personal y no admite protección de ramas): las cumple
cada uno.

### Ramas (Gitflow)

- `main` es **producción**: solo recibe cierres de `release/*` y `hotfix/*`.
- `develop` es la rama de **integración** y la rama por defecto del
  repositorio: de ella sale todo y a ella vuelve todo.
- Cada cambio va en una rama `feature/<nombre-corto>` creada desde `develop`.
- Para publicar: `release/<versión>` desde `develop`; se sube la versión en
  `package.json`, se prueba, se cierra sobre `main` con el tag `v<versión>` (el
  workflow `build-windows` construye el instalador) y se vuelve a mezclar en
  `develop`.
- Un arreglo urgente en producción: `hotfix/<nombre>` desde `main`, y se
  cierra en `main` (con tag) y en `develop`.
- **Nunca** un commit directo ni un `push --force` a `main` o `develop`.

```bash
git checkout develop && git pull
git checkout -b feature/mi-cambio
# … commits …
git push -u origin feature/mi-cambio
gh pr create --base develop        # o desde la web de GitHub
```

### Pull requests

- Siempre a `develop` (salvo `release/*` y `hotfix/*`, que van a `main`).
- Pequeñas y de una sola cosa: si el título necesita una «y», son dos PR.
- Entra cuando el CI está en **verde** y **otra persona** la ha revisado y
  aprobado. Nadie mezcla su propia PR sin revisión ni con el CI en rojo o
  pendiente, aunque el botón lo permita.
- Las conversaciones abiertas en la revisión se resuelven antes de mezclar.
- Se mezcla con *merge commit* (no *squash*), para que el historial de la
  rama se conserve, y después se borra la rama.
- Commits pequeños, uno por cambio, con el mensaje en español: un título
  corto y un cuerpo que explica qué cambia y por qué.

### Arquitectura: VSA + dominio, KISS y SOLID

- Cada funcionalidad vive en su carpeta (`server/<slice>/`,
  `web/src/<slice>/`), con tres capas: el **dominio** en módulos puros (sin
  E/S ni DOM, con sus reglas y sus cálculos), la **E/S** (rutas, persistencia,
  API, WebSocket) y la **vista**. `server/index.js` y `web/src/main.js` solo
  cablean: no se les añade lógica.
- Las dependencias se **inyectan** (`createX({ platform, fs, now, api… })`),
  nunca se crean dentro: así todo se prueba sin red, sin disco y sin
  navegador.
- Responsabilidad única y funciones pequeñas; un helper que se repite va a
  `server/shared/` o `web/src/ui/`, no se copia.
- **Sin basura**: nada de código muerto, comentado, duplicado, de `TODO` ni de
  exports «por si acaso». Lo que deja de usarse se borra en el mismo cambio.
- Comentarios en español, breves, explicando el porqué (no el qué).

### Pruebas

- Todo el dominio lleva su `*.test.js` al lado (`node --test`); una regla
  nueva sin prueba no entra. Las rutas se prueban con `json`/`readBody`
  falsos y la sesión ya resuelta.
- Antes de subir: `npm test` en verde (en segundos) y `cd web && npx vite build`
  sin errores. El CI (`.github/workflows/test.yml`) repite las dos cosas en
  cada PR y en cada push a `develop` y `main`.
- Un cambio de UI se comprueba en el navegador contra
  <http://localhost:5220> (Playwright con el Chrome del sistema, revisando
  capturas y la consola) antes de abrir la PR. En Métricas, cada pestaña con un
  lado, comparando y con una persona.
- Las pruebas de SQL (`npm run test:platform`, `npm run test:rls`) necesitan
  Docker y se lanzan a mano cuando se toca la base.
- Los datos de clientes (CSV de Remedy, informes) no se suben nunca al
  repositorio ni a la base: se trabaja con ellos en local.

### El conocimiento del equipo (RAG)

- El RAG (contexto «SIA» del servidor MCP `knowledge`, accesible desde
  cualquier chat de SIA) es **la referencia** de cómo está montado todo:
  arquitectura, cada vista, cada decisión. Antes de preguntar o de suponer,
  se busca ahí.
- Cuando un cambio deja algo desfasado, su entrada se **reescribe en
  presente** (no se añade una nota encima), sin datos personales y con detalle
  suficiente para trabajar sin el historial de chats. La skill «Nutrir
  conocimiento» guía el alta.

### Entrar nuevo en el equipo

1. Acceso al repositorio y una cuenta de la instancia (la crea un
   administrador en Personas, con su rol y los proyectos que verá).
2. Node 22 y los CLIs que vaya a usar con sesión iniciada: `claude`,
   `copilot` o `codex`.
3. `git clone`, `node dev.mjs`, <http://localhost:5220>, iniciar sesión.
4. Leer este README y, en un chat de SIA, pedirle que busque en el
   conocimiento «cómo está montado SIA»: ahí está el resto.
