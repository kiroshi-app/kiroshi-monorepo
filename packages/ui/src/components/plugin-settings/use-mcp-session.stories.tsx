import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import type { BotMcpServerItem } from "@workspace/ui/components/bot-settings"
import { BOT_MCP_SERVERS } from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import {
	API_KEY_INSTALL,
	CATALOGUE_APPLICATIONS,
} from "@workspace/ui/components/plugin-settings/applications.fixtures"
import type { ApplicationsOwner } from "@workspace/ui/components/plugin-settings/applications-panel"
import type { SettingsPage } from "@workspace/ui/components/plugin-settings/settings-pages"
import {
	type McpSessionProps,
	useMcpSession,
} from "@workspace/ui/components/plugin-settings/use-mcp-session"
import { usePushedPages } from "@workspace/ui/hooks/use-pushed-pages"

const [LOCAL, REMOTE] = BOT_MCP_SERVERS

const COMPANION = {
	kind: "companion",
	name: "Repository archivist",
} satisfies ApplicationsOwner

const NEEDS_AUTHORIZATION = {
	...LOCAL,
	connection: "needsAuthorization",
} satisfies BotMcpServerItem

type McpSessionScreenProps = Omit<McpSessionProps, "pages">

const McpSessionScreen = (props: McpSessionScreenProps) => {
	const pages = usePushedPages<SettingsPage>()
	const session = useMcpSession({ ...props, pages })

	return (
		pages.shown(session.pages) ?? (
			<div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
				{session.panel}
			</div>
		)
	)
}

const PickingScreen = (props: McpSessionScreenProps) => {
	const [isPicked, setPicked] = useState(false)
	const { catalogue } = props

	if (!catalogue) return <McpSessionScreen {...props} />

	return (
		<McpSessionScreen
			{...props}
			catalogue={{
				...catalogue,
				install: isPicked
					? {
							application: API_KEY_INSTALL,
							onInstall: catalogue.install?.onInstall ?? fn(),
							onLeave: () => setPicked(false),
						}
					: undefined,
				onPick: (application) => {
					setPicked(true)
					catalogue.onPick(application)
				},
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/Plugins/McpSession",
	tags: ["test-only", "!autodocs"],
	component: McpSessionScreen,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The list and the editor as one composition: which server is open is the session's own state, and everything else is handed to it. The connection is two inputs rather than one, because they answer at different moments — every row reads its own state off the server it is given, while the editor block is handed the connection of whichever server is open, resolved by the caller from `onServerOpen`.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[34rem] w-[52rem] overflow-hidden rounded-2xl border border-border">
				<Story />
			</div>
		),
	],
	args: {
		owner: COMPANION,
		servers: BOT_MCP_SERVERS,
		onServerCreate: fn(),
		onServerChange: fn(),
		onServerDelete: fn(),
		onServerOpen: fn(),
		isSettingsOpen: true,
	},
})

export const AddingPushesTheCatalogue = meta.story({
	args: {
		catalogue: {
			category: "everything",
			onCategoryChange: fn(),
			query: "",
			onQueryChange: fn(),
			applications: CATALOGUE_APPLICATIONS,
			onRetry: fn(),
			onOpen: fn(),
			onPick: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"Add an application with a catalogue handed in. Check that the catalogue replaces the whole body, rail included, that opening it tells the caller so the catalogue can be read, that All applications brings the list back, and that the plus button beside the search field opens a blank editor.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Add an application" }),
		)

		await expect(args.catalogue?.onOpen).toHaveBeenCalledTimes(1)

		await userEvent.click(
			canvas.getByRole("button", { name: "All applications" }),
		)
		await expect(
			canvas.getByRole("button", { name: "Open atlas" }),
		).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Paste a configuration" }),
		)
		await expect(canvas.getByRole("tab", { name: "Connection" })).toBeVisible()
	},
})

export const PickingPushesTheInstallPage = meta.story({
	args: {
		catalogue: {
			category: "everything",
			onCategoryChange: fn(),
			query: "sentry",
			onQueryChange: fn(),
			applications: CATALOGUE_APPLICATIONS,
			onRetry: fn(),
			onPick: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"Picking an application from the catalogue, inside the same dialog and in the scope of the panel it was opened from. Check that the install page keeps the rail, that its footnote names the scope, and that leaving it brings the catalogue back with what was typed.",
			},
		},
	},
	render: (args) => <PickingScreen {...args} />,
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Add an application" }),
		)
		await userEvent.click(canvas.getByRole("button", { name: /^Sentry/ }))

		await expect(
			canvas.getByRole("heading", { level: 3, name: "Sentry" }),
		).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "All applications" }),
		)

		await expect(canvas.getByRole("textbox")).toHaveValue("sentry")
		await expect(
			canvas.getByRole("textbox", { name: "Search applications" }),
		).toHaveValue("sentry")
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The composition with no connection input at all, which is what every caller passes until one is wired. Check that the list and the editor render exactly as they did before applications had states: no lane content, no action, no block above the trust notice.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Open atlas" }))

		await expect(args.onServerOpen).toHaveBeenCalledWith("atlas")
		await expect(
			canvas.queryByRole("button", { name: "Connect" }),
		).not.toBeInTheDocument()
	},
})

export const NeedsAuthorization = meta.story({
	args: {
		servers: [NEEDS_AUTHORIZATION, REMOTE],
		onServerConnect: fn(),
		serverConnection: { state: "needsAuthorization", onConnect: fn() },
	},
	parameters: {
		docs: {
			description: {
				story:
					"An application waiting to be authorized, seen through the composition rather than through either component alone. Reach for this to check that one state reaches two surfaces by two paths: the row draws its lane and its Connect from the server it was given, and opening that row hands the editor the block with the same state. Check that connecting from the row does not open the application, and that the block's own Connect is a separate press.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Connect atlas" }))

		await expect(args.onServerConnect).toHaveBeenCalledWith(NEEDS_AUTHORIZATION)
		await expect(args.onServerOpen).not.toHaveBeenCalled()

		await userEvent.click(canvas.getByRole("button", { name: "Open atlas" }))

		await expect(
			canvas.getByText("Needs authorization", { selector: "p" }),
		).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Connect" }))

		await expect(args.serverConnection?.onConnect).toHaveBeenCalledTimes(1)
	},
})

export const ClosedSettingsHoldsTheList = meta.story({
	args: { isSettingsOpen: false, serverToOpen: LOCAL.name },
	parameters: {
		docs: {
			description: {
				story:
					"An application named while the dialog hosting this session is closed. Check that the list stays on screen and that no editor opens for the named application.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		await expect(
			canvas.getByRole("button", { name: `Open ${LOCAL.name}` }),
		).toBeVisible()
		await expect(args.onServerOpen).not.toHaveBeenCalled()
	},
})
