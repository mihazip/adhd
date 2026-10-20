# tangent

A Claude Code mod for questions in the middle of a sentence. Type a question
between triple stripes while you write a prompt; a space after the closing
stripes sends it to a small side session in the background, and the answer is
written back into your draft in place, worded to continue the text before it.

```
The capital of Slovenia is \\\capital of Slovenia\\\ and it has about ...
```

## Install

Inside Claude Code:

```
/plugin install tangent --marketplace mihazip/hyperfocus
```

Restart Claude Code. Part of the [hyperfocus](../../README.md) collection.

## Syntax

- `\\\ question \\\` then a space: the safe form, never typed by accident.
- `/// question ///` then a space: same thing, for keyboards where `\` is awkward.
- While it runs, the spot shows a tag like `⟦1 capital of Sloveni…⟧`. Keep typing;
  the tag is swapped for the answer when it lands.
- Press Enter while answers still run: the prompt is held and sent by itself
  once the last answer lands.

## Your own delimiters

Pick any opening and closing string (the same one twice is fine): `;;;`,
`>>>` ... `<<<`, `[[` ... `]]`. Each is 2+ characters with no letters or spaces.

```
/tangent delims ;;;          same string both sides
/tangent delims >>> <<<      different open and close
/tangent delims reset        back to \\\ and ///
```

Plain `/tangent` shows the current delimiters. Once you set your own, the
defaults (`\\\` and `///`) stop working. They are kept in the plugin's store
(`$.store`, a file in your Claude Code config folder), so they survive restarts
and `claude plugin update`. You can also set them in the plugin's options
(`open` and `close`, kept in settings.json); the command wins when both are set.

## Model and level

A short code picks the model and effort for one question. Put it right after the
closing stripes (`\\\question\\\sm `) or at the start inside them (`\\\sm question\\\ `).

| letter | model |
| --- | --- |
| h | haiku |
| s | sonnet |
| o | opus |
| f | fable |

| letter | level |
| --- | --- |
| l | low |
| m | medium |
| h | high |
| x | xhigh |
| xx | max |

The level letter is optional (`s` alone is sonnet at high). Default is `hh`
(haiku, high). Change it with `/tangent <code>`, e.g. `/tangent sm`; `/tangent`
shows it. The default is kept across sessions.

## Limits

Each question is one model call with no tools: up to ~20k characters of your
draft before the spot plus 2k after it go in (about 5-6k tokens), and the reply
is capped at 3000 tokens, so a side session stays near 10k tokens.

## Develop

```
claude plugin validate .
claude plugin test .
```

## License

MIT
