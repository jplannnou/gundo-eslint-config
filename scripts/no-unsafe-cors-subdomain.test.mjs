import { RuleTester } from "eslint";
import rule from "../rules/no-unsafe-cors-subdomain.js";

// RuleTester lanza si algún caso no cumple. Se corre desde scripts/smoke.mjs.
const tester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
});

tester.run("no-unsafe-cors-subdomain", rule, {
  valid: [
    // El fix: receptor host-normalizado.
    "const ok = originHost.endsWith(`.${allowedHost}`)",
    "originHost.includes(`.${allowed}`)",
    "host.endsWith(`.${x}`)",
    // Template sin punto inicial → no es el patrón de subdominio.
    "origin.endsWith(`${allowed}`)",
    "origin.endsWith(`https://${allowed}`)",
    // No es endsWith/includes/startsWith.
    "origin.replace(`.${allowed}`, '')",
    // Sin interpolación.
    "origin.endsWith('.gundo.life')",
  ],
  invalid: [
    // El bug: origin crudo (con protocolo) contra `.${host}`.
    {
      code: "const bad = origin.endsWith(`.${allowed}`)",
      errors: [{ messageId: "unsafe" }],
    },
    {
      code: "origin.includes(`.${allowedOrigin}`)",
      errors: [{ messageId: "unsafe" }],
    },
    {
      code: "req.headers.origin.endsWith(`.${base}`)",
      errors: [{ messageId: "unsafe" }],
    },
  ],
});

console.log("✓ no-unsafe-cors-subdomain: todos los casos pasan");
