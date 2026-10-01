// ROADMAP 3.1 (decisión 120) — `?q=` es texto libre del usuario: recortado,
// no vacío y acotado en longitud para que una cadena sin límite nunca llegue
// al intérprete. Mismo idioma que `zoneQuerySchema`: valida la forma, no
// interpreta.
import { z } from 'zod';

export const nlQuerySchema = z.string().trim().min(1).max(200);
