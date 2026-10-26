import { type ComponentType, useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotIn,
} from "@workspace/storybook/story-utils"
import { AppRail } from "@workspace/ui/components/app-rail"
import { SPACE_ENVIRONMENT } from "@workspace/ui/components/environment.fixtures"
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
	SettingsScreen,
	type SpaceSettingsScreenProps,
} from "@workspace/ui/components/settings-screen"
import { SPACE_COMPANIONS } from "@workspace/ui/components/space-settings-dialog/companions.fixtures"
import { MembersPanel } from "@workspace/ui/components/space-settings-dialog/members-panel"

const SPACE_MENU = [
	"Space",
	"Members",
	"Secrets",
	"Skills",
	"Applications",
	"History",
	"Danger zone",
]

const MEMBERS = (
	<MembersPanel
		email=""
		isHosted
		members={[
			{
				id: "steve",
				name: "Steve",
				email: "steve@example.com",
				status: "host",
			},
			{
				id: "maya",
				name: "Maya Chen",
				email: "maya@example.com",
				status: "joined",
			},
		]}
		onEmailChange={fn()}
		onInvite={fn()}
		onInviteAgain={fn()}
		onRemove={fn()}
		onRemoveCancel={fn()}
		onRemoveConfirm={fn()}
		onWithdraw={fn()}
		space="Release desk"
	/>
)

const LINEAR_OPEN = {
	entry: "mcp",
	mcpServerToOpen: "linear",
	serverConnection: { state: "connected", onDisconnect: fn() },
} as const

const RAIL = <AppRail selected="conversations" user={{ name: "Ada Martin" }} />

const SpaceSettingsScreen =
	SettingsScreen as ComponentType<SpaceSettingsScreenProps>

const ScreenHost = (props: SpaceSettingsScreenProps) => {
	const [entry, setEntry] = useState(props.entry)

	return (
		<SpaceSettingsScreen
			{...props}
			entry={entry}
			onEntryChange={(next) => {
				setEntry(next)
				props.onEntryChange(next)
			}}
		/>
	)
}

const menuIn = () => screen.findByRole("navigation", { name: "Settings" })

const entryIn = (menu: HTMLElement, name: string) =>
	within(menu).getByRole("button", { name })

const menuNames = (menu: HTMLElement) =>
	within(menu)
		.getAllByRole("button")
		.map((button) => button.textContent)

const SPACE_ARGS = {
	target: "space",
	entry: "members",
	onEntryChange: fn(),
	onBack: fn(),
	rail: RAIL,
	presence: "up",
	value: { name: "Release desk", colour: "blue" },
	onValueChange: fn(),
	environment: SPACE_ENVIRONMENT,
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
	members: MEMBERS,
	onDelete: fn(),
} satisfies SpaceSettingsScreenProps

const meta = preview.meta({
	title: "Settings/Space/SettingsScreen",
	component: SpaceSettingsScreen,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A space's settings as a whole window instead of an overlay. The settings menu takes the place of the conversations panel: Back to conversations, the space's square and name, then its entries, Danger zone pinned at the foot. The content column draws the same panels the space settings dialog draws, centred under the entry's title. Applications opens onto the space's installed applications, one sub-entry each with its mark and connection dot, then Add an application.",
			},
		},
	},
	args: SPACE_ARGS,
	render: (args) => <ScreenHost {...args} />,
})

export const Members = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Artboard E2: the space's settings open on Members. Check the menu order with Danger zone pinned last, Members marked as the current page, the space square with its presence dot beside the name, the Members title above the panel, and that Back to conversations reports itself.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await expect(menuNames(menu)).toEqual([
			"Back to conversations",
			...SPACE_MENU,
		])
		await expect(entryIn(menu, "Members")).toHaveAttribute(
			"aria-current",
			"page",
		)
		await expect(within(menu).getByText("Release desk")).toBeVisible()
		await expect(within(menu).getByText("Space settings")).toBeVisible()
		await expect(slotIn(menu, "space-dot")).toHaveClass("size-9")
		await expect(slotIn(menu, "host-dot")).toHaveAttribute("data-host", "up")

		const main = screen.getByRole("main")
		await expect(
			within(main).getByRole("heading", { level: 2, name: "Members" }),
		).toBeVisible()
		await expect(within(main).getByText("Maya Chen")).toBeVisible()

		await userEvent.click(entryIn(menu, "Back to conversations"))
		await expect(args.onBack).toHaveBeenCalledOnce()
	},
})

export const MembersDark = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"`Members` in the dark theme. Check that the selected entry sits on the muted surface and the presence dot keeps its ring of the card.",
			},
		},
	},
})

export const Companions = meta.story({
	globals: { theme: "dark" },
	args: {
		entry: "companions",
		companions: {
			companions: SPACE_COMPANIONS,
			onSelect: fn(),
			onCreate: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H01: the space's settings open on Companions. Check that Companions follows Members with its count on the right, that the section draws its own title once, and that the cards sit two to a row in the 640 column.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await expect(menuNames(menu)).toEqual([
			"Back to conversations",
			"Space",
			"Members",
			"Companions4",
			...SPACE_MENU.slice(2),
		])
		const entry = entryIn(menu, "Companions 4")
		await expect(entry).toHaveAttribute("aria-current", "page")
		await expect(slotIn(entry, "settings-menu-count")).toHaveTextContent("4")

		const main = screen.getByRole("main")
		await expect(
			within(main).getAllByRole("heading", { level: 2 }),
		).toHaveLength(1)
		const cards = within(main).getAllByRole("button", {
			name: /Writer|Planner|Builder|Designer/,
		})
		await expect(cards).toHaveLength(4)
		await expect(cards[0].getBoundingClientRect().top).toBe(
			cards[1].getBoundingClientRect().top,
		)

		await userEvent.click(cards[0])
		await expect(args.companions?.onSelect).toHaveBeenCalledWith("juniper")
	},
})

export const LinearApplication = meta.story({
	args: LINEAR_OPEN,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard E3: Applications open on Linear. Check that each installed application is a sub-entry with its mark and a connection dot whose state is spoken, that Linear is the current page while Applications stays bold without the fill, that the column heads the application page with its mark, name and state, and that Add an application opens the catalogue and reports it.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		const linear = await within(menu).findByRole("button", {
			name: "Linear Connected",
		})
		await expect(linear).toHaveAttribute("aria-current", "page")
		await expect(
			entryIn(menu, "GitHub Needs authorization"),
		).not.toHaveAttribute("aria-current")
		await expect(entryIn(menu, "Applications")).not.toHaveAttribute(
			"aria-current",
		)
		await expect(entryIn(menu, "Applications")).toHaveAttribute("data-open")
		await expect(
			slotIn(
				entryIn(menu, "GitHub Needs authorization"),
				"settings-menu-connection",
			),
		).toHaveAttribute("data-connection", "needsAuthorization")

		const main = screen.getByRole("main")
		const name = within(main).getByRole("heading", {
			level: 2,
			name: "Linear",
		})
		await expect(name).toBeVisible()
		await expect(within(main).getAllByText("Linear")).toHaveLength(1)
		await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth)
		await expect(within(main).queryByRole("tab")).toBeNull()
		await expect(
			slotIn(main, "settings-screen-page").getBoundingClientRect().width,
		).toBe(560)

		await userEvent.click(entryIn(menu, "GitHub Needs authorization"))
		await expect(args.onMcpServerOpen).toHaveBeenLastCalledWith("github")
		await waitFor(() =>
			expect(
				within(main).getByRole("heading", { level: 2, name: "GitHub" }),
			).toBeVisible(),
		)

		await userEvent.click(entryIn(menu, "Add an application"))
		await expect(args.mcpCatalogue?.onOpen).toHaveBeenCalledOnce()
	},
})

export const BackToTheApplicationsList = meta.story({
	args: LINEAR_OPEN,
	parameters: {
		docs: {
			description: {
				story:
					"`LinearApplication`, then Applications pressed again. Check that the application page closes, the closing is reported, and Applications becomes the current page over the list.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await within(menu).findByRole("button", { name: "Linear Connected" })

		await userEvent.click(entryIn(menu, "Applications"))
		await expect(args.onMcpServerOpen).toHaveBeenLastCalledWith(null)
		await waitFor(() =>
			expect(entryIn(menu, "Applications")).toHaveAttribute(
				"aria-current",
				"page",
			),
		)
		await expect(
			within(screen.getByRole("main")).getByRole("heading", {
				level: 2,
				name: "Applications",
			}),
		).toBeVisible()
	},
})

export const LeavingUnsavedApplicationEdits = meta.story({
	args: LINEAR_OPEN,
	parameters: {
		docs: {
			description: {
				story:
					"`LinearApplication` with an edit not yet saved, then Members picked in the menu. Check that the screen asks with the dialog's own leave wording, that Cancel keeps the page, the edit and the menu selection, and that Leave goes to Members.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		const main = screen.getByRole("main")
		const linear = await within(menu).findByRole("button", {
			name: "Linear Connected",
		})
		const field = within(main).getByLabelText("Name")
		await userEvent.type(field, "-desk")

		await userEvent.click(entryIn(menu, "Members"))
		const question = await screen.findByRole("alertdialog", {
			name: "Leave without saving?",
		})
		await userEvent.click(
			within(question).getByRole("button", { name: "Cancel" }),
		)
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
		await expect(field).toHaveValue("linear-desk")
		await expect(linear).toHaveAttribute("aria-current", "page")
		await expect(entryIn(menu, "Members")).not.toHaveAttribute("aria-current")
		await expect(args.onEntryChange).not.toHaveBeenCalled()

		await userEvent.click(entryIn(menu, "Members"))
		await userEvent.click(
			within(
				await screen.findByRole("alertdialog", {
					name: "Leave without saving?",
				}),
			).getByRole("button", { name: "Leave" }),
		)
		await expect(args.onEntryChange).toHaveBeenLastCalledWith("members")
		await waitFor(() =>
			expect(entryIn(menu, "Members")).toHaveAttribute("aria-current", "page"),
		)
		await expect(
			within(main).getByRole("heading", { level: 2, name: "Members" }),
		).toBeVisible()
	},
})

export const LeavesASavedApplicationBehind = meta.story({
	args: LINEAR_OPEN,
	parameters: {
		docs: {
			description: {
				story:
					"`LinearApplication` with nothing unsaved, then Members, then Applications again. Check that leaving asks nothing and closes the application page, so Applications comes back on its list rather than on Linear.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const menu = await menuIn()
		await within(menu).findByRole("button", { name: "Linear Connected" })

		await userEvent.click(entryIn(menu, "Members"))
		await expect(screen.queryByRole("alertdialog")).toBeNull()
		await userEvent.click(entryIn(menu, "Applications"))

		const main = screen.getByRole("main")
		await waitFor(() =>
			expect(
				within(main).getByRole("heading", { level: 2, name: "Applications" }),
			).toBeVisible(),
		)
		await expect(entryIn(menu, "Applications")).toHaveAttribute(
			"aria-current",
			"page",
		)
		await expect(entryIn(menu, "Linear Connected")).not.toHaveAttribute(
			"aria-current",
		)
	},
})

export const JoinedSpace = meta.story({
	args: {
		entry: "space",
		value: { name: "Northwind" },
		host: "http://192.168.1.24:45367",
		onLeave: fn(),
		onDelete: undefined,
		presence: "down",
	},
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A space joined from another Kiroshi. Check that the Space page reads the host instead of offering fields, and that Danger zone leads to leaving the space rather than deleting it.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const menu = await menuIn()
		const main = screen.getByRole("main")
		await expect(within(main).getByLabelText("Host")).toHaveValue(
			"http://192.168.1.24:45367",
		)

		await userEvent.click(entryIn(menu, "Danger zone"))
		await expect(entryIn(menu, "Danger zone")).toHaveAttribute(
			"aria-current",
			"page",
		)
		await expect(
			within(main).getByRole("button", { name: "Leave space" }),
		).toBeVisible()
	},
})

export const ByKeyboard = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The menu driven from the keyboard. Check that Tab walks Back to conversations then each entry in order, each drawing the focus ring, and that Enter opens the focused entry.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		entryIn(menu, "Back to conversations").focus()

		await userEvent.tab()
		const space = entryIn(menu, "Space")
		await expect(space).toHaveFocus()
		await expect(getComputedStyle(space).boxShadow).not.toBe("none")

		await userEvent.tab()
		await userEvent.tab()
		await expect(entryIn(menu, "Secrets")).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onEntryChange).toHaveBeenLastCalledWith("environment")
		await expect(entryIn(menu, "Secrets")).toHaveAttribute(
			"aria-current",
			"page",
		)
	},
})

export const ShortWindow = meta.story({
	parameters: {
		viewport: {
			options: {
				short: { name: "Short", styles: { width: "1024px", height: "360px" } },
			},
		},
		docs: {
			description: {
				story:
					"A window too short for every entry. Check that the entries scroll inside the menu while Danger zone stays pinned and visible at its foot.",
			},
		},
	},
	globals: { viewport: { value: "short" } },
	play: async () => {
		const menu = await menuIn()
		const entries = slotIn(menu, "settings-menu-entries")
		await waitFor(() =>
			expect(entries.scrollHeight).toBeGreaterThan(entries.clientHeight),
		)
		const danger = entryIn(menu, "Danger zone").getBoundingClientRect()
		await expect(danger.bottom).toBeLessThanOrEqual(
			menu.getBoundingClientRect().bottom,
		)
		await expect(danger.top).toBeGreaterThanOrEqual(
			entries.getBoundingClientRect().bottom,
		)
	},
})

export const LongName = meta.story({
	args: {
		value: {
			name: "The quarterly release desk for every product line we ship",
			colour: "pink",
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A space name far wider than the menu. Check that it stays on one line, cut with an ellipsis, and the avatar keeps its size.",
			},
		},
	},
	play: async () => {
		const menu = await menuIn()
		const name = slotIn(menu, "settings-menu-name")
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(getComputedStyle(name).whiteSpace).toBe("nowrap")
		await expect(getComputedStyle(name).textOverflow).toBe("ellipsis")
		await expect(slotIn(menu, "space-dot").getBoundingClientRect().width).toBe(
			36,
		)
	},
})
