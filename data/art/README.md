# Art data

The visual design comes from Claude Design. The brief (§18) says to load art, effects, icons, and palette from data files.

| File | Source | Content |
|---|---|---|
| `ships.yaml` | Claude Design (ship art v0.1). **Source of truth. Do not edit by hand.** | Battle art and portraits for each hull: glyphs, role codes, damaged and critical art, flicker cells, portrait slot marks. Also mirror swaps, damage rule, damage steps, surrender marker. |
| `ships.json` | Generated from `ships.yaml` by `npm run import-art` | The same content, in the form that the game loads. A unit test fails if it does not match `ships.yaml`. |
| `style.json` | Claude Design. **Do not edit by hand.** | Cell size and font, named colors (also weapon and effect colors), side and role colors, security, threat band, commodity tiers, tech levels, heat bar, frames. |
| `modules.json` | Claude Design (module icons). **Do not edit by hand.** | Icon for each module: family mark, two glyphs, color, default size. Module states (on, off, cannot fire, no ammunition). Family colors. The game loads it as is. Icons for weapons that come in M3 are already in the file. |
| `effects.yaml` | Claude Design (combat effects v0.1). **Source of truth. Do not edit by hand.** | Frames for each combat effect (shots, hits, shields, explosions, reinforcements, flee, surrender), line sets, patterns, the effect queue (1.2 s budget, `Space` skips), effect colors. |
| `effects.json` | Generated from `effects.yaml` by `npm run import-art` | The same content, in the form that the game loads. A unit test fails if it does not match `effects.yaml`. M4 plays the effects. |
| `icons.json` | Placeholder (M1) | Map glyphs. Replace when Claude Design gives map icons. |

## Change the art

1. Put the new file from Claude Design here (`ships.yaml`, `effects.yaml`, `modules.json`, or `style.json`).
2. Run `npm run import-art` (for `ships.yaml` and `effects.yaml`).
3. Run `npm test`. The tests check the structure, the Code Page 437 glyphs, and the links to `hulls.json`, `modules.json` (game data), and `style.json`. The colors that `modules.json` and `effects.yaml` repeat must agree with `style.json`.
4. In a development build, open the debug panel (F12 or `` ` ``) and press `7` to see all ship art. The last page shows the module icons.

## Role codes (ship art)

| Code | Part | Color (style.json `roles`) |
|---|---|---|
| `h` | Hull | side color |
| `a` | Armor, frame | side Deep |
| `b` | Bridge | `hi` |
| `e` | Engine | `engine` (`engineOff` when OFF) |
| `w` | Weapon | side Bright |
| `s` | Shield | `shield` |
| `c` | Cargo | side Deep |
| `r` | Reactor | `reactor` |

Hot ships use `hot` on `h` and `a` cells (`roles.hot_tint`).
