# Fase 2 — Evaluación

## Objetivo

Analizar cada entry del RAG contra los criterios de calidad definidos en el
SKILL.md. Identificar y clasificar problemas.

## Qué hacer

### 1. Leer entries del contexto

Ya las tienes del inventario (`list_entries`). Para cada entry, evalúa contra
los 7 criterios.

### 2. Detectar duplicados

Para cada entry, busca similares llamando a `search_knowledge` con su texto
(`top_k` 5). Si hay resultados con similitud > 0.85 cuyo texto no corresponde a
la misma entry → duplicado candidato.

### 3. Detectar problemas de tamaño

- **Muy corta** (<100 chars): probablemente incompleta o sin contexto suficiente.
- **Corta** (100-199 chars): revisar si se entiende sola.
- **Óptima** (200-1000 chars): OK.
- **Larga** (1001-1500 chars): aceptable pero revisar si se puede dividir.
- **Muy larga** (>1500 chars): dividir recomendado.

### 4. Detectar problemas de contenido

Lee cada entry y evalúa:
- **Precisión**: ¿La información parece correcta y actualizada? Marca como sospechosa si hay fechas antiguas, versiones obsoletas o tecnologías deprecated.
- **Relevancia**: ¿La entry pertenece al contexto donde está? ¿Aporta información útil?
- **Completitud**: ¿Se entiende sola? ¿Necesita contexto que no tiene?
- **Claridad**: ¿Está bien redactada? ¿Hay ambigüedades?
- **Consistencia**: ¿Usa la misma terminología que el resto del contexto?

### 5. Clasificar hallazgos

Agrupa los problemas por severidad:

| Severidad | Tipo de problema | Acción recomendada |
|---|---|---|
| 🔴 Crítico | Info incorrecta o contradictoria | Reescribir o eliminar |
| 🟠 Alto | Duplicado, obsoleto | Fusionar o eliminar |
| 🟡 Medio | Incompleto, sin contexto suficiente | Ampliar o reescribir |
| 🔵 Bajo | Estilo, tamaño fuera de rango | Reescribir o dividir |

### 6. Presentar hallazgos al usuario

```
🔍 Resultados de la auditoría — Contexto: [nombre]

🔴 Críticos (2):
  - Entry #12: "El sistema usa React 15..." → versión obsoleta
  - Entry #28: contradice Entry #15 sobre el flujo de login

🟠 Altos (3):
  - Entry #5 y #22: duplicados (similitud 0.92)
  - Entry #31: referencia a módulo eliminado hace 2 meses

🟡 Medios (4):
  - Entry #8: "Se usa JWT" — demasiado vaga, sin detalles
  - ...

🔵 Bajos (2):
  - Entry #3: 87 chars, demasiado corta
  - Entry #40: 1800 chars, debería dividirse

Total: 42 entries | 11 con problemas (26%)
```

## Criterio para avanzar

- Todos los contextos en alcance han sido evaluados.
- Los hallazgos están presentados y el usuario los ha revisado.

Pasa a la **Fase 3 — Acciones**.
