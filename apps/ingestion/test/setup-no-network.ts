// Sonda de la API de Idealista (paso 1.5) — impide que el conjunto de tests
// abra una conexión de red real por accidente (REQ-NONET, D9). A diferencia
// de packages/db/test/setup-env.ts (que carga variables reales porque esa
// suite de integración necesita una base de datos real), esta suite nunca
// debe alcanzar nada: aquí no se carga ningún fichero .env, así que las
// credenciales no solo no se usan — están ausentes del proceso de test.
globalThis.fetch = (): never => {
  throw new Error(
    'La suite de tests no puede llamar a fetch: red deshabilitada por test/setup-no-network.ts (REQ-NONET).'
  );
};
