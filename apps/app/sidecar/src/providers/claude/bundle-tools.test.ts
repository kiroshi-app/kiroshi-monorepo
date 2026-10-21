import { afterEach, describe, expect, it } from "bun:test"

import { z } from "zod"

import { BUNDLE_WRITE_TOOL_NAME, bundleTools } from "./bundle-tools"

import type { SessionFrame } from "../provider"
import {
	closeHostChannel,
	type HostError,
	openHostChannel,
	settleHostAnswer,
} from "../../host"

const SESSION = "k1"

const A_WRITE = {
	path: "skills/baking/SKILL.md",
	text: "Bake on Sundays.",
	title: "Kept the baking day",
	summary: "They bake on Sundays.",
}

const A_RECORDED = { outcome: "recorded", commitId: "c0ffee" }

const A_REFUSAL = {
	kind: "forbiddenPath",
	reason: "hooks is not yours to write",
}

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

const theTool = (session: string | undefined = SESSION) => {
	const found = bundleTools(session).find(
		(held) => held.name === BUNDLE_WRITE_TOOL_NAME,
	)
	if (!found) {
		throw new Error(
			`the server carries no tool named ${BUNDLE_WRITE_TOOL_NAME}`,
		)
	}
	return found
}

const spoken = (
	result: Awaited<ReturnType<ReturnType<typeof theTool>["handler"]>>,
) => JSON.parse((result.content[0] as { text: string }).text) as unknown

afterEach(() => {
	closeHostChannel(SESSION)
})

describe("bundleTools", () => {
	it("serves bundle_write alone", () => {
		expect(bundleTools(SESSION).map((held) => held.name)).toEqual([
			"bundle_write",
		])
	})

	it("takes a path, a text, a title and a summary, every one required, and no bundle or bot", () => {
		const schema = z.toJSONSchema(z.object(theTool().inputSchema))

		expect(schema.required).toEqual(["path", "text", "title", "summary"])
		expect(Object.keys(theTool().inputSchema)).not.toContain("botId")
		expect(Object.keys(theTool().inputSchema)).not.toContain("bundle")
	})

	it("hands the call to the bundle host of its session and speaks the answer back", async () => {
		const asked = aHost(() => ({ result: A_RECORDED }))

		const result = await theTool().handler(A_WRITE, undefined)

		expect(asked).toEqual([
			{ subtype: "bundle", operation: "write", payload: A_WRITE },
		])
		expect(spoken(result)).toEqual(A_RECORDED)
		expect(result.isError).toBeUndefined()
	})

	it("speaks a refusal back as the result of the call", async () => {
		aHost(() => ({ error: A_REFUSAL }))

		const result = await theTool().handler(A_WRITE, undefined)

		expect(spoken(result)).toEqual(A_REFUSAL)
		expect(result.isError).toBe(true)
	})

	it("refuses a call carried by a session that holds no channel", async () => {
		const result = await theTool(undefined).handler(A_WRITE, undefined)

		expect(spoken(result)).toMatchObject({ kind: "undeliverable" })
		expect(result.isError).toBe(true)
	})
})
