import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desde next 16.4, `next dev` corriendo bajo un agente agrega un bloque propio a
  // AGENTS.md. Las convenciones del repo ya viven ahí.
  agentRules: false,
  reactCompiler: true,
  output: "standalone",
  images: {
    // Las tapas se piden directo a la API que las sirve (TMDB): la app no guarda imágenes, ni
    // siquiera en la caché del optimizador de Next, que las escribiría en el disco del contenedor.
    unoptimized: true,
  },

  outputFileTracingIncludes: {
    "**/*": [
      // Las migraciones corren al arrancar el server (src/instrumentation.ts), así que los .sql
      // tienen que viajar en el bundle standalone. El tracer no los ve porque no se importan.
      "./drizzle/**/*",
      // `@swc/helpers` >= 0.5.16 usa la condición `module-sync` y el tracer sólo copia
      // `cjs/*.cjs`: el standalone moría con MODULE_NOT_FOUND. Igual que en mywallet.
      "node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/package.json",
      "node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/cjs/**",
      "node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**",
    ],
  },

  // Next arrastra `typescript` (~19 MB) al bundle standalone. En runtime nunca se usa.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/typescript/**",
      "node_modules/.pnpm/typescript@*/**",
      "node_modules/@types/**",
      "node_modules/.pnpm/@types+*/**",
    ],
  },
};

export default nextConfig;
