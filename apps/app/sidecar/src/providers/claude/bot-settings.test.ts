import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import permissionModes from "@workspace/shared/permission-modes.json"

import { readBotSettings } from "./bot-settings"

import type { SessionRequest } from "../provider"

let bundle: string

const request: SessionRequest = {
	cwd: "/tmp",
	partialMessages: true,
	pluginPath: "/bots/b1",
	agent: "bean",
}

const written = (contents: string): SessionRequest => {
	const path = join(bundle, "settings.json")
	writeFileSync(path, contents)
	return { ...request, settingsPath: path }
}

const declaring = (settings: Record<string, unknown>): SessionRequest =>
	written(JSON.stringify(settings))

beforeEach(() => {
	bundle = mkdtempSync(join(tmpdir(), "bot-settings-"))
})

afterEach(() => {
	rmSync(bundle, { recursive: true, force: true })
})

describe("readBotSettings", () => {
	it("locks bypass out under auto with the host's style when there is no file", () => {
		const { options, rejection } = readBotSettings({
			...request,
			outputStyle: "Concise",
		})

		expect(options.permissionMode).toBe("auto")
		expect(options.settings).toEqual({
			permissions: { disableBypassPermissionsMode: "disable" },
			outputStyle: "Concise",
		})
		expect(rejection).toBeUndefined()
	})

	it("carries the rules the file declares and locks bypass out", () => {
		const { options } = readBotSettings(
			declaring({
				permissions: {
					allow: ["Read(**)", "Bash(ls:*)"],
					ask: ["Bash(rm:*)"],
					deny: ["WebFetch"],
				},
			}),
		)

		expect(options.settings).toEqual({
			permissions: {
				allow: ["Read(**)", "Bash(ls:*)"],
				ask: ["Bash(rm:*)"],
				deny: ["WebFetch"],
				disableBypassPermissionsMode: "disable",
			},
		})
	})

	it("opens under the mode the file names, and under auto without one", () => {
		expect(
			readBotSettings(
				declaring({ permissions: { defaultMode: "acceptEdits" } }),
			).options.permissionMode,
		).toBe("acceptEdits")
		expect(
			readBotSettings(declaring({ permissions: { allow: ["Read(**)"] } }))
				.options.permissionMode,
		).toBe("auto")
	})

	it("refuses bypassPermissions, says why, and opens under auto", () => {
		const { options, rejection } = readBotSettings(
			declaring({ permissions: { defaultMode: "bypassPermissions" } }),
		)

		expect(options.permissionMode).toBe("auto")
		expect(rejection).toContain("bypassPermissions")
	})

	it("widens the scope to no directory the file names, and says so", () => {
		const { options, rejection } = readBotSettings(
			declaring({
				permissions: { additionalDirectories: ["/shared/notes"] },
			}),
		)

		expect(options.settings?.permissions).toEqual({
			disableBypassPermissionsMode: "disable",
		})
		expect(rejection).toContain("permissions.additionalDirectories")
	})

	it("carries the style the file names over the one the host names", () => {
		const styled = {
			...declaring({ outputStyle: "default" }),
			outputStyle: "Concise",
		}

		expect(readBotSettings(styled).options.settings?.outputStyle).toBe(
			"default",
		)
		expect(
			readBotSettings({ ...declaring({}), outputStyle: "Concise" }).options
				.settings?.outputStyle,
		).toBe("Concise")
	})

	it("keeps none of the keys it was not opened for, and names those it drops", () => {
		const { options, rejection } = readBotSettings(
			declaring({
				model: "opus",
				hooks: { PreToolUse: [] },
				env: { TOKEN: "secret" },
				sandbox: { enabled: false },
				permissions: { allow: ["Read(**)"] },
			}),
		)

		expect(options.settings).toEqual({
			permissions: {
				allow: ["Read(**)"],
				disableBypassPermissionsMode: "disable",
			},
		})
		expect(rejection).toContain("model")
		expect(rejection).toContain("hooks")
		expect(rejection).toContain("env")
		expect(rejection).toContain("sandbox")
	})

	it("opens without the file when it is unreadable, and says why", () => {
		const missing = readBotSettings({
			...request,
			settingsPath: join(bundle, "absent.json"),
			outputStyle: "Concise",
		})
		const broken = readBotSettings({
			...written("{ nope"),
			outputStyle: "Concise",
		})
		const listed = readBotSettings(written("[]"))

		for (const { options, rejection } of [missing, broken, listed]) {
			expect(options.permissionMode).toBe("auto")
			expect(options.settings?.permissions).toEqual({
				disableBypassPermissionsMode: "disable",
			})
			expect(rejection).toBeTruthy()
		}
		expect(missing.options.settings?.outputStyle).toBe("Concise")
	})

	it("refuses bypass in the shared modes and holds their fallback among them", () => {
		expect(permissionModes.modes).not.toContain("bypassPermissions")
		expect(permissionModes.modes).toContain(permissionModes.fallback)
	})

	it("opens under every mode the shared file lists", () => {
		for (const mode of permissionModes.modes) {
			const { options } = readBotSettings(
				declaring({ permissions: { defaultMode: mode } }),
			)

			expect<string>(options.permissionMode).toBe(mode)
		}
	})
})
