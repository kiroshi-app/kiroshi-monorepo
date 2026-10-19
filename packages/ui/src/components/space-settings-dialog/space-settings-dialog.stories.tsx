import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	contentBottomOf,
	expectSkeletonClippedAtBottomOf,
	FRAME_POLL,
	glyphIn,
	probedStyleOf,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { BLOT_TINTS } from "@workspace/ui/components/bot-settings"
import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"
import { BOT_MCP_SERVERS } from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import { SPACE_ENVIRONMENT } from "@workspace/ui/components/environment.fixtures"
import { Icons } from "@workspace/ui/components/icons"
import {
	endNotice,
	NoticeSurface,
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import { BOT_SKILLS } from "@workspace/ui/components/plugin-settings/skills.fixtures"
import {
	type SpaceHosting,
	SpaceSettingsDialog,
	type SpaceSettingsDialogProps,
	type SpaceSettingsValue,
} from "@workspace/ui/components/space-settings-dialog"
import { JoinedSpaceFields } from "@workspace/ui/components/space-settings-dialog/joined-space-fields"
import {
	type MembersFailure,
	MembersPanel,
	type MembersPanelProps,
	type SpaceMember,
} from "@workspace/ui/components/space-settings-dialog/members-panel"

const FILLED_SPACE: SpaceSettingsValue = {
	name: "Release desk",
	colour: "blue",
}

const DialogHost = (props: SpaceSettingsDialogProps) => {
	const [value, setValue] = useState(props.value)
	const [open, setOpen] = useState(props.open)

	return (
		<SpaceSettingsDialog
			{...props}
			onClose={() => {
				setOpen(false)
				props.onClose()
			}}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			open={open}
			value={value}
		/>
	)
}

const dialogIn = async () => {
	const dialog = await screen.findByRole("dialog")
	await waitFor(() => expect(dialog).toBeVisible())
	return dialog
}

const SPACE_ARGS = {
	open: true,
	value: FILLED_SPACE,
	onClose: fn(),
	onValueChange: fn(),
	environment: SPACE_ENVIRONMENT,
	onEnvironmentSet: fn(),
	onEnvironmentDelete: fn(),
	skills: BOT_SKILLS,
	onSkillCreate: fn(),
	onSkillChange: fn(),
	onSkillPreloadedChange: fn(),
	onSkillDelete: fn(),
	mcpServers: BOT_MCP_SERVERS,
	onMcpServerCreate: fn(),
	onMcpServerChange: fn(),
	onMcpServerDelete: fn(),
	history: {
		days: HISTORY_DAYS,
		oldestDate: HISTORY_OLDEST_DATE,
		onUndo: fn(),
	},
	onDelete: fn(),
}

const meta = preview.meta({
	title: "Settings/Space/SpaceSettingsDialog",
	component: SpaceSettingsDialog,
	parameters: {
		layout: "fullscreen",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"Everything a space is, in one overlay — the reader's own settings, told about a work area instead of a person. A breadcrumb heads it with the space's tint dot and its name, so the dialog is visibly the one that space opened. Down the left is a rail of five entries: the space itself, what it is called and the tint it wears; its secrets, the ones every companion in it starts with; its skills, the plugin every companion in it reads before answering; its applications, the ones every companion in it inherits; its history, everything ever written into that plugin. Below a separator sits the danger zone, set apart in destructive tone exactly as a companion's settings sets it apart, because a space takes its companions with it. It opens on the space every time. Same contract as a companion's settings and for the same reason: fully controlled, saving as you type, no draft, no debounce — closing it is never a question, except while a skill or an application is half written.",
			},
		},
	},
	args: SPACE_ARGS,
	render: (args) => <DialogHost {...args} />,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The dialog as it opens on a named space. Check that it lands on the space entry with the name in reach, that the breadcrumb wears the space's tint as a dot and names it, that typing reports the edited name with the tint unchanged, and that picking a swatch reports the tint with the name unchanged. Pick `Skills` and `History` for the space's own plugin, `Danger` for the way out, `LastSpace` for the space that cannot be deleted.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		await expect(dialog).toHaveAccessibleName("Release desk Settings")
		await expect(slotsIn(dialog, "space-tint")).toHaveLength(
			BLOT_TINTS.length + 2,
		)

		const space = within(dialog).getByRole("tab", { name: "Space" })
		await expect(space).toHaveAttribute("aria-selected", "true")

		const name = within(dialog).getByLabelText("Name")
		await userEvent.type(name, "!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk!",
			colour: "blue",
		})

		await userEvent.click(within(dialog).getByRole("radio", { name: "Pink" }))
		await expect(args.onValueChange).toHaveBeenLastCalledWith({
			name: "Release desk!",
			colour: "pink",
		})
	},
})

export const Transfer = meta.story({
	args: {
		onExport: fn(),
		onImport: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The space tab once the host can move a space between machines: Export this space and Import a space sit under the fields, each firing its own callback. Check that each button reports only its own action, by pointer and by keyboard, and that a dialog given neither callback draws the tab as `Default` does.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const exportSpace = within(dialog).getByRole("button", {
			name: "Export this space",
		})
		const importSpace = within(dialog).getByRole("button", {
			name: "Import a space",
		})

		await userEvent.click(exportSpace)
		await expect(args.onExport).toHaveBeenCalledOnce()
		await expect(args.onImport).not.toHaveBeenCalled()

		await userEvent.click(importSpace)
		await expect(args.onImport).toHaveBeenCalledOnce()
		await expect(args.onExport).toHaveBeenCalledOnce()

		importSpace.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onImport).toHaveBeenCalledTimes(2)
		await expect(args.onExport).toHaveBeenCalledOnce()
	},
})

export const Environment = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The secrets the space hands to every companion in it — the same panel a companion's settings draws, read at space scope, so each name is the space's own and every one of them can be replaced or removed here. A name a companion redefines is still listed, marked as served from the companion, because the space is where it was written even when it is not the value that runs. Check that adding a name reports it, and that the panel never shows a value back.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(within(dialog).getByRole("tab", { name: "Secrets" }))
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Secrets",
		})

		await expect(within(panel).getByText("ATLAS_TOKEN")).toBeVisible()
		await expect(
			within(panel).getByText("Overridden by Companion"),
		).toBeVisible()

		await userEvent.click(
			within(panel).getByRole("button", { name: "Add secret" }),
		)
		const write = await screen.findByRole("dialog", {
			name: "Add a secret",
		})
		await waitFor(async () => {
			await expect(write.contains(document.activeElement)).toBe(true)
		}, FRAME_POLL)

		await userEvent.type(within(write).getByLabelText("Name"), "RELEASE_DESK")
		await userEvent.type(within(write).getByLabelText("Value"), "sk-live")
		await userEvent.click(
			within(write).getByRole("button", { name: "Save secret" }),
		)

		await expect(args.onEnvironmentSet).toHaveBeenCalledWith({
			name: "RELEASE_DESK",
			value: "sk-live",
		})
	},
})

export const EnvironmentLoading = meta.story({
	args: { environment: [], isEnvironmentPending: true },
	parameters: {
		docs: {
			description: {
				story:
					"The space's secrets still on their way, the flag forwarded from the dialog to the Secrets panel. Check that the head line and Add secret stay put and that secret row skeletons fill the panel below them to the bottom, the last one cut by the edge, while the region reads busy. Pick `Environment` for the panel once the secrets are read.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(within(dialog).getByRole("tab", { name: "Secrets" }))
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Secrets",
		})

		await expect(
			within(panel).getByRole("button", { name: "Add secret" }),
		).toBeVisible()
		await expect(slotIn(panel, "secrets-pending")).toHaveAttribute(
			"aria-busy",
			"true",
		)
		await expectSkeletonClippedAtBottomOf(panel)
	},
})

export const Skills = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The skills of the space's own plugin — the same panel a companion's settings draws, on the plugin every companion in the space reads before it answers. Check that opening one swaps the whole body for the editor, and that the way back restores the rail on the space entry, as the reader's own dialog does after the same trip.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(within(dialog).getByRole("tab", { name: "Skills" }))
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Skills",
		})

		await userEvent.click(
			within(panel).getByRole("button", { name: /release-notes/ }),
		)
		const back = within(dialog).getByRole("button", { name: "All skills" })
		await expect(back).toBeVisible()

		await userEvent.click(back)
		await expect(
			within(dialog).getByRole("tab", { name: "Skills" }),
		).toBeVisible()
	},
})

export const McpServers = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The servers the space declares, inherited by every companion in it \u2014 the same panel and the same editor a companion\u2019s settings draws, written into the space plugin instead of a companion bundle. A companion that declares a server of the same name wins for itself and leaves this one where it is. Check that opening one swaps the whole body for the editor, and that the way back restores the rail. Pick `McpServersUnavailable` for the listing that could not be read.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Applications" }),
		)
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Applications",
		})

		await userEvent.click(within(panel).getByRole("button", { name: /atlas/ }))
		const back = within(dialog).getByRole("button", {
			name: "All applications",
		})
		await expect(back).toBeVisible()

		await userEvent.click(back)
		await expect(
			within(dialog).getByRole("tab", { name: "Applications" }),
		).toBeVisible()
	},
})

export const OpensOnAnApplication = meta.story({
	args: { tab: "mcp", mcpServerToOpen: "atlas" },
	parameters: {
		docs: {
			description: {
				story:
					"A host that asks for one application of the space: the dialog opens on Applications with the editor of that application pushed over the panel. Check that the way back lands on the panel. Pick `McpServers` for the dialog opened by hand.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		const back = await within(dialog).findByRole("button", {
			name: "All applications",
		})
		await expect(back).toBeVisible()

		await userEvent.click(back)
		await expect(
			await within(dialog).findByRole("tabpanel", { name: "Applications" }),
		).toBeVisible()
	},
})

export const McpServersUnavailable = meta.story({
	args: { haveMcpServersFailedToLoad: true },
	parameters: {
		docs: {
			description: {
				story:
					"The space plugin could not be read. Check that the panel says so instead of inviting a first server, because an empty list and an unreadable one are not the same fact.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Applications" }),
		)
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Applications",
		})

		await expect(
			within(panel).getByText(
				"Couldn’t load applications. Reopen settings to retry.",
			),
		).toBeVisible()
		await expect(
			within(panel).queryByRole("button", { name: "Add an application" }),
		).toBe(null)
	},
})

export const History = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Everything ever written into the space's plugin, newest first, whoever wrote it. Check that a change the reader made is signed You and one a companion made is signed generically — the space holds many companions, so the entry names none of them — and that asking for the changes of an entry calls back for its diff.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(within(dialog).getByRole("tab", { name: "History" }))
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "History",
		})

		await expect(within(panel).getAllByText("You").length).toBeGreaterThan(0)
		await expect(
			within(panel).getAllByText("A companion").length,
		).toBeGreaterThan(0)
		await expect(within(panel).getAllByRole("listitem")).toHaveLength(6)
	},
})

export const Danger = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The last rail entry, held apart from the other three by a separator and painted in the destructive tone so it is never picked by accident. Check that the entry is reachable by keyboard like any other, that the question names the space rather than asking `Are you sure?`, and that `onDelete` fires once the reader presses through — the dialog deletes nothing itself and does not close on its own. Pick `LastSpace` for the space that refuses to go.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Danger zone" }),
		)
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Danger zone",
		})

		await userEvent.click(
			within(panel).getByRole("button", { name: "Delete space" }),
		)
		const popup = await screen.findByRole("alertdialog")
		await expect(popup).toHaveTextContent("Delete Release desk?")

		await userEvent.click(
			within(popup).getByRole("button", { name: "Delete space" }),
		)
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})

export const LastSpace = meta.story({
	args: { isDeletable: false },
	parameters: {
		docs: {
			description: {
				story:
					"The only space the reader owns, where deletion is refused. Check that the entry is still there and the control still shown, disabled rather than hidden, that the block states why in place of the consequence, and that pressing it opens no question and reports nothing — the refusal is a fact about the app, not an error the reader made. Pick `Danger` for the space that can go.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()

		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Danger zone" }),
		)
		const panel = await within(dialog).findByRole("tabpanel", {
			name: "Danger zone",
		})
		const trigger = within(panel).getByRole("button", { name: "Delete space" })

		await expect(trigger).toBeDisabled()

		fireEvent.click(trigger)
		await expect(screen.queryByRole("alertdialog")).toBe(null)
		await expect(args.onDelete).not.toHaveBeenCalled()
	},
})

const STEVE: SpaceMember = {
	id: "steve",
	name: "Steve",
	email: "steve@example.com",
	status: "host",
}

const INVITE_HINT =
	"Kiroshi emails them an invitation. It works once, for 7 days."

const MEMBERS_PANEL = {
	space: "Personal",
	members: [STEVE],
	email: "",
	onEmailChange: fn(),
	onInvite: fn(),
	isHosted: true,
	onRemove: fn(),
	onWithdraw: fn(),
	onRemoveConfirm: fn(),
	onRemoveCancel: fn(),
} satisfies MembersPanelProps

const JOINED_SPACE: SpaceSettingsValue = { name: "Northwind" }

const JOINED_HOST = "http://192.168.1.24:45367"

const JOINED_HINT = "This space lives on another Kiroshi."

const LEAVE_DESCRIPTION =
	"Nothing is deleted on the host. You can join again with a new invitation."

const RAIL = [
	"Space",
	"Members",
	"Secrets",
	"Skills",
	"Applications",
	"History",
	"Danger zone",
]

const JOINED_ARGS = {
	value: JOINED_SPACE,
	host: JOINED_HOST,
	onLeave: fn(),
	onDelete: undefined,
}

const leaveIn = async (dialog: HTMLElement) => {
	await within(dialog).findByRole("tab", { name: "Danger zone" })
	const panel = await within(dialog).findByRole("tabpanel", {
		name: "Danger zone",
	})
	return within(panel).getByRole("button", { name: "Leave space" })
}

const leaveConfirmation = async () => {
	const popup = await screen.findByRole("alertdialog")
	await waitFor(() => expect(popup).toBeVisible())
	return popup
}

export const JoinedSpace = meta.story({
	args: {
		...JOINED_ARGS,
		members: <MembersPanel {...MEMBERS_PANEL} space={JOINED_SPACE.name} />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A space joined from another Kiroshi, artboard J10. Its rail is the local one, Members included, and the Members panel is the one a local space shows. Its name reads as plain text under its label, a member cannot rename it; the host it lives on is read-only, its hint saying the space lives there. It has no colour, no share link and nothing to export or import: the props type refuses them once a host is set. The danger zone offers Leave space and no Delete. Pick `JoinedDanger` for the way out, `JoinedThemes` for both panels in light and dark.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await dialogIn()
		await expect(
			within(dialog)
				.getAllByRole("tab")
				.map((tab) => tab.textContent),
		).toEqual(RAIL)

		const label = within(dialog).getByRole("term")
		await expect(label).toHaveTextContent(/^Name$/)
		const name = within(dialog).getByRole("definition")
		await expect(name.previousElementSibling).toBe(label)
		await expect(name).toBeVisible()
		await expect(name).toHaveTextContent(/^Northwind$/)
		await expect(
			within(dialog).queryByRole("textbox", { name: "Name" }),
		).toBeNull()
		await expect(
			within(dialog).queryByDisplayValue(JOINED_SPACE.name),
		).toBeNull()

		const host = within(dialog).getByLabelText("Host")
		await expect(host).toHaveValue(JOINED_HOST)
		await expect(host).toHaveAttribute("readonly")
		await expect(host).toHaveAccessibleDescription(JOINED_HINT)

		await expect(within(dialog).queryByRole("radio")).toBe(null)
		await expect(within(dialog).queryByText("Colour")).toBe(null)
		await expect(within(dialog).queryByLabelText("Share link")).toBe(null)
		await expect(
			within(dialog).queryByRole("button", { name: "Export this space" }),
		).toBe(null)
		await expect(
			within(dialog).queryByRole("button", { name: "Import a space" }),
		).toBe(null)

		await userEvent.click(within(dialog).getByRole("tab", { name: "Members" }))
		const members = await membersPanelIn()
		await expect(inviteFieldIn(members)).toBeVisible()
		await expect(memberRowsIn(members)).toEqual([
			["S", "Steve", "steve@example.com", "Host"],
		])

		await userEvent.click(
			within(dialog).getByRole("tab", { name: "Danger zone" }),
		)
		const danger = await within(dialog).findByRole("tabpanel", {
			name: "Danger zone",
		})
		await expect(
			within(danger).getByRole("button", { name: "Leave space" }),
		).toBeVisible()
		await expect(
			within(danger).queryByRole("button", { name: "Delete space" }),
		).toBe(null)
	},
})

export const JoinedDanger = meta.story({
	args: { ...JOINED_ARGS, tab: "danger" },
	parameters: {
		docs: {
			description: {
				story:
					"The danger zone of a joined space, artboard J12: one block on the geometry of the local Delete block, saying what leaving keeps on the host, and a destructive Leave space button led by the leave glyph. There is no Delete block, the space is not this machine's to delete. Pressing it asks J4, naming the space, Cancel first. Check that cancelling reports nothing and that confirming reports `onLeave` once. Pick `Danger` for the local space.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const leave = await leaveIn(dialog)
		const panel = within(dialog).getByRole("tabpanel", { name: "Danger zone" })

		await expect(
			within(panel).queryByRole("button", { name: "Delete space" }),
		).toBe(null)
		await expect(panel).toHaveTextContent(LEAVE_DESCRIPTION)
		await expect(glyphIn(leave, Icons.Leave)).not.toBe(null)

		await userEvent.click(leave)
		const asked = await leaveConfirmation()
		await expect(
			within(asked).getByRole("heading", { name: "Leave Northwind?" }),
		).toBeVisible()
		await expect(asked).toHaveTextContent(LEAVE_DESCRIPTION)
		await expect(
			within(asked)
				.getAllByRole("button")
				.map((button) => button.textContent),
		).toEqual(["Cancel", "Leave space"])

		await userEvent.click(within(asked).getByRole("button", { name: "Cancel" }))
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onLeave).not.toHaveBeenCalled()

		await userEvent.click(leave)
		const confirmed = await leaveConfirmation()
		await userEvent.click(
			within(confirmed).getByRole("button", { name: "Leave space" }),
		)
		await expect(args.onLeave).toHaveBeenCalledOnce()
	},
})

const JoinedPanels = () => {
	const { t } = useTranslation("common")

	return (
		<div className="flex flex-col gap-5">
			<JoinedSpaceFields host={JOINED_HOST} value={JOINED_SPACE} />
			<DangerZone
				confirmTitle={t("spaces.leave.title", { name: JOINED_SPACE.name })}
				actionLabel={t("spaces.leave.action")}
				description={t("spaces.leave.description")}
				icon="Leave"
				onConfirm={fn()}
			/>
		</div>
	)
}

export const JoinedThemes = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				story:
					"Both joined panels, the Space tab over the Danger zone, in light and dark side by side as artboard J11 lays them. Name is plain `foreground` text with no field box. The read-only Host keeps the box of an editable field, a 1px `input` outline at 14px / 20px inside 8px block and 12px inline padding, with the `muted` fill dropped. The hint sits under Host at 12px / 16px in `muted-foreground`.",
			},
		},
	},
	render: () => <JoinedPanels />,
	play: async ({ canvasElement }) => {
		const columns = slotsIn(canvasElement, "joined-space-fields")
		await expect(columns).toHaveLength(2)

		for (const fields of columns) {
			const theme = fields.parentElement?.parentElement ?? canvasElement
			const name = within(fields).getByRole("definition")
			await expect(getComputedStyle(name).backgroundColor).toBe(
				"rgba(0, 0, 0, 0)",
			)
			await expect(getComputedStyle(name).color).toBe(
				probedStyleOf("text-foreground", "color", theme),
			)

			const style = getComputedStyle(within(fields).getByLabelText("Host"))
			await expect(style.borderTopWidth).toBe("1px")
			await expect(style.borderTopColor).toBe(
				probedStyleOf("border-input", "borderTopColor", theme),
			)
			await expect(style.paddingBlockStart).toBe("8px")
			await expect(style.paddingInlineStart).toBe("12px")
			await expect(style.fontSize).toBe("14px")
			await expect(style.lineHeight).toBe("20px")
			await expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)")

			const hint = within(fields).getByText(JOINED_HINT)
			await expect(getComputedStyle(hint).fontSize).toBe("12px")
			await expect(getComputedStyle(hint).lineHeight).toBe("16px")

			const zone = slotIn(theme, "danger-zone")
			await expect(
				within(zone).getByRole("button", { name: "Leave space" }),
			).toBeEnabled()
		}
	},
})

const SHARE_ARGS = {
	hosting: "off",
	onHost: fn(),
	onStopHosting: fn(),
	onSignIn: fn(),
} as const

const questionIn = async (title: string) => {
	const popup = await screen.findByRole("alertdialog")
	await waitFor(() => expect(popup).toBeVisible())
	await expect(
		within(popup).getByRole("heading", { name: title }),
	).toBeVisible()
	return popup
}

const ShareFailureNotice = () => {
	const { t } = useTranslation("settings")

	useEffect(() => {
		const notice = raiseFailureNotice({
			title: t("space.hosting.failed.title", { name: STUDIO }),
			description: t("space.hosting.failed.description"),
		})
		return () => endNotice(notice)
	}, [t])

	return null
}

const SAM_PENDING: SpaceMember = {
	id: "sam",
	email: "sam@example.com",
	status: "pending",
	expiresInDays: 6,
}

const SAM_PENDING_ROW = ["sam@example.com", "Invited · expires in 6 days"]

const STEVE_ROW = ["S", "Steve", "steve@example.com", "Host"]

const NOA: SpaceMember = {
	id: "noa",
	name: "Noa",
	email: "noa@example.com",
	status: "host",
}

const MAYA_FINGERPRINT = "orbit velvet canal fossil ripple mango"

const MAYA: SpaceMember = {
	id: "maya",
	name: "Maya",
	email: "maya@example.com",
	status: "joined",
	fingerprint: MAYA_FINGERPRINT,
}

const TOM_PENDING: SpaceMember = {
	id: "tom",
	email: "tom@example.com",
	status: "pending",
	expiresInDays: 6,
}

const SAM_EXPIRED: SpaceMember = {
	id: "sam-expired",
	email: "sam@example.com",
	status: "expired",
	sentAt: new Date(2026, 9, 9).getTime(),
}

const NOA_ROW = ["N", "Noa", "noa@example.com", "Host"]

const MAYA_ROW = ["M", "Maya", "maya@example.com", MAYA_FINGERPRINT]

const TOM_ROW = ["tom@example.com", "Invited · expires in 6 days"]

const SAM_EXPIRED_ROW = [
	"sam@example.com",
	"Sent October 9, not used",
	"Expired",
]

const STUDIO = "Studio"

const LEA: SpaceMember = {
	id: "lea",
	name: "Lea",
	email: "lea@example.com",
	status: "joined",
}

const SAM_CARTER: SpaceMember = {
	id: "sam",
	name: "Sam Carter",
	email: "sam@example.com",
	status: "joined",
}

const membersArgs = (
	panel: Partial<MembersPanelProps> = {},
	hosting: SpaceHosting = panel.isHosted === false ? "off" : "online",
) => {
	const props = { ...MEMBERS_PANEL, ...panel }

	return {
		...SHARE_ARGS,
		tab: "members",
		value: { name: props.space, colour: "blue" },
		hosting,
		members: <MembersPanel {...props} />,
	} as const
}

const membersPanelIn = async () => {
	const dialog = await screen.findByRole("dialog", { name: /Settings$/ })
	await waitFor(() => expect(dialog).toBeVisible())
	return within(dialog).findByRole("tabpanel", { name: "Members" })
}

const memberRowsIn = (panel: HTMLElement) =>
	slotsIn(panel, "space-member").map((row) =>
		within(row)
			.getAllByText(/./)
			.map((text) => text.textContent),
	)

const inviteFieldIn = (panel: HTMLElement) =>
	within(panel).getByRole("textbox", { name: "Invite people" })

const listNamed = (panel: HTMLElement, name: string) =>
	within(panel).getByRole("list", { name })

const expectRefusal = async (panel: HTMLElement, message: string) => {
	const field = inviteFieldIn(panel)
	await expect(field).toHaveAttribute("aria-invalid", "true")
	await expect(field).toHaveAccessibleDescription(message)
	await expect(filledRegionIn(slotIn(panel, "members-panel")).textContent).toBe(
		message,
	)
	await expect(getComputedStyle(field).borderTopColor).toBe(
		probedStyleOf("border-destructive", "borderTopColor", panel),
	)
	await expect(getComputedStyle(field).boxShadow).toContain(
		probedStyleOf("text-destructive/20", "color", panel),
	)
	await expect(panel).not.toHaveTextContent(INVITE_HINT)
}

export const MembersI1 = meta.story({
	args: membersArgs(),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard I1. The Members tab of a hosted space: an empty invite field with Invite disabled, then the Members list holding only the reader, tagged Host with no action. With no invitation pending or expired, the Invitations section and its label are gone.",
			},
		},
	},
	play: async () => {
		const panel = await membersPanelIn()
		await expect(
			within(panel).getByRole("button", { name: "Invite" }),
		).toBeDisabled()
		await expect(inviteFieldIn(panel)).toHaveAccessibleDescription(INVITE_HINT)
		await expect(memberRowsIn(panel)).toEqual([STEVE_ROW])
		await expect(within(panel).queryByText("Invitations")).toBeNull()
		await expect(slotsIn(panel, "members-section")).toHaveLength(1)
	},
})

export const MembersLoading = meta.story({
	args: membersArgs({ members: [], isPending: true }),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 1.8. The member list still on its way. Check that the invite form stays rendered, that no Invitations section shows, that member row skeletons of three bars (10px name, 8px email, 8px fingerprint) sit inside one bordered frame under the Members label, filling the panel to the bottom, the last one cut by the edge, each at the height of a loaded member row with its fingerprint and divider, and that the panel reads busy.",
			},
		},
	},
	play: async () => {
		const panel = await membersPanelIn()
		await expect(inviteFieldIn(panel)).toBeVisible()
		await expect(slotIn(panel, "members-panel")).toHaveAttribute(
			"aria-busy",
			"true",
		)

		const frame = await waitFor(() => slotIn(panel, "members-skeleton-frame"))
		const list = await expectSkeletonClippedAtBottomOf(frame)
		await expect(
			Math.abs(frame.getBoundingClientRect().bottom - contentBottomOf(panel)),
		).toBeLessThan(1)
		const [firstRow] = slotsIn(list, "list-skeleton-row")
		await expect(firstRow?.getBoundingClientRect().height).toBe(71)
		const bars = [...firstRow.querySelectorAll("[data-slot=skeleton]")]
		await expect(bars.map((bar) => bar.getBoundingClientRect().height)).toEqual(
			[28, 10, 8, 8],
		)
		await expect(slotsIn(panel, "space-member")).toHaveLength(0)
		await expect(within(panel).queryByText("Invitations")).toBeNull()
		await expect(within(panel).getByText("Members")).toBeVisible()
	},
})

export const MembersI2 = meta.story({
	args: membersArgs({ email: "sam@example.com" }),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard I2. The field holds an address and has focus, wearing the input focus ring, and Invite is enabled. Check that Enter and Invite both report `onInvite` with the typed address.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const panel = await membersPanelIn()
		const field = inviteFieldIn(panel)
		const invite = within(panel).getByRole("button", { name: "Invite" })
		await expect(invite).toBeEnabled()

		await userEvent.click(invite)
		await expect(MEMBERS_PANEL.onInvite).toHaveBeenLastCalledWith(
			"sam@example.com",
		)
		await userEvent.type(field, "{Enter}")
		await expect(MEMBERS_PANEL.onInvite).toHaveBeenCalledTimes(2)
		await expect(MEMBERS_PANEL.onInvite).toHaveBeenLastCalledWith(
			"sam@example.com",
		)
		await expect(field).toHaveFocus()
	},
})

export const MembersI3 = meta.story({
	args: membersArgs({ members: [STEVE, SAM_PENDING] }),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard I3. Sam was invited: the field is empty again and Sam's invitation opens the Invitations section above Members, a dashed avatar with the mail glyph, the address on the name line and when it expires under it.",
			},
		},
	},
	play: async () => {
		const panel = await membersPanelIn()
		await expect(memberRowsIn(panel)).toEqual([SAM_PENDING_ROW, STEVE_ROW])
		const [pending] = slotsIn(panel, "space-member")
		await expect(glyphIn(pending, Icons.Mail)).not.toBe(null)
		await expect(
			within(listNamed(panel, "Invitations")).getAllByRole("listitem"),
		).toEqual([pending])
	},
})

export const MembersI4 = meta.story({
	args: membersArgs({ members: [STEVE, SAM_CARTER] }),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard I4. Sam accepted: the row shows the name over the address and a one-letter avatar, its trash action lined up with the Host row's empty slot above it.",
			},
		},
	},
	play: async () => {
		const panel = await membersPanelIn()
		await expect(memberRowsIn(panel)).toEqual([
			STEVE_ROW,
			["S", "Sam Carter", "sam@example.com"],
		])
		const [host, joined] = slotsIn(panel, "space-member")
		const remove = within(joined).getByRole("button", {
			name: "Remove Sam Carter",
		})
		await expect(remove).toHaveTextContent("")
		await expect(glyphIn(remove, Icons.Delete)).not.toBe(null)
		await expect(
			(host.lastElementChild as HTMLElement).getBoundingClientRect().right,
		).toBe(remove.getBoundingClientRect().right)
	},
})

export const MembersWithdrawPending = meta.story({
	tags: ["test-only"],
	args: membersArgs({ members: [STEVE, SAM_PENDING] }),
	play: async ({ userEvent }) => {
		const panel = await membersPanelIn()
		const withdraw = within(panel).getByRole("button", {
			name: "Withdraw the invitation to sam@example.com",
		})
		await userEvent.click(withdraw)
		await expect(MEMBERS_PANEL.onWithdraw).toHaveBeenCalledOnce()
		await expect(MEMBERS_PANEL.onWithdraw).toHaveBeenCalledWith(SAM_PENDING)
		await expect(MEMBERS_PANEL.onRemove).not.toHaveBeenCalled()
		await expect(screen.queryByRole("alertdialog")).toBe(null)
	},
})

const WithdrawnNotice = () => {
	const { t } = useTranslation("settings")

	useEffect(() => {
		const notice = raiseTransientNotice({
			title: t("space.members.withdrawn", { email: SAM_PENDING.email }),
		})
		return () => endNotice(notice)
	}, [t])

	return null
}

export const MembersI5 = meta.story({
	args: membersArgs(),
	decorators: [
		(Story) => (
			<>
				<Story />
				<NoticeSurface transientDelay={0} />
				<WithdrawnNotice />
			</>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"Artboard I5. Sam's invitation is withdrawn: the list is back to I1 and a success notice names the address. The app raises it with `raiseTransientNotice` and the catalogue's `space.members.withdrawn` copy; the story holds it open.",
			},
		},
	},
	play: async () => {
		const panel = await membersPanelIn()
		await expect(memberRowsIn(panel)).toHaveLength(1)
		const title = await waitFor(() => slotIn(document.body, "toast-title"))
		await expect(title).toHaveTextContent(
			"Invitation to sam@example.com withdrawn",
		)
	},
})

export const MembersRemoveConfirm = meta.story({
	args: membersArgs({
		space: STUDIO,
		members: [NOA, MAYA, TOM_PENDING],
		removing: MAYA,
	}),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 5.4. Remove on a Joined row asks first, naming the member and the space, with Remove in the destructive style. The app opens the question by passing the member as `removing`; Cancel reports `onRemoveCancel` and Remove `onRemoveConfirm`.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const popup = await questionIn("Remove Maya from Studio?")
		await expect(popup).toHaveTextContent(
			"Maya loses access right away. You can invite Maya again.",
		)
		await expect(
			within(popup)
				.getAllByRole("button")
				.map((button) => button.textContent),
		).toEqual(["Cancel", "Remove"])
		const remove = within(popup).getByRole("button", { name: "Remove" })
		await expect(getComputedStyle(remove).color).toBe(
			probedStyleOf("text-destructive", "color", popup),
		)
		await userEvent.click(remove)
		await expect(MEMBERS_PANEL.onRemoveConfirm).toHaveBeenCalledOnce()
		await expect(MEMBERS_PANEL.onRemoveCancel).not.toHaveBeenCalled()

		await userEvent.click(within(popup).getByRole("button", { name: "Cancel" }))
		await expect(MEMBERS_PANEL.onRemoveCancel).toHaveBeenCalledOnce()
		await expect(MEMBERS_PANEL.onRemoveConfirm).toHaveBeenCalledOnce()
	},
})

export const MembersI7 = meta.story({
	args: membersArgs({
		space: STUDIO,
		members: [NOA, MAYA, TOM_PENDING],
		email: "tom@example.com",
		refusal: "invited",
	}),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard I7. The address is already invited: the field turns destructive, border and ring, and the helper becomes the refusal, read as the field's description and announced through its status region. It is a state of the field, not a row.",
			},
		},
	},
	play: async () => {
		await expectRefusal(
			await membersPanelIn(),
			"tom@example.com is already invited.",
		)
	},
})

export const MembersI8 = meta.story({
	args: membersArgs({
		members: [STEVE, SAM_PENDING],
		email: "steve@example.com",
		refusal: "self",
	}),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard I8. The reader typed their own address: same destructive field, the refusal says it is their own account.",
			},
		},
	},
	play: async () => {
		await expectRefusal(await membersPanelIn(), "That’s your own account.")
	},
})

export const MembersI9 = meta.story({
	args: membersArgs({
		members: [STEVE, SAM_PENDING],
		email: "sam",
		refusal: "malformed",
	}),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard I9. The text is not an address: same destructive field, the refusal shows the expected shape.",
			},
		},
	},
	play: async () => {
		await expectRefusal(
			await membersPanelIn(),
			"Enter an email address, like sam@example.com.",
		)
	},
})

const filledRegionIn = (panel: HTMLElement) => {
	const [line, ...others] = within(panel)
		.getAllByRole("status")
		.filter((region) => region.textContent)
	if (!line || others.length > 0) {
		throw new Error("Expected exactly one filled failure region")
	}
	return line
}

const failureLineIn = async (panel: HTMLElement, message: string) => {
	const line = filledRegionIn(slotIn(panel, "members-panel"))
	await expect(line.textContent).toBe(message)
	await expect(getComputedStyle(line).color).toBe(
		probedStyleOf("text-destructive", "color", panel),
	)
	return line
}

const expectInRowAlone = async (
	panel: HTMLElement,
	line: HTMLElement,
	name: string,
) => {
	const rows = slotsIn(panel, "space-member")
	const failed = rows.filter((row) => row.contains(line))
	await expect(failed).toHaveLength(1)
	for (const row of rows.filter((row) => !row.contains(line))) {
		await expect(within(row).getByRole("status")).toBeEmptyDOMElement()
	}
	const nameBox = within(failed[0])
		.getByText(name, { selector: "p" })
		.getBoundingClientRect()
	const lineBox = line.getBoundingClientRect()
	await expect(lineBox.left).toBe(nameBox.left)
	await expect(lineBox.top).toBeGreaterThanOrEqual(nameBox.bottom)
	await expect(inviteFieldIn(panel)).toHaveAccessibleDescription(INVITE_HINT)
}

const EditableMembersPanel = (props: MembersPanelProps) => {
	const [email, setEmail] = useState(props.email)

	return <MembersPanel {...props} email={email} onEmailChange={setEmail} />
}

export const MembersInviteFailed = meta.story({
	args: {
		...membersArgs(),
		members: (
			<EditableMembersPanel
				{...MEMBERS_PANEL}
				email="sam@example.com"
				failure={{
					action: "invite",
					reason: "generic",
					email: "sam@example.com",
				}}
			/>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Kiroshi could not invite the address. The field turns invalid like a refusal, border and ring, and the line takes the helper's place under it, announced once. The app passes `failure` with the action and a reason; `MembersFailureCopy` lists every reason.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const panel = await membersPanelIn()
		const message =
			"Couldn’t invite sam@example.com. Nothing changed, try again."
		const line = await failureLineIn(panel, message)
		const field = inviteFieldIn(panel)
		await expectRefusal(panel, message)
		await expect(line.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			field.getBoundingClientRect().bottom,
		)
		await expect(line.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			within(panel).getByRole("list").getBoundingClientRect().top,
		)

		await userEvent.type(field, ".org")
		await expect(field).toHaveValue("sam@example.com.org")
		await expect(line.textContent).toBe(message)

		await userEvent.click(within(panel).getByRole("button", { name: "Invite" }))
		await expect(line).toBeEmptyDOMElement()
		await expect(field).toHaveAccessibleDescription(INVITE_HINT)
		await expect(field).not.toHaveAttribute("aria-invalid")
	},
})

export const MembersWithdrawFailed = meta.story({
	args: membersArgs({
		members: [STEVE, SAM_PENDING],
		failure: { action: "withdraw", reason: "generic", member: SAM_PENDING },
	}),
	parameters: {
		docs: {
			description: {
				story:
					"Kiroshi could not withdraw Sam's invitation. One destructive line sits in Sam's row, under the address, announced once; Sam stays Pending.",
			},
		},
	},
	play: async () => {
		const panel = await membersPanelIn()
		const line = await failureLineIn(
			panel,
			"Couldn’t withdraw the invitation to sam@example.com. Nothing changed, try again.",
		)
		await expectInRowAlone(panel, line, "sam@example.com")
	},
})

const ALEX: SpaceMember = {
	id: "alex",
	name: "Alex Moreau",
	email: "alex@example.com",
	status: "joined",
}

const JO_PENDING: SpaceMember = {
	id: "jo",
	email: "jo@example.com",
	status: "pending",
}

export const MembersRemoveFailed = meta.story({
	args: membersArgs({
		members: [STEVE, ALEX, SAM_CARTER, JO_PENDING],
		failure: { action: "remove", reason: "generic", member: SAM_CARTER },
	}),
	parameters: {
		docs: {
			description: {
				story:
					"Kiroshi could not remove Sam, in the middle of the list. One destructive line sits in Sam's row, under the name and address, announced once; Sam stays Joined and in place, and no other row carries a line.",
			},
		},
	},
	play: async () => {
		const panel = await membersPanelIn()
		const line = await failureLineIn(
			panel,
			"Couldn’t remove Sam Carter. Nothing changed, try again.",
		)
		await expect(
			slotsIn(panel, "space-member").findIndex((row) => row.contains(line)),
		).toBe(3)
		await expectInRowAlone(panel, line, "Sam Carter")
	},
})

const LONG_EMAIL =
	"maximiliana.konstantinopoulou-vanderberghe@example-long-domain.com"

const LONG_MEMBER: SpaceMember = {
	id: "long",
	name: "Maximiliana-Konstantinopoulou-Vanderberghe-de-la-Fontaine",
	email: LONG_EMAIL,
	status: "joined",
}

const FAILURE_COPY: [MembersFailure, string][] = [
	[
		{ action: "invite", reason: "notHosting", email: "sam@example.com" },
		"Personal isn’t hosted anymore. Turn on hosting to invite sam@example.com.",
	],
	[
		{ action: "invite", reason: "limitReached", email: "sam@example.com" },
		"Personal can’t take more members. Remove someone to invite sam@example.com.",
	],
	[
		{ action: "invite", reason: "notOwner", email: "sam@example.com" },
		"This account doesn’t host Personal. Sign in with the account that does to invite sam@example.com.",
	],
	[
		{ action: "invite", reason: "needsSignIn", email: "sam@example.com" },
		"Couldn’t invite sam@example.com, you’re signed out. Sign in to Kiroshi and invite them again.",
	],
	[
		{ action: "invite", reason: "unreachable", email: "sam@example.com" },
		"Couldn’t reach Kiroshi to invite sam@example.com. Check your connection and try again.",
	],
	[
		{ action: "invite", reason: "generic", email: "sam@example.com" },
		"Couldn’t invite sam@example.com. Nothing changed, try again.",
	],
	[
		{ action: "withdraw", reason: "gone", member: SAM_PENDING },
		"The invitation to sam@example.com is already gone. There’s nothing to withdraw.",
	],
	[
		{ action: "withdraw", reason: "joined", member: SAM_CARTER },
		"Sam Carter already joined. Select Remove to take them out of Personal.",
	],
	[
		{ action: "withdraw", reason: "notHosting", member: SAM_PENDING },
		"Personal isn’t hosted anymore. Turn on hosting to withdraw the invitation to sam@example.com.",
	],
	[
		{ action: "withdraw", reason: "notOwner", member: SAM_PENDING },
		"This account doesn’t host Personal. Sign in with the account that does to withdraw the invitation to sam@example.com.",
	],
	[
		{ action: "withdraw", reason: "needsSignIn", member: SAM_PENDING },
		"Couldn’t withdraw the invitation to sam@example.com, you’re signed out. Sign in to Kiroshi and try again.",
	],
	[
		{ action: "withdraw", reason: "unreachable", member: SAM_PENDING },
		"Couldn’t reach Kiroshi to withdraw the invitation to sam@example.com. Check your connection and try again.",
	],
	[
		{ action: "withdraw", reason: "generic", member: SAM_PENDING },
		"Couldn’t withdraw the invitation to sam@example.com. Nothing changed, try again.",
	],
	[
		{ action: "remove", reason: "gone", member: SAM_CARTER },
		"Sam Carter isn’t a member anymore. There’s nothing to remove.",
	],
	[
		{ action: "remove", reason: "pending", member: SAM_PENDING },
		"sam@example.com hasn’t joined yet. Select Remove again to withdraw the invitation.",
	],
	[
		{ action: "remove", reason: "host", member: STEVE },
		"You host Personal, so you can’t be removed. Turn off hosting instead.",
	],
	[
		{ action: "remove", reason: "notHosting", member: SAM_CARTER },
		"Personal isn’t hosted anymore. Turn on hosting to remove Sam Carter.",
	],
	[
		{ action: "remove", reason: "notOwner", member: SAM_CARTER },
		"This account doesn’t host Personal. Sign in with the account that does to remove Sam Carter.",
	],
	[
		{ action: "remove", reason: "needsSignIn", member: SAM_CARTER },
		"Couldn’t remove Sam Carter, you’re signed out. Sign in to Kiroshi and try again.",
	],
	[
		{ action: "remove", reason: "unreachable", member: SAM_CARTER },
		"Couldn’t reach Kiroshi to remove Sam Carter. Check your connection and try again.",
	],
	[
		{ action: "remove", reason: "generic", member: SAM_CARTER },
		"Couldn’t remove Sam Carter. Nothing changed, try again.",
	],
]

const LONG_FAILURES: MembersFailure[] = [
	{ action: "invite", reason: "generic", email: LONG_EMAIL },
	{ action: "remove", reason: "generic", member: LONG_MEMBER },
]

const FailureCopy = () => (
	<div className="flex w-80 flex-col gap-12 p-4">
		{FAILURE_COPY.map(([failure]) => (
			<MembersPanel
				key={`${failure.action}-${failure.reason}`}
				{...MEMBERS_PANEL}
				email="sam@example.com"
				failure={failure}
				members={
					failure.action === "invite" || failure.member === STEVE
						? [STEVE]
						: [STEVE, failure.member]
				}
			/>
		))}
		{LONG_FAILURES.map((failure) => (
			<MembersPanel
				key={`long-${failure.action}`}
				{...MEMBERS_PANEL}
				email={LONG_EMAIL}
				failure={failure}
				members={[STEVE, LONG_MEMBER]}
			/>
		))}
	</div>
)

export const MembersFailureCopy = meta.story({
	tags: ["test-only"],
	render: () => <FailureCopy />,
	play: async ({ canvasElement }) => {
		const panels = slotsIn(canvasElement, "members-panel")
		const lines = panels.map((panel) => filledRegionIn(panel).textContent)
		await expect(lines.slice(0, FAILURE_COPY.length)).toEqual(
			FAILURE_COPY.map(([, message]) => message),
		)
		for (const panel of panels.slice(FAILURE_COPY.length)) {
			const line = filledRegionIn(panel)
			await expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth)
			await expect(line.getBoundingClientRect().right).toBeLessThanOrEqual(
				panel.getBoundingClientRect().right,
			)
		}
	},
})

const FailingMembersPanel = () => {
	const [failure, setFailure] = useState<MembersFailure>()

	return (
		<MembersPanel
			{...MEMBERS_PANEL}
			email="sam@example.com"
			failure={failure}
			members={[STEVE, SAM_CARTER]}
			onInvite={(email) =>
				setFailure({ action: "invite", reason: "generic", email })
			}
			onRemove={(member) =>
				setFailure({ action: "remove", reason: "generic", member })
			}
		/>
	)
}

export const MembersFailureRegions = meta.story({
	tags: ["test-only"],
	render: () => <FailingMembersPanel />,
	play: async ({ canvasElement, userEvent }) => {
		const panel = slotIn(canvasElement, "members-panel")
		const regions = within(panel).getAllByRole("status")
		await expect(regions).toHaveLength(3)
		const [inviteRegion, , samRegion] = regions
		for (const region of regions) {
			await expect(region).toBeEmptyDOMElement()
		}
		await expect(samRegion.getBoundingClientRect().height).toBe(0)

		await userEvent.click(within(panel).getByRole("button", { name: "Invite" }))
		await expect(within(panel).getAllByRole("status")[0]).toBe(inviteRegion)
		await expect(inviteRegion).toHaveTextContent(
			"Couldn’t invite sam@example.com. Nothing changed, try again.",
		)
		await expect(inviteFieldIn(panel)).toHaveAccessibleDescription(
			"Couldn’t invite sam@example.com. Nothing changed, try again.",
		)

		await userEvent.click(
			within(panel).getByRole("button", { name: "Remove Sam Carter" }),
		)
		await expect(within(panel).getAllByRole("status")[2]).toBe(samRegion)
		await expect(samRegion).toHaveTextContent(
			"Couldn’t remove Sam Carter. Nothing changed, try again.",
		)
		await expect(inviteRegion).toBeEmptyDOMElement()
	},
})

const LONG_NAME = "Maximiliana Konstantinopoulou-Vanderberghe de la Fontaine"

export const MembersLongIdentity = meta.story({
	tags: ["test-only"],
	args: membersArgs({
		members: [
			STEVE,
			{
				id: "long",
				name: LONG_NAME,
				email:
					"maximiliana.konstantinopoulou-vanderberghe@example-long-domain.com",
				status: "joined",
			},
			{
				id: "long-pending",
				email:
					"maximiliana.konstantinopoulou-vanderberghe@example-long-domain.com",
				status: "pending",
			},
		],
	}),
	play: async () => {
		const panel = await membersPanelIn()
		for (const list of within(panel).getAllByRole("list")) {
			for (const action of within(list).getAllByRole("button")) {
				await expect(action.getBoundingClientRect().right).toBeLessThanOrEqual(
					list.getBoundingClientRect().right,
				)
			}
		}
		const name = within(panel).getByText(LONG_NAME)
		await expect(name.getBoundingClientRect().height).toBe(20)
		const remove = within(panel).getByRole("button", {
			name: `Remove ${LONG_NAME}`,
		})
		await expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(
			remove.getBoundingClientRect().left,
		)
	},
})

const STUDIO_MEMBERS = [TOM_PENDING, SAM_EXPIRED, NOA, MAYA]

const rowOf = (panel: HTMLElement, text: string) => {
	const row = within(panel).getByText(text).closest<HTMLElement>("li")
	if (!row) throw new Error(`No member row holds ${text}`)
	return row
}

const expectRowAction = async (action: HTMLElement) => {
	const box = action.getBoundingClientRect()
	await expect([box.width, box.height]).toEqual([28, 28])
	await expect(action).toHaveTextContent("")
	await expect(getComputedStyle(action).borderRadius).toBe("12px")
	await expect(action.querySelector("svg")?.getBoundingClientRect().width).toBe(
		16,
	)
}

const expectFocusRingOnTab = async (
	action: HTMLElement,
	tab: () => Promise<void>,
) => {
	for (let step = 0; step < 12 && document.activeElement !== action; step++) {
		await tab()
	}
	await expect(action).toHaveFocus()
	await expect(action.matches(":focus-visible")).toBe(true)
	await expect(getComputedStyle(action).boxShadow).not.toBe("none")
}

export const MembersWithInvitations = meta.story({
	args: membersArgs({ space: STUDIO, members: STUDIO_MEMBERS }),
	parameters: {
		docs: {
			description: {
				story:
					"Row 1, host view. Studio holds a pending and an expired invitation, so an Invitations section sits above the Members section, 24px apart, each a 12/16 medium label 6px over a bordered list with a 14px radius. Rows pad 8px block, 12px start, 8px end, 10px apart. Tom's pending invitation says when it expires and offers an X to withdraw it; Sam's expired one says when it was sent, wears the Expired tag and offers invite again in place of withdraw. Maya's row carries her fingerprint in the monospace face and a trash to remove her. Every action is icon-only, 28px square, named after the action and the person, with the focus ring under the keyboard.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const panel = await membersPanelIn()
		const sections = slotsIn(panel, "members-section")
		await expect(
			sections.map((section) => section.firstElementChild?.textContent),
		).toEqual(["Invitations", "Members"])
		const [invitationsSection, membersSection] = sections
		await expect(
			membersSection.getBoundingClientRect().top -
				invitationsSection.getBoundingClientRect().bottom,
		).toBe(24)

		const invitations = listNamed(panel, "Invitations")
		const label = within(invitationsSection).getByText("Invitations")
		await expect(
			invitations.getBoundingClientRect().top -
				label.getBoundingClientRect().bottom,
		).toBe(6)
		await expect(getComputedStyle(label).fontSize).toBe("12px")
		await expect(getComputedStyle(label).lineHeight).toBe("16px")
		await expect(getComputedStyle(label).fontWeight).toBe("500")
		await expect(getComputedStyle(invitations).borderRadius).toBe("14px")
		await expect(
			getComputedStyle(listNamed(panel, "Members")).borderRadius,
		).toBe("14px")

		await expect(memberRowsIn(panel)).toEqual([
			TOM_ROW,
			SAM_EXPIRED_ROW,
			NOA_ROW,
			MAYA_ROW,
		])
		const row = rowOf(panel, "Maya")
		const rowStyle = getComputedStyle(row)
		await expect([
			rowStyle.paddingTop,
			rowStyle.paddingBottom,
			rowStyle.paddingInlineStart,
			rowStyle.paddingInlineEnd,
			rowStyle.columnGap,
		]).toEqual(["8px", "8px", "12px", "8px", "10px"])

		const fingerprint = slotIn(row, "member-fingerprint")
		await expect(fingerprint.previousElementSibling).toHaveTextContent(
			"maya@example.com",
		)
		await expect(getComputedStyle(fingerprint).fontFamily).toContain(
			"monospace",
		)
		await expect(getComputedStyle(fingerprint).fontSize).toBe("12px")
		await expect(getComputedStyle(fingerprint).lineHeight).toBe("18px")

		const withdraw = within(rowOf(panel, "tom@example.com")).getByRole(
			"button",
			{ name: "Withdraw the invitation to tom@example.com" },
		)
		const expired = rowOf(panel, "Sent October 9, not used")
		const inviteAgain = within(expired).getByRole("button", {
			name: "Invite sam@example.com again",
		})
		const remove = within(row).getByRole("button", { name: "Remove Maya" })
		await expect(glyphIn(withdraw, Icons.Close)).not.toBe(null)
		await expect(glyphIn(inviteAgain, Icons.Retry)).not.toBe(null)
		await expect(glyphIn(remove, Icons.Delete)).not.toBe(null)
		for (const action of [withdraw, inviteAgain, remove]) {
			await expectRowAction(action)
		}
		await expect(within(expired).getAllByRole("button")).toEqual([inviteAgain])
		const tag = within(expired).getByText("Expired")
		await expect(tag.getBoundingClientRect().right).toBeLessThanOrEqual(
			inviteAgain.getBoundingClientRect().left,
		)
		await expect(getComputedStyle(tag).color).toBe(
			probedStyleOf("text-muted-foreground", "color", panel),
		)
		await expect(getComputedStyle(tag).backgroundColor).toBe(
			probedStyleOf("bg-muted", "backgroundColor", panel),
		)
		await expect(within(rowOf(panel, "Noa")).queryByRole("button")).toBeNull()

		await userEvent.click(withdraw)
		await expect(MEMBERS_PANEL.onWithdraw).toHaveBeenCalledWith(TOM_PENDING)
		await userEvent.click(inviteAgain)
		await expect(MEMBERS_PANEL.onInvite).toHaveBeenCalledWith("sam@example.com")
		await userEvent.click(remove)
		await expect(MEMBERS_PANEL.onRemove).toHaveBeenCalledWith(MAYA)

		inviteFieldIn(panel).focus()
		for (const action of [withdraw, inviteAgain, remove]) {
			await expectFocusRingOnTab(action, () => userEvent.tab())
		}
	},
})

const memberViewArgs = (panel: Partial<MembersPanelProps> = {}) => ({
	...JOINED_ARGS,
	value: { name: STUDIO },
	tab: "members",
	members: (
		<MembersPanel
			{...MEMBERS_PANEL}
			members={[NOA, MAYA]}
			space={STUDIO}
			viewerId={MAYA.id}
			{...panel}
		/>
	),
})

export const MembersMemberView = meta.story({
	args: memberViewArgs(),
	parameters: {
		docs: {
			description: {
				story:
					"Row 9, member view. Maya opens the Members tab of Studio, which Noa hosts: no Share card, the invite field, then the Members list. Noa's row wears the Host tag over an empty action slot; Maya's own row reads `(you)` and offers no action. Leave lives in the Danger zone tab, see `JoinedDanger`.",
			},
		},
	},
	play: async () => {
		const panel = await membersPanelIn()
		await expect(slotsIn(panel, "share-card")).toHaveLength(0)
		await expect(inviteFieldIn(panel)).toBeEnabled()
		await expect(inviteFieldIn(panel)).toHaveAccessibleDescription(INVITE_HINT)
		await expect(memberRowsIn(panel)).toEqual([
			NOA_ROW,
			["M", "Maya (you)", "maya@example.com", MAYA_FINGERPRINT],
		])
		await expect(
			within(listNamed(panel, "Members")).queryByRole("button"),
		).toBeNull()
		const own = rowOf(panel, "Maya (you)")
		await expect(own.lastElementChild).toHaveAttribute("aria-hidden", "true")
		await expect(own.lastElementChild?.getBoundingClientRect().width).toBe(28)
	},
})

export const MembersRemoveHostRefused = meta.story({
	args: memberViewArgs({
		failure: { action: "remove", reason: "host", member: NOA },
	}),
	parameters: {
		docs: {
			description: {
				story:
					"Member view of the remove-host refusal. Maya tried to remove Noa, who hosts Studio: the line names the host and the Space in Noa's row, and offers no hosting gesture since Maya has none.",
			},
		},
	},
	play: async () => {
		const panel = await membersPanelIn()
		const line = filledRegionIn(panel)
		await expect(line).toHaveTextContent(
			/^Noa hosts Studio and can’t be removed\. There’s nothing to do\.$/,
		)
		await expect(rowOf(panel, "Noa")).toContainElement(line)
		await expect(within(panel).queryByText(/Turn off hosting/)).toBeNull()
	},
})

const HOST_OFFLINE_HINT =
	"Studio is offline. You can invite people once Noa’s computer is back."

export const MembersHostOffline = meta.story({
	args: memberViewArgs({
		members: [TOM_PENDING, NOA, MAYA],
		blockedBy: "hostOffline",
	}),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 9.3. Noa's computer is offline, so Maya can't invite anyone: the label, the field, Invite and every row action drop to 50% and are disabled, while the helper stays at full strength and names the host whose computer has to come back.",
			},
		},
	},
	play: async () => {
		const panel = await membersPanelIn()
		await expectInviteBlocked(panel, HOST_OFFLINE_HINT)
		const withdraw = within(panel).getByRole("button", {
			name: "Withdraw the invitation to tom@example.com",
		})
		await expect(withdraw).toBeDisabled()
		await expect(getComputedStyle(withdraw).opacity).toBe("0.5")
	},
})

const SHARE_DESCRIPTION =
	"Invite people who aren’t on your network. Studio runs on this computer, so they reach it while Kiroshi is open here."

const NOT_SHARED_HINT = "Turn on Share Studio to invite someone."

const shareCardIn = (panel: HTMLElement) => slotIn(panel, "share-card")

const shareSwitchIn = (panel: HTMLElement) =>
	within(shareCardIn(panel)).getByRole("switch", { name: "Share Studio" })

const expectNoQuestion = () =>
	expect(screen.queryByRole("alertdialog")).toBe(null)

const expectInviteBlocked = async (
	panel: HTMLElement,
	hint = NOT_SHARED_HINT,
) => {
	const field = inviteFieldIn(panel)
	const label = within(panel).getByText("Invite people")
	const helper = within(panel).getByText(hint)
	const invite = within(panel).getByRole("button", { name: "Invite" })
	await expect(field).toBeDisabled()
	await expect(field).toHaveAccessibleDescription(hint)
	await expect(invite).toBeDisabled()
	await expect(getComputedStyle(label).opacity).toBe("0.5")
	await expect(getComputedStyle(field).opacity).toBe("0.5")
	await expect(getComputedStyle(invite).opacity).toBe("0.5")
	await expect(getComputedStyle(helper).opacity).toBe("1")
}

const notSharedArgs = (hosting: SpaceHosting) =>
	membersArgs({ space: STUDIO, isHosted: false }, hosting)

export const MembersNotShared = meta.story({
	args: notSharedArgs("off"),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 5.1. Members opens on the Share card, then the invite field, then the member list, 24px apart. The card is a 12px outline on `border` with no fill, its switch off and labelled by the title, described by the text under it. Until the space is shared the invite field is dimmed and disabled, its helper at full strength saying what to turn on. Switching on reports `onHost` once and asks nothing.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		await expect(
			within(dialog)
				.getAllByRole("tab")
				.map((tab) => tab.textContent),
		).toEqual([
			"Space",
			"Members",
			"Secrets",
			"Skills",
			"Applications",
			"History",
			"Danger zone",
		])
		const panel = await membersPanelIn()
		const card = shareCardIn(panel)
		const field = inviteFieldIn(panel)
		const list = within(panel).getByRole("list")
		await expect(
			card.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(
			field.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(
			field.getBoundingClientRect().top - card.getBoundingClientRect().bottom,
		).toBeGreaterThanOrEqual(24)

		const cardStyle = getComputedStyle(card)
		await expect(cardStyle.borderTopWidth).toBe("1px")
		await expect(cardStyle.borderTopColor).toBe(
			probedStyleOf("border-border", "borderTopColor", panel),
		)
		await expect(cardStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)")
		await expect(cardStyle.borderRadius).toBe("12px")
		await expect(cardStyle.padding).toBe("14px")
		await expect(cardStyle.columnGap).toBe("16px")

		const title = within(card).getByText("Share Studio")
		await expect(getComputedStyle(title).fontSize).toBe("14px")
		await expect(getComputedStyle(title).fontWeight).toBe("500")
		await expect(getComputedStyle(title).lineHeight).toBe("20px")
		await expect(getComputedStyle(title).color).toBe(
			probedStyleOf("text-foreground", "color", panel),
		)
		const description = within(card).getByText(SHARE_DESCRIPTION)
		await expect(getComputedStyle(description).fontSize).toBe("12px")
		await expect(getComputedStyle(description).lineHeight).toBe("18px")
		await expect(getComputedStyle(description).color).toBe(
			probedStyleOf("text-muted-foreground", "color", panel),
		)
		await expect(
			description.getBoundingClientRect().top -
				title.getBoundingClientRect().bottom,
		).toBe(4)

		const share = shareSwitchIn(panel)
		await expect(share).not.toBeChecked()
		await expect(share).toHaveAccessibleDescription(SHARE_DESCRIPTION)
		await expect(share.getBoundingClientRect().top).toBe(
			title.getBoundingClientRect().top,
		)
		await expectInviteBlocked(panel)

		share.focus()
		await userEvent.keyboard(" ")
		await expect(args.onHost).toHaveBeenCalledOnce()
		await expect(args.onStopHosting).not.toHaveBeenCalled()
		await expectNoQuestion()
	},
})

export const MembersSharing = meta.story({
	args: notSharedArgs("connecting"),
	parameters: {
		docs: {
			description: {
				story:
					"The space is on its way out: the switch is on and `Connecting…` sits under the description with a 12px spinner in `muted-foreground`, read out as a live status. The invite field stays blocked until Online. Switching off reports `onStopHosting` once and asks nothing.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const panel = await membersPanelIn()
		const share = shareSwitchIn(panel)
		await expect(share).toBeChecked()
		const status = within(shareCardIn(panel)).getByRole("status")
		await expect(status).toHaveTextContent("Connecting…")
		await expect(glyphIn(status, Icons.Loading)).not.toBe(null)
		await expectInviteBlocked(panel)

		await userEvent.click(share)
		await expect(args.onStopHosting).toHaveBeenCalledOnce()
		await expect(args.onHost).not.toHaveBeenCalled()
		await expectNoQuestion()
	},
})

export const MembersShared = meta.story({
	args: {
		...membersArgs({ space: STUDIO }),
		members: <EditableMembersPanel {...MEMBERS_PANEL} space={STUDIO} />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 5.2. Studio is shared: the switch is on with an 8px dot in the done green and `Online` in `foreground`, 4px under the description. The invite field is back at full strength with its usual helper, and the story rests on an address being typed.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const panel = await membersPanelIn()
		await expect(shareSwitchIn(panel)).toBeChecked()
		const status = within(shareCardIn(panel)).getByRole("status")
		await expect(status).toHaveTextContent("Online")
		await expect(getComputedStyle(status).paddingTop).toBe("4px")
		await expect(getComputedStyle(status).columnGap).toBe("6px")
		await expect(getComputedStyle(status).color).toBe(
			probedStyleOf("text-foreground", "color", panel),
		)
		const dot = status.querySelector("span")
		await expect(dot && getComputedStyle(dot).backgroundColor).toBe(
			probedStyleOf("bg-bot-badge-done", "backgroundColor", panel),
		)

		const field = inviteFieldIn(panel)
		await expect(getComputedStyle(field).opacity).toBe("1")
		await userEvent.type(field, "lea@example.com")
		await expect(
			within(panel).getByRole("button", { name: "Invite" }),
		).toBeEnabled()
		await expect(field).toHaveAccessibleDescription(INVITE_HINT)
	},
})

export const MembersJoinedAndPending = meta.story({
	args: membersArgs({ space: STUDIO, members: [STEVE, LEA, SAM_PENDING] }),
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 5.3. Studio is shared with one person who joined and one invitation still pending, under the Share card and the invite field.",
			},
		},
	},
	play: async () => {
		const panel = await membersPanelIn()
		await expect(shareSwitchIn(panel)).toBeChecked()
		await expect(memberRowsIn(panel)).toEqual([
			SAM_PENDING_ROW,
			STEVE_ROW,
			["L", "Lea", "lea@example.com"],
		])
	},
})

export const MembersSignedOut = meta.story({
	args: membersArgs(
		{ space: STUDIO, isHosted: false, blockedBy: "signedOut" },
		"signed-out",
	),
	parameters: {
		docs: {
			description: {
				story:
					"Sharing goes through a Kiroshi account, so a signed-out reader gets no switch: the card says why and a primary Sign in, ending on the external-link glyph, takes the switch's place, and the blocked invite field's helper says to sign in. Pressing Sign in reports `onSignIn` once; where it leads is the app's call.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const panel = await membersPanelIn()
		const card = shareCardIn(panel)
		await expect(within(card).queryByRole("switch")).toBe(null)
		await expect(card).toHaveTextContent(
			"Sign in to Kiroshi to invite people who aren’t on your network.",
		)
		const signIn = within(card).getByRole("button", { name: "Sign in" })
		await expect(glyphIn(signIn, Icons.ExternalLink)).not.toBe(null)
		await expectInviteBlocked(panel, "Sign in to Kiroshi to invite someone.")

		await userEvent.click(signIn)
		await expect(args.onSignIn).toHaveBeenCalledOnce()
	},
})

export const MembersShareFailed = meta.story({
	args: notSharedArgs("off"),
	decorators: [
		(Story) => (
			<>
				<Story />
				<NoticeSurface />
				<ShareFailureNotice />
			</>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"Sharing could not start: the switch is back off and a failure notice names the space and says what to do, staying until it is closed. The app raises the notice with `raiseFailureNotice` and the catalogue's `space.hosting.failed` copy; the dialog only draws the switch.",
			},
		},
	},
	play: async () => {
		const panel = await membersPanelIn()
		await expect(shareSwitchIn(panel)).not.toBeChecked()
		const title = await waitFor(() => slotIn(document.body, "toast-title"))
		await expect(title).toHaveTextContent("Couldn’t host Studio")
		await expect(slotIn(document.body, "toast-description")).toHaveTextContent(
			"Check your connection and turn it on again.",
		)
	},
})
