/**
 * Convierte una duración estilo `"15m"` / `"30d"` (el mismo formato que acepta `jsonwebtoken`
 * para `expiresIn`) a milisegundos. Se usa para calcular `expiresAt` del refresh token opaco,
 * que no es un JWT y por lo tanto no lleva `exp` propio.
 */
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDurationMs(input: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(
      `Duración inválida: "${input}" (esperado p. ej. "15m", "30d")`,
    );
  }
  return Number(match[1]) * UNIT_MS[match[2]];
}
