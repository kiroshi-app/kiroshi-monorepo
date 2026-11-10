import { afterAll, describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { packageOf, signatureIn, updaterFeed } from "./updater-feed"

const read = (path: string) =>
	readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

const RELEASE = read(".github/workflows/release.yml")

const releasedPlatforms = () => {
	const line = RELEASE.split("\n")
		.map((text) => text.trim())
		.find((text) => text.startsWith("UPDATER_PLATFORMS:"))
	if (!line) throw new Error("release.yml names no UPDATER_PLATFORMS")
	return line.slice("UPDATER_PLATFORMS:".length).trim().split(/\s+/).sort()
}

const scratch = mkdtempSync(join(tmpdir(), "kiroshi-updater-feed-test-"))

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const A_FEED = {
	tag: "v0.28.0-beta.1",
	repository: "kiroshi-app/kiroshi-monorepo",
	notes: "Notes of the release",
	pubDate: "2026-11-10T00:00:00.000Z",
	signatureOf: (file: string) => `signature of ${file}`,
}

describe("the updater feed", () => {
	it("lists exactly the updater platforms release.yml checks before publishing", () => {
		expect(Object.keys(updaterFeed(A_FEED).platforms).sort()).toEqual(
			releasedPlatforms(),
		)
	})

	it("carries the version of the tag without its v, its notes and its date", () => {
		const feed = updaterFeed(A_FEED)

		expect(feed.version).toBe("0.28.0-beta.1")
		expect(feed.notes).toBe("Notes of the release")
		expect(feed.pub_date).toBe("2026-11-10T00:00:00.000Z")
	})

	it("points every platform at the signed Rune package attached to the tag", () => {
		const { platforms } = updaterFeed(A_FEED)
		const download =
			"https://github.com/kiroshi-app/kiroshi-monorepo/releases/download/v0.28.0-beta.1"

		expect(platforms["darwin-aarch64"]).toEqual({
			url: `${download}/Kiroshi_0.28.0-beta.1_aarch64.app.tar.gz`,
			signature: "signature of Kiroshi_0.28.0-beta.1_aarch64.app.tar.gz",
		})
		expect(platforms["darwin-x86_64-app"]?.url).toBe(
			`${download}/Kiroshi_0.28.0-beta.1_x86_64.app.tar.gz`,
		)
		expect(platforms["linux-x86_64-deb"]?.url).toBe(
			`${download}/Kiroshi_0.28.0-beta.1_amd64.deb`,
		)
		expect(platforms["windows-x86_64-nsis"]?.url).toBe(
			`${download}/Kiroshi_0.28.0-beta.1_x64-setup.exe`,
		)
	})

	it("holds the fields of the feed the installed updater reads", () => {
		const stable = JSON.parse(
			read("crates/kiroshi-core/tests/fixtures/stable-latest.json"),
		)
		const feed = updaterFeed(A_FEED)

		expect(Object.keys(feed).sort()).toEqual(Object.keys(stable).sort())
		for (const artifact of Object.values(feed.platforms))
			expect(Object.keys(artifact).sort()).toEqual(["signature", "url"])
	})

	it.each([
		["package-macos.sh", "Kiroshi_${VERSION}_${TRIPLE%%-*}.app.tar.gz"],
		["package-linux.sh", "Kiroshi_${VERSION}_amd64.deb"],
		["package-windows.sh", "Kiroshi_${VERSION}_x64-setup.exe"],
	])("names the package %s writes", (script, written) => {
		expect(read(`apps/rune-preview/scripts/${script}`)).toContain(written)
		const named = Object.values(packageOf("${VERSION}")).map((file) =>
			file.replace(/_(aarch64|x86_64)\.app/, "_${TRIPLE%%-*}.app"),
		)
		expect(named).toContain(written)
	})

	it("reads each signature from the .sig the updater key wrote beside the package", () => {
		writeFileSync(join(scratch, "Kiroshi_1.0.0_amd64.deb.sig"), "c2lnbmVk\n")

		expect(signatureIn(scratch)("Kiroshi_1.0.0_amd64.deb")).toBe("c2lnbmVk")
	})

	it("refuses a package with no signature, naming it", () => {
		expect(() => signatureIn(scratch)("Kiroshi_1.0.0_x64-setup.exe")).toThrow(
			"no updater signature Kiroshi_1.0.0_x64-setup.exe.sig",
		)
	})
})
