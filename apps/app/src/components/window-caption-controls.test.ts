// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppSidebar } from "@workspace/ui/components/app-sidebar"
import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"
import "@workspace/ui/lib/i18n"

import { titleBarWindowControls } from "@/components/window-caption-controls"
import type { MaximizeButtonState } from "@/lib/bindings"
import {
	closeWindow,
	declareMaximizeButton,
	hasCaptionWindowControls,
	type MaximizedWatch,
	minimizeWindow,
	toggleMaximizeWindow,
	watchMaximizeButton,
	watchWindowFocus,
	watchWindowMaximized,
} from "@/lib/host"
import { startsWindowDrag } from "@/lib/host/fake-window-drag"

vi.mock("@/lib/host", () => ({
	hasCaptionWindowControls: vi.fn(),
	minimizeWindow: vi.fn(),
	toggleMaximizeWindow: vi.fn(),
	closeWindow: vi.fn(),
	watchWindowMaximized: vi.fn(),
	declareMaximizeButton: vi.fn(),
	watchMaximizeButton: vi.fn(),
	watchWindowFocus: vi.fn(),
}))

const stopWatching = vi.fn()
const stopFollowingPointer = vi.fn()
const stopFollowingFocus = vi.fn()
let resizeObservers: Array<() => void> = []

class FakeResizeObserver {
	constructor(private readonly callback: () => void) {}
	observe = () => {
		resizeObservers.push(this.callback)
		this.callback()
	}
	disconnect = () => {
		resizeObservers = resizeObservers.filter(
			(callback) => callback !== this.callback,
		)
	}
}

const renderTitleBar = () => {
	render(createElement(NoticeSurface))
	return render(
		createElement(WorkspaceShell, {
			sidebar: createElement(AppSidebar, {
				bots: [],
				"data-tauri-drag-region": "deep",
				windowControls: titleBarWindowControls(),
			}),
			// biome-ignore lint/correctness/noChildrenProp: createElement types a required children prop through props only
			children: null,
		}),
	)
}

const titleBar = () =>
	document.querySelector("[data-slot=app-title-bar]") as HTMLElement

const reportedMaximized = (isMaximized: boolean) => {
	const [watch] = vi.mocked(watchWindowMaximized).mock.calls.at(-1) as [
		MaximizedWatch,
	]
	act(() => watch.report(isMaximized))
}

const reportedPointer = (state: MaximizeButtonState) => {
	const [report] = vi
		.mocked(watchMaximizeButton)
		.mock.calls.at(-1) as Parameters<typeof watchMaximizeButton>
	act(() => report(state))
}

const reportedFocus = (isFocused: boolean) => {
	const [report] = vi.mocked(watchWindowFocus).mock.calls.at(-1) as Parameters<
		typeof watchWindowFocus
	>
	act(() => report(isFocused))
}

const carriesState: Record<
	MaximizeButtonState,
	(classes: DOMTokenList) => boolean
> = {
	idle: (classes) => classes.contains("hover:bg-transparent"),
	hover: (classes) =>
		classes.contains("bg-muted") && !classes.contains("scale-100"),
	pressed: (classes) => classes.contains("scale-100"),
}

const maximizeShows = (state: MaximizeButtonState) => {
	const { classList } = screen.getByRole("button", { name: "Maximize" })
	const candidates = Object.keys(carriesState) as MaximizeButtonState[]
	return candidates.every(
		(candidate) => carriesState[candidate](classList) === (candidate === state),
	)
}

const POINTER_FAILURE =
	"The maximize button can’t show hover or press feedback."

beforeEach(() => {
	resizeObservers = []
	vi.stubGlobal("ResizeObserver", FakeResizeObserver)
	vi.mocked(hasCaptionWindowControls).mockReturnValue(true)
	vi.mocked(minimizeWindow).mockResolvedValue()
	vi.mocked(toggleMaximizeWindow).mockResolvedValue()
	vi.mocked(closeWindow).mockResolvedValue()
	vi.mocked(declareMaximizeButton).mockResolvedValue()
	vi.mocked(watchWindowMaximized).mockResolvedValue(stopWatching)
	vi.mocked(watchMaximizeButton).mockResolvedValue(stopFollowingPointer)
	vi.mocked(watchWindowFocus).mockResolvedValue(stopFollowingFocus)
})

afterEach(() => {
	cleanup()
	vi.clearAllMocks()
	vi.unstubAllGlobals()
})

describe("title bar window controls", () => {
	it("renders no caption buttons off Windows", () => {
		vi.mocked(hasCaptionWindowControls).mockReturnValue(false)
		renderTitleBar()

		expect(screen.queryByRole("button", { name: "Minimize" })).toBeNull()
		expect(titleBar().querySelector("[data-slot*=window]")).toBeNull()
	})

	it("renders one set of caption buttons at the trailing end of the title bar", () => {
		renderTitleBar()
		const trailing = titleBar().lastElementChild

		expect(trailing?.getAttribute("data-slot")).toBe(
			"app-title-bar-window-controls",
		)
		expect(
			[...(trailing?.querySelectorAll("button") ?? [])].map((button) =>
				button.getAttribute("aria-label"),
			),
		).toEqual(["Minimize", "Maximize", "Close"])
		expect(
			document.querySelectorAll("[data-slot=window-controls]"),
		).toHaveLength(1)
	})

	it("drags the window from the title bar but not from its caption buttons", () => {
		renderTitleBar()

		expect(startsWindowDrag(titleBar())).toBe(true)
		for (const name of ["Minimize", "Maximize", "Close"]) {
			expect(startsWindowDrag(screen.getByRole("button", { name }))).toBe(false)
		}
	})

	it("drags the window from the title bar off Windows too", () => {
		vi.mocked(hasCaptionWindowControls).mockReturnValue(false)
		renderTitleBar()

		expect(startsWindowDrag(titleBar())).toBe(true)
	})

	it("drives the current window from each button", () => {
		renderTitleBar()

		fireEvent.click(screen.getByRole("button", { name: "Minimize" }))
		fireEvent.click(screen.getByRole("button", { name: "Maximize" }))
		fireEvent.click(screen.getByRole("button", { name: "Close" }))

		expect(minimizeWindow).toHaveBeenCalledOnce()
		expect(toggleMaximizeWindow).toHaveBeenCalledOnce()
		expect(closeWindow).toHaveBeenCalledOnce()
	})

	it("follows the window between maximized and restored", () => {
		renderTitleBar()

		reportedMaximized(true)
		expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy()

		reportedMaximized(false)
		expect(screen.getByRole("button", { name: "Maximize" })).toBeTruthy()
	})

	it("stops following the window once unmounted", async () => {
		const { unmount } = renderTitleBar()
		await waitFor(() => expect(watchWindowMaximized).toHaveBeenCalled())

		unmount()

		await waitFor(() => expect(stopWatching).toHaveBeenCalledOnce())
	})

	it("declares the maximize button while mounted and withdraws it on unmount", () => {
		const { unmount } = renderTitleBar()
		const declared = vi.mocked(declareMaximizeButton)

		expect(declared).toHaveBeenLastCalledWith(
			expect.objectContaining({ width: expect.any(Number) }),
		)

		fireEvent(window, new Event("resize"))
		for (const observed of resizeObservers) observed()
		expect(declared).toHaveBeenCalledTimes(3)

		unmount()
		expect(declared).toHaveBeenLastCalledWith(null)
	})

	it("names the window action that failed", async () => {
		vi.mocked(minimizeWindow).mockRejectedValue(new Error("denied"))
		renderTitleBar()

		fireEvent.click(screen.getByRole("button", { name: "Minimize" }))

		expect(
			await screen.findAllByText("Couldn’t minimize Kiroshi."),
		).toBeTruthy()
	})

	it("names the maximize button declaration once when it keeps failing", async () => {
		vi.mocked(declareMaximizeButton).mockRejectedValue(new Error("unsupported"))
		renderTitleBar()
		const snapNotices = () =>
			screen.findAllByText(
				"Snap layouts are unavailable on the maximize button.",
			)
		const firstCount = (await snapNotices()).length

		fireEvent(window, new Event("resize"))
		fireEvent(window, new Event("resize"))
		await act(() => Promise.resolve())

		expect(await snapNotices()).toHaveLength(firstCount)
	})

	it("names the maximized state it could not read", async () => {
		vi.mocked(watchWindowMaximized).mockRejectedValue(new Error("denied"))
		renderTitleBar()

		expect(
			await screen.findAllByText("Couldn’t tell whether Kiroshi is maximized."),
		).toBeTruthy()
	})

	it("forces the maximize button into the state the host reports", () => {
		renderTitleBar()
		expect(maximizeShows("idle")).toBe(true)

		reportedPointer("hover")
		expect(maximizeShows("hover")).toBe(true)

		reportedPointer("pressed")
		expect(maximizeShows("pressed")).toBe(true)

		reportedPointer("idle")
		expect(maximizeShows("idle")).toBe(true)
	})

	it("returns the maximize button to idle when the window loses focus", () => {
		renderTitleBar()
		reportedPointer("hover")
		expect(maximizeShows("hover")).toBe(true)

		reportedFocus(true)
		expect(maximizeShows("hover")).toBe(true)

		reportedFocus(false)
		expect(maximizeShows("idle")).toBe(true)
	})

	it("subscribes to the maximize button once per mount", () => {
		renderTitleBar()
		reportedPointer("hover")
		reportedPointer("pressed")

		expect(watchMaximizeButton).toHaveBeenCalledOnce()
		expect(watchWindowFocus).toHaveBeenCalledOnce()
	})

	it("stops following the maximize button once unmounted", async () => {
		const { unmount } = renderTitleBar()

		unmount()

		await waitFor(() => {
			expect(stopFollowingPointer).toHaveBeenCalledOnce()
			expect(stopFollowingFocus).toHaveBeenCalledOnce()
		})
	})

	it("follows no maximize button off Windows", () => {
		vi.mocked(hasCaptionWindowControls).mockReturnValue(false)
		renderTitleBar()

		expect(watchMaximizeButton).not.toHaveBeenCalled()
		expect(watchWindowFocus).not.toHaveBeenCalled()
	})

	it("names the maximize button events it could not follow and stays idle", async () => {
		vi.mocked(watchMaximizeButton).mockRejectedValue(new Error("denied"))
		renderTitleBar()

		expect(await screen.findAllByText(POINTER_FAILURE)).toBeTruthy()
		expect(maximizeShows("idle")).toBe(true)
	})

	it("names the focus changes it could not follow and ignores later reports", async () => {
		vi.mocked(watchWindowFocus).mockRejectedValue(new Error("denied"))
		renderTitleBar()

		expect(await screen.findAllByText(POINTER_FAILURE)).toBeTruthy()
		reportedPointer("hover")
		expect(maximizeShows("idle")).toBe(true)
	})
})
