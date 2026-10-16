# kilo-priority-plugin

Kilo Code plugin that tags every request to your LiteLLM gateway with
`"priority": 1` so LiteLLM's [request-priority queue](https://docs.litellm.ai/docs/scheduler)
serves it ahead of untagged traffic. Works on the openai-compatible provider
path (Kilo's LiteLLM models) — same effect as OpenAI Python SDK's
`extra_body={"priority": 1}`.

Matches providers whose ID contains `litellm` or `mcsprig`; adjust the regex in
`priority.ts` if your providerID differs.

## Install

Copy (or symlink) into your global Kilo plugin dir:

```bash
mkdir -p ~/.config/kilocode/plugin
cp priority.ts ~/.config/kilocode/plugin/priority.ts
```

Or add to `kilo.json`: `"plugin": ["/Users/jonahbray/Programming/kilo-priority-plugin/priority.ts"]`

Restart the Kilo session. Verify: LiteLLM proxy logs show the request admitted
with priority; or add `"max_tokens"` probe with `curl`-visible request body via
mitmproxy/debug log — body should contain `"priority":1`.
