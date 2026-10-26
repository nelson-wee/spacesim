# Art data

The visual design comes from Claude Design. The brief (§18) says to load art, effects, icons, and palette from data files.

| File | Source | Content |
|---|---|---|
| `ships.yaml` | Claude Design (ship art v0.1). **Source of truth. Do not edit by hand.** | Battle art and portraits for each hull: glyphs, role codes, damaged and critical art, flicker cells, portrait slot marks. Also mirror swaps, damage rule, damage steps, surrender marker. |
| `ships.json` | Generated from `ships.yaml` by `npm run import-art` | The same content, in the form that the game loads. A unit test fails if it does not match `ships.yaml`. |
| `style.json` | Claude Design. **Do not edit by hand.** | Cell size and font, named colors, side and role colors, security, threat band, commodity tiers, tech levels, heat bar, frames. |
| `icons.json` | Placeholder (M1) | Map glyphs. Replace when Claude Design gives icons. |
| `effects.json` | Placeholder (M1) | Combat effects. Replace when Claude Design gives effects (M4). |

## Change the art

1. Put the new `ships.yaml` or `style.json` from Claude Design here.
2. Run `npm run import-art` (for `ships.yaml`).
3. Run `npm test`. The tests check the structure, the Code Page 437 glyphs, and the links to `hulls.json` and `style.json`.
4. In a development build, open the debug panel (F12 or `` ` ``) and press `7` to see all ship art.

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
