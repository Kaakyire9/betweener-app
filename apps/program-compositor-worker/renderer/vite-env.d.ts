/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADAPTIVE_STAGE_V2_SHADOW_ENABLED?: 'true' | 'false';
  readonly VITE_ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED?: 'true' | 'false';
  readonly VITE_ADAPTIVE_STAGE_V2_COMPOSITOR_RENDER_ENABLED?: 'true' | 'false';
  readonly VITE_SOURCE_REVISION: string;
  readonly VITE_BUILD_IDENTIFIER: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
