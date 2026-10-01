---
name: knowledge-search
description: "Buscar bajo demanda en la base de conocimiento del equipo (RAG vectorial) y responder con fuentes."
commandLabel: "Buscar en conocimiento"
commandDescription: "Busca en el RAG del equipo lo que indiques y responde citando los contextos"
category: data
version: 1.0.0
enabled: true
---

# knowledge-search

Búsqueda puntual en la base de conocimiento compartida, usando la tool
`search_knowledge` del servidor MCP `knowledge`.

## Proceso

1. **Resolver qué buscar.** Si el usuario indicó el tema al invocar la skill,
   úsalo. Si no, mira si el último tramo de la conversación lo deja claro; en
   caso de duda, pregunta: «¿Qué quieres que busque en el conocimiento?»
2. **Buscar.** Llama a `search_knowledge` con una query clara y específica
   (reformula la pregunta del usuario a lenguaje de búsqueda; usa `top_k` 8).
   Si el tema tiene varias aristas, haz 2-3 búsquedas con queries distintas.
3. **Responder con fuentes.** Sintetiza lo encontrado y cita de qué contexto
   sale cada cosa (p. ej. «según *Control de Calidad*…»). Indica la similitud
   solo si el usuario lo pide.
4. **Si no hay resultados** (o son flojos, similitud < 0.75): dilo claramente
   — «no hay nada en la base sobre esto» — y, si puedes aportar conocimiento
   general, ofrécelo marcando que NO viene de la base del equipo.

## Reglas

- No inventes contenido de la base: lo que no aparezca en los resultados, no está.
- No mezcles sin avisar tu conocimiento general con el recuperado.
- Ofrece profundizar: «¿busco algo más sobre esto?»
