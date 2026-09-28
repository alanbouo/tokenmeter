#!/usr/bin/env node

// node:sqlite is still flagged experimental by Node even though its API is
// what we rely on; silence just that one warning so it doesn't clutter every
// command, while leaving other warnings visible.
const defaultWarningListeners = process.listeners("warning");
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "ExperimentalWarning" && /SQLite/i.test(warning.message)) {
    return;
  }
  for (const listener of defaultWarningListeners) listener(warning);
});

await import("../dist/cli.js");
