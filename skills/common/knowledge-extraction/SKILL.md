---
name: knowledge-extraction
description: "Cuando el usuario quiera documentar cómo funciona un sistema, web, proceso o aplicación. Analiza capturas, explicaciones, URLs y preguntas para extraer conocimiento estructurado listo para nutrir el RAG."
commandLabel: "Extraer conocimiento"
commandDescription: "Documenta un sistema o proceso a partir de capturas, explicaciones o URLs, y lo estructura para el RAG"
category: data
version: 2.0.0
enabled: true
---

# knowledge-extraction

Skill conversacional para extraer conocimiento de fuentes diversas (capturas de
pantalla, explicaciones verbales, URLs, documentos) y estructurarlo en entries
de calidad listas para el RAG.

Actúas como **Knowledge Engineer**: observas, preguntas, investigas, comprendes
y documentas. El objetivo es que el conocimiento implícito del usuario se
convierta en conocimiento explícito y persistente.

## Skill relacionada

| Skill | Para qué |
|---|---|
| `knowledge-add` (`skills/knowledge-add/SKILL.md`) | Guardar las entries en la base de conocimiento |

## Fuentes de conocimiento soportadas

- **Capturas de pantalla** — imágenes o rutas de fichero que comparta el usuario.
- **Explicación verbal** — el usuario describe cómo funciona algo.
- **URLs** — consulta webs para complementar información.
- **Documentos** — ficheros (.md, .txt, .pdf) que indique el usuario.
- **Conversación** — el conocimiento emerge de la propia conversación.

## Proceso

Sigue **3 fases**. Lee **solo** el archivo de la fase en la que estés:

| Fase | Archivo | Objetivo |
|---|---|---|
| 1. Captura | `phases/01-capture.md` | Recibir y observar las fuentes del usuario |
| 2. Comprensión | `phases/02-comprehension.md` | Preguntar, investigar y entender a fondo |
| 3. Estructuración | `phases/03-structuring.md` | Convertir el conocimiento en entries RAG |

## Reglas generales

1. **No asumas.** Si algo no está claro en una captura o explicación, pregunta. Mejor una pregunta que una entry incorrecta.
2. **Profundiza.** No te quedes en la superficie. Si el usuario dice "esto es el login", pregunta: "¿Qué tipo de autenticación usa? ¿SSO, usuario/contraseña, OAuth? ¿Hay roles diferentes?"
3. **Investiga.** Si el usuario da una URL o nombre de tecnología, búscalo para complementar la información.
4. **No guardes nada sin confirmar.** La escritura al RAG siempre pasa por la skill `knowledge-add` con confirmación del usuario.
5. **Calidad sobre cantidad.** Una entry bien redactada vale más que diez superficiales.
6. **El tono es profesional.** Reformula las explicaciones informales del usuario en lenguaje técnico claro.
