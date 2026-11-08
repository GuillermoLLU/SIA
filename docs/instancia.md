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

## Equipo, roles, vistas y reglas

Cada persona ve las **vistas** que se le den: Chat, Issues, Backlog, Equipo soporte,
Métricas, Enlaces rápidos, Laboratorio, Administración y Equipo
(`platform.users.views`; la lista, en `platform.known_views()`). El Chat también se
puede quitar; sin él no se abren chats, salvo el de una issue, que va con Issues. La app
se abre en la primera que tenga de Issues, Backlog y Métricas (el Chat es auxiliar: va
arriba a la derecha y solo se abre de entrada si no tiene ninguna de esas); con una sola de
ellas no hay dock abajo. Y coge
las issues en el orden de su **regla de priorización** (`platform.users.rule_id`;
sin ella, la básica).

Lo cómodo es darlas con un **rol** (un nombre, unas vistas y una regla,
`platform.roles`): asignar un rol pone sus vistas y su regla y editarlo las
cambia a todos los que lo tienen. Vienen **Administrador** (todas las vistas,
fijo) y **Agente** (Chat y Enlaces, el de toda alta), y en Equipo → **Roles** se
crean los que hagan falta. Tocar una vista suelta de alguien, o cambiarle la
regla, lo deja **personalizado**: ya no sigue a ningún rol.

**Equipo** está en Configuración, para quien tiene esa vista. Es una lista donde
todo se cambia en la propia fila: el rol y la regla (selectores), qué proyectos
de la base ve (a pulsar) y su acceso (un interruptor que, apagado, le corta la
entrada sin borrar nada). Al lado de la lista se abre un panel para sus vistas
(cajas que se encienden y apagan), para generarle una contraseña nueva (la
cambia al entrar) o para dar de alta a alguien con su rol, su contraseña inicial
y sus proyectos en un solo paso. Borrar pide escribir su email. Nadie edita el
rol que tiene, cambia sus propias vistas o su regla ni se desactiva, así que
siempre queda alguien con Equipo. Todo pasa por funciones de la base que
comprueban quién llama y sus vistas; las tablas no se pueden leer ni con la
publishable.

En **Configuración → Administración**, solo para quien tiene ese poder, se crean
y eliminan los proyectos de la base de conocimiento. Sus entradas se consultan y
se nutren desde el Chat. Sin conocimiento asignado los chats
funcionan igual, pero sin la base del equipo ni sus skills.

## Backlog y reglas de priorización

Quien tiene la vista **Backlog** ve la cola del equipo de sus orígenes (SGA,
SISU, según su conocimiento): las issues de la foto que nadie tiene (sin responsable en Remedy ni cogidas en SIA), en el
orden de una **regla de priorización**. Una regla es un nombre y una lista
ordenada de criterios de un catálogo cerrado (`platform.known_criteria()`; qué
hace cada uno, en `server/issues/queue.js`): el primero manda y los demás
desempatan; a igualdad, la más antigua primero. La **Regla básica**, la del
equipo, viene de serie en `platform.priority_rules` (`builtin`): se ajusta
en Priorización, no se borra. Las demás las crea el equipo en Configuración →
**Priorización**. Las reglas las ven Issues (al coger la siguiente, cada persona
con la suya), Backlog y Equipo (que elige la de cada rol y cada persona);
crearlas, cambiarlas y borrarlas exige Backlog. Si se borra una, quien la
tenía pasa a la básica.

Cada issue tiene un **origen**, SGA o SISU, y solo la lleva quien tiene el
conocimiento de ese origen, es decir, un proyecto de la base con su nombre: al
coger la siguiente, la cola de cada persona solo trae issues de sus orígenes; al
asignar o traspasar, solo se puede elegir a quien lo tiene, y la base lo vuelve a
comprobar (`platform.require_origin`, que rechaza con «Esa persona no tiene el
conocimiento de SGA.»).

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
