// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"
import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	AnswerImageViewer,
	useShownImageActions,
} from "@/components/answer-image-viewer"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type HostCall = { command: string; args: unknown }

const harness = vi.hoisted(() => ({
	calls: [] as HostCall[],
	refused: null as string | null,
	isImageReadable: true,
}))

const answerHostCall = async (command: string, args: unknown) => {
	harness.calls.push({ command, args })
	if (command === harness.refused) {
		throw { kind: "unwritable" }
	}
	return null
}

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: (command: string, args: unknown) => answerHostCall(command, args),
}))

vi.mock("@/lib/host/index", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host/index")>()
	const invoke: Invoke = async <T>(...[command, args]: Parameters<Invoke>) =>
		(await answerHostCall(command, args)) as T
	return { ...actual, invoke }
})

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(() => "notice"),
}))

const PNG_CONTENT = "cG5n"

class LoadingImage {
	crossOrigin: string | null = null
	naturalWidth = 4
	naturalHeight = 3
	onload: (() => void) | null = null
	onerror: (() => void) | null = null

	set src(_src: string) {
		queueMicrotask(() =>
			harness.isImageReadable ? this.onload?.() : this.onerror?.(),
		)
	}
}

const SPACE_ID = "space"

const SOFA: LibraryLightboxImage = {
	id: "0",
	name: "Grey linen sofa",
	src: "https://images.example.org/grey.jpg",
	detail: "",
}

const common = i18n.getFixedT(null, "common")

const SAVE_TO_LIBRARY = common("library.imageMenu.saveToLibrary")

const COPY_IMAGE = common("library.imageMenu.copyImage")

type ViewerSetup = { spaceId: string | null }

const ViewerOnSofa = ({ spaceId }: ViewerSetup) =>
	createElement(AnswerImageViewer, {
		viewed: { images: [SOFA], index: 0 },
		imageActions: useShownImageActions(spaceId),
		onClose: () => undefined,
		onStep: () => undefined,
	})

const openImageMenu = async (spaceId: string | null = SPACE_ID) => {
	render(createElement(ViewerOnSofa, { spaceId }), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await act(async () => {
		fireEvent.contextMenu(screen.getByRole("img", { name: SOFA.name }))
	})
	return screen.findByRole("menu", {
		name: common("library.itemMenu.label", { name: SOFA.name }),
	})
}

const pickInImageMenu = async (entry: string) => {
	const menu = await openImageMenu()
	await act(async () => {
		fireEvent.click(within(menu).getByRole("menuitem", { name: entry }), {
			detail: 1,
		})
	})
}

const callsOf = (command: string) =>
	harness.calls
		.filter((call) => call.command === command)
		.map(({ args }) => args)

beforeEach(() => {
	harness.calls = []
	harness.refused = null
	harness.isImageReadable = true
	vi.stubGlobal("Image", LoadingImage)
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		drawImage: () => undefined,
	} as unknown as CanvasRenderingContext2D)
	vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
		`data:image/png;base64,${PNG_CONTENT}`,
	)
	vi.mocked(raiseFailureNotice).mockClear()
})

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe("the image menu of the thread viewer", () => {
	it("offers the viewer actions, Save to Library and Copy image, never Open in viewer", async () => {
		const menu = await openImageMenu()

		const entries = within(menu)
			.getAllByRole("menuitem")
			.map((item) => item.textContent)
		expect(entries.slice(-2)).toEqual([SAVE_TO_LIBRARY, COPY_IMAGE])
		expect(entries).toContain(common("library.itemMenu.copy"))
		expect(entries).not.toContain(common("library.imageMenu.openInViewer"))
	})

	it("leaves Save to Library out when no Space is on screen", async () => {
		const menu = await openImageMenu(null)

		expect(
			within(menu).queryByRole("menuitem", { name: SAVE_TO_LIBRARY }),
		).toBeNull()
	})

	it("adds the image as a PNG named after it to the Library of the Space, again on a second save", async () => {
		await pickInImageMenu(SAVE_TO_LIBRARY)
		await waitFor(() => expect(callsOf("library_import")).toHaveLength(1))
		await pickInImageMenu(SAVE_TO_LIBRARY)

		const imported = {
			spaceId: SPACE_ID,
			name: "Grey linen sofa.png",
			content: PNG_CONTENT,
		}
		await waitFor(() =>
			expect(callsOf("library_import")).toEqual([imported, imported]),
		)
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("puts the image bytes on the clipboard on Copy image", async () => {
		await pickInImageMenu(COPY_IMAGE)

		await waitFor(() =>
			expect(callsOf("library_copy_bytes")).toEqual([
				{ name: "Grey linen sofa.png", content: PNG_CONTENT },
			]),
		)
	})

	it.each([
		[
			SAVE_TO_LIBRARY,
			common("library.failure.import.title", { name: "Grey linen sofa.png" }),
		],
		[COPY_IMAGE, common("library.failure.copy")],
	])(
		"raises the failure notice when the image can't be read on %s",
		async (entry, title) => {
			harness.isImageReadable = false

			await pickInImageMenu(entry)

			await waitFor(() =>
				expect(raiseFailureNotice).toHaveBeenCalledWith(
					expect.objectContaining({ title }),
				),
			)
			expect([
				...callsOf("library_import"),
				...callsOf("library_copy_bytes"),
			]).toEqual([])
		},
	)

	it.each([
		[
			SAVE_TO_LIBRARY,
			"library_import",
			common("library.failure.import.title", { name: "Grey linen sofa.png" }),
		],
		[COPY_IMAGE, "library_copy_bytes", common("library.failure.copy")],
	])(
		"raises the failure notice when the host refuses %s",
		async (entry, command, title) => {
			harness.refused = command

			await pickInImageMenu(entry)

			await waitFor(() =>
				expect(raiseFailureNotice).toHaveBeenCalledWith(
					expect.objectContaining({ title }),
				),
			)
		},
	)
})
