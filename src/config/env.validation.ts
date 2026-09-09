import { z } from 'zod';

/** `"true"`/`"false"` explícito — cualquier otra cosa (typo incluido) es error de arranque. */
const envBool = (def: boolean) =>
  z
    .enum(['true', 'false'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
    CORS_ORIGINS: z.string().default('http://localhost:5000'),

    // --- Pago Stripe test (plan E2E §6.5 / hito M5) ---
    // Con `PAYMENTS_ENABLED=false` (ventana M2→M4) `POST /orders` no crea PaymentIntent y vacía el
    // carrito al crear el pedido. `true` desde M5: se crea el PaymentIntent y el carrito se vacía
    // recién en la transición a `paid`.
    PAYMENTS_ENABLED: envBool(false),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_CURRENCY: z.string().default('usd'),
    // Fallback de demo: habilita `POST /orders/:id/confirm` para marcar `paid` sin webhook real.
    STRIPE_DEMO_CONFIRM: envBool(false),
    // Minutos que un pedido puede quedar en `pending_payment` antes de que el barrido lo cancele.
    ORDER_PAYMENT_TTL_MIN: z.coerce.number().int().positive().default(30),
  })
  .superRefine((cfg, ctx) => {
    if (!cfg.PAYMENTS_ENABLED) return;
    for (const key of [
      'STRIPE_SECRET_KEY',
      'STRIPE_PUBLISHABLE_KEY',
      'STRIPE_WEBHOOK_SECRET',
    ] as const) {
      if (!cfg[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} es obligatorio cuando PAYMENTS_ENABLED=true`,
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${formatted}`);
  }

  return result.data;
}
