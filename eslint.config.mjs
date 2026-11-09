import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactPkg from "react/package.json" with { type: "json" };

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // eslint-config-next deja `react.version: "detect"`, pero la detección de
  // eslint-plugin-react@7.37 usa `context.getFilename()`, que ESLint 10 removió:
  // con "detect" el lint entero explota antes de mirar un solo archivo
  // (`TypeError: contextOrFilename.getFilename is not a function`).
  // Pasar la versión explícita saltea ese camino. La leemos del propio React
  // para que no quede desincronizada al subir la dependencia.
  { settings: { react: { version: reactPkg.version } } },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
