import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@/proxy";

describe("política de seguridad de contenido", () => {
  const directives = (policy: string) => Object.fromEntries(policy.split("; ").map((part) => [part.split(" ")[0], part]));

  it("en producción solo corren los scripts del sitio con el nonce, y el WASM sin eval", () => {
    const policy = directives(contentSecurityPolicy("abc123", { development: false, secure: true }));
    expect(policy["script-src"]).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic' 'wasm-unsafe-eval'");
    expect(policy["script-src"]).not.toContain("'unsafe-eval'");
    expect(policy["script-src"]).not.toContain("'unsafe-inline'");
    // Nada sale del sitio: ni telemetría de terceros ni conexiones a otros dominios.
    expect(policy["connect-src"]).toBe("connect-src 'self'");
    expect(policy["frame-ancestors"]).toBe("frame-ancestors 'none'");
    expect(policy["object-src"]).toBe("object-src 'none'");
    expect(policy["upgrade-insecure-requests"]).toBeDefined();
  });

  it("sin HTTPS no fuerza la actualización de recursos, y en desarrollo permite la recarga en caliente", () => {
    expect(contentSecurityPolicy("n", { development: false, secure: false })).not.toContain("upgrade-insecure-requests");
    const development = directives(contentSecurityPolicy("n", { development: true, secure: false }));
    expect(development["script-src"]).toContain("'unsafe-eval'");
    expect(development["connect-src"]).toBe("connect-src 'self' ws: wss:");
  });
});
