# Fase 3 — Estructuración

## Objetivo

Convertir todo el conocimiento recopilado en entries de calidad listas para el
RAG. Luego delegar en la skill `knowledge-add` para guardarlas.

## Qué hacer

### 1. Identificar conceptos independientes

Cada concepto que tiene sentido por sí solo = 1 entry candidata. Tipos comunes:

- **Descripción de módulo/pantalla** — "El módulo de facturación permite a los usuarios con rol Administrador generar facturas mensuales..."
- **Flujo de proceso** — "Para crear un pedido, el usuario selecciona productos del catálogo, los añade al carrito..."
- **Regla de negocio** — "Los descuentos superiores al 15% requieren aprobación del supervisor..."
- **Integración** — "El sistema se conecta con SAP vía API REST para sincronizar el maestro de clientes..."
- **Configuración/Estado** — "Los pedidos tienen 5 estados: borrador, confirmado, en preparación, enviado, entregado..."

### 2. Redactar las entries

Para cada entry, sigue estas reglas de calidad:

- **200-1000 caracteres** por entry (óptimo para embeddings).
- **Cada entry se entiende sola.** Si necesita contexto previo, inclúyelo en la misma entry.
- **Tono profesional y técnico.** Reformula las explicaciones informales del usuario.
- **No inventar datos.** Si algo no se dijo, no lo añadas.
- **Específico > genérico.** "El login usa SSO de Azure AD con tokens de 8h" > "El sistema tiene autenticación."

### 3. Clasificar por contexto

Llama a `list_contexts` (servidor MCP `knowledge`) y clasifica cada entry
en el contexto más apropiado.

### 4. Presentar al usuario

Muestra las entries candidatas agrupadas por tema/contexto:

```
📋 Entries propuestas para el RAG:

**Contexto: [nombre del contexto]**
1. "El módulo de facturación permite..." (420 chars)
2. "Para generar una factura, el usuario..." (380 chars)
3. "Los descuentos superiores al 15%..." (290 chars)

¿Confirmas que las guarde? ¿Quieres modificar alguna?
```

### 5. Delegar en knowledge-add

Una vez el usuario confirme, lee `skills/knowledge-add/SKILL.md` y sigue su
flujo de 4 pasos (resolver contexto, analizar, confirmar, crear) con las
entries confirmadas.

## Reglas

- **No guardes nada sin confirmación** explícita del usuario.
- Si el usuario quiere modificar una entry, edítala y vuelve a presentar.
- Si alguna entry es muy larga (>1000 chars), propón dividirla.
- Si alguna entry es demasiado corta o vaga (<200 chars), propón enriquecerla.
- Al terminar, resume cuántas entries se crearon y en qué contextos.

## Criterio para finalizar

- Todas las entries confirmadas están guardadas en el RAG.
- El usuario ha recibido el resumen de lo guardado.
- Si el usuario tiene más fuentes que aportar, vuelve a la **Fase 1**.
