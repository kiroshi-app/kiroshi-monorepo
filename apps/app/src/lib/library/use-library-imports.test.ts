// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import { shownImageSourceOf } from "./library-image-source"
import {
	useLibraryImageSave,
	useLibraryImports,
	useLibraryUrlImport,
} from "./use-library-imports"

import type { LibraryItem } from "../bindings"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

const host = vi.hoisted(() => ({
	remoteImageRead: vi.fn(),
	importLibraryFile: vi.fn(),
	importLibraryUrl: vi.fn(),
	raiseReportedFailure: vi.fn(),
}))

vi.mock("../bindings", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../bindings")>()
	return {
		...actual,
		commands: { ...actual.commands, remoteImageRead: host.remoteImageRead },
	}
})

vi.mock("./library-reads", async (importOriginal) => ({
	...(await importOriginal<typeof import("./library-reads")>()),
	importLibraryFile: host.importLibraryFile,
	importLibraryUrl: host.importLibraryUrl,
}))

vi.mock("../failure-report", async (importOriginal) => ({
	...(await importOriginal<typeof import("../failure-report")>()),
	raiseReportedFailure: host.raiseReportedFailure,
}))

const SPACE = "space-home"

const JPEG_BASE64 = "/9j/4AAQSkZJRg=="

const PNG_BASE64 = "iVBORw0KGgo="

const JOINED_ATTACHMENT_SRC =
	"http://127.0.0.1:4310/api/files/attachments/c1/0b6c1f2e-4a8d-4c1e-9f3a-2b7d5e6f8a90.png?token=bearer"

const shownImage = (name: string, src: string) => ({
	id: src,
	name,
	src,
	detail: "",
})

const remoteImage = (mediaType: string, base64: string) => ({
	status: "ok",
	data: { mediaType, base64 },
})

type Save = {
	name: string
	src: string
	isJoined?: boolean
}

const saveShownImage = ({ name, src, isJoined = false }: Save) => {
	const { result } = renderHook(useLibraryImageSave, {
		wrapper: createQueryTestWrapper().wrapper,
	})
	act(() =>
		result.current({
			spaceId: SPACE,
			isJoined,
			image: shownImageSourceOf(shownImage(name, src)),
		}),
	)
}

const raisedDescription = async () => {
	await waitFor(() => expect(host.raiseReportedFailure).toHaveBeenCalled())
	return host.raiseReportedFailure.mock.calls[0]?.[0]?.description
}

beforeEach(() => {
	for (const command of Object.values(host)) {
		command.mockReset()
	}
	host.importLibraryFile.mockResolvedValue({})
})

describe("saving a shown image to the Library", () => {
	it("imports a remote image read on this computer", async () => {
		host.remoteImageRead.mockResolvedValue(
			remoteImage("image/jpeg", JPEG_BASE64),
		)

		saveShownImage({
			name: "Harbour at dawn",
			src: "https://images.example.test/harbour.jpg",
		})

		await waitFor(() =>
			expect(host.importLibraryFile).toHaveBeenCalledWith(
				SPACE,
				"Harbour at dawn.jpeg",
				JPEG_BASE64,
			),
		)
		expect(host.remoteImageRead).toHaveBeenCalledWith(
			"https://images.example.test/harbour.jpg",
		)
	})

	it("imports a data url decoded in the app", async () => {
		saveShownImage({
			name: "Chart",
			src: `data:image/png;base64,${PNG_BASE64}`,
		})

		await waitFor(() =>
			expect(host.importLibraryFile).toHaveBeenCalledWith(
				SPACE,
				"Chart.png",
				PNG_BASE64,
			),
		)
		expect(host.remoteImageRead).not.toHaveBeenCalled()
	})

	it("imports a joined Space attachment read through the joined proxy", async () => {
		host.remoteImageRead.mockResolvedValue(remoteImage("image/png", PNG_BASE64))

		saveShownImage({
			name: "0b6c1f2e-4a8d-4c1e-9f3a-2b7d5e6f8a90.png",
			src: JOINED_ATTACHMENT_SRC,
			isJoined: true,
		})

		await waitFor(() =>
			expect(host.importLibraryFile).toHaveBeenCalledWith(
				SPACE,
				"0b6c1f2e-4a8d-4c1e-9f3a-2b7d5e6f8a90.png",
				PNG_BASE64,
			),
		)
		expect(host.remoteImageRead).toHaveBeenCalledWith(JOINED_ATTACHMENT_SRC)
	})

	it("names an image it couldn't read", async () => {
		host.remoteImageRead.mockResolvedValue({
			status: "error",
			error: { kind: "networkFailure", status: 404 },
		})

		saveShownImage({
			name: "Harbour at dawn",
			src: "https://images.example.test/harbour.jpg",
		})

		expect(await raisedDescription()).toBe(
			i18n.t("common:library.failure.import.imageUnreadable"),
		)
		expect(host.importLibraryFile).not.toHaveBeenCalled()
	})

	it("names a data url it couldn't decode", async () => {
		saveShownImage({ name: "Chart", src: "data:image/png;base64,%%%" })

		expect(await raisedDescription()).toBe(
			i18n.t("common:library.failure.import.imageUnreadable"),
		)
	})

	it("names a refusal the Library has no line for", async () => {
		host.remoteImageRead.mockResolvedValue(remoteImage("image/png", PNG_BASE64))
		host.importLibraryFile.mockRejectedValue({
			kind: "alreadyExists",
			name: "Chart.png",
		})

		saveShownImage({
			name: "Chart",
			src: "https://images.example.test/chart.png",
		})

		expect(await raisedDescription()).toBe(
			i18n.t("common:library.failure.import.refused"),
		)
	})
})

describe("useLibraryImports", () => {
	it("returns the imported items alone and names the file that failed", async () => {
		const kept = { name: "kept.png", kind: "image" } as LibraryItem
		host.importLibraryFile.mockImplementation(
			async (_space: string, name: string) => {
				if (name === "broken.png") throw { kind: "unsupported" }
				return kept
			},
		)
		const { result } = renderHook(() => useLibraryImports(SPACE, true), {
			wrapper: createQueryTestWrapper().wrapper,
		})

		let imported: LibraryItem[] = []
		await act(async () => {
			imported = await result.current.importDropped([
				new File(["a"], "kept.png"),
				new File(["b"], "broken.png"),
			])
		})

		expect(imported).toEqual([kept])
		expect(host.raiseReportedFailure).toHaveBeenCalledWith(
			expect.objectContaining({
				title: i18n.t("common:library.failure.import.title", {
					name: "broken.png",
				}),
			}),
			expect.anything(),
		)
	})
})

const importLink = async (url: string) => {
	const { result } = renderHook(() => useLibraryUrlImport(SPACE), {
		wrapper: createQueryTestWrapper().wrapper,
	})
	await act(async () => {
		await result.current(url)
	})
}

const HARBOUR_LINK = "https://images.example.test/harbour.jpg"

describe("useLibraryUrlImport", () => {
	it.each([
		{ kind: "unsupportedScheme" },
		{ kind: "privateAddress" },
		{ kind: "networkFailure", status: 404 },
		{ kind: "tooLarge", limit: 20 * 1024 * 1024 },
		{ kind: "unknownSpace", id: SPACE },
	] as const)("names a $kind link in link words", async (refusal) => {
		host.importLibraryUrl.mockRejectedValue(refusal)

		await importLink(HARBOUR_LINK)

		expect(await raisedDescription()).toBe(
			i18n.t(`common:library.failure.import.url.${refusal.kind}`),
		)
	})

	it("names a mailto link without asking the host", async () => {
		await importLink("mailto:ada@example.test")

		expect(await raisedDescription()).toBe(
			i18n.t("common:library.failure.import.url.unsupportedScheme"),
		)
		expect(host.importLibraryUrl).not.toHaveBeenCalled()
	})

	it("names a Library refusal in file words", async () => {
		host.importLibraryUrl.mockRejectedValue({
			kind: "library",
			error: { kind: "unwritable" },
		})

		await importLink(HARBOUR_LINK)

		expect(await raisedDescription()).toBe(
			i18n.t("common:library.failure.import.unwritable"),
		)
	})
})
