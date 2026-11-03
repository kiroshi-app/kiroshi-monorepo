import { afterEach, describe, expect, it } from "bun:test"

import { z } from "zod"

import {
	DOCUMENT_READ_TOOL_NAME,
	DOCUMENT_WRITE_TOOL_NAME,
	documentTools,
} from "./document-tools"

import type { SessionFrame } from "../provider"
import {
	closeHostChannel,
	type HostError,
	openHostChannel,
	settleHostAnswer,
} from "../../host"

const SESSION = "k1"

const A_WRITE = { name: "notes.md", text: "A paragraph.", after: "# Notes" }

const A_REFUSAL = { kind: "passageNotUnique" }

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

const theTool = (name: string) => {
	const found = documentTools(SESSION).find((held) => held.name === name)
	if (!found) {
		throw new Error(`the server carries no tool named ${name}`)
	}
	return found
}

const spoken = (
	result: Awaited<ReturnType<ReturnType<typeof theTool>["handler"]>>,
) => JSON.parse((result.content[0] as { text: string }).text) as unknown

afterEach(() => {
	closeHostChannel(SESSION)
})

describe("documentTools", () => {
	it("serves document_read and document_write", () => {
		expect(documentTools(SESSION).map((held) => held.name)).toEqual([
			DOCUMENT_READ_TOOL_NAME,
			DOCUMENT_WRITE_TOOL_NAME,
		])
	})

	it("takes a name to read, and a name, a text and an optional passage to write after, never a space", () => {
		const read = z.toJSONSchema(
			z.object(theTool(DOCUMENT_READ_TOOL_NAME).inputSchema),
		)
		const write = z.toJSONSchema(
			z.object(theTool(DOCUMENT_WRITE_TOOL_NAME).inputSchema),
		)

		expect(read.required).toEqual(["name"])
		expect(write.required).toEqual(["name", "text"])
		expect(Object.keys(write.properties ?? {})).toEqual([
			"name",
			"text",
			"after",
		])
	})

	it("hands a write to the library host of its session and speaks the answer back", async () => {
		const answer = { name: "notes.md", characters: 12 }
		const asked = aHost(() => ({ result: answer }))

		const result = await theTool(DOCUMENT_WRITE_TOOL_NAME).handler(
			A_WRITE,
			undefined,
		)

		expect(asked).toEqual([
			{ subtype: "library", operation: "write", payload: A_WRITE },
		])
		expect(spoken(result)).toEqual(answer)
		expect(result.isError).toBeUndefined()
	})

	it("speaks a refusal back as the result of the call", async () => {
		aHost(() => ({ error: A_REFUSAL }))

		const result = await theTool(DOCUMENT_READ_TOOL_NAME).handler(
			{ name: "notes.md" },
			undefined,
		)

		expect(spoken(result)).toEqual(A_REFUSAL)
		expect(result.isError).toBe(true)
	})
})
