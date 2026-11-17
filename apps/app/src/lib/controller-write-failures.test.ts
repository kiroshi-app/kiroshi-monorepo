// @vitest-environment happy-dom

import { QueryObserver } from "@tanstack/react-query"
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import type { Skill } from "./bindings"
import { useControllerState } from "./use-controller"

import { newBotIdentity, toSettingsValue } from "./bots/bot-settings"
import { mountRoster } from "./bots/mounted-roster"
import type { RosterController } from "./bots/roster-controller"
import {
	createSkillFilesController,
	type OpenedSkillFile,
	type SkillFilesController,
	type SkillFilesPort,
} from "./bots/skill-files-controller"
import {
	type AttachmentsController,
	type AttachmentsPort,
	createAttachmentsController,
} from "./chat/attachments-controller"
import type { ChatController } from "./chat/chat-controller"
import { BOT, createHarness } from "./chat/controller/controller-fixtures"
import {
	type ConversationController,
	createConversationController,
} from "./conversations/conversation-controller"
import { withFakeHostWrites } from "./conversations/fake-host-writes"
import { createFakeTranscriptStore } from "./conversations/fake-transcript-store"
import {
	createScriptedDriver,
	type ScriptedDriver,
} from "./conversations/scripted-driver"
import type { Conversation } from "./conversations/store-contract"
import type { TranscriptStore } from "./conversations/store-port"
import { seatBots } from "./conversations/transcript-fixtures"
import { nameCallOnFailure } from "./host/failed-call"
import {
	type ClaudeImportController,
	type ClaudeImportPort,
	type ClaudeImportWorld,
	createClaudeImportController,
} from "./onboarding/claude-import-controller"
import {
	createOnboardingFlowController,
	type OnboardingFlowController,
	type OnboardingFlowWorld,
} from "./onboarding/onboarding-flow-controller"
import type { OnboardingPort } from "./onboarding/onboarding-port"
import {
	createSignInController,
	type SignInController,
	type SignInWorld,
} from "./onboarding/sign-in-controller"
import type { ConnectionStep } from "./onboarding/sign-in-flow"
import { createQueryTestWrapper } from "./query/query-test-wrapper"
import {
	type CollapsedSectionsController,
	createCollapsedSectionsController,
} from "./sections/collapsed-sections-controller"
import {
	type BotSections,
	createSectionsController,
	type SectionsController,
} from "./sections/sections-controller"
import { useSectionReads } from "./sections/use-sections"
import {
	createJoinedSpacesController,
	type JoinedSpacesController,
	type JoinedSpacesTransport,
} from "./spaces/joined-spaces-controller"
import {
	createSpacesController,
	type SpacesController,
} from "./spaces/spaces-controller"
import {
	createUpdaterController,
	type UpdaterController,
} from "./updater/updater-controller"
import { raiseUpdaterFailure } from "./updater/updater-failure"
import type { UpdaterPort } from "./updater/updater-port"
import type { UserPreferences } from "./user/preferences-contract"
import {
	createUserController,
	type UserController,
} from "./user/preferences-controller"
import type { userPreferencesStore } from "./user/preferences-transport"

type PreferencesStore = typeof userPreferencesStore

const preferencesHost = vi.hoisted(() => ({
	store: {} as object,
}))

vi.mock("./user/preferences-transport", () => ({
	userPreferencesStore: new Proxy(
		{},
		{ get: (_target, call) => Reflect.get(preferencesHost.store, call) },
	),
}))

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

type Refusals = {
	refuse: (call: string) => void
	hasRefused: (call: string) => boolean
	refusable: <Port extends object>(port: Port) => Port
}

const createRefusals = (): Refusals => {
	const refusing = new Set<PropertyKey>()
	const refused = new Set<PropertyKey>()
	const refusalOf = (call: PropertyKey) => {
		refused.add(call)
		return nameCallOnFailure(
			String(call),
			Promise.reject({ kind: REFUSAL_KIND }),
		)
	}
	return {
		refuse: (call) => refusing.add(call),
		hasRefused: (call) => refused.has(call),
		refusable: (port) =>
			new Proxy(port, {
				get: (target, call, receiver) => {
					const value = Reflect.get(target, call, receiver)
					if (typeof value !== "function") {
						return value
					}
					return (...args: unknown[]) =>
						refusing.has(call) ? refusalOf(call) : value.apply(target, args)
				},
			}),
	}
}

const NOT_A_WRITE = "not a write"

type WriteCase<Rig> = {
	refuses: string
	before?: (rig: Rig) => Promise<unknown>
	run: (rig: Rig) => unknown
	showsIt?: (rig: Rig) => boolean
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

const hasRaisedTheCall = (call: string) =>
	vi
		.mocked(raiseFailureNotice)
		.mock.calls.some(
			([{ report }]) =>
				report?.context?.command === call &&
				report.context.errorKind === REFUSAL_KIND,
		)

const settleRaisedBefore = async () => {
	await new Promise((resolve) => setTimeout(resolve, 0))
	vi.mocked(raiseFailureNotice).mockClear()
}

type Rigged = { controller: object }

const expectEveryMemberClassed = <Rig extends Rigged>(
	rigUp: (refusals: Refusals) => Promise<Rig>,
	cases: object,
) =>
	it("classes every member of the controller as a write or not", async () => {
		const { controller } = await rigUp(createRefusals())

		expect(Object.keys(cases).toSorted()).toEqual(
			Object.keys(controller).toSorted(),
		)
	})

const expectEveryRefusalHandedOn = <Controller, Rig extends Rigged>(
	rigUp: (refusals: Refusals) => Promise<Rig>,
	cases: WriteCases<Controller, Rig>,
) => {
	expectEveryMemberClassed(rigUp, cases)
	it.each(writesOf(cases))(
		"hands the refusal of %s to the failure path, its caller or the screen",
		async (_write, { refuses, before, run, showsIt }) => {
			const refusals = createRefusals()
			const rig = await rigUp(refusals)
			if (before) {
				await before(rig)
				await settleRaisedBefore()
			}
			refusals.refuse(refuses)

			const rejection = await rejectionOf(() => run(rig))

			await vi.waitFor(() => expect(refusals.hasRefused(refuses)).toBe(true))
			await vi.waitFor(() =>
				expect(
					isRefusal(rejection) ||
						hasRaisedTheCall(refuses) ||
						(showsIt?.(rig) ?? false),
				).toBe(true),
			)
		},
	)
}

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

const sectionsRig = async ({ refusable }: Refusals): Promise<SectionsRig> => {
	const store = refusable(createFakeTranscriptStore())
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
}

type SpacesRig = { controller: SpacesController; spaceIds: string[] }

const ARCHIVE_PATH = "/archives/personal.kiroshi"

const spacesRig = async ({ refusable }: Refusals): Promise<SpacesRig> => {
	const store = refusable(createFakeTranscriptStore())
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

const rosterRig = async ({ refusable }: Refusals): Promise<RosterRig> => {
	const store = refusable(createFakeTranscriptStore())
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

type CollapsedSectionsRig = {
	controller: CollapsedSectionsController
	sectionId: string
}

const collapsedSectionsRig = async ({
	refusable,
}: Refusals): Promise<CollapsedSectionsRig> => {
	const store = refusable(createFakeTranscriptStore())
	const { id: sectionId } = await store.createSection("personal", "Writers")
	const controller = createCollapsedSectionsController(store, {
		hostSpaceIdOf: (spaceRowId) => spaceRowId,
		isOnScreen: () => true,
	})
	await controller.enter("personal")
	return { controller, sectionId }
}

const COLLAPSED_SECTION_WRITES: WriteCases<
	CollapsedSectionsController,
	CollapsedSectionsRig
> = {
	getState: NOT_A_WRITE,
	subscribe: NOT_A_WRITE,
	enter: NOT_A_WRITE,
	keep: NOT_A_WRITE,
	collapse: {
		refuses: "setSpacePreferences",
		run: ({ controller, sectionId }) =>
			controller.collapse("personal", sectionId, true),
	},
}

const NOTES_SKILL: Skill = {
	id: "notes",
	name: "Notes",
	description: "Keeps notes",
	body: "",
	isPreloaded: false,
	isSystem: false,
	files: [],
}

type SkillFilesRig = { controller: SkillFilesController }

const skillFilesRig = async ({
	refusable,
}: Refusals): Promise<SkillFilesRig> => {
	let opened: OpenedSkillFile | null = null
	const port = refusable<SkillFilesPort>({
		read: async () => "",
		write: async () => NOTES_SKILL,
		remove: async () => undefined,
	})
	const controller = createSkillFilesController(port, {
		run: (task) => void task(),
		write: (task) => void task(),
		getFile: () => opened,
		setFile: (file) => {
			opened = file
		},
	})
	return { controller }
}

const SKILL_FILE_WRITES: WriteCases<SkillFilesController, SkillFilesRig> = {
	carryFile: NOT_A_WRITE,
	openFile: NOT_A_WRITE,
	closeFile: NOT_A_WRITE,
	addFile: {
		refuses: "write",
		run: ({ controller }) => controller.addFile(NOTES_SKILL.id, "todo.md"),
	},
	saveFile: {
		refuses: "write",
		run: ({ controller }) =>
			controller.saveFile(NOTES_SKILL.id, "todo.md", "Buy ink"),
	},
	removeFile: {
		refuses: "remove",
		run: ({ controller }) => controller.removeFile(NOTES_SKILL.id, "todo.md"),
	},
}

const HELD_PREFERENCES: UserPreferences = {
	displayName: "Nyx",
	profilePicturePath: null,
	colorScheme: "system",
	language: null,
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
	sidebarWidth: null,
	sidebarCollapsed: false,
	sidebarTab: "conversations",
	openOn: "newConversation",
	activityPanelOpen: false,
	firstRunDone: false,
	lastSpaceId: null,
	lastBotIdBySpace: {},
	updateChannel: "stable",
	showWhatsNew: true,
	lastSeenVersion: null,
}

const fakePreferencesStore = (): PreferencesStore => {
	let held = HELD_PREFERENCES
	const answer = async (change: Partial<UserPreferences>) => {
		held = { ...held, ...change }
		return held
	}
	return {
		read: async () => held,
		write: (preferences) => answer(preferences),
		setProfilePicture: () => answer({}),
		setOnboardingStep: (onboardingStep) => answer({ onboardingStep }),
		replayOnboarding: () => answer({ onboardingStep: "welcome" }),
		setOnboardingFirstCompanion: (onboardingFirstCompanionId) =>
			answer({ onboardingFirstCompanionId }),
		setSidebarCollapsed: (sidebarCollapsed) => answer({ sidebarCollapsed }),
		markOnboardingImportSeen: () => answer({ onboardingImportSeen: true }),
	}
}

type UserRig = { controller: UserController }

const userRig = async ({ refusable }: Refusals): Promise<UserRig> => {
	preferencesHost.store = refusable(fakePreferencesStore())
	const controller = createUserController()
	await controller.load()
	return { controller }
}

const USER_WRITES: WriteCases<UserController, UserRig> = {
	getState: NOT_A_WRITE,
	subscribe: NOT_A_WRITE,
	followOtherWindows: NOT_A_WRITE,
	load: NOT_A_WRITE,
	setNotification: {
		refuses: "write",
		run: ({ controller }) =>
			controller.setNotification({
				field: "notifyOnQuestion",
				isEnabled: false,
			}),
	},
	setColorScheme: {
		refuses: "write",
		run: ({ controller }) => controller.setColorScheme("dark"),
	},
	setLanguage: {
		refuses: "write",
		run: ({ controller }) => controller.setLanguage("fr"),
	},
	setSidebarWidth: {
		refuses: "write",
		run: ({ controller }) => controller.setSidebarWidth(320),
	},
	setSidebarCollapsed: {
		refuses: "setSidebarCollapsed",
		run: ({ controller }) => controller.setSidebarCollapsed(true),
	},
	setOpenOn: {
		refuses: "write",
		run: ({ controller }) => controller.setOpenOn("lastConversation"),
	},
	setActivityPanelOpen: {
		refuses: "write",
		run: ({ controller }) => controller.setActivityPanelOpen(true),
	},
	markFirstRunDone: {
		refuses: "write",
		run: ({ controller }) => controller.markFirstRunDone(),
	},
	setOnboardingStep: {
		refuses: "setOnboardingStep",
		run: ({ controller }) => controller.setOnboardingStep("connect"),
	},
	replayOnboarding: {
		refuses: "replayOnboarding",
		run: ({ controller }) => controller.replayOnboarding(),
	},
	setOnboardingFirstCompanion: {
		refuses: "setOnboardingFirstCompanion",
		run: ({ controller }) => controller.setOnboardingFirstCompanion("default"),
	},
	markOnboardingImportSeen: {
		refuses: "markOnboardingImportSeen",
		run: ({ controller }) => controller.markOnboardingImportSeen(),
	},
	setLastBot: {
		refuses: "write",
		run: ({ controller }) =>
			controller.setLastBot({ spaceId: "personal", botId: "default" }),
	},
	setLastSpace: {
		refuses: "write",
		run: ({ controller }) => controller.setLastSpace("personal"),
	},
	setUpdateChannel: {
		refuses: "write",
		run: ({ controller }) => controller.setUpdateChannel("beta"),
	},
	setShowWhatsNew: {
		refuses: "write",
		run: ({ controller }) => controller.setShowWhatsNew(false),
	},
	markVersionSeen: {
		refuses: "write",
		run: ({ controller }) => controller.markVersionSeen("9.9.9"),
	},
}

const NOTHING_IMPORTED = {
	companions: [],
	hasInstructions: false,
	skillCount: 0,
}

type ClaudeImportRig = { controller: ClaudeImportController }

const claudeImportRig = async ({
	refusable,
}: Refusals): Promise<ClaudeImportRig> => {
	const port = refusable<ClaudeImportPort>({
		run: async (selection) =>
			selection.map((key) => ({
				key,
				result: { kind: "failed", cause: "busy" },
			})),
		onProgress: async () => () => undefined,
	})
	const world = refusable<ClaudeImportWorld>({
		spaceId: () => "personal",
		markSeen: async () => undefined,
		leave: () => undefined,
	})
	return { controller: createClaudeImportController(port, world) }
}

const CLAUDE_IMPORT_WRITES: WriteCases<
	ClaudeImportController,
	ClaudeImportRig
> = {
	getState: NOT_A_WRITE,
	subscribe: NOT_A_WRITE,
	toggle: NOT_A_WRITE,
	importPicked: {
		refuses: "run",
		run: ({ controller }) => controller.importPicked(["agent:ada"]),
	},
	retryFailed: {
		refuses: "run",
		before: ({ controller }) => controller.importPicked(["agent:ada"]),
		run: ({ controller }) => controller.retryFailed(),
	},
	leave: {
		refuses: "markSeen",
		run: ({ controller }) => controller.leave(NOTHING_IMPORTED),
	},
}

const SIGNED_OUT = {
	connection: "ready",
	binaryVersion: "2.0.0",
	authenticated: false,
	error: null,
	account: null,
} as const

const fakeOnboardingPort = (): OnboardingPort => ({
	account: async () => SIGNED_OUT,
	signIn: async () => undefined,
	enterCode: async () => undefined,
	cancelSignIn: async () => undefined,
	holdApiKey: async () => undefined,
	openSignInUrl: async () => undefined,
	onSignInStarted: async () => () => undefined,
	hasClaudeHome: async () => false,
	openDownloadPage: async () => undefined,
})

const FAILED_STEPS: ConnectionStep["state"][] = ["signInFailed", "apiKeyFailed"]

const showsFailedStep = (connection: ConnectionStep | null) =>
	connection !== null && FAILED_STEPS.includes(connection.state)

type OnboardingWorld = OnboardingFlowWorld & {
	holdStep: (step: ReturnType<OnboardingFlowWorld["storedStep"]>) => void
}

const fakeOnboardingWorld = (): OnboardingWorld => {
	let step: ReturnType<OnboardingFlowWorld["storedStep"]> = "welcome"
	return {
		holdStep: (next) => {
			step = next
		},
		storedStep: () => step,
		isFirstRunDone: () => false,
		storeStep: async (next) => {
			step = next
		},
		replay: async () => undefined,
		markFirstRunDone: async () => undefined,
		isShotoRunOwed: () => false,
		oweShotoRun: () => undefined,
		clearShotoRunOwed: () => undefined,
		holdShotoRun: (run) => run(),
		shotoId: () => "shoto",
		firstCompanionId: () => null,
		storeFirstCompanion: async () => undefined,
		botNameOf: () => "Shoto",
		openConversation: async () => undefined,
		sendTo: async () => undefined,
		hasSummoned: () => false,
		outcomeOf: async () => ({ kind: "pending" }),
	}
}

type OnboardingRig = {
	controller: OnboardingFlowController
	world: OnboardingWorld
}

const onboardingRig = async ({
	refusable,
}: Refusals): Promise<OnboardingRig> => {
	const world = refusable(fakeOnboardingWorld())
	const controller = createOnboardingFlowController(
		refusable(fakeOnboardingPort()),
		world,
	)
	return { controller, world }
}

const withShoto = async ({ controller, world }: OnboardingRig) => {
	world.holdStep("done")
	await controller.resume()
}

const onboardingShowsFailedStep = ({ controller }: OnboardingRig) =>
	showsFailedStep(controller.getState().connection)

const ONBOARDING_WRITES: WriteCases<OnboardingFlowController, OnboardingRig> = {
	getState: NOT_A_WRITE,
	subscribe: NOT_A_WRITE,
	changeAccount: NOT_A_WRITE,
	askApiKey: NOT_A_WRITE,
	acceptAccount: {
		refuses: "storeStep",
		run: ({ controller }) => controller.acceptAccount(),
	},
	signIn: {
		refuses: "signIn",
		run: ({ controller }) => controller.signIn(),
		showsIt: onboardingShowsFailedStep,
	},
	submitCode: {
		refuses: "enterCode",
		run: ({ controller }) => controller.submitCode("123456"),
		showsIt: onboardingShowsFailedStep,
	},
	submitApiKey: {
		refuses: "holdApiKey",
		run: ({ controller }) => controller.submitApiKey("sk-ant"),
		showsIt: onboardingShowsFailedStep,
	},
	pasteKeyInstead: {
		refuses: "cancelSignIn",
		run: ({ controller }) => controller.pasteKeyInstead(),
		showsIt: onboardingShowsFailedStep,
	},
	resume: {
		refuses: "openConversation",
		run: withShoto,
	},
	leaveIntro: {
		refuses: "storeStep",
		run: ({ controller }) => controller.leaveIntro(),
	},
	leaveImport: {
		refuses: "storeStep",
		run: ({ controller }) => controller.leaveImport(NOTHING_IMPORTED),
	},
	finish: {
		refuses: "markFirstRunDone",
		run: ({ controller }) => controller.finish(),
	},
	replay: {
		refuses: "replay",
		run: ({ controller }) => controller.replay(),
	},
	downloadAgain: {
		refuses: "openDownloadPage",
		run: ({ controller }) => controller.downloadAgain(),
	},
	noteCreated: {
		refuses: "storeFirstCompanion",
		before: withShoto,
		run: ({ controller }) =>
			controller.noteCreated({ id: "default", name: "Ada" }),
	},
	noteFirstRunDone: {
		refuses: "storeStep",
		before: withShoto,
		run: ({ controller }) => controller.noteFirstRunDone(),
	},
}

type SignInRig = { controller: SignInController }

const signInRig = async ({ refusable }: Refusals): Promise<SignInRig> => {
	const world = refusable<SignInWorld>({ reopen: async () => undefined })
	const controller = createSignInController(
		refusable(fakeOnboardingPort()),
		world,
	)
	controller.offer("default")
	return { controller }
}

const signInShowsFailedStep = ({ controller }: SignInRig) =>
	showsFailedStep(controller.getState().connection)

const SIGN_IN_WRITES: WriteCases<SignInController, SignInRig> = {
	getState: NOT_A_WRITE,
	subscribe: NOT_A_WRITE,
	offer: NOT_A_WRITE,
	changeAccount: NOT_A_WRITE,
	askApiKey: NOT_A_WRITE,
	acceptAccount: {
		refuses: "reopen",
		run: ({ controller }) => controller.acceptAccount(),
	},
	signIn: {
		refuses: "signIn",
		run: ({ controller }) => controller.signIn(),
		showsIt: signInShowsFailedStep,
	},
	submitCode: {
		refuses: "enterCode",
		run: ({ controller }) => controller.submitCode("123456"),
		showsIt: signInShowsFailedStep,
	},
	submitApiKey: {
		refuses: "holdApiKey",
		run: ({ controller }) => controller.submitApiKey("sk-ant"),
		showsIt: signInShowsFailedStep,
	},
	pasteKeyInstead: {
		refuses: "cancelSignIn",
		run: ({ controller }) => controller.pasteKeyInstead(),
		showsIt: signInShowsFailedStep,
	},
}

const OFFERED_VERSION = "9.9.9"

type UpdaterRig = { controller: UpdaterController }

const updaterRig = async ({ refusable }: Refusals): Promise<UpdaterRig> => {
	const port = refusable<UpdaterPort>({
		check: async () => ({ kind: "available", version: OFFERED_VERSION }),
		install: async () => ({ kind: "readyToRestart", version: OFFERED_VERSION }),
		countRunningCompanions: async () => 0,
		restart: async () => undefined,
		watch: async () => () => undefined,
	})
	const controller = createUpdaterController(
		port,
		raiseUpdaterFailure("use-updater"),
	)
	await controller.check()
	return { controller }
}

const UPDATER_WRITES: WriteCases<UpdaterController, UpdaterRig> = {
	getState: NOT_A_WRITE,
	subscribe: NOT_A_WRITE,
	start: NOT_A_WRITE,
	check: NOT_A_WRITE,
	install: {
		refuses: "install",
		run: ({ controller }) => controller.install(),
	},
	restart: {
		refuses: "restart",
		before: async ({ controller }) => {
			await controller.install()
			await vi.waitFor(() =>
				expect(controller.getState().host.kind).toBe("readyToRestart"),
			)
		},
		run: ({ controller }) => controller.restart(),
	},
}

const STAGING = { kind: "bot", id: "default" } as const

const CONVERSATION_OWNER = { kind: "conversation", id: "launch" } as const

type AttachmentsRig = { controller: AttachmentsController }

const attachmentsRig = async ({
	refusable,
}: Refusals): Promise<AttachmentsRig> => {
	const port = refusable<AttachmentsPort>({
		store: async (_owner, attachments) =>
			attachments.map(({ name }) => `/attachments/${name}`),
		send: async () => true,
	})
	const controller = createAttachmentsController(port)
	controller.stage(STAGING, [new File(["png"], "face.png")])
	return { controller }
}

const showsAttachmentRefusal = ({ controller }: AttachmentsRig) =>
	Object.values(controller.getState().refusals).some(
		(refusal) => refusal !== null,
	)

const ATTACHMENT_WRITES: WriteCases<AttachmentsController, AttachmentsRig> = {
	getState: NOT_A_WRITE,
	subscribe: NOT_A_WRITE,
	stage: NOT_A_WRITE,
	stageDocument: NOT_A_WRITE,
	remove: NOT_A_WRITE,
	dismissRefusal: NOT_A_WRITE,
	forget: NOT_A_WRITE,
	release: NOT_A_WRITE,
	submit: {
		refuses: "store",
		run: ({ controller }) => controller.submit(STAGING, "Look"),
		showsIt: showsAttachmentRefusal,
	},
	submitTo: {
		refuses: "store",
		run: ({ controller }) =>
			controller.submitTo(STAGING, CONVERSATION_OWNER, "Look"),
		showsIt: showsAttachmentRefusal,
	},
}

const GARAGE = {
	id: "joined-garage",
	hostUrl: "http://192.168.1.20:45367",
	remoteSpaceId: "garage",
	name: "Garage",
	state: "online",
	hostedBy: null,
	colour: 132,
	instanceId: "instance-of-joined-garage",
} as const

const ATTIC = {
	...GARAGE,
	id: "joined-attic",
	remoteSpaceId: "attic",
	name: "Attic",
	instanceId: "instance-of-joined-attic",
} as const

type JoinedSpacesRig = { controller: JoinedSpacesController }

const joinedSpacesRig = async ({
	refusable,
}: Refusals): Promise<JoinedSpacesRig> => {
	const store = createFakeTranscriptStore()
	const home = await store.createSpace("Home")
	const { queryClient } = createQueryTestWrapper()
	const hosts = refusable({
		getState: () => ({ active: null, connections: {} }),
		connect: async () => undefined,
		activate: async () => undefined,
		forget: () => undefined,
	})
	const spaces = createSpacesController(store, { queryClient, hosts })
	await spaces.load(home.id)
	const transport = refusable<JoinedSpacesTransport>({
		list: async () => [GARAGE],
		remove: async () => undefined,
		describe: async (_id, name, colour) => ({ ...GARAGE, name, colour }),
		onChanged: async () => () => undefined,
		onDescribed: async () => () => undefined,
		onRemoved: async () => () => undefined,
	})
	const controller = createJoinedSpacesController({
		queryClient,
		spaces,
		hosts,
		transport,
	})
	controller.watch()
	await vi.waitFor(() =>
		expect(controller.getState().joinedSpaces).toHaveLength(1),
	)
	return { controller }
}

const JOINED_SPACE_WRITES: WriteCases<JoinedSpacesController, JoinedSpacesRig> =
	{
		getState: NOT_A_WRITE,
		subscribe: NOT_A_WRITE,
		listQuery: NOT_A_WRITE,
		watch: NOT_A_WRITE,
		selectSpace: NOT_A_WRITE,
		restore: NOT_A_WRITE,
		hostNameOf: NOT_A_WRITE,
		shownHostNameOf: NOT_A_WRITE,
		leave: {
			refuses: "remove",
			run: ({ controller }) => controller.leave(GARAGE.id),
		},
		admit: {
			refuses: "connect",
			run: ({ controller }) => controller.admit(ATTIC),
		},
		describe: {
			refuses: "describe",
			run: ({ controller }) =>
				controller.describe(GARAGE.id, { name: "Workshop", colour: 40 }),
		},
	}

const QUESTION_DIRECTIVE = "/question"

const PERMISSION_DIRECTIVE = "/permission"

type ChatRig = { controller: ChatController }

const chatRig = async ({ refusable }: Refusals): Promise<ChatRig> => {
	const { controller } = createHarness({
		store: refusable(createFakeTranscriptStore()),
		driver: (fake) => refusable(fake),
	})
	return { controller }
}

const openedChat = async ({ controller }: ChatRig) => {
	await controller.open(BOT, null)
	await vi.waitFor(() => expect(controller.getState().sessionOpen).toBe(true))
}

const askedQuestion = async (rig: ChatRig) => {
	await openedChat(rig)
	await rig.controller.send(QUESTION_DIRECTIVE)
	await vi.waitFor(() =>
		expect(rig.controller.getState().question).not.toBeNull(),
	)
}

const askedPermission = async (rig: ChatRig) => {
	await openedChat(rig)
	await rig.controller.send(PERMISSION_DIRECTIVE)
	await vi.waitFor(() =>
		expect(rig.controller.getState().permission).not.toBeNull(),
	)
}

const runningTurn = async (rig: ChatRig) => {
	await openedChat(rig)
	await rig.controller.send("Write a long story")
	await vi.waitFor(() =>
		expect(rig.controller.getState().turn).not.toBe("idle"),
	)
}

const chatShowsAnError = ({ controller }: ChatRig) =>
	controller.stateFor(BOT).errors.length > 0

const questionId = ({ controller }: ChatRig) =>
	controller.getState().question?.id ?? ""

const permissionId = ({ controller }: ChatRig) =>
	controller.getState().permission?.id ?? ""

const CHAT_WRITES: WriteCases<ChatController, ChatRig> = {
	getState: NOT_A_WRITE,
	stateFor: NOT_A_WRITE,
	subscribe: NOT_A_WRITE,
	attach: NOT_A_WRITE,
	check: NOT_A_WRITE,
	enter: NOT_A_WRITE,
	leave: NOT_A_WRITE,
	redescribe: NOT_A_WRITE,
	loadOlder: NOT_A_WRITE,
	loadNewer: NOT_A_WRITE,
	loadLatest: NOT_A_WRITE,
	landOn: NOT_A_WRITE,
	follow: NOT_A_WRITE,
	reference: NOT_A_WRITE,
	pins: NOT_A_WRITE,
	discard: NOT_A_WRITE,
	dismissError: NOT_A_WRITE,
	postQuestion: NOT_A_WRITE,
	withdrawQuestion: NOT_A_WRITE,
	open: {
		refuses: "startOrResumeSession",
		run: ({ controller }) => controller.open(BOT, null),
		showsIt: chatShowsAnError,
	},
	openAside: {
		refuses: "startOrResumeSession",
		run: ({ controller }) => controller.openAside(BOT, null),
		showsIt: chatShowsAnError,
	},
	start: {
		refuses: "startOrResumeSession",
		before: openedChat,
		run: ({ controller }) => controller.start(),
		showsIt: chatShowsAnError,
	},
	restart: {
		refuses: "startOrResumeSession",
		before: openedChat,
		run: ({ controller }) => controller.restart(),
		showsIt: chatShowsAnError,
	},
	reopen: {
		refuses: "startOrResumeSession",
		before: openedChat,
		run: ({ controller }) => controller.reopen(BOT),
		showsIt: chatShowsAnError,
	},
	close: {
		refuses: "shutdown",
		before: openedChat,
		run: ({ controller }) => controller.close(BOT),
	},
	send: {
		refuses: "sendUserMessage",
		before: openedChat,
		run: ({ controller }) => controller.send("Hello"),
		showsIt: chatShowsAnError,
	},
	sendTo: {
		refuses: "sendUserMessage",
		before: openedChat,
		run: ({ controller }) => controller.sendTo(BOT, "Hello"),
		showsIt: chatShowsAnError,
	},
	pin: {
		refuses: "pinMessage",
		before: openedChat,
		run: ({ controller }) => controller.pin("message-1", 0),
	},
	unpin: {
		refuses: "unpinMessage",
		before: openedChat,
		run: ({ controller }) => controller.unpin("message-1", 0),
	},
	reportRun: {
		refuses: "startTurn",
		before: openedChat,
		run: ({ controller }) =>
			controller.reportRun({
				conversationId: controller.getState().conversationId ?? "",
				botId: BOT,
				runtimeSessionId: "run-1",
				text: "Done",
				routineTitle: "Nightly",
				triggerSourceId: "routine",
			}),
	},
	storeAttachments: {
		refuses: "storeAttachments",
		before: openedChat,
		run: ({ controller }) => controller.storeAttachments(BOT, []),
	},
	stop: {
		refuses: "cancelTurn",
		before: runningTurn,
		run: ({ controller }) => controller.stop(),
		showsIt: chatShowsAnError,
	},
	sendNow: {
		refuses: "cancelTurn",
		before: async (rig) => {
			await runningTurn(rig)
			await rig.controller.send("And then?")
			await vi.waitFor(() =>
				expect(rig.controller.getState().outbox).toHaveLength(1),
			)
		},
		run: ({ controller }) =>
			controller.sendNow(controller.getState().outbox[0]?.id ?? ""),
		showsIt: chatShowsAnError,
	},
	respond: {
		refuses: "respondToPermission",
		before: askedPermission,
		run: (rig) => rig.controller.respond(permissionId(rig), "allowOnce"),
		showsIt: chatShowsAnError,
	},
	answer: {
		refuses: "answerQuestion",
		before: askedQuestion,
		run: (rig) =>
			rig.controller.answer(questionId(rig), {
				"Which framework should it use?": "React",
			}),
		showsIt: chatShowsAnError,
	},
	retry: {
		refuses: "submitPrompt",
		before: openedChat,
		run: async ({ controller }) => {
			await controller.send("Hello")
			await controller.retry(controller.getState().rejectedPromptId ?? "")
		},
		showsIt: ({ controller }) => controller.stateFor(BOT).errors.length > 1,
	},
	shutdown: {
		refuses: "shutdown",
		before: openedChat,
		run: ({ controller }) => controller.shutdown(),
		showsIt: chatShowsAnError,
	},
}

type ConversationRig = {
	controller: ConversationController
	driver: ScriptedDriver
	store: TranscriptStore
	conversation: Conversation
	adaId: string
}

const conversationRig = async ({
	refusable,
}: Refusals): Promise<ConversationRig> => {
	const store = refusable(createFakeTranscriptStore())
	const driver = refusable(createScriptedDriver())
	const [ada] = await seatBots(store, "personal", ["Ada"])
	const adaId = ada?.id ?? ""
	const conversation = await store.createConversation({
		spaceId: "personal",
		sectionId: null,
		title: "Walls",
		botIds: [adaId],
	})
	const controller = createConversationController(
		withFakeHostWrites(driver, store),
		store,
	)
	controller.attach()
	await controller.open(conversation)
	return { controller, driver, store, conversation, adaId }
}

const adaSpeaking = async ({ controller, driver }: ConversationRig) => {
	await controller.send("@Ada raise the walls")
	await vi.waitFor(() => expect(driver.submissions).not.toHaveLength(0))
}

const adaAsking =
	(event: Parameters<ScriptedDriver["pushTo"]>[1][number]) =>
	async (rig: ConversationRig) => {
		await adaSpeaking(rig)
		rig.driver.pushTo(rig.adaId, [event])
		await vi.waitFor(() =>
			expect(rig.controller.getState().pendingPrompt).not.toBeNull(),
		)
	}

const conversationShowsAnError = ({ controller }: ConversationRig) =>
	controller.getState().latestError !== null

const CONVERSATION_WRITES: WriteCases<ConversationController, ConversationRig> =
	{
		getState: NOT_A_WRITE,
		subscribe: NOT_A_WRITE,
		attach: NOT_A_WRITE,
		open: NOT_A_WRITE,
		loadOlder: NOT_A_WRITE,
		loadNewer: NOT_A_WRITE,
		loadLatest: NOT_A_WRITE,
		landOn: NOT_A_WRITE,
		follow: NOT_A_WRITE,
		leave: NOT_A_WRITE,
		pins: NOT_A_WRITE,
		dismissError: NOT_A_WRITE,
		send: {
			refuses: "sendUserMessage",
			run: ({ controller }) => controller.send("Hello"),
		},
		sendAgain: {
			refuses: "sendUserMessage",
			before: async ({ controller, store }) => {
				vi.spyOn(store, "sendUserMessage").mockRejectedValueOnce({
					kind: REFUSAL_KIND,
				})
				await controller.send("Hello")
			},
			run: ({ controller }) =>
				controller.sendAgain(controller.getState().refusedMessage?.id ?? ""),
		},
		retryTurn: {
			refuses: "startOrResumeSession",
			before: async (rig) => {
				vi.spyOn(rig.driver, "startOrResumeSession").mockRejectedValueOnce({
					kind: REFUSAL_KIND,
				})
				await rig.controller.send("@Ada raise the walls")
				await vi.waitFor(() =>
					expect(rig.controller.getState().failedBotIds).toContain(rig.adaId),
				)
				rig.controller.dismissError(
					rig.controller.getState().latestError?.id ?? "",
				)
			},
			run: (rig) => rig.controller.retryTurn(rig.adaId),
			showsIt: conversationShowsAnError,
		},
		reportRun: {
			refuses: "startTurn",
			run: ({ controller, conversation, adaId }) =>
				controller.reportRun({
					conversationId: conversation.id,
					botId: adaId,
					runtimeSessionId: "run-1",
					text: "Done",
					routineTitle: "Nightly",
					triggerSourceId: "routine",
				}),
		},
		relayRunReport: NOT_A_WRITE,
		relaySpoken: {
			refuses: "startTurn",
			run: ({ controller, conversation, adaId, store }) =>
				controller.relaySpoken(
					{ conversationId: conversation.id, authorBotId: adaId, text: "Hi" },
					{ conversation, writes: store },
				),
		},
		pin: {
			refuses: "pinMessage",
			run: ({ controller }) => controller.pin("message-1", 0),
		},
		unpin: {
			refuses: "unpinMessage",
			run: ({ controller }) => controller.unpin("message-1", 0),
		},
		answer: {
			refuses: "answerQuestion",
			before: adaAsking({
				type: "questionRequested",
				request: {
					id: "ask-1",
					questions: [
						{
							header: "Walls",
							question: "Which wall?",
							options: [],
							multiSelect: false,
						},
					],
				},
			}),
			run: ({ controller }) =>
				controller.answer("ask-1", { "Which wall?": "North" }),
			showsIt: conversationShowsAnError,
		},
		respond: {
			refuses: "respondToPermission",
			before: adaAsking({
				type: "permissionRequested",
				request: {
					id: "let-1",
					toolName: "Bash",
					title: "Run the mason",
					detail: "mason --build",
				},
			}),
			run: ({ controller }) => controller.respond("let-1", "allowOnce"),
			showsIt: conversationShowsAnError,
		},
		stop: {
			refuses: "cancelTurn",
			before: adaSpeaking,
			run: ({ controller }) => controller.stop(),
			showsIt: conversationShowsAnError,
		},
		shutdown: {
			refuses: "shutdown",
			before: adaSpeaking,
			run: ({ controller }) => controller.shutdown(),
		},
	}

describe("a refused write of the sections controller", () => {
	expectEveryRefusalHandedOn(sectionsRig, SECTION_WRITES)
})

describe("a refused write of the spaces controller", () => {
	expectEveryRefusalHandedOn(spacesRig, SPACE_WRITES)
})

describe("a refused write of the roster controller", () => {
	expectEveryRefusalHandedOn(rosterRig, ROSTER_WRITES)
})

describe("a refused write of the collapsed sections controller", () => {
	expectEveryRefusalHandedOn(collapsedSectionsRig, COLLAPSED_SECTION_WRITES)
})

describe("a refused write of the skill files controller", () => {
	expectEveryRefusalHandedOn(skillFilesRig, SKILL_FILE_WRITES)
})

describe("a refused write of the preferences controller", () => {
	expectEveryRefusalHandedOn(userRig, USER_WRITES)
})

describe("a refused write of the Claude import controller", () => {
	expectEveryRefusalHandedOn(claudeImportRig, CLAUDE_IMPORT_WRITES)
})

describe("a refused write of the onboarding flow controller", () => {
	expectEveryRefusalHandedOn(onboardingRig, ONBOARDING_WRITES)
})

describe("a refused write of the sign-in controller", () => {
	expectEveryRefusalHandedOn(signInRig, SIGN_IN_WRITES)
})

describe("a refused write of the updater controller", () => {
	expectEveryRefusalHandedOn(updaterRig, UPDATER_WRITES)
})

describe("a refused write of the attachments controller", () => {
	expectEveryRefusalHandedOn(attachmentsRig, ATTACHMENT_WRITES)
})

describe("a refused write of the joined spaces controller", () => {
	expectEveryRefusalHandedOn(joinedSpacesRig, JOINED_SPACE_WRITES)
})

describe("a refused write of the chat controller", () => {
	expectEveryRefusalHandedOn(chatRig, CHAT_WRITES)
})

describe("a refused write of the conversation controller", () => {
	expectEveryRefusalHandedOn(conversationRig, CONVERSATION_WRITES)
})
