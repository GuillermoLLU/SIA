// Temas de una issue: palabras clave buscadas en el título (sin tildes y en
// minúsculas). Es una aproximación para ver bultos, no para contar al
// detalle. Una issue puede caer en varios; el aviso automático de ruta y
// etiqueta (el primero) no cuenta en ningún otro.

export const THEMES = [
  ['Ruta / etiqueta de pedidos (aviso automático TEC)', /incidencia ruta y\/o etiqueta/],
  ['Etiquetas e impresión', /etiquet|label|nicelabel|impres|print|hot ?stamp|zpl/],
  ['Permisos, usuarios y accesos', /permiso|usuario|\[usu\]|\buser|login|acceso|access|password|contrasena|citrix|\balta usu|credencial/],
  ['Rechazos y recirculación', /rechazo|rechazad|recircul|reject/],
  ['Automatismo parado o bloqueado', /no realizan? movimiento|no hacen? movimiento|\bsina\b|\bplc\b|\bgrua|elevador|pasillo|shuttle|transelevador|bloquead|blocked|no arranca|won't start|parad[oa]|atasc|\bmsr\b|lanzadera/],
  ['Estados de pedido y discrepancias', /discrepancia|estados? (de )?pedido|cambian? de estado|sincro|desincron|descuadre/],
  ['Cancelar / anular / retroceder', /cancel|anular|anulad|retroceder/],
  ['OT y cierres', /\bots?\b|cerrar|cierre|\bwos\b|work ?order/],
  ['Contenedores, bultos y puestos', /contenedor|bulto|puesto|paletizad|\bpalets?\b|pallet|\bcajas?\b|container/],
  ['SKU, maestros e imágenes', /\bsku|maestro|imagen|referencia|articulo/],
  ['Stock e inventario', /stock|inventario|sobreventa|unidades/],
  ['RFID', /rfid|\bfrr\b/],
  ['Caídas, lentitud y errores generales', /lentitud|lent[oa]\b|caida|caid[oa]\b|no funciona|no carga|no abre|performance|slow|error interno|masiva|no responde|down\b/],
  ['Comunicaciones y red', /comms?\]|teleco|puertos|\bvpn\b|\bred\b|wifi|enlace|conexion|connect|firewall/],
  ['Configuración', /configura|tabla de reparto|activar|parametr/],
  ['PDA y dispositivos', /\bpdas?\b|\bhht\b|dispositivo|device|hwreq|tablet|escaner|scanner/],
  ['Posiciones de almacén', /\[pos\]|posicion|ubicacion|localizacion|location/],
  ['Transporte y expedición', /transporte|transportista|expedi|eship|shipping|\btrans\]|mensajeria|carrier|\brutas?\b/],
  ['Entradas y recepción', /recepcion|entrada|inbound|\bpos?\b(?! ?\])|recibid|descarga/],
  ['Packing y empaquetado', /packing|empaquet|\bmesas?\b|\bptl\b/],
  ['Picking, sorting y reparto', /picking|sorting|sorter|reparto|olear|oleada|waves?\b|clasificad/],
  ['Base de datos', /\bdb2\b|\bbd\b|bbdd|base de datos|database/],
  ['Tienda (sorter, probadores, tienda-CD)', /probadores|tienda|store|garment sorter|sorter prendas|selezionatore|kleidersortierer/],
  ['Pedidos (pausados, custom, reprocesar)', /pedido|\border/],
  ['Devoluciones', /devoluc|return/],
  ['Despliegues, versiones y migraciones', /desplieg|version|migra|update|actualiz|instala|launcher/],
];

export const THEME_NAMES = THEMES.map(([name]) => name);

// Título ya normalizado → máscara de bits, un bit por tema (bit i = THEMES[i]).
export const themesOf = (title) => {
  if (THEMES[0][1].test(title)) return 1;
  let mask = 0;
  THEMES.forEach(([, rx], i) => { if (rx.test(title)) mask |= 1 << i; });
  return mask;
};
