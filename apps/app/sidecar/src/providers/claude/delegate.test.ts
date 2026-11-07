import { describe, expect, it } from "bun:test"

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"

import { claudeSourceExecutable } from "./build"
import { type DelegateScope, delegateOptions, reportOf } from "./delegate"
import { EXECUTABLE_OVERRIDE_ENV } from "./executable"

process.env[EXECUTABLE_OVERRIDE_ENV] = claudeSourceExecutable()

const streaming = async function* (
	...messages: SDKMessage[]
): AsyncIterable<SDKMessage> {
	yield* messages
}

const resulting = (message: Record<string, unknown>) =>
	({ type: "result", ...message }) as unknown as SDKMessage

const assistant = resulting({ subtype: "success", result: "Four callers." })

describe("reportOf", () => {
	it("hands back the text of the run that succeeded", async () => {
		expect(await reportOf(streaming(assistant))).toBe("Four callers.")
	})

	it("reads past everything the nested run said on its way there", async () => {
		const chatter = { type: "assistant" } as unknown as SDKMessage

		expect(await reportOf(streaming(chatter, chatter, assistant))).toBe(
			"Four callers.",
		)
	})

	it("names the failure when the run ends on anything but a success", async () => {
		const failing = resulting({ subtype: "error_max_turns" })

		expect(await reportOf(streaming(failing))).toContain("error_max_turns")
	})

	it("names the failure when the run ends without a result at all", async () => {
		expect(await reportOf(streaming())).toContain("before reporting")
	})
})

const scopeWith = (overrides: Partial<DelegateScope>): DelegateScope => ({
	cwd: "/work",
	env: {},
	managedSettings: {},
	...overrides,
})

describe("delegateOptions", () => {
	it("runs the nested agent under the env it is handed, not the sidecar's", () => {
		const env = { PATH: "/bin", HOME: "/home/reader" }

		expect(delegateOptions(scopeWith({ env })).env).toEqual(env)
	})

	it("offers the nested agent reading and searching, and nothing that reaches the web", () => {
		const { tools, allowedTools } = delegateOptions(scopeWith({}))

		expect(tools).toEqual(["Read", "Glob", "Grep"])
		expect(allowedTools).toEqual(["Read", "Glob", "Grep"])
		for (const webTool of ["WebFetch", "WebSearch"]) {
			expect(tools).not.toContain(webTool)
			expect(allowedTools).not.toContain(webTool)
		}
	})

	it("reads no settings of its own beyond the floor it is handed", () => {
		const managedSettings = { permissions: { deny: ["Bash"] } }
		const options = delegateOptions(scopeWith({ managedSettings }))

		expect(options.settingSources).toEqual([])
		expect(options.managedSettings).toBe(managedSettings)
	})
})
