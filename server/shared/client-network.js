// Lo que le falta al equipo para trabajar en la red del cliente, como un error que
// la web sabe explicar: 503 con code 'certs', 'vpn' o 'certs-vpn' y, si faltan los
// certificados, help: { url } con su guía. http.js (failed) lo manda tal cual y
// web/src/ui/net-warning.js dice qué falta y cómo resolverlo. Lo lanza todo lo que
// habla con la red del cliente: la S (auth/preflight.js), la base de la instancia
// (platform/client.js) y Snowflake (metrics/snowflake.js); lo que venga, igual.
// message: el texto para quien solo lea el error (logs, avisos breves).
export const clientNetworkError = (code, message, helpUrl = '') =>
  Object.assign(new Error(message), { status: 503, code, ...(code === 'vpn' ? {} : { help: { url: helpUrl } }) });
