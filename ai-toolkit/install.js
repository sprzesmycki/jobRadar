#!/usr/bin/env node
"use strict";

// Copy-mode installer for the shared AI toolkit (M5L4 Model 1 learning exercise).
// Usage: node install.js <targetDir>
//
// - Copies skills/** into <targetDir>/.claude/skills/**.
// - Splices rules/CLAUDE.md into <targetDir>/CLAUDE.md between sentinel markers,
//   idempotently (replace the block if present, append if absent, throw if the
//   block is half-present / corrupted).
// - Records exactly what was installed in <targetDir>/.claude/.10x-toolkit-manifest.json
//   so uninstall is deterministic.

const fs = require("fs");
const path = require("path");

const PKG_DIR = __dirname;
const BEGIN = "<!-- BEGIN @twoj-zespol/ai-toolkit -->";
const END = "<!-- END @twoj-zespol/ai-toolkit -->";
const MANIFEST_NAME = ".10x-toolkit-manifest.json";

// Locate the BEGIN/END pair and replace only the block between them. If neither
// marker exists, append the block. If exactly one exists, the block is corrupted
// (half-edited by a human) — throw rather than duplicate the rules.
function applyRules(existing, teamRules) {
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);
  if ((start === -1) !== (end === -1)) {
    throw new Error(
      "Corrupted sentinel block in CLAUDE.md: exactly one of the BEGIN/END markers " +
        "is present. Refusing to inject a second block — restore or remove the stray marker.",
    );
  }
  const block = `${BEGIN}\n${teamRules.trim()}\n${END}`;
  if (start !== -1 && end !== -1) {
    return existing.slice(0, start) + block + existing.slice(end + END.length);
  }
  const prefix = existing.trim() === "" ? "" : existing.trimEnd() + "\n\n";
  return prefix + block + "\n";
}

// Recursively list files under dir, returned as paths relative to base.
function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

function main() {
  const targetArg = process.argv[2];
  if (!targetArg) {
    console.error("Usage: node install.js <targetDir>");
    process.exit(1);
  }

  const targetDir = path.resolve(targetArg);
  const skillsSrc = path.join(PKG_DIR, "skills");
  const claudeDir = path.join(targetDir, ".claude");
  const skillsDest = path.join(claudeDir, "skills");

  // 1. Copy skills into the target's .claude/skills, creating dirs as needed.
  const installed = [];
  for (const rel of walk(skillsSrc)) {
    const from = path.join(skillsSrc, rel);
    const to = path.join(skillsDest, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    // Record as a POSIX-style path relative to the target root.
    installed.push([".claude", "skills", ...rel.split(path.sep)].join("/"));
  }

  // 2. Splice team rules into the target CLAUDE.md between sentinel markers.
  const teamRules = fs.readFileSync(path.join(PKG_DIR, "rules", "CLAUDE.md"), "utf8");
  const claudeMd = path.join(targetDir, "CLAUDE.md");
  const existing = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, "utf8") : "";
  fs.writeFileSync(claudeMd, applyRules(existing, teamRules));

  // 3. Write the manifest recording exactly what was installed.
  const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, "package.json"), "utf8"));
  fs.mkdirSync(claudeDir, { recursive: true });
  const manifest = {
    package: pkg.name,
    version: pkg.version,
    tool: "claude-code",
    files: installed,
  };
  fs.writeFileSync(path.join(claudeDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + "\n");

  console.log(`Installed ${installed.length} skill file(s) into ${skillsDest}`);
  console.log(`Injected team rules into ${claudeMd}`);
  console.log(`Wrote manifest to ${path.join(claudeDir, MANIFEST_NAME)}`);
}

main();
