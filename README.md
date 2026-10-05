# TOWER DEFENSE: REFORGED

Version: R48 / 1.1.0 / 2026-10-05

## Run / deploy

This is the complete static game. Keep index.html at the deployment root and
preserve the images/, audio/ and vendor/ directories. Serve this directory with
any static HTTP server or upload the ZIP to the original VK/OK publishing flow.
No npm install, compilation, framework or asset build is required at runtime.
The platform adapter retains the original launch-parameter detection. A local
web launch is not a substitute for a real platform advertisement/cloud test.

## Controls

Choose a tower, then tap/click a highlighted build anchor. Select a built tower
to upgrade or sell it. The two upgrade branches are mutually exclusive.
Use the spell cards, wave preparation controls, pause and the 1x/2x speed button.
HQ contains permanent upgrades, arsenal, magic, chronicles and bestiary.
Short viewports use scrollable panels; the battlefield is never stretched.

## Graphics

Settings contains LOW / MEDIUM / HIGH, automatic overload reduction, reduced
motion, camera impulses and damage numbers. These settings never change enemy
HP, damage, rewards or wave rules. Important attack and boss warnings remain
visible at every quality. System fonts cover Cyrillic and Latin without downloads.
Walk cadence follows actual travelled distance, including slow and haste.
Decorative echoes/foreground reduce first under load; walk and warnings stay.
A bounded exact-pixel atlas-tile cache avoids repeated large-atlas transforms;
its additional RGBA surface budget is capped at 22 MiB and fills on demand.
Visual settings use td_reforged_visual_v1 independently of the original schema-9
progress save. Original save migration, backup recovery and platform sync remain.

## Source layout

index.html: entry point, DOM, original platform adapter.
game.js: game simulation, progression, save and UI controllers.
game.css: retained supporting UI and story styling.
reforged.js: presentation events, animation, pooled VFX, world ambience, quality,
            camera and bounded procedural audio; driven by the existing loop.
reforged-motion.js: authored gait, boss signature and environment profiles.
reforged.css: menu, battle, responsive panels, HQ, typography and motion.
game-data.js / story-data.js: unchanged original content and balance data.
images/: retained static art and maps, revised 12-column enemy atlases, and
          twelve 12-frame boss motion atlases derived from the supplied art.
audio/: unchanged original four music tracks.
vendor/: unchanged original VK bootstrap.

No runtime dependency was added. QA runners, screenshots, Inspector, Toolbox,
original backups and development workspaces are deliberately not in this ZIP.
Original asset ownership/provenance is inherited from the supplied project;
this release does not assert a new third-party asset licence.
