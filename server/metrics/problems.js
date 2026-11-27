// Problemas comunes (dominio puro): un catálogo de problemas con nombre propio que se repiten, sacado de las notas de
// apertura (lo que dice el centro: NOTES, sin la línea de plantilla de SIGLO) y del problema del título. Cada incidencia,
// en uno solo: el primero del catálogo que encaja, de lo más concreto a lo más general (0, sin clasificar). Las reglas,
// en español, inglés, portugués e italiano, sobre el texto sin tildes ni mayúsculas (text.js, norm). Es una
// aproximación por palabras clave, afinada con lo que entra (el análisis por módulo de noviembre de 2026).
import { norm } from './text.js';

// [nombre, regla]; el orden manda. El 0 es «Sin clasificar».
export const PROBLEMS = [
  ['Sin clasificar', null],
  // concretos y muy repetidos
  ['Alta de transporte o transportista', /alta trans|alta (de )?(un )?(nuevo )?transport|nuevo transportista|new (carrier|transport)|add (a )?(new )?carrier|alta de ruta/],
  ['Alta de tienda o código de tienda', /\[tienda.?cd\]|alta (del |de la |de )?(siguiente )?(codigo de )?tienda|codigo de tienda|new store code|store code/],
  ['Pedidos sin ruta o mal enrutados', /sin ruta|no route|without (a )?route|tec_?app|ruta (no asignada|incorrecta)|wrong route|mal enrutad|misrout|re.?route|shipping services? to/],
  ['Puesto de paletizado (limpiar o liberar)', /puestos? (de )?paletiz|palleti[sz]ing (station|position|post)|paletizad|palletizer|limpi[ae][rn]? (el |la |los |la info del )?(pale|palet|pallet)|clean (the )?pallet/],
  ['Crear o modificar posiciones', /\[pos\]|crear (las |unas |nuevas )?posicion|(alta|baja|modificar|cambiar|bloquear|desbloquear) (de )?(las |unas )?posicion|create (new )?(storage )?positions?|new positions?|cambio (de )?posicion|change [^.]{0,40}positions?|posicoes|posizion/],
  ['Imagen o SKU incorrecto en la PDA', /imagen (incorrecta|erronea|equivocada)|(wrong|incorrect) (picture|image|photo)|picture (pda|wrong|is (incorrect|wrong))|foto (incorrecta|erronea)|imagem (errada|incorreta)|imagen (del )?sku|sku imagen|imagen sku/],
  ['Run Buffer, Matrix o líneas del RBS', /run ?buffer|\brb\b|matrix|\bstep \d|lineas? (de )?(evacuacion|rb\b)|pactrolley|deficit/],
  ['Expedición en «chequeando» o sin cerrar', /chequeando|checking (status|state)|estado checking|(cerrar|close|cierre de) (la )?(expedicion|expedition|shipment)|expedicion(es)? (abierta|bloquead|sin cerrar|atascad)|expedition #* ?(is )?stuck|waiting for picking/],
  ['Hot stamping, gift cards y personalización', /hot.?stamp|gift ?card|tarjeta regalo|personaliza|bordado|embroider/],
  ['Borrar o liberar contenedores', /(borrar|eliminar|liberar|vaciar|delete|remove|release|empty) (el |los |un |unos )?(contenedor|container|bulto|caja)/],
  ['Contenedores o bultos a rechazo o recirculando', /a rechazo|al rechazo|to (the )?reject|rechazad|rejected|mesa de rechazo|rejeitad|scarti|recircul/],
  ['Cancelar o anular pedidos', /(cancelar|anular|cancel|cancelling|canceling|cancelamento|annullare) (el |los |un |unos |the |this |these |los siguientes |estos )?(pedido|order|encomenda|ordine)|cancelacion (de )?pedido|order cancel|cancel them|cancel the following|please cancel|cancel(es|eis|en) (los |las |estos |tres |dos )?(codigos|pedidos|envios)/],
  ['Pedidos atascados, pausados o sin avanzar', /pedidos? (pausad|bloquead|parad|atascad|retenid|en estado|sin (stock|avanzar|salir)|pendientes? (de )?stock|que no (podemos|pasan|avanzan))|no pasan de e?s?tado|orders? (are |is )?(stuck|blocked|paused|on hold|not (progress|moving))|stuck (in|on) (the )?(status|stock)|stock pending|(stuck in|status) cancel|estado cancelad|pedidos? cancelados?|no (estan )?dados? de alta|pedido custom|reprocesar|reprocess|preselecc|fme atrasad|not able to pack|no podemos (preparar|empaquetar)|multi.?bulto|cuadrantes?/],
  ['Etiqueta de transporte', /etiquetas? (de )?(transporte|envio|expedicion)|(shipping|transport|carrier) labels?|etiqueta (duplicad|backup|en blanco|invertida)|\[tec\][^.]{0,40}etiquet|relabel|sin etiqueta/],
  ['Etiquetas de precio', /price (label|tag)|etiquetas? (de )?precios?|tamano (de )?precio|precios? (incorrect|erroneo)/],
  ['Impresoras e impresión', /impresora|impresion|imprim|reimpres|printer|printing|\bprint\b|zebra|nicelabel|\bzpl\b|stampant|impressora/],
  ['Mesas y puestos de packing', /mesas? (de )?(packing|incidencia|empaquet)|packing stations?|puestos? (de )?packing|configuracion (de )?(las )?mesas|ensobrad|muros? (ptl|de ptl)|\bptl\b/],
  ['Online Returns y devoluciones', /online returns?|devoluc|refund|reembols|rembols|\breturns? (app|gui|station)|repairs? app|\brepairs?\b/],
  ['OT y órdenes de trabajo', /\bots?\b|orden(es)? de trabajo|work ?orders?|\bwos\b|\bwra\b|tareas? (de )?(reposicion|wra)/],
  ['Oleadas, picking transfer y repartos', /oleadas?|\bwaves?\b|olear|\bolas?\b|picking transfer|reparto|acumul|goods in buffer/],
  ['Discrepancias de stock o de estados', /discrepancia|descuadre|no (se )?actualiza|no actualizad|not (being )?updat|variacion (del )?[^.]{0,20}stock|auditoria (de )?stock|umbral (de )?diferencias|stockout|items? perdidos|missing (units|items)|faltantes|unidades faltan|stock (incorrect|erroneo|libre|fantasma)|informe de stock|(wrong|incorrect) stock|stock discrepan|estados? (incorrect|de pedido)|desincron|sincroniz/],
  ['Recepción, entradas y POs', /recepcion|recepciona|inbound|\basn\b|purchase orders?|\bpos? (de|del|sin|no)\b|(cancel(ar|ado|acion de)?|cerrar|transit) (los )?pos\b|\bpos (en|in) |ordenes? de po\b|(siguientes|los|el|cancelar) pos?\b|\bpo\b|descarga|unloading|\brcp\b|decantad/],
  ['RFID y túneles', /rfid|tunel|hipertunel|tunnel|\bfrr\b|\brfidlai\b/],
  ['PDA, terminales y dispositivos', /\bpdas?\b|\bhht\b|terminal(es)? (de mano|portatil)|scanner|escaner|lector|dispositivos?|devices?|tablet|\bapk\b/],
  ['Automatismo parado (PLC, grúa, shuttle, MSR)', /startet nicht|bewegt sich nicht|non si avvia|\bplcs?\b|\bgruas?\b|elevador|shuttle|transelevador|lanzadera|\bmsr\b|\bagvs?\b|sorter (parad|no arranca|won.?t start|isn.?t moving)|no (realiza|hace)n? movimiento|atasc|parad[oa]s?\b|no arranca|won.?t start|bloquead/],
  ['Comunicaciones y red', /\bswitch\b|unreachable|inalcanzable|incomunicad|replica|replication|\bred\b|wifi|\bvpn\b|desconex|disconnect|conexion|connect(ion|ivity)|\bcomms?\b|\back\b|as400|interfaz|interface/],
  ['Sorter y clasificadores', /sorter|sortierer|selezionatore|clasificador|sorting|desvian|divert|\bdrm\d?\b|dynamic/],
  ['Permisos, usuarios y accesos', /permiso|accesos?\b|access\b|\[usu\]|alta (de )?usuari|baja (de )?usuari|\blogins?\b|password|contrasena|usuarios? bloquead|new users?|crear usuari|\brol(es)?\b|perfil/],
  ['Configuración y parámetros', /configura|parametr|tabla de reparto|activar|desactivar|setting|config\b|x.?dock|umbral|capacidad (maxima)?|capacity/],
  ['Informes, consultas y logs', /control tower|productividad|productivity|informe|report|\blogs?\b|exportar|export\b|consulta|query|descargar/],
  ['Bultos, cajas y palés', /\bbultos?\b|\bbulks?\b|\bcajas?\b|\bpal(e|et|let)s?\b|\bboxe?s?\b|contenedor|container|ubicar|leftover/],
  ['Lentitud, caídas y errores generales',/lentitud|lent[oa]s?\b|caid[oa]|cae\b|no funciona|no carga|no abre|no responde|slow|\bdown\b|not working|doesn.?t work|crash|congelad|frozen|error (interno|general|global)|masiva/],
];
export const PROBLEM_NAMES = PROBLEMS.map(([name]) => name);

// la primera línea de la plantilla de SIGLO («Contact Phone: …», «Teléfono Contacto: …»…)
const TEMPLATE = /^\s*(contact phone|tel[eé]fono( de)? contacto|telefone( de)? contato|telefono di contatto)\s*:.*$/im;
// el problema del título (lo que va tras « - »; si no hay, el título entero) y la descripción → el código del problema
export const commonProblem = (summary, notes) => {
  const s = String(summary || ''), p = s.indexOf(' - ');
  const text = norm(`${p >= 0 ? s.slice(p + 3) : s} ${String(notes || '').replace(TEMPLATE, ' ')}`).replace(/https?:\/\/\S+|\S+@\S+/g, ' ');
  const k = PROBLEMS.findIndex(([, re], j) => j > 0 && re.test(text));
  return k < 0 ? 0 : k;
};
