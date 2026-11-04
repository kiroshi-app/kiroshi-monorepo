// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { libraryQueryKeys } from "./library-query-keys"
import { useLibraryImageResolver } from "./use-library-image-sources"

import type { LibraryItem } from "../bindings"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

const host = vi.hoisted(() => ({
	readLibraryItems: vi.fn(),
	readLibraryImage: vi.fn(),
}))

vi.mock("./library-reads", async (importOriginal) => ({
	...(await importOriginal<typeof import("./library-reads")>()),
	readLibraryItems: host.readLibraryItems,
	readLibraryImage: host.readLibraryImage,
}))

vi.mock("../host/tauri", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host/tauri")>()),
	convertFileSrc: (path: string) => `asset://${path}`,
}))

const SPACE = "space-joined"
const OTHER_SPACE = "space-other"
const SOFA = "images/sofa.jpg"

const imageItem = (name: string, modifiedAt = 1): LibraryItem => ({
	name,
	kind: "image",
	path: `/library/${name}`,
	bytes: 10,
	modifiedAt,
	createdAt: null,
})

const imageRead = (name: string) => ({
	name,
	mimeType: "image/jpeg",
	content: `bytes-of-${name}`,
})

const SOFA_DATA_URL = `data:image/jpeg;base64,bytes-of-${SOFA}`

const renderResolver = (isJoined = true) => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	const resolverIn = (spaceId: string) =>
		renderHook(() => useLibraryImageResolver(spaceId, isJoined), { wrapper })
			.result.current
	return { queryClient, resolverIn }
}

describe("the Library image resolver", () => {
	beforeEach(() => {
		host.readLibraryItems.mockReset().mockResolvedValue([imageItem(SOFA)])
		host.readLibraryImage
			.mockReset()
			.mockImplementation(async (_spaceId: string, name: string) =>
				imageRead(name),
			)
	})

	it("answers a path resolved again, even by another mount, from the cache", async () => {
		const { resolverIn } = renderResolver()

		expect(await resolverIn(SPACE)(SOFA)).toBe(SOFA_DATA_URL)
		expect(await resolverIn(SPACE)(SOFA)).toBe(SOFA_DATA_URL)

		expect(host.readLibraryImage).toHaveBeenCalledTimes(1)
		expect(host.readLibraryItems).toHaveBeenCalledTimes(1)
	})

	it("reads a path once when two mounts resolve it at the same time", async () => {
		const { resolverIn } = renderResolver()

		await Promise.all([resolverIn(SPACE)(SOFA), resolverIn(SPACE)(SOFA)])

		expect(host.readLibraryImage).toHaveBeenCalledTimes(1)
		expect(host.readLibraryItems).toHaveBeenCalledTimes(1)
	})

	it("reads the new version once the Library list reports a new modifiedAt", async () => {
		const { queryClient, resolverIn } = renderResolver()
		await resolverIn(SPACE)(SOFA)

		host.readLibraryItems.mockResolvedValue([imageItem(SOFA, 2)])
		await queryClient.invalidateQueries({
			queryKey: libraryQueryKeys.itemsOf(SPACE),
		})
		await resolverIn(SPACE)(SOFA)

		expect(host.readLibraryImage).toHaveBeenCalledTimes(2)
	})

	it("resolves the same path once per Space", async () => {
		const { resolverIn } = renderResolver()

		await resolverIn(SPACE)(SOFA)
		await resolverIn(OTHER_SPACE)(SOFA)

		expect(host.readLibraryImage.mock.calls).toEqual([
			[SPACE, SOFA],
			[OTHER_SPACE, SOFA],
		])
	})

	it("rejects a path that names no Library image after one list fetch when no list was cached", async () => {
		const { resolverIn } = renderResolver()

		await expect(resolverIn(SPACE)("images/gone.jpg")).rejects.toThrow()
		expect(host.readLibraryItems).toHaveBeenCalledTimes(1)
		expect(host.readLibraryImage).not.toHaveBeenCalled()
	})

	it("lists the Library once more before rejecting a path the cached list misses", async () => {
		const { resolverIn } = renderResolver()
		await resolverIn(SPACE)(SOFA)

		await expect(resolverIn(SPACE)("images/gone.jpg")).rejects.toThrow()
		expect(host.readLibraryItems).toHaveBeenCalledTimes(2)
	})

	it("rejects a failed read, then reads again on the next call", async () => {
		host.readLibraryImage.mockRejectedValueOnce({ kind: "unreadable" })
		const { resolverIn } = renderResolver()

		await expect(resolverIn(SPACE)(SOFA)).rejects.toEqual({
			kind: "unreadable",
		})
		expect(await resolverIn(SPACE)(SOFA)).toBe(SOFA_DATA_URL)
		expect(host.readLibraryImage).toHaveBeenCalledTimes(2)
	})

	it("serves a host image from its file with no read", async () => {
		const { resolverIn } = renderResolver(false)

		expect(await resolverIn(SPACE)(SOFA)).toBe(`asset:///library/${SOFA}`)
		expect(await resolverIn(SPACE)(SOFA)).toBe(`asset:///library/${SOFA}`)
		expect(host.readLibraryImage).not.toHaveBeenCalled()
		expect(host.readLibraryItems).toHaveBeenCalledTimes(1)
	})
})
