// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { useSidebarCollapse } from "./use-sidebar-collapse"

import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
})

const renderCollapse = (
	isCollapsed: boolean,
	setSidebarCollapsed: (isCollapsed: boolean) => Promise<void>,
) =>
	renderHook(
		() =>
			useSidebarCollapse({ isCollapsed, controller: { setSidebarCollapsed } }),
		{ wrapper: createQueryTestWrapper().wrapper },
	)

it("saves the collapsed sidebar when the expanded one toggles", async () => {
	const setSidebarCollapsed = vi.fn(async () => undefined)
	const { result } = renderCollapse(false, setSidebarCollapsed)

	act(() => result.current.toggle())

	await waitFor(() => expect(setSidebarCollapsed).toHaveBeenCalledWith(true))
	expect(raiseFailureNotice).not.toHaveBeenCalled()
})

it("saves the expanded sidebar when the shortcut opens the collapsed one", async () => {
	const setSidebarCollapsed = vi.fn(async () => undefined)
	const { result } = renderCollapse(true, setSidebarCollapsed)

	expect(result.current.isOpen).toBe(false)
	act(() => result.current.changeOpen(true))

	await waitFor(() => expect(setSidebarCollapsed).toHaveBeenCalledWith(false))
})

it("raises a failure notice when the host refuses the layout", async () => {
	const setSidebarCollapsed = vi.fn(() => Promise.reject(new Error("refused")))
	const { result } = renderCollapse(false, setSidebarCollapsed)

	act(() => result.current.toggle())

	await waitFor(() =>
		expect(raiseFailureNotice).toHaveBeenCalledWith({
			title:
				"Couldn’t remember the sidebar layout. Toggle the sidebar again to save it.",
			report: expect.objectContaining({
				context: expect.objectContaining({ raisedIn: "use-sidebar-collapse" }),
			}),
		}),
	)
})
