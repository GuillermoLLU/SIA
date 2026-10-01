---
name: jira-access
description: "Siempre que tengas que interactuar con Jira: buscar issues, leerlos, comentar, crear o transicionar."
commandLabel: "Jira"
commandDescription: "Buscar, leer, comentar, crear y transicionar issues de Jira"
category: data
version: 2.0.0
enabled: true
---

# jira-access

Skill para interactuar con Jira Server vía API REST.

## Configuración

Las credenciales llegan como **variables de entorno** de la sesión (cada
usuario configura las suyas en SIA: ⚙️ Configuración → Jira):

- `$JIRA_BASE_URL` — URL base de Jira (p. ej. `https://jira.miempresa.com/jira`)
- `$JIRA_API_TOKEN` — token personal del usuario

Comprueba al inicio que existen (`[ -n "$JIRA_BASE_URL" ] && [ -n "$JIRA_API_TOKEN" ]`).
Si faltan, **no improvises**: indica al usuario que las configure en
⚙️ Configuración → Jira y que abra un chat nuevo (se inyectan al crear la sesión).

## Operaciones disponibles

Todas las llamadas usan esta forma (referencia las variables tal cual, sin
expandirlas tú — así el token nunca aparece en la conversación):

```bash
curl -s -k -H "Authorization: Bearer $JIRA_API_TOKEN" -H "Content-Type: application/json" "$JIRA_BASE_URL/rest/api/2/..."
```

### Buscar issues (JQL)

```bash
curl -s -k -H "Authorization: Bearer $JIRA_API_TOKEN" -H "Content-Type: application/json" \
  "$JIRA_BASE_URL/rest/api/2/search?jql={JQL_ENCODED}&maxResults=20&fields=summary,status,assignee,priority,issuetype"
```

Ejemplo JQL: `project = PROJ AND status != Done ORDER BY updated DESC`

### Leer un issue

```bash
curl -s -k -H "Authorization: Bearer $JIRA_API_TOKEN" -H "Content-Type: application/json" \
  "$JIRA_BASE_URL/rest/api/2/issue/{ISSUE_KEY}"
```

### Leer comentarios de un issue

```bash
curl -s -k -H "Authorization: Bearer $JIRA_API_TOKEN" -H "Content-Type: application/json" \
  "$JIRA_BASE_URL/rest/api/2/issue/{ISSUE_KEY}/comment"
```

### Añadir comentario a un issue

```bash
curl -s -k -X POST -H "Authorization: Bearer $JIRA_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"body": "Texto del comentario"}' \
  "$JIRA_BASE_URL/rest/api/2/issue/{ISSUE_KEY}/comment"
```

### Listar proyectos

```bash
curl -s -k -H "Authorization: Bearer $JIRA_API_TOKEN" -H "Content-Type: application/json" \
  "$JIRA_BASE_URL/rest/api/2/project"
```

### Transicionar un issue (cambiar estado)

Primero obtén las transiciones disponibles:
```bash
curl -s -k -H "Authorization: Bearer $JIRA_API_TOKEN" -H "Content-Type: application/json" \
  "$JIRA_BASE_URL/rest/api/2/issue/{ISSUE_KEY}/transitions"
```

Luego aplica la transición:
```bash
curl -s -k -X POST -H "Authorization: Bearer $JIRA_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"transition": {"id": "{TRANSITION_ID}"}}' \
  "$JIRA_BASE_URL/rest/api/2/issue/{ISSUE_KEY}/transitions"
```

### Crear un issue

```bash
curl -s -k -X POST -H "Authorization: Bearer $JIRA_API_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "project": {"key": "{PROJECT_KEY}"},
      "summary": "Título del issue",
      "description": "Descripción",
      "issuetype": {"name": "Task"}
    }
  }' \
  "$JIRA_BASE_URL/rest/api/2/issue"
```

## Reglas

1. **Nunca muestres ni imprimas el token** (ni con `echo`, ni expandido en comandos). Referéncialo siempre como `$JIRA_API_TOKEN`.
2. Usa `curl -k` (SSL verify desactivado) para todas las llamadas.
3. Codifica el JQL con URL encoding cuando lo pases como query param.
4. Para acciones que **escriben** en Jira (crear issue, comentar, transicionar): muestra antes al usuario qué vas a hacer y pide confirmación.
5. Si una llamada falla con 401, informa al usuario de que su token puede haber expirado (se renueva en ⚙️ Configuración → Jira).
6. Si falla con 403, el usuario no tiene permisos para esa operación.
