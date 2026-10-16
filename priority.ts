import type { Plugin } from "@kilocode/plugin"

interface ChatParamsInput {
  model?: { providerID?: string }
}
interface ChatParamsOutput {
  options: Record<string, unknown>
}

// Sends `"priority": 1` in the request body for LiteLLM-gateway providers
// (e.g. mcsprig/llm.mcsprig.dev), so LiteLLM's priority scheduler queues
// these requests ahead of untagged traffic. Unknown chat.params `options`
// keys are spread verbatim into the body by @ai-sdk/openai-compatible.
export default (async () => ({
  "chat.params": async (input: ChatParamsInput, output: ChatParamsOutput) => {
    const id = String(input.model?.providerID ?? "").toLowerCase()
    if (id.includes("litellm") || id.includes("mcsprig")) {
      output.options.priority = 1
    }
  },
})) satisfies Plugin
