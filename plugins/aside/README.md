# aside

A Claude Code mod for scattered side questions. `/aside` opens a pane with its
own input box that asks a side model (haiku, sonnet, opus or fable) in a separate
thread, so your main session and its context stay untouched. You can send a short
synopsis of an answer back to the main prompt box, by hand or automatically.

## Install

Inside Claude Code:

```
/plugin install aside --marketplace mihazip/hyperfocus
```

Restart Claude Code, then run `/aside`. Part of the [hyperfocus](../../README.md) collection.

## Use

- Type a question in the pane and press Enter.
- Follow-ups ("all of them", "more") continue the previous exchange (last 6 are sent as history).
- Open it with `/aside`.
- A braille hummingbird flutters for a moment when the pane opens. It shows only on the empty start screen and only when the pane has room.
- Arrow Up/Down and Tab walk between the input and the options; Esc hands the keys back to the prompt and leaves the pane open, with its log and unsent text.
- **Return synopsis to prompt** (once there is an answer) appends a short note with the last Q and A to your main prompt box.
- Press **more** under it to unfold the options, **less** (same place) to fold them again:
  - **Model** `‹ haiku ›`: Enter steps through haiku, sonnet, opus, fable and wraps (default haiku).
  - **Effort** `‹ medium ›`: Enter steps through low / medium / high and wraps (default medium).
  - **Auto-return**: return the synopsis automatically after every answer.
  - **Clear**: wipes the side chat.

## Notes

- Model and effort are remembered across sessions. The pane title shows the model.
- Each question is one call to the chosen model, plus one short haiku call (low effort) when an answer is long enough to need a synopsis.
- The side chat itself lives in memory for the session.
- The pane uses only your terminal's default colors, bold and dim.

## Layout

```
.claude-plugin/plugin.json        manifest
hooks/hooks.json                  points at the module
hooks/register.tsx                command, pane and model calls
types/index.d.ts                  plugin state types
tests/aside.test.tsx              pane render test
```

## License

MIT
