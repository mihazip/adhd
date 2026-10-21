# tangent

A Claude Code mod for questions in the middle of a sentence. Type a question
between pipes while you write a prompt; a space after the closing pipes
sends it to a small side session in the background, and the answer is
written back into your draft in place, worded to continue the text before it.

```
The capital of Slovenia is || what is the capital of Slovenia || and it has about ...
```

## Install

Inside Claude Code:

```
/plugin install tangent --marketplace mihazip/hyperfocus
```

Restart Claude Code. Part of the [hyperfocus](../../README.md) collection.

## Syntax

- `|| question ||` then a space: the primary form. `||` is also logical OR, so it
  only fires when the question has 2+ words and the opener is not inside an
  unclosed backtick span or code fence (`if (a || b || ` stays code).
- `\\\ question \\\` and `/// question ///` then a space: aliases, on by default.
  They never fire by accident, so a one-word question is fine.
- While it runs, the spot shows a tag like `⟦1 capital of Sloveni…⟧`. Keep typing;
  the tag is swapped for the answer when it lands.
- Press Enter while answers still run: the prompt is held and sent by itself
  once the last answer lands.

## Your own delimiters

Add as many opening and closing pairs as you like (the same string twice is
fine): `;;;`, `>>>` ... `<<<`, `[[` ... `]]`. Each is 2+ characters with no
letters, digits or spaces, and needs a query of 2+ words like `||`. The built-in
`||`, `\\\` and `///` can each be switched off, but at least one pair stays on.

`/tangent delims` opens a small picker pane: an on/off button per built-in, a
remove button per custom pair, a field to add one (`open close`, close
optional) and a done button. Tab or the arrows walk the rows, Enter presses,
Esc only hands the keys back (done closes). The picker uses the Windows Terminal "Ubuntu" palette (`THEME` in `hooks/register.tsx`). The same things as text, for scripting:

```
/tangent delims add ;;;          same string both sides
/tangent delims add >>> <<<      different open and close
/tangent delims remove ;;;       drops a custom pair
/tangent delims off ||           switch a built-in off (on to switch it back)
/tangent delims reset            custom pairs cleared, built-ins all on
```

Plain `/tangent` lists the active delimiters. Pairs and switches are kept in the
plugin's store (`$.store`, a file in your Claude Code config folder), so they
survive restarts and `claude plugin update`. The plugin's options (`open` and
`close`, kept in settings.json) add one more pair next to them. An older single
pair saved by 0.2 is moved into the list on first start.

## Model and level

A short code picks the model and effort for one question. Put it right after the
closing pipes (`||your question||sm `) or at the start inside them (`||sm your question|| `).

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
