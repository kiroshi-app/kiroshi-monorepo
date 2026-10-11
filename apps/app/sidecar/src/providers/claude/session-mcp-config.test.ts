import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { openClaudeSession } from "./session"

import type { SessionFrame, SessionRequest } from "../provider"

const SECRET = "sk-live-secret-value"
const CONFIG_PREFIX = "kiroshi-mcp-"

type Behaviour = "crash" | "serve"

type Recorded = {
	args: string[]
	mode: number
	config: { mcpServers: Record<string, { env?: Record<string, string> }> }
}

const fakeClaude = (
	record: string,
	behaviour: Behaviour,
): string => `#!${process.execPath}
const { readFileSync, statSync, writeFileSync } = require("node:fs")
const args = process.argv.slice(2)
const path = args[args.indexOf("--mcp-config") + 1]
writeFileSync(${JSON.stringify(record)}, JSON.stringify({
	args,
	mode: statSync(path).mode & 0o777,
	config: JSON.parse(readFileSync(path, "utf8")),
}))
if (${JSON.stringify(behaviour)} === "crash") process.exit(1)
let buffered = ""
process.stdin.on("data", (chunk) => {
	buffered += chunk
	const lines = buffered.split("\\n")
	buffered = lines.pop()
	for (const line of lines.filter(Boolean)) {
		const message = JSON.parse(line)
		if (message.type === "control_request" && message.request.subtype === "initialize") {
			process.stdout.write(JSON.stringify({
				type: "control_response",
				response: { subtype: "success", request_id: message.request_id, response: { commands: [] } },
			}) + "\\n")
		}
	}
})
process.stdin.on("end", () => process.exit(0))
`

const inheritedTmpdir = process.env.TMPDIR
const inheritedExecutable = process.env[EXECUTABLE_OVERRIDE_ENV]
let workspace = ""
let temp = ""
let record = ""
let request: SessionRequest

const restore = (name: string, value: string | undefined) => {
	if (value === undefined) {
		delete process.env[name]
	} else {
		process.env[name] = value
	}
}

const installClaude = (behaviour: Behaviour) => {
	const executable = join(workspace, "claude")
	writeFileSync(executable, fakeClaude(record, behaviour))
	chmodSync(executable, 0o755)
	process.env[EXECUTABLE_OVERRIDE_ENV] = executable
}

const configDirectories = (): string[] =>
	readdirSync(temp).filter((entry) => entry.startsWith(CONFIG_PREFIX))

const recorded = (): Recorded => JSON.parse(readFileSync(record, "utf8"))

const closedFrame = () => {
	const closed = Promise.withResolvers<SessionFrame>()
	const emit = (frame: SessionFrame) => {
		if (frame.type === "closed") {
			closed.resolve(frame)
		}
	}
	return { closed: closed.promise, emit }
}

const rejectionOf = async (opening: Promise<unknown>): Promise<string> => {
	try {
		await opening
	} catch (error) {
		return error instanceof Error ? error.message : String(error)
	}
	throw new Error("the session opened")
}

beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), "kiroshi-session-mcp-"))
	temp = join(workspace, "tmp")
	record = join(workspace, "record.json")
	const bundle = join(workspace, "bundle")
	mkdirSync(temp)
	mkdirSync(bundle)
	writeFileSync(
		join(bundle, ".mcp.json"),
		JSON.stringify({
			mcpServers: { clock: { command: "run", env: { TOKEN: "${TOKEN}" } } },
		}),
	)
	request = {
		cwd: workspace,
		partialMessages: false,
		pluginPath: bundle,
		agent: "bean",
		serverEnv: { base: { TOKEN: SECRET } },
	}
	process.env.TMPDIR = temp
})

afterEach(() => {
	restore("TMPDIR", inheritedTmpdir)
	restore(EXECUTABLE_OVERRIDE_ENV, inheritedExecutable)
	rmSync(workspace, { recursive: true, force: true })
})

describe("openClaudeSession", () => {
	it("hands Claude Code an owner-only config file by path, and removes it on close", async () => {
		installClaude("serve")
		const { emit } = closedFrame()

		const session = await openClaudeSession(request, emit)
		const { args, mode, config } = recorded()

		expect(configDirectories()).toHaveLength(1)
		expect(args.join(" ")).not.toContain(SECRET)
		expect(mode).toBe(0o600)
		expect(config.mcpServers.clock?.env?.TOKEN).toBe(SECRET)

		await session.close()

		expect(configDirectories()).toEqual([])
	})

	it("removes the config directory when Claude Code dies before it initialises", async () => {
		installClaude("crash")
		const { closed, emit } = closedFrame()

		await rejectionOf(openClaudeSession(request, emit))
		await closed

		expect(recorded().config.mcpServers.clock?.env?.TOKEN).toBe(SECRET)
		expect(configDirectories()).toEqual([])
	})

	it("removes the config directory before rethrowing what the launch threw", async () => {
		process.env[EXECUTABLE_OVERRIDE_ENV] = join(workspace, "absent")

		const rejection = await rejectionOf(openClaudeSession(request, () => {}))

		expect(rejection).toContain("No spawnable Claude Code executable")
		expect(configDirectories()).toEqual([])
	})

	it("rejects with the write failure, and spawns nothing with the servers inline", async () => {
		installClaude("crash")
		process.env.TMPDIR = join(workspace, "missing")

		const rejection = await rejectionOf(openClaudeSession(request, () => {}))

		expect(rejection).toContain("ENOENT")
		expect(existsSync(record)).toBe(false)
	})
})
