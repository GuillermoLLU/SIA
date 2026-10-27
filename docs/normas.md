# Cómo trabajamos

Las normas del equipo, con su porqué. GitHub no las impone (el repositorio es
privado en una cuenta personal y no admite protección de ramas): las cumple
cada uno.

## Ramas (Gitflow)

| Rama | Para qué | Sale de | Vuelve a |
|---|---|---|---|
| `main` | Producción. Solo recibe cierres de `release/*` y `hotfix/*`. | — | — |
| `develop` | Integración. Es la rama por defecto: de ella sale todo y a ella vuelve todo. | `main` (una vez) | — |
| `feature/<nombre>` | Un cambio. | `develop` | `develop`, por pull request |
| `release/<versión>` | Publicar. Se sube la versión en `package.json`, se prueba y se cierra. | `develop` | `main` (con tag `v<versión>`, que construye el instalador en `build-windows`) y `develop` |
| `hotfix/<nombre>` | Un arreglo urgente en producción. | `main` | `main` (con tag) y `develop` |

**Nunca** un commit directo ni un `push --force` a `main` o `develop`.

```bash
git checkout develop && git pull
git checkout -b feature/mi-cambio
# … commits …
npm test && (cd web && npx vite build)
git push -u origin feature/mi-cambio
gh pr create --base develop        # o desde la web de GitHub
```

Por qué Gitflow y no trunk-based: somos varias personas sobre el mismo código
y una PR por cambio es lo que permite revisar, probar y volver atrás sin
pisarse.

## Pull requests

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

## Arquitectura: VSA + dominio, KISS y SOLID

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

Por qué: tocar una funcionalidad tiene que ser abrir una carpeta y ver ahí
sus reglas, sus pruebas y su pantalla, sin tener que entender el resto.

## Pruebas

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
  Docker (con Rancher Desktop, `DOCKER_HOST=unix://$HOME/.rd/docker.sock`) y
  se lanzan a mano cuando se toca la base.
- Los datos de clientes (incidencias de Remedy, CSV, informes) no se suben nunca al
  repositorio ni a la base: se trabaja con ellos en local.

## El conocimiento del equipo (RAG)

- El RAG (contexto «SIA» del servidor MCP `knowledge`, accesible desde
  cualquier chat de SIA) es **la referencia** de cómo está montado todo:
  arquitectura, cada vista, cada decisión. Antes de preguntar o de suponer,
  se busca ahí.
- Cuando un cambio deja algo desfasado, su entrada se **reescribe en
  presente** (no se añade una nota encima), sin datos personales y con detalle
  suficiente para trabajar sin el historial de chats. La skill «Nutrir
  conocimiento» guía el alta.

## Entrar nuevo en el equipo

1. Acceso al repositorio y una cuenta de la instancia (la crea un
   administrador en Personas, con su rol y los proyectos que verá).
2. Node 22.13 o superior (trae el SQLite de las Métricas) y los CLIs que vaya a usar con sesión iniciada: `claude`,
   `copilot` o `codex`.
3. `git clone`, `node dev.mjs`, <http://localhost:5220>, iniciar sesión.
4. Leer el README, [arquitectura.md](arquitectura.md) y, en un chat de SIA,
   pedirle que busque en el conocimiento «cómo está montado SIA»: ahí está el
   resto.
