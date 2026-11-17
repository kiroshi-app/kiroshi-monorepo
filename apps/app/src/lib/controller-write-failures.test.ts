// @vitest-environment happy-dom

import { QueryObserver } from "@tanstack/react-query"
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { useControllerState } from "./use-controller"

import { newBotIdentity, toSettingsValue } from "./bots/bot-settings"
import { mountRoster } from "./bots/mounted-roster"
import type { RosterController } from "./bots/roster-controller"
import { createFakeTranscriptStore } from "./conversations/fake-transcript-store"
import type { TranscriptStore } from "./conversations/store-port"
import { nameCallOnFailure } from "./host/failed-call"
import { createQueryTestWrapper } from "./query/query-test-wrapper"
import {
	type BotSections,
	createSectionsController,
	type SectionsController,
} from "./sections/sections-controller"
import { useSectionReads } from "./sections/use-sections"
import {
	createSpacesController,
	type SpacesController,
} from "./spaces/spaces-controller"

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(async () => () => undefined),
}))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal()),
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
})

const REFUSAL_KIND = "storage"

type StoreCall = keyof TranscriptStore

type RefusableStore = {
	store: TranscriptStore
	refuse: (call: StoreCall) => void
	hasRefused: (call: StoreCall) => boolean
}

const refusableStore = (): RefusableStore => {
	const refusing = new Set<PropertyKey>()
	const refused = new Set<PropertyKey>()
	const refusalOf = (call: PropertyKey) => {
		refused.add(call)
		return nameCallOnFailure(
			String(call),
			Promise.reject({ kind: REFUSAL_KIND }),
		)
	}
	const store = new Proxy(createFakeTranscriptStore(), {
		get: (target, call, receiver) => {
			const value = Reflect.get(target, call, receiver)
			if (typeof value !== "function") {
				return value
			}
			return (...args: unknown[]) =>
				refusing.has(call) ? refusalOf(call) : value.apply(target, args)
		},
	})
	return {
		store,
		refuse: (call) => refusing.add(call),
		hasRefused: (call) => refused.has(call),
	}
}

const NOT_A_WRITE = "not a write"

type WriteCase<Rig> = {
	refuses: StoreCall
	run: (rig: Rig) => unknown
}

type WriteCases<Controller, Rig> = Record<
	keyof Controller,
	WriteCase<Rig> | typeof NOT_A_WRITE
>

const writesOf = <Controller, Rig>(cases: WriteCases<Controller, Rig>) =>
	Object.entries(cases).flatMap(([write, entry]) =>
		entry === NOT_A_WRITE ? [] : [[write, entry as WriteCase<Rig>] as const],
	)

const rejectionOf = async (run: () => unknown): Promise<unknown> => {
	try {
		await run()
		return undefined
	} catch (reason) {
		return reason
	}
}

const isRefusal = (reason: unknown) =>
	typeof reason === "object" &&
	reason !== null &&
	"kind" in reason &&
	reason.kind === REFUSAL_KIND

const hasRaisedTheCall = (call: StoreCall) =>
	vi
		.mocked(raiseFailureNotice)
		.mock.calls.some(
			([{ report }]) =>
				report?.context?.command === call &&
				report.context.errorKind === REFUSAL_KIND,
		)

const expectEveryRefusalHandedOn = <Rig>(
	rigUp: (refusable: RefusableStore) => Promise<Rig>,
	writes: (readonly [string, WriteCase<Rig>])[],
) =>
	it.each(writes)(
		"hands the refusal of %s to the failure path or its caller",
		async (_write, { refuses, run }) => {
			const refusable = refusableStore()
			const rig = await rigUp(refusable)
			refusable.refuse(refuses)

			const rejection = await rejectionOf(() => run(rig))

			await vi.waitFor(() => expect(refusable.hasRefused(refuses)).toBe(true))
			await vi.waitFor(() =>
				expect(isRefusal(rejection) || hasRaisedTheCall(refuses)).toBe(true),
			)
		},
	)

const SECOND_SPACE = "Vocca"

type SectionsRig = { controller: SectionsController; sectionId: string }

const onScreenBots: BotSections = {
	move: () => undefined,
	clear: () => undefined,
	pin: () => undefined,
	hostSpaceIdOf: (spaceRowId) => spaceRowId,
	isOnScreen: () => true,
	reload: async () => undefined,
}

const sectionsRig = async ({ store }: RefusableStore): Promise<SectionsRig> => {
	const { id: sectionId } = await store.createSection("personal", "Writers")
	const { queryClient, wrapper } = createQueryTestWrapper()
	const controller = createSectionsController(store, onScreenBots, {
		queryClient,
	})
	renderHook(
		() => useSectionReads(controller, useControllerState(controller)),
		{ wrapper },
	)
	await controller.enter("personal")
	return { controller, sectionId }
}

const SECTION_WRITES: WriteCases<SectionsController, SectionsRig> = {
	getState: NOT_A_WRITE,
	subscribe: NOT_A_WRITE,
	listQuery: NOT_A_WRITE,
	enter: NOT_A_WRITE,
	keep: NOT_A_WRITE,
	create: {
		refuses: "createSection",
		run: ({ controller }) => controller.create("personal", "Readers"),
	},
	rename: {
		refuses: "renameSection",
		run: ({ controller, sectionId }) => controller.rename(sectionId, "Poets"),
	},
	pin: {
		refuses: "pinRoster",
		run: ({ controller, sectionId }) =>
			controller.pin("personal", [{ id: sectionId, sectionId: null }]),
	},
	remove: {
		refuses: "deleteSection",
		run: ({ controller, sectionId }) => controller.remove(sectionId),
	},
	moveBot: {
		refuses: "moveBotToSection",
		run: ({ controller, sectionId }) =>
			controller.moveBot("default", sectionId),
	},
}

type SpacesRig = { controller: SpacesController; spaceIds: string[] }

const ARCHIVE_PATH = "/archives/personal.kiroshi"

const spacesRig = async ({ store }: RefusableStore): Promise<SpacesRig> => {
	await store.createSpace(SECOND_SPACE)
	const { queryClient } = createQueryTestWrapper()
	const controller = createSpacesController(store, {
		queryClient,
		pickers: {
			pickExportPath: async () => ARCHIVE_PATH,
			pickImportPath: async () => ARCHIVE_PATH,
		},
		reportSuccess: () => undefined,
		hosts: { activate: async () => undefined },
	})
	new QueryObserver(queryClient, controller.listQuery).subscribe(
		() => undefined,
	)
	await controller.load(null)
	const spaceIds = controller.getState().spaces.map((space) => space.id)
	return { controller, spaceIds }
}

const SPACE_WRITES: WriteCases<SpacesController, SpacesRig> = {
	getState: NOT_A_WRITE,
	subscribe: NOT_A_WRITE,
	listQuery: NOT_A_WRITE,
	watch: NOT_A_WRITE,
	load: NOT_A_WRITE,
	select: NOT_A_WRITE,
	create: {
		refuses: "createSpace",
		run: ({ controller }) => controller.create(),
	},
	describe: {
		refuses: "updateSpace",
		run: ({ controller, spaceIds: [first = ""] }) =>
			controller.describe(first, { name: "Atelier", colour: null }),
	},
	reorder: {
		refuses: "reorderSpaces",
		run: ({ controller, spaceIds }) =>
			controller.reorder(spaceIds.toReversed()),
	},
	remove: {
		refuses: "deleteSpace",
		run: ({ controller, spaceIds: [first = ""] }) => controller.remove(first),
	},
	exportSpace: {
		refuses: "exportSpace",
		run: ({ controller, spaceIds: [first = ""] }) =>
			controller.exportSpace(first),
	},
	importSpace: {
		refuses: "importSpace",
		run: ({ controller }) => controller.importSpace(),
	},
}

type RosterRig = {
	controller: RosterController
	conversationId: string
	namelessId: string
	guestId: string
	elsewhereId: string
}

const rosterRig = async ({ store }: RefusableStore): Promise<RosterRig> => {
	const elsewhere = await store.createSpace(SECOND_SPACE)
	const guest = await store.createBot(newBotIdentity([]), "personal")
	const conversation = await store.createConversation({
		spaceId: "personal",
		sectionId: null,
		title: "Launch",
		botIds: ["default", guest.id],
	})
	const nameless = await store.createConversation({
		spaceId: "personal",
		sectionId: null,
		title: "",
		botIds: ["default"],
	})
	const controller = mountRoster(store)
	await controller.load({
		spaces: ["personal", elsewhere.id].map((id) => ({
			spaceRowId: id,
			spaceId: id,
		})),
		spaceRowId: "personal",
		lastRowId: null,
	})
	return {
		controller,
		conversationId: conversation.id,
		namelessId: nameless.id,
		guestId: guest.id,
		elsewhereId: elsewhere.id,
	}
}

const heldBot = (controller: RosterController) => {
	const [bot] = controller.getState().bots
	if (!bot) {
		throw new Error("the roster holds no agent")
	}
	return bot
}

const ROSTER_WRITES: WriteCases<RosterController, RosterRig> = {
	getState: NOT_A_WRITE,
	subscribe: NOT_A_WRITE,
	rosterQuery: NOT_A_WRITE,
	soloThreadQuery: NOT_A_WRITE,
	soloStatesQuery: NOT_A_WRITE,
	load: NOT_A_WRITE,
	retryLoad: NOT_A_WRITE,
	reload: NOT_A_WRITE,
	holdPageRow: NOT_A_WRITE,
	holdHostState: NOT_A_WRITE,
	rereadSpaceSoon: NOT_A_WRITE,
	rereadSpacesOfBotSoon: NOT_A_WRITE,
	settingsSettled: NOT_A_WRITE,
	catchUpWithHost: NOT_A_WRITE,
	rereadConversationRow: NOT_A_WRITE,
	forgetConversation: NOT_A_WRITE,
	hostSpaceIdOf: NOT_A_WRITE,
	spacesOfBot: NOT_A_WRITE,
	spaceOfConversation: NOT_A_WRITE,
	enter: NOT_A_WRITE,
	select: NOT_A_WRITE,
	selectConversation: NOT_A_WRITE,
	showList: NOT_A_WRITE,
	moveToSection: NOT_A_WRITE,
	pin: NOT_A_WRITE,
	clearSection: NOT_A_WRITE,
	botsByPresence: NOT_A_WRITE,
	create: {
		refuses: "createBot",
		run: ({ controller }) => controller.create(),
	},
	createFromDraft: {
		refuses: "createBotFromDraft",
		run: ({ controller }) =>
			controller.createFromDraft({
				name: "Ada",
				job: "Writer",
				description: "Writes",
			}),
	},
	createConversation: {
		refuses: "createConversation",
		run: ({ controller }) => controller.createConversation(),
	},
	createUnselectedConversation: {
		refuses: "createConversation",
		run: ({ controller }) =>
			controller.createUnselectedConversation(["default"]),
	},
	duplicate: {
		refuses: "duplicateBot",
		run: ({ controller }) => controller.duplicate("default"),
	},
	describe: {
		refuses: "updateBot",
		run: ({ controller }) =>
			controller.describe("default", {
				...toSettingsValue(heldBot(controller)),
				name: "Atlas",
			}),
	},
	restyle: {
		refuses: "updateBot",
		run: ({ controller }) => controller.restyle("default", "Concise"),
	},
	uploadAvatar: {
		refuses: "setBotAvatarImage",
		run: ({ controller }) =>
			controller.uploadAvatar("default", new File(["png"], "face.png")),
	},
	remember: {
		refuses: "setBotMemory",
		run: ({ controller }) => controller.remember("default", "They ski."),
	},
	moveToSpace: {
		refuses: "moveBotToSpace",
		run: ({ controller, elsewhereId }) =>
			controller.moveToSpace("default", elsewhereId),
	},
	addToSpace: {
		refuses: "addBotToSpace",
		run: ({ controller, elsewhereId }) =>
			controller.addToSpace("default", elsewhereId),
	},
	removeFromSpace: {
		refuses: "removeBotFromSpace",
		run: ({ controller }) => controller.removeFromSpace("default", "personal"),
	},
	remove: {
		refuses: "deleteBot",
		run: ({ controller }) => controller.remove("default"),
	},
	moveConversationToSection: {
		refuses: "updateConversation",
		run: ({ controller, conversationId }) =>
			controller.moveConversationToSection(conversationId, null),
	},
	describeConversation: {
		refuses: "updateConversation",
		run: ({ controller, conversationId }) =>
			controller.describeConversation(conversationId, {
				name: "Liftoff",
				instructions: "",
			}),
	},
	styleConversation: {
		refuses: "updateConversation",
		run: ({ controller, conversationId }) =>
			controller.styleConversation(conversationId, { icon: "rocket" }),
	},
	nameConversation: {
		refuses: "updateConversation",
		run: ({ controller, namelessId }) =>
			controller.nameConversation(namelessId, {
				title: "Liftoff",
				icon: "rocket",
			}),
	},
	setConversationLead: {
		refuses: "setConversationLead",
		run: ({ controller, conversationId, guestId }) =>
			controller.setConversationLead(conversationId, guestId),
	},
	recruitToConversation: {
		refuses: "addConversationParticipant",
		run: ({ controller, namelessId, guestId }) =>
			controller.recruitToConversation(namelessId, guestId),
	},
	dismissFromConversation: {
		refuses: "removeConversationParticipant",
		run: ({ controller, conversationId, guestId }) =>
			controller.dismissFromConversation(conversationId, guestId),
	},
	removeConversation: {
		refuses: "deleteConversation",
		run: ({ controller, conversationId }) =>
			controller.removeConversation(conversationId),
	},
	discardConversation: {
		refuses: "deleteConversation",
		run: ({ controller, conversationId }) =>
			controller.discardConversation(conversationId),
	},
}

describe("a refused write of the sections controller", () => {
	expectEveryRefusalHandedOn(sectionsRig, writesOf(SECTION_WRITES))
})

describe("a refused write of the spaces controller", () => {
	expectEveryRefusalHandedOn(spacesRig, writesOf(SPACE_WRITES))
})

describe("a refused write of the roster controller", () => {
	expectEveryRefusalHandedOn(rosterRig, writesOf(ROSTER_WRITES))
})
