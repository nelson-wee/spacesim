// Converts data/art/ships.yaml (Claude Design output) into data/art/ships.json.
// Run after each change to ships.yaml: npm run import-art
// A unit test fails if ships.json does not match ships.yaml.
import { readFileSync, writeFileSync } from 'node:fs';
import { shipArtJson } from './lib/shipArt';

const source = 'data/art/ships.yaml';
const target = 'data/art/ships.json';
const json = shipArtJson(readFileSync(source, 'utf8'));
writeFileSync(target, json);
const count = Object.keys(JSON.parse(json).ships).length;
console.log(`${target}: ${count} ships from ${source}`);
