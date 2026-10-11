// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { readModelCatalogue } from "./model-catalogue"
import { useModelCatalogue } from "./use-model-catalogue"

vi.mock("./model-catalogue", () => ({ readModelCatalogue: vi.fn() }))
vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
})

it("holds every model the host offers once it answers", async () => {
	const models = [{ value: "opus", supportedEffortLevels: ["high" as const] }]
	vi.mocked(readModelCatalogue).mockResolvedValue(models)

	const { result } = renderHook(() => useModelCatalogue())

	await waitFor(() =>
		expect(result.current).toEqual({ models, hasFailedToLoad: false }),
	)
	expect(raiseFailureNotice).not.toHaveBeenCalled()
})

it("keeps a failed read in state and raises it as a failure notice", async () => {
	vi.mocked(readModelCatalogue).mockRejectedValue(new Error("host down"))

	const { result } = renderHook(() => useModelCatalogue())

	await waitFor(() =>
		expect(result.current).toEqual({ models: [], hasFailedToLoad: true }),
	)
	expect(raiseFailureNotice).toHaveBeenCalledWith({
		title: "Couldn’t read the models this machine offers.",
		report: expect.objectContaining({ raisedIn: "use-model-catalogue" }),
	})
})
