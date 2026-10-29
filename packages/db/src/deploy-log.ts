// ROADMAP 3.4 (decisión 257) — forma común de los eventos de registro del despliegue. Una línea
// estructurada por evento; solo tipos escalares y nunca secretos: quien emite un evento decide qué campos
// incluye, y ninguno de los pasos recibe una contraseña ni una URL de conexión en un campo de registro.
export type DeployLogLevel = 'info' | 'warn' | 'error';

export interface DeployLogEvent {
  readonly level: DeployLogLevel;
  readonly step: string;
  readonly msg: string;
  readonly [field: string]: string | number | boolean | null;
}

export type DeployLogger = (event: DeployLogEvent) => void;

export const silentLogger: DeployLogger = () => undefined;
