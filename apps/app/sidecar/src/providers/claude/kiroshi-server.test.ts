import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"

import {
	DELEGATE_TOOL,
	KIROSHI_SERVER,
	type KiroshiScope,
	kiroshiServer,
	kiroshiTools,
} from "./kiroshi-server"

const scope: KiroshiScope = {
	cwd: "/tmp",
	floor: {
		home: "/home",
		platform: "darwin",
		pluginPaths: [],
		writablePaths: [],
	},
	managedSettings: {},
	session: "k1",
}

const systemSkill = (id: string) =>
	readFileSync(
		new URL(
			`../../../../src-tauri/plugins/kiroshi/skills/${id}/SKILL.md`,
			import.meta.url,
		),
		"utf8",
	)

const SKILL_TOOL = /\b(?:conversation|companion|mission)_[a-z_]+/g

const toolsNamedIn = (skill: string) => new Set(skill.match(SKILL_TOOL))

const registeredNames = kiroshiTools(scope).map((held) => held.name)

const SKILLS = [
	{
		id: "conversations",
		covers: (name: string) =>
			name.startsWith("conversation_") || name === "companion_list",
	},
	{ id: "missions", covers: (name: string) => name.startsWith("mission_") },
]

const NAMES_A_SECRET = /key|secret|token|password|credential|value|header/i

describe("kiroshiServer", () => {
	it("bridges one in-process server under the name its tools answer to", () => {
		const servers = kiroshiServer(scope)

		expect(Object.keys(servers)).toEqual([KIROSHI_SERVER])
		expect(servers[KIROSHI_SERVER]?.type).toBe("sdk")
		expect(DELEGATE_TOOL).toBe(`mcp__${KIROSHI_SERVER}__delegate`)
	})

	it("carries the three application tools and none of them takes a secret value", () => {
		const applications = kiroshiTools(scope).filter((held) =>
			held.name.startsWith("application_"),
		)

		expect(applications.map((held) => held.name)).toEqual([
			"application_search",
			"application_install",
			"application_status",
		])
		for (const held of applications) {
			for (const field of Object.keys(held.inputSchema)) {
				expect(field).not.toMatch(NAMES_A_SECRET)
			}
		}
	})

	it("carries the delegate tool and every routine, mission, application, companion and bundle tool of the session", () => {
		expect(kiroshiTools(scope).map((held) => held.name)).toEqual([
			"delegate",
			"routine_list",
			"routine_trigger_sources",
			"routine_create",
			"routine_update",
			"routine_run_now",
			"routine_delete",
			"mission_open",
			"mission_note",
			"mission_status",
			"mission_escalate",
			"mission_close",
			"mission_watch",
			"mission_list",
			"mission_read",
			"mission_reopen",
			"mission_update",
			"mission_handoff",
			"application_search",
			"application_install",
			"application_status",
			"companion_suggestions",
			"companion_create",
			"companion_first_run_done",
			"companion_list",
			"conversation_open",
			"conversation_say",
			"conversation_attach",
			"conversation_update",
			"conversation_list",
			"conversation_read",
			"conversation_search",
			"conversation_close",
			"bundle_write",
		])
	})

	for (const { id, covers } of SKILLS) {
		it(`names in the ${id} skill every tool of its set the server registers, and none it does not`, () => {
			const named = toolsNamedIn(systemSkill(id))

			expect(
				registeredNames.filter(covers).filter((name) => !named.has(name)),
			).toEqual([])
			expect(
				[...named].filter((name) => !registeredNames.includes(name)),
			).toEqual([])
		})
	}
})
