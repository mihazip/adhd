# aside

A Claude Code mod for scattered side questions. `/aside` opens a pane with its
own input box that asks Haiku in a separate thread, so your main session and its
context stay untouched. You can send a short synopsis of an answer back to the
main prompt box, by hand or automatically.

## Install

Inside Claude Code:

```
/plugin install aside --marketplace mihazip/hyperfocus
```

Restart Claude Code, then run `/aside`. Part of the [hyperfocus](../../README.md) collection.

## Use

- Type a question in the pane and press Enter.
- Follow-ups ("all of them", "more") continue the previous exchange (last 6 are sent as history).
- Open it without remembering the command: type `?? ` at the start of the prompt box (the trigger is stripped and the pane opens), or follow the one-line hint under the prompt. The hint goes away once the pane is open.
- A small hummingbird sits at the top and flutters for a moment when the pane opens (hidden when the pane is too short).
- Arrow Up/Down and Tab walk between the input and the options; Esc hands the keys back to the prompt, and again closes the pane.
- Press **more** under the input to unfold the options, **less** to fold them again:
  - **Return synopsis to prompt**: appends a short note with the last Q and A to your main prompt box.
  - **Auto-return**: do that automatically after every answer.
  - **Effort**: cycles low / medium / high (default medium).
  - **Clear**: wipes the side chat.

## Notes

- Model is the `haiku` alias. Each question is one Haiku call, plus one short call when an answer is long enough to need a synopsis.
- Nothing is stored on disk. The side chat lives in memory for the session.
- The pane has no background and follows your Claude Code theme. Its one accent is Claude's orange rotated to teal at the same lightness, so it reads as related but distinct.

## Layout

```
.claude-plugin/plugin.json        manifest
hooks/hooks.json                  points at the module
hooks/register.tsx                command, pane and Haiku calls
types/index.d.ts                  plugin state types
```

## License

MIT
