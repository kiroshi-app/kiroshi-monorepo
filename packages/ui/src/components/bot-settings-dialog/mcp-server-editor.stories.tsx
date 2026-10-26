import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { A11Y_CONTRAST_AWAITING_DESIGN_DECISION } from "@workspace/storybook/story-utils"
import {
	BLANK_MCP_SERVER_DRAFT,
	type BotMcpConnectionReason,
	type BotMcpServerDraft,
	toMcpServerConfigText,
	toMcpServerDraft,
} from "@workspace/ui/components/bot-settings"
import type { McpConnectionSection } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import {
	McpServerEditor,
	type McpServerEditorProps,
} from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor"
import {
	BOT_MCP_SERVERS,
	LONG_MCP_SERVER,
} from "@workspace/ui/components/bot-settings-dialog/mcp-servers.fixtures"
import { SERVER_ENVIRONMENT } from "@workspace/ui/components/environment.fixtures"
import { GRANOLA_MARK } from "@workspace/ui/components/plugin-settings/applications.fixtures"

const [LOCAL, REMOTE] = BOT_MCP_SERVERS

const STARTED = toMcpServerDraft(LOCAL)

const REACHED = toMcpServerDraft(REMOTE)

const LONG = toMcpServerDraft(LONG_MCP_SERVER)

const UNREACHABLE: BotMcpServerDraft = {
	name: "ledger",
	transport: "remote",
	config: toMcpServerConfigText({ url: "https://ledger.internal/mcp" }),
}

const BROKEN: BotMcpServerDraft = {
	name: "atlas",
	transport: "local",
	config: '{\n  "command": "npx",\n  "args": ["-y",\n}',
}

const EditorHost = (props: McpServerEditorProps) => {
	const [draft, setDraft] = useState(props.draft)

	return (
		<McpServerEditor
			{...props}
			draft={draft}
			onDraftChange={(next) => {
				setDraft(next)
				props.onDraftChange(next)
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/Bot/McpServerEditor",
	component: McpServerEditor,
	parameters: {
		layout: "fullscreen",
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"One MCP server of a companion's, whole, on the whole dialog: a rail of sections down the left and one section at a time on the right. The rail replaces the companion's own while a server is open — Connection, Environment, Advanced — so a reader sees what a server is made of rather than a name and a box of JSON. The fields and the JSON are two readings of one thing: a field answered is carried into the text, the text edited is carried back into the fields, and every key no field names is kept untouched, because the shape belongs to the transport. Which fields stand under Connection is the transport's own answer — a command and its arguments for a server started here, an address and its headers for one reached over the network. Nothing is written as it is typed: the save is a press, and the way out asks before it drops a draft. The destructive red on its own tint is the token's known contrast gap, flagged for review rather than worked around here.",
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
	render: (args) => <EditorHost {...args} />,
	args: {
		draft: STARTED,
		saved: STARTED,
		onDraftChange: fn(),
		onBack: fn(),
		onSave: fn(),
		onDelete: fn(),
	},
	argTypes: {
		defaultSection: { control: false },
		defaultConfirming: { control: false },
		defaultLeaving: { control: false },
	},
})

export const Connection = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A local server that already exists, opened on where it is reached from. Check that the notice says what a server is before a field is touched, that the command and its arguments are the shape a local server takes, and that answering one carries it into the JSON under Advanced. The save stays enabled and sends nothing until something changed.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const save = canvas.getByRole("button", { name: "Save changes" })

		await expect(save).toBeEnabled()
		await userEvent.click(save)
		await expect(args.onSave).not.toHaveBeenCalled()
		await expect(canvas.getByLabelText("Command")).toHaveValue("npx")

		await userEvent.clear(canvas.getByLabelText("Command"))
		await userEvent.type(canvas.getByLabelText("Command"), "bunx")

		await expect(save).toBeEnabled()
		await expect(canvas.getByText("Unsaved changes")).toBeVisible()

		await userEvent.click(save)
		await expect(args.onSave).toHaveBeenCalledWith({
			...LOCAL.config,
			command: "bunx",
		})
	},
})

export const RemoteConnection = meta.story({
	args: { draft: REACHED, saved: REACHED },
	parameters: {
		docs: {
			description: {
				story:
					"The same section for a server that is already running somewhere. Reach for this over `Connection` to check that the transport is what decides the fields: the address, the kind of endpoint it is reached on and its headers stand where the command and its arguments did. The endpoint is asked for rather than assumed — a remote server written without it is skipped by the runtime — and it is written beside the URL every time.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expect(canvas.getByLabelText("URL")).toHaveValue(
			"https://ledger.internal/mcp",
		)
		await expect(canvas.queryByLabelText("Command")).not.toBeInTheDocument()
		await expect(
			canvas.getByRole("combobox", { name: "Endpoint" }),
		).toHaveTextContent("HTTP")

		await userEvent.click(canvas.getByRole("combobox", { name: "Endpoint" }))
		await userEvent.click(
			await screen.findByRole("option", { name: "Server-sent events" }),
		)

		await userEvent.type(
			canvas.getByLabelText("Headers"),
			"Authorization: Bearer token",
		)
		await userEvent.click(canvas.getByRole("tab", { name: "Advanced" }))
		await expect(canvas.getByLabelText("Configuration")).toHaveValue(
			toMcpServerConfigText({
				...REMOTE.config,
				type: "sse",
				headers: { Authorization: "Bearer token" },
			}),
		)
	},
})

export const RemoteWithoutEndpoint = meta.story({
	args: { draft: UNREACHABLE, saved: UNREACHABLE },
	parameters: {
		docs: {
			description: {
				story:
					"A remote server whose file names an address and nothing else — the shape the runtime skips, telling the reader to add a type. Reach for this to check the one case where a server that has not been touched still has something to save: the endpoint field stands on HTTP, the unsaved mark is up on open, and saving writes the type beside the URL rather than leaving the reader with a server that never connects.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Unsaved changes")).toBeVisible()

		const save = canvas.getByRole("button", { name: "Save changes" })
		await expect(save).toBeEnabled()

		await userEvent.click(save)
		await expect(args.onSave).toHaveBeenCalledWith({
			url: "https://ledger.internal/mcp",
			type: "http",
		})
	},
})

export const Environment = meta.story({
	args: { defaultSection: "environment" },
	parameters: {
		docs: {
			description: {
				story:
					"What the server starts with, one name and value a line. This is where a token is pasted, so it is a section of its own rather than a field buried under the command. Check that a line typed here becomes a key of `env` in the JSON, and that a line cleared takes its key out rather than leaving an empty one behind.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const environment = canvas.getByRole("textbox", { name: "Secrets" })

		await expect(environment).toHaveValue(
			"ATLAS_TOKEN=sk-atlas-2f9c41d8e7b6a530\nATLAS_REGION=eu",
		)

		await userEvent.clear(environment)
		await userEvent.click(canvas.getByRole("tab", { name: "Advanced" }))
		await expect(canvas.getByLabelText("Configuration")).toHaveValue(
			toMcpServerConfigText({
				command: LOCAL.config.command,
				args: LOCAL.config.args,
			}),
		)
	},
})

export const ServerVariables = meta.story({
	args: {
		defaultSection: "environment",
		environment: {
			entries: SERVER_ENVIRONMENT,
			onSet: fn(),
			onDelete: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The two halves of the Environment section, together. The field above declares which names the server receives and carries its variable references; the list below holds the names this server owns, written once and never read back. A name defined here wins over the same name on the companion, which wins over the space, and every row says which scope actually serves it.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("textbox", { name: "Secrets" })).toBeVisible()
		await expect(canvas.getByText("LEDGER_KEY")).toBeVisible()
		await expect(canvas.getByText("SERVER_TIMEOUT_MS")).toBeVisible()
	},
})

export const Advanced = meta.story({
	args: { defaultSection: "advanced" },
	parameters: {
		docs: {
			description: {
				story:
					"The configuration itself, which is what is written and what every other section is a reading of. It is the only place a key no field names can be seen or changed. Check that editing the text here is carried back into the fields, and that the reading under it turns the shape into a sentence about this machine, with every environment value masked until it is asked for.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const config = canvas.getByLabelText("Configuration")

		await userEvent.clear(config)
		await userEvent.type(config, '{{"url": "https://atlas.dev/mcp"}')

		await userEvent.click(canvas.getByRole("tab", { name: "Connection" }))
		await expect(canvas.getByLabelText("URL")).toHaveValue(
			"https://atlas.dev/mcp",
		)
	},
})

export const Empty = meta.story({
	args: {
		draft: BLANK_MCP_SERVER_DRAFT,
		saved: undefined,
		onDelete: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A server that does not exist yet. Reach for this over `Connection` to review what a reader is asked for before anything is written: the same notice, because trust is asked for while the server is being added rather than after, no delete, because there is nothing on the disk to take away, and no unsaved mark, because there is nothing kept to differ from. The button stays enabled: pressing it before the server is named keeps the page open, marks the name invalid with its error and puts focus in it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const create = canvas.getByRole("button", { name: "Add application" })
		const name = canvas.getByLabelText("Name")

		await expect(create).toBeEnabled()
		await userEvent.click(create)
		await expect(args.onSave).not.toHaveBeenCalled()
		await expect(await canvas.findByRole("alert")).toHaveTextContent(
			"An application needs a name.",
		)
		await expect(name).toHaveAttribute("aria-invalid", "true")
		await expect(name).toHaveAccessibleDescription(
			/An application needs a name\./,
		)
		await expect(name).toHaveFocus()

		await userEvent.type(canvas.getByLabelText("Name"), "Atlas Docs")
		await expect(canvas.queryByRole("alert")).toBeNull()
		await expect(canvas.getByLabelText("Name")).toHaveValue("atlas-docs")

		await userEvent.type(canvas.getByLabelText("Command"), "npx")
		await userEvent.click(create)
		await expect(args.onSave).toHaveBeenCalledWith({ command: "npx" })
	},
})

export const Invalid = meta.story({
	args: { draft: BROKEN, defaultSection: "advanced" },
	parameters: {
		docs: {
			description: {
				story:
					"A configuration the reader is halfway through. This is the state the raw field owes them: the message under the box says what is wrong and that nothing is saved, the edge turns without recolouring what they typed, and the reading disappears rather than showing a stale command. Pressing save before it parses sends nothing and puts focus back in the box, and the two sections read out of the configuration say so rather than showing fields that would drop what was typed.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Save changes" }))
		await expect(canvas.getByLabelText("Configuration")).toHaveFocus()
		await expect(canvas.getByLabelText("Configuration")).toBeInvalid()
		await expect(
			canvas.queryByRole("heading", { name: "What this starts" }),
		).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("tab", { name: "Connection" }))
		await expect(canvas.queryByLabelText("Command")).not.toBeInTheDocument()
	},
})

export const LongContent = meta.story({
	args: { draft: LONG, saved: LONG },
	parameters: {
		docs: {
			description: {
				story:
					"A server whose name, command and arguments all run past their fields. Check that only the open section scrolls, that the rail and the header hold still, and that the name in the header truncates rather than pushing the save off the row.",
			},
		},
	},
})

export const WithLeaving = meta.story({
	args: { defaultLeaving: true },
	parameters: {
		docs: {
			description: {
				story:
					"The way out taken while something is unsaved, mounted with its question already up. It says what goes and what is left as it was before anything is dropped. Check that cancelling leaves the draft exactly as it was and reports nothing, and that accepting fires `onBack` once. A draft with nothing to save goes straight back without asking.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await screen.findByRole("alertdialog")
		await waitFor(() => expect(popup).toBeVisible())

		await userEvent.click(within(popup).getByRole("button", { name: "Leave" }))

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onBack).toHaveBeenCalledTimes(1)
	},
})

export const WithConfirmation = meta.story({
	args: { defaultConfirming: true },
	parameters: {
		docs: {
			description: {
				story:
					"The delete, mounted with its question already up. It names the server so somebody who opened the wrong one finds out here, states what goes with it, and Cancel comes first. Check that accepting fires `onDelete` once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await screen.findByRole("alertdialog")
		await waitFor(() => expect(popup).toBeVisible())

		await expect(popup).toHaveTextContent(`Remove ${LOCAL.name}?`)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Remove application" }),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.onDelete).toHaveBeenCalledTimes(1)
	},
})

export const NeedsAuthorization = meta.story({
	args: { connection: { state: "needsAuthorization", onConnect: fn() } },
	parameters: {
		docs: {
			description: {
				story:
					"A saved application that signs in through the browser and has not been authorized yet. Reach for this to check the block the Connection section opens on: it stands above the trust notice, says where the token is kept — with the application's secrets, never in the JSON under Advanced — and offers the one action that can be taken. Check that the state is readable from the title and the dot together, not from the blue attention field.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(
			canvas.getByText("Needs authorization", { selector: "p" }),
		).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Connect" }))

		await expect(args.connection?.onConnect).toHaveBeenCalledTimes(1)
	},
})

export const Connecting = meta.story({
	args: {
		connection: {
			state: "connecting",
			host: "atlas.dev",
			onCancel: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The block while the reader is somewhere else — in the browser tab the application opened. Reach for this over `NeedsAuthorization` to check the waiting state: the title names what is being waited on rather than repeating the state label, the sentence points at the host the tab is open on, and the spinner replaces the dot and holds still under reduced motion. Cancel is the only way out of the wait.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Waiting for your browser")).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Cancel" }))
		await expect(args.connection?.onCancel).toHaveBeenCalledTimes(1)
	},
})

export const Connected = meta.story({
	args: {
		connection: {
			state: "connected",
			onDisconnect: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"An authorized application at rest. Check that the block goes quiet — the muted field, no blue attention tint, no red — and that the title carries the state on its own, with no sentence under it: there is nothing left to say once the connection holds. Disconnect is the only action, and it asks before it drops anything: `WithDisconnection` mounts that question.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Connected", { selector: "p" })).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Disconnect" }),
		).toBeVisible()
	},
})

export const ConnectionFailed = meta.story({
	args: { connection: { state: "failed", onConnect: fn() } },
	parameters: {
		docs: {
			description: {
				story:
					"The attempt came back refused, with nothing said about why. Reach for this to check the block when no reason reaches it: the title states the outcome, nothing is reserved under it, and another attempt is offered. The `Reason*` stories mount the sentence each failed step writes there. Check that the red is the field and the dot, never the words.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Couldn’t connect")).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Retry" }))

		await expect(args.connection?.onConnect).toHaveBeenCalledTimes(1)
	},
})

const failedFor = (reason: BotMcpConnectionReason): McpConnectionSection => ({
	state: "failed",
	reason,
	onConnect: fn(),
})

const UNKNOWN_DETAIL = "exit 9 before the callback"

const UNBROKEN_UNKNOWN_DETAIL = `0x${"a3f19b7c".repeat(40)}`

export const ReasonAlreadyRunning = meta.story({
	args: { connection: failedFor({ kind: "alreadyRunning" }) },
	parameters: {
		docs: {
			description: {
				story:
					"A second sign-in asked for while the first is still open. Check that the sentence sends the reader back to the attempt already running instead of offering a cause.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(
				"A sign-in is already running. Finish that one, or cancel it, then try again.",
			),
		).toBeVisible()
	},
})

export const ReasonStore = meta.story({
	args: { connection: failedFor({ kind: "store" }) },
	parameters: {
		docs: {
			description: {
				story:
					"The token came back but the secrets store refused it. Check that the sentence says nothing was kept, so the reader knows a retry starts from zero.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(
				"Kiroshi couldn’t write the token to this application’s secrets, so nothing was kept.",
			),
		).toBeVisible()
	},
})

export const ReasonTransport = meta.story({
	args: { connection: failedFor({ kind: "transport" }) },
	parameters: {
		docs: {
			description: {
				story:
					"The agent never answered, so the sign-in never started. Check that the sentence names the step that did not happen rather than the machinery underneath it.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(
				"Kiroshi couldn’t reach the agent, so the sign-in never started.",
			),
		).toBeVisible()
	},
})

export const ReasonRefusedUrl = meta.story({
	args: { connection: failedFor({ kind: "refusedUrl" }) },
	parameters: {
		docs: {
			description: {
				story:
					"The sign-in link the application gave was refused before anything opened. Check that the sentence points at the address as the thing to check, and that the link itself is never printed.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(
				"Kiroshi wouldn’t open the sign-in link this application gave. Check its address.",
			),
		).toBeVisible()
	},
})

export const ReasonBrowserRefused = meta.story({
	args: { connection: failedFor({ kind: "browserRefused" }) },
	parameters: {
		docs: {
			description: {
				story:
					"The browser refused to open. Check that the sentence leaves the reader a way through on their own, since the retry may refuse again.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(
				"Your browser wouldn’t open. Try again, or open the sign-in link yourself.",
			),
		).toBeVisible()
	},
})

export const ReasonTimedOut = meta.story({
	args: { connection: failedFor({ kind: "timedOut" }) },
	parameters: {
		docs: {
			description: {
				story:
					"The sign-in was opened and never came back. Check the shortest of the sentences: the wait ran out, and another attempt is all there is to say.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("The sign-in timed out before it came back. Try again."),
		).toBeVisible()
	},
})

export const ReasonUnknown = meta.story({
	args: { connection: failedFor({ kind: "unknown", detail: UNKNOWN_DETAIL }) },
	parameters: {
		docs: {
			description: {
				story:
					"A failure no named step claims, carrying the detail it came with. Check that the detail is set as text in the same muted sentence, with no chip and no monospace around it, and that no other kind’s sentence is drawn beside it.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(`The sign-in stopped: ${UNKNOWN_DETAIL}`),
		).toBeVisible()
		await expect(canvas.queryByText(/timed out/)).not.toBeInTheDocument()
	},
})

export const ReasonUnknownUnbroken = meta.story({
	args: {
		connection: failedFor({
			kind: "unknown",
			detail: UNBROKEN_UNKNOWN_DETAIL,
		}),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The one kind that carries a raw string from upstream, here a 322 character token with nowhere to break. Reach for this over `ReasonUnknown` to check what the editor does with a detail wider than its column: the token breaks inside the sentence instead of pushing the block past its frame, and Retry keeps its own end of the line at the width it holds in the other `Reason` stories.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const frame = canvasElement.firstElementChild
		const sentence = canvas.getByText(
			new RegExp(UNBROKEN_UNKNOWN_DETAIL.slice(0, 24)),
		)
		const retry = canvas.getByRole("button", { name: "Retry" })

		await expect(sentence.clientWidth).toBeLessThanOrEqual(
			frame?.clientWidth ?? 0,
		)
		await expect(sentence.scrollWidth).toBeLessThanOrEqual(sentence.clientWidth)
		await expect(retry.scrollWidth).toBeLessThanOrEqual(retry.clientWidth)
		await expect(retry.getBoundingClientRect().right).toBeLessThanOrEqual(
			frame?.getBoundingClientRect().right ?? 0,
		)
	},
})

export const ReasonUnknownBlank = meta.story({
	args: { connection: failedFor({ kind: "unknown", detail: "   " }) },
	parameters: {
		docs: {
			description: {
				story:
					"An unknown failure whose detail came back empty. Check that the block falls back to what `ConnectionFailed` draws rather than printing a sentence that stops at its colon: nothing is said, and nothing is reserved under the state label.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Couldn’t connect")).toBeVisible()
		await expect(
			canvas.queryByText(/The sign-in stopped/),
		).not.toBeInTheDocument()
	},
})

const GRANOLA = toMcpServerDraft({
	name: "granola",
	config: { type: "http", url: "https://mcp.granola.ai/mcp" },
})

const REFUSED_REFRESH = {
	reason: "401 · refresh token revoked",
	companionName: "Rei",
	toolCount: 6,
	sessionCount: 2,
}

export const RefusedRefresh = meta.story({
	args: {
		draft: GRANOLA,
		saved: GRANOLA,
		mark: GRANOLA_MARK,
		connection: {
			state: "failed",
			reason: { kind: "timedOut" },
			refusedRefresh: REFUSED_REFRESH,
			onConnect: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"E8. The token refresh was refused, with a failure reason given beside it. Check the mark and the monospace name in the header, the destructive dot and field the failed state already draws, a title saying the sign-in stopped working, a sentence naming what it cost, the raw reason in its own chip, and Sign in again as the primary action. Check that the refusal is the only thing said: the reason sentence stays out while this block stands.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(
			canvasElement.querySelector('[data-slot="application-mark"] img'),
		).not.toBeNull()
		await expect(canvas.getByText("granola", { selector: "span" })).toHaveClass(
			"font-mono",
		)
		await expect(canvas.getByText("The sign-in stopped working")).toBeVisible()
		await expect(
			canvas.getByText(
				"Kiroshi couldn’t refresh the token, so granola’s 6 tools were left out of Rei’s last 2 sessions. Signing in again is usually all it takes.",
			),
		).toBeVisible()
		await expect(canvas.getByText("401 · refresh token revoked").tagName).toBe(
			"CODE",
		)
		await expect(canvas.queryByText("Couldn’t connect")).not.toBeInTheDocument()
		await expect(canvas.queryByText(/timed out/)).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("button", { name: "Sign in again" }))
		await expect(args.connection?.onConnect).toHaveBeenCalledTimes(1)
	},
})

export const RefusedRefreshLongReason = meta.story({
	args: {
		draft: GRANOLA,
		saved: GRANOLA,
		connection: {
			state: "failed",
			refusedRefresh: {
				...REFUSED_REFRESH,
				reason: `401 · ${"invalid_grant refresh token revoked by the authorization server ".repeat(3).trim()}`,
			},
			onConnect: fn(),
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A refused refresh whose raw reason runs to 200 characters. Check that the chip wraps inside the column instead of pushing the action off the block.",
			},
		},
	},
	play: async ({ canvas }) => {
		const chip = canvas.getByText(/invalid_grant/)
		await expect(chip.scrollWidth).toBeLessThanOrEqual(chip.clientWidth)
		await expect(
			canvas.getByRole("button", { name: "Sign in again" }),
		).toBeVisible()
	},
})

export const UnsavedConnection = meta.story({
	args: {
		draft: BLANK_MCP_SERVER_DRAFT,
		saved: undefined,
		onDelete: undefined,
		connection: { state: "needsAuthorization", onConnect: fn() },
	},
	parameters: {
		docs: {
			description: {
				story:
					"An application being added, before anything is on the disk. Reach for this over `NeedsAuthorization` to check what the block does when authorizing cannot mean anything yet: the field goes muted rather than asking for attention, the sentence says what has to happen first, and Connect is present but out of reach so the order of operations is readable rather than discovered by a press that fails.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Available once this application is saved."),
		).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Connect" })).toBeDisabled()
	},
})

export const WithDisconnection = meta.story({
	args: {
		connection: {
			state: "connected",
			onDisconnect: fn(),
		},
		defaultDisconnecting: true,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Disconnect taken, with its question already up. Reach for this to check that it is a different question from `WithConfirmation`: removing an application takes its configuration off the disk, disconnecting only drops the token and the tools it opened. Both name the application and both put Cancel first. Check that accepting fires `onDisconnect` once.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const popup = await screen.findByRole("alertdialog")
		await waitFor(() => expect(popup).toBeVisible())

		await expect(popup).toHaveTextContent(`Disconnect ${LOCAL.name}?`)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Disconnect" }),
		)

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBe(null))
		await expect(args.connection?.onDisconnect).toHaveBeenCalledTimes(1)
	},
})

export const PageLayout = meta.story({
	args: {
		layout: "page",
		mark: GRANOLA_MARK,
		displayName: "Granola",
		connection: {
			state: "connected",
			onDisconnect: fn(),
		},
	},
	render: (args) => (
		<div className="mx-auto h-full w-140 overflow-y-auto px-12 py-10">
			<EditorHost {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The editor as a focused settings screen draws it: no rail and no back, a header with the 36 pixel mark, the full name and the connection state, then Connection, Secrets and Advanced stacked under their own headings. Check that the name is drawn once and never cut, and that Save and Remove application still sit beside it.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("tab")).toBeNull()
		const name = canvas.getByRole("heading", { level: 2, name: "Granola" })
		await expect(canvas.getAllByText("Granola")).toHaveLength(1)
		await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth)
		await expect(
			canvas.getByText("Connected", { selector: "span" }),
		).toBeVisible()
		await expect(
			canvas
				.getAllByRole("heading", { level: 3 })
				.map((heading) => heading.textContent)
				.slice(0, 3),
		).toEqual(["Connection", "Secrets", "Advanced"])
		await expect(
			canvas.getByRole("button", { name: "Save changes" }),
		).toBeVisible()
	},
})
