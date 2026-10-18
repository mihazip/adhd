# hyperfocus

Claude Code mods for keeping your focus while many agents work for you.

When you orchestrate several Claude sessions at once, small questions keep
pulling you away: a fact, a name, a quick check. These mods answer them on the
side, with a small model and a tight budget, so the main thread's context and
your train of thought stay where they were.

| Mod | What it does |
| --- | --- |
| [aside](plugins/aside) | `/aside` opens a side pane with its own input box. Ask Haiku anything; optionally send a short synopsis back to your prompt. |
| [tangent](plugins/tangent) | Type a question between triple stripes mid-sentence (`\\\ like this \\\` or `/// like this ///`). A space after the closing stripes asks in the background and writes the answer into your draft in place. |

## Install

Inside Claude Code:

```
/plugin marketplace add mihazip/hyperfocus
/plugin install aside@hyperfocus
/plugin install tangent@hyperfocus
```

Restart Claude Code after installing.

## License

MIT
