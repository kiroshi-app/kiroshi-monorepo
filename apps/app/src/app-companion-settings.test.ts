// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, expect, it, vi } from "vitest"

import { BLANK_BOT_PERMISSIONS } from "@workspace/ui/components/bot-settings"
import { i18n } from "@workspace/ui/lib/i18n"

import type { ApplicationInstall } from "@/lib/applications/application-port"
import type { MissionInSpace, OfferedModel_Serialize } from "@/lib/bindings"
import { botQueryKeys } from "@/lib/bots/bot-query-keys"
import { newBotIdentity } from "@/lib/bots/bot-settings"
import { readModelCatalogue } from "@/lib/bots/model-catalogue"
import type { ChatDriver } from "@/lib/chat/driver"
import { createFakeChatDriver } from "@/lib/chat/fake-driver"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { aMission } from "@/lib/missions/mission-fixtures"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import { readMirror, writeMirror } from "@/lib/user/preferences-mirror"

type Harness = {
	store: TranscriptStore | null
	installs: ApplicationInstall[]
	missions: MissionInSpace[]
	models: OfferedModel_Serialize[]
	announceArrival: () => void
	startingSession: (botId: string) => Promise<void>
}

const harness = vi.hoisted(
	(): Harness => ({
		store: null,
		installs: [],
		missions: [],
		models: [],
		announceArrival: () => undefined,
		startingSession: async () => undefined,
	}),
)

vi.mock("@/lib/bots/model-catalogue", () => ({
	readModelCatalogue: vi.fn(async () => harness.models),
}))

vi.mock(
	"@/lib/conversations/use-companion-arrivals",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@/lib/conversations/use-companion-arrivals")
			>()
		return {
			useCompanionArrivals: (onArrived: () => void) => {
				harness.announceArrival = onArrived
				actual.useCompanionArrivals(onArrived)
			},
		}
	},
)

vi.mock("@/lib/conversations/create-store", () => ({
	createTranscriptStore: () => harness.store,
}))

vi.mock("@/lib/chat/create-driver", async () => {
	const { withFakeHostWrites } = await import(
		"@/lib/conversations/fake-host-writes"
	)
	return {
		createChatDriver: (store: TranscriptStore): ChatDriver => {
			const driver = withFakeHostWrites(
				createFakeChatDriver({ stepMs: 1 }),
				store,
			)
			return {
				...driver,
				startOrResumeSession: async (scope, ...opening) => {
					await harness.startingSession(scope.botId)
					return driver.startOrResumeSession(scope, ...opening)
				},
			}
		},
	}
})

vi.mock("@/lib/applications/application-transport", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/lib/applications/application-transport")
		>()
	return {
		...actual,
		applicationTransport: {
			...actual.applicationTransport,
			installs: async (conversationId: string) =>
				harness.installs.filter(
					(install) => install.conversationId === conversationId,
				),
		},
	}
})

vi.mock("@/lib/missions/missions-transport", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/missions/missions-transport")>()
	const { aSpacePage: pageOf } = await import("@/lib/missions/mission-fixtures")
	const heldMission = (missionId: string) => {
		const held = harness.missions.find(
			({ mission }) => mission.id === missionId,
		)
		if (!held) throw new Error(`no mission ${missionId}`)
		return held.mission
	}
	return {
		...actual,
		missionsTransport: {
			...actual.missionsTransport,
			spacePage: async () => pageOf(harness.missions),
			detailOn: async (_hostId: string | null, missionId: string) => ({
				mission: heldMission(missionId),
				events: [],
			}),
		},
	}
})

const { App } = await import("@/App")

const SETTLE_MS = 200

const ATLAS = "Atlas"

const ATLAS_TITLE = "Repository archivist"

const ATLAS_INSTRUCTIONS = "Keeps the release notes honest."

const NOVA = "Nova"

const ROOM = "Round table"

const ATLAS_SAID = "the notes are in"

const ROOM_QUESTION = "where are the notes"

const ROOM_POST = "posted for the room"

const MENTION_TEXT = "hold the gate"

const DRAFT = "half a thought for the room"

const MISSION_DRAFT = "half a thought for the mission"

const MISSION_OBJECTIVE = "Ship the release notes"

const MISSION_SAID = "the mission notes are drafted"

const SENTRY = "sentry"

const SENTRY_SERVER = { type: "http", url: "https://sentry.internal/mcp" }

type Seeded = {
	atlasId: string
	atlasThreadId: string
	companionCount: number
	missionThreadId: string
}

let said = 0

const saidIn = async (
	store: TranscriptStore,
	conversationId: string,
	content: string,
) => {
	said += 1
	const turnId = `turn-${said}`
	const id = `said-${said}`
	await store.startTurn({ conversationId, id: turnId, startedAt: said })
	await store.appendUserMessage({
		id,
		conversationId,
		turnId,
		authorBotId: null,
		repliedToMessageId: null,
		content,
		createdAt: said,
	})
	return { id, turnId }
}

const repliedIn = async (
	store: TranscriptStore,
	conversationId: string,
	authorBotId: string,
	content: string,
) => {
	const asked = await saidIn(store, conversationId, ROOM_QUESTION)
	const id = `reply-${said}`
	await store.openAssistantMessage({
		id,
		conversationId,
		turnId: asked.turnId,
		authorBotId,
		repliedToMessageId: asked.id,
		createdAt: said,
	})
	await store.finalizeMessage(id, "complete", content)
}

const seed = async (store: TranscriptStore): Promise<Seeded> => {
	const [space] = await store.spaces()
	const atlas = await store.createBot(
		{
			...newBotIdentity([]),
			name: ATLAS,
			title: ATLAS_TITLE,
			instructions: ATLAS_INSTRUCTIONS,
			permissions: { ...BLANK_BOT_PERMISSIONS, defaultMode: "acceptEdits" },
		},
		space.id,
	)
	const nova = await store.createBot(
		{ ...newBotIdentity([atlas]), name: NOVA },
		space.id,
	)
	await store.setPluginMcpServer(
		{ kind: "bot", id: atlas.id },
		SENTRY,
		SENTRY_SERVER,
	)
	const room = await store.createConversation({
		botIds: [atlas.id, nova.id],
		sectionId: null,
		spaceId: space.id,
		title: ROOM,
	})
	await repliedIn(store, room.id, atlas.id, ROOM_POST)
	await saidIn(store, room.id, `<@${atlas.id}> ${MENTION_TEXT}`)
	const atlasThread = await store.mainChat(atlas.id, space.id)
	await saidIn(store, atlasThread.id, ATLAS_SAID)
	const missionThread = await store.createConversation({
		botIds: [atlas.id],
		sectionId: null,
		spaceId: space.id,
		title: MISSION_OBJECTIVE,
	})
	await repliedIn(store, missionThread.id, atlas.id, MISSION_SAID)
	harness.missions = [
		{
			mission: aMission({
				botId: atlas.id,
				objective: MISSION_OBJECTIVE,
				originConversationId: room.id,
				spaceId: space.id,
				threadConversationId: missionThread.id,
			}),
			conversationId: room.id,
			conversationTitle: ROOM,
		},
	]
	return {
		atlasId: atlas.id,
		atlasThreadId: atlasThread.id,
		companionCount: (await store.bots(space.id)).length,
		missionThreadId: missionThread.id,
	}
}

type StoreChange = (store: TranscriptStore) => TranscriptStore

const mountApp = async (change: StoreChange = (store) => store) => {
	writeMirror({ ...readMirror(), firstRunDone: true })
	const store = change(createFakeTranscriptStore())
	const seeded = await seed(store)
	vi.useFakeTimers()
	harness.store = store
	const { queryClient } = launchApp()
	await settle()
	return { ...seeded, queryClient }
}

const launchApp = () => {
	const query = createQueryTestWrapper()
	render(createElement(App), { wrapper: query.wrapper })
	return query
}

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.useRealTimers()
	harness.installs = []
	harness.missions = []
	harness.models = []
	harness.startingSession = async () => undefined
})

const settle = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(SETTLE_MS)
	})
}

const press = async (control: Element) => {
	await act(async () => {
		fireEvent.click(control)
	})
	await settle()
}

const openContextMenuOn = async (target: Element) => {
	await act(async () => {
		fireEvent.contextMenu(target, { clientX: 20, clientY: 20 })
	})
	await settle()
}

const chooseInMenu = async (label: string) =>
	press(screen.getByRole("menuitem", { name: label }))

const rosterRowOf = (name: string) => {
	const label = [
		...document.querySelectorAll('[data-slot="roster-row-name"]'),
	].find((row) => row.textContent === name)
	const button = label?.closest("button")
	if (!button) throw new Error(`no roster row for ${name}`)
	return button
}

const openRow = (name: string) => press(rosterRowOf(name))

const turnOf = (text: string) => {
	const turn = screen.getByText(text).closest('[data-slot="message"]')
	if (!turn) throw new Error(`no turn holding ${text}`)
	return turn
}

const authorAvatarOf = (text: string) => {
	const avatar = turnOf(text).querySelector(
		'[data-slot="author-line"] [data-slot="bot-identity-avatar"]',
	)
	if (!avatar) throw new Error(`no author line avatar for ${text}`)
	return avatar
}

const mentionPillOf = (text: string) => {
	const pill = turnOf(text).querySelector('button[data-slot="bot-mention"]')
	if (!pill) throw new Error(`no mention pill in ${text}`)
	return pill
}

const railOf = () =>
	screen.getByRole("navigation", { name: i18n.t("bots:rail.label") })

const spacesLogoOf = () =>
	railOf()
		.querySelector('[data-slot="space-avatar"]')
		?.closest("button") as HTMLElement

const openSpaceSettingsByRail = async () => {
	await press(spacesLogoOf())
	await press(
		screen.getByRole("menuitem", { name: i18n.t("bots:rail.spaceSettings") }),
	)
}

const avatarOf = () =>
	within(railOf()).getAllByRole("button").at(-1) as HTMLElement

const conversationsEntryOf = () =>
	within(railOf()).getByRole("button", {
		name: i18n.t("bots:rail.conversations"),
	})

const isMarked = (railItem: HTMLElement) =>
	railItem.getAttribute("aria-current") === "true"

const settingsMenuOf = () =>
	screen.queryByRole("navigation", { name: i18n.t("settings:screen.menu") })

const shownScreenOf = () => {
	const menu = settingsMenuOf()
	if (!menu) return null
	const subtitles = ["space", "user", "companion"] as const
	const subtitleKeys = {
		space: "space",
		user: "user",
		companion: "agent",
	} as const
	return {
		subtitle: subtitles.find((subtitle) =>
			within(menu).queryByText(
				i18n.t(`settings:screen.subtitle.${subtitleKeys[subtitle]}`),
			),
		),
		entry: within(menu).getByRole("button", { current: "page" }).textContent,
	}
}

const BACK_LABELS = [
	i18n.t("settings:screen.back"),
	i18n.t("settings:screen.backToAgents"),
]

const companionScreenOf = (name: string) => {
	const menu = settingsMenuOf()
	if (!menu) return null
	return {
		...shownScreenOf(),
		isNamed: within(menu).queryByText(name) !== null,
		back: BACK_LABELS.find(
			(label) => within(menu).queryByRole("button", { name: label }) !== null,
		),
	}
}

const ON_GENERAL = {
	subtitle: "companion",
	entry: i18n.t("bots:dialog.tab.general"),
	isNamed: true,
	back: i18n.t("settings:screen.back"),
}

const menuEntryOf = (name: string | RegExp) =>
	within(settingsMenuOf() as HTMLElement).getByRole("button", { name })

const pressBack = (label: string) => press(menuEntryOf(label))

const composerOf = () =>
	screen.getByRole<HTMLTextAreaElement>("textbox", {
		name: i18n.t("chat:composer.label"),
	})

const companionCards = () => [
	...document.querySelectorAll<HTMLElement>('[data-slot="companion-card"]'),
]

const cardOf = (name: string) => {
	const card = companionCards().find(
		(shown) =>
			shown.querySelector('[data-slot="companion-card-name"]')?.textContent ===
			name,
	)
	if (!card) throw new Error(`no companion card for ${name}`)
	return card
}

const openCompanionsOfSpace = async () => {
	await openSpaceSettingsByRail()
	await press(menuEntryOf(new RegExp(`^${i18n.t("settings:rail.agents")}`)))
}

const installOf = (
	atlasId: string,
	atlasThreadId: string,
	install: ApplicationInstall["install"],
): ApplicationInstall => ({
	id: `install-${install.kind}`,
	conversationId: atlasThreadId,
	application: SENTRY,
	title: "Sentry",
	scope: "companion",
	destinationId: atlasId,
	install,
	lastMessageSeq: 1,
	createdAt: 0,
})

const missionsEntryOf = () =>
	within(railOf()).getByRole("button", { name: i18n.t("bots:rail.missions") })

const missionCardOf = (objective: string) =>
	screen.getByRole("button", { name: new RegExp(objective) })

const raisedNoticeTitles = () =>
	[...document.querySelectorAll('[data-slot="toast-title"]')].map(
		(title) => title.textContent,
	)

const refusingDeletion: StoreChange = (store) => ({
	...store,
	deleteBot: () => Promise.reject({ kind: "storage" }),
})

const deleteFromDangerZone = async () => {
	await press(
		screen.getByRole("button", { name: i18n.t("bots:danger.delete") }),
	)
	await press(
		within(
			screen.getByRole("alertdialog", {
				name: i18n.t("bots:danger.confirm.title", { name: ATLAS }),
			}),
		).getByRole("button", {
			name: i18n.t("bots:danger.delete"),
		}),
	)
}

const pressInstallCard = () =>
	press(
		screen.getByRole("button", {
			name: i18n.t("chat:applicationInstall.openSettings"),
		}),
	)

it("shows one card per companion of the Space under Companions, with its identity, title, instructions and approval mode", async () => {
	const { companionCount } = await mountApp()

	await openCompanionsOfSpace()

	expect(
		companionCards().map(
			(card) =>
				card.querySelector('[data-slot="companion-card-name"]')?.textContent,
		),
	).toEqual(expect.arrayContaining([ATLAS, NOVA]))
	expect(companionCards()).toHaveLength(companionCount)
	const atlas = cardOf(ATLAS)
	expect(atlas.querySelector('[data-slot="bot-identity-avatar"]')).toBeTruthy()
	expect(atlas.textContent).toContain(ATLAS_TITLE)
	expect(
		atlas.querySelector('[data-slot="companion-card-excerpt"]')?.textContent,
	).toBe(ATLAS_INSTRUCTIONS)
	expect(
		atlas.querySelector('[data-slot="companion-card-mode"]')?.textContent,
	).toBe(i18n.t("bots:approvals.mode.option.acceptEdits.label"))
})

it("opens the screen of a pressed card with Back to Companions, and Back returns to the cards", async () => {
	const { companionCount } = await mountApp()
	await openCompanionsOfSpace()

	await press(cardOf(ATLAS))

	expect(companionScreenOf(ATLAS)).toEqual({
		...ON_GENERAL,
		back: i18n.t("settings:screen.backToAgents"),
	})
	expect(isMarked(spacesLogoOf())).toBe(true)

	await pressBack(i18n.t("settings:screen.backToAgents"))

	expect(shownScreenOf()).toEqual({
		subtitle: "space",
		entry: expect.stringContaining(i18n.t("settings:rail.agents")),
	})
	expect(companionCards()).toHaveLength(companionCount)
})

it("creates a companion from Create a companion, as the roster create does", async () => {
	const { companionCount } = await mountApp()
	await openCompanionsOfSpace()

	await press(
		screen.getByRole("button", {
			name: i18n.t("settings:space.agents.create"),
		}),
	)

	expect(companionCards()).toHaveLength(companionCount + 1)
})

it("opens the companion screen on General from the Settings of a roster row menu", async () => {
	await mountApp()

	await openContextMenuOn(rosterRowOf(ATLAS))
	await chooseInMenu(i18n.t("bots:roster.settings"))

	expect(companionScreenOf(ATLAS)).toEqual(ON_GENERAL)
})

it("opens the companion screen on the Danger zone from the Delete of a roster row menu", async () => {
	await mountApp()

	await openContextMenuOn(rosterRowOf(ATLAS))
	await chooseInMenu(i18n.t("bots:roster.delete"))

	expect(companionScreenOf(ATLAS)).toEqual({
		...ON_GENERAL,
		entry: i18n.t("bots:dialog.tab.danger"),
	})
})

it("leaves the Danger zone for the entry chosen after a Delete", async () => {
	await mountApp()
	await openContextMenuOn(rosterRowOf(ATLAS))
	await chooseInMenu(i18n.t("bots:roster.delete"))

	await press(menuEntryOf(i18n.t("bots:dialog.tab.instructions")))

	expect(companionScreenOf(ATLAS)?.entry).toBe(
		i18n.t("bots:dialog.tab.instructions"),
	)
})

it("opens the companion screen on General from the Settings of a message avatar menu", async () => {
	await mountApp()
	await openRow(ROOM)

	await openContextMenuOn(authorAvatarOf(ROOM_POST))
	await chooseInMenu(i18n.t("bots:roster.settings"))

	expect(companionScreenOf(ATLAS)).toEqual(ON_GENERAL)
})

it("opens the companion screen on General from the Settings of a mention pill menu", async () => {
	await mountApp()
	await openRow(ROOM)

	await openContextMenuOn(mentionPillOf(MENTION_TEXT))
	await chooseInMenu(i18n.t("bots:roster.settings"))

	expect(companionScreenOf(ATLAS)).toEqual(ON_GENERAL)
})

it("opens the companion screen on General from the identity button of the solo header", async () => {
	await mountApp()
	await openRow(ATLAS)

	await press(
		screen.getByRole("button", {
			name: i18n.t("chat:screen.identity", { name: ATLAS }),
		}),
	)

	expect(companionScreenOf(ATLAS)).toEqual(ON_GENERAL)
})

it("opens the companion screen on Applications from an application install card", async () => {
	const seeded = await mountApp()
	harness.installs = [
		installOf(seeded.atlasId, seeded.atlasThreadId, { kind: "nothing" }),
	]
	await openRow(ATLAS)

	await pressInstallCard()

	expect(companionScreenOf(ATLAS)).toEqual({
		...ON_GENERAL,
		entry: i18n.t("bots:dialog.tab.applications"),
	})
})

it("opens the companion screen on the application a deep link names", async () => {
	const seeded = await mountApp()
	harness.installs = [
		installOf(seeded.atlasId, seeded.atlasThreadId, {
			kind: "key",
			secrets: ["SENTRY_AUTH_TOKEN"],
		}),
	]
	await openRow(ATLAS)

	await pressInstallCard()

	expect(companionScreenOf(ATLAS)?.subtitle).toBe("companion")
	expect(
		menuEntryOf(i18n.t("bots:dialog.tab.applications")).getAttribute(
			"aria-current",
		),
	).toBe("page")
	expect(
		within(settingsMenuOf() as HTMLElement).queryByRole("button", {
			name: new RegExp(`^${SENTRY}`),
		}),
	).toBeNull()
	expect(screen.getByRole("heading", { level: 2, name: SENTRY })).toBeTruthy()
})

it("brings back the open conversation and its draft on Back to conversations", async () => {
	await mountApp()
	await openRow(ROOM)
	fireEvent.change(composerOf(), { target: { value: DRAFT } })
	await openContextMenuOn(rosterRowOf(ATLAS))
	await chooseInMenu(i18n.t("bots:roster.settings"))

	await pressBack(i18n.t("settings:screen.back"))

	expect(settingsMenuOf()).toBeNull()
	expect(composerOf().value).toBe(DRAFT)
	expect(isMarked(conversationsEntryOf())).toBe(true)
})

it("keeps the rail on the companion screen, and the Space settings replace it", async () => {
	await mountApp()
	await openContextMenuOn(rosterRowOf(ATLAS))
	await chooseInMenu(i18n.t("bots:roster.settings"))

	expect(railOf()).toBeTruthy()
	await openSpaceSettingsByRail()

	expect(shownScreenOf()).toEqual({
		subtitle: "space",
		entry: i18n.t("settings:rail.space"),
	})
})

it("replaces the companion screen with the User settings from the rail avatar", async () => {
	await mountApp()
	await openContextMenuOn(rosterRowOf(ATLAS))
	await chooseInMenu(i18n.t("bots:roster.settings"))

	await press(avatarOf())

	expect(shownScreenOf()).toEqual({
		subtitle: "user",
		entry: i18n.t("settings:rail.account"),
	})
})

it("keeps the companion screen open on the Danger zone and raises a notice when the deletion fails", async () => {
	await mountApp(refusingDeletion)
	await openContextMenuOn(rosterRowOf(ATLAS))
	await chooseInMenu(i18n.t("bots:roster.delete"))

	await deleteFromDangerZone()

	expect(
		raisedNoticeTitles().filter(
			(title) => title === i18n.t("bots:danger.failed"),
		),
	).toHaveLength(1)
	expect(raisedNoticeTitles()).not.toContain(
		i18n.t("bots:spaces.remove.failed"),
	)
	expect(companionScreenOf(ATLAS)).toEqual({
		...ON_GENERAL,
		entry: i18n.t("bots:dialog.tab.danger"),
	})
})

it("brings back the open mission thread and its draft on Back to conversations", async () => {
	await mountApp()
	await press(missionsEntryOf())
	await press(missionCardOf(MISSION_OBJECTIVE))
	expect(screen.getByText(MISSION_SAID)).toBeTruthy()
	fireEvent.change(composerOf(), { target: { value: MISSION_DRAFT } })
	await openContextMenuOn(authorAvatarOf(MISSION_SAID))
	await chooseInMenu(i18n.t("bots:roster.settings"))
	expect(companionScreenOf(ATLAS)).toEqual(ON_GENERAL)

	await pressBack(i18n.t("settings:screen.back"))

	expect(settingsMenuOf()).toBeNull()
	expect(screen.getByText(MISSION_SAID)).toBeTruthy()
	expect(composerOf().value).toBe(MISSION_DRAFT)
})

it("returns to the conversations when the companion whose settings are open no longer exists", async () => {
	const seeded = await mountApp()
	await openContextMenuOn(rosterRowOf(ATLAS))
	await chooseInMenu(i18n.t("bots:roster.settings"))
	expect(companionScreenOf(ATLAS)).toEqual(ON_GENERAL)

	await harness.store?.deleteBot(seeded.atlasId)
	await act(async () => harness.announceArrival())
	await settle()

	expect(settingsMenuOf()).toBeNull()
	expect(rosterRowOf(NOVA)).toBeTruthy()
})

const RUNTIME_MODELS: OfferedModel_Serialize[] = [
	{ value: "opus", supportedEffortLevels: ["low", "medium", "high"] },
	{ value: "sonnet", supportedEffortLevels: ["low", "medium", "high"] },
	{ value: "haiku", supportedEffortLevels: [] },
]

const HIGH = i18n.t("bots:runtime.effort.option.high")

const DEFAULT_EFFORT = i18n.t("bots:runtime.effort.option.default")

const runtimeSelectOf = (label: string) =>
	screen.getByRole("combobox", { name: label })

const modelSelectOf = () => runtimeSelectOf(i18n.t("bots:runtime.model.label"))

const effortSelectOf = () =>
	runtimeSelectOf(i18n.t("bots:runtime.effort.label"))

const shownRuntime = () => ({
	model: modelSelectOf().textContent,
	effort: effortSelectOf().textContent,
})

const pickIn = async (select: HTMLElement, option: string) => {
	await press(select)
	const choice = screen.getByRole("option", { name: option })
	await act(async () => {
		fireEvent.pointerDown(choice, { pointerType: "mouse" })
	})
	await press(choice)
}

const openRuntimeOf = async (name: string) => {
	await openContextMenuOn(rosterRowOf(name))
	await chooseInMenu(i18n.t("bots:roster.settings"))
	await press(menuEntryOf(i18n.t("bots:dialog.tab.runtime")))
}

const pickSonnetOnHigh = async () => {
	await pickIn(modelSelectOf(), "sonnet")
	await pickIn(effortSelectOf(), HIGH)
}

const storedRuntimeOf = async (botId: string) => {
	const bots = (await harness.store?.bots(null)) ?? []
	const bot = bots.find(({ id }) => id === botId)
	return { model: bot?.model, effort: bot?.effort }
}

const SONNET_ON_HIGH = { model: "sonnet", effort: HIGH }

const refusingUpdates: StoreChange = (store) => ({
	...store,
	updateBot: () => Promise.reject({ kind: "storage" }),
})

it("writes a picked model then effort to the store and keeps both on the selectors", async () => {
	harness.models = RUNTIME_MODELS
	const seeded = await mountApp()
	await openRuntimeOf(ATLAS)

	await pickSonnetOnHigh()

	expect(await storedRuntimeOf(seeded.atlasId)).toEqual({
		model: "sonnet",
		effort: "high",
	})
	expect(shownRuntime()).toEqual(SONNET_ON_HIGH)
})

it("shows the picked model and effort once the settings are closed and reopened", async () => {
	harness.models = RUNTIME_MODELS
	await mountApp()
	await openRuntimeOf(ATLAS)
	await pickSonnetOnHigh()

	await pressBack(i18n.t("settings:screen.back"))
	await openRuntimeOf(ATLAS)

	expect(shownRuntime()).toEqual(SONNET_ON_HIGH)
})

it("shows the picked model and effort read from storage after a relaunch", async () => {
	harness.models = RUNTIME_MODELS
	await mountApp()
	await openRuntimeOf(ATLAS)
	await pickSonnetOnHigh()

	cleanup()
	launchApp()
	await settle()

	expect(shownScreenOf()?.entry).toBe(i18n.t("bots:dialog.tab.runtime"))
	expect(shownRuntime()).toEqual(SONNET_ON_HIGH)
})

it("saves no effort and shows Default once the picked model does not support the held one", async () => {
	harness.models = RUNTIME_MODELS
	const seeded = await mountApp()
	await openRuntimeOf(ATLAS)
	await pickSonnetOnHigh()

	await pickIn(modelSelectOf(), "haiku")

	expect(await storedRuntimeOf(seeded.atlasId)).toEqual({
		model: "haiku",
		effort: null,
	})
	expect(shownRuntime()).toEqual({ model: "haiku", effort: DEFAULT_EFFORT })
})

it("keeps the picked model and effort on the selectors when the model catalogue is read again and fails", async () => {
	harness.models = RUNTIME_MODELS
	const { queryClient } = await mountApp()
	await openRuntimeOf(ATLAS)
	await pickSonnetOnHigh()

	vi.mocked(readModelCatalogue).mockRejectedValueOnce(new Error("restarting"))
	await act(async () => {
		await queryClient.invalidateQueries({
			queryKey: botQueryKeys.modelCatalogue(),
		})
	})
	await settle()

	expect(shownRuntime()).toEqual(SONNET_ON_HIGH)
})

it("raises a notice and puts the stored model back on the selector when the write fails", async () => {
	harness.models = RUNTIME_MODELS
	await mountApp(refusingUpdates)
	await openRuntimeOf(ATLAS)

	await pickIn(modelSelectOf(), "sonnet")

	expect(raisedNoticeTitles()).toContain(i18n.t("bots:roster.settingsUnsaved"))
	expect(modelSelectOf().textContent).toBe("opus")
})

const NEXT_PROMPT = "which model answers now"

type HeldRuntimeWrite = {
	change: StoreChange
	release: () => void
	steps: string[]
	modelsSessionsStartedOn: string[]
}

const holdingRuntimeWrite = (): HeldRuntimeWrite => {
	const gate = Promise.withResolvers<void>()
	const steps: string[] = []
	const modelsSessionsStartedOn: string[] = []
	const change: StoreChange = (store) => ({
		...store,
		updateBot: async (id, identity) => {
			await gate.promise
			steps.push("write settled")
			return store.updateBot(id, identity)
		},
	})
	harness.startingSession = async (botId) => {
		steps.push("session started")
		const bots = (await harness.store?.bots(null)) ?? []
		const model = bots.find(({ id }) => id === botId)?.model
		if (model) modelsSessionsStartedOn.push(model)
	}
	return { change, release: gate.resolve, steps, modelsSessionsStartedOn }
}

const sendInAtlasThread = async (text: string) => {
	await pressBack(i18n.t("settings:screen.back"))
	await openRow(ATLAS)
	fireEvent.change(composerOf(), { target: { value: text } })
	await act(async () => {
		fireEvent.keyDown(composerOf(), { key: "Enter" })
	})
	await settle()
}

const pickSonnetThenSend = async (held: HeldRuntimeWrite) => {
	await openRuntimeOf(ATLAS)
	await pickIn(modelSelectOf(), "sonnet")
	held.steps.length = 0
	held.modelsSessionsStartedOn.length = 0
	await sendInAtlasThread(NEXT_PROMPT)
}

it("starts the session of a prompt sent during a runtime write only once the write lands, on the picked model", async () => {
	harness.models = RUNTIME_MODELS
	const held = holdingRuntimeWrite()
	await mountApp(held.change)
	await pickSonnetThenSend(held)

	expect(held.steps).toEqual([])

	held.release()
	await settle()

	expect(held.steps.slice(0, 2)).toEqual(["write settled", "session started"])
	expect(held.modelsSessionsStartedOn[0]).toBe("sonnet")
})

it("starts the session on the stored model and raises a notice when the held runtime write is refused", async () => {
	harness.models = RUNTIME_MODELS
	const held = holdingRuntimeWrite()
	await mountApp((store) => held.change(refusingUpdates(store)))
	await pickSonnetThenSend(held)

	expect(held.steps).toEqual([])

	held.release()
	await settle()

	expect(held.steps.slice(0, 2)).toEqual(["write settled", "session started"])
	expect(held.modelsSessionsStartedOn[0]).toBe("opus")
	expect(raisedNoticeTitles()).toContain(i18n.t("bots:roster.settingsUnsaved"))
})
