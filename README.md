# adhd

A Claude Code mod for scattered side questions. `/adhd` opens a pane with its
own input box that asks Haiku in a separate thread, so your main session and its
context stay untouched. You can send a short synopsis of an answer back to the
main prompt box, by hand or automatically.

## Install

Inside Claude Code:

```
/plugin marketplace add mihazip/adhd
/plugin install adhd@adhd
```

Restart Claude Code, then run `/adhd`.

## Use

- Type a question in the pane and press Enter.
- Follow-ups ("all of them", "more") continue the previous exchange (last 6 are sent as history).
- Buttons under the input:
  - **Return synopsis to prompt**: appends a short note with the last Q and A to your main prompt box.
  - **Auto-return**: do that automatically after every answer.
  - **Effort**: cycles low / medium / high (default medium).
  - **Clear**: wipes the side chat.

## Notes

- Model is the `haiku` alias. Each question is one Haiku call, plus one short call when an answer is long enough to need a synopsis.
- Nothing is stored on disk. The side chat lives in memory for the session.
- Colors are a fixed Ubuntu-style palette on a teal background, so the pane is easy to tell apart from a normal split pane.

## Layout

```
.claude-plugin/plugin.json        manifest
.claude-plugin/marketplace.json   makes this repo installable as a marketplace
hooks/hooks.json                  points at the module
hooks/register.tsx                command, pane and Haiku calls
types/index.d.ts                  plugin state types
```

## License

MIT
