import { defaultDbPath, openDb } from "./db.js";
import { ingest } from "./ingest.js";

function runIngest(): void {
  const dbPath = defaultDbPath();
  const db = openDb(dbPath);
  try {
    const result = ingest(db);
    const total = db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number };
    console.log(`Scanned ${result.filesScanned} file(s).`);
    console.log(`Inserted ${result.eventsInserted} new event(s).`);
    if (result.linesSkipped > 0) {
      console.log(`Skipped ${result.linesSkipped} unparseable line(s).`);
    }
    console.log(`Total events in database: ${total.n}.`);
    console.log(`Database: ${dbPath}`);
  } finally {
    db.close();
  }
}

function main(): void {
  const [, , command] = process.argv;

  switch (command) {
    case "ingest":
      runIngest();
      break;
    default:
      console.log("tokenmeter — local pace tracker for Claude subscription usage");
      console.log("");
      console.log("Usage: tokenmeter <command>");
      console.log("");
      console.log("Commands:");
      console.log("  ingest    Read local Claude Code session history into the local database");
      if (command !== undefined) {
        process.exitCode = 1;
      }
  }
}

main();
