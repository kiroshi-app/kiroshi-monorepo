import { afterAll, describe, expect, it } from "bun:test"

import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { GUIDE_TOOL_NAME, GUIDES, guideTool } from "./guide-tool"

const LIBRARY_TOOLS = [
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
]

const BOARD_TOOLS = [
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
]

const THE_LOOP = [
	"Orient with the cheap reads first",
	"at a time by id",
	"Screenshot what you wrote",
	"Fix what the screenshot shows",
	"Then the next section.",
	"Take at least one screenshot of what you wrote before you answer the person.",
]

const flat = (text: string) => text.split(/\s+/).join(" ")

const connected = async () => {
	const server = createSdkMcpServer({ name: "guide", tools: [guideTool()] })
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
	const client = new Client({ name: "guide-test", version: "0" })
	await server.instance.connect(serverSide)
	await client.connect(clientSide)
	return client
}

const client = await connected()

afterAll(() => client.close())

const textOf = (answer: Awaited<ReturnType<Client["callTool"]>>) =>
	(answer.content as { type: string; text: string }[])
		.map((part) => part.text)
		.join("\n")

const guideOn = (topic: string) =>
	client.callTool({ name: GUIDE_TOOL_NAME, arguments: { topic } })

describe("get_guide", () => {
	it("takes one required topic among boards and documents", async () => {
		const { tools } = await client.listTools()
		const schema = tools.find(
			(held) => held.name === GUIDE_TOOL_NAME,
		)?.inputSchema

		expect(schema?.required).toEqual(["topic"])
		expect(schema?.properties?.topic).toMatchObject({
			enum: ["boards", "documents"],
		})
	})

	it("answers the boards guide for the topic boards, naming every board tool and screenshot", async () => {
		const answer = await guideOn("boards")

		expect(answer.isError).toBeFalsy()
		expect(textOf(answer)).toBe(GUIDES.boards)
		for (const name of BOARD_TOOLS) {
			expect(GUIDES.boards).toContain(`\`${name}\``)
		}
	})

	it("answers the documents guide for the topic documents, naming every library and document tool, conversation_post_document and screenshot", async () => {
		const answer = await guideOn("documents")

		expect(answer.isError).toBeFalsy()
		expect(textOf(answer)).toBe(GUIDES.documents)
		for (const name of [...LIBRARY_TOOLS, "screenshot"]) {
			expect(GUIDES.documents).toContain(`\`${name}\``)
		}
	})

	it("answers an error naming the two topics for any other topic", async () => {
		const answer = await guideOn("paper")

		expect(answer.isError).toBe(true)
		expect(textOf(answer)).toContain(
			'expected one of \\"boards\\"|\\"documents\\"',
		)
	})

	it("names every tool the library skill named in at least one guide", () => {
		const guides = `${GUIDES.boards}\n${GUIDES.documents}`

		for (const name of [...LIBRARY_TOOLS, ...BOARD_TOOLS]) {
			expect(guides).toContain(`\`${name}\``)
		}
		expect(flat(GUIDES.documents)).toContain(
			"Read the tree first, then target a block by its id",
		)
	})

	for (const [topic, guide] of Object.entries(GUIDES)) {
		it(`states the loop and the screenshot before answering in the ${topic} guide`, () => {
			for (const said of THE_LOOP) {
				expect(flat(guide)).toContain(said)
			}
		})
	}

	it("orients each guide on info, then tree", () => {
		expect(flat(GUIDES.boards)).toContain("`board_info`, then `board_tree`")
		expect(flat(GUIDES.documents)).toContain(
			"`document_info`, then `document_tree`",
		)
	})
})
