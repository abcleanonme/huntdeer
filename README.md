# Huntdeer 🦌

A goofy low-poly 3D stealth game that flips the classic hunting game: **you're the deer**, and the hunters are the problem.

Runs in any modern browser, including iPhone Safari (touch controls), and is built so it can later be wrapped for the App Store with Capacitor.

## Play / develop

```bash
npm install
npm run dev           # local dev server (open the printed URL on your phone on the same Wi-Fi)
npm run build         # static site in dist/ (GitHub Pages, Netlify, etc.)
npm run build:single  # everything inlined into dist-single/index.html
```

Dev shortcuts: `?map=jungle&animal=bear` jumps straight into a level; `?unlock=all` unlocks everything.

## Controls

| | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows | Left side of screen (floating stick) |
| Sprint (uses stamina) | Shift | Push the stick all the way |
| Look | Mouse | Drag on the right side |
| Jump | Space | JUMP |
| Ability | E | Big ability button |
| Boop (steal a hunter's hat from behind) | F | BOOP |

## What's in the prototype

**Critters** (unlock with stars, up to 3 per map: finish, no hits, under par time)
- **Doug the Deer**: *Super Sniffer* shows every hunter + their vision cones; passively pings nearby hunters.
- **Bun Jovi** (rabbit): *Mega Hop*. Small and hard to see.
- **Pepé Le Nope** (skunk): *Stink Bomb* makes hunters gag and wander off.
- **Bearnard** (bear): *Mighty Roar* knocks down nearby hunters. Tanky but very visible.
- **Sir Quacksalot** (duck): *Flap Away* flies over the trees, but shotgun hunters see ducks from miles away.

**Hunters**
- **Bowhunter Bob**: silent, dodgeable arrows.
- **Rifle Randy**: long range; red laser while aiming; gunshots alert other hunters.
- **Shotgun Sheila**: short range spread; loves ducks.
- **E-Bike Brad**: fast, rams you, then has to do a lap to recharge.
- **Ghillie Gus**: a bush with eyes and a sniper rifle. His laser is the only tell.

**Maps**
- **Whispering Pines** (forest): eat apples, escape through the fence.
- **Frostbite Forest** (arctic): find your 3 lost babies, lead them to the cave.
- **Bungle Jungle**: steal hunter hats, eat mangoes.
- **Soggy Bottom** (swamp, opening day of duck season): survive until sundown, steal hats.

Stealth rules: hunters have vision cones, can't see behind them, and are bad at bushes. Sprinting is loud. A `?` means suspicious, a `!` means you've been spotted.

## Code layout

- `src/data.ts`: all tunable content (animals, hunters, maps, quips).
- `src/game.ts`: one round: player, hunter AI, abilities, objectives, camera.
- `src/world.ts`: procedural map generation, collisions, line of sight.
- `src/models.ts`: procedural low-poly models (no asset files).
- `src/hud.ts`, `src/ui.ts`: HUD and menus. `src/input.ts`: keyboard/mouse/touch. `src/audio.ts`: synthesized SFX.
