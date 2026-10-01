# Fase 3 — Síntesis

## Objetivo

Estructurar los hallazgos de la investigación en un formato claro para el
usuario, y opcionalmente preparar entries para el RAG.

## Qué hacer

### 1. Presentar resumen al usuario

Estructura el resumen con esta plantilla:

```
🔎 Investigación: [tema]

## Resumen ejecutivo
[2-3 frases con la conclusión principal]

## Hallazgos clave

### [Subtema 1]
- [Hallazgo] (Fuente: [URL])
- [Hallazgo] (Fuente: [URL])

### [Subtema 2]
- [Hallazgo] (Fuente: [URL])

## Puntos en debate (si los hay)
- [Posición A]: [argumento] (Fuente: [URL])
- [Posición B]: [argumento] (Fuente: [URL])

## Fuentes consultadas
1. [Título] — [URL] (Confianza: Alta/Media)
2. [Título] — [URL] (Confianza: Alta/Media)
```

### 2. Preguntar al usuario

- "¿Esta información responde a lo que necesitabas?"
- "¿Quieres que profundice en algún aspecto?"
- "¿Quieres que prepare entries para el RAG con estos hallazgos?"

### 3. Si el usuario quiere persistir en el RAG

Prepara entries candidatas siguiendo los criterios de calidad del RAG:

- **200-1000 caracteres** por entry.
- **Cada entry se entiende sola.** Incluye contexto suficiente.
- **Incluye la fuente** en la entry cuando sea relevante: "Según la documentación oficial de [tecnología] (2026), ..."
- **Tono profesional y técnico.**
- **No incluir opiniones** ni valoraciones subjetivas.

Antes de proponer, llama a `search_knowledge` (servidor MCP `knowledge`)
con el texto de cada candidata para no repetir lo que ya está en el RAG.

Presenta las entries al usuario:

```
📋 Entries propuestas para el RAG:

1. "OAuth 2.0 con PKCE (Proof Key for Code Exchange) es el flujo recomendado para aplicaciones SPA y móviles..." (290 chars)

2. "En el flujo PKCE, el servidor de autorización valida que el code_verifier recibido en el intercambio de token coincide con el code_challenge enviado inicialmente..." (225 chars)

¿Confirmas? ¿Quieres modificar alguna?
```

### 4. Delegar persistencia

Si el usuario confirma, lee `skills/knowledge-add/SKILL.md` y sigue su flujo de
4 pasos con las entries confirmadas.

## Reglas

1. **Siempre presenta al usuario** antes de crear entries. Nunca persistas directamente.
2. **Cita fuentes** en las entries cuando aporten credibilidad.
3. **Separa hechos de opiniones.** Si un hallazgo es debatido, indícalo en la entry.
4. **No repitas lo que ya está en el RAG.** Verifica duplicados con `search_knowledge` antes de proponer.

## Criterio para finalizar

- El usuario ha recibido el resumen de la investigación.
- Si pidió entries RAG, están creadas y confirmadas.
- Si quiere profundizar, vuelve a **Fase 1** con un briefing más específico.
