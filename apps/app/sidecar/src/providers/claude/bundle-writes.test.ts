import { beforeAll, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { type BundleScope, isBundleWrite } from "./bundle-writes"

let bundle: string
let person: string
let space: string
let system: string
let outside: string
let scope: BundleScope

beforeAll(() => {
	const root = mkdtempSync(join(tmpdir(), "bundle-writes-"))
	bundle = join(root, "bots", "b1")
	person = join(root, "bots", "person")
	space = join(root, "spaces", "s1")
	system = join(root, "bots", "system")
	outside = join(root, "elsewhere")
	scope = { botPath: bundle, userPath: person, spacePath: space }
	mkdirSync(join(bundle, "skills", "brief"), { recursive: true })
	mkdirSync(join(person, "notes"), { recursive: true })
	mkdirSync(join(space, "notes"), { recursive: true })
	mkdirSync(join(system, "skills"), { recursive: true })
	mkdirSync(outside, { recursive: true })
	writeFileSync(join(outside, "notes.md"), "")
	symlinkSync(outside, join(bundle, "away"))
})

const writes = (path: string, tool = "Write") =>
	isBundleWrite(scope, tool, { file_path: path })

describe("isBundleWrite", () => {
	it("owns what the bot writes in its own bundle", () => {
		expect(writes(join(bundle, "skills", "brief", "SKILL.md"))).toBe(true)
		expect(writes(join(bundle, "skills", "new", "SKILL.md"), "Edit")).toBe(true)
	})

	it("owns the agent file the learn skill rewrites", () => {
		expect(writes(join(bundle, "agents", "agent.md"))).toBe(true)
		expect(writes(join(bundle, "agents", "agent.md"), "Edit")).toBe(true)
	})

	it("asks for every other path under the agents directory", () => {
		for (const path of [
			join(bundle, "agents", "bean.md"),
			join(bundle, "agents", "nested", "agent.md"),
			join(person, "agents", "agent.md"),
			join(space, "agents", "agent.md"),
		]) {
			expect(writes(path)).toBe(false)
		}
	})

	it("owns the documents the bot files in the person and space bundles", () => {
		expect(writes(join(person, "notes", "reader.md"))).toBe(true)
		expect(writes(join(space, "notes", "clinic.md"), "Edit")).toBe(true)
	})

	it("asks before writing anywhere in the system plugin", () => {
		expect(writes(join(system, "skills", "brief", "SKILL.md"))).toBe(false)
		expect(writes(join(system, "notes.md"))).toBe(false)
	})

	it("holds the reserved entries of the person and space bundles", () => {
		expect(writes(join(person, "settings.json"))).toBe(false)
		expect(writes(join(space, ".mcp.json"))).toBe(false)
		expect(writes(join(space, ".applications.json"))).toBe(false)
		expect(writes(join(space, ".applications.json"), "Edit")).toBe(false)
		expect(writes(join(person, ".applications.json"))).toBe(false)
		expect(writes(join(person, ".applications.json"), "Edit")).toBe(false)
		expect(writes(join(person, "notes", "reader.sh"))).toBe(false)
	})

	it("leaves the bundle's own entries to the reader", () => {
		for (const reserved of [
			join(bundle, ".claude-plugin", "plugin.json"),
			join(bundle, "hooks", "hooks.json"),
			join(bundle, ".git", "config"),
			join(bundle, ".mcp.json"),
			join(bundle, ".applications.json"),
			join(bundle, "settings.json"),
			bundle,
		]) {
			expect(writes(reserved)).toBe(false)
			expect(writes(reserved, "Edit")).toBe(false)
		}
	})

	it("leaves a file the bot could later run to the reader", () => {
		for (const name of [
			"setup.sh",
			"setup.bash",
			"setup.zsh",
			"setup.command",
			"setup.py",
			"setup.rb",
			"setup.pl",
			"setup.js",
			"setup.mjs",
			"setup.cjs",
			"setup.ts",
			"setup.applescript",
			"setup.SH",
			"setup.Py",
			"setup",
		]) {
			expect(writes(join(bundle, "skills", "brief", name))).toBe(false)
		}
	})

	it("owns the files the bot reads as instructions", () => {
		for (const name of [
			"brief.md",
			"brief.txt",
			"brief.json",
			"brief.yaml",
			"brief.yml",
			"brief.toml",
			"brief.MD",
		]) {
			expect(writes(join(bundle, "skills", "brief", name))).toBe(true)
		}
	})

	it("asks for a path that only looks like it is inside", () => {
		expect(writes(join(bundle, "..", "b2", "skills", "SKILL.md"))).toBe(false)
		expect(writes(join(bundle, "away", "notes.md"))).toBe(false)
		expect(writes(join(outside, "notes.md"))).toBe(false)
		expect(writes("skills/brief/SKILL.md")).toBe(false)
	})

	it("asks for every other tool, and for a session with no bundle", () => {
		expect(writes(join(bundle, "skills", "brief", "SKILL.md"), "Bash")).toBe(
			false,
		)
		expect(writes(join(bundle, "skills", "brief", "SKILL.md"), "Read")).toBe(
			false,
		)
		expect(
			isBundleWrite({}, "Write", {
				file_path: join(bundle, "skills", "brief", "SKILL.md"),
			}),
		).toBe(false)
		expect(isBundleWrite(scope, "Write", {})).toBe(false)
	})
})
