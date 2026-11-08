# Captures

## Scene baselines

`macos/` and `linux/` hold one PNG per registered scene and theme, `<scene id>-<light|dark>.png`, rendered at 2x. Scenes live in `src/scenes.rs` and in each surface module under `src/surfaces/`: `scenes::every_scene()`, the `SCENES` registry followed by every surface list `SURFACES` names, is the only list the harness reads.

`cargo test -p kiroshi-rune-kit --test scenes` renders every registered scene in both themes, headless, through Rune's own `--snap` path, and compares each image with the baseline of the platform it runs on, pixel for pixel. The test fails when:

- a pixel differs: the actual image and a diff image (differing pixels in red over a dimmed copy) land in `<platform>/failed/`, which git ignores;
- a registered scene has no baseline;
- a baseline names no registered scene.

`KIROSHI_BLESS=1 cargo test -p kiroshi-rune-kit --test scenes` rewrites the baselines of the platform it runs on instead of comparing.

A scene renders with the bundled Geist fonts only, font smoothing on, Tab visiting every control, and the clock at 2 s. A scene with `tabs` presses Tab that many times first, so its focus ring is the real keyboard one. A scene with `pointer` moves the real pointer onto or off an element one frame before the snap.

### One set per platform

macOS draws through Metal, Linux through Mesa's lavapipe (Vulkan on the CPU). The same scene differs between the two by at most 3/255 on about 1.4% of its pixels, on anti-aliased edges, so each platform keeps its own set. The Linux set comes from `ubuntu:24.04` on x86_64 with `mesa-vulkan-drivers`. The harness doesn't run on Windows, which has no set.

## Storybook references

The other PNGs here are Storybook captures (Chromium, 1180 px, 2x) of the stories a scene stands for, `<story id>-<light|dark>.png`. A story that renders one theme whatever the global, a dark-only story for one, has a single capture, in that theme. The harness doesn't read them.
