// Los estados y motivos de Remedy que miden las Métricas (dominio, sin E/S), con sus códigos. Es la única lista:
// el bridge la usa al medir cada issue y la manda a la web con los datos (dataset.js, `reasons`), para que la
// situación de lo pendiente y el tiempo en cada estado digan lo mismo.
export const OPEN_STATES = ['ASSIGNED', 'IN_PROGRESS', 'PENDING'];
export const DONE_STATES = ['RESOLVED', 'CLOSED'];
export const CANCELLED = 'CANCELLED';
// Motivos de «Pendiente»: esperando al centro o al cliente, o a un tercero; lo demás, otro motivo.
export const PENDING = {
  client: ['CLIENT_ACTION_REQUIRED', 'CLIENT_HOLD', 'CUSTOMER_FOLLOW_UP_REQUIRED', 'LOCAL_SITE_ACTION_REQUIRED', 'REQUEST_INFORMATION'],
  vendor: ['THIRD_PARTY_VENDOR_ACTION_REQD', 'SUPPLIER_DELIVERY', 'PURCHASE_ORDER_APPROVAL', 'ESCALATED_ACCORDING_TO_PROCEDURE', 'REQUEST_SSGG', 'INFRASTRUCTURE_CHANGE'],
};
