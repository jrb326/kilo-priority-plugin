import type { Plugin } from "@kilocode/plugin"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// Enforcement half of kilo-priority. The companion VS Code extension
// ("Kilo Priority") writes ~/.config/kilo/kilo-priority.json from the VS Code
// settings UI; this plugin reads it per request and injects `"priority": N`
// into the body of matching gateway requests.
//
// LiteLLM semantics (docs.litellm.ai/docs/scheduler, router.py):
// - lower number = higher priority; only requests WITH an int priority enter
//   the priority queue, so tag every machine sharing the gateway
//   (e.g. work=1, personal=5) instead of tagging only the priority host
// - never use 0: router.py does `kwargs.get("priority") or default_priority`,
//   so 0 falls through as untagged
// - unknown chat.params `options` keys are spread verbatim into the body by
//   @ai-sdk/openai-compatible (chat-completions path only)
//
// Failure policy: only a MISSING sidecar (fresh install, pre-extension legacy
// path) falls back to tagging with priority 1. A corrupt, unreadable, or
// invalid sidecar means DO NOT TAG — a typo in a personal machine's config
// must never escalate it to the front of the queue.

const CONFIG_FILE = path.join(os.homedir(), ".config", "kilo", "kilo-priority.json")
const DEFAULT_TARGETS = ["litellm"]

interface ChatParamsInput {
  model?: { providerID?: string }
  provider?: {
    info?: { name?: string }
    options?: Record<string, unknown>
  }
}
interface ChatParamsOutput {
  options: Record<string, unknown>
}

interface EffectiveConfig {
  priority: number
  targets: string[]
}

function loadConfig(): EffectiveConfig | null {
  let raw: string
  try {
    raw = fs.readFileSync(CONFIG_FILE, "utf8")
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === "ENOENT") {
      // No sidecar ever written (extension not installed/run yet): legacy default.
      return { priority: 1, targets: DEFAULT_TARGETS }
    }
    return null
  }

  let cfg: unknown
  try {
    cfg = JSON.parse(raw)
  } catch {
    return null
  }
  if (cfg === null || typeof cfg !== "object" || Array.isArray(cfg)) return null
  const record = cfg as Record<string, unknown>

  // Strictly literal true enables; absent means enabled, anything else (0,
  // "false", typos) means do not tag.
  if (record.enabled !== undefined && record.enabled !== true) return null

  let priority: number
  if (record.priority === undefined) {
    priority = 1
  } else if (
    typeof record.priority === "number" &&
    Number.isInteger(record.priority) &&
    record.priority >= 1
  ) {
    priority = record.priority
  } else {
    return null
  }

  let targets: string[]
  if (record.targets === undefined) {
    targets = DEFAULT_TARGETS
  } else if (Array.isArray(record.targets)) {
    // Drop empty/whitespace entries: "" would match every provider.
    targets = record.targets.map((t) => String(t).trim().toLowerCase()).filter((t) => t.length > 0)
  } else {
    return null
  }
  if (targets.length === 0) return null

  return { priority, targets }
}

export default (async () => ({
  "chat.params": async (input: ChatParamsInput, output: ChatParamsOutput) => {
    const cfg = loadConfig()
    if (!cfg) return

    const haystack = [
      input.model?.providerID,
      input.provider?.info?.name,
      input.provider?.options?.baseURL,
    ]
      .filter((x): x is string => typeof x === "string")
      .join(" ")
      .toLowerCase()

    if (cfg.targets.some((t) => haystack.includes(t))) {
      output.options.priority = cfg.priority
    }
  },
})) satisfies Plugin
