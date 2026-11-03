import { describe, expect, it } from "bun:test"

import { createPromptStream } from "./prompt-stream"

const PROMPT_UUID = "6f1c2a4e-8d3b-4f7a-9c21-0b5e7d4a3f10"

const firstPushed = async (text: string, uuid?: string) => {
	const prompts = createPromptStream()
	prompts.push(text, uuid)
	const { value } = await prompts.stream[Symbol.asyncIterator]().next()
	return value
}

describe("createPromptStream", () => {
	it("stamps the uuid the host minted on the prompt, so the SDK echoes it on the turn answering it", async () => {
		expect((await firstPushed("hello", PROMPT_UUID))?.uuid).toBe(PROMPT_UUID)
	})

	it("stamps nothing that is not a uuid", async () => {
		expect(await firstPushed("hello", "not-a-uuid")).not.toHaveProperty("uuid")
		expect(await firstPushed("hello")).not.toHaveProperty("uuid")
	})
})
