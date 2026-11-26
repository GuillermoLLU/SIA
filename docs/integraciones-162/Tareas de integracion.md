# Tareas de integración

Revisado con el equipo el 26/11/2026.

Solo lo que SIA lee y escribe en **Remedy** y en **Jira**, en el orden del flujo cerrado el 25/11. La pantalla que usa cada tarea se indica en «Lo usa».

**22 tareas de integración:** 13 de Remedy, 3 de Jira, 3 de las dos y 3 para prepararlas.

Piezas: **Remedy** R1 Leer la cola · R2 Leer una incidencia · R3 Cambiar responsable o grupo · R4 Cambiar estado · R5 Escribir una nota · R6 Adjuntar · R7 Editar campos · R8 Crear incidencia · R9 Relacionar · R10 Leer catálogos · R11 Buscar incidencias. **Jira** J1 Buscar abiertos de un proyecto · J2 Leer un Jira · J3 Comentar · J4 Crear un Jira.

## Preparar

| Tarea | Épica | Qué incluye | Piezas | Depende de | Hecho cuando | Prioridad |
|---|---|---|---|---|---|---|
| **Credencial de Remedy en Configuración (como la de Jira)** | Integración con Remedy | Jira ya está en Configuración: la URL del servidor del cliente y el token de cada técnico, que es nominal. Para Remedy, lo mismo: su URL y el token de cada técnico cuando se disponga del acceso. | — | que se facilite el acceso (externo) | Remedy se configura igual que Jira: su URL y el token de cada técnico, guardados en su equipo | Media |
| **Mapa de campos y estados de Remedy** | Integración con Remedy | Con el acceso a Remedy, con el equipo: qué datos y estados usa cada pieza (R1–R11) y qué permite cambiar (el grupo, el texto de la resolución, la categoría, la descripción, unir incidencias) y buscar (incidencias cerradas, de otros grupos, por el ticket del proveedor). | — | — | Cada pieza R1–R11 tiene sus campos y sus valores; Validado por el equipo | Crítica |
| **Datos de Jira para escalar** | Integración con Jira | Qué datos lleva el Jira al crearlo: las etiquetas (calculadas desde la categoría de la incidencia; el sistema afectado y la llamada a N3 los indica el técnico), la prioridad según la criticidad, el proyecto de destino y la versión. | — | — | Las reglas de etiquetas, prioridad, proyecto y versión están escritas y validadas por el equipo | Crítica |

## Conexiones

| Tarea | Épica | Qué incluye | Piezas | Depende de | Hecho cuando | Prioridad |
|---|---|---|---|---|---|---|
| **Cliente de Jira** | Integración con Jira | Buscar los Jira abiertos de un proyecto, leer, comentar y crear, con el token de cada técnico (ya en Configuración). Leer, desde el primer día; comentar y crear, preparados pero sin enviar nada hasta entregar el MVP. Comprueba que el token del técnico tiene acceso al proyecto de escalado y permiso para editar. Sustituye al Jira de prueba. | J1 J2 J3 J4 | — | Buscar y leer funcionan con el token de un técnico; SIA avisa si el token no tiene acceso al proyecto de escalado o no puede editar; Comentar y crear no envían nada hasta el MVP; Si Jira falla, SIA avisa con un mensaje claro | Crítica |
| **Remedy: lectura** | Integración con Remedy | Leer la cola del grupo y una incidencia entera (campos, notas, historial y adjuntos) en una sola lectura, y buscar incidencias fuera de la cola: abiertas, o resueltas y cerradas, por centro, módulo y sistema, y por ticket del proveedor. Sustituye a la foto del CSV. Si Remedy no responde, SIA avisa. Un cambio hecho en Remedy por fuera de SIA se refleja. | R1 R2 R11 | Mapa de campos y estados de Remedy y la credencial (externo) | La cola, las incidencias y las búsquedas salen de Remedy; Con Remedy caído, SIA avisa | Crítica |
| **Remedy: escritura** | Integración con Remedy | Escribir en Remedy: responsable o grupo, estado, notas (internas o públicas, con etiqueta), campos, adjuntos, crear y relacionar. Sustituye a los «sent: false». | R3 R4 R5 R6 R7 R8 R9 R10 | Remedy: lectura | Cada escritura llega a Remedy; Si Remedy rechaza la escritura, SIA avisa y no deja la incidencia a medias | Crítica |

## Cada pantalla, en el orden del flujo

| Tarea | Épica | Qué incluye | Piezas | Depende de | Hecho cuando | Prioridad |
|---|---|---|---|---|---|---|
| **— Mesa y Backlog —** | | | | | | |
| **Remedy: asignar y devolver** | Integración con Remedy | Escribir en Remedy el responsable y el estado al asignarse una issue (antes, comprobar en Remedy que sigue libre; si no, tomar la siguiente), devolver a la cola, asignar desde el Backlog y reasignar; y la etiqueta PRIO. Lo usa: la Mesa y el Backlog. | R3 R4 R7 | Remedy: escritura | Responsable, estado y PRIO quedan en Remedy; Si Remedy rechaza la escritura, SIA avisa y no deja la incidencia a medias | Alta |
| **— Pantalla de la issue —** | | | | | | |
| **Remedy: corregir módulo y centro** | Integración con Remedy | Cambiar en Remedy el módulo o el centro de la incidencia y dejar la nota [ISSUE-ACTUALIZADA]. Lo usa: el chat de la issue. | R7 R5 | Remedy: escritura | Módulo o centro y nota quedan en Remedy; Si Remedy rechaza la escritura, SIA avisa y no deja la incidencia a medias | Media |
| **Remedy: relacionar** | Integración con Remedy | Relacionar en Remedy una incidencia hija con su padre y leer esa relación. Lo usa: la recurrencia y Resolver. | R9 R2 | Remedy: escritura | La relación queda en Remedy | Baja |
| **Remedy: notas** | Integración con Remedy | Escribir notas internas y públicas con su etiqueta, incluidas las de llamada (CALLOK/CALLKO), y pasar a Pendiente de cliente al contactar con el centro. Lo usa: el chat de la issue, Seguimiento, Llamada y Contactar. | R5 R4 | Remedy: escritura | Cada nota llega con su visibilidad y su etiqueta; Si Remedy rechaza la escritura, SIA avisa y no deja la incidencia a medias | Alta |
| **Remedy: notas nuevas** | Integración con Remedy | Leer periódicamente las notas de las incidencias del técnico para saber cuáles son nuevas desde la última lectura. Lo usa: la Mesa y la pantalla de la issue (notas públicas del centro). | R2 | Remedy: lectura | SIA sabe qué notas son nuevas sin recargar a mano; Una nota ya leída no vuelve a contar como nueva | Media |
| **— Dividir —** | | | | | | |
| **Remedy: dividir** | Integración con Remedy | Editar el título y la descripción de la original, crear la nueva incidencia con sus datos y dejar en la original la nota con su número. Lo usa: Dividir. | R7 R8 R5 | Remedy: escritura | La original editada y la nueva creada en Remedy; Si Remedy rechaza la escritura, SIA avisa y no deja la incidencia a medias | Media |
| **— Major incident —** | | | | | | |
| **Remedy: major incident** | Integración con Remedy | Cambiar el estado, dejar la nota de major incident y, si procede, cambiar el responsable. Lo usa: declarar major incident. | R4 R5 R3 | Remedy: escritura | Estado, nota y responsable quedan en Remedy; Si Remedy rechaza la escritura, SIA avisa y no deja la incidencia a medias | Media |
| **— Resolver —** | | | | | | |
| **Remedy: resolver** | Integración con Remedy | Escribir la resolución: nota, mensaje al centro, categoría de la lista, informe adjunto y estado Resuelta. Lo usa: Resolver. | R2 R5 R10 R7 R6 R4 | Remedy: escritura | La resolución completa queda en Remedy; Si Remedy rechaza la escritura, SIA avisa y no deja la incidencia a medias | Alta |
| **— Escalar —** | | | | | | |
| **Remedy y Jira: recurrencia en Jira** | Integración con Remedy y Integración con Jira | Leer los Jira abiertos de un proyecto con su detalle (estado, prioridad, último movimiento, descripción y último comentario), comprobar una clave escrita a mano y buscar en Remedy las incidencias que llevan cada clave en el ticket del proveedor. Solo lee. Lo usa: Escalar. | J1 J2 R11 | Cliente de Jira y Remedy: lectura | Se leen los Jira abiertos del proyecto con su detalle; Cada Jira trae las incidencias de Remedy que esperan a él | Alta |
| **Jira: escalar** | Integración con Jira | Comentar el Jira elegido con lo nuevo de la issue (actualizar escalado) o crear uno nuevo con los datos de la tarea Datos de Jira para escalar. Comentar y crear, tras el MVP. Lo usa: Escalar. | J3 J4 | Cliente de Jira y Datos de Jira para escalar | El comentario llega al Jira elegido; El Jira nuevo se crea con sus datos | Alta |
| **Remedy: escalar** | Integración con Remedy | Escribir la clave en el ticket del proveedor, la nota [NUEVO ESCALADO] o [ACTUALIZAR ESCALADO] y los adjuntos, y pasar a Pendiente con el motivo «acción de proveedor externo». Lo usa: Escalar. | R7 R5 R6 R4 | Remedy: escritura y Jira: escalar | Clave, nota y estado quedan en Remedy; Si Remedy rechaza la escritura, SIA avisa y no deja la incidencia a medias | Alta |
| **— Seguimiento de los escalados —** | | | | | | |
| **Jira: estado de los escalados** | Integración con Jira | Leer el estado real de los Jira de los escalados del equipo, al refrescar y cada 30 minutos, y detectar cuándo se resuelven. Lo usa: el Seguimiento de la Mesa. | J2 | Cliente de Jira | Cada escalado enseña el estado real de su Jira | Alta |
| **Remedy y Jira: Jira resuelto** | Integración con Remedy y Integración con Jira | Cuando un Jira se resuelve: leer su comentario de cierre, escribir la nota [DIAGNOSTICO] en Remedy y resolver las incidencias que llevan ese Jira en el ticket del proveedor. Lo usa: el Seguimiento de la Mesa. | J2 R11 R5 R4 | Jira: estado de los escalados, Remedy: lectura y Remedy: resolver | La nota con el comentario de cierre queda en Remedy; Las incidencias de ese Jira quedan resueltas; Si Remedy rechaza la escritura, SIA avisa y no deja la incidencia a medias | Alta |
| **— Llamada de un centro —** | | | | | | |
| **Remedy y Jira: llamada de un centro** | Integración con Remedy y Integración con Jira | Al atender una llamada: nota en Remedy; reclamar (nota en Remedy y comentario en el Jira); subir la criticidad en Remedy; pasar a En curso. Lo usa: la llamada de un centro (reclamar y subir la criticidad). | R5 R4 R7 J3 | Remedy: escritura y Remedy: notas (el comentario en el Jira, tras el MVP) | Nota, criticidad y estado quedan en Remedy; El comentario llega al Jira | Alta |
| **— Traspasar —** | | | | | | |
| **Remedy: traspasar** | Integración con Remedy | Cambiar el responsable o el grupo con su nota, y leer el catálogo de grupos de soporte. Lo usa: Traspasar. | R3 R5 R10 | Remedy: escritura | Responsable o grupo y nota quedan en Remedy; Sin permiso para cambiar el grupo, SIA muestra el error de Remedy y propone traspasarla al responsable; Si Remedy rechaza la escritura, SIA avisa y no deja la incidencia a medias | Media |

## Después del MVP

| Tarea | Épica | Qué incluye | Piezas | Depende de | Hecho cuando | Prioridad |
|---|---|---|---|---|---|---|
| **Remedy: escalar a otro equipo** | Integración con Remedy | Crear un ticket de Remedy para otro equipo y relacionarlo con la incidencia. Después del MVP. | R8 R9 | Remedy: escalar | El ticket queda creado y relacionado en Remedy | — |

## Fuera

- **Teams / war room:** sin integración. Si hace falta, un enlace.
