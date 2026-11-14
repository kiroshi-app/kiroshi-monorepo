import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"

import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { GUIDES } from "./guide-tool"
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
	env: {},
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

const TEACHINGS = [
	{
		id: "conversations skill",
		text: systemSkill("conversations"),
		covers: (name: string) =>
			name.startsWith("conversation_") || name === "companion_list",
	},
	{
		id: "missions skill",
		text: systemSkill("missions"),
		covers: (name: string) => name.startsWith("mission_"),
	},
	{
		id: "boards and documents guides",
		text: `${GUIDES.boards}\n${GUIDES.documents}`,
		covers: (name: string) =>
			name.startsWith("library_") ||
			name.startsWith("document_") ||
			name.startsWith("board_"),
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

	it("instructs the agent to call get_guide once per session before any library, document, board or screenshot call", async () => {
		const server = kiroshiServer(scope)[
			KIROSHI_SERVER
		] as McpSdkServerConfigWithInstance
		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
		const client = new Client({ name: "kiroshi-test", version: "0" })
		await server.instance.connect(serverSide)
		await client.connect(clientSide)

		const instructions = client.getInstructions() ?? ""
		await client.close()

		expect(instructions).toContain("get_guide once per session")
		for (const named of ["library_", "document_", "board_", "screenshot"]) {
			expect(instructions).toContain(named)
		}
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

	it("carries the delegate tool and every routine, mission, application, companion, bundle, library and comment tool of the session", () => {
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
			"get_guide",
			"library_list",
			"library_search",
			"library_read",
			"library_create",
			"library_import",
			"library_rename",
			"library_delete",
			"conversation_post_document",
			"document_info",
			"document_tree",
			"document_read_block",
			"document_insert_after",
			"document_replace_block",
			"document_delete_block",
			"document_find",
			"board_create",
			"board_info",
			"board_tree",
			"board_node_info",
			"board_canvas",
			"board_write",
			"board_update",
			"board_move",
			"board_duplicate",
			"board_delete",
			"board_find",
			"board_view",
			"screenshot",
			"comment_list",
			"comment_read",
			"comment_reply",
		])
	})

	for (const { id, text, covers } of TEACHINGS) {
		it(`names in the ${id} every tool of its set the server registers, and none it does not`, () => {
			const named = toolsNamedIn(text)

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
