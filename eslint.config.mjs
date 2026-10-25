import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
  {
    // PROTECTED BOUNDARY: layout/UI files may only import TYPES from the engine, never its functions or constants.
    // Every number the UI shows must come from the engine through the API. See AGENTS.project.md.
    files: ["src/app/(site)/**", "src/app/admin/**", "src/app/layout.tsx", "src/app/robots.ts", "src/components/**", "src/content/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/engine", "@/engine/*", "@/server/*", "!@/server/auth", "!@/server/views"],
              allowTypeImports: true,
              message:
                "UI files must not import engine or server code (only `import type`). Display values the engine returns; never calculate them. See AGENTS.project.md.",
            },
          ],
        },
      ],
    },
  },
]);
