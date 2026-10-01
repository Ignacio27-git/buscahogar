// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105, U2) — evidencia
// estructural de cómo responde la API a un anuncio DADO DE BAJA.
//
// La documentación de Idealista no dice qué devuelve `adIds` para un anuncio
// retirado. Hasta que la sonda operada a mano (scripts/probe-idealista-adids.ts)
// grabe la fixture `test/fixtures/idealista/adids-<fecha>.meta.json` y demuestre
// `delistedIdBehaviour: 'omitted'`, la omisión de un id en una respuesta fiable
// es AMBIGUA y ningún anuncio se retira (fail-safe).
//
// La constante es un literal commiteado, NO una variable de entorno ni un flag:
// activarla exige un cambio revisable en el diff junto a la fixture que lo
// justifica, y `test/idealista-presence-evidence.test.ts` ata ambas cosas (la
// constante es true exactamente cuando la fixture más reciente dice 'omitted').
// Procedimiento tras ejecutar la sonda: revisar la fixture y, solo si la meta
// dice 'omitted', cambiar el literal a `true` en el mismo commit.
import { z } from 'zod';

// Anotada como `boolean` (no el literal `false`) a propósito: el tipo no debe
// estrecharse al valor commiteado, o cada consumidor quedaría como código muerto
// para el compilador hasta el día que cambie el literal.
//
// Activada el 2026-09-30 con la fixture `adids-2026-09-30.meta.json`: el anuncio
// retirado 111037729 (ausente de un barrido completo del círculo) desaparece de
// una respuesta que sí devuelve el vivo 111715742 pedido en la misma lista.
export const DELISTED_OMISSION_CONFIRMED: boolean = true;

const probeMetaSchema = z.looseObject({ delistedIdBehaviour: z.string() });

// Interpreta la meta de la fixture de la sonda: true solo con 'omitted'. Una
// meta ausente o malformada nunca confirma nada.
export function omissionConfirmedByFixtureMeta(meta: unknown): boolean {
  const parsed = probeMetaSchema.safeParse(meta);
  return parsed.success && parsed.data.delistedIdBehaviour === 'omitted';
}
