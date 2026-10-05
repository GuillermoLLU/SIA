// Identificadores que llegan en las rutas (dominio, sin E/S).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (x) => UUID.test(String(x ?? ''));
