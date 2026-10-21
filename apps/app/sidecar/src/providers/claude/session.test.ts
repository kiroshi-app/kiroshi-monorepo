import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { query, type Settings } from "@anthropic-ai/claude-agent-sdk"

import { claudeSourceExecutable } from "./build"
import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { KIROSHI_SERVER } from "./kiroshi-server"
import { createMissionStatusReminder } from "./mission-status-reminder"
import {
	type ConnectPass,
	type ConnectPort,
	POLL_BUDGET_MS,
	type ServerStatus,
} from "./server-connect"
import { AWAITING_AUTH, leftOut } from "./server-env"
import type { RenewedGrant } from "./server-renewal"
import {
	buildOptions,
	declaredServers,
	dialledServers,
	reportConnections,
	stopTurn,
} from "./session"
import { CLASSIFY_ASK_USER_QUESTION, CONNECTION_KEYS } from "./session-env"
import {
	AUTHORIZE_LINE,
	bundleLine,
	KIROSHI_LAYER,
	layerFor,
	leftOutLine,
	skillLine,
	spaceLine,
	unavailableServersSection,
	userLine,
} from "./system-layer"

import type { ServerEnv, SessionFrame, SessionRequest } from "../provider"

const settingsOf = (options: ReturnType<typeof buildOptions>): Settings =>
	options.settings as Settings

process.env[EXECUTABLE_OVERRIDE_ENV] = claudeSourceExecutable()

const identity = "You are Bean, the baker."

const systemBundle = new URL(
	"../../../../src-tauri/plugins/kiroshi",
	import.meta.url,
).pathname

const request = {
	cwd: "/tmp",
	partialMessages: true,
	pluginPath: "/bots/b1",
	agent: "bean",
	identity,
}

const SECRET = "sk-live-secret-value"

const secretServers = {
	servers: { clock: { command: "run", env: { TOKEN: SECRET } } },
	rejections: [],
}

const mcpConfig = {
	path: "/var/folders/xy/T/kiroshi-mcp-test/mcp.json",
	resolvedPath: "/private/var/folders/xy/T/kiroshi-mcp-test/mcp.json",
}

const rejectedDetails = [
	'the server "clock" was left out: TOKEN is defined by no scope',
	'the server "probe" was left out: RUNNER is defined by no scope',
]

const rejections = rejectedDetails.map(leftOutLine)

const appended = (options: ReturnType<typeof buildOptions>): string =>
	(options.systemPrompt as { append: string }).append

const spawns: SessionRequest[] = [
	request,
	{ ...request, resume: "s1" },
	{ cwd: "/tmp", partialMessages: false },
]

describe("buildOptions", () => {
	it("asks for the structured answer with the schema it was given", () => {
		const schema = {
			type: "object",
			properties: { outcome: { enum: ["ok", "nothing"] } },
			required: ["outcome"],
		}

		const options = buildOptions(
			{ ...request, outputSchema: schema },
			undefined,
		)

		expect(options.outputFormat).toEqual({ type: "json_schema", schema })
		expect((options.outputFormat as { schema: unknown }).schema).toBe(schema)
	})

	it("passes one Stop hook and no other event to a mission thread", () => {
		const stop = createMissionStatusReminder().stop

		const options = buildOptions(
			{ ...request, missionThread: true },
			undefined,
			undefined,
			undefined,
			stop,
		)

		expect(options.hooks).toEqual({ Stop: [{ hooks: [stop] }] })
	})

	it("passes no hooks to a session outside a mission thread", () => {
		const stop = createMissionStatusReminder().stop

		for (const missionThread of [undefined, false]) {
			expect(
				buildOptions(
					{ ...request, missionThread },
					undefined,
					undefined,
					undefined,
					stop,
				).hooks,
			).toBeUndefined()
		}
	})

	it("asks for no structured answer when none was requested", () => {
		for (const spawned of spawns) {
			expect(buildOptions(spawned, undefined).outputFormat).toBeUndefined()
		}
	})

	it("loads the bot's bundle as a local plugin and promotes its agent", () => {
		const options = buildOptions(request, undefined)

		expect(options.plugins).toEqual([{ type: "local", path: "/bots/b1" }])
		expect(options.agent).toBe("bean")
	})

	it("appends the layer to the preset on every spawn, bundled or not", () => {
		for (const spawned of spawns) {
			expect(buildOptions(spawned, undefined).systemPrompt).toEqual({
				type: "preset",
				preset: "claude_code",
				append: layerFor(spawned),
			})
		}
	})

	it("names the bot's own directory under the layer, and only with a bundle", () => {
		expect(layerFor({ pluginPath: "/bots/b1" })).toBe(
			`${KIROSHI_LAYER}\n\n${bundleLine("/bots/b1")}`,
		)
		expect(bundleLine("/bots/b1")).toContain("/bots/b1")
		expect(layerFor({})).toBe(KIROSHI_LAYER)
	})

	it("opens every session in auto mode, bundled or not", () => {
		for (const spawned of spawns) {
			expect(buildOptions(spawned, undefined).permissionMode).toBe("auto")
		}
	})

	it("opens on the settings file the host names, mode and rules at once", () => {
		const bundle = mkdtempSync(join(tmpdir(), "kiroshi-settings-"))
		const settingsPath = join(bundle, "settings.json")
		writeFileSync(
			settingsPath,
			JSON.stringify({
				permissions: { allow: ["Read(**)"], defaultMode: "acceptEdits" },
				outputStyle: "default",
			}),
		)

		const options = buildOptions({ ...request, settingsPath }, undefined)

		expect(options.permissionMode).toBe("acceptEdits")
		expect(settingsOf(options)).toEqual({
			permissions: {
				allow: expect.arrayContaining(["Read(**)"]),
				disableBypassPermissionsMode: "disable",
			},
			outputStyle: "default",
		})
		expect(options.settingSources).toEqual([])

		rmSync(bundle, { recursive: true, force: true })
	})

	it("turns off auto mode's classifier, so a question reaches the host", () => {
		for (const spawned of spawns) {
			expect(
				buildOptions(spawned, undefined).env?.[CLASSIFY_ASK_USER_QUESTION],
			).toBe("0")
		}
	})

	it("bounds no MCP timeout of the CLI from the session options", () => {
		for (const spawned of spawns) {
			const env = buildOptions(spawned, undefined).env ?? {}

			expect(env.MCP_TIMEOUT).toBeUndefined()
			expect(env.MCP_CONNECT_TIMEOUT_MS).toBeUndefined()
			expect(env.MCP_TOOL_TIMEOUT).toBeUndefined()
		}
	})

	it("hands the session an allowlist, not the sidecar's whole environment", () => {
		process.env.KIROSHI_SECRET_TOKEN = "leaked"

		const env = buildOptions(request, undefined).env ?? {}
		delete process.env.KIROSHI_SECRET_TOKEN

		expect(env.KIROSHI_SECRET_TOKEN).toBeUndefined()
		expect(env.PATH).toBe(process.env.PATH)
		expect(env[EXECUTABLE_OVERRIDE_ENV]).toBe(claudeSourceExecutable())
	})

	it("hands the agent the held source of the connection field alone", () => {
		const connection = { CLAUDE_CODE_OAUTH_TOKEN: "stored-token" }
		const serverEnv = { base: { LINEAR_KEY: "lin" } }

		const env =
			buildOptions({ ...request, connection, serverEnv }, undefined).env ?? {}

		expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("stored-token")
		expect(env.LINEAR_KEY).toBeUndefined()
	})

	it("hands the agent neither name when the base carries both and no source is held", () => {
		const serverEnv = {
			base: {
				ANTHROPIC_API_KEY: "sk-from-the-base",
				CLAUDE_CODE_OAUTH_TOKEN: "token-from-the-base",
			},
		}

		const env = buildOptions({ ...request, serverEnv }, undefined).env ?? {}

		for (const key of CONNECTION_KEYS) {
			expect(env).not.toHaveProperty(key)
		}
	})

	it("hands the agent no connection name while none is held", () => {
		const env = buildOptions(request, undefined).env ?? {}

		for (const key of CONNECTION_KEYS) {
			expect(env).not.toHaveProperty(key)
		}
	})

	it("names no tool in the layer, so it grants no capability", () => {
		for (const tool of ["Bash", "Edit", "Grep", "Glob", "Task", "WebFetch"]) {
			expect(KIROSHI_LAYER).not.toContain(tool)
		}
	})

	it("places the bot in Kiroshi and points its learning at the History", () => {
		expect(KIROSHI_LAYER).toContain("Kiroshi, a desktop app")
		expect(KIROSHI_LAYER).toContain("one of them")
		expect(KIROSHI_LAYER).toContain("one of your skills")
		expect(KIROSHI_LAYER).toContain("your History")
	})

	it("has the bot look for a path before it declines, without agreeing to please", () => {
		expect(KIROSHI_LAYER).toContain("closest workable path")
		expect(KIROSHI_LAYER).toContain("what you can do instead")
		expect(KIROSHI_LAYER).toContain("never agree just to please")
		expect(KIROSHI_LAYER).toContain("never claim a capability you do not have")
	})

	it("passes the output style the host names, and locks bypass out either way", () => {
		expect(
			settingsOf(
				buildOptions({ ...request, outputStyle: "Concise" }, undefined),
			),
		).toEqual({
			permissions: {
				allow: expect.any(Array),
				disableBypassPermissionsMode: "disable",
			},
			outputStyle: "Concise",
		})
		expect(settingsOf(buildOptions(request, undefined))).toEqual({
			permissions: {
				allow: expect.any(Array),
				disableBypassPermissionsMode: "disable",
			},
		})
	})

	it("pins the floor to the policy tier, above what a bot may declare", () => {
		const options = buildOptions(
			{ ...request, appDataDir: "/app-data/kiroshi" },
			undefined,
		)
		const floor = options.managedSettings

		expect(floor?.permissions?.deny).toContain(
			"Read(//app-data/kiroshi/conversations.sqlite3)",
		)
		expect(floor?.sandbox?.enabled).toBe(true)
		expect(floor?.sandbox?.filesystem?.denyRead).toContain(
			"/app-data/kiroshi/bots",
		)
		expect(floor?.sandbox?.filesystem?.allowRead).toEqual(["/bots/b1"])
	})

	it("carries the bundle again on a resume, since neither option is sticky", () => {
		const options = buildOptions({ ...request, resume: "s1" }, undefined)

		expect(options.resume).toBe("s1")
		expect(options.plugins).toEqual([{ type: "local", path: "/bots/b1" }])
		expect(options.agent).toBe("bean")
	})

	it("names no model, so the bundle's own key is what the child answers under", () => {
		for (const spawned of [request, { cwd: "/tmp", partialMessages: false }]) {
			expect(buildOptions(spawned, undefined).model).toBeUndefined()
		}
	})

	it("reads no settings on disk and no MCP configuration it was not given", () => {
		for (const spawned of [request, { cwd: "/tmp", partialMessages: false }]) {
			const options = buildOptions(spawned, undefined)

			expect(options.settingSources).toEqual([])
			expect(options.strictMcpConfig).toBe(true)
		}
	})

	it("hands over the servers the bundle declares", () => {
		expect(
			Object.keys(buildOptions(request, undefined).mcpServers ?? {}),
		).toEqual([KIROSHI_SERVER])
	})

	it("leaves an unbundled session without a server or a routine of any kind", () => {
		const options = buildOptions(
			{ cwd: "/tmp", partialMessages: false },
			undefined,
		)

		expect(options.mcpServers).toBeUndefined()
		expect(appended(options)).not.toContain("routine_create")
	})

	it("carries the routines skill of the system bundle into a bundled session", () => {
		const options = buildOptions(
			{ ...request, systemPluginPath: systemBundle },
			undefined,
		)

		expect(Object.keys(options.mcpServers ?? {})).toContain(KIROSHI_SERVER)
		expect(appended(options)).toContain("routine_create")
	})

	it("denies the asynchronous agent tools on every spawn", () => {
		for (const spawned of spawns) {
			const floor = buildOptions(spawned, undefined).managedSettings
			expect(floor?.permissions?.deny).toContain("Agent")
			expect(floor?.permissions?.deny).toContain("Task")
		}
	})

	it("loads the app's plugin beside the bot's when the host names one", () => {
		const options = buildOptions(
			{
				...request,
				systemPluginPath: "/app/system",
				userPluginPath: "/user/me",
				spacePluginPath: "/spaces/s1",
			},
			undefined,
		)

		expect(options.plugins).toEqual([
			{ type: "local", path: "/bots/b1" },
			{ type: "local", path: "/app/system" },
			{ type: "local", path: "/user/me" },
			{ type: "local", path: "/spaces/s1" },
		])
		expect(options.agent).toBe("bean")
	})

	it("loads the app's plugin on a resume too, since no flag is sticky", () => {
		expect(
			buildOptions(
				{ ...request, systemPluginPath: "/app/system", resume: "s1" },
				undefined,
			).plugins,
		).toEqual([
			{ type: "local", path: "/bots/b1" },
			{ type: "local", path: "/app/system" },
		])
	})

	it("loads no plugin at all for a session with no bundle of the bot's", () => {
		expect(
			buildOptions(
				{
					cwd: "/tmp",
					partialMessages: false,
					systemPluginPath: "/app/system",
				},
				undefined,
			).plugins,
		).toBeUndefined()
	})

	it("names neither for a session opened with no bundle", () => {
		const options = buildOptions(
			{ cwd: "/tmp", partialMessages: false },
			undefined,
		)

		expect(options.plugins).toBeUndefined()
		expect(options.agent).toBeUndefined()
		expect(options.mcpServers).toBeUndefined()
	})

	it("names every server left out at the foot of the layer, detail for detail", () => {
		const append = appended(
			buildOptions(request, undefined, undefined, {
				servers: {},
				rejections,
			}),
		)

		expect(append).toBe(layerFor(request, rejections))
		expect(append.endsWith(unavailableServersSection(rejections))).toBe(true)
		for (const detail of rejectedDetails) {
			expect(append).toContain(detail)
		}
	})

	it("leaves the layer without that section when no server was left out", () => {
		const append = appended(
			buildOptions(request, undefined, undefined, {
				servers: {},
				rejections: [],
			}),
		)

		expect(append).toBe(layerFor(request))
		expect(append).not.toContain("left out")
	})

	it("carries the failure of the environment store into that section", () => {
		const failure = "the environment store could not be read"

		expect(
			appended(
				buildOptions(request, undefined, undefined, {
					servers: {},
					rejections: [failure].map(leftOutLine),
				}),
			),
		).toContain(failure)
	})

	it("names to the pass the resolved servers the session declares, and nothing else", () => {
		const servers = { clock: { command: "run" } }
		const options = buildOptions(request, undefined, undefined, {
			servers,
			rejections: [],
		})

		expect(dialledServers(declaredServers(options, servers))).toEqual(["clock"])
		expect(Object.keys(declaredServers(options, servers))).toEqual([
			"clock",
			KIROSHI_SERVER,
		])
	})

	it("names no server to the pass when the options carry none", () => {
		const bundle = mkdtempSync(join(tmpdir(), "kiroshi-dialled-"))
		writeFileSync(
			join(bundle, ".mcp.json"),
			JSON.stringify({ mcpServers: { clock: { command: "run" } } }),
		)

		const withoutAgent = buildOptions(
			{ ...request, agent: undefined, pluginPath: bundle },
			undefined,
		)
		rmSync(bundle, { recursive: true, force: true })

		expect(withoutAgent.mcpServers).toBeUndefined()
		expect(
			dialledServers(
				declaredServers(withoutAgent, { clock: { command: "run" } }),
			),
		).toEqual([])
	})

	it("hands the kept servers and the rejections of one same resolution", () => {
		const servers = { clock: { command: "run" } }
		const options = buildOptions(request, undefined, undefined, {
			servers,
			rejections,
		})

		expect(Object.keys(declaredServers(options, servers))).toEqual([
			"clock",
			KIROSHI_SERVER,
		])
		expect(appended(options)).toContain(rejectedDetails[0] ?? "")
	})

	it("keeps the value a scope defines out of that section", () => {
		const bundle = mkdtempSync(join(tmpdir(), "kiroshi-servers-"))
		writeFileSync(
			join(bundle, ".mcp.json"),
			JSON.stringify({
				mcpServers: {
					clock: { command: "run", args: ["--token", "${TOKEN}"] },
					probe: { command: "${RUNNER}" },
				},
			}),
		)

		const append = appended(
			buildOptions(
				{
					...request,
					pluginPath: bundle,
					serverEnv: { base: { TOKEN: "narrow" } },
				},
				undefined,
			),
		)
		rmSync(bundle, { recursive: true, force: true })

		expect(append).toContain(
			'the server "probe" was left out: RUNNER is defined by no scope',
		)
		expect(append).not.toContain("clock")
		expect(append).not.toContain("narrow")
	})

	it("hands the resolved servers over by the config file alone, beside the kiroshi server", () => {
		const options = buildOptions(
			request,
			undefined,
			undefined,
			secretServers,
			undefined,
			mcpConfig,
		)

		expect(Object.keys(options.mcpServers ?? {})).toEqual([KIROSHI_SERVER])
		expect(options.extraArgs).toEqual({ "mcp-config": mcpConfig.path })
	})

	it("sets no config flag and inlines no resolved server without a config file", () => {
		const options = buildOptions(request, undefined, undefined, secretServers)

		expect(Object.keys(options.mcpServers ?? {})).toEqual([KIROSHI_SERVER])
		expect(options.extraArgs).toBeUndefined()
	})

	it("denies the agent reading the config file, as written and resolved", () => {
		const floor = buildOptions(
			request,
			undefined,
			undefined,
			secretServers,
			undefined,
			mcpConfig,
		).managedSettings

		for (const path of [mcpConfig.path, mcpConfig.resolvedPath]) {
			expect(floor?.permissions?.deny).toContain(`Read(/${path})`)
			expect(floor?.sandbox?.filesystem?.denyRead).toContain(path)
		}
	})

	it("spawns Claude Code with the config path on the argv and no secret", async () => {
		const options = buildOptions(
			request,
			undefined,
			undefined,
			secretServers,
			undefined,
			mcpConfig,
		)
		const spawned = Promise.withResolvers<string[]>()
		const run = query({
			prompt: "hello",
			options: {
				...options,
				spawnClaudeCodeProcess: ({ args }) => {
					spawned.resolve(args)
					return spawn("true", { stdio: ["pipe", "pipe", "pipe"] })
				},
			},
		})

		const args = await spawned.promise
		run.close()

		expect(args.join(" ")).not.toContain(SECRET)
		expect(args[args.indexOf("--mcp-config") + 1]).toBe(mcpConfig.path)
	})
})

describe("layerFor", () => {
	let system: string

	beforeEach(() => {
		system = mkdtempSync(join(tmpdir(), "kiroshi-layer-"))
	})

	afterEach(() => {
		rmSync(system, { recursive: true, force: true })
	})

	const dropSkill = (id: string, contents: string) => {
		const dir = join(system, "skills", id)
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "SKILL.md"), contents)
	}

	it("carries the app plugin's preloaded skills under the bot's own directory", () => {
		dropSkill(
			"learn",
			'---\nname: "learn"\nmetadata:\n  kiroshi:\n    preload: true\n---\n\n## When to write\n\nRules.\n',
		)

		expect(layerFor({ pluginPath: "/bots/b1", systemPluginPath: system })).toBe(
			[
				KIROSHI_LAYER,
				bundleLine("/bots/b1"),
				`# learn\n\n${skillLine(join(system, "skills", "learn"))}\n\n## When to write\n\nRules.`,
			].join("\n\n"),
		)
	})

	it("carries the person's plugin above the bot's own directory", () => {
		dropSkill(
			"about-me",
			'---\nname: "about-me"\nmetadata:\n  kiroshi:\n    preload: true\n---\n\nThey like figs.\n',
		)

		expect(layerFor({ pluginPath: "/bots/b1", userPluginPath: system })).toBe(
			[
				KIROSHI_LAYER,
				userLine(system),
				`# about-me\n\n${skillLine(join(system, "skills", "about-me"))}\n\nThey like figs.`,
				bundleLine("/bots/b1"),
			].join("\n\n"),
		)
	})

	it("carries the space's plugin below the person's", () => {
		dropSkill(
			"about-this-space",
			'---\nname: "about-this-space"\nmetadata:\n  kiroshi:\n    preload: true\n---\n\nThe API lives in apps/api.\n',
		)

		expect(layerFor({ pluginPath: "/bots/b1", spacePluginPath: system })).toBe(
			[
				KIROSHI_LAYER,
				spaceLine(system),
				`# about-this-space\n\n${skillLine(join(system, "skills", "about-this-space"))}\n\nThe API lives in apps/api.`,
				bundleLine("/bots/b1"),
			].join("\n\n"),
		)
	})

	it("reads the person before the project when both are laid down", () => {
		expect(
			layerFor({
				pluginPath: "/bots/b1",
				userPluginPath: "/user/me",
				spacePluginPath: "/spaces/s1",
			}),
		).toBe(
			[
				KIROSHI_LAYER,
				userLine("/user/me"),
				spaceLine("/spaces/s1"),
				bundleLine("/bots/b1"),
			].join("\n\n"),
		)
	})

	it("names no space when the bot's space has no plugin laid down", () => {
		expect(layerFor({ pluginPath: "/bots/b1" })).toBe(
			[KIROSHI_LAYER, bundleLine("/bots/b1")].join("\n\n"),
		)
	})

	it("leaves out a preloaded skill the person has written nothing in yet", () => {
		dropSkill(
			"about-me",
			'---\nname: "about-me"\nmetadata:\n  kiroshi:\n    preload: true\n---\n\n',
		)

		expect(layerFor({ pluginPath: "/bots/b1", userPluginPath: system })).toBe(
			[KIROSHI_LAYER, userLine(system), bundleLine("/bots/b1")].join("\n\n"),
		)
	})

	it("appends nothing for an app plugin with no preloaded skill", () => {
		dropSkill("quiet", '---\nname: "quiet"\n---\n\nRules.\n')

		expect(layerFor({ pluginPath: "/bots/b1", systemPluginPath: system })).toBe(
			`${KIROSHI_LAYER}\n\n${bundleLine("/bots/b1")}`,
		)
	})

	it("closes on the servers left out, below every other section", () => {
		dropSkill(
			"learn",
			'---\nname: "learn"\nmetadata:\n  kiroshi:\n    preload: true\n---\n\nRules.\n',
		)

		expect(
			layerFor(
				{ identity, pluginPath: "/bots/b1", systemPluginPath: system },
				rejections,
			),
		).toBe(
			[
				identity,
				KIROSHI_LAYER,
				bundleLine("/bots/b1"),
				`# learn\n\n${skillLine(join(system, "skills", "learn"))}\n\nRules.`,
				unavailableServersSection(rejections),
			].join("\n\n"),
		)
	})

	it("tells the bot to answer with the tools it holds and to give the reason listed", () => {
		const section = unavailableServersSection(rejections)

		expect(section).toContain("Answer the person with the tools you still hold")
		expect(section).toContain("give them the reason listed for it")
		expect(section).toContain(
			"the one exception to saying nothing about the machinery you run on",
		)
	})

	it("reads the state of a line, not the words its reason quotes", () => {
		const section = unavailableServersSection(
			[
				'the server "superset" was left out: it read failed, and the reconnection answered: is still connecting, holds its tools',
			].map(leftOutLine),
		)

		expect(section).toContain("# Servers left out of this session")
		expect(section).toContain("tell them that server is unavailable")
		expect(section).not.toContain("holds none of its tools yet")
		expect(section).not.toContain("has them for the rest of this session")
	})

	it("claims nothing of every server when one was left out and one came back", () => {
		const section = unavailableServersSection([
			{
				detail:
					'the server "clock" was left out: it is waiting for you to authorize it',
				state: "left-out",
			},
			{
				detail:
					'the server "superset" connected, and holds its tools for the rest of this session',
				state: "holding",
			},
		])

		expect(section).toContain("hold none of them as unavailable")
		expect(section).toContain("on this opening alone")
		expect(section).not.toContain("tell them that server is unavailable")
		expect(section).toContain("has them for the rest of this session")
	})

	it("claims nothing of every server when one was left out and one is connecting", () => {
		const section = unavailableServersSection([
			{
				detail:
					'the server "clock" was left out: it is waiting for you to authorize it',
				state: "left-out",
			},
			{
				detail: 'the server "superset" is still connecting after 4750 ms',
				state: "connecting",
			},
		])

		expect(section).toContain("hold none of them as unavailable")
		expect(section).toContain("on this opening alone")
		expect(section).not.toContain("tell them that server is unavailable")
		expect(section).toContain("holds none of its tools yet")
	})

	it("claims no server was left out when none was, and says the tools are back", () => {
		const section = unavailableServersSection([
			{
				detail:
					'the server "superset" connected, and holds its tools for the rest of this session',
				state: "holding",
			},
		])

		expect(section).not.toContain("was left out")
		expect(section).not.toContain("that server is unavailable")
		expect(section).toContain("# Where the servers of this session stand")
		expect(section).toContain("has them for the rest of this session")
	})

	it("claims no server was left out for a server still connecting", () => {
		const section = unavailableServersSection([
			{
				detail: 'the server "superset" is still connecting after 4750 ms',
				state: "connecting",
			},
		])

		expect(section).not.toContain("was left out")
		expect(section).not.toContain("that server is unavailable")
		expect(section).toContain("# Where the servers of this session stand")
		expect(section).toContain("holds none of its tools yet")
	})

	it("tells the bot a server still connecting can hold its tools later", () => {
		const section = unavailableServersSection([
			{
				detail: 'the server "superset" is still connecting after 4750 ms',
				state: "connecting",
			},
		])

		expect(section).toContain("holds none of its tools yet")
		expect(section).toContain("later in this session")
		expect(section).toContain("not ready rather than gone")
	})

	it("keeps the rejection of a missing variable, and its section, word for word", () => {
		const rejection = leftOut("probe", "RUNNER is defined by no scope")

		expect(rejection).toBe(
			'the server "probe" was left out: RUNNER is defined by no scope',
		)
		expect(unavailableServersSection([rejection].map(leftOutLine))).toBe(
			[
				"# Servers left out of this session",
				`- ${rejection}`,
				"Answer the person with the tools you still hold. When what they ask for needs one of these servers, tell them that server is unavailable and give them the reason listed for it, so they can act on it. Naming that server and its reason is the one exception to saying nothing about the machinery you run on.",
			].join("\n\n"),
		)
	})

	it("holds for a rejection naming no variable, such as an unreadable store", () => {
		const section = unavailableServersSection(
			[
				"the environment store could not be read",
				'the server "clock" was left out: the environment store could not be read',
			].map(leftOutLine),
		)

		expect(section).not.toContain("variable")
		expect(section).toContain("give them the reason listed for it")
	})

	it("reads a server waiting for authorization as left out, and says once where it is authorized", () => {
		const section = unavailableServersSection([
			{ detail: leftOut("granola", AWAITING_AUTH), state: "needs-auth" },
			{ detail: leftOut("notion", AWAITING_AUTH), state: "needs-auth" },
		])

		expect(section).toContain("# Servers left out of this session")
		expect(section).toContain("tell them that server is unavailable")
		expect(section.split(AUTHORIZE_LINE)).toHaveLength(2)
	})

	it("reads a server waiting for authorization beside one holding its tools as a mixed section", () => {
		const section = unavailableServersSection([
			{ detail: leftOut("granola", AWAITING_AUTH), state: "needs-auth" },
			{
				detail:
					'the server "superset" connected, and holds its tools for the rest of this session',
				state: "holding",
			},
		])

		expect(section).toContain("on this opening alone")
		expect(section.split(AUTHORIZE_LINE)).toHaveLength(2)
	})

	it("opens the authorization line on the person alone, then keeps its two sentences", () => {
		expect(AUTHORIZE_LINE).toBe(
			"Only the person can authorize a server, and they do it in Settings, then Applications. Say exactly that when they ask for something that server holds, and never ask them in the chat for a token, a password or an authorization.",
		)
	})

	it("says nothing of authorization when no line waits on it", () => {
		expect(unavailableServersSection(rejections)).not.toContain(AUTHORIZE_LINE)
	})

	it("opens on the identity the host rendered, above the Kiroshi sentences", () => {
		expect(layerFor({ identity, pluginPath: "/bots/b1" })).toBe(
			[identity, KIROSHI_LAYER, bundleLine("/bots/b1")].join("\n\n"),
		)
		expect(layerFor({ pluginPath: "/bots/b1" })).not.toContain(identity)
	})
})

describe("reportConnections", () => {
	const refused: ServerStatus[] = [{ name: "superset", status: "needs-auth" }]

	const detail =
		'the server "superset" was left out: it is waiting for you to authorize it'

	const section = unavailableServersSection([{ detail, state: "needs-auth" }])

	type Report = {
		emitted: string[]
		pushed: string[]
		settled: Promise<void>
		report: ReturnType<typeof reportConnections>
	}

	const reporting = (pass: ConnectPass): Report => {
		const emitted: string[] = []
		const pushed: string[] = []
		const done = Promise.withResolvers<void>()
		const report = reportConnections({
			emit: (frame) => {
				emitted.push(String(frame.detail))
			},
			push: (text) => {
				pushed.push(text)
				done.resolve()
			},
			pass,
		})
		return { emitted, pushed, settled: done.promise, report }
	}

	const refusing = (): ConnectPass => ({
		names: ["superset"],
		port: { status: async () => refused, reconnect: async () => {} },
	})

	const ticked = () => new Promise((resolve) => setTimeout(resolve, 10))

	it("lets the session be announced before the pass reads a status", async () => {
		const order: string[] = []
		const read = Promise.withResolvers<void>()

		reportConnections({
			emit: () => {},
			push: () => {},
			pass: {
				names: ["superset"],
				port: {
					status: async () => {
						order.push("status")
						read.resolve()
						return [{ name: "superset", status: "connected" }]
					},
					reconnect: async () => {},
				},
			},
		})
		order.push("opened")

		expect(order).toEqual(["opened"])

		await read.promise

		expect(order).toEqual(["opened", "status"])
	})

	it("emits its frames in the call that hands the prefixed prompt over", async () => {
		const { emitted, pushed, settled, report } = reporting(refusing())

		report.prompt("first")
		await settled

		expect(emitted).toEqual([detail])
		expect(pushed).toEqual([`${section}\n\nfirst`])
	})

	it("raises no frame at the opening for a server its watch is about to dial", async () => {
		const emitted: string[] = []
		const pushed: string[] = []
		const released = Promise.withResolvers<void>()

		const report = reportConnections({
			emit: (frame) => {
				emitted.push(String(frame.detail))
			},
			push: (text) => {
				pushed.push(text)
				released.resolve()
			},
			pass: {
				names: ["superset"],
				port: {
					status: async () => [{ name: "superset", status: "failed" }],
					reconnect: async () => {
						throw new Error("Connection failed")
					},
				},
				wait: async () => {},
			},
		})

		report.prompt("first")
		await released.promise

		expect(emitted).toEqual([])
		expect(pushed[0]).toContain("read failed, and a reconnection is under way")

		await ticked()
		report.prompt("and now?")
		const answered =
			'the server "superset" was left out: it read failed, and the reconnection answered: Connection failed'

		expect(emitted).toEqual([answered])
		expect(pushed[1]).toBe(
			`${unavailableServersSection([answered].map(leftOutLine))}\n\nand now?`,
		)
	})

	it("raises no frame at all for a server its reconnection brings back", async () => {
		const emitted: string[] = []
		const pushed: string[] = []
		const released = Promise.withResolvers<void>()
		let dialled = false

		const report = reportConnections({
			emit: (frame) => {
				emitted.push(String(frame.detail))
			},
			push: (text) => {
				pushed.push(text)
				released.resolve()
			},
			pass: {
				names: ["superset"],
				port: {
					status: async () => [
						{ name: "superset", status: dialled ? "connected" : "failed" },
					],
					reconnect: async () => {
						dialled = true
					},
				},
				wait: async () => {},
			},
		})

		report.prompt("first")
		await released.promise
		await ticked()
		report.prompt("and now?")

		expect(emitted).toEqual([])
		expect(pushed[1]).toContain("holds its tools for the rest of this session")
		expect(pushed[1]).not.toContain("was left out")
	})

	const clocked = (portFor: (now: () => number) => ConnectPort) => {
		const emitted: string[] = []
		const pushed: string[] = []
		const released = Promise.withResolvers<void>()
		let time = 0

		const report = reportConnections({
			emit: (frame) => {
				emitted.push(String(frame.detail))
			},
			push: (text) => {
				pushed.push(text)
				released.resolve()
			},
			pass: {
				names: ["superset"],
				port: portFor(() => time),
				now: () => time,
				wait: async (ms) => {
					time += ms
				},
			},
		})

		return { emitted, pushed, released: released.promise, report }
	}

	const settlingAfterBudget = (settled: ServerStatus[]) =>
		clocked((now) => ({
			status: async () =>
				now() <= POLL_BUDGET_MS - 250
					? [{ name: "superset", status: "pending" }]
					: settled,
			reconnect: async () => {},
		}))

	it("raises no frame for a server the budget left pending", async () => {
		const { emitted, pushed, released, report } = clocked(() => ({
			status: async () => [{ name: "superset", status: "pending" }],
			reconnect: async () => {},
		}))

		report.prompt("first")
		await released

		expect(emitted).toEqual([])
		expect(pushed[0]).toContain("is still connecting after")
	})

	it("raises one frame once that server reads failed under the watch", async () => {
		const { emitted, pushed, released, report } = clocked((now) => ({
			status: async () =>
				now() <= POLL_BUDGET_MS - 250
					? [{ name: "superset", status: "pending" }]
					: [{ name: "superset", status: "failed" }],
			reconnect: async () => {
				throw new Error("Connection failed")
			},
		}))

		report.prompt("first")
		await released

		expect(emitted).toEqual([])
		expect(pushed[0]).toContain("is still connecting after")

		await ticked()

		expect(emitted).toEqual([
			'the server "superset" was left out: it read failed, and the reconnection answered: Connection failed',
		])
	})

	it("names a server the watch finds disabled as left out, once", async () => {
		const { pushed, report } = settlingAfterBudget([
			{ name: "superset", status: "disabled" },
		])

		await ticked()
		report.prompt("and now?")

		const carried = String(pushed[0])

		expect(carried.split('the server "superset"')).toHaveLength(2)
		expect(carried).toContain("it is disabled in this session")
		expect(carried).not.toContain("is still connecting")
	})

	it("tells the bot of a server it reached without framing it on screen", async () => {
		const { emitted, pushed, report } = settlingAfterBudget([
			{ name: "superset", status: "connected" },
		])

		await ticked()

		expect(emitted).toEqual([])

		report.prompt("and now?")

		expect(pushed[0]).toContain("holds its tools for the rest of this session")
		expect(pushed[0]).not.toContain("is still connecting")
		expect(emitted).toEqual([])
	})

	it("carries the later line alone when a server was named twice", async () => {
		const { emitted, pushed, report } = settlingAfterBudget([
			{ name: "superset", status: "failed" },
		])

		await ticked()
		report.prompt("and now?")

		const carried = String(pushed[0])
		const named = carried.split('the server "superset"').length - 1

		expect(emitted).toEqual([
			'the server "superset" was left out: it read failed',
		])
		expect(named).toBe(1)
		expect(carried).toContain("it read failed")
		expect(carried).not.toContain("is still connecting")
	})

	it("emits no frame while the pass settles on its own", async () => {
		const { emitted, pushed } = reporting(refusing())

		await ticked()

		expect(emitted).toEqual([])
		expect(pushed).toEqual([])
	})

	it("holds every prompt behind the pass and names the servers once", async () => {
		const { emitted, pushed, report } = reporting(refusing())

		report.prompt("first")
		report.prompt("second")

		expect(pushed).toEqual([])

		await ticked()
		report.prompt("third")

		expect(emitted).toEqual([detail])
		expect(pushed).toEqual([`${section}\n\nfirst`, "second", "third"])
	})

	const REJECTED_HEADER =
		"Server rejected the configured Authorization header (HTTP 401)"

	const TOKEN = {
		perServer: { superset: { KIROSHI_OAUTH_ACCESS_TOKEN: "old" } },
	}

	const landed = {
		dropped: { added: [], removed: ["superset"], errors: {} },
		carried: { added: ["superset"], removed: [], errors: {} },
	}

	type Turning = {
		renew?: (name: string) => Promise<RenewedGrant>
		env?: ServerEnv
		bound?: number
	}

	const turning = (
		statuses: (renewed: boolean) => ServerStatus[],
		{ renew, env = TOKEN, bound }: Turning = {},
	) => {
		const emitted: string[] = []
		const pushed: string[] = []
		const renewed: string[] = []
		let reads = 0

		const report = reportConnections({
			emit: (frame) => {
				emitted.push(String(frame.detail))
			},
			push: (text) => {
				pushed.push(text)
			},
			pass: {
				names: ["superset"],
				port: {
					status: async () => {
						reads += 1
						return statuses(renewed.length > 0)
					},
					reconnect: async () => {},
				},
				env,
				...(bound === undefined ? {} : { bound }),
				grants: {
					renew: async (name) => {
						renewed.push(name)
						return (
							renew?.(name) ?? {
								state: "granted" as const,
								accessToken: "renewed-access-token",
							}
						)
					},
					declare: async () => landed,
				},
				wait: async () => {},
			},
		})

		return { emitted, pushed, renewed, report, reads: () => reads }
	}

	it("reads the status again before it hands a turn to an open session", async () => {
		const { pushed, renewed, report, reads } = turning(() => [
			{ name: "superset", status: "connected" },
		])

		report.prompt("first")
		await ticked()
		const opened = reads()
		report.prompt("second")
		await ticked()

		expect(reads()).toBe(opened + 1)
		expect(renewed).toEqual([])
		expect(pushed[1]).toBe("second")
	})

	it("renews a server that stopped being accepted before the turn reaches the agent", async () => {
		const order: string[] = []
		const { pushed, renewed, report } = turning((again) =>
			again
				? [{ name: "superset", status: "connected" }]
				: [
						{
							name: "superset",
							status: "failed",
							error: REJECTED_HEADER,
						},
					],
		)

		report.prompt("first")
		await ticked()
		order.push("opened")
		report.prompt("second")
		order.push("handed")
		await ticked()

		expect(order).toEqual(["opened", "handed"])
		expect(renewed).toEqual(["superset"])
		expect(pushed[1]).toContain("holds its tools for the rest of this session")
		expect(pushed[1]).toEndWith("second")
	})

	it("hands the turns of one open session on in the order they arrived", async () => {
		const { pushed, report } = turning(() => [
			{ name: "superset", status: "connected" },
		])

		report.prompt("first")
		await ticked()
		report.prompt("second")
		report.prompt("third")
		await ticked()

		expect(pushed.slice(1)).toEqual(["second", "third"])
	})

	const reached: ServerStatus[] = [{ name: "superset", status: "connected" }]

	const rejected: ServerStatus[] = [
		{ name: "superset", status: "failed", error: REJECTED_HEADER },
	]

	const rejectingAfterOpening = () => {
		let opened = false
		return () => {
			const read = opened ? rejected : reached
			opened = true
			return read
		}
	}

	it("reads no status before a turn of a session given no stored access token", async () => {
		const { pushed, report, reads } = turning(rejectingAfterOpening(), {
			env: {},
		})

		report.prompt("first")
		await ticked()
		const opened = reads()
		report.prompt("second")

		expect(reads()).toBe(opened)
		expect(pushed[pushed.length - 1]).toBe("second")
	})

	it("hands a turn held for a renewal on once that renewal outlasts its bound", async () => {
		const stderr: string[] = []
		const original = process.stderr.write
		process.stderr.write = ((line: string) => {
			stderr.push(String(line))
			return true
		}) as typeof process.stderr.write
		const { pushed, report } = turning(rejectingAfterOpening(), {
			renew: () => new Promise<never>(() => {}),
			bound: 5,
		})

		report.prompt("first")
		await ticked()
		report.prompt("second")
		await new Promise((resolve) => setTimeout(resolve, 40))
		process.stderr.write = original

		expect(pushed[pushed.length - 1]).toEndWith("second")
		expect(stderr.join("")).toContain("the renewal outlasted its 5 ms deadline")
	})

	it("hands a turn on when the renewal it was held for threw", async () => {
		const { pushed, report } = turning(rejectingAfterOpening(), {
			renew: async () => {
				throw new Error("the session closed before the host answered")
			},
		})

		report.prompt("first")
		await ticked()
		report.prompt("second")
		await ticked()

		expect(pushed[pushed.length - 1]).toEndWith("second")
	})

	it("hands the turn that follows a dropped one to the agent", async () => {
		const settling = Promise.withResolvers<RenewedGrant>()
		const { pushed, report } = turning(rejectingAfterOpening(), {
			renew: () => settling.promise,
		})

		report.prompt("first")
		await ticked()
		report.prompt("held")

		expect(report.drop()).toBe(true)

		report.prompt("after the drop")
		settling.resolve({ state: "unchanged" })
		await ticked()

		expect(pushed).toHaveLength(2)
		expect(pushed[1]).toEndWith("after the drop")
		expect(pushed.join("")).not.toContain("held")
	})

	it("says nothing to anyone but stderr when no status read ever answered", async () => {
		const written: string[] = []
		const original = process.stderr.write
		process.stderr.write = ((line: string) => {
			written.push(String(line))
			return true
		}) as typeof process.stderr.write
		const { emitted, pushed, settled, report } = reporting({
			names: ["superset"],
			port: {
				status: async () => {
					throw new Error("the query is gone")
				},
				reconnect: async () => {},
			},
		})

		report.prompt("first")
		await settled
		process.stderr.write = original

		expect(emitted).toEqual([])
		expect(pushed).toEqual(["first"])
		expect(written).toEqual([
			"the connection pass gave up on superset: the query is gone\n",
		])
	})

	it("drops the held prompts of a cancelled turn and leaves the pass running", async () => {
		const { emitted, pushed, report } = reporting(refusing())

		report.prompt("first")
		report.drop()
		await ticked()
		report.prompt("second")

		expect(pushed).toEqual([`${section}\n\nsecond`])
		expect(emitted).toEqual([detail])
	})

	it("abandons the pass on a close, with no frame and no held prompt", async () => {
		const written: string[] = []
		const original = process.stderr.write
		process.stderr.write = ((line: string) => {
			written.push(String(line))
			return true
		}) as typeof process.stderr.write
		const { emitted, pushed, report } = reporting({
			names: ["superset"],
			port: {
				status: async () => {
					throw new Error("the query is gone")
				},
				reconnect: async () => {},
			},
		})

		report.prompt("first")
		report.abandon()
		await ticked()
		process.stderr.write = original

		expect(emitted).toEqual([])
		expect(pushed).toEqual([])
		expect(written).toEqual([])
	})

	it("holds a prompt for as long as the pass runs, and releases it on the pass", async () => {
		const reading = Promise.withResolvers<ServerStatus[]>()
		const { emitted, pushed, settled, report } = reporting({
			names: ["superset"],
			port: {
				status: () => reading.promise,
				reconnect: async () => {},
			},
		})

		report.prompt("first")
		await ticked()

		expect(pushed).toEqual([])

		reading.resolve(refused)
		await settled

		expect(pushed).toEqual([`${section}\n\nfirst`])
		expect(emitted).toEqual([detail])
	})

	it("holds nothing and reads no status when the options carry no server", async () => {
		let reads = 0
		const { emitted, pushed, report } = reporting({
			names: [],
			port: {
				status: async () => {
					reads += 1
					return []
				},
				reconnect: async () => {},
			},
		})

		report.prompt("first")

		expect(pushed).toEqual(["first"])

		await ticked()

		expect(reads).toBe(0)
		expect(emitted).toEqual([])
	})

	it("releases the first prompt on the first read when every server connected", async () => {
		let reads = 0
		const { emitted, pushed, settled, report } = reporting({
			names: ["superset"],
			port: {
				status: async () => {
					reads += 1
					return [{ name: "superset", status: "connected" }]
				},
				reconnect: async () => {},
			},
		})

		report.prompt("first")
		await settled

		expect(pushed).toEqual(["first"])
		expect(emitted).toEqual([])
		expect(reads).toBe(1)
	})
})

describe("stopTurn", () => {
	it("ends the host's turn itself when the stop lands on a held prompt", async () => {
		const frames: SessionFrame[] = []
		let interrupted = false

		await stopTurn({
			dropped: true,
			emit: (frame) => {
				frames.push(frame)
			},
			interrupt: async () => {
				interrupted = true
			},
		})

		expect(frames).toEqual([
			{ type: "result", subtype: "interrupted", is_error: false },
		])
		expect(interrupted).toBe(false)
	})

	it("sends the interrupt and emits nothing when nothing was held", async () => {
		const frames: SessionFrame[] = []
		let interrupted = false

		await stopTurn({
			dropped: false,
			emit: (frame) => {
				frames.push(frame)
			},
			interrupt: async () => {
				interrupted = true
			},
		})

		expect(frames).toEqual([])
		expect(interrupted).toBe(true)
	})
})
