/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "live" to read the running agent runtime; anything else uses the simulation. */
  readonly VITE_DATA_SOURCE?: string;
  /** Base URL of the agent's /state server, e.g. http://localhost:8787. */
  readonly VITE_AGENT_API?: string;
  /** Base for the pons price API. Defaults to the dev proxy path "/pons". */
  readonly VITE_PONS_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
