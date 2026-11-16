# OPE-2355: the live HTML view in the thread, Linux placement and macOS position

Read-only spike. This branch is never merged. Every number below was read at run time by the harness in `spikes/ope-2298-html-frame` and sits in the result file named beside it.

## Status of the runs

**CI run 43949657800**, workflow `Spike OPE-2355`, draft PR #2500, head `27a5aa732`: four jobs, four green. Every file below whose `run.github_run_id` is `43949657800` comes from it.

| File | Origin | Runner | Verdict in the file |
|---|---|---|---|
| `results-linux-in-thread.json` | CI | ubuntu-26.04, Xvfb alone | in-thread |
| `results-linux-xvfb-openbox-in-thread.json` | CI | ubuntu-26.04, Xvfb + openbox | in-thread |
| `results-linux-weston-headless-in-thread.json` | CI | ubuntu-26.04, weston headless | in-thread |
| `results-macos-ci-in-thread.json` | CI | macos-26-arm64 | **separate-window-only** |
| `results-macos-local-in-thread.json` | local, `run.github_run_id` null | macOS 27, this machine | in-thread |

- The CI macOS file replaces the OPE-2346 file of the same name.
- The CI macOS verdict differs from the local one. The job is green because the harness ran to its end; the verdict it wrote is `separate-window-only`. See "CI against local".
- The local macOS file was `results-macos-in-thread.json` and is renamed, with its four captures (`capture-macos-local-in-thread-*.png`). Inside the file the captures still carry the names the run gave them, `capture-macos-in-thread-*.png`: the file is not edited by hand.
- The local Docker Linux files are dropped: the CI files of the same three setups take their names. They stay in the history at `bf2d47188`. Their `display_setup.real_desktop_session` named the GitHub runner before any CI run had happened; the CI files state it while running on it.
- Local runs came from the code one commit before `27a5aa732` (the `simplify:` commit); the CI run is the first harness run of `27a5aa732` itself.
- Every Windows file is still the OPE-2346 file, untouched.

## Linux: why the two webviews were 560 x 210

From CI run 43949657800, `results-linux-in-thread.json`, `halved_views_cause`. Identical in the local Docker runs.

- The default vbox of the main window is a vertical `GtkBox`. Tauri builds every webview of a window into it: `tauri-runtime-wry 2.12.1 src/lib.rs:5171-5174` calls `build_gtk` on `window.default_vbox()` for a child webview, and `wry 0.57.0 src/webkitgtk/mod.rs:690-694` adds it with `pack_start(webview, true, true, 0)`.
- Two children packed with expand and fill share the height: main webview 560 x 210 at 0, 0, child webview 560 x 210 at 0, 210, window content 560 x 420. The widget tree with each allocation and each packing is in `halved_views_cause.measurement.widget_tree`.
- The child was never at 0, 0. `tauri::Webview::bounds` answers 560 x 210 at 0, 0 because `wry 0.57.0 src/webkitgtk/mod.rs:957-958` reads only `allocated_size` outside an X11 child window. GTK allocates the child at 0, 210, below the main webview.
- `set_bounds`, `set_position` and `set_size` change nothing: `wry 0.57.0 src/webkitgtk/mod.rs:963-984` acts only on an X11 child window or on a webview built in a `GtkFixed`.

The runner setup is not the cause: the cause and the table below are identical under the three display setups, in CI and locally.

## Linux: placements tried

From CI run 43949657800. Rectangle asked for in every row: 502 x 160 at 29, 57 (the placeholder). Read back from the GTK allocation translated to the window content. Window content 560 x 420.

| Placement | Webview | View read back | Main webview read back | Xvfb | Xvfb + openbox | weston headless |
|---|---|---|---|---|---|---|
| `tauri-window-add-child` | Tauri | 560 x 210 at 0, 210 | 560 x 210 at 0, 0 | fails | fails | fails |
| `tauri-webview-set-bounds` | Tauri | 560 x 210 at 0, 210 | 560 x 210 at 0, 0 | fails | fails | fails |
| `tauri-webview-set-position-and-size` | Tauri | 560 x 210 at 0, 210 | 560 x 210 at 0, 0 | fails | fails | fails |
| `gtk-fixed-over-the-main-webview` | Tauri | 502 x 160 at 29, 57 | 560 x 420 at 0, 0 | holds | holds | holds |
| `gtk-overlay-margins` | Tauri | 502 x 160 at 29, 57 | 560 x 420 at 0, 0 | holds | holds | holds |
| `wry-build-gtk-in-a-fixed` | wry alone | 502 x 160 at 29, 57 | 560 x 420 at 0, 0 | holds | holds | holds |
| `wry-build-as-child` | wry alone | 502 x 160 at 29, 57 | 560 x 420 at 0, 0 | holds | holds | fails: "the window handle kind is not supported" (X11 only) |

The two GTK rows keep the webview Tauri manages: `tauri::Webview::with_webview` gives its widget, the main webview moves from the vbox into a `GtkOverlay` packed in its place, and the view is laid over it, in a pass-through `GtkFixed` or directly with margins. The two wry rows build a webview outside the Tauri runtime: no guard, no capability, no proof can be played on them.

## Linux verdict

**Possible in the thread, with GTK calls Tauri 2.12.2 does not make itself.** No Tauri API places the view. With the view widget moved into a `GtkFixed` over the main webview, on that same mount, in CI run 43949657800:

| Setup | File | Behaviours | Proofs | View drawn over its placeholder |
|---|---|---|---|---|
| Xvfb alone | `results-linux-in-thread.json` | 5 of 5 | 7 of 7 | yes, offset 0, 0 px, read from pixels |
| Xvfb + openbox | `results-linux-xvfb-openbox-in-thread.json` | 5 of 5 | 7 of 7 | yes, offset 0, 0 px, read from pixels |
| weston headless (Wayland) | `results-linux-weston-headless-in-thread.json` | 5 of 5 | 7 of 7 | not proven: no capture under Wayland |

Locally, three Xvfb runs in Docker gave the same cause and the same table as each other and as CI.

## macOS: where the view is drawn

Read from a capture of the window (`screencapture -l` on the window number), placeholder painted cyan, view painted magenta, in window points. `sightings` of each file.

| Run | Capture | Asked for | Placeholder drawn | Magenta drawn | Offset | Magenta size minus placeholder size |
|---|---|---|---|---|---|---|
| CI 43949657800 | as mounted | 485 x 160 at 29, 57 | 485 x 160 at 29, 89 | 468 x 143 at 29, 57 | 0, -32 pt | -17, -17 |
| CI 43949657800 | corrected | 485 x 160 at 29, 154 | 485 x 160 at 29, 154 | 468 x 143 at 29, 154 | 0, 0 pt | -17, -17 |
| local | as mounted | 502 x 160 at 29, 57 | 502 x 160 at 29, 89 | 502 x 160 at 29, 57 | 0, -32 pt | 0, 0 |
| local | corrected | 502 x 160 at 29, 154 | 502 x 160 at 29, 154 | 502 x 160 at 29, 154 | 0, 0 pt | 0, 0 |

The offset is the same in both: the view is drawn 32 pt above its placeholder as mounted, and on it once corrected.

What produces the 32 px, measured in `native_geometry`, same values in CI and locally:

- The window has the full-size content view style. `tauri-runtime-wry 2.12.1 src/lib.rs:783` gives every window `TitleBarStyle::Visible`, and `src/lib.rs:1119-1123` turns that into `with_fullsize_content_view(true)`; `tao 0.37.1 src/platform_impl/macos/window.rs:242-243` sets the mask.
- So the content view and the main webview span the 420 pt of the window frame, the 32 pt title bar included. That is why the main webview bounds read 560 x 420.
- AppKit reports the title bar to the main webview as `safeAreaInsets.top` 32, and WKWebView lays the page out below it (`obscuredContentInsets.top` 32): viewport 388 pt, its origin 32 pt below the origin of the bounds.
- The child webview has `safeAreaInsets.top` 0 and is placed from the top of the content view (`wry 0.57.0 src/wkwebview/mod.rs:1031-1047`).

Correction: add the page origin, 0, 32, to every rectangle the page reports. The harness reads it from the pixels; a product would read `safeAreaInsets.top` of the main webview, which gives the same 32.

## macOS verdict

**Split: `separate-window-only` in CI, `in-thread` locally.** In both, after the correction: offset 0 pt, 5 of 5 behaviours, 7 of 7 proofs, child webview bounds read back equal to the rectangle asked for. The CI file fails one rule only: `view_drawn_over_its_placeholder` is false, because the magenta box is 17 pt narrower and 17 pt shorter than the placeholder.

The rule was not changed. The reason for the 17 pt is read from the CI captures by eye, not by the harness: `capture-macos-ci-in-thread-corrected-magenta.png` shows a vertical and a horizontal scrollbar of the view on the right and bottom edges of the placeholder rectangle, around the magenta. The paint is a fixed element covering the viewport of the view document, which excludes its scrollbars. On the CI runner scrollbars always take space: the main page loses the same 17 pt (placeholder 485 wide in CI, 502 locally). Locally scrollbars overlay and the paint covers the whole view.

So in CI the top-left corner of the view is proven on its placeholder, and its right and bottom edges are not proven by pixels. Whether the paint should hide the scrollbars of the view while it measures is a decision for the reviewer: it would change what the CI file says, and needs a new run.

The OPE-2346 green on macOS said the numbers matched; the view was in fact drawn 32 pt above its placeholder, in CI and locally.

## CI against local

| Setup | Value | CI 43949657800 | Local |
|---|---|---|---|
| macOS | verdict | `separate-window-only` | `in-thread` |
| macOS | `view_drawn_over_its_placeholder` | false | true |
| macOS | magenta box, corrected | 468 x 143 at 29, 154 | 502 x 160 at 29, 154 |
| macOS | placeholder and rectangle asked, as mounted | 485 x 160 at 29, 57 | 502 x 160 at 29, 57 |
| macOS | pixels per point | 1 | 2 |
| macOS | webview | 21624.5.1.11.3 (macos-26-arm64) | 22625.1.29.11.28 (macOS 27) |
| macOS | offset as mounted, then corrected | 0, -32 then 0, 0 | 0, -32 then 0, 0 |
| macOS | behaviours, proofs | 5 of 5, 7 of 7 | 5 of 5, 7 of 7 |
| Linux, three setups | verdict, every placement row, behaviours, proofs, offsets | same as local | same as CI |
| Linux, weston | message of the refused capture | `import: unable to open X server` | `import-im6.q16: unable to open X server` |
| Linux | image | ubuntu-26.04, webkit2gtk 2.52.6 | Ubuntu 24.04 in Docker linux/arm64, webkit2gtk 2.52.6 |

No job was red, so no fix was committed for this run.

## Not proven

From neither CI nor local runs:

- A real Linux desktop session. Each CI Linux file says so under `display_setup.real_desktop_session`, with what was tried.
- The drawn position under Wayland: no capture is taken there, only the GTK allocations (CI and local).
- Input through the `GtkOverlay` on Linux: the `GtkFixed` is pass-through, no click was sent to the view or to the main page under it.
- The 32 pt on macOS in fullscreen, with another title bar style, or in the window of `apps/app`: read the inset, do not hard-code it.
- The refusal path of the capture: it was allowed locally and on the CI runner (`host_may_capture_the_screen` true in both).

From CI only:

- The right and bottom edges of the view on macOS (see "macOS verdict"). Proven locally, on a display where scrollbars overlay.

From local runs only, never in CI:

- Determinism: three macOS runs and three Xvfb runs gave identical results locally. CI ran each setup once.
- A macOS run with the magenta covering the whole view (`results-macos-local-in-thread.json`).

## Decisions taken alone

The full list is the `decisions` array of each result file. The ones that change how to read the files:

- The five behaviours are played once per run, after the correction, not before and after.
- On macOS the capture targets the window by its number. A region capture photographed the window of another session running the same harness at the same place on this screen.
- Green was dropped as a paint: the zoom button of the title bar is green.
- On Linux the views of the whole scenario are mounted with the first placement that held on a webview Tauri manages (the `GtkFixed`), so the seven proofs run on that mount.
- On Linux the mount is judged against the window content read from GTK: under Wayland tao counts the client-side decorations in the inner size (612 x 509 for a 560 x 420 content).
- `gtk` and `wry` (Linux), `objc2` and `objc2-foundation` (macOS) are now direct dependencies, at the versions already in the lock. No package entered the lock.
- The workflow plays the in-thread mode only, on macOS and Linux. Windows and the window-sandboxed mode are left out.
- `results-linux-in-thread.json` is the Xvfb alone setup; the other setups carry their name in the file name.
- The CI macOS verdict is recorded as the harness wrote it. No rule, paint or file was altered after the run.
