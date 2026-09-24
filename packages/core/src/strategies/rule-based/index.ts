// Sub-barril interno (agregación, no la superficie pública del paquete —
// esa vive en src/index.ts con reexports nombrados). Reexporta TODO lo
// exportado por los módulos internos; src/index.ts elige explícitamente
// qué de esto llega a la superficie pública (solo ruleBasedDedupStrategy,
// classify y SimilarityBand — pesos, umbrales y funciones de señal
// individuales quedan internos, ver barrel.test.ts).
export * from './address.js';
export * from './classify.js';
export * from './signals.js';
export * from './strategy.js';
export * from './weights.js';
