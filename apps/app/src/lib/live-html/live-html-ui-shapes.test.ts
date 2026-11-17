import { describe, expect, it, vi } from "vitest"

import type { MarkdownAnswerActions } from "@workspace/ui/components/markdown/answer-actions"

import {
	slotGeometryListener,
	withHtmlBlock,
} from "@/lib/live-html/live-html-ui-shapes"

const RECT = { x: 10, y: -40, width: 300, height: 320 }
const CLIP = { x: 10, y: 0, width: 300, height: 280 }

describe("the slot geometry adapter", () => {
	it("hands on the full box and its visible part of a { rect, clip } report", () => {
		const onGeometry = vi.fn()

		slotGeometryListener(onGeometry)({ rect: RECT, clip: CLIP })

		expect(onGeometry).toHaveBeenCalledWith({ rect: RECT, clip: CLIP })
	})

	it("reads a bare visible rect as a box shown whole", () => {
		const onGeometry = vi.fn()

		slotGeometryListener(onGeometry)(CLIP)

		expect(onGeometry).toHaveBeenCalledWith({ rect: CLIP, clip: CLIP })
	})

	it("hands on a slot gone", () => {
		const onGeometry = vi.fn()

		slotGeometryListener(onGeometry)(null)

		expect(onGeometry).toHaveBeenCalledWith(null)
	})
})

describe("the html block adapter", () => {
	it("adds renderHtmlBlock to the answer actions, the rest kept", () => {
		const actions: MarkdownAnswerActions = {
			agentName: "Ada",
			onUseValues: vi.fn(),
			onOpenImage: vi.fn(),
		}
		const renderHtmlBlock = vi.fn((source: string) => source)

		const adapted = withHtmlBlock(
			actions,
			renderHtmlBlock,
		) as MarkdownAnswerActions & {
			renderHtmlBlock: (source: string) => string
		}

		expect(adapted.agentName).toBe("Ada")
		expect(adapted.renderHtmlBlock("<p>Hi</p>")).toBe("<p>Hi</p>")
	})
})
