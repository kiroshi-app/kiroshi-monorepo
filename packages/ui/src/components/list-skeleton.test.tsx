// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
	GenericSkeletonRow,
	ListSkeleton,
} from "@workspace/ui/components/list-skeleton"

const listIn = (container: HTMLElement) =>
	container.querySelector('[data-slot="list-skeleton"]')

describe("ListSkeleton", () => {
	afterEach(cleanup)

	it("spaces its rows by the 4 px sidebar gap by default", () => {
		const { container } = render(<ListSkeleton row={<GenericSkeletonRow />} />)

		expect(listIn(container)?.classList.contains("gap-1")).toBe(true)
	})

	it("lets a gap utility from the caller replace the default gap", () => {
		const { container } = render(
			<ListSkeleton className="gap-3" row={<GenericSkeletonRow />} />,
		)
		const list = listIn(container)

		expect(list?.classList.contains("gap-3")).toBe(true)
		expect(list?.classList.contains("gap-1")).toBe(false)
	})
})
