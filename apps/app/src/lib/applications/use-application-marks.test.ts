// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import type { Application } from "./application-port"
import {
	createFakeApplicationPort,
	type FakeApplicationPort,
} from "./fake-application-port"
import { useApplicationMarks } from "./use-application-marks"
import { useApplications } from "./use-applications"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { BotMcpServer } from "../conversations/store-contract"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
})

const ATLAS: BotMcpServer = { name: "atlas", config: {} }

const LEDGER: BotMcpServer = { name: "ledger", config: {} }

const KEPT: BotMcpServer = {
	name: "linear",
	config: {},
	title: "Linear",
	logo: "<svg />",
}

const PAPER: Application = {
	name: "atlas",
	title: "Atlas",
	description: "Maps things.",
	config: { command: "npx", args: ["-y", "@atlas/mcp"] },
	tools: ["map"],
	install: { kind: "nothing" },
	logo: "<svg />",
}

const settled = () =>
	act(async () => {
		for (let round = 0; round < 3; round += 1) {
			await new Promise((resolve) => setTimeout(resolve, 0))
		}
	})

const askedNamesOf = (port: FakeApplicationPort) =>
	port.calls.filter((call) => call.command === "named").map((call) => call.name)

const asking = async (
	servers: BotMcpServer[],
	port = createFakeApplicationPort(),
	curated: Application[] = [],
) => {
	const rendered = renderHook(
		(declared: BotMcpServer[]) => useApplicationMarks(port, curated, declared),
		{ initialProps: servers, wrapper: createQueryTestWrapper().wrapper },
	)
	await settled()
	return { port, rendered }
}

describe("useApplicationMarks", () => {
	it("asks the host for every declared name that kept no mark", async () => {
		const { port } = await asking([ATLAS, KEPT])

		expect(askedNamesOf(port)).toEqual(["atlas"])
	})

	it("holds the mark the host answers for a name", async () => {
		const port = createFakeApplicationPort()
		port.found = [PAPER]

		const { rendered } = await asking([ATLAS], port)

		expect(rendered.result.current).toEqual({
			atlas: { title: "Atlas", mark: "<svg />" },
		})
	})

	it("leaves a row on its raw name while the lookup is in flight", () => {
		const port = createFakeApplicationPort()
		port.named = () => new Promise(() => undefined)

		const { result } = renderHook(
			() => useApplicationMarks(port, [], [ATLAS]),
			{ wrapper: createQueryTestWrapper().wrapper },
		)

		expect(result.current).toEqual({})
	})

	it("asks once for a name two panels declare, however often they render", async () => {
		const { port, rendered } = await asking([ATLAS, ATLAS])

		await act(async () => rendered.rerender([ATLAS]))

		expect(askedNamesOf(port)).toEqual(["atlas"])
	})

	it("asks for a name a panel declares later", async () => {
		const { port, rendered } = await asking([ATLAS])

		await act(async () => rendered.rerender([ATLAS, LEDGER]))
		await settled()

		expect(askedNamesOf(port)).toEqual(["atlas", "ledger"])
	})

	it("asks nothing for a name the curated catalogue already bears", async () => {
		const { port } = await asking([ATLAS], undefined, [PAPER])

		expect(askedNamesOf(port)).toEqual([])
	})

	it("records a name the host answers nothing for as unresolved", async () => {
		const { rendered } = await asking([LEDGER])

		expect(rendered.result.current).toEqual({ ledger: null })
	})

	it("records a name the host refuses as unresolved and raises no notice", async () => {
		const port = createFakeApplicationPort()
		port.refusals.named = { kind: "registryTimedOut" }

		const { rendered } = await asking([ATLAS], port)

		expect(rendered.result.current).toEqual({ atlas: null })
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("asks again for the mark of an application once it is installed", async () => {
		const port = createFakeApplicationPort()
		const store = createFakeTranscriptStore()
		const { result } = renderHook(
			() => {
				useApplications(port, store, { isCatalogueOpen: false })
				return useApplicationMarks(port, [], [ATLAS])
			},
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settled()
		expect(result.current).toEqual({ atlas: null })

		port.found = [PAPER]
		port.announce({
			conversationId: "conversation-1",
			application: "atlas",
			title: "Atlas",
			scope: "user",
			install: { kind: "nothing" },
		})
		await settled()

		expect(result.current).toEqual({
			atlas: { title: "Atlas", mark: "<svg />" },
		})
	})
})
