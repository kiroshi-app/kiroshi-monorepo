import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { agentStderr } from "./agent-stderr"

const original = process.stderr.write
let written: string[] = []

beforeEach(() => {
	written = []
	process.stderr.write = ((line: string) => {
		written.push(String(line))
		return true
	}) as typeof process.stderr.write
})

afterEach(() => {
	process.stderr.write = original
})

describe("agentStderr", () => {
	it("forwards a line split across two reads whole, tagged with its source", () => {
		const forward = agentStderr("title")

		forward("token half-of-")
		expect(written).toEqual([])
		forward("the-value\n")

		expect(written).toEqual(["[agent title] token half-of-the-value\n"])
	})

	it("forwards every complete line of one read and holds the unfinished one", () => {
		const forward = agentStderr("session s1")

		forward("first\n\nsecond\nthird")

		expect(written).toEqual([
			"[agent session s1] first\n",
			"[agent session s1] second\n",
		])
	})

	it("holds no more than one capped line while no newline arrives", () => {
		const forward = agentStderr("models")

		forward("x".repeat(3000))
		forward("x".repeat(3000))
		forward("\n")

		expect(written).toEqual([`[agent models] ${"x".repeat(2048)}\n`])
	})
})
