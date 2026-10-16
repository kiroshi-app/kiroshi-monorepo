// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import type { Catalogue, CatalogueChat } from "./catalogue-contract"
import { MAX_QUERY_CHARS, type MessageHit } from "./search-contract"
import type { SearchPort } from "./search-port"
import { useSearchReads } from "./use-search-reads"

import { hostOfflineOf } from "../host/host-offline"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
})

const A_CHAT: CatalogueChat = {
	conversationId: "c-1",
	kind: "main",
	title: "Amélie",
	botId: "b-1",
	participants: [],
	spaceId: "personal",
}

const hitOf = (messageId: string): MessageHit => ({
	messageId,
	seq: 1,
	conversationId: "c-1",
	conversationKind: "main",
	conversationTitle: "Chat",
	authorBotId: "b-1",
	createdAt: 1,
	spaceId: "personal",
	snippet: [{ text: messageId, matched: true }],
})

const catalogueOf = (chats: CatalogueChat[]): Catalogue => ({
	chats,
	missions: [],
	routines: [],
})

const aPort = () => {
	const messages = vi.fn<SearchPort["messages"]>()
	const catalogue = vi.fn<SearchPort["catalogue"]>()
	const recent = vi.fn<SearchPort["recent"]>()
	messages.mockImplementation(async ({ text }) => [hitOf(text)])
	catalogue.mockResolvedValue(catalogueOf([A_CHAT]))
	recent.mockResolvedValue([A_CHAT])
	return { messages, catalogue, recent }
}

type ReadProps = {
	isOpen?: boolean
	query?: string
}

const renderReads = (port: SearchPort, initial: ReadProps = {}) =>
	renderHook(
		({ isOpen = true, query = "" }: ReadProps) =>
			useSearchReads({
				port,
				isOpen,
				spaceId: "personal",
				query,
			}),
		{ initialProps: initial, wrapper: createQueryTestWrapper().wrapper },
	)

const messageIdsOf = (reads: ReturnType<typeof useSearchReads>) =>
	reads.read.messages.map(({ messageId }) => messageId)

it("reads the recents and the catalogue of the space it opens on", async () => {
	const port = aPort()

	const { result } = renderReads(port)

	await waitFor(() => expect(result.current.isLoading).toBe(false))
	expect(result.current.recents).toEqual([A_CHAT])
	expect(result.current.read.chats).toEqual([A_CHAT])
	expect(port.recent).toHaveBeenCalledWith({ spaceId: "personal" })
	expect(port.catalogue).toHaveBeenCalledWith({
		query: "",
		spaceId: "personal",
	})
	expect(port.messages).not.toHaveBeenCalled()
})

it("reports loading with nothing held while its first read is pending", () => {
	const port = aPort()
	port.messages.mockReturnValue(new Promise(() => undefined))

	const { result } = renderReads(port, { query: "road" })

	expect(result.current.isLoading).toBe(true)
	expect(result.current.read.messages).toEqual([])
	expect(result.current.landing).toBe(0)
})

it("reads the messages and the catalogue of a query", async () => {
	const port = aPort()

	const { result } = renderReads(port, { query: "roadmap" })

	await waitFor(() => expect(messageIdsOf(result.current)).toEqual(["roadmap"]))
	expect(port.messages).toHaveBeenCalledWith({
		text: "roadmap",
		spaceId: "personal",
	})
})

it("keeps the previous results and reports loading while the next query is read", async () => {
	const port = aPort()
	const { result, rerender } = renderReads(port, { query: "road" })
	await waitFor(() => expect(messageIdsOf(result.current)).toEqual(["road"]))
	port.messages.mockReturnValue(new Promise(() => undefined))

	rerender({ query: "roadmap" })

	await waitFor(() => expect(result.current.isLoading).toBe(true))
	expect(messageIdsOf(result.current)).toEqual(["road"])
})

it("issues no read while the palette is closed", async () => {
	const port = aPort()

	const { result } = renderReads(port, { isOpen: false })

	await Promise.resolve()
	expect(port.recent).not.toHaveBeenCalled()
	expect(port.catalogue).not.toHaveBeenCalled()
	expect(result.current.isLoading).toBe(false)
})

it("issues no read for a query over the limit and keeps the previous results", async () => {
	const port = aPort()
	const { result, rerender } = renderReads(port, { query: "road" })
	await waitFor(() => expect(messageIdsOf(result.current)).toEqual(["road"]))

	rerender({ query: "x".repeat(MAX_QUERY_CHARS + 1) })
	await Promise.resolve()

	expect(port.messages).toHaveBeenCalledOnce()
	expect(result.current.isLoading).toBe(false)
	expect(messageIdsOf(result.current)).toEqual(["road"])
})

it("keeps the last results that landed when a read fails", async () => {
	const port = aPort()
	const { result, rerender } = renderReads(port, { query: "road" })
	await waitFor(() => expect(messageIdsOf(result.current)).toEqual(["road"]))
	port.catalogue.mockRejectedValue(new Error("no catalogue"))

	rerender({ query: "roadmap" })

	await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())
	expect(result.current.isLoading).toBe(false)
	expect(messageIdsOf(result.current)).toEqual(["road"])
})

it("keeps the last recents that landed when a rest read fails", async () => {
	const port = aPort()
	const { result, rerender } = renderReads(port)
	await waitFor(() => expect(result.current.recents).toEqual([A_CHAT]))
	port.recent.mockRejectedValue(new Error("no recents"))

	rerender({ isOpen: false })
	rerender({})

	await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())
	expect(result.current.recents).toEqual([A_CHAT])
	expect(result.current.read.chats).toEqual([A_CHAT])
})

it("keeps the resting recents while a query is shown", async () => {
	const port = aPort()
	const { result, rerender } = renderReads(port)
	await waitFor(() => expect(result.current.recents).toEqual([A_CHAT]))

	rerender({ query: "road" })

	await waitFor(() => expect(messageIdsOf(result.current)).toEqual(["road"]))
	expect(result.current.recents).toEqual([A_CHAT])
})

it("raises one notice when the recents and the catalogue fail from the same open", async () => {
	const port = aPort()
	port.recent.mockRejectedValue(new Error("no recents"))
	port.catalogue.mockRejectedValue(new Error("no catalogue"))

	const { result } = renderReads(port)

	await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalled())
	await waitFor(() => expect(result.current.isLoading).toBe(false))
	expect(raiseFailureNotice).toHaveBeenCalledOnce()
})

it("counts a landing for each answer that lands and none for a failure", async () => {
	const port = aPort()
	const { result, rerender } = renderReads(port)
	await waitFor(() => expect(result.current.landing).toBe(1))

	rerender({ query: "road" })
	await waitFor(() => expect(result.current.landing).toBe(2))

	port.catalogue.mockRejectedValue(new Error("no catalogue"))
	rerender({ query: "roadmap" })
	await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())

	expect(result.current.landing).toBe(2)
})

it("raises the search notice when a read fails", async () => {
	const port = aPort()
	port.catalogue.mockRejectedValue(new Error("no catalogue"))

	const { result } = renderReads(port, { query: "road" })

	await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())
	expect(raiseFailureNotice).toHaveBeenCalledWith({
		title: "Couldn’t run the search",
		description: "Edit your search to retry.",
		report: expect.objectContaining({
			context: expect.objectContaining({ raisedIn: "use-search" }),
		}),
	})
	expect(result.current.isLoading).toBe(false)
})

it("raises no notice when the host of the space is offline", async () => {
	const port = aPort()
	port.catalogue.mockRejectedValue(hostOfflineOf("gone"))
	port.recent.mockRejectedValue(hostOfflineOf("gone"))

	const { result } = renderReads(port)

	await waitFor(() => expect(result.current.isLoading).toBe(false))
	expect(port.catalogue).toHaveBeenCalled()
	expect(raiseFailureNotice).not.toHaveBeenCalled()
})
