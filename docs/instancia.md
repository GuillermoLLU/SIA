# Montar y administrar una instancia

Una instancia es un cliente: su base de la instancia (personas, roles, qué
ve cada una) y su base de conocimiento. Ver [arquitectura.md](arquitectura.md).

## Montar la base de la instancia (una vez)

Un proyecto Supabase propio; `sia-instance.json` lleva su URL y su clave
publishable.

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

Endurecimiento recomendado en el panel de Supabase: registro público cerrado,
contraseñas de 6 caracteres o más, SSL obligatorio y claves legacy
desactivadas. Las pruebas del SQL: `npm run test:platform` (Docker).

Una base de conocimiento con un esquema anterior no deja ver nada hasta que
se vuelve a ejecutar su SQL (`node server/base/schema-sql.js`).

## Personas, roles y vistas

Cada persona ve las **vistas** que se le den: el Chat siempre y, además,
Issues, Backlog, Equipo soporte, Métricas, Enlaces rápidos, Laboratorio, Administración
y Personas (`platform.users.views`; la lista, en `platform.known_views()`).

Lo cómodo es darlas con un **rol** (un nombre y unas vistas,
`platform.roles`): asignar un rol pone sus vistas y editarlo las cambia a
todos los que lo tienen. Vienen **Administrador** (todas, fijo) y **Agente**
(Chat y Enlaces, el de toda alta), y en Personas → **Roles** se crean los que
hagan falta. Tocar una vista suelta de alguien lo deja con vistas
**personalizadas**, que ya no siguen a ningún rol.

En **Personas** se da de alta a la gente (con su rol y lo que verá, en un
solo paso) y, en la ficha de cada uno, se cambia su rol, se encienden o
apagan sus vistas, se le genera una contraseña nueva (la cambia al entrar),
se le corta el acceso o se decide qué proyectos ve (o se le copian los de
otra persona). Nadie edita el rol que tiene, cambia sus propias vistas ni se
desactiva, así que siempre queda alguien con Personas. Todo pasa por
funciones de la base que comprueban quién llama y sus vistas; las tablas no
se pueden leer ni con la publishable.

En **Configuración → Administración**, solo para quien tiene ese poder, se crean
y eliminan los proyectos de la base de conocimiento. Sus entradas se consultan y
se nutren desde el Chat. Sin conocimiento asignado los chats
funcionan igual, pero sin la base del equipo ni sus skills.

## Backlog y reglas de priorización

Quien tiene la vista **Backlog** ve la cola entera del equipo: las issues de
la foto que nadie tiene (sin responsable en Remedy ni cogidas en SIA), en el
orden de una **regla de priorización**. Una regla es un nombre y una lista
ordenada de criterios de un catálogo cerrado (`platform.known_criteria()`; qué
hace cada uno, en `server/issues/queue.js`): el primero manda y los demás
desempatan; a igualdad, la más antigua primero. La **Regla básica**, la del
equipo, viene de serie en `platform.priority_rules` (`builtin`): se ajusta
desde el Backlog, no se borra. Las demás las crea el equipo desde «Reglas de
priorización». Las reglas las ven Issues (al coger la siguiente) y Backlog;
crearlas, cambiarlas y borrarlas exige Backlog.

Desde el Backlog se **asigna** una issue a alguien del equipo de Issues: pasa a
su mesa como cogida y en el histórico queda «asignada» por quien lo hizo
(`platform_assign_issue`). La **prioridad** de una issue es la etiqueta PRIO
de Remedy, que pone negocio; SIA no guarda una lista propia (pendiente:
escribirla en Remedy desde el Backlog cuando haya acceso).

## Qué hay en cada máquina

- Configuración personal (Jira, GitHub, tema, sesión guardada, PIN del
  candado): `~/.sia/config.json`, solo en esa máquina.
- Los datos de Métricas (`datos.json`) y la foto de Issues (`foto.json`): cada
  uno se carga desde su vista con el CSV de la consulta de Remedy (puede ser
  el mismo fichero); en el workspace de esa máquina, no salen de ella.
