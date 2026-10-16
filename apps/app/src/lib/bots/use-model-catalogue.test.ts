// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { readModelCatalogue } from "./model-catalogue"
import { useModelCatalogue } from "./use-model-catalogue"

import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"

vi.mock("./model-catalogue", () => ({ readModelCatalogue: vi.fn() }))
vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
	vi.mocked(readModelCatalogue).mockReset()
})

const useTwoCatalogueReaders = () => [useModelCatalogue(), useModelCatalogue()]

it("holds every model the host offers once it answers", async () => {
	const models = [{ value: "opus", supportedEffortLevels: ["high" as const] }]
	vi.mocked(readModelCatalogue).mockResolvedValue(models)

	const { wrapper } = createQueryTestWrapper()

	const { result } = renderHook(() => useModelCatalogue(), { wrapper })

	await waitFor(() =>
		expect(result.current).toEqual({ models, hasFailedToLoad: false }),
	)
	expect(raiseFailureNotice).not.toHaveBeenCalled()
})

it("reads the catalogue once for two readers mounted together", async () => {
	vi.mocked(readModelCatalogue).mockResolvedValue([])

	const { wrapper } = createQueryTestWrapper()

	const { result } = renderHook(useTwoCatalogueReaders, { wrapper })

	await waitFor(() =>
		expect(result.current).toEqual([
			{ models: [], hasFailedToLoad: false },
			{ models: [], hasFailedToLoad: false },
		]),
	)
	expect(readModelCatalogue).toHaveBeenCalledTimes(1)
})

it("keeps a failed read in state and raises it as a failure notice once", async () => {
	vi.mocked(readModelCatalogue).mockRejectedValue(new Error("host down"))

	const { wrapper } = createQueryTestWrapper()

	const { result } = renderHook(useTwoCatalogueReaders, { wrapper })

	await waitFor(() =>
		expect(result.current).toEqual([
			{ models: [], hasFailedToLoad: true },
			{ models: [], hasFailedToLoad: true },
		]),
	)
	expect(raiseFailureNotice).toHaveBeenCalledTimes(1)
	expect(raiseFailureNotice).toHaveBeenCalledWith({
		title: "Couldn’t read the models this machine offers.",
		report: expect.objectContaining({
			context: expect.objectContaining({ raisedIn: "use-model-catalogue" }),
		}),
	})
})
