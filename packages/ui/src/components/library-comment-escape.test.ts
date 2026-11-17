import { describe, expect, it, vi } from "vitest"

import { closeInnermostCommentLayer } from "@workspace/ui/components/library-comment-escape"

const layers = () => ({
	draft: { onClose: vi.fn() },
	openThread: { onClose: vi.fn() },
	leaveCommentMode: vi.fn(),
})

describe("closeInnermostCommentLayer", () => {
	it("closes the composer alone while a thread card and comment mode are open", () => {
		const open = layers()

		expect(closeInnermostCommentLayer(open)).toBe(true)
		expect(open.draft.onClose).toHaveBeenCalledOnce()
		expect(open.openThread.onClose).not.toHaveBeenCalled()
		expect(open.leaveCommentMode).not.toHaveBeenCalled()
	})

	it("closes the thread card alone once no composer is open", () => {
		const { openThread, leaveCommentMode } = layers()

		expect(closeInnermostCommentLayer({ openThread, leaveCommentMode })).toBe(
			true,
		)
		expect(openThread.onClose).toHaveBeenCalledOnce()
		expect(leaveCommentMode).not.toHaveBeenCalled()
	})

	it("leaves comment mode once no card is open", () => {
		const { leaveCommentMode } = layers()

		expect(closeInnermostCommentLayer({ leaveCommentMode })).toBe(true)
		expect(leaveCommentMode).toHaveBeenCalledOnce()
	})

	it("answers nothing outside comment mode with no card open", () => {
		expect(closeInnermostCommentLayer({})).toBe(false)
	})
})
