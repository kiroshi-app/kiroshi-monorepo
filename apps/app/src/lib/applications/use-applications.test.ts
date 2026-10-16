// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	type NoticeMessage,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import type { CatalogueCategory } from "@workspace/ui/components/plugin-settings/applications-catalogue"
import { i18n } from "@workspace/ui/lib/i18n"

import type { InstallTarget, InstallValues } from "./application-install"
import type { Application, ApplicationSearch } from "./application-port"
import {
	createFakeApplicationPort,
	type FakeApplicationPort,
} from "./fake-application-port"
import { catalogueStatusOf, useApplications } from "./use-applications"
import { READ_BOUND_MS } from "./use-read-bound"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { EnvOwner } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import {
	joinFakeHost,
	leaveFakeHost,
	reopenFakeRelay,
} from "../host/fake-joined-hosts"
import { invalidateOnHostReconnect } from "../query/host-invalidations"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	...(await import("../host/fake-joined-hosts")).fakeHostModule,
}))

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
})

const USER: EnvOwner = { kind: "user" }

const COMPANION: EnvOwner = { kind: "bot", id: "default", spaceId: "personal" }

const PAPER: Application = {
	name: "paper",
	title: "Paper",
	description: "Draws interfaces.",
	config: { command: "npx", args: ["-y", "@paper/mcp"] },
	tools: ["draw"],
	install: { kind: "nothing" },
}

const MARKED: Application = {
	...PAPER,
	logo: "<svg />",
	logoUrl: "https://paper.test/logo.png",
}

const SUPERSET: Application = {
	name: "superset",
	title: "Superset",
	description: "Runs workspaces.",
	config: { type: "http", url: "https://api.superset.sh/mcp" },
	tools: ["tasks_list"],
	install: {
		kind: "key",
		fields: [
			{ name: "Authorization", secret: "SUPERSET_API_KEY", concealed: true },
		],
	},
}

const TWO_KEYED: Application = {
	name: "@owner/two-headers",
	title: "Two headers",
	description: "Asks a key and a tenant.",
	config: { type: "http", url: "https://two.test/mcp" },
	tools: ["search"],
	install: {
		kind: "key",
		fields: [
			{ name: "apiKey", secret: "APIKEY", concealed: true },
			{ name: "tenant", secret: "TENANT", concealed: false },
		],
	},
}

const LINEAR: Application = {
	name: "linear",
	title: "Linear",
	description: "Files issues.",
	config: { type: "http", url: "https://mcp.linear.app/mcp" },
	tools: ["list_issues"],
	install: { kind: "oauth" },
}

const REFUSED: Application = {
	name: "@owner/queried",
	title: "Queried",
	description: "Asks a key its url would carry.",
	config: { type: "http", url: "https://queried.test/mcp" },
	tools: ["search"],
	install: {
		kind: "refused",
		field: "apiKey",
		reason: 'the required field "apiKey" names no header to carry it',
	},
}

const targetOf = (overrides: Partial<InstallTarget> = {}): InstallTarget => ({
	owner: USER,
	declared: [],
	connect: async () => undefined,
	settle: async () => undefined,
	...overrides,
})

const flushed = () =>
	vi.isFakeTimers()
		? vi.advanceTimersByTimeAsync(0)
		: new Promise((resolve) => setTimeout(resolve, 0))

const settled = () =>
	act(async () => {
		for (let round = 0; round < 5; round += 1) {
			await flushed()
		}
	})

type CatalogueOpen = { isCatalogueOpen: boolean }

const mountedOn = async (
	port = createFakeApplicationPort(),
	store: TranscriptStore = createFakeTranscriptStore(),
	reportFailure: (notice: NoticeMessage) => void = () => undefined,
) => {
	const { result, rerender } = renderHook(
		({ isCatalogueOpen }: CatalogueOpen) =>
			useApplications(port, store, { isCatalogueOpen, reportFailure }),
		{
			wrapper: createQueryTestWrapper().wrapper,
			initialProps: { isCatalogueOpen: true },
		},
	)
	const acting = (run: () => void) =>
		act(async () => {
			run()
			await flushed()
		})
	await settled()
	return {
		getState: () => result.current.state,
		actions: () => result.current.actions,
		browse: () => acting(() => result.current.actions.browse()),
		retry: () => acting(() => result.current.actions.retry()),
		search: (query: string) =>
			acting(() => result.current.actions.search(query)),
		pickCategory: (category: CatalogueCategory) =>
			acting(() => result.current.actions.pickCategory(category)),
		pick: (id: string) => acting(() => result.current.actions.pick(id)),
		leave: () => acting(() => result.current.actions.leave()),
		install: async (target: InstallTarget, values?: InstallValues) => {
			await acting(() => result.current.actions.install(target, values))
			await settled()
		},
		closeCatalogue: () => act(() => rerender({ isCatalogueOpen: false })),
		openCatalogue: () => act(() => rerender({ isCatalogueOpen: true })),
	}
}

const installedOf = (application: string) => ({
	conversationId: "conversation-1",
	application,
	title: application,
	scope: "user" as const,
	install: { kind: "nothing" as const },
})

const reportingOn = async (port: FakeApplicationPort) => {
	const reportFailure = vi.fn()
	const controller = await mountedOn(
		port,
		createFakeTranscriptStore(),
		reportFailure,
	)
	return { controller, reportFailure }
}

const UNREFRESHED_NOTICE = {
	title: i18n.t("bots:applications.catalogue.unrefreshed.title"),
	description: i18n.t("bots:applications.catalogue.unrefreshed.description"),
}

type PendingSearch = {
	answer: (found: ApplicationSearch) => void
	refuse: (reason: unknown) => void
}

const pendingSearchOn = (port: FakeApplicationPort): PendingSearch => {
	const reading: PendingSearch = { answer: () => {}, refuse: () => {} }
	port.search = () =>
		new Promise((resolve, reject) => {
			reading.answer = resolve
			reading.refuse = reject
		})
	return reading
}

const catalogueNeverAnswering = (port: FakeApplicationPort) => {
	port.catalogue = () => new Promise(() => {})
}

const pendingCatalogueOn = (port: FakeApplicationPort) => {
	const reading = { answer: (_curated: Application[]) => {} }
	port.catalogue = () =>
		new Promise((resolve) => {
			reading.answer = resolve
		})
	return reading
}

const searchesOf = (port: FakeApplicationPort) =>
	port.calls.filter((call) => call.command === "search")

describe("useApplications", () => {
	it("opens on the curated applications the host answers", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER, SUPERSET]
		const controller = await mountedOn(port)

		await settled()

		expect(controller.getState().curated).toEqual([PAPER, SUPERSET])
	})

	it("reads the catalogue again, its rows still on screen, when the host reconnects", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		await joinFakeHost("garage")
		const { queryClient, wrapper } = createQueryTestWrapper()
		const stopInvalidating = invalidateOnHostReconnect(queryClient)
		const { result } = renderHook(
			() =>
				useApplications(port, createFakeTranscriptStore(), {
					isCatalogueOpen: true,
				}),
			{ wrapper },
		)
		await settled()
		port.curated = [PAPER, SUPERSET]

		reopenFakeRelay("garage")
		expect(result.current.state.curated).toEqual([PAPER])
		await settled()

		expect(result.current.state.curated).toEqual([PAPER, SUPERSET])
		stopInvalidating()
		await leaveFakeHost("garage")
	})

	it("reads the catalogue once for two readers mounted together", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		const options = { isCatalogueOpen: true }

		renderHook(
			() => [
				useApplications(port, store, options),
				useApplications(port, store, options),
			],
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settled()

		expect(port.calls).toEqual([{ command: "catalogue" }])
	})

	it("reads the catalogue, the directory and the mark again when an application is installed", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		port.found = [LINEAR]
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()

		port.curated = [PAPER, SUPERSET]
		port.found = [LINEAR, SUPERSET]
		port.announce(installedOf("paper"))
		await settled()

		expect(controller.getState().curated).toEqual([PAPER, SUPERSET])
		expect(controller.getState().directory).toEqual([LINEAR, SUPERSET])
	})

	it("keeps the curated rows it holds when a catalogue re-read is refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const controller = await mountedOn(port)

		port.refusals.catalogue = { kind: "catalogueUnreadable", detail: "gone" }
		port.announce(installedOf("paper"))
		await settled()

		expect(controller.getState().curated).toEqual([PAPER])
		expect(raiseFailureNotice).toHaveBeenCalledOnce()
	})

	it("reports it is reading the catalogue until the read lands", async () => {
		const port = createFakeApplicationPort()
		const reading = pendingCatalogueOn(port)
		const controller = await mountedOn(port)

		expect(controller.getState().isReadingCatalogue).toBe(true)

		reading.answer([PAPER])
		await settled()

		expect(controller.getState().isReadingCatalogue).toBe(false)
		expect(controller.getState().curated).toEqual([PAPER])
	})

	it("reports a catalogue it could not read", async () => {
		const port = createFakeApplicationPort()
		port.refusals.catalogue = { kind: "catalogueUnreadable", detail: "gone" }

		const controller = await mountedOn(port)

		expect(controller.getState().hasCatalogueFailed).toBe(true)
		expect(raiseFailureNotice).toHaveBeenCalledExactlyOnceWith({
			title: i18n.t("bots:applications.catalogue.unavailable"),
			report: expect.objectContaining({
				context: expect.objectContaining({ raisedIn: "use-applications" }),
			}),
		})
	})

	it("reads the whole directory once the catalogue page opens", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR, SUPERSET]
		const controller = await mountedOn(port)

		await controller.browse()
		expect(controller.getState().isReadingDirectory).toBe(true)
		await settled()

		expect(searchesOf(port)).toEqual([{ command: "search", query: "" }])
		expect(controller.getState().directory).toEqual([LINEAR, SUPERSET])
		expect(controller.getState().isReadingDirectory).toBe(false)
	})

	it("reads the directory again for every page that opens it", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const controller = await mountedOn(port)

		await controller.browse()
		await settled()
		port.found = [LINEAR, SUPERSET]
		await controller.browse()
		await settled()

		expect(searchesOf(port)).toHaveLength(2)
		expect(controller.getState().directory).toEqual([LINEAR, SUPERSET])
	})

	it("issues no second directory read while one is in flight", async () => {
		const port = createFakeApplicationPort()
		pendingSearchOn(port)
		const search = vi.spyOn(port, "search")
		const controller = await mountedOn(port)

		await controller.browse()
		await controller.browse()

		expect(controller.getState().isReadingDirectory).toBe(true)
		expect(search).toHaveBeenCalledOnce()
	})

	it("keeps the held directory listed and raises a notice when a re-read is refused", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const { controller, reportFailure } = await reportingOn(port)
		await controller.browse()
		await settled()

		port.refusals.search = { kind: "registryTimedOut" }
		await controller.browse()
		await settled()

		expect(controller.getState().directory).toEqual([LINEAR])
		expect(controller.getState().hasDirectoryFailed).toBe(false)
		expect(reportFailure).toHaveBeenCalledTimes(1)
		expect(reportFailure).toHaveBeenCalledWith(UNREFRESHED_NOTICE)
	})

	it("narrows what it holds on a keystroke without calling the port", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR, SUPERSET]
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()

		for (const typed of ["l", "li", "lin", "line", "linea", "linear"]) {
			await controller.search(typed)
		}
		await settled()

		expect(searchesOf(port)).toEqual([{ command: "search", query: "" }])
		expect(controller.getState().query).toBe("linear")
		expect(controller.getState().directory).toEqual([LINEAR, SUPERSET])
		expect(controller.getState().isReadingDirectory).toBe(false)
	})

	it("holds the picked category so every page reads one value", async () => {
		const controller = await mountedOn()

		expect(controller.getState().category).toBe("everything")

		await controller.pickCategory("developer-tools")

		expect(controller.getState().category).toBe("developer-tools")
	})

	it("reports a directory it could not read and reads it again on a retry", async () => {
		const port = createFakeApplicationPort()
		port.refusals.search = { kind: "registryTimedOut" }
		const controller = await mountedOn(port)

		await controller.browse()
		await settled()
		expect(controller.getState().hasDirectoryFailed).toBe(true)
		expect(controller.getState().directory).toEqual([])

		port.refusals = {}
		port.found = [LINEAR]
		await controller.retry()
		await settled()

		expect(searchesOf(port)).toEqual([
			{ command: "search", query: "" },
			{ command: "search", query: "" },
		])
		expect(controller.getState().hasDirectoryFailed).toBe(false)
		expect(controller.getState().directory).toEqual([LINEAR])
	})

	it("reads the directory again when the page opens after a failed read", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()

		port.refusals.search = { kind: "registryTimedOut" }
		await controller.retry()
		await settled()
		expect(controller.getState().hasDirectoryFailed).toBe(false)
		expect(controller.getState().directory).toEqual([LINEAR])

		port.refusals = {}
		port.found = [LINEAR, SUPERSET]
		await controller.browse()
		await settled()

		expect(searchesOf(port)).toHaveLength(3)
		expect(controller.getState().hasDirectoryFailed).toBe(false)
		expect(controller.getState().directory).toEqual([LINEAR, SUPERSET])
	})

	it("keeps the answer of the last read and drops an earlier one", async () => {
		const port = createFakeApplicationPort()
		const answers: ((found: ApplicationSearch) => void)[] = []
		port.search = () =>
			new Promise((resolve) => {
				answers.push(resolve)
			})
		const controller = await mountedOn(port)

		await controller.browse()
		await controller.retry()
		answers[1]?.({ applications: [LINEAR] })
		answers[0]?.({ applications: [SUPERSET] })
		await settled()

		expect(controller.getState().directory).toEqual([LINEAR])
		expect(controller.getState().isReadingDirectory).toBe(false)
	})

	it("says the served cache is stale", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundIsStale = true
		const controller = await mountedOn(port)

		await controller.browse()
		await settled()

		expect(controller.getState().isDirectoryStale).toBe(true)
		expect(controller.getState().directory).toEqual([LINEAR])
	})

	it("says nothing about staleness for a cache read within the day", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundIsStale = false
		const controller = await mountedOn(port)

		await controller.browse()
		await settled()

		expect(controller.getState().isDirectoryStale).toBe(false)
	})

	it("holds on to the results when one directory side failed", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundFailure = { kind: "registryTimedOut" }
		const controller = await mountedOn(port)

		await controller.browse()
		await settled()

		expect(controller.getState().directory).toEqual([LINEAR])
		expect(controller.getState().hasDirectoryPartlyFailed).toBe(true)
		expect(controller.getState().hasDirectoryFailed).toBe(false)
	})

	it("raises one notice for a directory read with a failed side", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundFailure = { kind: "registryTimedOut" }
		const { controller, reportFailure } = await reportingOn(port)

		await controller.browse()
		await settled()

		expect(controller.getState().directory).toEqual([LINEAR])
		expect(reportFailure).toHaveBeenCalledTimes(1)
		expect(reportFailure).toHaveBeenCalledWith(UNREFRESHED_NOTICE)
	})

	it("raises no notice for a directory read where both sides answered", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const { controller, reportFailure } = await reportingOn(port)

		await controller.browse()
		await settled()

		expect(reportFailure).not.toHaveBeenCalled()
	})

	it("reports no partial failure when both directory sides answered", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const controller = await mountedOn(port)

		await controller.browse()
		await settled()

		expect(controller.getState().hasDirectoryPartlyFailed).toBe(false)
	})

	it("keeps the partial failure of the held rows behind a refused read", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundFailure = { kind: "registryTimedOut" }
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()

		port.refusals.search = { kind: "registryTimedOut" }
		await controller.retry()
		await settled()

		expect(controller.getState().hasDirectoryFailed).toBe(false)
		expect(controller.getState().hasDirectoryPartlyFailed).toBe(true)
	})

	it("keeps the partial failure of the held rows until the re-read lands", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundFailure = { kind: "registryTimedOut" }
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()

		const reading = pendingSearchOn(port)
		await controller.browse()
		expect(controller.getState().hasDirectoryPartlyFailed).toBe(true)

		reading.answer({ applications: [LINEAR, SUPERSET] })
		await settled()

		expect(controller.getState().hasDirectoryPartlyFailed).toBe(false)
		expect(controller.getState().directory).toEqual([LINEAR, SUPERSET])
	})

	it("drops the partial failure of an empty directory as a re-read starts", async () => {
		const port = createFakeApplicationPort()
		port.foundFailure = { kind: "registryTimedOut" }
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()
		expect(controller.getState().hasDirectoryPartlyFailed).toBe(true)

		const reading = pendingSearchOn(port)
		await controller.browse()
		expect(controller.getState().hasDirectoryPartlyFailed).toBe(false)

		reading.answer({ applications: [LINEAR] })
		await settled()

		expect(controller.getState().hasDirectoryPartlyFailed).toBe(false)
	})

	it("keeps the stale mark of the held rows through a refused re-read", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundIsStale = true
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()

		const reading = pendingSearchOn(port)
		await controller.browse()
		expect(controller.getState().isDirectoryStale).toBe(true)

		reading.refuse({ kind: "registryTimedOut" })
		await settled()

		expect(controller.getState().isDirectoryStale).toBe(true)
		expect(controller.getState().directory).toEqual([LINEAR])
	})

	it("drops the stale mark of an empty directory on a refused re-read", async () => {
		const port = createFakeApplicationPort()
		port.foundIsStale = true
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()

		const reading = pendingSearchOn(port)
		await controller.browse()
		expect(controller.getState().isDirectoryStale).toBe(true)

		reading.refuse({ kind: "registryTimedOut" })
		await settled()

		expect(controller.getState().isDirectoryStale).toBe(false)
	})

	it("listens to directory refreshes once however many times the catalogue opens", async () => {
		const port = createFakeApplicationPort()
		const onDirectoryRefreshed = vi.spyOn(port, "onDirectoryRefreshed")
		const controller = await mountedOn(port)

		await controller.browse()
		await settled()
		await controller.browse()
		await settled()

		expect(onDirectoryRefreshed).toHaveBeenCalledOnce()
		expect(port.isListeningToDirectory()).toBe(true)
	})

	it("lists the rows of a refreshed directory keeping the query and the category", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()
		await controller.search("lin")
		await controller.pickCategory("on-this-machine")

		port.found = [LINEAR, SUPERSET]
		port.refreshDirectory()
		await settled()

		expect(searchesOf(port)).toHaveLength(2)
		expect(controller.getState().directory).toEqual([LINEAR, SUPERSET])
		expect(controller.getState().query).toBe("lin")
		expect(controller.getState().category).toBe("on-this-machine")
	})

	it("keeps the held rows listed while a refreshed directory is read", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()

		pendingSearchOn(port)
		port.refreshDirectory()
		await settled()

		expect(controller.getState().isReadingDirectory).toBe(true)
		expect(controller.getState().directory).toEqual([LINEAR])
	})

	it("drops the stale mark once a refreshed directory answers fresh", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		port.foundIsStale = true
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()

		port.foundIsStale = false
		port.refreshDirectory()
		await settled()

		expect(controller.getState().isDirectoryStale).toBe(false)
	})

	it("keeps the held rows and raises a notice when a refresh answers a failed side", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const { controller, reportFailure } = await reportingOn(port)
		await controller.browse()
		await settled()

		port.found = []
		port.foundFailure = { kind: "registryUnreached", detail: "offline" }
		port.refreshDirectory()
		await settled()

		expect(controller.getState().directory).toEqual([LINEAR])
		expect(controller.getState().hasDirectoryFailed).toBe(false)
		expect(reportFailure).toHaveBeenCalledWith(UNREFRESHED_NOTICE)
	})

	it("keeps the held rows and raises a notice when a refresh read is refused", async () => {
		const port = createFakeApplicationPort()
		port.found = [LINEAR]
		const { controller, reportFailure } = await reportingOn(port)
		await controller.browse()
		await settled()

		port.refusals.search = { kind: "registryTimedOut" }
		port.refreshDirectory()
		await settled()

		expect(controller.getState().directory).toEqual([LINEAR])
		expect(controller.getState().hasDirectoryFailed).toBe(false)
		expect(reportFailure).toHaveBeenCalledWith(UNREFRESHED_NOTICE)
	})

	it("reads no refreshed directory while every catalogue view is closed", async () => {
		const port = createFakeApplicationPort()
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()

		await controller.closeCatalogue()
		port.refreshDirectory()
		await settled()

		expect(searchesOf(port)).toHaveLength(1)
	})

	it("reads the directory refreshed while closed once the catalogue opens again", async () => {
		const port = createFakeApplicationPort()
		const controller = await mountedOn(port)
		await controller.browse()
		await settled()
		await controller.closeCatalogue()
		port.found = [LINEAR]
		port.refreshDirectory()
		await settled()

		await controller.openCatalogue()
		await settled()

		expect(searchesOf(port)).toHaveLength(2)
		expect(controller.getState().directory).toEqual([LINEAR])
	})

	describe("with a directory read that never answers", () => {
		beforeEach(() => {
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		const passing = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

		it("shows the failure state once the bound passes with no rows held", async () => {
			const port = createFakeApplicationPort()
			pendingSearchOn(port)
			const controller = await mountedOn(port)

			await controller.browse()
			await passing(READ_BOUND_MS - 1)
			expect(controller.getState().hasDirectoryFailed).toBe(false)
			await passing(1)

			expect(controller.getState().isReadingDirectory).toBe(false)
			expect(controller.getState().hasDirectoryFailed).toBe(true)
		})

		it("lists the rows of a read answering after the bound", async () => {
			const port = createFakeApplicationPort()
			const reading = pendingSearchOn(port)
			const controller = await mountedOn(port)
			await controller.browse()
			await passing(READ_BOUND_MS)
			expect(controller.getState().hasDirectoryFailed).toBe(true)

			reading.answer({ applications: [LINEAR] })
			await settled()

			expect(controller.getState().directory).toEqual([LINEAR])
			expect(controller.getState().hasDirectoryFailed).toBe(false)
		})

		it("cancels the bound once a read answers before it", async () => {
			const port = createFakeApplicationPort()
			const reading = pendingSearchOn(port)
			const controller = await mountedOn(port)
			await controller.browse()

			reading.answer({ applications: [] })
			await settled()
			await passing(READ_BOUND_MS)

			expect(controller.getState().hasDirectoryFailed).toBe(false)
		})

		it("sets no bound on a re-read while rows are held", async () => {
			const port = createFakeApplicationPort()
			port.found = [LINEAR]
			const controller = await mountedOn(port)
			await controller.browse()
			await settled()

			pendingSearchOn(port)
			port.refreshDirectory()
			await passing(READ_BOUND_MS)

			expect(controller.getState().isReadingDirectory).toBe(true)
			expect(controller.getState().hasDirectoryFailed).toBe(false)
		})
	})

	describe("with a curated read that never answers", () => {
		beforeEach(() => {
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		const passing = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

		it("stops showing skeletons once the bound passes with no curated rows", async () => {
			const port = createFakeApplicationPort()
			catalogueNeverAnswering(port)
			const controller = await mountedOn(port)

			await passing(READ_BOUND_MS - 1)
			expect(catalogueStatusOf(controller.getState()).isLoading).toBe(true)
			await passing(1)

			expect(catalogueStatusOf(controller.getState()).isLoading).toBe(false)
		})

		it("shows the failure line with a retry reading the catalogue again once the bound passes", async () => {
			const port = createFakeApplicationPort()
			catalogueNeverAnswering(port)
			const catalogue = vi.spyOn(port, "catalogue")
			const controller = await mountedOn(port)

			await passing(READ_BOUND_MS)
			expect(catalogueStatusOf(controller.getState()).hasFailed).toBe(true)
			await controller.retry()
			await settled()

			expect(catalogue).toHaveBeenCalledTimes(2)
		})

		it("lists the curated rows of a read answering after the bound", async () => {
			const port = createFakeApplicationPort()
			const reading = pendingCatalogueOn(port)
			const controller = await mountedOn(port)
			await passing(READ_BOUND_MS)
			expect(catalogueStatusOf(controller.getState()).hasFailed).toBe(true)

			reading.answer([PAPER])
			await settled()

			expect(controller.getState().curated).toEqual([PAPER])
			expect(catalogueStatusOf(controller.getState())).toEqual({
				isLoading: false,
				hasFailed: false,
			})
		})

		it("shows the failure line once the directory bound passes with no curated rows", async () => {
			const port = createFakeApplicationPort()
			const reading = pendingCatalogueOn(port)
			pendingSearchOn(port)
			const controller = await mountedOn(port)
			await passing(READ_BOUND_MS - 5_000)
			await controller.browse()
			reading.answer([])

			await passing(READ_BOUND_MS)

			expect(catalogueStatusOf(controller.getState())).toEqual({
				isLoading: false,
				hasFailed: true,
			})
		})
	})

	it("declares a server for an install that asks nothing", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("paper")

		await controller.install(targetOf())

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([
			{ name: "paper", config: PAPER.config, title: PAPER.title },
		])
	})

	it("declares a server carrying the mark of the application it picked", async () => {
		const port = createFakeApplicationPort()
		port.curated = [MARKED]
		const store = createFakeTranscriptStore()
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("paper")

		await controller.install(targetOf())

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([
			{
				name: "paper",
				config: MARKED.config,
				title: MARKED.title,
				logo: MARKED.logo,
				logoUrl: MARKED.logoUrl,
			},
		])
	})

	it("writes the typed key under the secrets of the declared server", async () => {
		const port = createFakeApplicationPort()
		port.curated = [SUPERSET]
		const store = createFakeTranscriptStore()
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("superset")

		await controller.install(targetOf(), { Authorization: "sk-typed" })

		const secrets = await store.environmentVariables({
			kind: "server",
			name: "superset",
			owner: USER,
		})
		expect(secrets.map((entry) => entry.name)).toEqual(["SUPERSET_API_KEY"])
	})

	it("refuses an install naming a field the page left without a value", async () => {
		const port = createFakeApplicationPort()
		port.curated = [TWO_KEYED]
		const store = createFakeTranscriptStore()
		const declare = vi.spyOn(store, "setPluginMcpServer")
		const write = vi.spyOn(store, "setEnvironmentVariable")
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("@owner/two-headers")

		await controller.install(targetOf(), { Authorization: "sk-typed" })

		expect(controller.getState().failure).toContain("tenant")
		expect(declare).not.toHaveBeenCalled()
		expect(write).not.toHaveBeenCalled()
		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
	})

	it("names every field no value arrived under the name of", async () => {
		const port = createFakeApplicationPort()
		port.curated = [TWO_KEYED]
		const controller = await mountedOn(port)
		await settled()
		await controller.pick("@owner/two-headers")

		await controller.install(targetOf(), { apiKey: "   " })

		expect(controller.getState().failure).toContain("apiKey")
		expect(controller.getState().failure).toContain("tenant")
	})

	it("writes every value under the variable of the field it was typed into", async () => {
		const port = createFakeApplicationPort()
		port.curated = [TWO_KEYED]
		const store = createFakeTranscriptStore()
		const write = vi.spyOn(store, "setEnvironmentVariable")
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("@owner/two-headers")

		await controller.install(targetOf(), { tenant: "acme", apiKey: "sk-typed" })

		const scope = { kind: "server", name: "@owner/two-headers", owner: USER }
		expect(write.mock.calls).toEqual([
			[scope, "APIKEY", "sk-typed"],
			[scope, "TENANT", "acme"],
		])
		expect(controller.getState().failure).toBeNull()
	})

	it("runs the connect of the scope for an install that signs in", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const controller = await mountedOn(port)
		await settled()
		await controller.pick("linear")
		const connect = vi.fn(async () => undefined)

		await controller.install(targetOf({ connect }))

		expect(connect).toHaveBeenCalledWith("linear", "https://mcp.linear.app/mcp")
	})

	it("shows the reason of a refused declaration and keeps the page open", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "setPluginMcpServer").mockRejectedValue({
			kind: "store",
			detail: "the bundle is read only",
		})
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("paper")

		await controller.install(targetOf())

		expect(controller.getState().failure).toContain("the bundle is read only")
		expect(controller.getState().picked).toEqual(PAPER)
		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
	})

	it("shows the reason of a refused install and declares no server", async () => {
		const port = createFakeApplicationPort()
		port.curated = [REFUSED]
		const store = createFakeTranscriptStore()
		const declare = vi.spyOn(store, "setPluginMcpServer")
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("@owner/queried")

		await controller.install(targetOf())

		expect(controller.getState().failure).toContain("apiKey")
		expect(declare).not.toHaveBeenCalled()
		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
	})

	it("shows the reason a config no runner runs was refused and writes nothing", async () => {
		const port = createFakeApplicationPort()
		port.curated = [TWO_KEYED]
		port.runnerRefusal = {
			field: "uvx",
			reason: "the command uvx is on no directory of your PATH",
		}
		const store = createFakeTranscriptStore()
		const declare = vi.spyOn(store, "setPluginMcpServer")
		const write = vi.spyOn(store, "setEnvironmentVariable")
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("@owner/two-headers")

		await controller.install(targetOf(), { apiKey: "sk-typed", tenant: "acme" })

		expect(controller.getState().failure).toContain(
			"the command uvx is on no directory of your PATH",
		)
		expect(declare).not.toHaveBeenCalled()
		expect(write).not.toHaveBeenCalled()
		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
	})

	it("reads the config of what it installs against the runners of this machine", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const controller = await mountedOn(port)
		await settled()
		await controller.pick("paper")

		await controller.install(targetOf())

		expect(port.calls).toContainEqual({
			command: "runnable",
			config: PAPER.config,
		})
		expect(controller.getState().failure).toBeNull()
	})

	it("refuses a second add of the application it is installing", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		const declare = vi.spyOn(store, "setPluginMcpServer")
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("paper")

		await act(async () => {
			controller.actions().install(targetOf())
			controller.actions().install(targetOf())
		})
		await settled()

		expect(declare).toHaveBeenCalledTimes(1)
	})

	it("installs under a scope of its own what another scope already declares", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("paper")
		await controller.install(targetOf())

		await controller.install(
			targetOf({ owner: COMPANION, declared: ["ledger"] }),
		)

		expect(
			await store.pluginMcpServers({ kind: "bot", id: "default" }),
		).toEqual([{ name: "paper", config: PAPER.config, title: PAPER.title }])
	})

	it("refuses an add of an application the owner already declares", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const store = createFakeTranscriptStore()
		const declare = vi.spyOn(store, "setPluginMcpServer")
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("paper")

		await controller.install(targetOf({ declared: ["paper"] }))

		expect(declare).not.toHaveBeenCalled()
	})

	it("undeclares what the install declared when the key is refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [SUPERSET]
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "setEnvironmentVariable").mockRejectedValue({
			kind: "env",
			detail: "the keyring is locked",
		})
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("superset")

		await controller.install(targetOf(), { Authorization: "sk-typed" })

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
		expect(controller.getState().failure).toContain("the keyring is locked")
	})

	it("leaves a declaration it found in place when the key is refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [SUPERSET]
		const store = createFakeTranscriptStore()
		await store.setPluginMcpServer({ kind: "user" }, "superset", {
			type: "http",
		})
		vi.spyOn(store, "setEnvironmentVariable").mockRejectedValue({
			kind: "env",
			detail: "the keyring is locked",
		})
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("superset")

		await controller.install(targetOf(), { Authorization: "sk-typed" })

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([
			{ name: "superset", config: SUPERSET.config, title: SUPERSET.title },
		])
		expect(controller.getState().failure).toContain("the keyring is locked")
	})

	it("reports the key refusal even when the undeclaring is refused too", async () => {
		const port = createFakeApplicationPort()
		port.curated = [SUPERSET]
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "setEnvironmentVariable").mockRejectedValue({
			kind: "env",
			detail: "the keyring is locked",
		})
		vi.spyOn(store, "deletePluginMcpServer").mockRejectedValue({
			kind: "store",
			detail: "the bundle is read only",
		})
		const reportFailure = vi.fn()
		const controller = await mountedOn(port, store, reportFailure)
		await settled()
		await controller.pick("superset")

		await controller.install(targetOf(), { Authorization: "sk-typed" })

		expect(controller.getState().failure).toContain("the keyring is locked")
		expect(reportFailure).toHaveBeenCalledTimes(1)
	})

	it("undeclares what the install declared when the connect is refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const store = createFakeTranscriptStore()
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("linear")

		await controller.install(
			targetOf({
				connect: async () => {
					throw new Error("the sign-in timed out")
				},
			}),
		)

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
		expect(controller.getState().failure).toContain("the sign-in timed out")
	})

	it("deletes the secrets the connect wrote before it was refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const store = createFakeTranscriptStore()
		const scope = { kind: "server", name: "linear", owner: USER } as const
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("linear")

		await controller.install(
			targetOf({
				connect: async () => {
					await store.setEnvironmentVariable(scope, "LINEAR_TOKEN", "tok")
					throw new Error("the sign-in timed out")
				},
			}),
		)

		expect(await store.environmentVariables(scope)).toEqual([])
	})

	it("deletes the keys already written when a later key is refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [TWO_KEYED]
		const store = createFakeTranscriptStore()
		const write = store.setEnvironmentVariable
		vi.spyOn(store, "setEnvironmentVariable").mockImplementation(
			(scope, name, value) =>
				name === "TENANT"
					? Promise.reject({ kind: "env", detail: "the keyring is locked" })
					: write(scope, name, value),
		)
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("@owner/two-headers")

		await controller.install(targetOf(), { apiKey: "sk-typed", tenant: "acme" })

		expect(
			await store.environmentVariables({
				kind: "server",
				name: "@owner/two-headers",
				owner: USER,
			}),
		).toEqual([])
		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
	})

	it("leaves the declaration and the secrets the owner had before the install", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const store = createFakeTranscriptStore()
		const scope = { kind: "server", name: "linear", owner: USER } as const
		await store.setPluginMcpServer({ kind: "user" }, "linear", LINEAR.config)
		await store.setEnvironmentVariable(scope, "LINEAR_TOKEN", "kept")
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("linear")

		await controller.install(
			targetOf({
				connect: async () => {
					throw new Error("the sign-in timed out")
				},
			}),
		)

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([
			{ name: "linear", config: LINEAR.config, title: LINEAR.title },
		])
		expect(
			(await store.environmentVariables(scope)).map((entry) => entry.name),
		).toEqual(["LINEAR_TOKEN"])
	})

	it("reports the connect refusal even when the undeclaring is refused too", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "deletePluginMcpServer").mockRejectedValue({
			kind: "store",
			detail: "the bundle is read only",
		})
		const reportFailure = vi.fn()
		const controller = await mountedOn(port, store, reportFailure)
		await settled()
		await controller.pick("linear")

		await controller.install(
			targetOf({
				connect: async () => {
					throw new Error("the sign-in timed out")
				},
			}),
		)

		expect(controller.getState().failure).toContain("the sign-in timed out")
		expect(reportFailure).toHaveBeenCalledTimes(1)
	})

	it("undeclares the application even when clearing its secrets is refused", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "deleteEnvironmentVariable").mockRejectedValue({
			kind: "env",
			detail: "the keyring is locked",
		})
		const reportFailure = vi.fn()
		const controller = await mountedOn(port, store, reportFailure)
		await settled()
		await controller.pick("linear")

		await controller.install(
			targetOf({
				connect: async (name) => {
					await store.setEnvironmentVariable(
						{ kind: "server", name, owner: USER },
						"LINEAR_TOKEN",
						"tok",
					)
					throw new Error("the sign-in timed out")
				},
			}),
		)

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([])
		expect(controller.getState().failure).toContain("the sign-in timed out")
		expect(reportFailure).toHaveBeenCalledTimes(1)
	})

	it("declares the application again when a later install connects", async () => {
		const port = createFakeApplicationPort()
		port.curated = [LINEAR]
		const store = createFakeTranscriptStore()
		const controller = await mountedOn(port, store)
		await settled()
		await controller.pick("linear")
		await controller.install(
			targetOf({
				connect: async () => {
					throw new Error("the sign-in timed out")
				},
			}),
		)

		await controller.install(targetOf())

		expect(await store.pluginMcpServers({ kind: "user" })).toEqual([
			{ name: "linear", config: LINEAR.config, title: LINEAR.title },
		])
		expect(controller.getState().failure).toBeNull()
	})

	it("settles the scope once the install lands", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		const controller = await mountedOn(port)
		await settled()
		await controller.pick("paper")
		const settle = vi.fn(async () => undefined)

		await controller.install(targetOf({ settle }))

		expect(settle).toHaveBeenCalledTimes(1)
	})

	it("leaves the install page without forgetting the search", async () => {
		const port = createFakeApplicationPort()
		port.curated = [PAPER]
		port.found = [LINEAR]
		const controller = await mountedOn(port)
		await settled()
		await controller.browse()
		await settled()
		await controller.search("linear")
		await controller.pick("paper")

		await controller.leave()

		expect(controller.getState().picked).toBeNull()
		expect(controller.getState().query).toBe("linear")
		expect(controller.getState().directory).toEqual([LINEAR])
	})
})
