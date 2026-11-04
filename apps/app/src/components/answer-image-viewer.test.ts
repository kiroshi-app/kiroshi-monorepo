// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	AnswerImageViewer,
	useShownImageActions,
} from "@/components/answer-image-viewer"
import { AnswerBody } from "@/components/turn-body"
import type { LibraryImport, LibraryItem } from "@/lib/bindings"
import {
	AnswerActionsContext,
	type ShownImageActions,
	type ThreadImage,
} from "@/lib/chat/answer-actions"
import type { Invoke } from "@/lib/host/joined-hosts-invoke"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { joinedRowIdOf } from "@/lib/spaces/joined-spaces-controller"
import type { WorkspaceAssembly } from "@/lib/workspace/use-workspace-assembly"
import { WorkspaceContext } from "@/lib/workspace/workspace-context"

type HostCall = { command: string; args: unknown }

const harness = vi.hoisted(() => ({
	calls: [] as HostCall[],
	refused: null as string | null,
	isImageReadable: true,
	imageContent: "cG5n",
	pathImport: null as unknown,
	importGate: null as Promise<void> | null,
	navigations: [] as unknown[],
}))

const answerHostCall = async (command: string, args: unknown) => {
	harness.calls.push({ command, args })
	if (command === "library_import") {
		await harness.importGate
	}
	if (command === harness.refused) {
		throw { kind: "unwritable" }
	}
	if (command === "remote_image_read") {
		return remoteImageRead()
	}
	if (command === "library_import") {
		return SAVED_SOFA
	}
	return command === "library_import_paths" ? [harness.pathImport] : null
}

const remoteImageRead = () => {
	if (!harness.isImageReadable) {
		throw { kind: "networkFailure", status: 404 }
	}
	return { mediaType: "image/jpeg", base64: harness.imageContent }
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
	raiseTransientNotice: vi.fn(() => "notice"),
}))

vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	useNavigate: () => (options: unknown) => {
		harness.navigations.push(options)
		return Promise.resolve()
	},
}))

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

const MIB = 1024 * 1024

const SPACE_ID = "space"

type SpaceOnScreen = { rowId: string; limit: number }

const HOSTED: SpaceOnScreen = { rowId: "space-row", limit: 20 * MIB }

const JOINED: SpaceOnScreen = { rowId: joinedRowIdOf("host-1"), limit: 8 * MIB }

const SPACES = [
	["a hosted Space", HOSTED],
	["a joined Space", JOINED],
] as const

const SOFA: ThreadImage = {
	id: "0",
	name: "Grey linen sofa",
	src: "https://images.example.org/grey.jpg",
	detail: "",
}

const SAVED_SOFA: LibraryItem = {
	name: "Grey linen sofa (2).jpeg",
	kind: "image",
	path: "/library/Grey linen sofa (2).jpeg",
	bytes: 3,
	modifiedAt: 0,
	createdAt: null,
}

const OAK: ThreadImage = {
	id: "1",
	name: "Oak side table",
	src: "https://images.example.org/oak.jpg",
	detail: "",
}

const ATTACHMENT_PATH = "/root/attachments/c-1/1c8d7e2f.jpg"

const ATTACHMENT: ThreadImage = {
	id: ATTACHMENT_PATH,
	name: "1c8d7e2f.jpg",
	src: `asset://${ATTACHMENT_PATH}`,
	detail: "",
	path: ATTACHMENT_PATH,
}

const common = i18n.getFixedT(null, "common")

const SAVE_TO_LIBRARY = common("library.imageMenu.saveToLibrary")

const COPY_IMAGE = common("library.imageMenu.copyImage")

const workspaceOn = ({ rowId }: SpaceOnScreen) =>
	({
		rosterView: { rosteredSpaceId: rowId },
		rosteredHostSpaceId: SPACE_ID,
	}) as unknown as WorkspaceAssembly

type ViewerSetup = {
	space?: SpaceOnScreen | null
	image?: ThreadImage
}

type ViewerProps = { image: ThreadImage }

const ViewerOn = ({ image }: ViewerProps) =>
	createElement(AnswerImageViewer, {
		viewed: { images: [image], index: 0 },
		imageActions: useShownImageActions(),
		onClose: () => undefined,
		onStep: () => undefined,
	})

const wrapperOn = (space: SpaceOnScreen | null) => {
	const { wrapper: QueryWrapper } = createQueryTestWrapper()
	return ({ children }: { children: ReactNode }) =>
		createElement(
			QueryWrapper,
			null,
			createElement(
				WorkspaceContext.Provider,
				{ value: space && workspaceOn(space) },
				children,
			),
		)
}

const renderViewer = ({ space = HOSTED, image = SOFA }: ViewerSetup = {}) => {
	render(createElement(ViewerOn, { image }), { wrapper: wrapperOn(space) })
}

const openImageMenu = async (setup: ViewerSetup = {}) => {
	renderViewer(setup)
	return openRenderedImageMenu((setup.image ?? SOFA).name)
}

const openRenderedImageMenu = async (name: string) => {
	await act(async () => {
		fireEvent.contextMenu(screen.getByRole("img", { name }))
	})
	return screen.findByRole("menu", {
		name: common("library.itemMenu.label", { name }),
	})
}

const press = async (target: Element) => {
	await act(async () => {
		fireEvent.click(target, { detail: 1 })
	})
}

const pickInImageMenu = async (entry: string, setup: ViewerSetup = {}) => {
	const menu = await openImageMenu(setup)
	await press(within(menu).getByRole("menuitem", { name: entry }))
}

const holdImport = () => {
	let open: () => void = () => undefined
	harness.importGate = new Promise<void>((resolve) => {
		open = resolve
	})
	return () =>
		act(async () => {
			open()
		})
}

const callsOf = (command: string) =>
	harness.calls
		.filter((call) => call.command === command)
		.map(({ args }) => args)

const importFailureNamed = (name: string) =>
	expect.objectContaining({
		title: common("library.failure.import.title", { name }),
	})

const base64OfBytes = (bytes: number) => "A".repeat(Math.ceil(bytes / 3) * 4)

beforeEach(() => {
	harness.calls = []
	harness.refused = null
	harness.isImageReadable = true
	harness.imageContent = "cG5n"
	harness.pathImport = {
		status: "imported",
		item: {
			name: ATTACHMENT.name,
			kind: "image",
			path: `/library/${ATTACHMENT.name}`,
			bytes: 5,
			modifiedAt: 0,
			createdAt: null,
		},
	} satisfies LibraryImport
	vi.stubGlobal("Image", LoadingImage)
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		drawImage: () => undefined,
	} as unknown as CanvasRenderingContext2D)
	vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
		() => `data:image/png;base64,${harness.imageContent}`,
	)
	harness.importGate = null
	harness.navigations = []
	vi.mocked(raiseFailureNotice).mockClear()
	vi.mocked(raiseTransientNotice).mockClear()
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
		const menu = await openImageMenu({ space: null })

		expect(
			within(menu).queryByRole("menuitem", { name: SAVE_TO_LIBRARY }),
		).toBeNull()
	})

	it.each(SPACES)(
		"adds a web image read on this computer, named after it, to the Library of %s, again on a second save",
		async (_space, space) => {
			await pickInImageMenu(SAVE_TO_LIBRARY, { space })
			await waitFor(() => expect(callsOf("library_import")).toHaveLength(1))
			cleanup()
			await pickInImageMenu(SAVE_TO_LIBRARY, { space })

			const imported = {
				spaceId: SPACE_ID,
				name: "Grey linen sofa.jpeg",
				content: harness.imageContent,
			}
			await waitFor(() =>
				expect(callsOf("library_import")).toEqual([imported, imported]),
			)
			expect(raiseFailureNotice).not.toHaveBeenCalled()
		},
	)

	it("imports an attachment of a hosted Space by its path, keeping its own file", async () => {
		await pickInImageMenu(SAVE_TO_LIBRARY, { image: ATTACHMENT })

		await waitFor(() =>
			expect(callsOf("library_import_paths")).toEqual([
				{ spaceId: SPACE_ID, paths: [ATTACHMENT_PATH] },
			]),
		)
		expect(callsOf("library_import")).toEqual([])
		expect(raiseFailureNotice).not.toHaveBeenCalled()
	})

	it("adds an attachment of a joined Space as a PNG, since its path is on the host", async () => {
		await pickInImageMenu(SAVE_TO_LIBRARY, { image: ATTACHMENT, space: JOINED })

		await waitFor(() =>
			expect(callsOf("library_import")).toEqual([
				{
					spaceId: SPACE_ID,
					name: "1c8d7e2f.png",
					content: harness.imageContent,
				},
			]),
		)
		expect(callsOf("library_import_paths")).toEqual([])
	})

	it("raises the import notice naming the attachment when the host refuses its path", async () => {
		harness.pathImport = {
			status: "refused",
			error: { kind: "unsupported", name: ATTACHMENT.name },
		}

		await pickInImageMenu(SAVE_TO_LIBRARY, { image: ATTACHMENT })

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				importFailureNamed(ATTACHMENT.name),
			),
		)
	})

	it.each(SPACES)(
		"raises the tooLarge notice of a dropped file when the image exceeds the limit of %s",
		async (_space, space) => {
			harness.imageContent = base64OfBytes(space.limit + 3)

			await pickInImageMenu(SAVE_TO_LIBRARY, { space })

			await waitFor(() =>
				expect(raiseFailureNotice).toHaveBeenCalledWith(
					expect.objectContaining({
						title: common("library.failure.import.title", {
							name: "Grey linen sofa",
						}),
						description: common("library.failure.import.tooLarge"),
					}),
				),
			)
			expect(callsOf("library_import")).toEqual([])
		},
	)

	it("sends an image right under the limit of a joined Space", async () => {
		harness.imageContent = base64OfBytes(JOINED.limit - 3)

		await pickInImageMenu(SAVE_TO_LIBRARY, { space: JOINED })

		await waitFor(() => expect(callsOf("library_import")).toHaveLength(1))
	})

	it("puts the image bytes on the clipboard on Copy image", async () => {
		await pickInImageMenu(COPY_IMAGE)

		await waitFor(() =>
			expect(callsOf("library_copy_bytes")).toEqual([
				{ name: "Grey linen sofa.jpeg", content: harness.imageContent },
			]),
		)
	})

	it.each([
		[SAVE_TO_LIBRARY, importFailureNamed("Grey linen sofa")],
		[
			COPY_IMAGE,
			expect.objectContaining({ title: common("library.failure.copy") }),
		],
	])(
		"raises the failure notice when the image can't be read on %s",
		async (entry, notice) => {
			harness.isImageReadable = false

			await pickInImageMenu(entry)

			await waitFor(() =>
				expect(raiseFailureNotice).toHaveBeenCalledWith(notice),
			)
			expect([
				...callsOf("library_import"),
				...callsOf("library_copy_bytes"),
			]).toEqual([])
		},
	)

	it.each([
		[SAVE_TO_LIBRARY, "library_import", importFailureNamed("Grey linen sofa")],
		[
			COPY_IMAGE,
			"library_copy_bytes",
			expect.objectContaining({ title: common("library.failure.copy") }),
		],
	])(
		"raises the failure notice when the host refuses %s",
		async (entry, command, notice) => {
			harness.refused = command

			await pickInImageMenu(entry)

			await waitFor(() =>
				expect(raiseFailureNotice).toHaveBeenCalledWith(notice),
			)
		},
	)
})

describe("the bar of the thread viewer on an attachment", () => {
	const barButton = (action: "copy" | "download") =>
		screen.queryByRole("button", { name: common(`library.lightbox.${action}`) })

	it("copies the attachment's image on Copy", async () => {
		renderViewer({ image: ATTACHMENT })

		await press(barButton("copy") as HTMLElement)

		await waitFor(() =>
			expect(callsOf("library_copy_bytes")).toEqual([
				{ name: "1c8d7e2f.png", content: harness.imageContent },
			]),
		)
	})

	it("leaves Download out, since no host command saves a file by its path", () => {
		renderViewer({ image: ATTACHMENT })

		expect(barButton("download")).toBeNull()
	})

	it("keeps Download for a web image", () => {
		renderViewer()

		expect(barButton("download")).toBeInstanceOf(HTMLElement)
	})
})

describe("Save the image from a thread", () => {
	const renderImageActions = () =>
		renderHook(useShownImageActions, { wrapper: wrapperOn(HOSTED) })

	const saveSofa = async (actions: { current: ShownImageActions }) => {
		await act(async () => {
			actions.current.onSaveToLibrary?.(SOFA)
		})
		await waitFor(() => expect(callsOf("library_import")).toHaveLength(1))
	}

	const savedNotice = expect.objectContaining({
		type: "success",
		title: common("library.saved.image"),
		action: expect.objectContaining({
			label: common("library.panel.openInLibrary"),
		}),
	})

	const failedNotice = importFailureNamed("Grey linen sofa")

	const refuseImport = () => {
		harness.refused = "library_import"
	}

	it("answers saving for the saved image only while its save is pending", async () => {
		const release = holdImport()
		const { result } = renderImageActions()

		await saveSofa(result)

		expect(result.current.isSavingImage(SOFA.src)).toBe(true)
		expect(result.current.isSavingImage(OAK.src)).toBe(false)
		await release()
		await waitFor(() =>
			expect(result.current.isSavingImage(SOFA.src)).toBe(false),
		)
	})

	it("starts no second save of an image from the menu while its save is pending", async () => {
		const release = holdImport()
		renderViewer()
		await press(
			within(await openRenderedImageMenu(SOFA.name)).getByRole("menuitem", {
				name: SAVE_TO_LIBRARY,
			}),
		)
		await waitFor(() => expect(callsOf("library_import")).toHaveLength(1))

		await press(
			within(await openRenderedImageMenu(SOFA.name)).getByRole("menuitem", {
				name: SAVE_TO_LIBRARY,
			}),
		)
		await release()

		await waitFor(() => expect(raiseTransientNotice).toHaveBeenCalled())
		expect(callsOf("library_import")).toHaveLength(1)
		expect(raiseTransientNotice).toHaveBeenCalledTimes(1)
	})

	it("starts one import for two saves of an image before the next render", async () => {
		const release = holdImport()
		const { result } = renderImageActions()

		await act(async () => {
			result.current.onSaveToLibrary?.(SOFA)
			result.current.onSaveToLibrary?.(SOFA)
		})
		await release()

		await waitFor(() => expect(raiseTransientNotice).toHaveBeenCalled())
		expect(callsOf("library_import")).toHaveLength(1)
	})

	it("starts one import per image for saves of two images before the next render", async () => {
		const { result } = renderImageActions()

		await act(async () => {
			result.current.onSaveToLibrary?.(SOFA)
			result.current.onSaveToLibrary?.(OAK)
		})

		await waitFor(() => expect(callsOf("library_import")).toHaveLength(2))
		expect(callsOf("library_import")).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "Grey linen sofa.jpeg" }),
				expect.objectContaining({ name: "Oak side table.jpeg" }),
			]),
		)
	})

	it("raises one success notice whose Open in Library opens the saved image", async () => {
		const { result } = renderImageActions()

		await saveSofa(result)

		await waitFor(() =>
			expect(raiseTransientNotice).toHaveBeenCalledWith(savedNotice),
		)
		expect(raiseTransientNotice).toHaveBeenCalledTimes(1)
		expect(raiseFailureNotice).not.toHaveBeenCalled()
		vi.mocked(raiseTransientNotice).mock.calls[0]?.[0].action?.onPress()
		expect(harness.navigations).toEqual([
			{
				to: "/library",
				search: { item: SAVED_SOFA.name, kind: "image", title: undefined },
			},
		])
	})

	it("raises one failure notice naming the image, and no success notice, when the save fails", async () => {
		refuseImport()
		const { result } = renderImageActions()

		await saveSofa(result)

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(failedNotice),
		)
		expect(raiseFailureNotice).toHaveBeenCalledTimes(1)
		expect(raiseTransientNotice).not.toHaveBeenCalled()
		expect(result.current.isSavingImage(SOFA.src)).toBe(false)
	})

	it.each([
		["success", null, raiseTransientNotice, savedNotice],
		["failure", "library_import", raiseFailureNotice, failedNotice],
	] as const)(
		"still raises the %s notice when the thread unmounts while the save is pending",
		async (_outcome, refused, raise, notice) => {
			harness.refused = refused
			const release = holdImport()
			const { result, unmount } = renderImageActions()
			await saveSofa(result)

			unmount()
			await release()

			await waitFor(() => expect(raise).toHaveBeenCalledWith(notice))
		},
	)
})

describe("Save to Library in the menu of a sourced answer image", () => {
	const sourcedImageOf = ({ name, src }: ThreadImage) =>
		`![${name}](${src})\n\nSource: [Example](https://www.example.org)`

	const TURN_TEXT = `${sourcedImageOf(SOFA)}\n\n${sourcedImageOf(OAK)}`

	const SAVE_THE_IMAGE = i18n.t("chat:answerBlock.sourcedImage.save")

	const TurnWithSavableImages = () =>
		createElement(
			AnswerActionsContext,
			{
				value: {
					insert: () => undefined,
					openImage: () => undefined,
					imageActions: useShownImageActions(),
				},
			},
			createElement(AnswerBody, {
				attachments: [],
				text: TURN_TEXT,
				agentName: "Ada",
				isWriting: false,
			}),
		)

	const figureOf = (name: string) => {
		const figure = screen
			.getAllByRole("figure")
			.find((candidate) => within(candidate).queryByRole("img", { name }))
		if (!figure) {
			throw new Error(`No sourced image named ${name}`)
		}
		return figure
	}

	const saveFromButton = async (name: string) => {
		await press(
			within(figureOf(name)).getByRole("button", { name: SAVE_THE_IMAGE }),
		)
		await waitFor(() => expect(callsOf("library_import")).toHaveLength(1))
	}

	const isSaveToLibraryDisabledIn = (menu: HTMLElement) =>
		within(menu)
			.getByRole("menuitem", { name: SAVE_TO_LIBRARY })
			.getAttribute("aria-disabled") === "true"

	const renderTurn = () => {
		render(createElement(TurnWithSavableImages), {
			wrapper: wrapperOn(HOSTED),
		})
	}

	it("disables Save to Library in the menu of the image while its save is pending", async () => {
		holdImport()
		renderTurn()

		await saveFromButton(SOFA.name)

		expect(
			isSaveToLibraryDisabledIn(await openRenderedImageMenu(SOFA.name)),
		).toBe(true)
	})

	it.each([
		["resolves", null],
		["rejects", "library_import"],
	] as const)(
		"enables Save to Library again when the save %s",
		async (_outcome, refused) => {
			harness.refused = refused
			const release = holdImport()
			renderTurn()
			await saveFromButton(SOFA.name)
			const menu = await openRenderedImageMenu(SOFA.name)
			expect(isSaveToLibraryDisabledIn(menu)).toBe(true)

			await release()

			await waitFor(() => expect(isSaveToLibraryDisabledIn(menu)).toBe(false))
		},
	)

	it("keeps Save to Library enabled in the menu of another image of the turn", async () => {
		holdImport()
		renderTurn()

		await saveFromButton(SOFA.name)

		expect(
			isSaveToLibraryDisabledIn(await openRenderedImageMenu(OAK.name)),
		).toBe(false)
	})
})
