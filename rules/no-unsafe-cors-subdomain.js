// Regla del fleet: caza el bug de CORS por subdominio que ya arreglamos en
// fitness/user-engine/payments (#15/#29/#32). El anti-patrón: comparar un host
// con PUNTO INICIAL (`.${host}`) contra un `origin` que trae protocolo, sin
// normalizar. `.gundo.life` nunca matchea `https://sub.gundo.life` → o el CORS
// no deja pasar ningún subdominio, o (peor, según cómo esté armado) deja pasar
// de más. El fix normaliza ambos lados a `new URL(v).host` primero.
//
// Heurística de bajo ruido: flaggea `X.endsWith(`.${...}`)` (o includes/
// startsWith) cuando el RECEPTOR no parece host-normalizado (su nombre no
// contiene "host"). Así el bug (`origin.endsWith(...)`) se marca y el fix
// (`originHost.endsWith(...)`) pasa. Si hay un caso legítimo, renombra el
// receptor con "host" o desactiva la regla con la razón.

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prohíbe el match de subdominio CORS con host de punto inicial sin normalizar el origin a host.",
      recommended: true,
    },
    schema: [],
    messages: {
      unsafe:
        "Match de subdominio inseguro: normaliza AMBOS lados a host (new URL(v).host) antes de comparar. Un host con punto inicial (`.${host}`) contra un origin completo (con protocolo) nunca matchea. Ver cors.util.ts. Si el receptor ya es un host normalizado, nómbralo con 'host' o desactiva la regla con la razón.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        const prop = callee.property;
        if (prop.type !== "Identifier") return;
        if (!["endsWith", "includes", "startsWith"].includes(prop.name)) return;

        // Receptor host-normalizado (nombre contiene "host") → seguro, no flaggear.
        const obj = callee.object;
        if (obj.type === "Identifier" && /host/i.test(obj.name)) return;
        if (
          obj.type === "MemberExpression" &&
          obj.property.type === "Identifier" &&
          /host/i.test(obj.property.name)
        )
          return;

        // Argumento = template literal con punto inicial e interpolación: `.${x}`.
        const arg = node.arguments[0];
        if (!arg || arg.type !== "TemplateLiteral") return;
        if (arg.expressions.length < 1) return;
        const first = arg.quasis[0];
        const cooked = first && first.value && first.value.cooked;
        if (typeof cooked !== "string" || !cooked.startsWith(".")) return;

        context.report({ node, messageId: "unsafe" });
      },
    };
  },
};
