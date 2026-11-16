# OPE-2355: the live HTML view in the thread, Linux placement and macOS position

Read-only spike. This branch is never merged. Every number below was read at run time by the harness in `spikes/ope-2298-html-frame` and sits in the result file named beside it.

## Status of the runs

The result files committed here come from this machine, not from CI: macOS 27 locally, Linux in Docker (linux/arm64, Ubuntu 24.04, webkit2gtk 2.52.6, tauri 2.12.2). The `run.github_run_id` field of each file is null for that reason. The workflow `.github/workflows/spike-ope-2355.yml` has not run yet: the branch was not pushed by the agent that wrote this (see "Not done").

`results-macos-ci-in-thread.json` and every Windows file are still the OPE-2346 files, untouched.

## Linux: why the two webviews were 560 x 210

Cause, measured in `results-linux-in-thread.json` under `halved_views_cause`:

- The default vbox of the main window is a vertical `GtkBox`. Tauri builds every webview of a window into it: `tauri-runtime-wry 2.12.1 src/lib.rs:5171-5174` calls `build_gtk` on `window.default_vbox()` for a child webview, and `wry 0.57.0 src/webkitgtk/mod.rs:690-694` adds it with `pack_start(webview, true, true, 0)`.
- Two children packed with expand and fill share the height: main webview 560 x 210 at 0, 0, child webview 560 x 210 at 0, 210, window content 560 x 420. The widget tree with each allocation and each packing is in `halved_views_cause.measurement.widget_tree`.
- The child was never at 0, 0. `tauri::Webview::bounds` answers 560 x 210 at 0, 0 because `wry 0.57.0 src/webkitgtk/mod.rs:957-958` reads only `allocated_size` outside an X11 child window. GTK allocates the child at 0, 210, below the main webview.
- `set_bounds`, `set_position` and `set_size` change nothing: `wry 0.57.0 src/webkitgtk/mod.rs:963-984` acts only on an X11 child window or on a webview built in a `GtkFixed`.

None of the three suspects of the ticket is the runner: the cause and the table below are identical under Xvfb alone, Xvfb with openbox and headless weston.

## Linux: placements tried

Rectangle asked for in every row: 502 x 160 at 29, 57 (the placeholder). Read back from the GTK allocation translated to the window content. Window content 560 x 420.

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

**Possible in the thread, with GTK calls Tauri 2.12.2 does not make itself.** No Tauri API places the view. With the view widget moved into a `GtkFixed` over the main webview, on that same mount:

| Setup | File | Behaviours | Proofs | View drawn over its placeholder |
|---|---|---|---|---|
| Xvfb alone | `results-linux-in-thread.json` | 5 of 5 | 7 of 7 | yes, offset 0, 0 px, read from pixels |
| Xvfb + openbox | `results-linux-xvfb-openbox-in-thread.json` | 5 of 5 | 7 of 7 | yes, offset 0, 0 px, read from pixels |
| weston headless (Wayland) | `results-linux-weston-headless-in-thread.json` | 5 of 5 | 7 of 7 | not proven: no capture under Wayland |

Three Xvfb runs in Docker gave the same cause and the same table.

## macOS: where the view is drawn

Read from a capture of the window (`screencapture -l` on the window number), placeholder painted cyan, view painted magenta, in window points. File: `results-macos-in-thread.json`, `sightings`.

| Capture | Asked for | Placeholder drawn | View drawn | Vertical offset |
|---|---|---|---|---|
| as mounted, no correction | 502 x 160 at 29, 57 | 502 x 160 at 29, 89 | 502 x 160 at 29, 57 | -32 pt (view above its placeholder) |
| corrected | 502 x 160 at 29, 154 | 502 x 160 at 29, 154 | 502 x 160 at 29, 154 | 0 pt |

Captures: `capture-macos-in-thread-as-mounted-*.png`, `capture-macos-in-thread-corrected-*.png`.

What produces the 32 px, measured in `native_geometry`:

- The window has the full-size content view style. `tauri-runtime-wry 2.12.1 src/lib.rs:783` gives every window `TitleBarStyle::Visible`, and `src/lib.rs:1119-1123` turns that into `with_fullsize_content_view(true)`; `tao 0.37.1 src/platform_impl/macos/window.rs:242-243` sets the mask.
- So the content view and the main webview span the 420 pt of the window frame, the 32 pt title bar included. That is why the main webview bounds read 560 x 420.
- AppKit reports the title bar to the main webview as `safeAreaInsets.top` 32, and WKWebView lays the page out below it (`obscuredContentInsets.top` 32): viewport 388 pt, its origin 32 pt below the origin of the bounds.
- The child webview has `safeAreaInsets.top` 0 and is placed from the top of the content view (`wry 0.57.0 src/wkwebview/mod.rs:1031-1047`).

Correction: add the page origin, 0, 32, to every rectangle the page reports. The harness reads it from the pixels; a product would read `safeAreaInsets.top` of the main webview, which gives the same 32.

## macOS verdict

**In the thread, once the placement adds the 32 pt.** After the correction: 5 of 5 behaviours, 7 of 7 proofs, offset 0 pt. Three local runs gave the same verdict and the same offsets (-32 pt, then 0 pt).

The OPE-2346 green on macOS said the numbers matched; the view was in fact drawn 32 pt above its placeholder.

## Not proven

- Nothing here ran in CI. The macOS CI capture, and the Linux setups on the GitHub runner, wait for the first push.
- A real Linux desktop session: not reachable from this machine. Each Linux file says so under `display_setup.real_desktop_session`, with what was tried.
- The drawn position under Wayland: no capture is taken there, only the GTK allocations.
- Input through the `GtkOverlay` on Linux: the `GtkFixed` is pass-through, no click was sent to the view or to the main page under it.
- The 32 pt on macOS is the title bar of this window style on macOS 27. Fullscreen, another title bar style, or the window of `apps/app` were not measured: read the inset, do not hard-code it.
- Screen capture was allowed on this machine (`host_may_capture_the_screen` true), so the refusal path of the ticket was not taken.

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

## Not done

- **No push, no draft PR, no CI run.** The agent that wrote this works under a standing rule never to push. The title asked for is `chore(spike): place the live HTML view in the thread on Linux and prove its place on macOS (OPE-2355)`, and this file is written to be its body.
- So the committed result files are local runs, and the contract lines that need CI (two display setups in CI, the files of the last CI run, the macOS capture as an artifact) are open.
