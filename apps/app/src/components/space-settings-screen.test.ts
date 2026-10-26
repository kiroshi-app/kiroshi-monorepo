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
import { afterEach, describe, expect, it, vi } from "vitest"

import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import { MembersPanel } from "@workspace/ui/components/space-settings-dialog/members-panel"
import { i18n } from "@workspace/ui/lib/i18n"

import { SpaceSettingsScreen } from "@/components/space-settings-screen"
import { APPLICATIONS_TAB } from "@/lib/applications/connection-settings"
import {
	type AccountState,
	commands,
	JOINED_SPACE_MEMBERS_CHANGED_EVENT,
	type JoinedSpace,
	type JoinedSpaceMember,
	type JoinedSpaceMembersChanged,
	type Member,
	type SpaceInvitation,
} from "@/lib/bindings"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import { invoke, isDesktopHost, listen } from "@/lib/host/index"
import { createQueryTestWrapper } from "@/lib/query/query-test-wrapper"
import {
	createJoinedSpacesController,
	type JoinedSpacesController,
	type JoinedSpacesTransport,
	openLocalSpaceOf,
	openRowIdOf,
} from "@/lib/spaces/joined-spaces-controller"
import {
	createSpacesController,
	type SpacesController,
} from "@/lib/spaces/spaces-controller"
import { useControllerState } from "@/lib/use-controller"
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
		onRemoved: async () => () => undefined,
	}) satisfies JoinedSpacesTransport

const hostsFake = () => ({
	getState: () => ({ active: null, connections: {} }),
	subscribe: () => () => undefined,
	connect: async () => undefined,
	activate: async () => undefined,
	forget: () => undefined,
})

const gearWithGarage = async (garage = GARAGE) => {
	const store = createFakeTranscriptStore()
	const home = await store.createSpace("Home")
	const { queryClient } = createQueryTestWrapper()
	const spaces = createSpacesController(store, { queryClient })
	await spaces.load(home.id)
	const transport = garageTransport(garage)
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

type SpaceSettingsHarnessProps = Gear & {
	openedTab?: string
	openAccountSettings?: () => void
}

const SpaceSettingsHarness = ({
	spaces,
	joined,
	openedTab,
	openAccountSettings,
}: SpaceSettingsHarnessProps) => {
	const [settingsTab, setSettingsTab] = useState(openedTab)
	const spacesState = useControllerState(spaces)
	const joinedState = useControllerState(joined)
	const { selectedSpaceId } = spacesState
	const core = {
		account: { state: SAM_SIGNED_IN },
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
	const panels = {
		applicationToOpenOn: () => undefined,
		closeSettings: () => {
			setSettingsTab(undefined)
			spaces.setSettingsOpen(false)
		},
		openAccountSettings,
		openSpaceMembers: () => {
			setSettingsTab("members")
			spaces.setSettingsOpen(true)
		},
		spaceHistory: { days: [], oldestDate: "2026-01-01", onUndo: vi.fn() },
		spaceSkills: { skills: [] },
	} as unknown as SettingsPanels
	const scopes = {
		selectedSpace: openLocalSpaceOf(
			spacesState.spaces,
			openRowIdOf(joinedState, selectedSpaceId),
		),
		selectedSpaceId,
		setOpenedMcpServer: vi.fn(),
		setSettingsTab,
		settingsTab,
		spaceApplications: { mcpServers: [] },
	} as unknown as ApplicationScopes
	return createElement(
		Fragment,
		null,
		spacesState.isSettingsOpen
			? createElement(SpaceSettingsScreen, {
					core,
					panels,
					rail: () => null,
					rosterLines: {
						sidebarActions: { onCreateBot: vi.fn() },
					} as unknown as RosterLines,
					rosterView: { bots: [] } as unknown as RosterView,
					scopes,
				})
			: null,
		createElement(NoticeSurface),
	)
}

const SETTINGS_MENU = i18n.t("settings:screen.menu")

const settingsMenuOf = () =>
	screen.queryByRole("navigation", { name: SETTINGS_MENU, hidden: true })

const openSettingsOf = (gear: Gear, rowId: string, openedTab?: string) => {
	gear.joined.selectSpace(rowId)
	gear.spaces.setSettingsOpen(true)
	return render(createElement(SpaceSettingsHarness, { ...gear, openedTab }), {
		wrapper: createQueryTestWrapper().wrapper,
	}).container
}

const confirmLeave = async (dialog: HTMLElement) => {
	const leaveAction = i18n.t("common:spaces.leave.action")
	fireEvent.click(
		within(dialog).getByRole("button", {
			name: i18n.t("settings:rail.danger"),
		}),
	)
	fireEvent.click(
		await within(dialog).findByRole("button", { name: leaveAction }),
	)
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
	it("opens the joined mode with the space name and host, without the local-only parts", async () => {
		const gear = await gearWithGarage()

		const dialog = openSettingsOf(gear, GARAGE_ROW)

		expect(
			within(dialog).getByText("Garage", {
				selector: "[data-slot=settings-menu-name]",
			}),
		).toBeTruthy()
		expect(within(dialog).queryByDisplayValue("Garage")).toBeNull()
		expect(within(dialog).getByDisplayValue(GARAGE.hostUrl)).toBeTruthy()
		for (const localOnly of [
			i18n.t("settings:space.colour.label"),
			"Share link",
			i18n.t("settings:space.transfer.export"),
			i18n.t("settings:space.transfer.import"),
		]) {
			expect(within(dialog).queryByText(localOnly)).toBeNull()
		}
	})

	it("keeps the name of a joined space and writes no rename", async () => {
		const gear = await gearWithGarage()
		const dialog = openSettingsOf(gear, GARAGE_ROW)

		expect(
			within(dialog).getByText("Garage", {
				selector: "[data-slot=settings-menu-name]",
			}),
		).toBeTruthy()
		expect(within(dialog).queryByDisplayValue("Garage")).toBeNull()
		expect(gear.joined.getState().joinedSpaces).toEqual([GARAGE])
	})

	it("leaves through the roster path, closes the dialog and selects the first local space", async () => {
		const gear = await gearWithGarage()
		const dialog = openSettingsOf(gear, GARAGE_ROW)

		await confirmLeave(dialog)

		expect(gear.transport.remove).toHaveBeenCalledWith(GARAGE.id)
		await waitFor(() => expect(settingsMenuOf()).toBeNull())
		expect(gear.joined.getState().joinedSpaces).toEqual([])
		const [firstLocal] = gear.spaces.getState().spaces
		expect(gear.spaces.getState().selectedSpaceId).toBe(firstLocal?.id)
	})

	it("resets the settings tab so the next Settings opens on the first tab", async () => {
		const gear = await gearWithGarage()
		const dialog = openSettingsOf(gear, GARAGE_ROW, APPLICATIONS_TAB)

		await confirmLeave(dialog)
		await waitFor(() => expect(settingsMenuOf()).toBeNull())
		act(() => gear.spaces.setSettingsOpen(true))

		const reopened = await screen.findByRole("navigation", {
			name: SETTINGS_MENU,
		})
		expect(
			within(reopened).getByRole("button", {
				name: i18n.t("settings:rail.space"),
				current: "page",
			}),
		).toBeTruthy()
	})

	it("keeps the space and raises the refusal when the leave fails", async () => {
		const gear = await gearWithGarage()
		gear.transport.remove.mockRejectedValueOnce(new Error("disk full"))
		const dialog = openSettingsOf(gear, GARAGE_ROW)

		await confirmLeave(dialog)

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
	it("opens the local mode with its colour and transfer actions", async () => {
		const gear = await gearWithGarage()

		const dialog = openSettingsOf(gear, gear.home.id)

		expect(within(dialog).getByDisplayValue("Home")).toBeTruthy()
		expect(
			within(dialog).getByText(i18n.t("settings:space.colour.label")),
		).toBeTruthy()
		expect(
			within(dialog).getByRole("button", {
				name: i18n.t("settings:space.transfer.export"),
			}),
		).toBeTruthy()
	})

	it("resets the settings tab once the space is deleted, so the next Settings opens on the first tab", async () => {
		const gear = await gearWithGarage()
		await gear.spaces.create()
		const dialog = openSettingsOf(gear, gear.home.id, APPLICATIONS_TAB)

		await confirmDelete(dialog)
		await waitFor(() => expect(settingsMenuOf()).toBeNull())
		act(() => gear.spaces.setSettingsOpen(true))

		const reopened = await screen.findByRole("navigation", {
			name: SETTINGS_MENU,
		})
		expect(
			within(reopened).getByRole("button", {
				name: i18n.t("settings:rail.space"),
				current: "page",
			}),
		).toBeTruthy()
	})
})

const MEMBERS_TAB_NAME = i18n.t("settings:rail.members")

const openShareOf = async (gear: Gear, rowId: string) => {
	const openAccountSettings = vi.fn()
	gear.joined.selectSpace(rowId)
	gear.spaces.setSettingsOpen(true)
	const dialog = render(
		createElement(SpaceSettingsHarness, { ...gear, openAccountSettings }),
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

	it("closes the space settings and opens the account settings on Sign in", async () => {
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
		await waitFor(() => expect(settingsMenuOf()).toBeNull())
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

	it("disables the invite field, Invite and every row action while the host is offline, reading nothing from it", async () => {
		garageHostAnswers()

		const dialog = await openGarageMembers({
			...GARAGE,
			state: "waitingForHost",
		})

		expect(
			within(dialog)
				.getByRole("textbox", {
					name: i18n.t("settings:space.members.invite.label"),
				})
				.hasAttribute("disabled"),
		).toBe(true)
		for (const button of [
			within(dialog).getByRole("button", {
				name: i18n.t("settings:space.members.invite.action"),
			}),
			await removeTomOf(dialog),
		]) {
			expect(button.hasAttribute("disabled")).toBe(true)
		}
		expect(membersCalls()).toEqual([])
		await act(async () => settle())
		expect(
			screen.queryByText(i18n.t("settings:space.transfer.reason.generic")),
		).toBeNull()
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
