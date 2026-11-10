// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
	ExpandedSidebar,
	type ExpandedSidebarProps,
} from "@workspace/ui/components/expanded-sidebar"
import { NavigationSidebar } from "@workspace/ui/components/navigation-sidebar"
import { SidebarProvider } from "@workspace/ui/components/ui/sidebar"

const NEXT_PAGE = { hasNextPage: true, isFetchingNextPage: false }

const ROW = <li data-slot="row" />

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

	it.each<[string, ReactNode]>([
		["null", null],
		["false", false],
		["an empty array", []],
	])("omits Pinned when it is %s", (_, pinned) => {
		renderSidebar({ pinned })
		expect(headers()).toEqual(["Conversations"])
	})

	it.each<[string, ReactNode]>([
		["null", null],
		["false", false],
		["an empty array", []],
	])("omits Conversations when it is %s", (_, conversations) => {
		renderSidebar({ conversations })
		expect(headers()).toEqual(["Pinned"])
	})

	it("renders the sections between Pinned and Conversations in order", () => {
		renderSidebar({
			sections: [
				{ id: "a", name: "Clients", rows: ROW },
				{ id: "b", name: "Press", rows: ROW },
			],
		})
		expect(headers()).toEqual(["Pinned", "Clients", "Press", "Conversations"])
	})

	it("shows only the empty copy when no list holds a row", () => {
		renderSidebar({
			conversations: [],
			pinned: [],
			sections: [{ id: "a", name: "Clients", rows: [] }],
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
					zones={[]}
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
					sections={[{ id: "a", name: "Clients", rows: ROW }]}
					zones={[]}
				/>
			</SidebarProvider>,
		)
		expect(headers()).toEqual(["Pinned", "Clients", "Conversations"])
		expect(slot(container, "list-end-sentinel")).not.toBeNull()
	})
})
