# kilo-priority

Per-machine [LiteLLM](https://docs.litellm.ai) request prioritization for
[Kilo Code](https://kilo.ai), with a VS Code settings UI. Useful when several
machines (e.g. a work laptop and a personal desktop) share one LiteLLM gateway
and you want one of them served first when the gateway is saturated.

```
VS Code "Kilo Priority" extension ──writes──▶ ~/.config/kilo/kilo-priority.json
                                                      │ read per request
Kilo plugin (priority.ts) ──chat.params──▶ body {"priority": N} ──▶ LiteLLM queue
```

> LiteLLM's [request-priority queue](https://docs.litellm.ai/docs/scheduler)
> is a **beta** feature. Semantics that matter here: **lower number wins**,
> only requests carrying a `priority` enter the queue (**untagged requests
> bypass it entirely**), and `priority: 0` is treated as untagged. So set a
> priority on **every** machine sharing the gateway (e.g. high-priority box
> `1`, everyone else `5`) and never use `0`.

## Components

- `priority.ts` — Kilo plugin (enforcement). Reads the sidecar config per
  request and injects `"priority": N` into the body for providers whose
  ID/name/baseURL matches a configured target substring. Works on the
  `@ai-sdk/openai-compatible` path; equivalent to the OpenAI SDK's
  `extra_body={"priority": N}`. Fails **closed**: a corrupt or invalid
  sidecar means "do not tag". Only a *missing* file falls back to the legacy
  default (`priority: 1`).
- `vscode-extension/` — VS Code extension (configuration UI). Settings under
  *Kilo Priority*, a status-bar pill (`⚡ kilo prio: N`, click → preset
  picker), and commands to pick a priority, disable tagging on this machine,
  or reveal the sidecar file. The sidecar write is atomic and preserves
  hand-added keys.

## Extension settings

All settings are `machine`-scoped: they never Settings-Sync across machines
and workspace `.vscode/settings.json` cannot change them — which is the point,
since the value is intentionally different per machine.

| Setting | Default | Purpose |
| --- | --- | --- |
| `kiloPriority.enabled` | `true` | Toggle tagging on this machine. Off = requests bypass the queue. |
| `kiloPriority.priority` | `1` | Integer ≥ 1. Lower wins when the gateway is saturated (e.g. `1` for the machine that should go first, `5` for the one that should yield). |
| `kiloPriority.targets` | `["litellm"]` | Lowercase substrings matched against the provider ID, provider name, and baseURL. An empty array tags nothing. |

The Kilo plugin reads the same values from `~/.config/kilo/kilo-priority.json`
(written by the extension) and ignores unknown keys.

## Install

Replace `<your-gitea-host>` and `<your-owner>` with this repo's actual host
and owner.

1. Plugin, on **every** machine that hits the gateway:

   ```bash
   mkdir -p ~/.config/kilo/plugin
   curl -fsSL https://<your-gitea-host>/<your-owner>/kilo-priority-plugin/raw/branch/main/priority.ts \
     -o ~/.config/kilo/plugin/priority.ts
   ```

   Or reference a local checkout in `kilo.json` (adjust the path to where the
   repo lives **on that machine** — a wrong path fails silently and leaves the
   machine untagged):
   `"plugin": ["file:///ABSOLUTE/PATH/TO/kilo-priority-plugin/priority.ts"]`.
   Restart the Kilo session.

   > ⚠️ Until step 3 runs on a machine (no sidecar file yet), that machine
   > sends matching requests at the legacy default `priority: 1`. Run
   > steps 2–3 immediately after installing the plugin.

2. Extension, on each machine (VSCodium: replace `code` with `codium`) —
   grab the CI-built vsix from a release:

   ```bash
   TAG=v1.0.2  # see Releases
   curl -fsSL "https://<your-gitea-host>/<your-owner>/kilo-priority-plugin/releases/download/${TAG}/kilo-priority-${TAG#v}.vsix" \
     -o /tmp/kilo-priority.vsix
   code --install-extension /tmp/kilo-priority.vsix
   ```

   Or build locally:
   `cd vscode-extension && npx --yes @vscode/vsce package --allow-missing-repository --no-dependencies`.

3. Set per machine: status-bar pill → `1 — Work (highest)` on the machine
   that should go first, `5 — Personal` on the one that should yield (writes
   the sidecar immediately). If your provider ID doesn't contain `litellm`,
   set `kiloPriority.targets` accordingly on each machine.

## Gateway-side requirements

- Priority scheduling only engages when deployments are saturated (e.g. rpm
  limits); below saturation every request proceeds immediately.
- Single LiteLLM instance, or configure `router_settings.redis_*` so the
  queue is shared across replicas.
- Raise `litellm_settings.request_timeout` (e.g. `600`) so queued requests
  wait instead of failing fast.
- Priority applies only to `/chat/completions` and `/v1/completions`.

## Verify

Reveal the sidecar via `Kilo Priority: Reveal Sidecar Config File`, then
inspect a request body (mitmproxy or debug logging): matching requests carry
`"priority":N`, and LiteLLM logs show priority-queue admission for tagged
requests.

## Releasing (Gitea Actions)

`.gitea/workflows/release.yml` runs on `v*` tags: it packages the vsix with
`vsce`, creates a Gitea release for the tag (reusing one if it exists), and
uploads the vsix as a release attachment. Download URLs are stable and public:

```
https://<your-gitea-host>/<your-owner>/kilo-priority-plugin/releases/download/v1.0.2/kilo-priority-1.0.2.vsix
```

To cut a release:

1. Bump `"version"` in `vscode-extension/package.json` (must equal the tag
   minus `v`, e.g. `1.0.2` → `v1.0.2` — the workflow checks this).
2. `git tag v1.0.2 && git push origin main v1.0.2`

Notes:

- If the default workflow `GITHUB_TOKEN` can't create releases on your Gitea
  instance, add a repo Actions secret `RELEASE_TOKEN` (token with
  `write:repository` scope) — the workflow prefers it when present.
- Adjust `runs-on` if your `act_runner` registers a different label.
- `priority.ts` needs no release: it is served from the raw file route
  (install step 1). Publishing it to npm would additionally allow the
  `"plugin": ["kilo-priority-plugin"]` npm form in `kilo.json`.

## Security notes

- The Kilo plugin runs with full user permissions inside the Kilo process;
  review it before installing. Treat `~/.config/kilo/kilo-priority.json` as
  trusted input — don't let untrusted tools write it.
- The extension only ever writes that one config file; it makes no network
  requests.
- The injected `priority` field is ignored by non-LiteLLM providers that use
  strict request schemas; still, keep `kiloPriority.targets` scoped to your
  gateway(s).

## License

MIT — see [LICENSE](LICENSE).
