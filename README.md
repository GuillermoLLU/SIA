# SIA

La plataforma de soporte con IA del equipo. Una aplicación local donde cada
persona abre chats con Copilot **ya conectados al conocimiento del equipo**,
trabaja las **issues** del servicio desde su mesa y sigue las **métricas** del
equipo. Una instancia por cliente.

| Quiero… | Dónde |
|---|---|
| Arrancarla y entrar | [Empezar](#empezar) |
| Saber cómo trabajamos (ramas, PR, pruebas) | [Cómo trabajamos](#cómo-trabajamos) · [docs/normas.md](docs/normas.md) |
| Entender cómo está montada | [Cómo está montada](#cómo-está-montada) · [docs/arquitectura.md](docs/arquitectura.md) |
| Montar o administrar una instancia | [docs/instancia.md](docs/instancia.md) |
| Preguntarle a una IA por el detalle | El RAG desde cualquier chat de SIA · [AGENTS.md](AGENTS.md) |

## Empezar

1. **Node 22.19+** (trae el SQLite de las Métricas y los certificados del sistema, para la VPN) y el CLI de
   Copilot (`npm i -g @github/copilot`). La sesión de Copilot se inicia desde SIA
   (Configuración → Proveedores IA). Para la app instalada, el instalador de
   Windows lo instala si falta, con WinGet y sin administrador.
2. Una **cuenta de la instancia** (te la da un administrador en Configuración → Equipo).
3. Arrancar:

   ```bash
   node dev.mjs
   ```

   Instala lo que falte y levanta el bridge y la web. Abre
   <http://localhost:5220> e inicia sesión.

### Detrás de la VPN

La VPN firma la conexión con la base de la instancia con un certificado
corporativo. El bridge confía también en los certificados del sistema (Windows o
macOS) al arrancar, así que `node dev.mjs` y la app instalada funcionan igual
dentro y fuera de la VPN. Requiere Node 22.19 o superior.

SIA no trae ni gestiona esos certificados: cada persona los instala con la guía
oficial del cliente. Se configuran en `sia-instance.json`, en `certificates`:
`helpUrl` es la guía y `required` los nombres (CN) que deben estar en el
sistema. `vpn.probeHost` es un nombre interno del cliente que solo resuelve a
una dirección privada dentro de su red. SIA comprueba las dos cosas en dos
sitios:

- en el instalador (SIA Setup, `setup/`), en el paso «Comprobaciones», los
  certificados: sin ellos no deja seguir (si no se pueden comprobar, avisa y
  deja seguir con confirmación). En la primera instalación comprueba también
  Copilot CLI y que tenga una sesión iniciada;
- en la app, al pulsar la S: si falta algo, en lugar del formulario sale un
  aviso corto (qué falta y la guía) con «Reintentar», que vuelve a
  comprobar de verdad, relee los certificados del sistema y deja pasar al
  formulario sin reiniciar SIA.

En desarrollo, con el aviso aparece «Modo Dev» en la esquina superior
derecha: pasa al formulario aunque falte algo, para seguir trabajando, y se
queda como «Modo Dev activo»; en la app instalada no existe. Para ver el
aviso, desconecta la VPN o quita los certificados del sistema.

Métricas trae las incidencias de Remedy de Snowflake: pon tu usuario en
Configuración → Conexiones → Snowflake. La primera vez se abre el navegador
para entrar con la cuenta de Inditex (SSO); necesita la VPN.

Cada persona ve las vistas que le dé su rol: el Chat siempre y, además,
Issues, Backlog, Equipo soporte, Métricas, Enlaces, Laboratorio y Personas. Quien
tiene Administración la encuentra en Configuración.

## Cómo trabajamos

Lo esencial; el detalle, con el porqué de cada norma, en
[docs/normas.md](docs/normas.md).

- **Ramas (Gitflow)**: `main` es producción y `develop` la rama de
  integración (la rama por defecto). Cada cambio sale de `develop` en una rama
  `feature/<nombre>` y vuelve por **pull request a `develop`**. Nunca un commit
  directo ni un `push --force` a `main` o `develop`.
- **Pull requests**: pequeñas y de una sola cosa. Entran con el **CI en
  verde** y la **revisión de otra persona**; se mezclan con *merge commit* y se
  borra la rama.
- **Código**: VSA + dominio. Cada funcionalidad en su carpeta
  (`server/<slice>/`, `web/src/<slice>/`): dominio puro con su `*.test.js` al
  lado, E/S y vista con las dependencias inyectadas. KISS y SOLID. **Sin
  basura**: lo que deja de usarse se borra.
- **Antes de subir**: `npm test` en verde y `cd web && npx vite build` sin
  errores; un cambio de UI, visto en el navegador.
- **Conocimiento**: el RAG («SIA», en cualquier chat) es la referencia de cómo
  está montado todo. Cuando un cambio deja algo desfasado, se reescribe ahí.

GitHub no impone estas normas (repositorio privado en cuenta personal): las
cumple el equipo.

```bash
git checkout develop && git pull
git checkout -b feature/mi-cambio
# … commits pequeños, en español, con el porqué …
npm test && (cd web && npx vite build)
git push -u origin feature/mi-cambio
gh pr create --base develop
```

## Cómo está montada

- **`web/`** — la interfaz (Vite). `src/main.js` solo arranca; cada vista vive
  en su carpeta de `src/`. El chat es una conversación limpia (`src/chat/conversation/`).
- **`server/`** — el bridge local: la API HTTP, los chats por WebSocket (una
  sesión de Copilot por chat, hablando con su CLI por el protocolo de su SDK) y
  la conexión con las bases. `index.js` solo monta las piezas y `router.js` las
  encamina.
- **`mcp/`** — el servidor MCP `knowledge`: el RAG que usan los chats.
- **Dos proyectos Supabase por instancia**: la **base de la instancia**
  (personas, roles, qué ve cada una; `sia-instance.json`) y la **base de
  conocimiento** (RAG, skills, proyectos). Quién ve qué lo decide la base con
  Row Level Security, no la aplicación.

Todo esto, carpeta a carpeta y con cómo se comunican, en
[docs/arquitectura.md](docs/arquitectura.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `node dev.mjs` | Arranca bridge y web en desarrollo |
| `npm test` | Las pruebas de dominio (segundos) |
| `cd web && npx vite build` | Compila la web |
| `npm run test:platform` / `test:rls` | Pruebas de la base en Docker (cuando se toca SQL) |
| `npm run dist:setup` / `dist:setup:mac` | El instalador que se entrega, SIA Setup (Windows / macOS): `dist-app/SIA Instalador <versión>.exe` o `.dmg`. Necesita Rust y, una vez, `npm install` en `setup/` |
| `npm run dist` / `dist:win` | Solo empaquetar la app (macOS / Windows); `dist:win` genera también `Desinstalar SIA.exe` |

La app va empaquetada en `app.asar`, de solo lectura; las piezas nativas (motor
de embeddings, imágenes) quedan fuera, en `app.asar.unpacked`. `build.files`
en `package.json` deja fuera de las dependencias los mapas de código, TypeScript,
las versiones de navegador del motor de embeddings y de Azure y los binarios de otras
plataformas. Si una dependencia nueva falla solo en la app instalada, mira primero
esa lista. Lo que SIA escriba tiene que ir fuera de la app: el modelo de embeddings
se guarda en `~/.sia/models`.
