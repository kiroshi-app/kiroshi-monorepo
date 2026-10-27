// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { createElement, Fragment, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SpaceHost } from "@workspace/ui/components/host-pill"
import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import { MembersPanel } from "@workspace/ui/components/space-settings-dialog/members-panel"
import { COMPANIONS_ENTRY } from "@workspace/ui/components/space-settings-dialog/use-space-settings"
import { NO_CLICK_MODIFIERS } from "@workspace/ui/lib/click-modifiers"
import { i18n } from "@workspace/ui/lib/i18n"

import { SpaceSettingsScreen } from "@/components/space-settings-screen"
import {
	type AccountState,
	type CompanionCounts,
	commands,
	JOINED_SPACE_MEMBERS_CHANGED_EVENT,
	type JoinedSpace,
	type JoinedSpaceMember,
	type JoinedSpaceMembersChanged,
	type JoinedSpaceRemoved,
	type Member,
	type SpaceInvitation,
} from "@/lib/bindings"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import type { Bot } from "@/lib/conversations/store-contract"
import { botIdentity } from "@/lib/conversations/transcript-fixtures"
import { invoke, isDesktopHost, listen } from "@/lib/host/index"
import type { SettingsSearch } from "@/lib/navigation/settings-search"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import {
	createJoinedSpacesController,
	type JoinedSpacesController,
	type JoinedSpacesTransport,
	openLocalSpaceOf,
	openRowIdOf,
	switcherSpacesOf,
} from "@/lib/spaces/joined-spaces-controller"
import {
	type ShownSpacePage,
	type SpacePage,
	spacePageOf,
} from "@/lib/spaces/settings-spaces"
import {
	createSpacesController,
	type SpacesController,
} from "@/lib/spaces/spaces-controller"
import type { Invitations } from "@/lib/spaces/use-invitations"
import { useControllerState } from "@/lib/use-controller"
import type { SettingsFrame } from "@/lib/workspace/settings-frame"
import type { ApplicationScopes } from "@/lib/workspace/use-application-scopes"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"

vi.mock("@/lib/host/index", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/index")>()),
	isDesktopHost: vi.fn(() => false),
	invoke: vi.fn(async () => []),
	listen: vi.fn(async () => () => undefined),
}))

vi.mock(
	"@workspace/ui/components/space-settings-dialog/members-panel",
	async (importOriginal) => {
		const panel =
			await importOriginal<
				typeof import("@workspace/ui/components/space-settings-dialog/members-panel")
			>()
		return { ...panel, MembersPanel: vi.fn(panel.MembersPanel) }
	},
)

vi.mock("@/lib/bindings", async (importOriginal) => {
	const bindings = await importOriginal<typeof import("@/lib/bindings")>()
	return {
		...bindings,
		commands: {
			...bindings.commands,
			hostingState: vi.fn(),
			hostingStart: vi.fn(),
			hostingStop: vi.fn(),
			joinedSpaceMembers: vi.fn(),
		},
	}
})

const GARAGE: JoinedSpace = {
	id: "joined-garage",
	hostUrl: "http://192.168.1.20:45367",
	remoteSpaceId: "garage",
	name: "Garage",
	state: "online",
	hostedBy: null,
	colour: 132,
	instanceId: "instance-of-joined-garage",
}

const GARAGE_ROW = "joined:joined-garage"

type Gear = {
	spaces: SpacesController
	joined: JoinedSpacesController
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const SAM_SIGNED_IN: AccountState = {
	kind: "signedIn",
	id: "sam",
	email: "sam@example.com",
	createdAt: "2026-01-01T00:00:00Z",
	plan: null,
}

const garageTransport = (garage: JoinedSpace) =>
	({
		list: async () => [garage],
		remove: vi.fn(async (_id: string) => undefined),
		onChanged: async () => () => undefined,
		onRemoved: async (_listener: (removed: JoinedSpaceRemoved) => void) => () =>
			undefined,
	}) satisfies JoinedSpacesTransport

const hostsFake = () => ({
	getState: () => ({ active: null, connections: {} }),
	subscribe: () => () => undefined,
	connect: async () => undefined,
	activate: async () => undefined,
	forget: () => undefined,
})

const gearWithGarage = async (
	garage = GARAGE,
	transport = garageTransport(garage),
) => {
	const store = createFakeTranscriptStore()
	const home = await store.createSpace("Home")
	const { queryClient } = createQueryTestWrapper()
	const spaces = createSpacesController(store, { queryClient })
	await spaces.load(home.id)
	const joined = createJoinedSpacesController({
		queryClient,
		spaces,
		hosts: hostsFake(),
		transport,
	})
	joined.watch()
	await settle()
	return { home, spaces, joined, transport }
}

const NO_INVITATIONS: Invitations = {
	rows: [],
	termsOf: () => undefined,
	joinedIdOf: () => undefined,
	accept: vi.fn(),
	decline: vi.fn(),
	sweepWithdrawn: vi.fn(),
}

type SpaceSettingsHarnessProps = Gear & {
	spaceId: string
	invitations?: Invitations
	hostBySpaceId?: Record<string, SpaceHost>
	openedTab?: string
	openAccountSettings?: () => void
	bots?: Bot[]
	showEntry?: SettingsNavigation["showEntry"]
}

const SpaceSettingsHarness = ({
	spaces,
	joined,
	spaceId,
	invitations = NO_INVITATIONS,
	hostBySpaceId = {},
	openedTab,
	openAccountSettings,
	bots = [],
	showEntry,
}: SpaceSettingsHarnessProps) => {
	const [isOpen, setIsOpen] = useState(true)
	const [search, setSearch] = useState<SettingsSearch>({ entry: openedTab })
	const spacesState = useControllerState(spaces)
	const joinedState = useControllerState(joined)
	const { selectedSpaceId } = spacesState
	const core = {
		account: { state: SAM_SIGNED_IN },
		invitations,
		joinedSpaces: { state: joinedState, controller: joined },
		spaces: { state: spacesState, controller: spaces },
		spaceEnvironment: {
			entries: [],
			hasFailedToRead: false,
			remove: vi.fn(),
			set: vi.fn(),
		},
		spaceMcpServers: { hasFailedToLoad: false },
	} as unknown as WorkspaceCore
	const navigation = {
		back: () => setIsOpen(false),
		backToUserSettings: () => setIsOpen(false),
		openConversations: () => setIsOpen(false),
		openCompanionSettings: vi.fn(),
		showEntry: showEntry ?? ((entry: string) => setSearch({ entry })),
	} as unknown as SettingsNavigation
	const panels = {
		openAccountSettings,
		spaceHistory: { days: [], oldestDate: "2026-01-01", onUndo: vi.fn() },
		spaceSkills: { skills: [] },
	} as unknown as SettingsPanels
	const openRowId = openRowIdOf(joinedState, selectedSpaceId)
	const scopes = {
		openRowId,
		selectedSpace: openLocalSpaceOf(spacesState.spaces, openRowId),
		selectedSpaceId,
		setOpenedMcpServer: vi.fn(),
		spaceApplications: { mcpServers: [] },
	} as unknown as ApplicationScopes
	const page = spacePageOf(spaceId, {
		spaces: spacesState.spaces,
		joinedSpaces: joinedState.joinedSpaces,
		invitations,
	})
	return createElement(
		Fragment,
		null,
		isOpen && isShown(page)
			? createElement(SpaceSettingsScreen, {
					core,
					frame: {
						rail: { selected: "conversations" },
					} as unknown as SettingsFrame,
					hostBySpaceId,
					navigation,
					page,
					panels,
					rosterLines: {
						sidebarActions: {
							onCreateBot: vi.fn(),
							onSelectSpace: joined.selectSpace,
						},
					} as unknown as RosterLines,
					rosterView: { bots } as unknown as RosterView,
					scopes,
					search,
					spaceId,
					switcherSpaces: switcherSpacesOf(
						spacesState.spaces,
						joinedState.joinedSpaces,
					),
				})
			: null,
		createElement(NoticeSurface),
	)
}

const isShown = (page: SpacePage): page is ShownSpacePage =>
	page.state === "yours" ||
	page.state === "joined" ||
	page.state === "invitation"

type RejectionListener = (reason: unknown) => void

type RejectionEvents = {
	on: (event: "unhandledRejection", listener: RejectionListener) => void
	off: (event: "unhandledRejection", listener: RejectionListener) => void
}

const rejectionEvents = (globalThis as unknown as { process: RejectionEvents })
	.process

const SETTINGS_MENU = i18n.t("settings:screen.menu")

const LEFT_GARAGE = i18n.t("settings:screen.space.left.title", {
	name: "Garage",
})

const settingsMenuOf = () =>
	screen.queryByRole("navigation", { name: SETTINGS_MENU, hidden: true })

const openSettingsOf = (gear: Gear, rowId: string, openedTab?: string) => {
	gear.joined.selectSpace(rowId)
	return render(
		createElement(SpaceSettingsHarness, {
			...gear,
			spaceId: rowId,
			openedTab,
		}),
		{ wrapper: createQueryTestWrapper().wrapper },
	).container
}

const confirmLeave = async (dialog: HTMLElement) => {
	const leaveAction = i18n.t("common:spaces.leave.action")
	fireEvent.click(within(dialog).getByRole("button", { name: leaveAction }))
	const confirm = await screen.findByRole("alertdialog")
	await act(async () => {
		fireEvent.click(within(confirm).getByRole("button", { name: leaveAction }))
	})
}

const confirmDelete = async (dialog: HTMLElement) => {
	const deleteAction = i18n.t("settings:space.danger.delete")
	fireEvent.click(
		within(dialog).getByRole("button", {
			name: i18n.t("settings:rail.danger"),
		}),
	)
	fireEvent.click(
		await within(dialog).findByRole("button", { name: deleteAction }),
	)
	const confirm = await screen.findByRole("alertdialog")
	await act(async () => {
		fireEvent.click(within(confirm).getByRole("button", { name: deleteAction }))
	})
}

afterEach(() => {
	cleanup()
	vi.mocked(isDesktopHost).mockReturnValue(false)
	vi.clearAllMocks()
})

describe("SpaceSettingsScreen on a joined space", () => {
	it("opens the joined mode with the space name, its host in the standing and Leave space pinned, without the local-only parts", async () => {
		const gear = await gearWithGarage()

		const dialog = openSettingsOf(gear, GARAGE_ROW)

		expect(
			within(dialog).getByText("Garage", {
				selector: "[data-slot=settings-menu-name]",
			}),
		).toBeTruthy()
		expect(
			within(dialog).getByText(
				i18n.t("settings:space.standing.joined", { host: GARAGE.hostUrl }),
			),
		).toBeTruthy()
		expect(
			within(dialog).getByRole("button", {
				name: i18n.t("common:spaces.leave.action"),
			}),
		).toBeTruthy()
		expect(
			within(dialog).queryByRole("button", {
				name: i18n.t("settings:rail.danger"),
			}),
		).toBeNull()
		expect(
			within(dialog).getByText(i18n.t("settings:space.colour.label")),
		).toBeTruthy()
		for (const localOnly of [
			i18n.t("settings:space.notShared.title"),
			"Share link",
			i18n.t("settings:space.transfer.export"),
			i18n.t("settings:space.transfer.import"),
		]) {
			expect(within(dialog).queryByText(localOnly)).toBeNull()
		}
	})

	it("leaves the name of a joined space editable and writes no rename", async () => {
		const gear = await gearWithGarage()
		const dialog = openSettingsOf(gear, GARAGE_ROW)

		expect(
			within(dialog).getByText("Garage", {
				selector: "[data-slot=settings-menu-name]",
			}),
		).toBeTruthy()
		expect(
			within(dialog).getByLabelText(i18n.t("settings:space.name.label")),
		).toHaveProperty("readOnly", false)
		expect(gear.joined.getState().joinedSpaces).toEqual([GARAGE])
	})

	it("leaves through the roster path, closes the page on the notice naming the space and selects the first local space", async () => {
		const gear = await gearWithGarage()
		const dialog = openSettingsOf(gear, GARAGE_ROW)

		await confirmLeave(dialog)

		expect(gear.transport.remove).toHaveBeenCalledWith(GARAGE.id)
		await waitFor(() => expect(settingsMenuOf()).toBeNull())
		expect(await screen.findByText(LEFT_GARAGE)).toBeTruthy()
		expect(gear.joined.getState().joinedSpaces).toEqual([])
		const [firstLocal] = gear.spaces.getState().spaces
		expect(gear.spaces.getState().selectedSpaceId).toBe(firstLocal?.id)
	})

	it("keeps the space and raises the refusal when the leave fails, leaving no rejection unhandled", async () => {
		const unhandled: unknown[] = []
		const noteUnhandled = (reason: unknown) => unhandled.push(reason)
		rejectionEvents.on("unhandledRejection", noteUnhandled)
		const gear = await gearWithGarage()
		gear.transport.remove.mockRejectedValueOnce(new Error("disk full"))
		const dialog = openSettingsOf(gear, GARAGE_ROW)

		await confirmLeave(dialog)
		await act(settle)
		rejectionEvents.off("unhandledRejection", noteUnhandled)

		expect(unhandled).toEqual([])
		expect(
			await screen.findAllByText(
				i18n.t("chat:screen.notice.joinRefused.unexpected.title"),
			),
		).not.toHaveLength(0)
		expect(screen.queryByText("disk full")).toBeNull()
		expect(gear.joined.getState().joinedSpaces).toEqual([GARAGE])
		expect(gear.spaces.getState().selectedSpaceId).toBe("garage")
		expect(settingsMenuOf()).toBeTruthy()
	})
})

describe("SpaceSettingsScreen on a local space", () => {
	it("opens the local mode with its editable Name field, its transfer actions and Danger zone pinned", async () => {
		const gear = await gearWithGarage()

		const dialog = openSettingsOf(gear, gear.home.id)

		expect(within(dialog).getByDisplayValue("Home")).toHaveProperty(
			"readOnly",
			false,
		)
		expect(
			within(dialog).getByRole("button", {
				name: i18n.t("settings:rail.danger"),
			}),
		).toBeTruthy()
		expect(
			within(dialog).getByRole("button", {
				name: i18n.t("settings:space.transfer.export"),
			}),
		).toBeTruthy()
	})

	it("hands the keys of an entry click to the settings navigation", async () => {
		const gear = await gearWithGarage()
		const showEntry = vi.fn()
		const dialog = render(
			createElement(SpaceSettingsHarness, {
				...gear,
				spaceId: gear.home.id,
				showEntry,
			}),
			{ wrapper: createQueryTestWrapper().wrapper },
		).container
		const skills = within(dialog).getByRole("button", {
			name: i18n.t("settings:rail.skills"),
		})

		fireEvent.click(skills, { detail: 1, metaKey: true })
		fireEvent.click(skills, { detail: 1 })

		expect(showEntry.mock.calls).toEqual([
			["skills", { ...NO_CLICK_MODIFIERS, meta: true }],
			["skills", NO_CLICK_MODIFIERS],
		])
	})

	it("closes the page once the space is deleted", async () => {
		const gear = await gearWithGarage()
		await gear.spaces.create()
		const dialog = openSettingsOf(gear, gear.home.id)

		await confirmDelete(dialog)

		await waitFor(() => expect(settingsMenuOf()).toBeNull())
	})
})

const OPEN_LABEL = new RegExp(`^${i18n.t("settings:space.open")}`)

const openOtherSpaceOf = async () => {
	const gear = await gearWithGarage()
	await gear.spaces.create()
	const office = otherSpaceOf(gear, gear.home.id)
	gear.joined.selectSpace(gear.home.id)
	const dialog = render(
		createElement(SpaceSettingsHarness, {
			...gear,
			spaceId: office.id,
		}),
		{ wrapper: createQueryTestWrapper().wrapper },
	).container
	const rank =
		gear.spaces.getState().spaces.findIndex(({ id }) => id === office.id) + 1
	return { gear, office, rank, dialog }
}

const removableTransport = () => {
	let announceRemoval: (removed: JoinedSpaceRemoved) => void = () => undefined
	const transport = {
		...garageTransport(GARAGE),
		onRemoved: async (listener: (removed: JoinedSpaceRemoved) => void) => {
			announceRemoval = listener
			return () => undefined
		},
	}
	return {
		transport,
		announce: (removed: JoinedSpaceRemoved) => announceRemoval(removed),
	}
}

const ATELIER_INVITATION = {
	id: "instance-atelier",
	name: "Atelier",
	hostEmail: "steve@example.com",
	state: "waiting",
} as const

const ATELIER_EXPIRY = new Date(2026, 10, 2).getTime()

const atelierInvitations = (): Invitations => ({
	...NO_INVITATIONS,
	rows: [ATELIER_INVITATION],
	termsOf: () => ({
		hostEmail: "steve@example.com",
		expiresAt: ATELIER_EXPIRY,
	}),
	accept: vi.fn(),
	decline: vi.fn(),
})

describe("SpaceSettingsScreen on a space other than the current one", () => {
	it("shows that space, not the current one, with Open on its rank", async () => {
		const { office, rank, dialog } = await openOtherSpaceOf()

		expect(within(dialog).getByDisplayValue(office.name)).toBeTruthy()
		expect(within(dialog).queryByDisplayValue("Home")).toBeNull()
		expect(
			within(dialog)
				.getByRole("button", { name: OPEN_LABEL })
				.getAttribute("aria-keyshortcuts"),
		).toBe(`Meta+${rank}`)
	})

	it("reads it as shared from its host mark", async () => {
		const gear = await gearWithGarage()
		const dialog = render(
			createElement(SpaceSettingsHarness, {
				...gear,
				spaceId: gear.home.id,
				hostBySpaceId: { [gear.home.id]: "shared" },
			}),
			{ wrapper: createQueryTestWrapper().wrapper },
		).container

		expect(
			within(dialog).getByText(i18n.t("settings:space.standing.yoursShared")),
		).toBeTruthy()
	})

	it("switches to that space and closes the page on Open", async () => {
		const { gear, office, dialog } = await openOtherSpaceOf()

		fireEvent.click(within(dialog).getByRole("button", { name: OPEN_LABEL }))

		expect(gear.spaces.getState().selectedSpaceId).toBe(office.id)
		expect(settingsMenuOf()).toBeNull()
	})

	it("switches to the space of a rank and closes the page on its shortcut", async () => {
		const { gear, office, rank } = await openOtherSpaceOf()

		fireEvent.keyDown(window, { key: String(rank), metaKey: true })

		expect(gear.spaces.getState().selectedSpaceId).toBe(office.id)
		await waitFor(() => expect(settingsMenuOf()).toBeNull())
	})
})

const SESSION_BOUND_ENTRIES = [
	i18n.t("settings:rail.secrets"),
	i18n.t("settings:rail.skills"),
	i18n.t("settings:rail.applications"),
	i18n.t("settings:rail.history"),
]

const SESSION_FREE_ENTRIES = [
	i18n.t("settings:rail.space"),
	i18n.t("settings:rail.members"),
	i18n.t("settings:rail.companions"),
]

const EVERY_ENTRY = [...SESSION_BOUND_ENTRIES, ...SESSION_FREE_ENTRIES]

const isMenuEntryDisabled = async (label: string) => {
	const menu = settingsMenuOf()
	if (!menu) throw new Error("the settings menu is not shown")
	const entry = await within(menu).findByRole("button", {
		name: new RegExp(`^${label}`),
	})
	return entry.hasAttribute("disabled")
}

describe("SpaceSettingsScreen entries bound to the current space session", () => {
	beforeEach(() => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "off" })
		answerJoinedMembers([])
	})

	it("disables Secrets, Skills, Applications and History on a joined space that is not the current one", async () => {
		const gear = await gearWithGarage()
		gear.joined.selectSpace(gear.home.id)

		render(
			createElement(SpaceSettingsHarness, { ...gear, spaceId: GARAGE_ROW }),
			{ wrapper: createQueryTestWrapper().wrapper },
		)

		for (const label of SESSION_BOUND_ENTRIES) {
			expect(await isMenuEntryDisabled(label), label).toBe(true)
		}
		for (const label of [
			...SESSION_FREE_ENTRIES,
			i18n.t("common:spaces.leave.action"),
		]) {
			expect(await isMenuEntryDisabled(label), label).toBe(false)
		}
	})

	it("enables every entry on the current joined space", async () => {
		const gear = await gearWithGarage()

		openSettingsOf(gear, GARAGE_ROW)

		for (const label of EVERY_ENTRY) {
			expect(await isMenuEntryDisabled(label), label).toBe(false)
		}
	})

	it("enables every entry on the current owned space", async () => {
		const gear = await gearWithGarage()

		openSettingsOf(gear, gear.home.id)

		for (const label of EVERY_ENTRY) {
			expect(await isMenuEntryDisabled(label), label).toBe(false)
		}
	})
})

describe("SpaceSettingsScreen on a joined space removed while shown", () => {
	it("closes the page on the notice naming the space once its host removes it", async () => {
		const removable = removableTransport()
		const gear = await gearWithGarage(GARAGE, removable.transport)
		render(
			createElement(SpaceSettingsHarness, { ...gear, spaceId: GARAGE_ROW }),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		expect(settingsMenuOf()).toBeTruthy()

		act(() =>
			removable.announce({ id: GARAGE.id, name: "Garage", reason: "deleted" }),
		)

		await waitFor(() => expect(settingsMenuOf()).toBeNull())
		expect(await screen.findByText(LEFT_GARAGE)).toBeTruthy()
	})
})

describe("SpaceSettingsScreen on an invitation", () => {
	const openAtelier = () => {
		const invitations = atelierInvitations()
		return gearWithGarage().then((gear) => {
			const dialog = render(
				createElement(SpaceSettingsHarness, {
					...gear,
					invitations,
					spaceId: ATELIER_INVITATION.id,
				}),
				{ wrapper: createQueryTestWrapper().wrapper },
			).container
			return { dialog, invitations }
		})
	}

	it("reads who invited you beside Accept, with Decline pinned", async () => {
		const { dialog } = await openAtelier()

		expect(
			within(dialog).getByText("steve@example.com", { exact: false }),
		).toBeTruthy()
		expect(
			within(dialog).getByRole("button", {
				name: i18n.t("bots:spaces.invitations.accept"),
			}),
		).toBeTruthy()
		expect(
			within(dialog).queryByRole("button", { name: OPEN_LABEL }),
		).toBeNull()
	})

	it("accepts that invitation on Accept", async () => {
		const { dialog, invitations } = await openAtelier()

		fireEvent.click(
			within(dialog).getByRole("button", {
				name: i18n.t("bots:spaces.invitations.accept"),
			}),
		)

		expect(invitations.accept).toHaveBeenCalledExactlyOnceWith(
			ATELIER_INVITATION.id,
		)
	})

	it("declines that invitation on Decline", async () => {
		const { dialog, invitations } = await openAtelier()

		fireEvent.click(
			within(dialog).getByRole("button", {
				name: i18n.t("bots:spaces.invitations.decline"),
			}),
		)

		expect(invitations.decline).toHaveBeenCalledExactlyOnceWith(
			ATELIER_INVITATION.id,
		)
	})
})

const MEMBERS_TAB_NAME = i18n.t("settings:rail.members")

const openShareOf = async (gear: Gear, rowId: string) => {
	const openAccountSettings = vi.fn()
	gear.joined.selectSpace(rowId)
	const dialog = render(
		createElement(SpaceSettingsHarness, {
			...gear,
			spaceId: rowId,
			openAccountSettings,
		}),
		{
			wrapper: createQueryTestWrapper().wrapper,
		},
	).container
	fireEvent.click(
		await within(dialog).findByRole("button", { name: MEMBERS_TAB_NAME }),
	)
	return { dialog, openAccountSettings }
}

describe("SpaceSettingsScreen hosting on the desktop", () => {
	const hostingSwitchOf = (dialog: HTMLElement) =>
		within(dialog).getByRole("switch", {
			name: i18n.t("settings:space.hosting.label", { name: "Home" }),
		})

	it("reads the hosting of the open local space into the Share card", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "online" })
		const gear = await gearWithGarage()

		const { dialog } = await openShareOf(gear, gear.home.id)

		expect(commands.hostingState).toHaveBeenCalledWith(gear.home.id)
		expect(hostingSwitchOf(dialog).getAttribute("aria-checked")).toBe("true")
	})

	it("opens the account settings on Sign in", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "needsSignIn" })
		const gear = await gearWithGarage()
		const { dialog, openAccountSettings } = await openShareOf(
			gear,
			gear.home.id,
		)

		fireEvent.click(
			await within(dialog).findByRole("button", {
				name: i18n.t("settings:space.hosting.signIn"),
			}),
		)

		expect(openAccountSettings).toHaveBeenCalledOnce()
	})

	it("leaves the switch off and raises the H6 notice when the start fails", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "off" })
		vi.mocked(commands.hostingStart).mockRejectedValue(
			new Error("relay refused the token"),
		)
		const gear = await gearWithGarage()
		const { dialog } = await openShareOf(gear, gear.home.id)

		await act(async () => {
			fireEvent.click(await waitFor(() => hostingSwitchOf(dialog)))
		})

		expect(commands.hostingStart).toHaveBeenCalledWith(gear.home.id)
		expect(await screen.findAllByText("Couldn’t host Home")).not.toHaveLength(0)
		expect(
			screen.getAllByText("Check your connection and turn it on again."),
		).not.toHaveLength(0)
		expect(screen.queryByText(/relay refused the token/)).toBeNull()
		expect(hostingSwitchOf(dialog).getAttribute("aria-checked")).toBe("false")
	})

	it("starts hosting at once when the switch turns on, with no confirmation", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "off" })
		vi.mocked(commands.hostingStart).mockResolvedValue({
			status: "ok",
			data: { kind: "online" },
		})
		const gear = await gearWithGarage()
		const { dialog } = await openShareOf(gear, gear.home.id)

		await act(async () => {
			fireEvent.click(await waitFor(() => hostingSwitchOf(dialog)))
		})

		expect(commands.hostingStart).toHaveBeenCalledWith(gear.home.id)
		expect(screen.queryByRole("alertdialog")).toBeNull()
		await waitFor(() =>
			expect(hostingSwitchOf(dialog).getAttribute("aria-checked")).toBe("true"),
		)
	})

	it("stops hosting at once when the switch turns off, with no confirmation", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "online" })
		vi.mocked(commands.hostingStop).mockResolvedValue({
			status: "ok",
			data: { kind: "off" },
		})
		answerMembers({ hosting_members: [] })
		const gear = await gearWithGarage()
		const { dialog } = await openShareOf(gear, gear.home.id)

		await act(async () => {
			fireEvent.click(await waitFor(() => hostingSwitchOf(dialog)))
		})

		expect(commands.hostingStop).toHaveBeenCalledWith(gear.home.id)
		expect(screen.queryByRole("alertdialog")).toBeNull()
		expect(hostingSwitchOf(dialog).getAttribute("aria-checked")).toBe("false")
	})

	it("mounts no Hosting entry", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "online" })
		const gear = await gearWithGarage()

		await openShareOf(gear, gear.home.id)

		expect(
			within(settingsMenuOf() as HTMLElement).queryByRole("button", {
				name: /hosting/i,
			}),
		).toBeNull()
	})

	it("opens on the Members tab when Share asks for it", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "off" })
		const gear = await gearWithGarage()

		const dialog = openSettingsOf(gear, gear.home.id, "members")

		expect(
			await within(dialog).findByRole("button", {
				name: MEMBERS_TAB_NAME,
				current: "page",
			}),
		).toBeTruthy()
		expect(await waitFor(() => hostingSwitchOf(dialog))).toBeTruthy()
	})

	it("passes no hosting to a joined space", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		const gear = await gearWithGarage()

		const dialog = openSettingsOf(gear, GARAGE_ROW)
		await act(async () => undefined)

		expect(within(dialog).queryByRole("switch")).toBeNull()
		expect(commands.hostingState).not.toHaveBeenCalled()
	})
})

const HOST_ROW: Member = {
	userId: "steve",
	name: "Steve Puget",
	email: "steve@example.com",
	status: "host",
}

const SAM_JOINED: Member = {
	userId: "sam",
	name: "Sam Carter",
	email: "sam@example.com",
	status: "joined",
}

const openMembersOf = async (
	gear: Awaited<ReturnType<typeof gearWithGarage>>,
) => (await openShareOf(gear, gear.home.id)).dialog

const removeSamOf = (dialog: HTMLElement) =>
	within(dialog).findByRole("button", {
		name: i18n.t("settings:space.members.removeLabel", { name: "Sam Carter" }),
	})

const STEVE_HOSTING: JoinedSpaceMember = {
	userId: "steve",
	name: "Steve Puget",
	role: "host",
	deviceId: "device-of-steve",
	fingerprint: ["abandon", "ability", "able", "about", "above", "absent"],
	isPresent: true,
}

const SAM_GUEST: JoinedSpaceMember = {
	userId: "sam",
	name: "Sam Carter",
	role: "guest",
	deviceId: "device-of-sam",
	fingerprint: ["abandon", "ability", "able", "about", "above", "absent"],
	isPresent: true,
}

const answerJoinedMembers = (members: JoinedSpaceMember[]) =>
	vi
		.mocked(commands.joinedSpaceMembers)
		.mockResolvedValue({ status: "ok", data: members })

const answerMembers = (answers: Record<string, Member[]>) =>
	vi.mocked(invoke).mockImplementation(async (command: string) => {
		const members = answers[command]
		return (members && { members, invitations: [] }) as never
	})

const membersCalls = () =>
	vi
		.mocked(invoke)
		.mock.calls.filter(([command]) => command.startsWith("hosting_"))

const shownMembersPanel = () => {
	const props = vi.mocked(MembersPanel).mock.lastCall?.[0]
	if (!props) throw new Error("no members panel is shown")
	return props
}

const askRemovalOfTheHost = () => {
	const panel = shownMembersPanel()
	const host = panel.members.find((member) => member.status === "host")
	if (!host) throw new Error("the members panel lists no host")
	act(() => panel.onRemove(host))
}

const confirmRemovalOfTheHost = async () => {
	askRemovalOfTheHost()
	const confirm = await screen.findByRole("alertdialog")
	await act(async () => {
		fireEvent.click(
			within(confirm).getByRole("button", {
				name: i18n.t("settings:space.members.remove"),
			}),
		)
	})
}

const hostRefusesRemoval = (answers: Record<string, unknown>) =>
	vi.mocked(invoke).mockImplementation(async (command: string) => {
		if (command === "hosting_remove_member") throw { kind: "hostNotRemovable" }
		return answers[command] as never
	})

describe("SpaceSettingsScreen members on the desktop", () => {
	const hostOnline = () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "online" })
		answerMembers({ hosting_members: [SAM_JOINED, HOST_ROW] })
	}

	it("lists the members read for the open space, the host row first", async () => {
		hostOnline()
		const gear = await gearWithGarage()

		const dialog = await openMembersOf(gear)

		await within(dialog).findByText("Sam Carter")
		expect(invoke).toHaveBeenCalledWith("hosting_members", {
			spaceId: gear.home.id,
		})
		const names = within(dialog)
			.getAllByText(/Steve Puget|Sam Carter/)
			.map((node) => node.textContent)
		expect(names).toEqual(["Steve Puget", "Sam Carter"])
	})

	it("shows the Share card in Members and no share link in any tab", async () => {
		hostOnline()
		const gear = await gearWithGarage()
		const shareLabel = "Share link"

		const dialog = await openMembersOf(gear)

		expect(
			await within(dialog).findByText(
				i18n.t("settings:space.hosting.label", { name: "Home" }),
			),
		).toBeTruthy()
		expect(within(dialog).queryByText(shareLabel)).toBeNull()
		fireEvent.click(
			within(dialog).getByRole("button", {
				name: i18n.t("settings:rail.space"),
			}),
		)
		await waitFor(() =>
			expect(within(dialog).queryByText(shareLabel)).toBeNull(),
		)
		expect(
			within(dialog).getByRole("button", {
				name: i18n.t("settings:space.transfer.import"),
			}),
		).toBeTruthy()
	})

	it("removes a joined member only on confirm", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "online" })
		answerMembers({
			hosting_members: [SAM_JOINED, HOST_ROW],
			hosting_remove_member: [HOST_ROW],
		})
		const gear = await gearWithGarage()
		const dialog = await openMembersOf(gear)

		fireEvent.click(await removeSamOf(dialog))
		const confirm = await screen.findByRole("alertdialog")
		expect(invoke).not.toHaveBeenCalledWith(
			"hosting_remove_member",
			expect.anything(),
		)
		await act(async () => {
			fireEvent.click(
				within(confirm).getByRole("button", {
					name: i18n.t("settings:space.members.remove"),
				}),
			)
		})

		expect(invoke).toHaveBeenCalledWith("hosting_remove_member", {
			spaceId: gear.home.id,
			userId: "sam",
		})
		await waitFor(() =>
			expect(within(dialog).queryByText("Sam Carter")).toBeNull(),
		)
	})

	it("tells the host desktop to turn off hosting when it removes its own row", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "online" })
		hostRefusesRemoval({
			hosting_members: { members: [SAM_JOINED, HOST_ROW], invitations: [] },
		})
		const gear = await gearWithGarage()
		const dialog = await openMembersOf(gear)
		await within(dialog).findByText("Sam Carter")

		await confirmRemovalOfTheHost()

		expect(
			await within(dialog).findByText(
				i18n.t("settings:space.members.failure.remove.host", {
					space: "Home",
				}),
			),
		).toBeTruthy()
	})

	it("closes the removal without a call on cancel", async () => {
		hostOnline()
		const gear = await gearWithGarage()
		const dialog = await openMembersOf(gear)

		fireEvent.click(await removeSamOf(dialog))
		const confirm = await screen.findByRole("alertdialog")
		fireEvent.click(
			within(confirm).getByRole("button", {
				name: i18n.t("common:confirm.cancel"),
			}),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
		expect(invoke).not.toHaveBeenCalledWith(
			"hosting_remove_member",
			expect.anything(),
		)
	})

	it("disables the invite field and reads no members while hosting is off", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "off" })
		const gear = await gearWithGarage()

		const dialog = await openMembersOf(gear)

		expect(
			await within(dialog).findByText(
				i18n.t("settings:space.members.invite.notShared", { name: "Home" }),
			),
		).toBeTruthy()
		expect(
			within(dialog)
				.getByRole("textbox", {
					name: i18n.t("settings:space.members.invite.label"),
				})
				.hasAttribute("disabled"),
		).toBe(true)
		expect(membersCalls()).toEqual([])
	})

	const TOM_JOINED: Member = {
		userId: "tom",
		name: "Tom Reed",
		email: "tom@example.com",
		status: "joined",
	}

	const TOM_GUEST: JoinedSpaceMember = {
		userId: "tom",
		name: "Tom Reed",
		role: "guest",
		deviceId: "device-of-tom",
		fingerprint: ["orbit", "velvet", "canal", "fossil", "ripple", "mango"],
		isPresent: true,
	}

	const ANA_INVITED: SpaceInvitation = {
		id: "invitation-of-ana",
		email: "ana@example.com",
		sentAt: "2026-10-18T09:00:00Z",
		expiresAt: "2026-10-25T09:00:00Z",
		state: "invited",
	}

	const garageHostAnswers = (
		answers: Record<string, (() => unknown) | undefined> = {},
	) =>
		vi.mocked(invoke).mockImplementation(async (command: string) => {
			const answer = answers[command]
			if (answer) return answer() as never
			return {
				members: [HOST_ROW, SAM_JOINED, TOM_JOINED],
				invitations: [ANA_INVITED],
			} as never
		})

	const listNamed = (dialog: HTMLElement, name: string) =>
		within(dialog).getByRole("list", { name })

	const removeTomOf = (dialog: HTMLElement) =>
		within(dialog).findByRole("button", {
			name: i18n.t("settings:space.members.removeLabel", { name: "Tom Reed" }),
		})

	const confirmRemoval = async () => {
		const confirm = await screen.findByRole("alertdialog")
		await act(async () => {
			fireEvent.click(
				within(confirm).getByRole("button", {
					name: i18n.t("settings:space.members.remove"),
				}),
			)
		})
	}

	const openGarageMembers = async (garage = GARAGE) => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		answerJoinedMembers([SAM_GUEST, STEVE_HOSTING, TOM_GUEST])
		const gear = await gearWithGarage(garage)
		const { dialog } = await openShareOf(gear, GARAGE_ROW)
		await within(dialog).findByText("Tom Reed")
		return dialog
	}

	it("lists the signed roster of a joined space, the host first, the viewer marked as you", async () => {
		garageHostAnswers()

		const dialog = await openGarageMembers()

		expect(commands.joinedSpaceMembers).toHaveBeenCalledWith(GARAGE.id)
		const members = listNamed(dialog, i18n.t("settings:space.members.list"))
		expect(
			within(members)
				.getAllByText(/Steve Puget|Sam Carter|Tom Reed/)
				.map((node) => node.textContent),
		).toEqual(["Steve Puget", "Sam Carter (you)", "Tom Reed"])
		expect(
			within(members).queryByText("orbit velvet canal fossil ripple mango"),
		).toBeNull()
		expect(
			within(members)
				.getAllByRole("button")
				.map((button) => button.getAttribute("aria-label")),
		).toEqual([
			i18n.t("settings:space.members.removeLabel", { name: "Tom Reed" }),
		])
		expect(
			within(dialog)
				.getByRole("textbox", {
					name: i18n.t("settings:space.members.invite.label"),
				})
				.hasAttribute("disabled"),
		).toBe(false)
	})

	it("lists the invitations the host of a joined space answers", async () => {
		garageHostAnswers()

		const dialog = await openGarageMembers()

		expect(invoke).toHaveBeenCalledWith("hosting_members", {
			spaceId: "garage",
		})
		const invitations = await waitFor(() =>
			listNamed(dialog, i18n.t("settings:space.members.invitations")),
		)
		expect(within(invitations).getByText("ana@example.com")).toBeTruthy()
	})

	it("removes a member of a joined space through its host and drops the row", async () => {
		garageHostAnswers({
			hosting_remove_member: () => ({
				members: [HOST_ROW, SAM_JOINED],
				invitations: [],
			}),
		})
		const dialog = await openGarageMembers()

		fireEvent.click(await removeTomOf(dialog))
		await confirmRemoval()

		expect(invoke).toHaveBeenCalledWith("hosting_remove_member", {
			spaceId: "garage",
			userId: "tom",
		})
		await waitFor(() =>
			expect(within(dialog).queryByText("Tom Reed")).toBeNull(),
		)
		expect(within(dialog).getByText("Steve Puget")).toBeTruthy()
	})

	it("sends no members call with the local joined id until the shared space id is learned, then removes through it", async () => {
		garageHostAnswers({
			hosting_remove_member: () => ({
				members: [HOST_ROW, SAM_JOINED],
				invitations: [],
			}),
		})
		vi.mocked(isDesktopHost).mockReturnValue(true)
		answerJoinedMembers([SAM_GUEST, STEVE_HOSTING, TOM_GUEST])
		const gear = await gearWithGarage({ ...GARAGE, remoteSpaceId: null })
		const callOfTheLocalId = [
			expect.any(String),
			expect.objectContaining({ spaceId: GARAGE.id }),
		]

		await act(async () => {
			gear.joined.selectSpace(GARAGE_ROW)
			await settle()
		})

		expect(gear.joined.getState().openId).toBeNull()
		expect(membersCalls()).not.toContainEqual(callOfTheLocalId)

		gear.transport.list = async () => [GARAGE]
		const { dialog } = await openShareOf(gear, GARAGE_ROW)
		fireEvent.click(await removeTomOf(dialog))
		await confirmRemoval()

		expect(invoke).toHaveBeenCalledWith("hosting_remove_member", {
			spaceId: "garage",
			userId: "tom",
		})
		await waitFor(() =>
			expect(within(dialog).queryByText("Tom Reed")).toBeNull(),
		)
		expect(membersCalls()).not.toContainEqual(callOfTheLocalId)
	})

	it("shows the removal the host of a joined space fails in the panel", async () => {
		garageHostAnswers({
			hosting_remove_member: () => {
				throw { kind: "unreachable", reason: "relay down" }
			},
		})
		const dialog = await openGarageMembers()

		fireEvent.click(await removeTomOf(dialog))
		await confirmRemoval()

		expect(
			await within(dialog).findByText(
				i18n.t("settings:space.members.failure.remove.unreachable", {
					name: "Tom Reed",
				}),
			),
		).toBeTruthy()
		expect(within(dialog).getByText("Tom Reed")).toBeTruthy()
	})

	it("names the roster host and the space when a member asks to remove the host row, with no dialog, no removal sent and no Turn off hosting", async () => {
		hostRefusesRemoval({
			hosting_members: {
				members: [{ ...HOST_ROW, name: "Steve P." }, SAM_JOINED, TOM_JOINED],
				invitations: [],
			},
		})
		const dialog = await openGarageMembers()

		askRemovalOfTheHost()

		expect(
			await within(dialog).findByText(
				i18n.t("settings:space.members.failure.remove.hostedBy", {
					name: "Steve Puget",
					space: "Garage",
				}),
			),
		).toBeTruthy()
		expect(shownMembersPanel()).toMatchObject({
			viewerId: SAM_SIGNED_IN.id,
			failure: { reason: "host", member: { name: STEVE_HOSTING.name } },
		})
		expect(dialog.textContent).not.toMatch(/Turn off hosting/)
		expect(screen.queryByRole("alertdialog")).toBeNull()
		expect(
			membersCalls().filter(([command]) => command === "hosting_remove_member"),
		).toEqual([])
	})

	it("dims Members while the host is not connected, opening on Space and reading nothing from it", async () => {
		garageHostAnswers()
		vi.mocked(isDesktopHost).mockReturnValue(true)
		answerJoinedMembers([SAM_GUEST, STEVE_HOSTING, TOM_GUEST])
		const gear = await gearWithGarage({ ...GARAGE, state: "waitingForHost" })

		const dialog = openSettingsOf(gear, GARAGE_ROW, "members")
		await act(async () => settle())

		expect(
			within(dialog)
				.getByRole("button", { name: MEMBERS_TAB_NAME })
				.hasAttribute("disabled"),
		).toBe(true)
		expect(
			within(dialog).getByText(
				i18n.t("settings:space.standing.joinedNotConnected", {
					host: GARAGE.hostUrl,
				}),
			),
		).toBeTruthy()
		expect(within(dialog).queryByText("Tom Reed")).toBeNull()
		expect(membersCalls()).toEqual([])
	})

	it("invites on the host of a joined space", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(invoke).mockImplementation(async (command: string) =>
			command === "hosting_invite_member"
				? ({ ...SAM_JOINED, status: "invited" } as never)
				: ([HOST_ROW] as never),
		)
		const gear = await gearWithGarage()
		const { dialog } = await openShareOf(gear, GARAGE_ROW)
		const field = within(dialog).getByRole("textbox", {
			name: i18n.t("settings:space.members.invite.label"),
		})

		fireEvent.change(field, { target: { value: "ana@example.com" } })
		await act(async () => {
			fireEvent.click(
				within(dialog).getByRole("button", {
					name: i18n.t("settings:space.members.invite.action"),
				}),
			)
		})

		expect(invoke).toHaveBeenCalledWith("hosting_invite_member", {
			spaceId: "garage",
			email: "ana@example.com",
		})
	})

	it("shows the refusal the host of a joined space answers to an invite", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(invoke).mockImplementation(async (command: string) => {
			if (command === "hosting_invite_member") {
				throw { kind: "alreadyInvited" }
			}
			return [HOST_ROW] as never
		})
		const gear = await gearWithGarage()
		const { dialog } = await openShareOf(gear, GARAGE_ROW)

		fireEvent.change(
			within(dialog).getByRole("textbox", {
				name: i18n.t("settings:space.members.invite.label"),
			}),
			{ target: { value: "sam@example.com" } },
		)
		await act(async () => {
			fireEvent.click(
				within(dialog).getByRole("button", {
					name: i18n.t("settings:space.members.invite.action"),
				}),
			)
		})

		expect(
			await within(dialog).findByText(
				i18n.t("settings:space.members.invite.refusal.invited", {
					email: "sam@example.com",
				}),
			),
		).toBeTruthy()
	})

	it("refreshes the members of a joined space when its host announces a change", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		answerJoinedMembers([TOM_GUEST, STEVE_HOSTING])
		let announce: (changed: JoinedSpaceMembersChanged) => void = () => undefined
		vi.mocked(listen).mockImplementation(async (event, handler) => {
			if (event === JOINED_SPACE_MEMBERS_CHANGED_EVENT) {
				announce = (payload) =>
					handler({ event, id: 0, payload } as never, null)
			}
			return () => undefined
		})
		const gear = await gearWithGarage()
		const { dialog } = await openShareOf(gear, GARAGE_ROW)
		await within(dialog).findByText("Tom Reed")
		answerJoinedMembers([STEVE_HOSTING])

		act(() => announce({ id: GARAGE.id, members: [STEVE_HOSTING] }))

		await waitFor(() =>
			expect(within(dialog).queryByText("Tom Reed")).toBeNull(),
		)
		expect(within(dialog).getByText("Steve Puget")).toBeTruthy()
	})
})

const companionOf = (id: string, name: string): Bot => ({
	...botIdentity({ name, instructions: `${name} reads the diff.` }),
	id,
	createdAt: 1,
	memory: "",
	sectionId: null,
	pinPosition: null,
	changesNothing: true,
})

const ADA = companionOf("b-ada", "Ada")
const BO = companionOf("b-bo", "Bo")
const CY = companionOf("b-cy", "Cy")
const COMPANIONS = [ADA, BO, CY]

const COUNTS_LINE = /skill|application/

const readCounts = vi.fn<(spaceId: string) => Promise<CompanionCounts[]>>()

const routeCountsRead = () =>
	vi
		.mocked(invoke)
		.mockImplementation(async (command: string, args) =>
			command === "space_companion_counts"
				? readCounts((args as { spaceId: string }).spaceId)
				: [],
		)

const deferredCounts = () => {
	let answer: (value: CompanionCounts[]) => void = () => undefined
	const pending = new Promise<CompanionCounts[]>((resolve) => {
		answer = resolve
	})
	return { pending, answer }
}

const buttonStartingWith = (label: string) => {
	const rail = screen.getByRole("navigation", {
		name: i18n.t("bots:rail.label"),
	})
	const [button] = screen
		.getAllByRole("button", { name: new RegExp(`^${label}`) })
		.filter((candidate) => !rail.contains(candidate))
	return button
}

const companionCardOf = (bot: Bot) => buttonStartingWith(bot.name)

const countsLineOf = (bot: Bot) =>
	within(companionCardOf(bot)).queryByText(COUNTS_LINE)?.textContent ?? null

const openCompanionsOf = async (gear: Gear, rowId: string) => {
	gear.joined.selectSpace(rowId)
	const rendered = render(
		createElement(SpaceSettingsHarness, {
			...gear,
			spaceId: rowId,
			openedTab: COMPANIONS_ENTRY,
			bots: COMPANIONS,
		}),
		{ wrapper: createQueryTestWrapper().wrapper },
	)
	await waitFor(() => companionCardOf(ADA))
	return rendered
}

const otherSpaceOf = (gear: Gear, spaceId: string) => {
	const other = gear.spaces
		.getState()
		.spaces.find((space) => space.id !== spaceId)
	if (!other) throw new Error("no other space")
	return other
}

describe("SpaceSettingsScreen companion counts", () => {
	beforeEach(routeCountsRead)
	afterEach(() => readCounts.mockReset())

	it("gives each card the counts of its botId, once across re-renders", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		readCounts.mockResolvedValue([
			{ botId: BO.id, skillsCount: 5, applicationsCount: 1 },
			{ botId: ADA.id, skillsCount: 0, applicationsCount: 2 },
		])
		const gear = await gearWithGarage()

		const { rerender } = await openCompanionsOf(gear, gear.home.id)

		await waitFor(() =>
			expect(countsLineOf(BO)).toBe("5 skills · 1 application"),
		)
		expect(countsLineOf(ADA)).toBe("no skills · 2 applications")
		expect(countsLineOf(CY)).toBeNull()
		rerender(
			createElement(SpaceSettingsHarness, {
				...gear,
				spaceId: gear.home.id,
				openedTab: COMPANIONS_ENTRY,
				bots: [...COMPANIONS],
			}),
		)
		await settle()
		expect(readCounts.mock.calls).toEqual([[gear.home.id]])
	})

	it("renders every card without its counts line until the call answers", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		readCounts.mockReturnValue(deferredCounts().pending)
		const gear = await gearWithGarage()

		await openCompanionsOf(gear, gear.home.id)
		await settle()

		expect(COMPANIONS.map(countsLineOf)).toEqual([null, null, null])
	})

	it("keeps every card without its counts line and raises one notice when the call fails", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		readCounts.mockRejectedValue({ kind: "unknownSpace", id: "home" })
		const gear = await gearWithGarage()

		await openCompanionsOf(gear, gear.home.id)

		const notice = i18n.t("settings:space.companions.countsUnreadable")
		expect(
			await screen.findAllByRole("heading", { name: notice, hidden: true }),
		).toHaveLength(1)
		await settle()
		expect(
			screen.getAllByRole("heading", { name: notice, hidden: true }),
		).toHaveLength(1)
		expect(COMPANIONS.map(countsLineOf)).toEqual([null, null, null])
	})

	it("drops an answer for a space other than the one shown", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		const homeCounts = deferredCounts()
		const officeCounts = deferredCounts()
		readCounts
			.mockReturnValueOnce(homeCounts.pending)
			.mockReturnValueOnce(officeCounts.pending)
		const gear = await gearWithGarage()
		await gear.spaces.create()
		const office = otherSpaceOf(gear, gear.home.id)
		const { rerender } = await openCompanionsOf(gear, gear.home.id)

		act(() => {
			gear.joined.selectSpace(office.id)
			rerender(
				createElement(SpaceSettingsHarness, {
					...gear,
					spaceId: office.id,
					openedTab: COMPANIONS_ENTRY,
					bots: COMPANIONS,
				}),
			)
		})
		await waitFor(() => expect(readCounts.mock.calls).toHaveLength(2))
		await act(async () => {
			homeCounts.answer([
				{ botId: ADA.id, skillsCount: 9, applicationsCount: 9 },
			])
		})
		await settle()

		expect(countsLineOf(ADA)).toBeNull()
		await act(async () => {
			officeCounts.answer([
				{ botId: ADA.id, skillsCount: 1, applicationsCount: 0 },
			])
		})
		await waitFor(() =>
			expect(countsLineOf(ADA)).toBe("1 skill · no applications"),
		)
		expect(readCounts.mock.calls).toEqual([[gear.home.id], [office.id]])
	})

	it("calls again when the Companions entry opens again", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		readCounts.mockResolvedValue([
			{ botId: ADA.id, skillsCount: 2, applicationsCount: 3 },
		])
		const gear = await gearWithGarage()
		await openCompanionsOf(gear, gear.home.id)
		await waitFor(() =>
			expect(countsLineOf(ADA)).toBe("2 skills · 3 applications"),
		)

		fireEvent.click(buttonStartingWith(i18n.t("settings:rail.space")))
		await settle()
		fireEvent.click(buttonStartingWith(i18n.t("settings:rail.companions")))

		await waitFor(() => expect(readCounts.mock.calls).toHaveLength(2))
		expect(readCounts.mock.calls).toEqual([[gear.home.id], [gear.home.id]])
	})
})
