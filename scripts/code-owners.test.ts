import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { findOwnedPaths } from "./code-owners"

const CODE_OWNERS = readFileSync(
	new URL("../.github/CODEOWNERS", import.meta.url),
	"utf8",
)

const CODE_OWNERS_CLI = fileURLToPath(
	new URL("./code-owners.ts", import.meta.url),
)

const PULL_REQUEST_2514_FILES = [
	"apps/app/src-tauri/src/hosting/tests.rs",
	"apps/app/src-tauri/src/library/comments/tests.rs",
	"apps/app/src-tauri/src/library/host.rs",
	"apps/app/src-tauri/src/library/host/tests.rs",
	"apps/app/src-tauri/src/library/mod.rs",
	"apps/app/src-tauri/src/library/tests.rs",
]

describe("findOwnedPaths on the .github/CODEOWNERS of this branch", () => {
	it("owns only the hosting test of PR #2514, through line 9", () => {
		expect(findOwnedPaths(CODE_OWNERS, PULL_REQUEST_2514_FILES)).toEqual([
			{
				path: "apps/app/src-tauri/src/hosting/tests.rs",
				line: 9,
				pattern: "/apps/app/src-tauri/src/hosting/",
			},
		])
	})

	it("owns a migrations.rs at any depth through the ** line", () => {
		expect(
			findOwnedPaths(CODE_OWNERS, [
				"apps/app/src-tauri/src/db/migrations.rs",
				"migrations.rs",
			]),
		).toEqual([
			{
				path: "apps/app/src-tauri/src/db/migrations.rs",
				line: 15,
				pattern: "**/migrations.rs",
			},
			{ path: "migrations.rs", line: 15, pattern: "**/migrations.rs" },
		])
	})

	it("owns the single-file entry host_api.rs and not its sibling host_api_other.rs", () => {
		expect(
			findOwnedPaths(CODE_OWNERS, [
				"apps/app/src-tauri/src/host_api.rs",
				"apps/app/src-tauri/src/host_api_other.rs",
			]),
		).toEqual([
			{
				path: "apps/app/src-tauri/src/host_api.rs",
				line: 8,
				pattern: "/apps/app/src-tauri/src/host_api.rs",
			},
		])
	})

	it("owns no path outside every CODEOWNERS line", () => {
		expect(
			findOwnedPaths(CODE_OWNERS, [
				"apps/app/src/components/thread-screen.tsx",
				"nested/.github/workflows/ci.yml",
			]),
		).toEqual([])
	})
})

describe("findOwnedPaths semantics", () => {
	it("anchors a leading slash at the repository root", () => {
		expect(
			findOwnedPaths("/docs/ @owner", ["docs/a.md", "apps/docs/a.md"]),
		).toEqual([{ path: "docs/a.md", line: 1, pattern: "/docs/" }])
	})

	it("matches a slashless pattern at any depth", () => {
		expect(
			findOwnedPaths("*.swift @owner", ["a.swift", "apps/ios/b.swift", "c.ts"]),
		).toEqual([
			{ path: "a.swift", line: 1, pattern: "*.swift" },
			{ path: "apps/ios/b.swift", line: 1, pattern: "*.swift" },
		])
	})

	it("matches everything below a directory with a trailing slash", () => {
		expect(
			findOwnedPaths("/apps/ @owner", ["apps/a/b/c.ts", "apps.ts"]),
		).toEqual([{ path: "apps/a/b/c.ts", line: 1, pattern: "/apps/" }])
	})

	it("keeps a single star inside one directory level", () => {
		expect(
			findOwnedPaths("/docs/* @owner", ["docs/a.md", "docs/deep/b.md"]),
		).toEqual([{ path: "docs/a.md", line: 1, pattern: "/docs/*" }])
	})

	it("matches any depth between two segments with **", () => {
		expect(
			findOwnedPaths("/apps/**/keys @owner", [
				"apps/keys/a",
				"apps/x/y/keys/b",
				"apps/keysmith/c",
			]),
		).toEqual([
			{ path: "apps/keys/a", line: 1, pattern: "/apps/**/keys" },
			{ path: "apps/x/y/keys/b", line: 1, pattern: "/apps/**/keys" },
		])
	})

	it("lets the last matching line win", () => {
		expect(
			findOwnedPaths("/apps/ @first\n/apps/ios/ @second", ["apps/ios/a"]),
		).toEqual([{ path: "apps/ios/a", line: 2, pattern: "/apps/ios/" }])
	})

	it("unowns a path whose last matching line names no owner", () => {
		expect(
			findOwnedPaths("/apps/ @owner\n/apps/public/\n/apps/inline/ # note", [
				"apps/public/a",
				"apps/inline/b",
				"apps/c",
			]),
		).toEqual([{ path: "apps/c", line: 1, pattern: "/apps/" }])
	})

	it("skips comments and blank lines when it counts line numbers", () => {
		expect(findOwnedPaths("# owners\n\n/apps/ @owner", ["apps/a"])).toEqual([
			{ path: "apps/a", line: 3, pattern: "/apps/" },
		])
	})
})

describe("bun scripts/code-owners.ts", () => {
	it("prints one line per owned path read on stdin", async () => {
		const running = Bun.spawn({
			cmd: [
				"bun",
				CODE_OWNERS_CLI,
				fileURLToPath(new URL("../.github/CODEOWNERS", import.meta.url)),
			],
			stdin: new TextEncoder().encode(
				`${PULL_REQUEST_2514_FILES.join("\n")}\n`,
			),
			stdout: "pipe",
			stderr: "pipe",
		})

		expect(await running.exited).toBe(0)
		expect(await new Response(running.stdout).text()).toBe(
			"apps/app/src-tauri/src/hosting/tests.rs is owned by CODEOWNERS line 9: /apps/app/src-tauri/src/hosting/\n",
		)
	})

	it("refuses to run without a CODEOWNERS file", async () => {
		const running = Bun.spawn({
			cmd: ["bun", CODE_OWNERS_CLI],
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		})

		expect(await running.exited).toBe(64)
		expect(await new Response(running.stderr).text()).toStartWith(
			"code-owners.ts: usage:",
		)
	})
})
