import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4400),
  HOST: z.string().default('0.0.0.0'),
  APP_BASE_URL: z.string().url().default('http://localhost:4400'),
  DATABASE_URL: z.string().default(''),
  DEMO_MODE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Procore OAuth 2.0 (Authorization Code). Create the app in the
  // Procore Developer Portal — see docs/procore-setup.md.
  PROCORE_CLIENT_ID: z.string().default(''),
  PROCORE_CLIENT_SECRET: z.string().default(''),
  PROCORE_BASE_URL: z.string().url().default('https://api.procore.com'),
  PROCORE_LOGIN_URL: z.string().url().default('https://login.procore.com'),
  // Web app host (distinct from the API host above) — used only to build
  // "open in Procore" hyperlinks for the reporting dashboard.
  PROCORE_WEB_URL: z.string().url().default('https://app.procore.com'),
  PROCORE_COMPANY_ID: z.coerce.number().optional(),

  // Shared secret OpenLot expects in the X-OpenLot-Webhook-Secret header
  // of inbound webhook deliveries (configured on the Procore hook).
  WEBHOOK_SHARED_SECRET: z.string().default(''),

  // 32-byte key (64 hex chars) for AES-256-GCM encryption of stored
  // OAuth tokens. Generate with: openssl rand -hex 32
  TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, '64 hex characters required').optional()
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const cfg = parsed.data;
  if (!cfg.DEMO_MODE && cfg.NODE_ENV !== 'test') {
    if (!cfg.DATABASE_URL) throw new Error('DATABASE_URL is required unless DEMO_MODE=true');
    if (!cfg.TOKEN_ENCRYPTION_KEY) throw new Error('TOKEN_ENCRYPTION_KEY is required unless DEMO_MODE=true');
  }
  return cfg;
}
