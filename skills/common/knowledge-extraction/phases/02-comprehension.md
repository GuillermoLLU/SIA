# Fase 2 — Comprensión

## Objetivo

Entender en profundidad el sistema, proceso o funcionalidad que el usuario está documentando. Preguntar todo lo necesario hasta que no queden dudas.

## Qué hacer

### 1. Preguntas por capas

Trabaja de lo general a lo específico. No saltes directamente al detalle.

**Capa 1 — Contexto general:**
- ¿Qué es este sistema/aplicación? ¿Para qué sirve?
- ¿Quiénes son los usuarios? ¿Hay roles distintos?
- ¿Es una web, una app, un servicio interno?

**Capa 2 — Funcionalidades:**
- ¿Qué puede hacer el usuario en esta pantalla/sección?
- ¿Cuál es el flujo principal? Paso a paso.
- ¿Hay flujos alternativos? ¿Qué pasa si falla algo?

**Capa 3 — Reglas de negocio:**
- ¿Hay validaciones? ¿Campos obligatorios?
- ¿Hay estados o transiciones? (ej: borrador → activo → cerrado)
- ¿Hay permisos? ¿Quién puede hacer qué?
- ¿Hay dependencias con otros módulos o sistemas?

**Capa 4 — Detalle técnico (si aplica):**
- ¿Qué tecnología usa? ¿APIs externas?
- ¿Hay integraciones? ¿Con qué sistemas?
- ¿Hay datos sensibles o requisitos de seguridad?

### 2. Complementa con investigación

- Si el usuario menciona una tecnología, búscala para entender mejor el contexto.
- Si hay una URL, consúltala para contrastar con lo que el usuario dice.
- Si hay documentación pública del sistema, revísala.

### 3. Itera hasta completar

- Después de cada ronda de preguntas, resume lo que has entendido y pide confirmación.
- Si el usuario envía más capturas, vuelve a Fase 1 para procesarlas y luego retoma aquí.
- No avances hasta que puedas explicar el sistema sin ayuda del usuario.

## Señales de que estás listo

- Puedes describir el flujo principal completo sin dudas.
- Conoces los casos de error y flujos alternativos.
- Sabes qué roles/permisos existen.
- No hay "cajas negras" — entiendes cada parte del sistema.

## Criterio para avanzar

- Has hecho al menos 2 rondas de preguntas.
- El usuario confirma que tu comprensión es correcta.
- No quedan preguntas pendientes.

Cuando la comprensión esté completa, pasa a la **Fase 3 — Estructuración**.
