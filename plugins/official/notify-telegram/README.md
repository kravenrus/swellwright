# plugins/official/notify-telegram

Sends messages through a Telegram bot. The first official plugin, and a **declarative** one: `driver.yaml` describes the two requests (`send`, `check`) and Swellwright makes them itself, through its gateway, to `api.telegram.org` only. The plugin has no code and runs none (ADR 0030).

## Use

1. Make a bot with @BotFather and note its token.
2. In the vault, create a secret of the kind **telegram** with the token as the value.
3. Point `SW_PLUGINS_OFFICIAL_DIR` at this directory's parent (`plugins/official`), open Settings → Plugins, review the plugin (it asks for `api.telegram.org:443` and secrets of the kind `telegram`) and enable it.
4. Fill in its settings: choose the vault secret for the **bot token**, and give the **chat id** (a number or an `@name`).

## What it offers

| Operation | Parameters | Result |
|---|---|---|
| `send` | `text` (required, up to 4096 characters), `silent` (default false) | `{ messageId }` |
| `check` | none | `{ bot }`, the user name of the bot |

Approvals by inline buttons (low and medium risk only) are planned and need a long-polling or webhook part that a declarative driver cannot be; they will come as code or as a sidecar.
