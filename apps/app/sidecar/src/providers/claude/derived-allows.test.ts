import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, matchesGlob } from "node:path"

import type { Settings } from "@anthropic-ai/claude-agent-sdk"

import { claudeSourceExecutable } from "./build"
import { isBundleWrite } from "./bundle-writes"
import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import type { Servers } from "./server-env"
import { buildOptions } from "./session"

import type { SessionRequest } from "../provider"

process.env[EXECUTABLE_OVERRIDE_ENV] = claudeSourceExecutable()

const RESERVED = [
	"agents",
	".claude-plugin",
	"hooks",
	".git",
	".mcp.json",
	".applications.json",
	"settings.json",
]

const PROBED_NAMES = ["agent.md", "notes.md", "plugin.json", "SKILL.md"]

const server = { type: "http" as const, url: "https://example.test/mcp" }

let root: string
let bot: string
let user: string
let space: string

beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "kiroshi-allows-")))
	bot = join(root, "bots", "b1")
	user = join(root, "user")
	space = join(root, "spaces", "s1")
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

const requestFor = (overrides: Partial<SessionRequest> = {}): SessionRequest =>
	({
		cwd: "/tmp",
		partialMessages: true,
		pluginPath: bot,
		userPluginPath: user,
		spacePluginPath: space,
		agent: "bean",
		identity: "You are Bean.",
		...overrides,
	}) as SessionRequest

const allowsOf = (request: SessionRequest, servers: Servers = {}): string[] => {
	const options = buildOptions(request, undefined, undefined, {
		servers,
		rejections: [],
	})
	return (options.settings as Settings).permissions?.allow ?? []
}

const editPatterns = (allows: string[]): string[] =>
	allows
		.filter((rule) => rule.startsWith("Edit("))
		.map((rule) => rule.slice("Edit(/".length, -1))

const matchedBy = (patterns: string[], path: string): boolean =>
	patterns.some((pattern) => matchesGlob(path, pattern))

type EditVerdict = "allowed" | "refused" | "unmatched"

const claudeCodeVerdict = (patterns: string[], path: string): EditVerdict => {
	if (lstatSync(path).isSymbolicLink()) {
		return "refused"
	}
	const spellings = [path, realpathSync(path)]
	return spellings.every((spelling) => matchedBy(patterns, spelling))
		? "allowed"
		: "unmatched"
}

const placeFile = (path: string) => {
	mkdirSync(join(path, ".."), { recursive: true })
	writeFileSync(path, "")
}

describe("derived allows", () => {
	it("allows the kiroshi server and every resolved server, one rule each", () => {
		const allows = allowsOf(requestFor(), {
			kiroshi: server,
			superset: server,
			linear: server,
			paper: server,
		})

		expect(allows.filter((rule) => rule.startsWith("mcp__"))).toEqual([
			"mcp__kiroshi",
			"mcp__superset",
			"mcp__linear",
			"mcp__paper",
		])
	})

	it("normalizes a server name the way Claude Code prefixes its tools", () => {
		const allows = allowsOf(requestFor(), {
			"design.files v2": server,
			"claude.ai Google Drive": server,
		})

		expect(allows).toContain("mcp__design_files_v2")
		expect(allows).toContain("mcp__claude_ai_Google_Drive")
	})

	it("emits no per-tool MCP rule and no Bash rule", () => {
		const allows = allowsOf(requestFor(), { linear: server })

		expect(
			allows.filter(
				(rule) => /^mcp__[^_]+__/.test(rule) || rule.startsWith("Bash"),
			),
		).toEqual([])
	})

	it("covers the bot's agent file, its skills and the shared top-level documents", () => {
		const patterns = editPatterns(allowsOf(requestFor()))

		for (const path of [
			join(bot, "agents", "agent.md"),
			join(bot, "skills", "brief", "SKILL.md"),
			join(bot, "skills", "brief", "references", "notes.json"),
			join(bot, "notes.md"),
			join(user, "profile.md"),
			join(user, "skills", "SKILL.md"),
			join(space, "README.md"),
			join(space, "skills", "deep", "plan.yaml"),
		]) {
			expect(matchedBy(patterns, path)).toBe(true)
		}
	})

	it("leaves every reserved entry of every bundle unmatched", () => {
		const scope = { botPath: bot, userPath: user, spacePath: space }
		const patterns = editPatterns(allowsOf(requestFor()))
		const probes = [bot, user, space].flatMap((bundle) =>
			RESERVED.flatMap((entry) => [
				join(bundle, entry),
				...PROBED_NAMES.map((name) => join(bundle, entry, name)),
			]),
		)
		const ownAgentFile = join(bot, "agents", "agent.md")

		for (const path of probes.filter((probe) => probe !== ownAgentFile)) {
			expect({ path, matched: matchedBy(patterns, path) }).toEqual({
				path,
				matched: false,
			})
		}
		for (const path of probes.filter((probe) => matchedBy(patterns, probe))) {
			expect(isBundleWrite(scope, "Edit", { file_path: path })).toBe(true)
		}
	})

	it("never allows a write through a bundle symlink whose real path leaves the bundle", () => {
		const scope = { botPath: bot, userPath: user, spacePath: space }
		const outside = join(root, "outside")
		placeFile(join(outside, "SKILL.md"))
		placeFile(join(outside, "notes.md"))
		placeFile(join(bot, "skills", "brief", "SKILL.md"))
		symlinkSync(outside, join(bot, "skills", "escape"))
		symlinkSync(join(bot, "skills", "brief"), join(bot, "skills", "alias"))
		symlinkSync(join(outside, "notes.md"), join(bot, "notes.md"))
		const patterns = editPatterns(allowsOf(requestFor()))
		const escaping = join(bot, "skills", "escape", "SKILL.md")
		const aliased = join(bot, "skills", "alias", "SKILL.md")
		const linkedDocument = join(bot, "notes.md")

		for (const path of [escaping, aliased, linkedDocument]) {
			expect(matchedBy(patterns, path)).toBe(true)
		}
		expect(isBundleWrite(scope, "Edit", { file_path: escaping })).toBe(false)
		expect(claudeCodeVerdict(patterns, escaping)).toBe("unmatched")
		expect(isBundleWrite(scope, "Edit", { file_path: linkedDocument })).toBe(
			false,
		)
		expect(claudeCodeVerdict(patterns, linkedDocument)).toBe("refused")
		expect(isBundleWrite(scope, "Edit", { file_path: aliased })).toBe(true)
		expect(claudeCodeVerdict(patterns, aliased)).toBe("allowed")
	})

	it("keeps the declared rules, a deny on AskUserQuestion among them, beside the derived allows", () => {
		const settingsPath = join(root, "settings.json")
		writeFileSync(
			settingsPath,
			JSON.stringify({
				permissions: {
					allow: ["Read(**)"],
					ask: ["WebFetch"],
					deny: ["AskUserQuestion", "mcp__kiroshi__mission_escalate"],
				},
			}),
		)

		const options = buildOptions(requestFor({ settingsPath }), undefined)
		const permissions = (options.settings as Settings).permissions

		expect(permissions?.deny).toEqual([
			"AskUserQuestion",
			"mcp__kiroshi__mission_escalate",
		])
		expect(permissions?.ask).toEqual(["WebFetch"])
		expect(permissions?.allow?.slice(0, 2)).toEqual([
			"Read(**)",
			"mcp__kiroshi",
		])
	})

	it("derives no allow for a session without a plugin path", () => {
		const request = requestFor({ pluginPath: undefined })

		expect(allowsOf(request, { linear: server })).toEqual([])
		expect(
			(buildOptions(request, undefined).settings as Settings).permissions,
		).toEqual({ disableBypassPermissionsMode: "disable" })
	})
})
