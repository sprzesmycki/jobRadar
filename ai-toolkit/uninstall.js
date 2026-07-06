#!/usr/bin/env node
"use strict";

// Uninstaller for the shared AI toolkit (M5L4 Model 1 learning exercise).
// Usage: node uninstall.js <targetDir>
//
// Reverses an install by reading the manifest rather than guessing:
// - Deletes exactly the skill files recorded in the manifest (and now-empty dirs).
// - Strips the sentinel block from <targetDir>/CLAUDE.md, leaving user content intact.
// - Deletes the manifest.
// Absent manifest => safe no-op (exit 0). A second run is also a safe no-op.

const fs = require("fs");
const path = require("path");

const BEGIN = "<!-- BEGIN @twoj-zespol/ai-toolkit -->";
const END = "<!-- END @twoj-zespol/ai-toolkit -->";
const MANIFEST_NAME = ".10x-toolkit-manifest.json";

// Remove the BEGIN..END block (inclusive) and tidy the surrounding whitespace so
// no orphaned blank lines or markers remain. If only one marker is present, the
// block is corrupted — leave the file untouched rather than risk eating content.
function stripBlock(content) {
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (start === -1 || end === -1) return { changed: false, content };

  const before = content.slice(0, start).replace(/\s+$/, "");
  const after = content.slice(end + END.length).replace(/^\s+/, "");
  let out;
  if (before && after) out = before + "\n\n" + after + "\n";
  else if (before) out = before + "\n";
  else if (after) out = after + "\n";
  else out = "";
  return { changed: true, content: out };
}

// Walk up from startDir toward (but not including) stopDir, removing dirs that
// have become empty after their files were deleted.
function pruneEmptyDirs(startDir, stopDir) {
  let dir = startDir;
  while (dir !== stopDir && dir.startsWith(stopDir + path.sep)) {
    try {
      if (fs.readdirSync(dir).length !== 0) break;
      fs.rmdirSync(dir);
    } catch {
      break;
    }
    dir = path.dirname(dir);
  }
}

function main() {
  const targetArg = process.argv[2];
  if (!targetArg) {
    console.error("Usage: node uninstall.js <targetDir>");
    process.exit(1);
  }

  const targetDir = path.resolve(targetArg);
  const claudeDir = path.join(targetDir, ".claude");
  const manifestPath = path.join(claudeDir, MANIFEST_NAME);

  if (!fs.existsSync(manifestPath)) {
    console.log("No toolkit manifest found — nothing to remove.");
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    console.error(`Malformed manifest at ${manifestPath}; aborting to avoid a partial removal.`);
    process.exit(1);
  }

  // 1. Delete exactly the recorded skill files, then prune emptied dirs.
  for (const rel of manifest.files || []) {
    const full = path.resolve(targetDir, ...rel.split("/"));
    // Path safety: never delete outside the target, even if the manifest is tampered.
    if (full !== targetDir && !full.startsWith(targetDir + path.sep)) {
      console.warn(`Skipping manifest entry outside target: ${rel}`);
      continue;
    }
    if (fs.existsSync(full)) fs.rmSync(full);
    pruneEmptyDirs(path.dirname(full), claudeDir);
  }

  // 2. Strip the sentinel block from CLAUDE.md, preserving surrounding content.
  const claudeMd = path.join(targetDir, "CLAUDE.md");
  if (fs.existsSync(claudeMd)) {
    const { changed, content } = stripBlock(fs.readFileSync(claudeMd, "utf8"));
    if (changed) fs.writeFileSync(claudeMd, content);
  }

  // 3. Delete the manifest.
  fs.rmSync(manifestPath);

  console.log(`Removed ${(manifest.files || []).length} skill file(s) and the rules block from ${targetDir}`);
}

main();
