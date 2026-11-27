# Flujo de resolución asistida de una issue

> Versión del 27/11/2026: el flujo cerrado con el equipo el 25/11 y revisado el
> 26/11, escrito con los nombres de las pantallas y los botones de SIA, para
> montar a partir de él la skill de resolución asistida.

**Cerrado con el equipo el 25/11/2026 y revisado el 26/11.** Aquí solo está lo
acordado. Lo que sigue abierto está en «Pendiente (no cerrado)», y lo que falta
construir en SIA, en «Dónde se construye».

## Hasta dónde llega la IA en el MVP

La skill de resolución asistida llega hasta donde se decida para la entrega 1.
En el MVP, la IA guía las fases hasta el análisis y el diagnóstico; **Resolver y
Escalar los completa el técnico** en sus ventanas, como hasta ahora. La IA tiene
que conocer esos pasos, pero guiarlos de principio a fin queda para la entrega 2
(acordado el 26/11). Por eso este documento describe el flujo entero, aunque no
todo entre en la skill de la primera entrega.

## Cómo leer este documento: las pantallas de SIA

| Nombre en este documento | Qué es en SIA |
|---|---|
| **Mesa de trabajo** | La vista donde el técnico ve sus issues: las que tiene **En curso**, la **Cola** (las que quedan sin coger) y **Seguimiento** (las pendientes de terceros, con las pestañas **Mías** y **Equipo**). Tiene los botones **«Asignar siguiente issue»** y **«Llamada de un centro»**. |
| **Backlog** | La vista con todas las issues del grupo, desde la que el TL o el responsable asigna, reasigna y marca con la etiqueta PRIO. |
| **Pantalla de la issue** | La que se abre al entrar en una issue. Arriba, la **cabecera** con los botones **Resolver**, **Escalar** y el menú **Otras acciones**. Debajo, las secciones **Datos de la issue**, **Seguimiento** (las notas de Remedy y de SIA), **Relacionadas** e **Historial**. |
| **Chat de la issue** | El chat de resolución asistida por IA de esa issue, dentro de la pantalla de la issue (hoy se abre con «Iniciar resolución asistida por IA»; se puede ampliar). |
| **Otras acciones** | El menú de la cabecera de la issue: Contactar con el centro, Llamada, Reclamar respuesta, Declarar major incident, Dividir la issue, Traspasar y Devolver a la cola. |
| **Ventana de Resolver** | La que se abre con el botón Resolver: cinco pasos (Nota interna, Causa, Solución, Prevención e Informe). |
| **Ventana de Escalar** | La que se abre con el botón Escalar: primero los escalados del mismo problema y después «Unir al ticket» o «Nuevo escalado», por pasos. |
| **Nota de fase** | Una nota interna en Remedy que empieza por su etiqueta (`[SITUACION INICIAL]`, `[RECURRENCIA]`…). Se ve en la sección Seguimiento de la issue. |
| **El técnico da el OK** | El técnico acepta en el chat de la issue el texto o la acción que propone la IA. Sin ese OK, SIA no escribe nada en Remedy. |

## Paso 1: «Asignar siguiente issue»

En la **Mesa de trabajo**, el técnico pulsa **«Asignar siguiente issue»**. Antes de
abrir nada:

1. SIA toma la primera issue de la **Cola**, en el orden de prioridad del técnico
   (cada técnico tiene su regla de priorización, así que el orden de la Cola
   puede ser distinto para cada uno).
2. Antes de asignarla, SIA comprueba en Remedy que sigue libre. Si alguien se la
   ha quedado por fuera de SIA, toma la siguiente de la Cola sin avisar (26/11).
3. En Remedy, la issue pasa a **En curso** con ese técnico como responsable.
4. Si Remedy no responde o da un error técnico, SIA no asigna ninguna issue y
   avisa en la Mesa de trabajo de que Remedy no está disponible.

Depende de la integración con Remedy. La conexión será un servicio con usuario y
contraseña que devuelve un token; SIA lo guarda hasta que caduca (26/11). Los
errores de Remedy y de Jira se enseñan siempre en la pantalla, con su motivo.

## Paso 2: Se abre la pantalla de la issue y arranca el chat

Con la issue asignada:

1. SIA abre la **pantalla de la issue** que se acaba de asignar.
2. El **chat de la issue** arranca solo: el técnico no tiene que pulsar «Iniciar
   resolución asistida por IA».
3. El chat recibe dos cosas:
   - todo lo que SIA tiene de la issue, sin recortar: los campos de **Datos de la
     issue**, la nota de apertura completa, todas las notas de **Seguimiento**, lo
     que hay en **Relacionadas** y el **Historial**. No va en un mensaje, porque no
     cabría: se le pasa de otra forma, por ejemplo un fichero con todo agregado;
   - la skill de resolución asistida que debe seguir, que se escribe a partir de
     este documento.

### Al arrancar el chat: qué fases ya están hechas

Antes de empezar, la IA revisa en **Seguimiento** qué fases tiene ya hechas la
issue, porque algunas llegan con parte del trabajo:

1. Busca las **notas de fase** (`[SITUACION INICIAL]`, `[MAJOR INCIDENT]`,
   `[RECURRENCIA]`, `[ANTECEDENTES]`, `[ANALISIS]`, `[DIAGNOSTICO]`) y la fecha de
   cada una.
2. Si la nota de una fase tiene más de 1 día, la IA propone en el chat revisarla
   con el técnico, por si ha cambiado algo y sigue siendo válida.
3. Si en Seguimiento hay una nota `[REAP]` (reapertura), la IA lee el motivo y lo
   contrasta con el diagnóstico y la resolución anteriores. No hay que rehacerlo
   todo, pero sí revisar como mínimo el análisis, el diagnóstico y la resolución.
   La situación inicial, la recurrencia y los antecedentes solo se revisan si el
   motivo indica que el problema es otro.
4. El chat sigue desde la primera fase que no tenga nota o que haya que rehacer, y
   se lo dice al técnico («la situación inicial ya está; empezamos por la
   recurrencia»).

## Paso 3: Las fases de la issue

A partir de aquí, el chat de la issue guía al técnico fase a fase, empezando por
la situación inicial.

Reglas para todas las fases:
- La IA propone textos y acciones en el chat, pero el OK lo da siempre el técnico.
- Cada fase termina con su nota de fase en Remedy, escrita por SIA cuando el
  técnico da el OK al texto.
- El estado de la issue en Remedy se cambia cuando toca (ver «Estados de la
  incidencia»): no se deja nada colgado.

### Fase 1: Situación inicial

La IA comprueba con el técnico, en el chat:

1. **Resumen de la nota de apertura.** Un resumen conceptual del problema, no de
   longitud: a partir de la nota de apertura, la IA explica con claridad qué
   pasa, sin meter texto por meter.
2. **Módulo confirmado.** La IA comprueba si el problema es coherente con el
   módulo que figura en Datos de la issue y ayuda al técnico a verificarlo.
3. **Centro confirmado.** Igual que el módulo, con el centro de Datos de la issue.
4. **¿Uno o dos problemas?** La IA comprueba si la nota de apertura describe un
   solo problema o dos distintos.

Si el módulo o el centro están mal puestos, el técnico indica en el chat el
correcto. Con su OK, SIA lo cambia en Remedy (se ve en Datos de la issue) y deja
la nota `[ISSUE-ACTUALIZADA]`, que dice qué se ha cambiado y por qué («se cambia X
por Y porque Z»).

Cierre: cuando los cuatro puntos tienen el OK del técnico, la IA propone en el
chat el texto de la nota `[SITUACION INICIAL]` con el resumen del problema. SIA la
escribe en Remedy cuando el técnico da el OK a ese texto.

#### Si trae dos problemas: «Dividir la issue»

SIA nunca crea una issue de cero; como mucho, divide una que trae dos problemas.

1. **Solo si son dos problemas distintos.** Si es el mismo problema contado de
   dos formas, no se divide.
2. **Otras acciones → «Dividir la issue».** Se abre una ventana con dos columnas:
   a la izquierda, **la issue original** con lo que dice el centro; a la derecha,
   **la issue nueva**. Se corta de la original lo del segundo problema y se pega
   en la nueva; las dos se pueden reescribir y retocar su título.
3. **La nueva** se crea en Remedy con los mismos datos que la original (centro,
   criticidad, origen, estado, grupo y categoría) y su propio título y
   descripción.
4. **Nota en la original** que dice que se ha abierto otra para el segundo
   problema, con su número. No se relacionan en Remedy: son problemas distintos.
5. La original sigue su flujo desde aquí; **la nueva va a la Cola** como una issue
   más: la coge quien esté libre (25/11).

### Fase 2: Major incident (solo si la issue es crítica)

Solo si la criticidad en Datos de la issue es crítica. Si no, esta fase no aplica.

1. **¿Es bloqueante?** Lo decide siempre el técnico, y eso es lo que decide si es
   major incident. La IA solo avisa en el chat: «es crítica, puede ser
   bloqueante, ¿lo es?». No recomienda una respuesta.
2. **Nota `[MAJOR INCIDENT]`.** Se escribe siempre, sea bloqueante o no,
   justificando el porqué con pruebas.
3. **Si es bloqueante: Otras acciones → «Declarar major incident»** (hoy se llama
   «Abrir WAR-ROOM»). Cambia el estado, deja la nota y después se abre la war
   room. Mientras dure, una barra roja de alerta en SIA, visible para todo el
   equipo, que dice quién está en una war room (en qué pantallas, lo define la
   #174).
4. **Antes de declararlo: ¿hay un compañero en war room?** SIA enseña quién del
   equipo tiene un major incident declarado.
   - Si lo hay, el técnico confirma si es el mismo tema.
   - Si es el mismo tema, la issue se traspasa automáticamente a ese compañero.
   - Si no es el mismo tema, o no hay nadie en war room: se avisa por Teams a los
     responsables del servicio y se abre una war room por el proceso del cliente.
     Teams queda fuera de la integración (sin permisos extra del cliente): si hace
     falta, SIA da un enlace.
5. **La war room.** Mete a mucha gente en una reunión para resolver cuanto antes.
   Entran siempre el técnico que tiene la issue y la ha iniciado y, como mínimo,
   el responsable del servicio (al menos el TL). A menudo se desbloquea al
   usuario con una solución temporal sencilla mientras se sigue investigando la
   causa raíz, para que no se repita, o de dónde viene.
6. **Nota `[SERVREST]` (servicio restablecido).** Cuando el usuario ya no está
   bloqueado, se deja con pruebas de que el servicio está restablecido. No
   cierra la investigación: si procede, se sigue investigando y se aporta una
   resolución definitiva para la causa raíz.
7. **Después.** El chat sigue con el resto de fases (recurrencia, antecedentes,
   análisis…) para resolverla del todo y dejar las notas en orden.

Diferencia con el camino normal: en una war room lo primero es resolver cuanto
antes, sin perder tiempo en rellenar la issue formalmente. Las notas de fase se
completan después.

### Fase 3: Recurrencia

SIA busca en Remedy otras issues **abiertas ahora mismo** con el mismo problema, y
la IA propone en el chat las que encajan. Las ya cerradas no son recurrencia: son
antecedentes (fase siguiente).

Criterio de búsqueda:
- **SGA**: mismo centro y resumen parecido.
- **SISU**: mismo módulo y resumen parecido, en cualquier centro.

Si hay recurrencia, su análisis sirve como hipótesis de partida, pero el
análisis propio de la issue hay que hacerlo igualmente.

Cierre:
- **Hay recurrencia** (el técnico confirma en el chat que una issue abierta es el
  mismo problema): con su OK, SIA vincula en Remedy esta issue como hija de la
  padre (se ve en Relacionadas) y deja una nota `[RECURRENCIA]` que la cita. La
  padre es siempre la primera que nació: si la encontrada ya es hija de otra,
  esta se vincula a esa misma padre, no a la última.
- **No hay recurrencia**: se deja la nota `[RECURRENCIA]` diciendo que no se ha
  encontrado ninguna issue abierta con el mismo problema.

Una padre ya resuelta, aunque aún no esté cerrada, no es recurrencia: es un
antecedente, y la nueva issue pasa a ser la nueva padre. Si la reabren, vuelve a
la Cola y el flujo ya lo cubre.

Aunque haya padre, la issue sigue todo el flujo de resolución. Excepción: si la
padre ya está escalada y pendiente, y el resto del proceso llega al mismo caso,
no se escala de nuevo: en la ventana de Escalar se elige el Jira de la padre y se
actualiza («Unir al ticket»).

Si se pulsa Resolver en una hija antes de que se resuelva la padre, SIA avisa de
que hay más issues relacionadas y pregunta si se resuelven todas, ya que están
vinculadas.

### Fase 4: Antecedentes

SIA busca en Remedy issues **ya resueltas o cerradas** con el mismo problema, y la
IA propone en el chat las que encajan.

Criterio de búsqueda, solo dentro del sistema de la issue (si es SGA, en issues
de SGA; si es SISU, en issues de SISU):
- mismo centro;
- mismo módulo;
- resumen parecido.

Los antecedentes aportan pruebas y un análisis previo que el técnico tiene que
reconfirmar.

Cierre: se deja una nota `[ANTECEDENTES]` que cita los antecedentes encontrados
y qué aporta cada uno, o que dice que no hay ninguno.

Los antecedentes no se vinculan en Remedy (no salen en Relacionadas), solo se
citan en la nota. Vincular issues cerradas crearía cadenas que crecen sin
control: si A se vincula a B, B se cierra y aparece C, habría que vincular A y B
a C, y así cada vez. La agrupación de un mismo problema la hace la recurrencia,
con las issues abiertas.

### Preanálisis (sale de las fases 3 y 4)

La recurrencia y los antecedentes dan un preanálisis: pistas de lo que puede
estar pasando y de cómo se resolvió antes. La IA las presenta en el chat como
pistas, no como conclusiones: hay que confirmarlas en el análisis propio de la
issue.

### Fase 5: Análisis

El análisis es reunir las **evidencias del error**, sin sacar todavía la causa,
que va en el diagnóstico. La IA pide y ordena en el chat las evidencias que el
técnico va trayendo.

De dónde salen las evidencias:
- logs;
- WhatsUp (sistema de alertas);
- la base de datos (BD) del módulo;
- Grafana (estado del módulo y métricas funcionales);
- pruebas en local, o en remoto contra una GUI o una HHT;
- la mensajería de CIS.

Cierre: con el OK del técnico, SIA escribe la nota `[ANALISIS]` con las
evidencias. Después, la IA ayuda al técnico a decidir si la issue se resuelve
(camino A, botón Resolver) o se escala (camino B, botón Escalar).

## Camino A: Resolver

### Fase 6: Diagnóstico

La IA, con todo lo reunido en las fases anteriores, ayuda al técnico a sacar el
diagnóstico. Con su OK, SIA escribe la nota `[DIAGNOSTICO]` en Remedy.

### Categoría (tras el diagnóstico)

Un paso propio y obligatorio (acordado el 23/11): qué tipo de incidencia es (un
fallo del código, de operativa, de configuración, de base de datos…). El técnico
la elige de la lista de categorías de Remedy; la IA puede proponerla en el chat.
El botón **Resolver** de la cabecera solo se habilita cuando hay diagnóstico y
categoría. Dónde se elige (en el chat de la issue o en la ventana de Resolver) lo
define la #171. Si la issue se escala a N3, la categoría es automática: fallo del
sistema.

### Fase 7: Resolución (ventana de Resolver)

El técnico pulsa **Resolver** en la cabecera de la issue. La ventana de Resolver
tiene cinco pasos: **Nota interna**, **Causa**, **Solución**, **Prevención** e
**Informe**. Causa, Solución y Prevención forman el mensaje al centro. El Informe
es el resumen de todo, así que los pasos que hay que completar son cuatro.

Resolver no es cerrar: la issue pasa a Resuelta y se cierra sola a los 5 días si
no la reabren. Si tiene hijas, no se resuelven solas: al resolver la padre, el
chat avisa de las vinculadas (las de Relacionadas) y el técnico las revisa una a
una.

La Nota interna es la nota `[RESOLUCION]`, la que solo ve el equipo en Remedy.

El mensaje al centro (Causa, Solución y Prevención):
- La Causa sale del `[DIAGNOSTICO]` y debe coincidir con él.
- Se escribe de forma muy sencilla, para que se entienda qué ha pasado. Se
  pueden usar los términos propios del ecosistema, porque quien lo lee trabaja
  en él, pero el mensaje tiene que ser claro.
- Cada texto tiene que aportar valor; nada de rellenar por rellenar.
- Cada parte se completa en su paso de la ventana de Resolver. Se juntan en el
  paso Informe, en un único mensaje con formato de correo que expone esas tres
  ideas.
- Prevención: la decide el técnico. Si no hace falta prevenir nada, se dice así
  y por qué (por ejemplo, «ha sido un error puntual debido a X, por lo que no es
  necesaria ninguna acción»).

Cómo ayuda la IA en estos cuatro pasos: no se rellenan desde el chat, sino en la
ventana de Resolver. Cada paso tiene un botón «Autocompletar con IA»; al pulsarlo,
el chat de la issue escribe en ese paso el texto que cree que va, con todo el
contexto previo de la conversación. El técnico lo revisa y lo da por bueno o lo
cambia. (El botón aún no existe.)

## Camino B: Escalar

Para escalar hacen falta las notas de fase hasta el análisis (situación inicial,
major incident en críticas, recurrencia, antecedentes y análisis). El diagnóstico
no: a veces se escala justo porque no se llega a él.

### Fase 6B: Recurrencia en Jira (primer paso de la ventana de Escalar)

El técnico pulsa **Escalar** en la cabecera de la issue. Lo primero que hace la
ventana de Escalar es la recurrencia en Jira, que es obligatoria: no se puede
crear un escalado nuevo sin haber revisado los Jira abiertos.

1. El técnico elige el proyecto de Jira: el equipo al que va a escalar. SIA le
   enseña lo que hay abierto en ese proyecto («Buscando escalados del mismo
   problema»). Afinar por centro o por resumen, más adelante, si salen
   demasiados.
2. Si la padre (fase 3) ya está escalada, su Jira es el primero que se propone.
3. El técnico revisa el detalle de cada uno dentro de SIA (estado, prioridad,
   último movimiento, descripción, último comentario e issues que esperan a ese
   Jira) sin salir a Jira.

### Fase 7B: Escalar (siguientes pasos de la ventana)

Con los Jira encontrados a la vista, hay dos caminos con el mismo aspecto:

- **Hay uno del mismo problema → «Unir al ticket» (actualizar escalado).** Se
  elige de la lista (u otro escrito a mano, que SIA comprueba). La IA propone el
  comentario con lo nuevo de esta issue (centro, situación inicial y análisis);
  con el OK del técnico, SIA lo añade al Jira y en Remedy quedan la nota
  `[ACTUALIZAR ESCALADO]` y la clave en el campo del ticket del proveedor.
- **No hay ninguno → «Nuevo escalado»,** en pasos:
  1. **A quién:** SIA sugiere el destino con la regla de hoy (tipo de
     instalación o sistema) y el técnico lo elige de una lista; nunca se
     escribe a mano.
  2. **Motivo del escalado:** empieza con la nota `[ANALISIS]`, con imágenes y
     archivos.
  3. **Requisitos:** la prioridad del Jira es fija según la criticidad (se
     enseña, no se elige) y lo mínimo que pide el destino (para N3 de
     desarrollo, el chat N3 como ayuda). Las etiquetas del Jira se calculan por
     detrás («calculando etiquetas…»); el técnico solo confirma una o dos (el
     sistema donde está el fallo y si ha llamado a N3), según se cierre en la
     #139.
  4. **Borrador del escalado:** lo que se enviará; botón «Crear escalado».
  SIA crea el Jira, con la versión afectada, y en Remedy quedan la clave en el
  campo del ticket del proveedor y la nota `[NUEVO ESCALADO]`, que guarda la
  traza aunque alguien borre el campo.

En los dos casos la issue pasa en Remedy a Pendiente con el motivo «acción de
proveedor externo», y aparece en la Mesa de trabajo, en Seguimiento.

Hoy se escala por dos portales que abren un Jira (N3 de desarrollo y equipos N2)
o un ticket de Remedy a otro equipo. El correo al buzón de otro equipo no es un
escalado, pero hay que marcarlo. El MVP cubre los Jira, que son el grueso
(80-90 %); el resto, después. Mientras, la ventana de Escalar avisa de lo que no
se escala por aquí («hazlo en Remedy» o «escalado externo»). En la ventana de
Escalar habrá algo parecido al «Autocompletar con IA» de Resolver.

### Después del escalado

1. El equipo sigue sus escalados en la Mesa de trabajo, en **Seguimiento**
   (pestaña **Equipo** para los de todos, **Mías** para los propios). SIA mira el
   estado de los Jira cada media hora.
2. Cuando SIA detecta un Jira resuelto (cada media hora o al refrescar
   Seguimiento), el comentario de cierre del Jira hace de diagnóstico: SIA
   completa la nota `[DIAGNOSTICO]` en Remedy y resuelve las issues que esperan a
   ese Jira.
3. Si quien lleva un escalado no está, se puede **reasignar** desde Seguimiento,
   pestaña Equipo: se reasigna la issue en Remedy, no el Jira.

## Estados de la incidencia

En el diagrama, por colores (acordado el 23/11):

| Estado en Remedy | Cuándo |
|---|---|
| Sin asignar | Entra la incidencia y nadie la ha cogido (está en la Cola) |
| En curso | Desde «Asignar siguiente issue» hasta el diagnóstico y la categoría, también al escalar o dividir |
| Pendiente | Esperando al centro (acción de cliente requerida) o al proveedor (acción de proveedor externo); sale en Seguimiento. Cuando el centro trae lo que faltaba, vuelve a En curso |
| Resuelta | Tras la resolución; pasa a Cerrada sola a los 5 días si no la reabren |

## En cualquier fase

### Pendiente del cliente: «Contactar con el centro»

Si el técnico tiene una duda en cualquier fase, puede preguntar al centro:

1. La IA ayuda a redactar la pregunta en el chat.
2. El técnico la envía con **Otras acciones → «Contactar con el centro»**
   («Enviar al centro»): queda en Seguimiento como nota pública, que ve el centro,
   y la issue pasa a Pendiente con el motivo «acción de cliente requerida».
3. Cuando el centro responde (por nota o por una llamada), la issue pasa a En
   curso y el chat retoma la fase en la que se quedó.

### Traspasar

Se puede traspasar en cualquier momento, también antes del análisis (por
ejemplo, a fin de turno), con **Otras acciones → «Traspasar»**. No se bloquea:
SIA registra cuándo y en qué fase, para detectar malos usos.

- **A un compañero:** con una nota de lo hecho, lo que falta y el motivo. La issue
  sigue En curso. El límite de 5 issues En curso es solo para «Asignar siguiente
  issue»; con traspasos se pueden tener más.
- **Una escalada:** también se puede traspasar sin abrirla, desde Seguimiento
  (pestaña Mías) en la Mesa de trabajo.
- **A otro equipo:** cambia el grupo en Remedy con una nota del motivo. Si el
  técnico no tiene permiso para cambiar el grupo, SIA enseña el error de Remedy
  («no tienes autorización para este cambio») y propone traspasarla al
  responsable del servicio con una nota; él la pasa (26/11).

### Editar una nota

Una nota interna se puede editar durante media hora desde que se escribe; pasado
ese tiempo, se corrige con una nota nueva. Las notas públicas no se editan nunca
(acordado el 26/11).

### «Llamada de un centro» (desde la Mesa de trabajo)

A un técnico le puede llamar un centro con el número de una incidencia, que
puede estar en cualquier estado y la puede llevar cualquiera. El técnico pulsa
**«Llamada de un centro»** en la Mesa de trabajo y la busca por su número. Ve en
una sola lectura: estado, quién la lleva, lo que dice el centro y las últimas
notas. La llamada se guarda con el teléfono y lo hablado, en texto libre.

**Nadie se queda una incidencia desde una llamada**: sería saltarse la Cola.

| La incidencia está | El centro llama para | Qué se hace |
|---|---|---|
| Nueva (solo la nota de apertura) | Dar información o preguntar | Solo nota |
| En curso (tuya o de un compañero) | Dar información, reclamar o preguntar | Nota de que han llamado |
| Pendiente del centro | Dar lo que faltaba | Nota con lo que trae y pasa a En curso |
| Pendiente de un escalado | Reclamar o preguntar | Reclamar: nota en Remedy y comentario en el Jira |
| Cualquiera | Subir la criticidad | Se sube un nivel (ver «Subir la criticidad») |

Si quien la lleva no está y la incidencia ya se puede trabajar, se pide al TL o
al responsable que la reasigne desde el Backlog. Quien se va de vacaciones
traspasa antes lo suyo.

### Subir la criticidad

El centro puede pedir que se suba la criticidad de una incidencia (la prioridad
de Remedy que se ve en Datos de la issue), por teléfono o en una nota pública.
**Cualquier técnico** la puede subir, porque la criticidad cambia a petición del
centro: un nivel (media → alta, alta → crítica) y **nunca se baja**. Se sube
desde «Llamada de un centro» y desde la pantalla de la issue (#168). No es la
etiqueta PRIO del Backlog, que ordena la Cola.

### Notas públicas nuevas

Las notas públicas que entran del centro se destacan en la Mesa de trabajo y en
la pantalla de la issue (#170), para que no pasen desapercibidas mientras el
técnico trabaja en otra issue.

### Lo que hay en «Otras acciones»

- **Llamada:** el teléfono y lo hablado, o «No responden» (llamada sin
  respuesta); queda en Seguimiento como nota con su etiqueta de llamada.
- **Contactar con el centro:** ver «Pendiente del cliente».
- **Reclamar respuesta** a un tercero, en una issue pendiente.
- **Declarar major incident:** ver la fase 2.
- **Dividir la issue:** ver la fase 1.
- **Traspasar:** ver «Traspasar».
- **Devolver a la cola:** con nota obligatoria del motivo (se registra). No debe
  usarse para mejorar el SLA de forma artificial: queda registrado y la issue
  vuelve a ser la siguiente que se asigna.

Fuera de ese menú:
- **«Llamada de un centro»,** en la Mesa de trabajo, sin tener la issue: ver
  «Llamada de un centro».
- **Reportar** «no puedo seguir este flujo»: si la IA propone un paso que no
  encaja con la issue que el técnico tiene delante, pulsa el botón y SIA guarda
  en qué issue, en qué fase y qué fallaba. Sirve para que el equipo vea dónde se
  rompe el flujo y corrija la skill con casos reales. Propuesta; dónde va, por
  decidir.

## Después del MVP

- Escalar por el otro portal y por Remedy a otro equipo, y cómo marcar el correo
  a otro equipo. Mientras, la ventana de Escalar avisa de lo que no se escala
  por aquí (#173).
- Relacionadas como grafo: desde una hija ver la padre, las hermanas y el resto
  de relacionadas (#165).
- Que la IA guíe Resolver y Escalar de principio a fin (entrega 2).

## Pendiente (no cerrado)

- Adjuntos: primero un zip; quizá un PDF más adelante (ver el coste de tokens).
- El botón «Reportar»: si se hace y dónde va (en el chat de la issue, que es
  sobre lo que opina, o en «Otras acciones»).
- Qué permite cambiar el acceso a Remedy (grupo, texto de la resolución,
  categoría, descripción, unir incidencias): se sabrá al tenerlo. Nada que pida
  permisos extra al cliente.

## Dónde se construye

Lo que este flujo pide a SIA está en las tareas:

- Las integraciones con Remedy y Jira: épica #162 (por pantalla) y las tareas de
  integración de la PR #175, que se crearán en Integración con Remedy (#127) e
  Integración con Jira (#161).
- Categoría antes de resolver: #171.
- Escalar: requisitos (#172), etiquetas del Jira (#139) y aviso de lo que no se escala por aquí (#173).
- Llamadas de un centro: reclamar (#169) y subir la criticidad (#168).
- Destacar las notas públicas nuevas: #170.
- Declarar major incident: #174.
- Relacionadas (padre, hijas y hermanas): #165. Selección múltiple: #166.
