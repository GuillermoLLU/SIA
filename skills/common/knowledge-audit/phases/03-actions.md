# Fase 3 — Acciones

## Objetivo

Ejecutar las correcciones aprobadas por el usuario: eliminar entries
problemáticas, crear entries mejoradas, y reportar el resultado.

## Acciones disponibles (tools MCP `knowledge`)

### Eliminar entry

Llama a `delete_entry` con el `entry_id`.
Usar para: duplicados, entries obsoletas, info incorrecta que no se puede corregir.

### Reescribir entry

1. Eliminar la entry original (`delete_entry`).
2. Crear una nueva con el contenido corregido: `ingest_knowledge` con
   `context_id`, `content` y `source_type: "audit"` (distingue las entries
   generadas por auditoría).

### Fusionar entries duplicadas

1. Redactar una entry unificada que combine la información de ambas.
2. Eliminar las originales (`delete_entry` cada una).
3. Crear la entry fusionada (`ingest_knowledge`, `source_type: "audit"`).

### Dividir entry larga

1. Identificar los conceptos independientes dentro de la entry.
2. Eliminar la original.
3. Crear entries separadas (200-1000 chars cada una).

### Ampliar entry incompleta

1. Eliminar la original.
2. Crear una nueva con contexto adicional que la haga autocontenida.

## Flujo de ejecución

1. **Presenta las acciones propuestas** al usuario, agrupadas por tipo:
   ```
   📋 Acciones propuestas:

   Eliminar (3):
   - Entry #5 (duplicado de #22)
   - Entry #31 (módulo eliminado)
   - Entry #12 (info incorrecta, se reescribe)

   Reescribir (2):
   - Entry #12 → "El frontend utiliza React 18 con Vite..."
   - Entry #8 → "La autenticación usa JWT con tokens de acceso (1h) y refresh tokens (7d)..."

   Fusionar (1):
   - Entry #5 + #22 → "El despliegue se realiza con Docker Compose..."

   Dividir (1):
   - Entry #40 → 2 entries sobre login SSO y gestión de sesiones
   ```

2. **Pide confirmación** antes de ejecutar: "¿Confirmas todas las acciones o quieres modificar alguna?"

3. **Ejecuta** las acciones confirmadas, una por una.

4. **Reporta resultado:**
   ```
   ✅ Auditoría completada:
   - 3 entries eliminadas
   - 2 entries reescritas
   - 1 fusión (2 → 1)
   - 1 división (1 → 2)

   Resultado: 42 entries → 39 entries (calidad mejorada)
   ```

## Reglas

1. **Nunca ejecutes sin confirmación** explícita del usuario.
2. **Muestra el contenido nuevo** de las reescrituras/fusiones antes de crear.
3. **No inventes información** al ampliar o reescribir. Si no tienes datos suficientes, pide al usuario que los aporte.
4. **Registra las acciones** para trazabilidad: qué se eliminó, qué se creó, por qué.
