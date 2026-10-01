# Fase 1 — Inventario

## Objetivo

Obtener una foto completa del contenido RAG actual: cuántos contextos hay,
cuántas entries por contexto, y una primera impresión del estado general.

## Qué hacer

### 1. Obtener los contextos

Llama a `list_contexts` para ver los contextos existentes. Si el usuario quiere
auditar solo uno o algunos, acótalo con él.

### 2. Listar entries de cada contexto

Llama a `list_entries` con cada `context_id` en alcance. Para cada contexto,
recopila:

- Número total de entries
- Fecha de creación de la más antigua y la más reciente
- Distribución por `source_type` (conversation, file, audit…)
- Longitud media de las entries (caracteres)

### 3. Presentar resumen al usuario

```
📊 Inventario del RAG:

**Contexto: [nombre]** (ID: xxx)
- Entries: 42
- Rango: 2026-01-15 → 2026-04-18
- Fuentes: 30 conversation, 12 file
- Longitud media: 380 chars
- Entries < 100 chars: 3
- Entries > 1500 chars: 1
```

### 4. Preguntar alcance de la auditoría

- "¿Quieres que audite todos los contextos o solo [nombre]?"
- "¿Hay algún tema o área que te preocupe especialmente?"

## Criterio para avanzar

- Tienes el inventario completo de los contextos a auditar.
- El usuario ha confirmado el alcance.

Pasa a la **Fase 2 — Evaluación**.
