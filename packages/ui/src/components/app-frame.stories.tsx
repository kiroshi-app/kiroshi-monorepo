import { useState } from "react"
import { expect, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import {
	AppFrameShell,
	type AppFrameShellProps,
} from "@workspace/ui/components/app-frame"
import type { AppRailPanel } from "@workspace/ui/components/app-rail"
import { AppSidebarBody } from "@workspace/ui/components/app-sidebar"
import {
	STUDIO,
	TITLE_BAR,
} from "@workspace/ui/components/app-title-bar.fixtures"
import { DEFAULT_BOT_OUTPUT_STYLE } from "@workspace/ui/components/bot-settings"
import { CONVERSATION_BOTS } from "@workspace/ui/components/bots.fixtures"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ContentCard } from "@workspace/ui/components/content-card"
import { BOT_ENVIRONMENT } from "@workspace/ui/components/environment.fixtures"
import {
	ExpandedSidebar,
	type ExpandedSidebarDestination,
} from "@workspace/ui/components/expanded-sidebar"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import { LIBRARY_ITEMS } from "@workspace/ui/components/library.fixtures"
import { LibraryPanel } from "@workspace/ui/components/library-panel"
import {
	CATALOGUE_APPLICATIONS,
	MARKED_APPLICATIONS,
} from "@workspace/ui/components/plugin-settings/applications.fixtures"
import { EVERYTHING_CATEGORY } from "@workspace/ui/components/plugin-settings/applications-catalogue"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import { BOT_SKILLS } from "@workspace/ui/components/plugin-settings/skills.fixtures"
import {
	CompanionSettingsScreenBody,
	type CompanionSettingsScreenBodyProps,
	ConversationSettingsScreenBody,
	type ConversationSettingsScreenBodyProps,
	SettingsScreenBody,
	type UserSettingsScreenBodyProps,
	useLeaveGuard,
	useSettingsLeaveGuard,
} from "@workspace/ui/components/settings-screen"
import type { SpaceAvatarState } from "@workspace/ui/components/space-avatar"
import { WorkspaceShellRoot } from "@workspace/ui/components/workspace-shell"

const RAIL: AppFrameShellProps["rail"] = {
	selected: "conversations",
	spaces: [STUDIO],
	user: { name: "Ada Martin" },
	onSelectConversations: fn(),
	onSelectMissions: fn(),
	onOpenSpaceSettings: fn(),
	onOpenYou: fn(),
}

const renderFrame = (args: AppFrameShellProps) => (
	<AppFrameShell {...args}>
		<ContentCard />
	</AppFrameShell>
)

const railAvatarStateIn = (canvasElement: HTMLElement) =>
	slotIn(slotIn(canvasElement, "app-rail"), "space-avatar").dataset.state

const drawing = (
	state: SpaceAvatarState,
	spaceHost?: SpaceHost,
	rail = RAIL,
) => ({
	args: { spaceHost, rail },
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await expect(railAvatarStateIn(canvasElement)).toBe(state)
	},
})

const meta = preview.meta({
	title: "Navigation/AppFrame",
	component: AppFrameShell,
	render: renderFrame,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The window frame: the title bar and the rail drawn once, and beside the rail everything the page shows, its children. The conversations, missions, the Library and every settings screen sit inside it, so moving between them never redraws the title bar or the rail. It takes the current Space and its host connection and hands both to the rail itself, so the Space logo at the top of the rail draws the same connection state on every page for the same host.",
			},
		},
	},
	args: {
		titleBar: TITLE_BAR,
		rail: RAIL,
		space: STUDIO,
		children: null,
	},
})

export const LocalSpace = meta.story({
	...drawing("local"),
	parameters: {
		docs: {
			description: {
				story:
					"A Space with no host connection. Check that the rail's Space logo draws the local state.",
			},
		},
	},
})

export const SharedSpace = meta.story({
	...drawing("shared", "shared"),
	parameters: {
		docs: {
			description: {
				story:
					"A Space the reader hosts and shares. Check that the rail's Space logo draws the shared state.",
			},
		},
	},
})

export const OnlineSpace = meta.story({
	...drawing("online", "up"),
	parameters: {
		docs: {
			description: {
				story:
					"A joined Space whose host is reachable. Check that the rail's Space logo draws the online state.",
			},
		},
	},
})

export const ConnectingSpace = meta.story({
	...drawing("connecting", "connecting"),
	parameters: {
		docs: {
			description: {
				story:
					"A joined Space whose host is being reached. Check that the rail's Space logo draws the connecting state.",
			},
		},
	},
})

export const OfflineSpace = meta.story({
	...drawing("offline", "down"),
	parameters: {
		docs: {
			description: {
				story:
					"A joined Space whose host is out of reach. Check that the rail's Space logo draws the offline state.",
			},
		},
	},
})

export const OfflineSpaceWithSpaceSettingsOpen = meta.story({
	...drawing("offline", "down", { ...RAIL, openSettings: "space" }),
	parameters: {
		docs: {
			description: {
				story:
					"`OfflineSpace` while the Space settings are open, the Space logo being the current rail entry. Check that the selection does not change the connection state the logo draws.",
			},
		},
	},
})

export const OfflineSpaceDark = meta.story({
	...drawing("offline", "down"),
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"`OfflineSpace` in the dark theme. Check that the rail's Space logo draws the offline state.",
			},
		},
	},
})

type RailPage = AppRailPanel | "settings"

type FramePage = RailPage | "companion" | "conversation"

const ROSTER = [
	{
		id: "atlas",
		blot: BLOT_HUES.blue,
		name: "Atlas",
		title: "Research",
		lastMessage: "Pulled the three papers and summarised each one for you.",
		timestamp: "09:24",
	},
	{
		id: "beacon",
		blot: BLOT_HUES.yellow,
		name: "Beacon",
		lastMessage: "Drafted the release notes.",
		timestamp: "08:10",
	},
]

const USER_SETTINGS = {
	target: "user",
	entry: "appearance",
	onEntryChange: fn(),
	onBack: fn(),
	value: { name: "Ada Martin", colorScheme: "system" },
	onValueChange: fn(),
	language: null,
	onLanguageChange: fn(),
	skills: BOT_SKILLS,
	onSkillCreate: fn(),
	onSkillChange: fn(),
	onSkillPreloadedChange: fn(),
	onSkillDelete: fn(),
	history: {
		days: HISTORY_DAYS,
		oldestDate: HISTORY_OLDEST_DATE,
		onUndo: fn(),
	},
} satisfies UserSettingsScreenBodyProps

const COMPANION_SETTINGS = {
	entry: "skills",
	onEntryChange: fn(),
	onBack: fn(),
	value: {
		identity: { blot: BLOT_HUES.green },
		name: "Juniper",
		title: "Writer",
		instructions: "Write plainly.",
		model: "sonnet-4-6",
		effort: "medium",
		permissions: { defaultMode: "acceptEdits", allow: [], ask: [], deny: [] },
	},
	onValueChange: fn(),
	models: [
		{
			label: "Claude Sonnet 4.6",
			value: "sonnet-4-6",
			supportedEfforts: ["low", "medium", "high"],
		},
	],
	outputStyle: DEFAULT_BOT_OUTPUT_STYLE,
	onOutputStyleChange: fn(),
	onAvatarUpload: fn(),
	seed: "bot-7",
	environment: BOT_ENVIRONMENT,
	onEnvironmentSet: fn(),
	onEnvironmentDelete: fn(),
	skills: BOT_SKILLS,
	onSkillCreate: fn(),
	onSkillChange: fn(),
	onSkillPreloadedChange: fn(),
	onSkillDelete: fn(),
	mcpServers: MARKED_APPLICATIONS,
	onMcpServerCreate: fn(),
	onMcpServerChange: fn(),
	onMcpServerDelete: fn(),
	onMcpServerOpen: fn(),
	onServerConnect: fn(),
	mcpCatalogue: {
		category: EVERYTHING_CATEGORY,
		onCategoryChange: fn(),
		query: "",
		onQueryChange: fn(),
		applications: CATALOGUE_APPLICATIONS,
		onRetry: fn(),
		onPick: fn(),
		onOpen: fn(),
	},
	history: {
		days: HISTORY_DAYS,
		oldestDate: HISTORY_OLDEST_DATE,
		onUndo: fn(),
	},
	onDelete: fn(),
} satisfies CompanionSettingsScreenBodyProps

const CONVERSATION_SETTINGS = {
	entry: "general",
	onEntryChange: fn(),
	onBack: fn(),
	value: { name: "Release desk", instructions: "Ship on Thursdays." },
	onValueChange: fn(),
	icon: "Rocket",
	hue: 150,
	onIconChange: fn(),
	onHueChange: fn(),
	participants: CONVERSATION_BOTS.slice(0, 3),
	leadId: CONVERSATION_BOTS[0]?.id ?? "",
	onLeadChange: fn(),
	onDismiss: fn(),
	onDelete: fn(),
} satisfies ConversationSettingsScreenBodyProps

type FramePageProps = {
	page: FramePage
}

const isRailPanel = (page: FramePage): page is AppRailPanel =>
	page === "conversations" || page === "missions" || page === "library"

const FrameAcrossPages = ({ page: firstPage }: FramePageProps) => {
	const [page, setPage] = useState<FramePage>(firstPage)
	const frame = useSettingsLeaveGuard({
		rail: {
			...RAIL,
			selected: isRailPanel(page) ? page : "conversations",
			openSettings: page === "settings" ? "you" : undefined,
			onSelectConversations: () => setPage("conversations"),
			onSelectMissions: () => setPage("missions"),
			onSelectLibrary: () => setPage("library"),
			onOpenYou: () => setPage("settings"),
		},
		titleBar: TITLE_BAR,
	})

	return (
		<AppFrameShell rail={frame.rail} space={STUDIO} titleBar={frame.titleBar}>
			{page === "conversations" || page === "missions" ? (
				<>
					<AppSidebarBody
						bots={ROSTER}
						openPanel={page}
						selectedBotId="atlas"
						spaces={[STUDIO]}
					/>
					<ContentCard />
				</>
			) : null}
			{page === "library" ? (
				<ContentCard>
					<LibraryPanel
						filter="all"
						items={LIBRARY_ITEMS}
						onFilterChange={fn()}
						onOpenItem={fn()}
						state="ready"
					/>
				</ContentCard>
			) : null}
			{page === "settings" ? (
				<SettingsScreenBody {...USER_SETTINGS} guardLeave={frame.guardLeave} />
			) : null}
			{page === "companion" ? (
				<CompanionSettingsScreenBody
					{...COMPANION_SETTINGS}
					guardLeave={frame.guardLeave}
				/>
			) : null}
			{page === "conversation" ? (
				<ConversationSettingsScreenBody
					{...CONVERSATION_SETTINGS}
					guardLeave={frame.guardLeave}
				/>
			) : null}
		</AppFrameShell>
	)
}

const PAGE_REACHED_BY: Record<RailPage, string> = {
	conversations: "Conversations",
	missions: "Missions",
	library: "Library",
	settings: "Ada Martin",
}

const expectPageShown = async (canvasElement: HTMLElement, page: FramePage) => {
	const canvas = within(canvasElement)
	if (page === "conversations" || page === "missions") {
		await expect(
			await canvas.findByRole("complementary", {
				name: PAGE_REACHED_BY[page],
			}),
		).toBeVisible()
		return
	}
	if (page === "library") {
		await expect(await canvas.findByText(LIBRARY_ITEMS[0].name)).toBeVisible()
		return
	}
	await expect(
		await canvas.findByRole("navigation", { name: "Settings" }),
	).toBeVisible()
}

const frameIn = (canvasElement: HTMLElement) => {
	const titleBars = canvasElement.querySelectorAll(
		'[data-slot="app-title-bar"]',
	)
	const rails = canvasElement.querySelectorAll('[data-slot="app-rail"]')
	return { titleBars, rails }
}

const geometryOf = (element: Element) => {
	const { x, y, width, height } = element.getBoundingClientRect()
	return { x, y, width, height }
}

const RAIL_PAGES: RailPage[] = [
	"conversations",
	"missions",
	"library",
	"settings",
]

type StoryUser = {
	click: (element: Element) => Promise<void>
	type: (element: Element, text: string) => Promise<void>
}

const editASkill = async (canvasElement: HTMLElement, user: StoryUser) => {
	const main = within(canvasElement).getByRole("main")
	await user.click(within(main).getByRole("button", { name: /release-notes/ }))
	await user.type(within(main).getByLabelText("Body"), "!")
}

const leaveWithoutSaving = async (user: StoryUser) => {
	const question = await screen.findByRole("alertdialog", {
		name: "Leave without saving?",
	})
	await user.click(within(question).getByRole("button", { name: "Leave" }))
}

const holding = (page: FramePage, hasUnsavedEdit = false) => ({
	render: () => <FrameAcrossPages page={page} />,
	play: async ({
		canvasElement,
		userEvent,
	}: {
		canvasElement: HTMLElement
		userEvent: StoryUser
	}) => {
		await expectPageShown(canvasElement, page)
		if (hasUnsavedEdit) await editASkill(canvasElement, userEvent)
		const first = frameIn(canvasElement)
		await expect(first.titleBars).toHaveLength(1)
		await expect(first.rails).toHaveLength(1)
		const [titleBar] = first.titleBars
		const [rail] = first.rails
		const titleBarGeometry = geometryOf(titleBar)
		const railGeometry = geometryOf(rail)

		for (const [index, next] of RAIL_PAGES.filter(
			(other) => other !== page,
		).entries()) {
			await userEvent.click(
				within(rail as HTMLElement).getByRole("button", {
					name: PAGE_REACHED_BY[next],
				}),
			)
			if (hasUnsavedEdit && index === 0) await leaveWithoutSaving(userEvent)
			await expectPageShown(canvasElement, next)
			const shown = frameIn(canvasElement)
			await expect(shown.titleBars).toHaveLength(1)
			await expect(shown.rails).toHaveLength(1)
			await expect(shown.titleBars[0]).toBe(titleBar)
			await expect(shown.rails[0]).toBe(rail)
			await expect(geometryOf(titleBar)).toEqual(titleBarGeometry)
			await expect(geometryOf(rail)).toEqual(railGeometry)
		}
	},
})

export const HoldingConversations = meta.story({
	...holding("conversations"),
	parameters: {
		docs: {
			description: {
				story:
					"The frame holding the conversations panel and an empty card, then each other page reached from the rail. Check that the frame draws one title bar and one rail on every page, the same elements at the same place and size, and that Missions turns the panel beside the rail into the missions panel.",
			},
		},
	},
})

export const HoldingLibrary = meta.story({
	...holding("library"),
	parameters: {
		docs: {
			description: {
				story:
					"The frame holding the Library in its card, with no panel beside the rail, then each other page reached from the rail. Check that the frame draws one title bar and one rail on every page, the same elements at the same place and size.",
			},
		},
	},
})

export const HoldingSettings = meta.story({
	...holding("settings"),
	parameters: {
		docs: {
			description: {
				story:
					"The frame holding the reader's settings, the settings menu beside the rail and the Appearance page in the card, then each other page reached from the rail. Check that the frame draws one title bar and one rail on every page, the same elements at the same place and size.",
			},
		},
	},
})

export const HoldingSettingsDark = meta.story({
	...holding("settings"),
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"`HoldingSettings` in the dark theme. Check that the frame draws one title bar and one rail on every page, the same elements at the same place and size.",
			},
		},
	},
})

export const HoldingCompanionSettings = meta.story({
	...holding("companion", true),
	parameters: {
		docs: {
			description: {
				story:
					"The frame holding a companion's settings, the settings menu beside the rail and the Skills page in the card, a skill edited and not saved, then each page reached from the rail. Check that the first rail press asks before leaving the unsaved skill, and that the frame draws one title bar and one rail on every page, the same elements at the same place and size.",
			},
		},
	},
})

export const HoldingConversationSettings = meta.story({
	...holding("conversation"),
	parameters: {
		docs: {
			description: {
				story:
					"The frame holding a conversation's settings, the settings menu beside the rail and the General page in the card, then each page reached from the rail. Check that the frame draws one title bar and one rail on every page, the same elements at the same place and size.",
			},
		},
	},
})

type SidebarPage = ExpandedSidebarDestination | "companion"

const SidebarAcrossPages = () => {
	const [page, setPage] = useState<SidebarPage>("companion")
	const leaveGuard = useLeaveGuard({})

	return (
		<WorkspaceShellRoot>
			<ExpandedSidebar
				conversations={null}
				destination={page === "companion" ? undefined : page}
				onNewConversation={leaveGuard.askFirst(() =>
					setPage("newConversation"),
				)}
				onSelectLibrary={leaveGuard.askFirst(() => setPage("library"))}
				onSelectMissions={leaveGuard.askFirst(() => setPage("missions"))}
				onSelectSpace={fn()}
				pinned={null}
				selectedSpaceId={STUDIO.id}
				spaces={[STUDIO]}
				user={{ name: "Ada Martin" }}
			/>
			{page === "companion" ? (
				<CompanionSettingsScreenBody
					{...COMPANION_SETTINGS}
					guardLeave={leaveGuard.guardLeave}
				/>
			) : (
				<ContentCard />
			)}
		</WorkspaceShellRoot>
	)
}

export const SidebarAsksBeforeLeavingSettings = meta.story({
	render: () => <SidebarAcrossPages />,
	parameters: {
		docs: {
			description: {
				story:
					"The navigation shell with no rail: the expanded sidebar beside a companion's settings, a skill edited and not saved, its destinations wrapped by `useLeaveGuard`. Check that Missions asks before leaving the unsaved skill and opens only once Leave is pressed, and that Library, pressed with no settings open, opens at once.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		await editASkill(canvasElement, userEvent)
		const sidebar = within(slotIn(canvasElement, "expanded-sidebar"))
		const missions = sidebar.getByRole("button", { name: /^Missions/ })
		await userEvent.click(missions)
		await expect(missions).not.toHaveAttribute("aria-current")
		await leaveWithoutSaving(userEvent)
		await expect(missions).toHaveAttribute("aria-current", "page")

		const library = sidebar.getByRole("button", { name: "Library" })
		await userEvent.click(library)
		await expect(screen.queryByRole("alertdialog")).toBeNull()
		await expect(library).toHaveAttribute("aria-current", "page")
	},
})
