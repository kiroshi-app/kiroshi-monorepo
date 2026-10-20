import { beforeAll, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createRouter, sessionRequest } from "./serve"

import { claudeSourceExecutable } from "./providers/claude/build"
import { EXECUTABLE_OVERRIDE_ENV } from "./providers/claude/executable"
import { resolvedServers } from "./providers/claude/server-env"
import { buildOptions } from "./providers/claude/session"
import { spaceLine } from "./providers/claude/system-layer"
import type { AgentProvider, AgentSession } from "./providers/provider"
import { DEFAULT_PROVIDER_ID } from "./providers/registry"

const entrypoint = new URL("./index.ts", import.meta.url).pathname

const providerExecutable = claudeSourceExecutable()

process.env[EXECUTABLE_OVERRIDE_ENV] = providerExecutable

const environment = { ...process.env }

const spacePath = "/spaces/s1"

const heldEnvironment = {
	base: { TOKEN: "wide" },
	perServer: { clock: { TOKEN: "narrow" } },
}

const openCommand = (extra: Record<string, unknown> = {}) =>
	JSON.parse(
		JSON.stringify({
			type: "open",
			session: "k1",
			cwd: "/tmp",
			partialMessages: true,
			serverEnv: heldEnvironment,
			...extra,
		}),
	)

const declaringClock = () => {
	const bundle = mkdtempSync(join(tmpdir(), "kiroshi-serve-env-"))
	writeFileSync(
		join(bundle, ".mcp.json"),
		JSON.stringify({
			mcpServers: { clock: { command: "run", args: ["--token", "${TOKEN}"] } },
		}),
	)
	return bundle
}

const SIDECAR_TIMEOUT = 10_000

const PROVIDER_TIMEOUT = 20_000

const WARM_UP_TIMEOUT = 60_000

const warmUpProvider = async () => {
	const child = Bun.spawn([providerExecutable, "--version"], {
		stdout: "ignore",
		stderr: "ignore",
	})
	await child.exited
}

const served = async (commands: string[]) => {
	const child = Bun.spawn(["bun", entrypoint, "--serve"], {
		env: environment,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	})
	child.stdin.write(commands.map((command) => `${command}\n`).join(""))
	await child.stdin.end()
	const [stdout, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		child.exited,
	])
	return {
		exitCode,
		lines: stdout
			.split("\n")
			.filter((line) => line.trim().length > 0)
			.map((line) => JSON.parse(line)),
	}
}

const unused = (name: string) => () => {
	throw new Error(`the interrupt test never calls ${name}`)
}

const providerOpening = (session: AgentSession): AgentProvider => ({
	id: "interrupts",
	version: "0.0.0",
	sdkVersion: "0.0.0",
	capabilities: [],
	assertReady: unused("assertReady"),
	authenticate: unused("authenticate"),
	signIn: unused("signIn"),
	enterSignInCode: unused("enterSignInCode"),
	cancelSignIn: unused("cancelSignIn"),
	models: unused("models"),
	tools: unused("tools"),
	title: unused("title"),
	open: async () => session,
})

const refusingInterrupt: AgentSession = {
	prompt: unused("prompt"),
	interrupt: async () => {
		throw new Error("the query is already closed")
	},
	decide: unused("decide"),
	close: async () => undefined,
}

const interrupted = async (session: string, opens: boolean) => {
	const written: unknown[] = []
	const { route } = createRouter(
		providerOpening(refusingInterrupt),
		(payload) => {
			written.push(payload)
		},
	)
	if (opens) {
		route(openCommand({ session }))?.(openCommand({ session }), session)
	}
	const interrupt = { type: "interrupt", session }
	await route(interrupt)?.(interrupt, session)
	return written
}

describe("serve", () => {
	beforeAll(warmUpProvider, WARM_UP_TIMEOUT)

	it(
		"announces the provider and its capabilities before any session",
		async () => {
			const { lines } = await served([])

			expect(lines[0].type).toBe("ready")
			expect(lines[0].provider).toBe(DEFAULT_PROVIDER_ID)
			expect(lines[0].capabilities).toContain("partialMessages")
		},
		SIDECAR_TIMEOUT,
	)

	it(
		"survives a line it cannot read and keeps serving",
		async () => {
			const { exitCode, lines } = await served([
				"this is not json",
				JSON.stringify({ type: "close", session: "never-opened" }),
			])

			expect(exitCode).toBe(0)
			expect(lines.at(-1).type).toBe("unreadable")
		},
		SIDECAR_TIMEOUT,
	)

	it(
		"answers the sign-in probe with a verdict and at most an email and a plan",
		async () => {
			const { lines } = await served([JSON.stringify({ type: "check" })])
			const checked = lines.at(-1)

			expect(checked.type).toBe("check")
			expect(typeof checked.authenticated).toBe("boolean")
			expect(
				Object.keys(checked).filter(
					(key) =>
						![
							"type",
							"authenticated",
							"authMethod",
							"detail",
							"account",
						].includes(key),
				),
			).toEqual([])
			expect(
				Object.keys(checked.account ?? {}).filter(
					(key) => !["email", "plan"].includes(key),
				),
			).toEqual([])
		},
		PROVIDER_TIMEOUT,
	)

	it(
		"answers the catalogue with the labels the provider offers",
		async () => {
			const { lines } = await served([JSON.stringify({ type: "models" })])
			const catalogue = lines.at(-1)

			expect(catalogue.type).toBe("models")
			expect(Array.isArray(catalogue.models)).toBe(true)
		},
		PROVIDER_TIMEOUT,
	)

	it("carries the mission thread flag the open command holds", () => {
		expect(
			sessionRequest(openCommand({ missionThread: true })).missionThread,
		).toBe(true)
		expect(sessionRequest(openCommand()).missionThread).toBeUndefined()
	})

	it("carries the environment the open command holds to the provider", () => {
		const request = sessionRequest(openCommand())

		expect(request.serverEnv).toEqual(heldEnvironment)
	})

	it("expands a declared server from the environment the open command holds", () => {
		const bundle = declaringClock()
		try {
			const { servers } = resolvedServers(
				sessionRequest(openCommand({ agent: "bean", pluginPath: bundle })),
			)

			expect(servers.clock).toEqual({
				command: "run",
				args: ["--token", "narrow"],
			})
		} finally {
			rmSync(bundle, { recursive: true, force: true })
		}
	})

	it("leaves the space bundle undefined when the open command holds none", () => {
		expect(sessionRequest(openCommand()).spacePluginPath).toBeUndefined()
	})

	it("loads the space bundle and its memory line for a space open command", () => {
		const request = sessionRequest(
			openCommand({
				agent: "bean",
				pluginPath: "/bots/b1",
				spacePluginPath: spacePath,
			}),
		)
		const options = buildOptions(request, undefined)

		expect(options.plugins).toContainEqual({
			type: "local",
			path: spacePath,
		})
		expect(options.systemPrompt).toMatchObject({
			append: expect.stringContaining(spaceLine(spacePath)),
		})
	})

	it("answers an interrupt for a session it does not hold with a frame naming it", async () => {
		const written = await interrupted("never-opened", false)

		expect(written).toEqual([
			{
				session: "never-opened",
				frame: {
					type: "interrupt_failed",
					detail: "the sidecar holds no open session never-opened",
				},
			},
		])
	})

	it("answers an interrupt the query rejects with a frame naming the session and the error", async () => {
		const written = await interrupted("k1", true)

		expect(written.at(-1)).toEqual({
			session: "k1",
			frame: {
				type: "interrupt_failed",
				detail: "the query is already closed",
			},
		})
	})

	it(
		"leaves on the host's EOF",
		async () => {
			const { exitCode } = await served([
				JSON.stringify({ type: "prompt", session: "never-opened", text: "hi" }),
			])

			expect(exitCode).toBe(0)
		},
		SIDECAR_TIMEOUT,
	)
})
