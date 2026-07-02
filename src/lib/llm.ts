// Provider selector for the two LLM stages. Choose with LLM_PROVIDER
// (`anthropic` | `ollama`); if unset, default to Ollama when OLLAMA_MODEL or
// OLLAMA_URL is configured, otherwise Anthropic. Both providers expose the same
// `route` / `decideOperations` contract, so the pipeline is provider-agnostic.
import * as anthropic from "./anthropic";
import * as ollama from "./ollama";

function pickProvider(): "anthropic" | "ollama" {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === "ollama" || explicit === "anthropic") return explicit;
  if (process.env.OLLAMA_MODEL || process.env.OLLAMA_URL) return "ollama";
  return "anthropic";
}

const provider = pickProvider();
const impl = provider === "ollama" ? ollama : anthropic;

export const route = impl.route;
export const decideOperations = impl.decideOperations;
export const LLM_PROVIDER = provider;
