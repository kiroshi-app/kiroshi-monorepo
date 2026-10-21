import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Settings } from "@anthropic-ai/claude-agent-sdk"

import { claudeSourceExecutable } from "./build"
import { BUNDLE_WRITE_TOOL_NAME } from "./bundle-tools"
import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { KIROSHI_SERVER } from "./kiroshi-server"
import type { Servers } from "./server-env"
import { buildOptions } from "./session"

import type { SessionRequest } from "../provider"

process.env[EXECUTABLE_OVERRIDE_ENV] = claudeSourceExecutable()

const server = { type: "http" as const, url: "https://example.test/mcp" }

let root: string

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "kiroshi-allows-"))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

const requestFor = (overrides: Partial<SessionRequest> = {}): SessionRequest =>
	({
		cwd: "/tmp",
		partialMessages: true,
		pluginPath: join(root, "bots", "b1"),
		userPluginPath: join(root, "user"),
		spacePluginPath: join(root, "spaces", "s1"),
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

const servedBy = (rule: string, toolName: string): boolean =>
	rule === toolName || toolName.startsWith(`${rule.replace(/__\*$/, "")}__`)

const settled = (permissions: Settings["permissions"], toolName: string) => {
	const matched = (rules: string[] = []) =>
		rules.some((rule) => servedBy(rule, toolName))
	if (matched(permissions?.deny)) {
		return "deny"
	}
	if (matched(permissions?.ask)) {
		return "ask"
	}
	return matched(permissions?.allow) ? "allow" : "classifier"
}

describe("derived allows", () => {
	it("allows the kiroshi server and every resolved server, one rule each", () => {
		const allows = allowsOf(requestFor(), {
			kiroshi: server,
			superset: server,
			linear: server,
			paper: server,
		})

		expect(allows).toEqual([
			"mcp__kiroshi",
			"mcp__superset",
			"mcp__linear",
			"mcp__paper",
		])
	})

	it("settles a bundle_write call as allow by a rule, before any classifier step", () => {
		const options = buildOptions(requestFor(), undefined, undefined, {
			servers: { kiroshi: server },
			rejections: [],
		})
		const permissions = (options.settings as Settings).permissions

		expect(
			settled(permissions, `mcp__${KIROSHI_SERVER}__${BUNDLE_WRITE_TOOL_NAME}`),
		).toBe("allow")
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

	it("derives no Edit or Write rule for any bundle path", () => {
		const allows = allowsOf(requestFor(), { linear: server })

		expect(
			allows.filter(
				(rule) => rule.startsWith("Edit") || rule.startsWith("Write"),
			),
		).toEqual([])
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
		expect(permissions?.allow).toEqual(["Read(**)", "mcp__kiroshi"])
	})

	it("derives no allow for a session without a plugin path", () => {
		const request = requestFor({ pluginPath: undefined })

		expect(allowsOf(request, { linear: server })).toEqual([])
		expect(
			(buildOptions(request, undefined).settings as Settings).permissions,
		).toEqual({ disableBypassPermissionsMode: "disable" })
	})
})
