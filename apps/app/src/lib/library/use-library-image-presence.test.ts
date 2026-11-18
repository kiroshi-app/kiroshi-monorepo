// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LIBRARY_DOCUMENT_PRESENCE_EVENT } from "./library-document-writers"
import { useLibraryImagePresence } from "./use-library-image-presence"

import type { LibraryDocumentPresence, LibraryWriter } from "../bindings"
import { accountQueryKeys } from "@/lib/account/account-query-keys"
import { listen } from "@/lib/host"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	listen: vi.fn(),
	currentWindowLabel: () => OWN_WINDOW,
}))

vi.mock("./library-document-writes", () => ({
	shareLibraryImageSeat: vi.fn(async () => null),
	clearLibraryPresence: vi.fn(async () => null),
}))

const SPACE_ID = "space-on-screen"
const IMAGE = "diagram.png"
const OTHER_IMAGE = "chart.png"
const OWN_WINDOW = "main"
const OWN_ACCOUNT = "account-me"

const lookerOf = (
	id: string,
	kind: LibraryWriter["kind"],
	name: string | null = null,
): LibraryWriter => ({ id, kind, name, at: { kind: "image" } })

const presenceListens = () =>
	vi
		.mocked(listen)
		.mock.calls.filter(([event]) => event === LIBRARY_DOCUMENT_PRESENCE_EVENT)

const mountPresence = async (isJoined = false) => {
	vi.mocked(listen).mockResolvedValue(vi.fn())
	const { queryClient, wrapper } = createQueryTestWrapper()
	queryClient.setQueryData(accountQueryKeys.state(), {
		kind: "signedIn",
		id: OWN_ACCOUNT,
		email: "me@example.com",
		createdAt: "2026-01-01T00:00:00Z",
		plan: null,
	})
	const hook = renderHook(
		() => useLibraryImagePresence({ spaceId: SPACE_ID, name: IMAGE, isJoined }),
		{ wrapper },
	)
	await waitFor(() => expect(presenceListens()).toHaveLength(1))
	const hear = (writers: LibraryWriter[], name = IMAGE) => {
		const handler = presenceListens().at(-1)?.[1]
		const payload: LibraryDocumentPresence = {
			spaceId: SPACE_ID,
			name,
			writers,
		}
		act(() =>
			handler?.(
				{ event: LIBRARY_DOCUMENT_PRESENCE_EVENT, id: 1, payload },
				null,
			),
		)
	}
	return { ...hook, hear }
}

afterEach(() => {
	cleanup()
	vi.mocked(listen).mockReset()
})

describe("useLibraryImagePresence", () => {
	it("shows nobody until someone else opens the image", async () => {
		const { result } = await mountPresence()

		expect(result.current).toEqual([])
	})

	it("shows another person who has the image open", async () => {
		const { result, hear } = await mountPresence()

		hear([lookerOf("other-window", "person", "Mina")])

		expect(result.current).toEqual([{ id: "other-window", name: "Mina" }])
	})

	it("shows nobody once the other person leaves the image", async () => {
		const { result, hear } = await mountPresence()

		hear([lookerOf("other-window", "person", "Mina")])
		hear([])

		expect(result.current).toEqual([])
	})

	it("leaves out the own window on the host", async () => {
		const { result, hear } = await mountPresence(false)

		hear([
			lookerOf(OWN_WINDOW, "person", "Me"),
			lookerOf("account-sam", "member", "Sam"),
		])

		expect(result.current.map(({ name }) => name)).toEqual(["Sam"])
	})

	it("leaves out the own account in a joined Space", async () => {
		const { result, hear } = await mountPresence(true)

		hear([
			lookerOf(OWN_ACCOUNT, "member", "Me"),
			lookerOf(OWN_WINDOW, "person", "Host"),
		])

		expect(result.current.map(({ name }) => name)).toEqual(["Host"])
	})

	it("ignores agents and seats placed elsewhere than on the image", async () => {
		const { result, hear } = await mountPresence()

		hear([
			lookerOf("bot-atlas", "agent", "Atlas"),
			{
				id: "other-window",
				kind: "person",
				name: "Mina",
				at: { kind: "text", anchor: "caret" },
			},
		])

		expect(result.current).toEqual([])
	})

	it("ignores the presence of another image", async () => {
		const { result, hear } = await mountPresence()

		hear([lookerOf("other-window", "person", "Mina")], OTHER_IMAGE)

		expect(result.current).toEqual([])
	})

	it("keeps one presence subscription across re-renders", async () => {
		const { rerender, hear, result } = await mountPresence()

		rerender()
		hear([lookerOf("other-window", "person", "Mina")])
		rerender()

		expect(presenceListens()).toHaveLength(1)
		expect(result.current).toHaveLength(1)
	})
})
