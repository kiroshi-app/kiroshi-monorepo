export const GIT_CLIFF_BODY_0_24_2 = `### Features

- **ui**: add report sections and a diagnostics settings tab (OPE-936)
- **ui**: add the what's new dialog and its five states (OPE-939)
- **src-tauri**: stable or beta update channel, manual check, update state and release notes (OPE-941)
- **ui**: add the About tab to the user Settings dialog (OPE-938)
- **ci**: publish v*-beta.N tags as pre-releases with a fixed beta feed and git-cliff notes (OPE-940)
- **src-tauri**: write a bounded scrubbed log file with diagnostics commands (OPE-935)
- **app**: wire the About tab and the what's new dialog on the Rust updater (OPE-942)
- **app**: fill failure reports with specs, context and log tail (OPE-937)
- **ui**: add the copy and reveal diagnostics failure strings (OPE-952)
- **website**: name account sessions from browser and os (OPE-949)
- **app**: declare the bot permission modes once for Rust and the sidecar (OPE-688)
- **ui**: read the bot permission modes from the shared source (OPE-695)
- **app**: name the mission's Space in the run driver's failures (OPE-961)

### Fixes

- **ios**: say your computer and the model provider in every iPhone string (OPE-894)
- **ci**: keep ios off v* tags and have release wait on the tag's own CI run (OPE-908)
- **src-tauri**: remove the two rust test flakes on main and the release tag (OPE-905)
- **ci**: publish the release once every desktop job is green (OPE-914)
- **src-tauri**: reconnect on relay close 4005 on the host and member sockets (OPE-928)
- **ios**: reconnect the relay socket on close code 4005 (OPE-929)
- **website**: sign the browser out after approving a computer on /authorize (OPE-948)
- **ci**: build the website with build:website on every packages/ui change (OPE-945)
- **app**: give the diagnostics copy and reveal failures their own titles (OPE-953)
- **website**: send the bearer on every relay call except get-session (OPE-930)
- **app**: skip the dev invoke tally when Tauri seals invoke
- **ci**: run the rust jobs on a packages/shared edit (OPE-955)
- **ci**: run storybook and website on a packages/shared edit (OPE-958)
- **app**: keep local mission runs alive on a joined space (OPE-956)
- **app**: keep the mission run driver off joined hosts and log each failure with its cause (OPE-957)
- **app**: quiet joined host outages and format every failure body (OPE-962)
- **ui**: key each loose pinned run in PinnedZone (OPE-963)
- **app**: leave the relay membership before dropping a joined space (OPE-965)
- **app**: read routine run events from the app relay, in emit order, and fail a run on a dropped frame (OPE-964)

### Tests

- **ios**: reach the Safari view through the app between legal links (OPE-909)
- **app**: read scoped runtime events from the relay, not a tauri listener (OPE-915)

### Chores

- **deps**: dedupe katex, catalog vite, move shadcn to devDeps (OPE-689)
`
