@AGENTS.md

## Disk space
`src-tauri/target/debug` grew to 58 GB and filled the disk. Keep it small: after any long cargo session, or if `target` is over ~10 GB, delete `src-tauri/target/debug` (it is only a cache). Do not run extra `cargo build`/`test` variants or `--features` combos needlessly, since each creates its own artifacts. Check `target` size before starting a big build.
