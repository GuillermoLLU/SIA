// Enlaces rápidos por proyecto (dominio, sin E/S): accesos compartidos con el
// equipo, acotados a los proyectos que dan los tokens de cada persona.

// La imagen viaja como data URI para que viva en la base y no dependa de un
// servidor ajeno. La UI reescala a 256 px antes de enviar, así que una imagen
// normal llega en decenas de KB; el tope es una red por si alguien llama a la
// API a mano, para que una imagen suelta no lastre el listado (devuelve las
// imágenes incrustadas).
const IMAGE_CAP = 3_000_000; // ~2,2 MB de imagen real una vez en base64
const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/;

// → { value } | { error }
export const linkFields = ({ title, url, image, notes }) => {
  const t = String(title ?? '').trim();
  const u = String(url ?? '').trim();
  if (!t) return { error: 'el título no puede estar vacío' };
  if (t.length > 120) return { error: 'el título no puede pasar de 120 caracteres' };
  if (!/^https?:\/\/./i.test(u)) return { error: 'la URL tiene que empezar por http:// o https://' };
  const img = image ? String(image) : null;
  if (img && !DATA_IMAGE.test(img)) return { error: 'la imagen no es válida' };
  if (img && img.length > IMAGE_CAP) return { error: 'la imagen pesa demasiado (máx. ~2 MB)' };
  return { value: { title: t, url: u, image: img, notes: notes ? String(notes) : null } };
};

// Un PUT parcial no debe borrar las notas ni la imagen de un enlace que ya
// existía: lo que no venga en el cuerpo se conserva.
export const mergeLink = (current, body) => {
  const merged = { title: current.title, url: current.url, image: current.image, notes: current.notes };
  for (const k of Object.keys(merged)) if (body[k] !== undefined) merged[k] = body[k];
  return merged;
};
