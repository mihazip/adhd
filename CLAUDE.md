# hyperfocus: project notes

A marketplace of Claude Code mods (plugins with a hooks module) for side questions that never touch the main thread. Shared on GitHub as `mihazip/hyperfocus` (renamed from `mihazip/adhd`; GitHub redirects the old URL).

## Layout

- `.claude-plugin/marketplace.json`: the marketplace, named `hyperfocus`. One entry per plugin, `source: ./plugins/<name>`.
- `plugins/aside/`: `/aside` side pane (was `adhd`). `hooks/register.tsx` wires `session.start` (registers `/aside`), `command.run` (opens the pane) and `ui.render` for the Pane. `types/index.d.ts`: `PluginState.aside` and `Exchange`.
- `plugins/tangent/`: inline `\\\ question \\\` / `/// question ///`. `hooks/register.ts` hooks `prompt.edit` (space after closing stripes starts a job), `prompt.submit` (holds a prompt until its answers land), `/tangent <code>` sets the default model+level. `tests/tangent.test.ts`.
- `README.md`: the collection page. Each plugin has its own README with a `/plugin install <name> --marketplace mihazip/hyperfocus` line.

## Rules for editing

- `$` may only be passed to top-level function declarations, never closures. Keep helpers top-level and take `$: EngineInterface` as the first argument.
- State lives in atoms (`atom/read/update` from `claude-code`), keyed `{ plugin: '<name>', key }`. Add new keys to that plugin's `types/index.d.ts`. The contract must be self-contained (no imports).
- Hooks have a 10 s budget and `$.clock.sleep` counts against it: long work goes in `$.clock.after` callbacks, not in a waiting hook.
- Write backslashes in files with the Write/Edit tools, not shell heredocs: the shell halves them.
- Validate: `claude plugin validate .` (marketplace) and `claude plugin validate plugins/<name>`. Test: `claude plugin test plugins/tangent`.
- Never commit secrets, session ids or local paths. Commit with the GitHub noreply email only.
- Hot reload during development: copy a plugin folder into `~/.claude/dev-mods/<session-id>/<name>`. It is session-scoped.

## Install (local)

`claude plugin marketplace add <path to this folder>`, then `claude plugin install aside@hyperfocus` and `claude plugin install tangent@hyperfocus`. Re-run `claude plugin marketplace update hyperfocus` and `claude plugin update <name>` after changes and restart.

## Decisions

- aside: fixed palette in `register.tsx` (Ubuntu-style text on `#06303A`); `haiku`, default effort `medium`.
- tangent: default `hh` (haiku, high); codes are model letter `h s o f` + level `l m h x`, `xx` = max. Context ~20k chars before + 2k after, reply cap 3000 tokens (~10k per side session).

## Roadmap for aside (not built yet)

1. **Themes.** A named theme object instead of inline hex values; built-ins (teal, Ubuntu, Dracula, light), each distinct from a normal split pane.
2. **`?` commands in the pane:** `?theme <name>`, `?themes`, `?model <alias>`, `?effort <level>`, `?settings`, `?help`.
3. **Settings** shown in the pane and persisted across sessions (`$.store` or plugin options).
4. **Models and effort.** Any model alias, not only Haiku; reuse tangent's `h s o f` codes.
5. Tests for `ask` (history trimming, synopsis cap at 300 chars, busy lock).
