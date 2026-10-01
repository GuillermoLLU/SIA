---
name: knowledge-audit
description: "Cuando se necesite revisar la calidad del RAG existente, detectar entries duplicadas, obsoletas, incompletas o de baja calidad, y proponer acciones de limpieza o mejora."
commandLabel: "Auditar conocimiento"
commandDescription: "Revisa la calidad del RAG: duplicados, obsoletos, incompletos; propone y ejecuta limpieza"
category: data
version: 2.0.0
enabled: true
---

# knowledge-audit

Skill para auditar la calidad del contenido almacenado en la base de
conocimiento (RAG vectorial). Detecta problemas, propone correcciones y ejecuta
limpieza con confirmación del usuario.

Un RAG sin mantenimiento se degrada silenciosamente: entries obsoletas,
duplicados, inconsistencias y gaps reducen la calidad de las respuestas del
sistema. Esta skill institucionaliza la revisión periódica.

## Herramientas

Todo se hace con las tools del servidor MCP `knowledge`:
`list_contexts`, `list_entries`, `search_knowledge`, `ingest_knowledge`, `delete_entry`.

## Proceso

Lee **solo** el archivo de la fase en la que estés:

| Fase | Archivo | Objetivo |
|---|---|---|
| 1. Inventario | `phases/01-inventory.md` | Obtener una foto completa del RAG actual |
| 2. Evaluación | `phases/02-evaluation.md` | Analizar cada entry contra criterios de calidad |
| 3. Acciones | `phases/03-actions.md` | Proponer y ejecutar correcciones |

## Criterios de calidad

Cada entry se evalúa contra estos criterios (basados en estándares de auditoría
de knowledge bases empresariales):

| Criterio | Descripción | Señal de problema |
|---|---|---|
| **Precisión** | La información es correcta y verificable | Datos desactualizados, cifras erróneas |
| **Relevancia** | La entry aporta valor al contexto donde está | Contenido genérico, fuera de tema |
| **Completitud** | La entry se entiende sola, sin contexto externo | Frases sueltas, referencias huérfanas |
| **Claridad** | Redacción profesional, sin ambigüedad | Jerga sin explicar, frases confusas |
| **Consistencia** | Terminología uniforme con el resto del contexto | Mismo concepto con distintos nombres |
| **Unicidad** | No hay duplicados o solapamientos significativos | Entries con similitud >0.85 |
| **Tamaño** | Entre 200-1000 caracteres (óptimo para embeddings) | Entries muy cortas (<100) o muy largas (>1500) |

## Reglas generales

1. **No borres nada sin confirmación** explícita del usuario.
2. **Presenta los problemas agrupados** por tipo y severidad.
3. **Propón acciones concretas** para cada problema: reescribir, fusionar, eliminar, ampliar.
4. **Severidad**: Crítico (info incorrecta) > Alto (duplicado/obsoleto) > Medio (incompleto) > Bajo (estilo/tamaño).
5. Si el volumen de entries es grande (>50), trabaja por contexto o por lotes.
