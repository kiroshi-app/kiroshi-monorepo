// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { STILL_LIFT } from "@workspace/ui/components/app-sidebar.fixtures"
import {
	ExpandedSidebar,
	type ExpandedSidebarProps,
	type ExpandedSidebarSection,
} from "@workspace/ui/components/expanded-sidebar"
import { NavigationSidebar } from "@workspace/ui/components/navigation-sidebar"
import { SidebarProvider } from "@workspace/ui/components/ui/sidebar"

const NEXT_PAGE = { hasNextPage: true, isFetchingNextPage: false }

const ROW = <li data-slot="row" />

const ROWLESS_VALUES: [string, ReactNode][] = [
	["null", null],
	["false", false],
	["an empty array", []],
]

const sectionOf = (
	id: string,
	name: string,
	rows: ReactNode,
): ExpandedSidebarSection => ({
	id,
	name,
	rows,
	isOpen: true,
	onOpenChange: vi.fn(),
	lift: STILL_LIFT,
	dropArea: { landing: id, isLanding: false },
})

const SWITCHER = { spaces: [], selectedSpaceId: "", onSelectSpace: vi.fn() }

const renderSidebar = (props: Partial<ExpandedSidebarProps>) =>
	render(
		<SidebarProvider>
			<ExpandedSidebar
				{...SWITCHER}
				conversations={ROW}
				pinned={ROW}
				{...props}
			/>
		</SidebarProvider>,
	)

const headers = () =>
	screen
		.queryAllByRole("button", { expanded: true })
		.map((trigger) => trigger.textContent)

const slot = (container: Element, name: string) =>
	container.querySelector(`[data-slot="${name}"]`)

describe("ExpandedSidebar list", () => {
	afterEach(cleanup)

	it.each(ROWLESS_VALUES)("omits Pinned when it is %s", (_, pinned) => {
		renderSidebar({ pinned })
		expect(headers()).toEqual(["Conversations"])
	})

	it.each(ROWLESS_VALUES)(
		"omits Conversations when it is %s",
		(_, conversations) => {
			renderSidebar({ conversations })
			expect(headers()).toEqual(["Pinned"])
		},
	)

	it("renders the sections between Pinned and Conversations in order", () => {
		renderSidebar({
			sections: [sectionOf("a", "Clients", ROW), sectionOf("b", "Press", ROW)],
		})
		expect(headers()).toEqual(["Pinned", "Clients", "Press", "Conversations"])
	})

	it("adds no list around the slots the app passes", () => {
		const { container } = renderSidebar({
			conversations: <div data-slot="slot" />,
			pinned: <div data-slot="slot" />,
			sections: [sectionOf("a", "Clients", <div data-slot="slot" />)],
		})
		const slots = container.querySelectorAll('[data-slot="slot"]')
		expect(slots).toHaveLength(3)
		for (const held of slots) expect(held.closest("ul")).toBeNull()
	})

	it("shows only the empty copy when no list holds a row", () => {
		renderSidebar({
			conversations: [],
			pinned: [],
			sections: [sectionOf("a", "Clients", [])],
		})
		expect(headers()).toEqual([])
		expect(screen.getByText("No agents yet")).toBeTruthy()
	})

	it("keeps the next page sentinel inside the Conversations body", () => {
		const { container } = renderSidebar({ listEnd: NEXT_PAGE })
		const body = container.querySelectorAll('[data-slot="fold-section"]')[1]
		expect(slot(body, "list-end-sentinel")).not.toBeNull()
	})

	it("mounts the next page slot after the last section without Conversations", () => {
		const { container } = renderSidebar({
			conversations: [],
			listEnd: NEXT_PAGE,
		})
		expect(slot(container, "sidebar-content")?.lastElementChild).toBe(
			slot(container, "list-end"),
		)
	})
})

describe("NavigationSidebar", () => {
	afterEach(cleanup)

	it("forwards the list states to the expanded sidebar", () => {
		const onRetryList = vi.fn()
		render(
			<SidebarProvider>
				<NavigationSidebar
					{...SWITCHER}
					conversations={ROW}
					listStatus="failed"
					onRetryList={onRetryList}
					pinned={ROW}
				/>
			</SidebarProvider>,
		)
		screen.getByRole("button", { name: "Retry" }).click()
		expect(onRetryList).toHaveBeenCalledOnce()
	})

	it("forwards the sections and the list end to the expanded sidebar", () => {
		const { container } = render(
			<SidebarProvider>
				<NavigationSidebar
					{...SWITCHER}
					conversations={ROW}
					listEnd={NEXT_PAGE}
					pinned={ROW}
					sections={[sectionOf("a", "Clients", ROW)]}
				/>
			</SidebarProvider>,
		)
		expect(headers()).toEqual(["Pinned", "Clients", "Conversations"])
		expect(slot(container, "list-end-sentinel")).not.toBeNull()
	})
})
