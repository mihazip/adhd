# adhd: project notes

Claude Code mod (a plugin with a hooks module and a Pane). `/adhd` opens a side pane that asks Haiku in a separate thread and can return a synopsis to the main prompt box. Shared via GitHub as its own marketplace (`mihazip/adhd`).

## Layout

- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`: manifest and marketplace.
- `hooks/register.tsx`: everything. `register` wires `session.start` (registers `/adhd`), `command.run` (opens the pane) and `ui.render` for the Pane. `ask` and `giveBack` are top-level function declarations.
- `types/index.d.ts`: `PluginState.adhd` and `Exchange`.

## Rules for editing

- `$` may only be passed to top-level function declarations, never closures. Keep helpers top-level and take `$: EngineInterface` as the first argument.
- State lives in atoms (`atom/read/update` from `claude-code`), keyed `{ plugin: 'adhd', key }`. Add new keys to `PluginState.adhd` in `types/index.d.ts`.
- Validate with `claude plugin validate .`. Run tests with `claude plugin test` once tests exist.
- Never commit secrets, session ids or local paths. Commit with the GitHub noreply email only.
- Hot reload during development: copy the folder into `~/.claude/dev-mods/<session-id>/adhd`. It is session-scoped, so nothing there is permanent.

## Install (local)

Dev machine installs from the local marketplace: `claude plugin marketplace add <path to this folder>`, then `claude plugin install adhd@adhd`. Re-run `claude plugin update adhd` after changes and restart.

## Decisions

- Theme: unchanged for now, fixed palette in `register.tsx` (Ubuntu-style text colors on background `#06303A`).
- Model: `haiku` alias, default effort `medium`.

## Roadmap (not built yet)

1. **Themes.** Make the palette a named theme object instead of inline hex values. Ship a few built-in themes (the current teal one, plus Ubuntu, Dracula, light). Keep the background distinct from a normal Claude split pane in every theme.
2. **`?` commands inside the pane.** Typing `?` at the start of the input runs a pane command instead of asking Haiku, for example:
   - `?theme <name>`: switch theme (`?themes` lists them).
   - `?model <alias>`: switch model.
   - `?effort <low|medium|high>`: set effort.
   - `?settings`: show current settings.
   - `?help`: list the commands.
3. **Settings.** Show the current settings in the pane (model, effort, theme, auto-return) and let the user change them there. Persist them across sessions, probably through plugin options (`claude plugin configure adhd`) instead of atoms alone.
4. **Models and effort.** Let the user pick any model alias, not only Haiku, and set the default effort. Keep Haiku + medium as the default.
5. Tests for `ask` (history trimming, synopsis cap at 300 chars, busy lock) once `claude plugin test` setup is clear.
