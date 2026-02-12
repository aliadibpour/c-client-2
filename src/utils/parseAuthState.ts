export default function parseAuthState(authStateRaw: any) {
  if (!authStateRaw) return null;
  try {
    let parsed = authStateRaw;
    // many wrappers return { data: "..." } or { "@type": "..." } or stringified
    if (typeof authStateRaw === "string") {
      parsed = JSON.parse(authStateRaw);
    } else if (authStateRaw && typeof authStateRaw === "object" && authStateRaw.data) {
      parsed = typeof authStateRaw.data === "string" ? JSON.parse(authStateRaw.data) : authStateRaw.data;
    }
    const authType = parsed?.["@type"] ?? parsed?.type ?? null;
    return { parsed, authType };
  } catch (e) {
    console.warn("parseAuthState failed", e);
    return { parsed: authStateRaw, authType: authStateRaw?.["@type"] ?? authStateRaw?.type ?? null };
  }
}
