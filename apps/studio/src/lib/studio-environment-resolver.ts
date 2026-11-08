export type StudioEnvironmentName = 'staging' | 'production';

type StudioEnvironmentInput = {
  environment: unknown;
  supabaseUrl: unknown;
  supabasePublicKey: unknown;
  publicAppOrigin: unknown;
  studioOrigin: unknown;
};

export type StudioEnvironment = {
  environment: StudioEnvironmentName;
  supabaseUrl: string;
  supabaseAnonKey: string;
  publicAppOrigin: string;
  studioOrigin: string;
};

const EXPECTED = {
  staging: {
    supabaseHost: 'xsgzxadwuxuziubglvps.supabase.co',
    publicAppOrigin: 'https://staging.getbetweener.com',
  },
  production: {
    supabaseHost: 'jbyblhithbqwojhwlenv.supabase.co',
    publicAppOrigin: 'https://getbetweener.com',
  },
} as const;

const required = (name: string, value: unknown): string => {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`Missing ${name}.`);
  return normalized;
};

const parseHttpsOrigin = (name: string, value: unknown): string => {
  const normalized = required(name, value).replace(/\/+$/u, '');
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid HTTPS origin.`);
  }
  if (url.protocol !== 'https:' || url.origin !== normalized) {
    throw new Error(`${name} must be a valid HTTPS origin.`);
  }
  return url.origin;
};

export const resolveStudioEnvironment = (
  input: StudioEnvironmentInput,
): StudioEnvironment => {
  const environment = required('VITE_APP_ENVIRONMENT', input.environment).toLowerCase();
  if (environment !== 'staging' && environment !== 'production') {
    throw new Error(`Unsupported Studio environment: ${environment}.`);
  }

  const supabaseUrl = parseHttpsOrigin('VITE_SUPABASE_URL', input.supabaseUrl);
  const supabasePublicKey = required('VITE_SUPABASE_ANON_KEY', input.supabasePublicKey);
  const publicAppOrigin = parseHttpsOrigin('VITE_PUBLIC_APP_ORIGIN', input.publicAppOrigin);
  const studioOrigin = parseHttpsOrigin('VITE_STUDIO_ORIGIN', input.studioOrigin);
  const expected = EXPECTED[environment];

  if (new URL(supabaseUrl).hostname !== expected.supabaseHost) {
    throw new Error(`Studio Supabase URL does not match the ${environment} project.`);
  }
  if (publicAppOrigin !== expected.publicAppOrigin) {
    throw new Error(`Studio public app origin does not match ${environment}.`);
  }
  if (environment === 'staging' && new URL(studioOrigin).hostname === 'getbetweener.com') {
    throw new Error('Staging Studio cannot use the production origin.');
  }
  if (environment === 'production' && new URL(studioOrigin).hostname.endsWith('staging.getbetweener.com')) {
    throw new Error('Production Studio cannot use the staging origin.');
  }

  return {
    environment,
    supabaseUrl,
    supabaseAnonKey: supabasePublicKey,
    publicAppOrigin,
    studioOrigin,
  };
};
