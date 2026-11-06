import { afterEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { z } from "zod"

import type { AttachScope } from "./companion-tools"
import { libraryTools } from "./document-tools"

import type { SessionFrame } from "../provider"
import {
	closeHostChannel,
	type HostError,
	openHostChannel,
	settleHostAnswer,
} from "../../host"

const SESSION = "k1"

const HOME = realpathSync(mkdtempSync(join(tmpdir(), "kiroshi-library-")))

const SCOPE: AttachScope = {
	cwd: HOME,
	floor: { home: HOME, platform: "darwin", pluginPaths: [], writablePaths: [] },
}

const PRODUCED = join(HOME, "chart.png")

const SECRET = join(HOME, ".ssh", "key.png")

mkdirSync(join(HOME, ".ssh"))
writeFileSync(PRODUCED, "png")
writeFileSync(SECRET, "png")

const AN_INSERT = {
	name: "notes.md",
	after: "k3f9a2",
	markdown: "A paragraph.",
}

const A_REPLACE = { name: "notes.md", id: "k3f9a2", markdown: "# Launch" }

const A_REFUSAL = { kind: "missing", name: "notes.md" }

const A_DIAGRAM = {
	name: "plan.canvas",
	mode: "insert",
	nodes: [
		{ key: "idea", kind: "sticky", text: "Idea" },
		{
			key: "build",
			kind: "shape",
			text: "Build",
			place: { side: "right", of: "idea" },
		},
	],
	arrows: [{ key: "then", fromNode: "idea", toNode: "build", label: "then" }],
}

const A_HEADER = { name: "plan.canvas", updatedAt: 1, hash: "ab" }

type Asked = { subtype: string; operation: string; payload: unknown }

type Served = { result?: unknown; error?: HostError }

const aHost = (served: () => Served) => {
	const asked: Asked[] = []
	openHostChannel(SESSION, (frame: SessionFrame) => {
		const { requestId, request } = frame as {
			requestId: string
			request: Asked
		}
		asked.push(request)
		settleHostAnswer(SESSION, { requestId, ...served() })
	})
	return asked
}

const tools = libraryTools(SESSION, SCOPE)

const theTool = (name: string) => {
	const found = tools.find((held) => held.name === name)
	if (!found) {
		throw new Error(`the server carries no tool named ${name}`)
	}
	return found
}

const called = (name: string, input: Record<string, unknown>) =>
	theTool(name).handler(input, undefined)

const spoken = (result: Awaited<ReturnType<typeof called>>) =>
	JSON.parse((result.content[0] as { text: string }).text) as unknown

const fieldsOf = (name: string) =>
	z.toJSONSchema(z.object(theTool(name).inputSchema))

afterEach(() => {
	closeHostChannel(SESSION)
})

describe("libraryTools", () => {
	it("serves the seven library tools, the tool that posts a document, the seven document tools and the twelve board tools", () => {
		expect(tools.map((held) => held.name)).toEqual([
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
		])
	})

	it("takes no space in any tool, the Space of the conversation being the only one", () => {
		for (const held of tools) {
			expect(Object.keys(held.inputSchema)).not.toContain("space")
			expect(Object.keys(held.inputSchema)).not.toContain("spaceId")
		}
	})

	it("takes what each tool needs and makes optional what it can do without", () => {
		expect(fieldsOf("library_list").required).toBeUndefined()
		expect(Object.keys(fieldsOf("library_list").properties ?? {})).toEqual([
			"kind",
			"limit",
			"cursor",
		])
		expect(fieldsOf("library_search").required).toEqual(["query"])
		expect(fieldsOf("library_read").required).toEqual(["name"])
		expect(fieldsOf("library_create").required).toEqual(["name"])
		expect(fieldsOf("library_import").required).toEqual(["path"])
		expect(Object.keys(fieldsOf("library_import").properties ?? {})).toEqual([
			"path",
			"overwrite",
		])
		expect(fieldsOf("library_rename").required).toEqual(["name", "newName"])
		expect(fieldsOf("library_delete").required).toEqual(["name"])
		expect(fieldsOf("conversation_post_document").required).toEqual(["name"])
		expect(fieldsOf("document_info").required).toEqual(["name"])
		expect(fieldsOf("document_tree").required).toEqual(["name"])
		expect(fieldsOf("document_read_block").required).toEqual(["name", "id"])
		expect(fieldsOf("document_insert_after").required).toEqual([
			"name",
			"markdown",
		])
		expect(
			Object.keys(fieldsOf("document_insert_after").properties ?? {}),
		).toEqual(["name", "after", "markdown"])
		expect(fieldsOf("document_replace_block").required).toEqual([
			"name",
			"id",
			"markdown",
		])
		expect(fieldsOf("document_delete_block").required).toEqual(["name", "ids"])
		expect(fieldsOf("document_find").required).toEqual(["name", "text"])
		expect(fieldsOf("board_create").required).toEqual(["name"])
		expect(fieldsOf("board_info").required).toEqual(["name"])
		expect(fieldsOf("board_tree").required).toEqual(["name"])
		expect(Object.keys(fieldsOf("board_tree").properties ?? {})).toEqual([
			"name",
			"parent",
			"depth",
		])
		expect(fieldsOf("board_node_info").required).toEqual(["name"])
		expect(fieldsOf("board_canvas").required).toEqual(["name"])
		expect(fieldsOf("board_write").required).toEqual(["name", "mode"])
		expect(fieldsOf("board_update").required).toEqual(["name"])
		expect(fieldsOf("board_move").required).toEqual(["name", "nodes", "x", "y"])
		expect(fieldsOf("board_duplicate").required).toEqual(["name", "nodes"])
		expect(fieldsOf("board_delete").required).toEqual(["name"])
		expect(fieldsOf("board_find").required).toEqual(["name"])
		expect(fieldsOf("board_view").required).toEqual(["name", "id"])
	})

	it("hands each board call to the library host of its session under its operation", async () => {
		const asked = aHost(() => ({ result: {} }))
		const calls: [string, string, Record<string, unknown>][] = [
			["board_create", "boardCreate", { name: "plan.canvas" }],
			["board_info", "boardInfo", { name: "plan.canvas" }],
			[
				"board_tree",
				"boardTree",
				{ name: "plan.canvas", parent: "s", depth: 2 },
			],
			[
				"board_node_info",
				"boardNodeInfo",
				{ name: "plan.canvas", nodes: ["n1"], arrows: ["a1"] },
			],
			["board_canvas", "boardCanvas", { name: "plan.canvas", parent: "s" }],
			["board_write", "boardWrite", A_DIAGRAM],
			[
				"board_update",
				"boardUpdate",
				{
					name: "plan.canvas",
					nodes: [{ id: "n1", text: "Ship" }],
					arrows: [{ id: "a1", toSide: "top", bend: 20 }],
				},
			],
			[
				"board_move",
				"boardMove",
				{ name: "plan.canvas", nodes: ["n1"], parent: "s", x: 0, y: 40 },
			],
			[
				"board_duplicate",
				"boardDuplicate",
				{ name: "plan.canvas", nodes: ["n1"] },
			],
			[
				"board_delete",
				"boardDelete",
				{ name: "plan.canvas", nodes: ["n1"], arrows: ["a1"] },
			],
			["board_find", "boardFind", { name: "plan.canvas", text: "ship" }],
			["board_view", "boardView", { name: "plan.canvas", id: "n1" }],
		]

		for (const [name, , input] of calls) {
			await called(name, input)
		}

		expect(asked).toEqual(
			calls.map(([, operation, payload]) => ({
				subtype: "library",
				operation,
				payload,
			})),
		)
	})

	it("shows an image node a person dropped on a board to the model as image content with the board header", async () => {
		const asked = aHost(() => ({
			result: {
				header: A_HEADER,
				form: "image",
				name: "cat.png",
				mimeType: "image/png",
				content: "cG5n",
			},
		}))

		const result = await called("board_view", {
			name: "plan.canvas",
			id: "photo",
		})

		expect(asked).toEqual([
			{
				subtype: "library",
				operation: "boardView",
				payload: { name: "plan.canvas", id: "photo" },
			},
		])
		expect(result.content).toEqual([
			{ type: "image", data: "cG5n", mimeType: "image/png" },
			{ type: "text", text: JSON.stringify({ header: A_HEADER }) },
		])
		expect(result.isError).toBeUndefined()
	})

	for (const [what, refusal] of [
		[
			"a sticky",
			{
				kind: "nodeNotShown",
				id: "note",
				reason: "notAnImage",
				nodeKind: "sticky",
			},
		],
		[
			"an image whose file is missing",
			{
				kind: "nodeNotShown",
				id: "lost",
				reason: "missingFile",
				file: "gone.png",
			},
		],
	] as const) {
		it(`refuses a board view of ${what} with the node id and the reason, and shows no image`, async () => {
			aHost(() => ({ error: refusal }))

			const result = await called("board_view", {
				name: "plan.canvas",
				id: refusal.id,
			})

			expect(result.isError).toBe(true)
			expect(result.content).toHaveLength(1)
			expect(result.content[0]?.type).toBe("text")
			expect(spoken(result)).toEqual(refusal)
		})
	}

	it("speaks back the index and the reason of a refused board item", async () => {
		const refusal = {
			kind: "invalidBoardItem",
			element: "node",
			index: 1,
			reason: "unknownKind",
		}
		aHost(() => ({ error: refusal }))

		const result = await called("board_write", A_DIAGRAM)

		expect(spoken(result)).toEqual(refusal)
		expect(result.isError).toBe(true)
	})

	it("hands each call to the library host of its session under its operation", async () => {
		const asked = aHost(() => ({ result: {} }))
		const calls: [string, string, Record<string, unknown>][] = [
			["library_list", "list", { kind: "image", limit: 2, cursor: "c" }],
			["library_search", "search", { query: "roadmap" }],
			["library_create", "create", { name: "a.md", template: "meeting-notes" }],
			["document_info", "documentInfo", { name: "notes.md" }],
			["document_tree", "documentTree", { name: "notes.md" }],
			[
				"document_read_block",
				"documentReadBlock",
				{ name: "notes.md", id: "k3f9a2" },
			],
			["document_insert_after", "documentInsertAfter", AN_INSERT],
			[
				"document_insert_after",
				"documentInsertAfter",
				{ name: "notes.md", markdown: "# Notes" },
			],
			["document_replace_block", "documentReplaceBlock", A_REPLACE],
			[
				"document_delete_block",
				"documentDeleteBlock",
				{ name: "notes.md", ids: ["k3f9a2", "p0q1r2"] },
			],
			["document_find", "documentFind", { name: "notes.md", text: "launch" }],
			["library_rename", "rename", { name: "a.md", newName: "b.md" }],
			["library_delete", "delete", { name: "b.md" }],
		]

		for (const [name, , input] of calls) {
			await called(name, input)
		}

		expect(asked).toEqual(
			calls.map(([, operation, payload]) => ({
				subtype: "library",
				operation,
				payload,
			})),
		)
	})

	it("speaks the ids of the written blocks back as text", async () => {
		const answer = { name: "notes.md", ids: ["m4n5o6"] }
		aHost(() => ({ result: answer }))

		const result = await called("document_insert_after", AN_INSERT)

		expect(spoken(result)).toEqual(answer)
		expect(result.isError).toBeUndefined()
	})

	it("speaks back the refusal naming a block id absent from the document and the tool that lists them", async () => {
		const refusal = {
			kind: "blockNotFound",
			id: "zzzzzz",
			detail:
				"no block of this document holds this id: call document_tree for the ids it holds",
		}
		aHost(() => ({ error: refusal }))

		const result = await called("document_replace_block", {
			...A_REPLACE,
			id: "zzzzzz",
		})

		expect(spoken(result)).toEqual(refusal)
		expect(result.isError).toBe(true)
	})

	it("tells the agent to read the tree first and to target a block by its id", () => {
		expect(theTool("document_tree").description).toContain(
			"Read the tree before you change a document",
		)
		for (const name of [
			"document_read_block",
			"document_replace_block",
			"document_delete_block",
		]) {
			expect(JSON.stringify(fieldsOf(name))).toContain(
				"as document_tree answered",
			)
		}
	})

	it("shows an image read to the model as image content", async () => {
		aHost(() => ({
			result: {
				form: "image",
				name: "cover.png",
				mimeType: "image/png",
				content: "cG5n",
			},
		}))

		const result = await called("library_read", { name: "cover.png" })

		expect(result.content).toEqual([
			{ type: "image", data: "cG5n", mimeType: "image/png" },
		])
	})

	it("speaks a document read back as text", async () => {
		const answer = {
			form: "text",
			name: "notes.md",
			kind: "document",
			text: "# Notes",
		}
		aHost(() => ({ result: answer }))

		const result = await called("library_read", { name: "notes.md" })

		expect(spoken(result)).toEqual(answer)
	})

	it("hands the host the resolved path of a file to import", async () => {
		const asked = aHost(() => ({ result: {} }))

		await called("library_import", { path: "chart.png" })

		expect(asked).toEqual([
			{ subtype: "library", operation: "import", payload: { path: PRODUCED } },
		])
	})

	it("hands the host the resolved path and the item an import overwrites", async () => {
		const asked = aHost(() => ({ result: {} }))

		await called("library_import", {
			path: "chart.png",
			overwrite: "chart.png",
		})

		expect(asked).toEqual([
			{
				subtype: "library",
				operation: "import",
				payload: { path: PRODUCED, overwrite: "chart.png" },
			},
		])
	})

	it("tells the agent that changing an item edits it in place, never a new one", () => {
		expect(theTool("document_replace_block").description).toContain(
			"editing it here in place, never creating a new one",
		)
		expect(theTool("library_import").description).toContain(
			"replaces it in place, never adding a new one",
		)
		expect(theTool("library_create").description).toContain(
			"edit its blocks with document_tree then document_replace_block or document_insert_after, never create another one",
		)
	})

	it("calls a board arrow an arrow in every board tool and field description", () => {
		const descriptionsIn = (schema: unknown): string[] => {
			if (typeof schema !== "object" || schema === null) return []
			return Object.entries(schema).flatMap(([field, value]) =>
				field === "description" && typeof value === "string"
					? [value]
					: descriptionsIn(value),
			)
		}
		const boardTools = tools.filter((held) => held.name.startsWith("board_"))
		for (const held of boardTools) {
			const descriptions = [
				held.description,
				...descriptionsIn(fieldsOf(held.name)),
			]
			for (const description of descriptions) {
				expect(description).not.toMatch(/\b(edge|connector)s?\b/i)
			}
		}
		expect(theTool("board_write").description).toContain(
			"An arrow names its ends",
		)
	})

	it("refuses to import a path the floor denies or that is gone, without asking the host", async () => {
		const asked = aHost(() => ({ result: {} }))

		const denied = await called("library_import", { path: SECRET })
		const gone = await called("library_import", { path: "gone.png" })

		expect(asked).toEqual([])
		expect(spoken(denied)).toEqual({ kind: "deniedPath", path: SECRET })
		expect(spoken(gone)).toMatchObject({
			kind: "unreadableFile",
			path: "gone.png",
		})
		expect(denied.isError).toBe(true)
		expect(gone.isError).toBe(true)
	})

	it("speaks a refusal back as the result of the call", async () => {
		aHost(() => ({ error: A_REFUSAL }))

		const result = await called("library_delete", { name: "notes.md" })

		expect(spoken(result)).toEqual(A_REFUSAL)
		expect(result.isError).toBe(true)
	})

	it("posts a document of the Library in this conversation and speaks the posted message back", async () => {
		const posted = {
			name: "notes.md",
			conversationId: "c1",
			messageId: "m1",
		}
		const asked = aHost(() => ({ result: posted }))

		const result = await called("conversation_post_document", {
			name: "notes.md",
		})

		expect(asked).toEqual([
			{
				subtype: "library",
				operation: "postDocument",
				payload: { name: "notes.md" },
			},
		])
		expect(spoken(result)).toEqual(posted)
		expect(result.isError).toBeUndefined()
	})

	it("speaks back the refusal naming a document the Library does not hold", async () => {
		const refusal = { kind: "missing", name: "gone.md" }
		aHost(() => ({ error: refusal }))

		const result = await called("conversation_post_document", {
			name: "gone.md",
		})

		expect(spoken(result)).toEqual(refusal)
		expect(result.isError).toBe(true)
	})
})
