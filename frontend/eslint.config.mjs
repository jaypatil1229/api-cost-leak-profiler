import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // react-hook-form is not analyzable by the React Compiler. The rule only reports that the
      // component is skipped for compilation, which is expected for every form in this app.
      "react-hooks/incompatible-library": "off",
    },
  },
  globalIgnores([".next/**", ".npm-cache/**", "out/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);
