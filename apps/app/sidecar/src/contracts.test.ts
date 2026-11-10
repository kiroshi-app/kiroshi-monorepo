import { describe, expect, it } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { z } from "zod"

import { type Command, createRouter } from "./serve"

import { readBotSettings } from "./providers/claude/bot-settings"
import { sessionServers } from "./providers/claude/bundle-servers"
import { kiroshiTools } from "./providers/claude/kiroshi-server"
import type { AgentProvider } from "./providers/provider"

const REWRITE = "bun run snapshots"

const CONTRACTS = fileURLToPath(new URL("../../contracts/", import.meta.url))

const TOOLS_SNAPSHOT = "kiroshi-tools.json"

const LAYERS_SNAPSHOT = "plugin-layers.sidecar.json"

const COMMANDS = "host-commands.ndjson"

const LAYERS = ["system", "user", "space", "companion"] as const

const frozen = (name: string, live: unknown) => {
	const path = join(CONTRACTS, name)
	const written = `${JSON.stringify(live, null, "\t")}\n`
	if (process.env.UPDATE_SNAPSHOTS) {
		writeFileSync(path, written)
		return
	}
	expect(readFileSync(path, "utf8")).toBe(written)
}

const committedLines = (name: string): Command[] =>
	readFileSync(join(CONTRACTS, name), "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as Command)

const bundleOf = (layer: string) =>
	join(CONTRACTS, "plugin-layers", "plugins", layer)

const toolEntries = () =>
	kiroshiTools({
		cwd: "/workspace/space",
		env: {},
		floor: {
			home: "/home",
			platform: "darwin",
			pluginPaths: [],
			writablePaths: [],
		},
		managedSettings: {},
		session: "k1",
	}).map((held) => ({
		name: held.name,
		description: held.description,
		inputSchema: z.toJSONSchema(z.object(held.inputSchema)),
	}))

const mergedServers = () =>
	sessionServers({
		pluginPath: bundleOf("companion"),
		systemPluginPath: bundleOf("system"),
		userPluginPath: bundleOf("user"),
		spacePluginPath: bundleOf("space"),
	})

const acceptedSettings = () =>
	Object.fromEntries(
		LAYERS.map((layer) => [
			layer,
			readBotSettings({
				cwd: bundleOf(layer),
				partialMessages: false,
				settingsPath: join(bundleOf(layer), "settings.json"),
			}),
		]),
	)

const HELD_BY_OBJECT_PROTOTYPE = ["__proto__", "constructor", "toString"]

const refuses = (name: string) => () => {
	throw new Error(`the routing test never calls ${name}`)
}

const silentProvider: AgentProvider = {
	id: "contracts",
	version: "0.0.0",
	sdkVersion: "0.0.0",
	capabilities: [],
	assertReady: refuses("assertReady"),
	authenticate: refuses("authenticate"),
	signIn: refuses("signIn"),
	enterSignInCode: refuses("enterSignInCode"),
	cancelSignIn: refuses("cancelSignIn"),
	models: refuses("models"),
	tools: refuses("tools"),
	title: refuses("title"),
	open: refuses("open"),
}

describe("the frozen back-end contracts", () => {
	it(`holds every kiroshi tool in ${TOOLS_SNAPSHOT}, rewritten by \`${REWRITE}\``, () => {
		frozen(TOOLS_SNAPSHOT, toolEntries())
	})

	it(`holds what the plugin readers extract in ${LAYERS_SNAPSHOT}, rewritten by \`${REWRITE}\``, () => {
		frozen(LAYERS_SNAPSHOT, {
			mergedServers: mergedServers(),
			acceptedSettings: acceptedSettings(),
		})
	})

	it(`serves exactly the command types ${COMMANDS} carries`, () => {
		const { answered, acted } = createRouter(silentProvider, () => undefined)
		const carried = new Set(
			committedLines(COMMANDS).map((command) => command.type),
		)
		const served = new Set([...answered, ...acted])

		expect([...served].filter((type) => !carried.has(type))).toEqual([])
		expect([...carried].filter((type) => !served.has(type))).toEqual([])
	})

	it(`routes every command of ${COMMANDS} through the record its session decides`, () => {
		const { route, answered, acted } = createRouter(
			silentProvider,
			() => undefined,
		)
		const commands = committedLines(COMMANDS)
		const misplaced = commands.filter(
			(command) => !(command.session ? acted : answered).has(command.type),
		)
		const handlers = commands.map((command) => route(command))

		expect(misplaced.map((command) => command.type)).toEqual([])
		expect(handlers.filter(Boolean)).toHaveLength(commands.length)
		expect(new Set(handlers).size).toBe(commands.length)
	})

	it("routes a command type held by Object.prototype nowhere and writes nothing", () => {
		const written: unknown[] = []
		const { route, dispatch } = createRouter(silentProvider, (payload) => {
			written.push(payload)
		})

		for (const type of [...HELD_BY_OBJECT_PROTOTYPE, "no_record_serves_this"]) {
			expect(route({ type })).toBeUndefined()
			expect(route({ type, session: "k1" })).toBeUndefined()
			dispatch({ type })
			dispatch({ type, session: "k1" })
		}

		expect(written).toEqual([])
	})
})
