// @vitest-environment happy-dom

import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as Y from "yjs"

import "@workspace/ui/lib/i18n"

import {
	ThreadDocumentPanel,
	ThreadDocumentsContext,
} from "@/components/thread-documents"
import { base64Of } from "@/lib/library/library-document-session"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

type LibraryCall = { spaceId: string; name: string }

const libraryHost = vi.hoisted(() => ({
	answers: new Map<string, (call: LibraryCall) => unknown>(),
}))

vi.mock("@/lib/host", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/host")>()
	const invoke = (async <T>(...call: Parameters<typeof actual.invoke>) => {
		const [command, args] = call
		const answer = libraryHost.answers.get(command)
		if (!answer) {
			throw new Error(`no fake answer for ${command}`)
		}
		return answer(args as LibraryCall) as T
	}) as typeof actual.invoke
	const listen: typeof actual.listen = () => Promise.resolve(() => undefined)
	return { ...actual, invoke, listen }
})

vi.mock("@/lib/host/tauri", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/tauri")>()),
	convertFileSrc: (path: string) => `asset://${path}`,
}))

vi.mock("@/lib/navigation/use-open-library-document", () => ({
	useOpenLibraryDocument: () => () => undefined,
}))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@workspace/ui/components/notice-surface")
	>()),
	raiseFailureNotice: vi.fn(),
}))

const PLAN = "plan.md"
const SPACE_ID = "space-on-screen"

const DOCUMENTS = {
	spaceId: SPACE_ID,
	isJoined: false,
	openedName: null,
	open: () => undefined,
	close: () => undefined,
}

const planItem = {
	name: PLAN,
	kind: "document",
	path: `/library/${PLAN}`,
	bytes: 10,
	modifiedAt: 0,
	createdAt: null,
}

const GALLERY_IMAGES = [
	{ name: "sofa-green.jpg", alt: "Green velvet sofa" },
	{ name: "sofa-grey.jpg", alt: "Grey linen sofa" },
]

const GALLERY_PLAN = [
	"The sofas we kept for the lobby.",
	[
		"```gallery",
		...GALLERY_IMAGES.map(({ name, alt }) => `- image: ${name}\n  alt: ${alt}`),
		"```",
	].join("\n"),
].join("\n\n")

const imageItemOf = (name: string) => ({
	...planItem,
	name,
	kind: "image",
	path: `/library/${name}`,
})

const openedStateOf = (name: string, markdown: string) => {
	const doc = new Y.Doc()
	doc.getText("markdown").insert(0, markdown)
	return { name, update: base64Of(Y.encodeStateAsUpdate(doc)) }
}

const joinedSourceOf = (name: string) => `data:image/jpeg;base64,${name}`

const renderGalleryPlan = (isJoined: boolean) =>
	render(
		createElement(
			ThreadDocumentsContext,
			{ value: { ...DOCUMENTS, isJoined } },
			createElement(ThreadDocumentPanel, {
				spaceId: SPACE_ID,
				isJoined,
				name: PLAN,
				onClose: () => undefined,
			}),
		),
		{ wrapper: createQueryTestWrapper().wrapper },
	)

const galleryIn = (root: HTMLElement) => {
	const gallery = root.querySelector<HTMLElement>(
		'[data-slot="library-document-block"][data-type="gallery"]',
	)
	if (!gallery) {
		throw new Error("No gallery block")
	}
	return gallery
}

const openGalleryIn = async (root: HTMLElement) => {
	galleryIn(root).querySelector<HTMLElement>("[tabindex]")?.focus()
	await waitFor(() => {
		if (
			!galleryIn(root).querySelector(
				'[data-slot="library-document-block-editing"]',
			)
		) {
			throw new Error("The gallery is still closed")
		}
	})
}

const expectGalleryShown = (
	root: HTMLElement,
	sourceOf: (name: string) => string,
) =>
	waitFor(() => {
		for (const { name, alt } of GALLERY_IMAGES) {
			expect(
				within(root)
					.getByRole<HTMLImageElement>("img", { name: alt })
					.getAttribute("src"),
			).toBe(sourceOf(name))
		}
	})

const panelOf = () => screen.getByRole("complementary")

describe("a gallery in a document opened from a conversation", () => {
	const imageReads: LibraryCall[] = []

	beforeEach(() => {
		libraryHost.answers.set("library_list", () => [
			planItem,
			...GALLERY_IMAGES.map(({ name }) => imageItemOf(name)),
		])
		libraryHost.answers.set("library_read_document", ({ name }) => ({
			name,
			format: "markdown",
			content: GALLERY_PLAN,
		}))
		libraryHost.answers.set("library_open_document", ({ name }) =>
			openedStateOf(name, GALLERY_PLAN),
		)
		libraryHost.answers.set("library_share_caret", () => null)
		libraryHost.answers.set("library_read_image", (call) => {
			imageReads.push(call)
			return { name: call.name, mimeType: "image/jpeg", content: call.name }
		})
	})

	afterEach(() => {
		cleanup()
		libraryHost.answers.clear()
		imageReads.length = 0
	})

	it("reads each image of a joined Space once across the closed gallery and the opened one", async () => {
		renderGalleryPlan(true)

		await expectGalleryShown(panelOf(), joinedSourceOf)
		await openGalleryIn(panelOf())
		await expectGalleryShown(galleryIn(panelOf()), joinedSourceOf)

		expect(imageReads).toEqual(
			GALLERY_IMAGES.map(({ name }) => ({ spaceId: SPACE_ID, name })),
		)
	})

	it("shows each image of the host from its Library file", async () => {
		renderGalleryPlan(false)
		const hostSourceOf = (name: string) => `asset:///library/${name}`

		await expectGalleryShown(panelOf(), hostSourceOf)
		await openGalleryIn(panelOf())
		await expectGalleryShown(galleryIn(panelOf()), hostSourceOf)

		expect(imageReads).toEqual([])
	})
})
