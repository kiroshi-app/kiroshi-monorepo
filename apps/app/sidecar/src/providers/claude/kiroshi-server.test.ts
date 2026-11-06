import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"

import {
	DELEGATE_TOOL,
	KIROSHI_SERVER,
	type KiroshiScope,
	kiroshiServer,
	kiroshiTools,
} from "./kiroshi-server"
import { KIROSHI_LAYER } from "./system-layer"

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

const SKILL_TOOL =
	/\b(?:conversation|companion|mission|document|library|board)_[a-z_]+/g

const toolsNamedIn = (skill: string) => new Set(skill.match(SKILL_TOOL))

const registeredNames = kiroshiTools(scope).map((held) => held.name)

const SKILLS = [
	{
		id: "conversations",
		covers: (name: string) =>
			name.startsWith("conversation_") || name === "companion_list",
	},
	{ id: "missions", covers: (name: string) => name.startsWith("mission_") },
	{
		id: "library",
		covers: (name: string) =>
			name.startsWith("library_") || name.startsWith("board_"),
	},
]

const flat = (text: string) => text.split(/\s+/).join(" ")

const SHOWS_A_FILE_INSIDE_THE_MESSAGE =
	"sits inside your message as the markdown line"

const SHOWS_A_FILE_THROUGH_THE_TOOL =
	/To show a file, call|through `conversation_attach`|Show any file/

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

	it("carries the delegate tool and every routine, mission, application, companion, bundle and library tool of the session", () => {
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
			"library_list",
			"library_search",
			"library_read",
			"library_create",
			"library_write",
			"library_import",
			"library_rename",
			"library_delete",
			"conversation_post_document",
			"board_create",
			"board_read",
			"board_add",
			"board_update",
			"board_remove",
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

	it("says in every place an agent reads about showing a file that the file sits inside its message", () => {
		const attach = kiroshiTools(scope).find(
			(held) => held.name === "conversation_attach",
		)
		const readings = [
			systemSkill("conversations"),
			systemSkill("rich-answers"),
			attach?.description ?? "",
			KIROSHI_LAYER,
		].map(flat)

		for (const reading of readings) {
			expect(reading).toContain(SHOWS_A_FILE_INSIDE_THE_MESSAGE)
			expect(reading).not.toMatch(SHOWS_A_FILE_THROUGH_THE_TOOL)
		}
	})
})
