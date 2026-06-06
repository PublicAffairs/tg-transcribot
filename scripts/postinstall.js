/**
 * Postinstall script: patches the installed mux.js package to fix two known bugs
 * that produce unplayable fragmented-MP4 output from raw AAC (ADTS) streams.
 *
 * Bug reference: https://github.com/videojs/mux.js/issues/436
 *
 * Patches applied:
 *  1. mp4-generator.js – mvhd(0xffffffff) → mvhd(0)
 *  2. mp4-generator.js – track.duration || 0xffffffff → track.duration
 *  3. transmuxer.js    – audioTrack = audioTrack || { ... } → add id: 1
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Locate the mux.js package root relative to this repo's node_modules
const muxRoot = path.resolve(__dirname, '..', 'node_modules', 'mux.js');

if (!fs.existsSync(muxRoot)) {
  console.log('[postinstall] mux.js not found in node_modules, skipping patch.');
  process.exit(0);
}

const targets = [
  {
    file: path.join(muxRoot, 'cjs', 'mp4', 'mp4-generator.js'),
    replacements: [
      { from: 'mvhd(0xffffffff)', to: 'mvhd(0)' },
      { from: 'track.duration = track.duration || 0xffffffff;', to: 'track.duration = track.duration;' }
    ]
  },
  {
    file: path.join(muxRoot, 'cjs', 'mp4', 'transmuxer.js'),
    replacements: [
      {
        from: 'audioTrack = audioTrack || {',
        to: 'audioTrack = audioTrack || {\n        id: 1,'
      }
    ]
  },
  {
    file: path.join(muxRoot, 'es', 'mp4', 'mp4-generator.js'),
    replacements: [
      { from: 'mvhd(0xffffffff)', to: 'mvhd(0)' },
      { from: 'track.duration = track.duration || 0xffffffff;', to: 'track.duration = track.duration;' }
    ]
  },
  {
    file: path.join(muxRoot, 'es', 'mp4', 'transmuxer.js'),
    replacements: [
      {
        from: 'audioTrack = audioTrack || {',
        to: 'audioTrack = audioTrack || {\n        id: 1,'
      }
    ]
  },
  {
    file: path.join(muxRoot, 'lib', 'mp4', 'mp4-generator.js'),
    replacements: [
      { from: 'mvhd(0xffffffff)', to: 'mvhd(0)' },
      { from: 'track.duration = track.duration || 0xffffffff;', to: 'track.duration = track.duration;' }
    ]
  },
  {
    file: path.join(muxRoot, 'lib', 'mp4', 'transmuxer.js'),
    replacements: [
      {
        from: 'audioTrack = audioTrack || {',
        to: 'audioTrack = audioTrack || {\n        id: 1,'
      }
    ]
  }
];

let patchCount = 0;

for (const target of targets) {
  if (!fs.existsSync(target.file)) continue;

  let content = fs.readFileSync(target.file, 'utf8');
  let changed = false;

  for (const rep of target.replacements) {
    if (content.includes(rep.from)) {
      content = content.replace(rep.from, rep.to);
      changed = true;
      patchCount++;
    }
  }

  if (changed) {
    fs.writeFileSync(target.file, content, 'utf8');
    const rel = path.relative(muxRoot, target.file);
    console.log(`[postinstall] Patched mux.js/${rel}`);
  }
}

if (patchCount === 0) {
  console.log('[postinstall] mux.js already patched or patterns not found, nothing to do.');
} else {
  console.log(`[postinstall] mux.js patched successfully (${patchCount} replacements).`);
}
