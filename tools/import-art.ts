// Converts the Claude Design YAML files into the JSON files that the game loads:
// data/art/ships.yaml -> ships.json, data/art/effects.yaml -> effects.json.
// Run after each change to a YAML file: npm run import-art
// A unit test fails if a JSON file does not match its YAML file.
import { readFileSync, writeFileSync } from 'node:fs';
import { effectsJson } from './lib/effectsArt';
import { shipArtJson } from './lib/shipArt';

const ships = shipArtJson(readFileSync('data/art/ships.yaml', 'utf8'));
writeFileSync('data/art/ships.json', ships);
console.log(`data/art/ships.json: ${Object.keys(JSON.parse(ships).ships).length} ships from data/art/ships.yaml`);

const effects = effectsJson(readFileSync('data/art/effects.yaml', 'utf8'));
writeFileSync('data/art/effects.json', effects);
console.log(`data/art/effects.json: ${Object.keys(JSON.parse(effects).effects).length} effects from data/art/effects.yaml`);
