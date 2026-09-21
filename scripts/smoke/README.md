# Smoke runs

Two step files for `scripts/mcp-driver.mjs`. The first needs nothing; the
second needs Figma Desktop open with the plugin running.

```
npm run build
node scripts/mcp-driver.mjs scripts/smoke/01-no-plugin.json
node scripts/mcp-driver.mjs scripts/smoke/02-with-plugin.json
```

`01` exercises the whole server path — MCP protocol, validation, tool
dispatch, layout and the checkers — without a plugin, because `dryRun` never
reaches the bridge. It is what caught three real bugs that the unit tests
could not see: the documented call shape was wrong (a nested `spec` that the
tool never reads), four arrays were missing from the input schema so the
array form came back INVALID_PARAMS while the `text` form worked, and the use
case layout marked an `include`d use case as an orphan while the checker
correctly said it was fine.

`02` is the half only a live Figma can answer: does the plugin actually draw
this, do variants apply, does a rebuild keep instance ids. Run it against a
file you can EDIT — a duplicate of a template is fine, view access is not
enough to run a plugin at all.
