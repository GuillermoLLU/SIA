---
name: github-repo
description: "Cuando necesites operar con git o GitHub sobre un repositorio: ramas, commits, push, pull requests y merges (los merges siempre con confirmación explícita del usuario)."
commandLabel: "GitHub"
commandDescription: "Operar con git y GitHub: ramas, commits, push, PRs y merges (merge con confirmación)"
category: system
version: 2.1.0
enabled: true
---

# github-repo

Operaciones git y GitHub sobre repositorios: ramas, commits, push, pull
requests y merges.

## Autenticación

El token personal del usuario llega como variable de entorno de la sesión
(se configura en SIA: ⚙️ Configuración → GitHub):

- `$GH_TOKEN` / `$GITHUB_TOKEN` — el CLI `gh` los usa automáticamente.

Si una operación remota falla por autenticación y las variables no existen,
indica al usuario que configure su token en ⚙️ Configuración → GitHub y abra
un chat nuevo. No improvises credenciales.

### Identidad: SIEMPRE la del token configurado

La cuenta activa de GitHub es la del token de ESTE usuario. **Nunca asumas ni
infieras el usuario, el owner o el nombre de un repo** a partir del conocimiento
del equipo (RAG), del historial de la conversación ni de nombres que hayas visto
por ahí (p. ej. quién desarrolla SIA). Eso mezcla identidades y es un error.

Cuando necesites el login del usuario, sus repos o el owner de algo, **derívalo
del token**, no lo adivines:

- `gh api user --jq .login` — login del usuario autenticado.
- `gh repo list --limit 100` — sus repositorios (no supongas el owner).
- `gh api user/repos --paginate` — si necesitas más detalle.

Si el token no da acceso a un repo que el usuario pide, díselo claramente en vez
de probar con otra cuenta u owner inventado.

## Operaciones

### Git local

- **Ramas**: `git checkout -b <rama>` desde la rama base correcta. Verifica
  siempre con `git branch --show-current` antes de tocar nada.
- **Commits**: `git add` selectivo (nunca `git add .` a ciegas: revisa
  `git status` y `git diff` primero) y mensaje claro de qué y por qué.
- **Estado e historia**: `git status`, `git log --oneline -10`, `git diff`.

### Remoto

- **Push**: `git push -u origin <rama>` (con `gh` autenticado, el push por
  HTTPS usa el token).
- **Sincronizar**: `git fetch` / `git pull` en la rama que corresponda.

### Pull Requests (CLI `gh`)

- **Crear**: `gh pr create --title "..." --body "..."` (base la rama que toque).
  Redacta el body con: qué cambia, por qué, y cómo probarlo.
- **Listar/ver**: `gh pr list`, `gh pr view <num>`, `gh pr diff <num>`.
- **Comentar**: `gh pr comment <num> --body "..."`.
- **Estado de checks**: `gh pr checks <num>`.

### Merges — ⚠️ SIEMPRE con confirmación explícita

Antes de CUALQUIER merge (local `git merge` o de PR `gh pr merge`):

1. Muestra al usuario qué se va a mergear: ramas origen/destino o número de
   PR, y un resumen de los cambios.
2. Pregunta y espera confirmación explícita.
3. Solo entonces ejecuta. Si hay conflictos, resuélvelos con el contexto
   disponible y muestra el resultado antes de confirmar el commit de merge.

## Convenciones de naming (si se trabaja con planes/tasks)

- Rama de plan: `plan/{titulo-en-kebab-case}`
- Rama de task: `task/{titulo-en-kebab-case}`

## Reglas

1. **Merge = confirmación explícita del usuario, sin excepciones** (local o PR).
2. También piden confirmación: `push --force`, borrar ramas remotas, y cerrar
   PRs ajenas.
3. NUNCA trabajes directamente sobre `develop` o `main`: crea rama.
4. Nunca muestres el valor del token (referéncialo como `$GH_TOKEN`).
5. Antes de operar, sitúate: `git status` + rama actual. Si el directorio no
   es un repo, pregunta al usuario cuál usar.
