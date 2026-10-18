const vscode = require("vscode")
const fs = require("fs")
const os = require("os")
const path = require("path")

const SIDECAR_PATH = path.join(os.homedir(), ".config", "kilo", "kilo-priority.json")

const PRESETS = [
  { label: "1 — Work (highest)", value: 1, description: "Front of the LiteLLM priority queue" },
  { label: "2 — Work (shared high)", value: 2, description: "Behind priority 1, ahead of everyone else" },
  { label: "5 — Personal", value: 5, description: "Yields to work traffic when the gateway is saturated" },
  { label: "Off (no priority tag)", value: null, description: "Requests bypass LiteLLM's priority queue entirely" },
]

function readSettings() {
  const cfg = vscode.workspace.getConfiguration("kiloPriority")
  return {
    enabled: cfg.get("enabled", true),
    priority: cfg.get("priority", 1),
    targets: cfg.get("targets", ["litellm"]),
  }
}

function writeSidecar() {
  const { enabled, priority, targets } = readSettings()
  let existing = {}
  try {
    const parsed = JSON.parse(fs.readFileSync(SIDECAR_PATH, "utf8"))
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = parsed
    }
  } catch {}
  const body = {
    ...existing,
    enabled,
    priority,
    targets,
    updatedAt: new Date().toISOString(),
  }
  fs.mkdirSync(path.dirname(SIDECAR_PATH), { recursive: true })
  const tmp = SIDECAR_PATH + ".tmp"
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2) + "\n")
  fs.renameSync(tmp, SIDECAR_PATH)
  return { enabled, priority, targets }
}

function statusLabel(state) {
  if (!state.enabled) return "$(circle-slash) kilo prio: off"
  return `$(zap) kilo prio: ${state.priority}`
}

let statusItem

function refreshStatus(state) {
  if (!statusItem) return
  statusItem.text = statusLabel(state)
  statusItem.tooltip = `LiteLLM request priority\nFile: ${SIDECAR_PATH}\nTargets: ${state.targets.join(", ")}\n\nClick to change`
}

async function pickPriority() {
  const current = readSettings()
  const items = PRESETS.map((p) => ({
    ...p,
    picked: p.value === null ? !current.enabled : current.enabled && current.priority === p.value,
  }))
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: current.enabled
      ? `Current priority: ${current.priority}`
      : "Priority tagging is off",
  })
  if (!picked) return
  const cfg = vscode.workspace.getConfiguration("kiloPriority")
  if (picked.value === null) {
    await cfg.update("enabled", false, vscode.ConfigurationTarget.Global)
  } else {
    await cfg.update("priority", picked.value, vscode.ConfigurationTarget.Global)
    if (!current.enabled) await cfg.update("enabled", true, vscode.ConfigurationTarget.Global)
  }
}

async function disableTagging() {
  const cfg = vscode.workspace.getConfiguration("kiloPriority")
  await cfg.update("enabled", false, vscode.ConfigurationTarget.Global)
  refreshStatus(writeSidecar())
  vscode.window.showInformationMessage(
    `Kilo Priority is off on this machine. To fully remove it, also delete ${SIDECAR_PATH} and ~/.config/kilo/plugin/priority.ts.`,
  )
}

async function revealConfig() {
  const state = writeSidecar()
  const doc = await vscode.workspace.openTextDocument(SIDECAR_PATH)
  await vscode.window.showTextDocument(doc, { preview: true })
  refreshStatus(state)
}

function activate(context) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  statusItem.command = "kiloPriority.pick"
  context.subscriptions.push(statusItem)

  const state = writeSidecar()
  refreshStatus(state)
  statusItem.show()

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("kiloPriority")) return
      refreshStatus(writeSidecar())
    }),
    vscode.commands.registerCommand("kiloPriority.pick", pickPriority),
    vscode.commands.registerCommand("kiloPriority.disable", disableTagging),
    vscode.commands.registerCommand("kiloPriority.revealConfig", revealConfig),
  )
}

function deactivate() {}

module.exports = { activate, deactivate }
