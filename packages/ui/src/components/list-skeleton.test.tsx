// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	GenericSkeletonRow,
	type ListEndEdge,
	ListEndSlot,
	ListSkeleton,
} from "@workspace/ui/components/list-skeleton"

describe("ListSkeleton", () => {
	afterEach(cleanup)

	it("lets a gap utility from the caller replace the default gap", () => {
		const { container } = render(
			<ListSkeleton className="gap-3" row={<GenericSkeletonRow />} />,
		)
		const list = container.querySelector('[data-slot="list-skeleton"]')

		expect(list?.classList.contains("gap-3")).toBe(true)
		expect(list?.classList.contains("gap-1")).toBe(false)
	})
})

const SKELETON_DELAY_MS = 300

const slotOrderAt = (edge?: ListEndEdge) => {
	vi.useFakeTimers()
	const { container } = render(
		<ListEndSlot
			edge={edge}
			listEnd={{ hasNextPage: true, isFetchingNextPage: true }}
			row={<GenericSkeletonRow />}
		/>,
	)
	act(() => vi.advanceTimersByTime(SKELETON_DELAY_MS))
	vi.useRealTimers()
	const slot = container.querySelector('[data-slot="list-end"]')
	return Array.from(slot?.children ?? [], (child) =>
		child.getAttribute("data-slot"),
	)
}

describe("ListEndSlot", () => {
	afterEach(cleanup)

	it("keeps the sentinel above the skeleton on the bottom edge by default", () => {
		expect(slotOrderAt()).toEqual(["list-end-sentinel", "list-end-skeleton"])
	})

	it("puts the skeleton above the sentinel on the top edge", () => {
		expect(slotOrderAt("top")).toEqual([
			"list-end-skeleton",
			"list-end-sentinel",
		])
	})
})
