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

const A_WRITE = { name: "notes.md", text: "A paragraph.", after: "# Notes" }

const A_REFUSAL = { kind: "missing", name: "notes.md" }

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
	it("serves the eight library tools and no document tool", () => {
		expect(tools.map((held) => held.name)).toEqual([
			"library_list",
			"library_search",
			"library_read",
			"library_create",
			"library_write",
			"library_import",
			"library_rename",
			"library_delete",
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
		expect(fieldsOf("library_write").required).toEqual(["name", "text"])
		expect(Object.keys(fieldsOf("library_write").properties ?? {})).toEqual([
			"name",
			"text",
			"after",
		])
		expect(fieldsOf("library_import").required).toEqual(["path"])
		expect(fieldsOf("library_rename").required).toEqual(["name", "newName"])
		expect(fieldsOf("library_delete").required).toEqual(["name"])
	})

	it("hands each call to the library host of its session under its operation", async () => {
		const asked = aHost(() => ({ result: {} }))
		const calls: [string, string, Record<string, unknown>][] = [
			["library_list", "list", { kind: "image", limit: 2, cursor: "c" }],
			["library_search", "search", { query: "roadmap" }],
			["library_create", "create", { name: "a.md", template: "meeting-notes" }],
			["library_write", "write", A_WRITE],
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

	it("speaks a written answer back as text", async () => {
		const answer = { name: "notes.md", characters: 12 }
		aHost(() => ({ result: answer }))

		const result = await called("library_write", A_WRITE)

		expect(spoken(result)).toEqual(answer)
		expect(result.isError).toBeUndefined()
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
})
