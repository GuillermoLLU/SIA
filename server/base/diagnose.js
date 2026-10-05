// ¿Tiene la base el esquema blindado al día? Lo dice sia_status().version: sin
// ella (o vieja) hay que ejecutar el SQL de SIA en la base, y hasta entonces
// no se usa.
export const SCHEMA_VERSION = 2; // la que escribe supabase-schema.sql (sia_status().version)
export const schemaOk = (status) => !!status && (Number(status.version) || 0) >= SCHEMA_VERSION;
