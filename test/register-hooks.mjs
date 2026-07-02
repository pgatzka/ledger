// Registers the TypeScript extension resolver hook (see ts-extension-hook.mjs).
// Loaded via `node --import ./test/register-hooks.mjs` before the test files.
import { register } from "node:module";

register("./ts-extension-hook.mjs", import.meta.url);
