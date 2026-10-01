---
name: knowledge-add
description: "Nutrir la base de conocimiento (RAG vectorial) con entries de calidad. Analiza contenido de la conversación, propone entries estructuradas y las guarda tras confirmación del usuario."
commandLabel: "Nutrir conocimiento"
commandDescription: "Extrae lo relevante de la conversación y lo publica en el RAG del equipo"
category: data
version: 2.2.0
enabled: true
---

# knowledge-add

Extrae conocimiento del contexto de conversación y lo guarda como entries en la
base de conocimiento compartida, usando las herramientas del servidor MCP
`knowledge` (`list_contexts`, `search_knowledge`, `ingest_knowledge`).

## Flujo obligatorio

Ejecuta en orden estricto. No avances sin completar cada paso.

### PASO 1 — Resolver contexto destino (SIEMPRE preguntar)

1. Llama a `list_contexts` para ver los contextos disponibles.
2. **Pregunta SIEMPRE al usuario a qué contexto guardar y espera su respuesta.**
   No lo infieras ni lo des por hecho, **aunque solo haya un contexto** o
   parezca obvio por el tema: los términos se cruzan entre contextos y elegir
   mal corrompe el conocimiento.
3. Presenta los contextos disponibles (nombre) para que elija; si quieres,
   sugiere cuál encajaría, pero la decisión la confirma el usuario.
4. No avances al paso 2 sin un contexto destino confirmado explícitamente.

### PASO 2 — Analizar contenido

Fuentes: el texto que indique el usuario, ficheros que mencione, o el historial
reciente de esta conversación («añade lo último sobre X»).

1. Identificar conceptos independientes (cada idea con sentido propio = 1 entry).
2. Si una idea necesita contexto previo para entenderse, inclúyelo en la misma entry.
3. **Calidad de entries:**
   - **200–1000 caracteres** por entry (óptimo para embeddings).
   - Cada entry debe entenderse sola. Malo: «Login con SSO». Bueno: «La
     autenticación usa SSO de Microsoft Azure AD con tokens que expiran cada 8 horas.»
   - Reformular a tono profesional. No inventar datos.
   - Sin opiniones sin fundamento ni texto sin valor.
4. **Verificar duplicados:** para cada candidata, llama a `search_knowledge` con
   su texto. Similitud > 0.85 = probable duplicado → marcarlo en el paso 3.

### PASO 3 — Proponer y confirmar

Mostrar resumen al usuario. No guardar nada aún.

```
He identificado X entries para el contexto «Nombre»:

1. "Texto completo tal como se guardará…" (N chars ✓)
2. "Otro texto…" (N chars ⚠ posible duplicado)

¿Confirmo todas? (puedes decir "solo la 1", "todas menos la 2", "reformula la 2"…)
```

Indicadores: `✓` válida · `⚠ posible duplicado` · `⚠ corta (<200 chars)`.

### PASO 4 — Crear entries

Solo tras confirmación explícita del **texto exacto** de cada entry (paso 3).
Por cada entry confirmada, llama a `ingest_knowledge` con `context_id`,
`content` y `source_type: "conversation"`. Al reportar, usa la **posición
dentro del contexto** (`posicion_en_contexto`) y el nº de chunks; NO menciones
la `ref_interna` (es un id global de la base, no «el número de la entry»).

## Reglas fundamentales (innegociables)

1. **SIEMPRE preguntar el contexto destino** (paso 1). Nunca inferirlo.
2. **PROHIBIDO llamar a `ingest_knowledge` sin que el usuario haya confirmado el
   texto concreto que se va a guardar.** Si el usuario reformula, vuelve a
   mostrar el texto final y reconfirma antes de guardar. Ante la duda, no guardes.
