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
import { i18n } from "@workspace/ui/lib/i18n"

import { SpaceSettingsHost } from "@/components/space-settings-host"
import { APPLICATIONS_TAB } from "@/lib/applications/connection-settings"
import { commands, type JoinedSpace, type Member } from "@/lib/bindings"
import { createFakeTranscriptStore } from "@/lib/conversations/fake-transcript-store"
import { isDesktopHost } from "@/lib/host/index"
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
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"

vi.mock("@/lib/host/index", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host/index")>()),
	isDesktopHost: vi.fn(() => false),
	listen: vi.fn(async () => () => undefined),
}))

vi.mock("@/lib/bindings", async (importOriginal) => {
	const bindings = await importOriginal<typeof import("@/lib/bindings")>()
	return {
		...bindings,
		commands: {
			...bindings.commands,
			hostingState: vi.fn(),
			hostingStart: vi.fn(),
			hostingStop: vi.fn(),
			hostingMembers: vi.fn(async () => ({ status: "ok", data: [] })),
			hostingInviteMember: vi.fn(),
			hostingWithdrawInvitation: vi.fn(),
			hostingRemoveMember: vi.fn(),
		},
	}
})

const GARAGE: JoinedSpace = {
	id: "joined-garage",
	hostUrl: "http://192.168.1.20:45367",
	remoteSpaceId: "garage",
	name: "Garage",
}

const GARAGE_ROW = "joined:joined-garage"

type Gear = {
	spaces: SpacesController
	joined: JoinedSpacesController
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const garageTransport = () =>
	({
		list: async () => [GARAGE],
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

const gearWithGarage = async () => {
	const store = createFakeTranscriptStore()
	const home = await store.createSpace("Home")
	const spaces = createSpacesController(store)
	await spaces.load(home.id)
	const transport = garageTransport()
	const joined = createJoinedSpacesController({
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
		joinedSpaces: { state: joinedState, controller: joined },
		spaces: { state: spacesState, controller: spaces },
		spaceEnvironment: {
			state: { entries: [], hasFailedToRead: false },
			controller: { remove: vi.fn(), set: vi.fn() },
		},
		spaceMcpServers: { state: { hasFailedToLoad: false } },
	} as unknown as WorkspaceCore
	const panels = {
		applicationToOpenOn: () => undefined,
		closeSettingsTab: () => setSettingsTab(undefined),
		openAccountSettings,
		openSpaceMembers: () => {
			setSettingsTab("members")
			spaces.setSettingsOpen(true)
		},
		spaceHistory: { days: [], oldestDate: "2026-01-01", onUndo: vi.fn() },
		spaceSkills: { skills: [] },
	} as unknown as SettingsPanels
	const scopes = {
		isSpaceEditing: spacesState.isSettingsOpen,
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
		createElement(SpaceSettingsHost, { core, panels, scopes }),
		createElement(NoticeSurface),
	)
}

const openSettingsOf = (gear: Gear, rowId: string, openedTab?: string) => {
	gear.joined.selectSpace(rowId)
	gear.spaces.setSettingsOpen(true)
	render(createElement(SpaceSettingsHarness, { ...gear, openedTab }))
	return screen.getByRole("dialog")
}

const confirmLeave = async (dialog: HTMLElement) => {
	const leaveAction = i18n.t("common:spaces.leave.action")
	fireEvent.click(
		within(dialog).getByRole("tab", { name: i18n.t("settings:rail.danger") }),
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
		within(dialog).getByRole("tab", { name: i18n.t("settings:rail.danger") }),
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

describe("SpaceSettingsHost on a joined space", () => {
	it("opens the joined mode with the space name and host, without the local-only parts", async () => {
		const gear = await gearWithGarage()

		const dialog = openSettingsOf(gear, GARAGE_ROW)

		expect(within(dialog).getByDisplayValue("Garage")).toBeTruthy()
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

	it("leaves through the roster path, closes the dialog and selects the first local space", async () => {
		const gear = await gearWithGarage()
		const dialog = openSettingsOf(gear, GARAGE_ROW)

		await confirmLeave(dialog)

		expect(gear.transport.remove).toHaveBeenCalledWith(GARAGE.id)
		await waitFor(() =>
			expect(screen.queryByRole("dialog", { hidden: true })).toBeNull(),
		)
		expect(gear.joined.getState().joinedSpaces).toEqual([])
		const [firstLocal] = gear.spaces.getState().spaces
		expect(gear.spaces.getState().selectedSpaceId).toBe(firstLocal?.id)
	})

	it("resets the settings tab so the next Settings opens on the first tab", async () => {
		const gear = await gearWithGarage()
		const dialog = openSettingsOf(gear, GARAGE_ROW, APPLICATIONS_TAB)

		await confirmLeave(dialog)
		await waitFor(() =>
			expect(screen.queryByRole("dialog", { hidden: true })).toBeNull(),
		)
		act(() => gear.spaces.setSettingsOpen(true))

		const reopened = await screen.findByRole("dialog")
		expect(
			within(reopened).getByRole("tab", {
				name: i18n.t("settings:rail.space"),
				selected: true,
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
		expect(screen.getByRole("dialog", { hidden: true })).toBeTruthy()
	})
})

describe("SpaceSettingsHost on a local space", () => {
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
		await waitFor(() =>
			expect(screen.queryByRole("dialog", { hidden: true })).toBeNull(),
		)
		act(() => gear.spaces.setSettingsOpen(true))

		const reopened = await screen.findByRole("dialog")
		expect(
			within(reopened).getByRole("tab", {
				name: i18n.t("settings:rail.space"),
				selected: true,
			}),
		).toBeTruthy()
	})
})

const MEMBERS_TAB_NAME = i18n.t("settings:rail.members")

const openShareOf = async (gear: Gear, rowId: string) => {
	const openAccountSettings = vi.fn()
	gear.joined.selectSpace(rowId)
	gear.spaces.setSettingsOpen(true)
	render(createElement(SpaceSettingsHarness, { ...gear, openAccountSettings }))
	const dialog = screen.getByRole("dialog")
	fireEvent.click(
		await within(dialog).findByRole("tab", { name: MEMBERS_TAB_NAME }),
	)
	return { dialog, openAccountSettings }
}

describe("SpaceSettingsHost hosting on the desktop", () => {
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
		await waitFor(() =>
			expect(screen.queryByRole("dialog", { hidden: true })).toBeNull(),
		)
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
		expect(hostingSwitchOf(dialog).getAttribute("aria-checked")).toBe("true")
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

	it("mounts no Hosting tab", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "online" })
		const gear = await gearWithGarage()

		const { dialog } = await openShareOf(gear, gear.home.id)

		expect(within(dialog).queryByRole("tab", { name: /hosting/i })).toBeNull()
	})

	it("opens on the Members tab when Share asks for it", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "off" })
		const gear = await gearWithGarage()

		const dialog = openSettingsOf(gear, gear.home.id, "members")

		expect(
			await within(dialog).findByRole("tab", {
				name: MEMBERS_TAB_NAME,
				selected: true,
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

describe("SpaceSettingsHost members on the desktop", () => {
	const hostOnline = () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		vi.mocked(commands.hostingState).mockResolvedValue({ kind: "online" })
		vi.mocked(commands.hostingMembers).mockResolvedValue({
			status: "ok",
			data: [SAM_JOINED, HOST_ROW],
		})
	}

	it("lists the members read for the open space, the host row first", async () => {
		hostOnline()
		const gear = await gearWithGarage()

		const dialog = await openMembersOf(gear)

		await within(dialog).findByText("Sam Carter")
		expect(commands.hostingMembers).toHaveBeenCalledWith(gear.home.id)
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
			within(dialog).getByRole("tab", { name: i18n.t("settings:rail.space") }),
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
		hostOnline()
		vi.mocked(commands.hostingRemoveMember).mockResolvedValue({
			status: "ok",
			data: [HOST_ROW],
		})
		const gear = await gearWithGarage()
		const dialog = await openMembersOf(gear)

		fireEvent.click(await removeSamOf(dialog))
		const confirm = await screen.findByRole("alertdialog")
		expect(commands.hostingRemoveMember).not.toHaveBeenCalled()
		await act(async () => {
			fireEvent.click(
				within(confirm).getByRole("button", {
					name: i18n.t("settings:space.members.remove"),
				}),
			)
		})

		expect(commands.hostingRemoveMember).toHaveBeenCalledWith(
			gear.home.id,
			"sam",
		)
		await waitFor(() =>
			expect(within(dialog).queryByText("Sam Carter")).toBeNull(),
		)
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
		expect(commands.hostingRemoveMember).not.toHaveBeenCalled()
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
		expect(commands.hostingMembers).not.toHaveBeenCalled()
	})

	it("shows no Members entry on a joined space", async () => {
		vi.mocked(isDesktopHost).mockReturnValue(true)
		const gear = await gearWithGarage()

		const dialog = openSettingsOf(gear, GARAGE_ROW)
		await act(async () => undefined)

		expect(
			within(dialog).queryByRole("tab", { name: MEMBERS_TAB_NAME }),
		).toBeNull()
		expect(commands.hostingMembers).not.toHaveBeenCalled()
	})
})
