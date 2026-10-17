# Kilo Priority (VS Code extension)

UI half of the Kilo LiteLLM priority setup. Gives you a status-bar control and
settings for the per-machine `priority` number that the Kilo Code plugin
(`priority.ts`) injects into requests sent to a shared LiteLLM gateway.

On activation and on every setting change, the extension writes
`~/.config/kilo/kilo-priority.json`; the Kilo plugin reads that file per
request. Nothing is synced across machines — the value is intentionally
per-machine (work=1, personal=5).

Requires the companion plugin installed in Kilo (`~/.config/kilo/plugin/priority.ts`).

## Usage

- Status bar item `⚡ kilo prio: N` → click → pick a preset.
- Or Settings → "Kilo Priority".
- Command Palette: `Kilo Priority: Choose Priority…`,
  `Kilo Priority: Disable Tagging on This Machine` (writes `enabled: false`
  to the sidecar — never delete the sidecar file alone while the plugin is
  installed, that reverts it to the legacy `priority: 1` default),
  `Kilo Priority: Reveal Sidecar Config File`.

## Rules (LiteLLM scheduler)

- Lower number wins; tag **every** machine sharing the gateway so they all
  compete inside the priority queue (untagged requests bypass the queue).
- Never `0` — LiteLLM treats it as untagged.
