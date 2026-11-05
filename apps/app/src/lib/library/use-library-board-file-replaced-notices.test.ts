// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { useLibraryBoardFileReplacedNotices } from "./use-library-board-file-replaced-notices"

import {
	LIBRARY_BOARD_FILE_REPLACED_EVENT,
	type LibraryBoardFileReplaced,
} from "../bindings"
import { listen } from "@/lib/host"

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	listen: vi.fn(),
}))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseTransientNotice: vi.fn(),
}))

const SPACE_ON_SCREEN = "space-on-screen"

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

const mountNotices = async () => {
	const unlisten = vi.fn()
	vi.mocked(listen).mockResolvedValue(unlisten)
	const hook = renderHook(() =>
		useLibraryBoardFileReplacedNotices(SPACE_ON_SCREEN),
	)
	await settle()
	const replace = (payload: LibraryBoardFileReplaced) => {
		const handler = vi.mocked(listen).mock.calls.at(-1)?.[1]
		act(() =>
			handler?.(
				{ event: LIBRARY_BOARD_FILE_REPLACED_EVENT, id: 0, payload },
				null,
			),
		)
	}
	return { ...hook, unlisten, replace }
}

afterEach(() => {
	cleanup()
	vi.mocked(listen).mockReset()
	vi.mocked(raiseTransientNotice).mockReset()
	vi.restoreAllMocks()
})

describe("useLibraryBoardFileReplacedNotices", () => {
	it("raises one notice per replacement of a board of the Space on screen", async () => {
		const { replace } = await mountNotices()

		replace({ spaceId: SPACE_ON_SCREEN, name: "Roadmap.canvas" })
		replace({ spaceId: SPACE_ON_SCREEN, name: "Roadmap.canvas" })

		expect(raiseTransientNotice).toHaveBeenCalledTimes(2)
		expect(raiseTransientNotice).toHaveBeenCalledWith({
			type: "info",
			title: i18n.t("common:library.boardFileReplaced", { name: "Roadmap" }),
		})
	})

	it("only logs the replacement of a board of a Space not on screen", async () => {
		const logged = vi.spyOn(console, "info").mockImplementation(() => undefined)
		const { replace } = await mountNotices()

		replace({ spaceId: "space-elsewhere", name: "Roadmap.canvas" })

		expect(raiseTransientNotice).not.toHaveBeenCalled()
		expect(logged).toHaveBeenCalledOnce()
	})

	it("stops listening on unmount", async () => {
		const { unmount, unlisten } = await mountNotices()

		unmount()
		await settle()

		expect(unlisten).toHaveBeenCalledOnce()
	})
})
