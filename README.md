# Huntdeer

A low-poly 3D stealth game that flips the classic hunting game: **you're the deer**, and the hunters are the problem.

First target is iOS (iPhone and iPad) through Capacitor. The same build runs in any modern browser, with touch controls on phones.

## Play / develop

```bash
npm install
npm run dev           # local dev server (open the printed URL on your phone on the same Wi-Fi)
npm run build         # static site in dist/
npm run build:single  # everything inlined into dist-single/index.html
```

Dev shortcuts: `?map=jungle&animal=bear` jumps straight into a level (`?map=lodge&animal=moose` for the finale); `?unlock=all` unlocks everything.

## iOS (iPhone + iPad)

The Xcode project lives in `ios/` (Capacitor 8, Swift Package Manager, no CocoaPods needed). On a Mac with Xcode 16+:

```bash
npm install
npm run ios:sync      # build the web app and copy it into the Xcode project
npm run ios:open      # open in Xcode, pick your team under Signing, then Run
```

- Bundle id `com.abcleanonme.huntdeer`, universal (iPhone + iPad), iOS 15+, landscape only, full screen, status bar hidden.
- Save data is mirrored to native storage (`@capacitor/preferences`) so iOS can't wipe it; hits and pickups use haptics.
- Fonts are bundled, so the app works fully offline.
- `npm run icons` regenerates the app icon and splash from the in-game deer model (needs Playwright).

## Controls

| | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows | Left side of screen (floating stick) |
| Sprint (uses stamina) | Shift | Push the stick all the way |
| Look | Mouse | Drag on the right side |
| Jump | Space | JUMP |
| Ability | E | Big ability button |
| Boop (knock a hunter's hat off from behind, or boop a tree stand) | F | BOOP |
| Wear a hunter's orange (when you have one) | R | ORANGE |

## What's in the game

**Critters** (unlock with stars, up to 3 per map: finish, no hits, under par time)
- **Doug the Deer**: *Super Sniffer* shows every hunter (and every trap); passively pings nearby hunters.
- **Bun Jovi** (rabbit): *Mega Hop*. Small and hard to see.
- **Pepé Le Nope** (skunk): *Stink Bomb* makes hunters gag and wander off.
- **Bearnard** (bear): *Mighty Roar* knocks down nearby hunters. Tanky but very visible.
- **Sir Quacksalot** (duck): *Flap Away* flies over the trees, but shotgun hunters see ducks from miles away.
- **The Old Moose**: *Antler Charge*. Secret; free him at the end of the hidden campaign.

**Hunters.** Every hunter is rolled fresh: name, nickname, outfit colors, belly, height, temperament (stubborn, easily spooked, short fuse) and a bragging stat. About 1 in 20 wears a golden vest.
- **Bowhunter Bob**: silent, dodgeable arrows.
- **Rifle Randy**: long range, red laser while aiming, gunshots alert everyone. Brags about guns owned.
- **Shotgun Sheila**: short range spread; loves ducks.
- **E-Bike Brad**: fast, rams you, then has to do a lap to recharge.
- **Ghillie Gus**: a bush with eyes and a sniper rifle.
- **Cooler Carl**: brought a cooler. Wobbles, misses, naps. Boop him while he snores.
- **Trapper Tammy**: leaves snares everywhere. The deer can sniff them out.
- **Drone Dan**: sits in a lawn chair; his drone's spotlight calls in everyone else. Boop Dan and the drone crashes.
- **Houndsman Hank**: his beagle smells you through bushes, but not through water or skunk.
- **The Trophy King**: you'll see.

Some hunters climb tree stands: they see further and nap more, but nobody looks straight down. Boop the stand and they come down the fast way (half of them dropped a lunch, which heals a heart). Booped hunters sometimes drop their blaze orange: wear it and you're invisible to hunters, dogs and drones for about 20 seconds. You can carry one at a time.

Booped hunters drop their hat. Grab it and they go in the **Hunter Log** with weight, height, their bragging stat and a Doe & Crockett score. Easily spooked hunters run back to their trucks.

**Maps**
- **Whispering Pines** (forest): eat apples, escape through the fence.
- **Frostbite Forest** (arctic): find your 3 lost babies, lead them to the cave.
- **Bungle Jungle**: steal hunter hats, eat mangoes.
- **Soggy Bottom** (swamp, opening day of duck season): survive until sundown, steal hats.

**Hidden campaign.** Every map hides something that doesn't belong. Find it and a secret objective starts; finish it to add a page to the Case File. The four chapters lead to a fifth, hidden map and a boss fight. Spoilers in `src/data.ts`.

**Achievements**: 24, including a few secret ones.

## Code layout

- `src/data.ts`: all tunable content (animals, hunters, maps, secrets, achievements, quips).
- `src/game.ts`: one round: player, hunter AI, abilities, objectives, secrets, boss, camera.
- `src/hunters.ts`: hunter identities (names, looks, stats) and per-hunter state.
- `src/world.ts`: procedural map generation, collisions, line of sight.
- `src/models.ts`: procedural low-poly models (no asset files). `src/portraits.ts`: menu portraits.
- `src/hud.ts`, `src/ui.ts`: HUD and menus. `src/achievements.ts`: achievement rules. `src/save.ts`: progress.
- `src/native.ts`: Capacitor bits (haptics, status bar, native save). `src/input.ts`, `src/audio.ts`: input and synthesized SFX.
