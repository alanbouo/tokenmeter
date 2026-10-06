import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

// A profile is one Claude account, identified by its Claude Code config
// directory (`CLAUDE_CONFIG_DIR`). Each account has its own gauge, reset and
// quota stock, so readings and calibrations are kept per profile.
export interface Profile {
  name: string;
  configDir: string;
  // Extra history directories counted against this account (e.g. a mirror of
  // a VPS's `~/.claude/projects`).
  sources: string[];
}

// Name given to data recorded before profiles existed (see db.ts migration).
export const LEGACY_PROFILE = "perso";

export function defaultConfigDir(): string {
  return join(homedir(), ".claude");
}

export function profilesPath(): string {
  return join(homedir(), ".tokenmeter", "profiles.json");
}

export function normalizeDir(dir: string): string {
  return resolve(dir.replace(/^~(?=$|\/)/, homedir()));
}

interface StoredProfile {
  configDir: string;
  sources?: string[];
}

// Without a profiles file, a single implicit profile covers the default
// Claude config dir, which keeps pre-profile setups working unchanged.
export function loadProfiles(path: string = profilesPath()): Profile[] {
  if (!existsSync(path)) {
    return [{ name: LEGACY_PROFILE, configDir: defaultConfigDir(), sources: [] }];
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, StoredProfile>;
  const profiles = Object.entries(raw).map(([name, p]) => {
    if (typeof p?.configDir !== "string" || p.configDir === "") {
      throw new Error(`Profile "${name}" in ${path} has no configDir.`);
    }
    return {
      name,
      configDir: normalizeDir(p.configDir),
      sources: (p.sources ?? []).map(normalizeDir),
    };
  });
  if (profiles.length === 0) throw new Error(`${path} defines no profile.`);
  return profiles;
}

export function saveProfiles(profiles: Profile[], path: string = profilesPath()): void {
  const out: Record<string, StoredProfile> = {};
  for (const p of profiles) {
    out[p.name] = p.sources.length > 0 ? { configDir: p.configDir, sources: p.sources } : { configDir: p.configDir };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
}

export function projectsDirs(profile: Profile): string[] {
  return [join(profile.configDir, "projects"), ...profile.sources];
}

// Which profile the current shell is using: TOKENMETER_PROFILE, else the
// profile whose configDir matches CLAUDE_CONFIG_DIR (default ~/.claude).
// Returns null when nothing matches.
export function detectProfile(profiles: Profile[], env: NodeJS.ProcessEnv = process.env): Profile | null {
  const byName = env.TOKENMETER_PROFILE;
  if (byName) return profiles.find((p) => p.name === byName) ?? null;
  const current = normalizeDir(env.CLAUDE_CONFIG_DIR || defaultConfigDir());
  return profiles.find((p) => p.configDir === current) ?? null;
}

export function describeProfiles(profiles: Profile[]): string {
  return profiles.map((p) => `${p.name} (${p.configDir})`).join(", ");
}

// Resolves the profile a command applies to: an explicit `--profile` wins,
// then shell detection, then the only profile if there is just one.
export function resolveProfile(profiles: Profile[], explicit: string | null): Profile {
  if (explicit) {
    const found = profiles.find((p) => p.name === explicit);
    if (!found) throw new Error(`Unknown profile "${explicit}". Known profiles: ${describeProfiles(profiles)}.`);
    return found;
  }
  const detected = detectProfile(profiles);
  if (detected) return detected;
  if (profiles.length === 1) return profiles[0];
  throw new Error(
    `Cannot tell which profile to use from CLAUDE_CONFIG_DIR. Pass --profile <name>. Known profiles: ${describeProfiles(profiles)}.`
  );
}

// Removes `--profile <name>` from args so each command's own option parser
// doesn't have to know about it.
export function extractProfileFlag(args: string[]): { profile: string | null; rest: string[] } {
  const rest: string[] = [];
  let profile: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--profile") {
      const value = args[++i];
      if (!value) throw new Error("--profile requires a profile name.");
      profile = value;
    } else {
      rest.push(args[i]);
    }
  }
  return { profile, rest };
}
