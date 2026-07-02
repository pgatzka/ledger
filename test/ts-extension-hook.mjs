// Test-only ESM resolver hook. The product source under src/lib uses
// extensionless relative imports (e.g. `import { db } from "./db"`), which
// Next.js's bundler resolves but Node's native ESM loader does not. This hook
// retries an extensionless relative specifier with a `.ts` suffix so the suite
// can run the TypeScript source directly with `node --experimental-strip-types`.
// It touches nothing in the app itself.
export async function resolve(specifier, context, next) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExt = /\.[cm]?[jt]s$/.test(specifier);
  if (isRelative && !hasExt) {
    try {
      return await next(specifier + ".ts", context);
    } catch {
      // fall through to the default resolution below
    }
  }
  return next(specifier, context);
}
