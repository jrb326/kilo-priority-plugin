# kilo-priority

Per-machine LiteLLM request prioritization for Kilo Code, with a VS Code UI.

```
VS Code "Kilo Priority" extension ──writes──▶ ~/.config/kilo/kilo-priority.json
                                                      │ read per request
Kilo plugin (priority.ts) ──chat.params──▶ body {"priority": N} ──▶ LiteLLM queue
```

LiteLLM's [request-priority queue](https://docs.litellm.ai/docs/scheduler)
(beta) admits tagged requests in priority order when deployments are saturated.
**Lower number wins** and **untagged requests bypass the queue entirely**, so
tag every machine sharing the gateway: `work = 1`, `personal = 5`. Never use
`0` — LiteLLM's router treats it as untagged.

## Components

- `priority.ts` — Kilo plugin (enforcement). Reads the sidecar config and
  injects `"priority": N` into the body for providers whose ID/name/baseURL
  matches `kiloPriority.targets`. A corrupt/unreadable sidecar means **do not
  tag**; only a *missing* file falls back to the legacy default (`priority: 1`).
  Works on the `@ai-sdk/openai-compatible` path; same effect as OpenAI SDK's
  `extra_body={"priority": N}`.
- `vscode-extension/` — VS Code extension (UI). Settings under *Kilo Priority*,
  a status-bar pill (`⚡ kilo prio: N`, click → preset picker), commands
  `Kilo Priority: Choose Priority…`, `…Disable Tagging on This Machine`,
  `…Reveal Sidecar Config File`. **All settings are `machine`-scoped**: they
  never Settings-Sync across machines and workspace `.vscode/settings.json`
  cannot change them.

## Install

1. Plugin, on every machine that hits the gateway:

   ```bash
   mkdir -p ~/.config/kilo/plugin
   curl -fsSL https://GITEA_HOST/OWNER/kilo-priority-plugin/raw/branch/main/priority.ts \
     -o ~/.config/kilo/plugin/priority.ts
   ```

   Or add to `kilo.json` (example — adjust the `file://` path to wherever this
   repo actually lives **on that machine**; a wrong path fails silently and
   leaves the machine untagged):
   `"plugin": ["file:///ABSOLUTE/PATH/TO/kilo-priority-plugin/priority.ts"]`.
   Restart the Kilo session.

   > ⚠️ Until step 3 runs on a machine (no sidecar file yet), that machine
   > sends matching requests at the legacy default `priority: 1` — including
   > personal machines. Run steps 2–3 immediately after installing the plugin.

2. Extension, on each machine (VSCodium: replace `code` with `codium`) —
   grab the CI-built vsix from the latest release:

   ```bash
   TAG=v1.0.1  # see Releases
   curl -fsSL "https://GITEA_HOST/OWNER/kilo-priority-plugin/releases/download/${TAG}/kilo-priority-${TAG#v}.vsix" \
     -o /tmp/kilo-priority.vsix
   code --install-extension /tmp/kilo-priority.vsix
   ```

   Or build locally: `cd vscode-extension && npx --yes @vscode/vsce package --allow-missing-repository --no-dependencies`.

3. Set per machine: status-bar pill → `1 — Work` on the work machine,
   `5 — Personal` on the personal machine (writes the sidecar immediately).

## Releasing (Gitea Actions)

`.gitea/workflows/release.yml` runs on `v*` tags: it packages the vsix with
`vsce`, creates a Gitea release for the tag (reusing one if it exists), and
uploads the vsix as a release attachment. Download URLs are stable and public:

```
https://GITEA_HOST/OWNER/kilo-priority-plugin/releases/download/v1.0.1/kilo-priority-1.0.1.vsix
```

To cut a release:

1. Bump `"version"` in `vscode-extension/package.json` (must equal the tag
   minus `v`, e.g. `1.0.2` → `v1.0.2` — the workflow checks this).
2. `git tag v1.0.2 && git push origin main v1.0.2`

Notes:

- If the default workflow `GITHUB_TOKEN` can't create releases on your Gitea
  instance, add a repo Actions secret `RELEASE_TOKEN` (token with
  `write:repository` scope) — the workflow prefers it when present.
- Adjust `runs-on` if your runner registers a different label.
- `priority.ts` doesn't need a release: curl it from the raw file route
  (install step 1). Publishing to npm would additionally allow the
  `"plugin": ["kilo-priority-plugin"]` npm form in `kilo.json`.

## Gateway-side requirements

- Single LiteLLM instance, or `router_settings.redis_*` so the queue is shared
  across replicas.
- `litellm_settings.request_timeout` raised (e.g. `600`) so queued requests
  wait instead of failing fast.
- Priority only applies to `/chat/completions` and `/v1/completions`.

## Verify

Reveal the sidecar via `Kilo Priority: Reveal Sidecar Config File`, then watch
the request body (mitmproxy or `KILO_LOG=debug`): matching requests carry
`"priority":N`; LiteLLM logs show queue admission for tagged requests.
