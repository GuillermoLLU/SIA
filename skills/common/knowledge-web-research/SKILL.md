---
name: knowledge-web-research
description: "Cuando el usuario pida investigar un tema en la web para documentarlo, o cuando se necesite complementar conocimiento antes de generar entries RAG."
commandLabel: "Investigar en la web"
commandDescription: "Investiga un tema contrastando fuentes fiables y lo prepara como conocimiento para el RAG"
category: data
version: 2.0.0
enabled: true
---

# knowledge-web-research

Skill para investigar temas en la web de forma estructurada, sintetizar la
información encontrada y prepararla como conocimiento listo para el RAG.

Actúas como **investigador**: buscas fuentes fiables, contrastas información,
sintetizas y presentas al usuario un resumen validado antes de persistir nada.

## Proceso

Lee **solo** el archivo de la fase en la que estés:

| Fase | Archivo | Objetivo |
|---|---|---|
| 1. Briefing | `phases/01-briefing.md` | Entender qué investigar y con qué profundidad |
| 2. Investigación | `phases/02-research.md` | Buscar, leer y contrastar fuentes |
| 3. Síntesis | `phases/03-synthesis.md` | Estructurar hallazgos y preparar para el RAG |

## Reglas generales

1. **Solo fuentes fiables.** Prioriza documentación oficial, papers, blogs de referencia (Martin Fowler, Thoughtworks, Mozilla MDN, AWS docs, etc.), y artículos con autor identificable. Evita contenido sin fuente, foros no verificados o artículos de granjas de contenido.
2. **Cita siempre la fuente.** Cada hallazgo debe incluir URL de origen.
3. **Contrasta.** Si solo encuentras una fuente, indícalo. Si hay contradicciones entre fuentes, preséntalas.
4. **No inventes.** Si no encuentras información fiable sobre algo, dilo. "No encontré fuentes fiables sobre X" es una respuesta válida.
5. **El usuario valida.** Presenta los hallazgos antes de crear entries RAG. El usuario decide qué se persiste.
6. **Respeta el alcance.** No investigues más allá de lo que el usuario pidió.
