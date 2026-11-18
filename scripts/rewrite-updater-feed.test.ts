import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const REWRITE_UPDATER_FEED = fileURLToPath(
	new URL("./rewrite-updater-feed.sh", import.meta.url),
)

const REPOSITORY = "kiroshi-app/kiroshi-monorepo"

const RELEASE_ID = "450437780"

const TAG = "v0.27.0"

const API_ASSET = `https://api.github.com/repos/${REPOSITORY}/releases/assets`

const DOWNLOAD = `https://github.com/${REPOSITORY}/releases/download/${TAG}`

const STUB_GH = `#!/bin/bash
set -euo pipefail
filter=
endpoint=
previous=
for argument in "$@"; do
	if [ "$previous" = "--jq" ]; then
		filter=$argument
	elif [[ $argument == repos/* ]]; then
		endpoint=$argument
	fi
	previous=$argument
done
case "$endpoint" in
*/assets\\?*) jq -c "$filter" "$GH_STUB/assets.json" ;;
*) jq -r "$filter" "$GH_STUB/release.json" ;;
esac
`

type Asset = { id: number; name: string }

const ASSETS: Asset[] = [
	{ id: 764713809, name: "Kiroshi_0.27.0_aarch64.app.tar.gz" },
	{ id: 764714581, name: "Kiroshi_0.27.0_aarch64.app.tar.gz.sig" },
	{ id: 764713232, name: "Kiroshi_0.27.0_aarch64.dmg" },
	{ id: 764678160, name: "Kiroshi_0.27.0_amd64.deb" },
	{ id: 764678540, name: "Kiroshi_0.27.0_amd64.deb.sig" },
	{ id: 764727448, name: "Kiroshi_0.27.0_x64-setup.exe" },
	{ id: 764727952, name: "Kiroshi_0.27.0_x64-setup.exe.sig" },
	{ id: 764760153, name: "Kiroshi_0.27.0_x64.app.tar.gz" },
	{ id: 764760672, name: "Kiroshi_0.27.0_x64.app.tar.gz.sig" },
	{ id: 764760851, name: "latest.json" },
]

const ASSET_OF_PLATFORM: Record<string, Asset> = {
	"linux-x86_64": { id: 764678160, name: "Kiroshi_0.27.0_amd64.deb" },
	"linux-x86_64-deb": { id: 764678160, name: "Kiroshi_0.27.0_amd64.deb" },
	"darwin-aarch64": {
		id: 764713809,
		name: "Kiroshi_0.27.0_aarch64.app.tar.gz",
	},
	"darwin-aarch64-app": {
		id: 764713809,
		name: "Kiroshi_0.27.0_aarch64.app.tar.gz",
	},
	"windows-x86_64": { id: 764727448, name: "Kiroshi_0.27.0_x64-setup.exe" },
	"windows-x86_64-nsis": {
		id: 764727448,
		name: "Kiroshi_0.27.0_x64-setup.exe",
	},
	"darwin-x86_64": { id: 764760153, name: "Kiroshi_0.27.0_x64.app.tar.gz" },
	"darwin-x86_64-app": {
		id: 764760153,
		name: "Kiroshi_0.27.0_x64.app.tar.gz",
	},
}

type Platform = { signature: string; url: string }

type Feed = {
	version: string
	notes: string
	pub_date: string
	platforms: Record<string, Platform>
}

const signatureOf = (platform: string) =>
	Buffer.from(
		`untrusted comment: signature from tauri secret key\nRUQ${platform}==\ntrusted comment: timestamp:1795030372\tfile:Kiroshi.app.tar.gz\tversion:0.27.0\nsig/${platform}+=\n`,
	).toString("base64")

const feedWith = (urlOf: (platform: string, asset: Asset) => string): Feed => ({
	version: "0.27.0",
	notes:
		'### Features\n\n- **app**: "quoted" & <angled> café 🚀 \\ backslash\n- **ui**: tab\tseparated',
	pub_date: "2026-11-18T19:48:43.872Z",
	platforms: Object.fromEntries(
		Object.entries(ASSET_OF_PLATFORM).map(([platform, asset]) => [
			platform,
			{ signature: signatureOf(platform), url: urlOf(platform, asset) },
		]),
	),
})

const API_FEED = feedWith((_, { id }) => `${API_ASSET}/${id}`)

const DOWNLOAD_FEED = feedWith((_, { name }) => `${DOWNLOAD}/${name}`)

const asTauriActionWritesIt = (feed: Feed) => JSON.stringify(feed, null, 2)

let stub: string

const runRewrite = async (feed: string, assets: Asset[] = ASSETS) => {
	writeFileSync(join(stub, "latest.json"), feed)
	writeFileSync(join(stub, "assets.json"), JSON.stringify(assets))
	writeFileSync(
		join(stub, "release.json"),
		JSON.stringify({ id: Number(RELEASE_ID), tag_name: TAG }),
	)
	const running = Bun.spawn({
		cmd: [
			REWRITE_UPDATER_FEED,
			REPOSITORY,
			RELEASE_ID,
			join(stub, "latest.json"),
		],
		env: {
			...process.env,
			GH_STUB: stub,
			PATH: `${join(stub, "bin")}:${process.env.PATH}`,
		},
		stdout: "pipe",
		stderr: "pipe",
	})
	return {
		exitCode: await running.exited,
		stdout: await new Response(running.stdout).text(),
		stderr: await new Response(running.stderr).text(),
	}
}

beforeEach(() => {
	stub = mkdtempSync(join(tmpdir(), "kiroshi-rewrite-updater-feed-stub-"))
	mkdirSync(join(stub, "bin"))
	writeFileSync(join(stub, "bin", "gh"), STUB_GH)
	chmodSync(join(stub, "bin", "gh"), 0o755)
})

afterEach(() => {
	rmSync(stub, { recursive: true, force: true })
})

describe("scripts/rewrite-updater-feed.sh", () => {
	it("points every platform of the eight at the download address of its asset on the release tag", async () => {
		const result = await runRewrite(asTauriActionWritesIt(API_FEED))

		expect(result.exitCode).toBe(0)
		expect(result.stderr).toBe("")
		const urls = Object.entries(
			(JSON.parse(result.stdout) as Feed).platforms,
		).map(([platform, { url }]) => [platform, url])
		expect(urls).toEqual(
			Object.entries(ASSET_OF_PLATFORM).map(([platform, { name }]) => [
				platform,
				`${DOWNLOAD}/${name}`,
			]),
		)
	})

	it("keeps every byte of the feed outside the platform urls", async () => {
		const result = await runRewrite(asTauriActionWritesIt(API_FEED))

		expect(result.stdout).toBe(asTauriActionWritesIt(DOWNLOAD_FEED))
	})

	it("leaves a feed already on the download addresses unchanged", async () => {
		const result = await runRewrite(asTauriActionWritesIt(DOWNLOAD_FEED))

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe(asTauriActionWritesIt(DOWNLOAD_FEED))
	})

	it("fails naming the platform and the asset when an asset id is absent from the release, printing no feed", async () => {
		const result = await runRewrite(
			asTauriActionWritesIt(API_FEED),
			ASSETS.filter(({ id }) => id !== 764713809),
		)

		expect(result.exitCode).toBe(1)
		expect(result.stdout).toBe("")
		expect(result.stderr).toBe(
			`rewrite-updater-feed.sh: release ${TAG} has no asset for: platform darwin-aarch64 names asset ${API_ASSET}/764713809; platform darwin-aarch64-app names asset ${API_ASSET}/764713809\n`,
		)
	})

	it("fails naming the platform when a download address names an asset absent from the release", async () => {
		const result = await runRewrite(
			asTauriActionWritesIt(DOWNLOAD_FEED),
			ASSETS.filter(({ name }) => name !== "Kiroshi_0.27.0_x64-setup.exe"),
		)

		expect(result.exitCode).toBe(1)
		expect(result.stdout).toBe("")
		expect(result.stderr).toContain(
			`platform windows-x86_64 names asset ${DOWNLOAD}/Kiroshi_0.27.0_x64-setup.exe`,
		)
		expect(result.stderr).toContain(
			`platform windows-x86_64-nsis names asset ${DOWNLOAD}/Kiroshi_0.27.0_x64-setup.exe`,
		)
	})

	it("fails on a url outside the release, whatever its host", async () => {
		const feed = feedWith((platform, { id }) =>
			platform === "linux-x86_64"
				? `https://example.test/${id}`
				: `${API_ASSET}/${id}`,
		)

		const result = await runRewrite(asTauriActionWritesIt(feed))

		expect(result.exitCode).toBe(1)
		expect(result.stderr).toContain(
			"platform linux-x86_64 names asset https://example.test/764678160",
		)
	})
})
