// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { createApplicationsController } from "./applications-controller"
import { createFakeApplicationPort } from "./fake-application-port"
import { useDirectoryWatch } from "./use-directory-watch"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"

afterEach(cleanup)

type Watching = { isCatalogueViewOpen: boolean }

const browsedWhileOpen = async () => {
	const port = createFakeApplicationPort()
	const controller = createApplicationsController(
		port,
		createFakeTranscriptStore(),
		{ reportFailure: () => undefined },
	)
	const rendered = renderHook(
		({ isCatalogueViewOpen }: Watching) =>
			useDirectoryWatch(controller, isCatalogueViewOpen),
		{ initialProps: { isCatalogueViewOpen: true } },
	)
	controller.browse()
	await act(async () => undefined)
	return { port, rendered }
}

describe("useDirectoryWatch", () => {
	it("keeps listening while the view holding the catalogue is open", async () => {
		const { port } = await browsedWhileOpen()

		expect(port.isListeningToDirectory()).toBe(true)
	})

	it("stops listening once the view holding the catalogue closes", async () => {
		const { port, rendered } = await browsedWhileOpen()

		rendered.rerender({ isCatalogueViewOpen: false })
		await act(async () => undefined)

		expect(port.isListeningToDirectory()).toBe(false)
	})

	it("stops listening once its owner unmounts", async () => {
		const { port, rendered } = await browsedWhileOpen()

		rendered.unmount()
		await act(async () => undefined)

		expect(port.isListeningToDirectory()).toBe(false)
	})
})
