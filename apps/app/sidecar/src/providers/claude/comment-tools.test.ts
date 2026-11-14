import { afterEach, describe, expect, it } from "bun:test"

import { z } from "zod"

import { commentTools } from "./comment-tools"

import type { SessionFrame } from "../provider"
import {
	closeHostChannel,
	type HostError,
	openHostChannel,
	settleHostAnswer,
} from "../../host"

const SESSION = "k1"

const A_THREAD = { name: "notes.md", threadId: "t1" }

const A_REPLY = { ...A_THREAD, text: "Done, the date is fixed." }

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

const tools = commentTools(SESSION)

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

describe("commentTools", () => {
	it("serves the tool that lists the threads of an item, the one that reads a thread and the one that replies in it", () => {
		expect(tools.map((held) => held.name)).toEqual([
			"comment_list",
			"comment_read",
			"comment_reply",
		])
	})

	it("takes no space and no author in any tool, the Space of the conversation and the agent of the session being the only ones", () => {
		for (const held of tools) {
			const fields = Object.keys(held.inputSchema)
			expect(fields).not.toContain("space")
			expect(fields).not.toContain("spaceId")
			expect(fields).not.toContain("author")
			expect(fields).not.toContain("mentions")
		}
	})

	it("takes the item, then the thread, then the text of the reply", () => {
		expect(fieldsOf("comment_list").required).toEqual(["name"])
		expect(fieldsOf("comment_read").required).toEqual(["name", "threadId"])
		expect(fieldsOf("comment_reply").required).toEqual([
			"name",
			"threadId",
			"text",
		])
	})

	it("hands each call to the library host of its session under its operation", async () => {
		const asked = aHost(() => ({ result: {} }))
		const calls: [string, string, Record<string, unknown>][] = [
			["comment_list", "commentList", { name: "notes.md" }],
			["comment_read", "commentRead", A_THREAD],
			["comment_reply", "commentReply", A_REPLY],
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

	it("speaks the thread a reply landed in back as text", async () => {
		const answer = { threadId: "t1", comments: 2 }
		aHost(() => ({ result: answer }))

		const result = await called("comment_reply", A_REPLY)

		expect(spoken(result)).toEqual(answer)
		expect(result.isError).toBeUndefined()
	})

	it("speaks back the refusal naming a thread the item does not hold", async () => {
		const refusal = { kind: "unknownThread", id: "gone" }
		aHost(() => ({ error: refusal }))

		const result = await called("comment_reply", {
			...A_REPLY,
			threadId: "gone",
		})

		expect(spoken(result)).toEqual(refusal)
		expect(result.isError).toBe(true)
	})
})
