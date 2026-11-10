import type { ReactNode } from "react"
import { expect, fn, screen, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type { GreetingPeriod } from "@workspace/ui/components/greeting-period"
import type { HomeAgent } from "@workspace/ui/components/home-agent-picker"
import { HomeApplicationsBand } from "@workspace/ui/components/home-applications-band"
import {
	HomeComposer,
	HomeComposerSkeleton,
} from "@workspace/ui/components/home-composer"
import {
	HomeGreeting,
	HomeGreetingSkeleton,
} from "@workspace/ui/components/home-greeting"
import { HomeLayout } from "@workspace/ui/components/home-layout"
import { HomeArchivedLine } from "@workspace/ui/components/home-lines"
import {
	endNotice,
	NoticeSurface,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import type { PromptAttachment } from "@workspace/ui/components/prompt-attachments"
import { PROMPT_ATTACHMENTS } from "@workspace/ui/components/prompt-attachments.fixtures"

const ATLAS: HomeAgent = {
	id: "atlas",
	name: "Atlas",
	role: "Planner",
	hue: BLOT_HUES.blue,
}

const PICO: HomeAgent = {
	id: "pico",
	name: "Pico",
	role: "Builder",
	hue: BLOT_HUES.orange,
}

const JUNIPER: HomeAgent = {
	id: "juniper",
	name: "Juniper",
	role: "Writer",
	hue: BLOT_HUES.green,
}

const AGENTS = [ATLAS, PICO, JUNIPER]

const markOf = (fill: string, ink: string, letter: string) =>
	`data:image/svg+xml;utf8,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="${fill}"/><text x="10" y="14" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle" fill="${ink}">${letter}</text></svg>`,
	)}`

const APPLICATION_MARKS = [
	markOf("#f2f2f2", "#111111", "N"),
	markOf("#5e6ad2", "#ffffff", "L"),
	markOf("#2b2b2e", "#ffffff", "G"),
	markOf("#4a154b", "#ffffff", "S"),
	markOf("#1a73e8", "#ffffff", "C"),
]

const FLIGHTS_ASK =
	"Can you find flights to Lisbon for the offsite, 12 to 15 March?"

type HomePanelProps = { children: ReactNode }

const HomePanel = ({ children }: HomePanelProps) => (
	<div className="h-212 w-343 overflow-clip rounded-xl border border-foreground/6 bg-card">
		{children}
	</div>
)

const selectedAgent = fn()
const attached = fn()
const sent = fn()
const dismissedBand = fn()
const openedArchive = fn()
const removedAttachment = fn()

let raisedSendFailure: string | undefined

type EmptyHomeProps = {
	agent?: HomeAgent
	period?: GreetingPeriod
	firstName?: string
	draft?: string
	hasBand?: boolean
	attachments?: PromptAttachment[]
	after?: ReactNode
}

const EmptyHome = ({
	agent = ATLAS,
	period = "morning",
	firstName = "Sam",
	draft,
	hasBand = true,
	attachments,
	after,
}: EmptyHomeProps) => (
	<HomeLayout stage="empty">
		<HomeGreeting agent={agent} firstName={firstName} period={period} />
		<HomeComposer
			agents={AGENTS}
			attachments={attachments}
			band={
				hasBand ? (
					<HomeApplicationsBand
						agentName={agent.name}
						marks={APPLICATION_MARKS}
						onDismiss={dismissedBand}
					/>
				) : undefined
			}
			defaultValue={draft}
			onAttach={attached}
			onRemoveAttachment={removedAttachment}
			onSelectAgent={selectedAgent}
			onSubmit={sent}
			selectedAgentId={agent.id}
		/>
		{after}
	</HomeLayout>
)

const meta = preview.meta({
	title: "Conversation/Home/Home",
	component: HomeLayout,
	globals: { theme: "dark" },
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The Home panel, one story per artboard of the Paper file Kiroshi, Home. The Home centres the greeting and the composer. The title bar and the rail stay out: they are drawn by the app frame around this panel.",
			},
		},
	},
	decorators: [
		(Story) => (
			<HomePanel>
				<Story />
			</HomePanel>
		),
	],
	beforeEach: () => {
		selectedAgent.mockClear()
		dismissedBand.mockClear()
		openedArchive.mockClear()
		removedAttachment.mockClear()
	},
})

const withDescription = (story: string) => ({
	docs: { description: { story } },
})

export const WithAFirstName = meta.story({
	name: "1a · With a first name",
	render: () => <EmptyHome />,
	parameters: withDescription(
		"Reach for this as the nominal Home: the reader's first name is known, the agent has no Application yet, so the band shows. Check the greeting says the name and the send button stays idle and disabled on an empty field.",
	),
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { name: "Morning, Sam. What’s next?" }),
		).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Send" })).toBeDisabled()
	},
})

export const WithoutAFirstName = meta.story({
	name: "1b · Without a first name",
	render: () => <EmptyHome firstName="" />,
	parameters: withDescription(
		"Reach for this when the account carries no first name: the greeting drops the name and keeps the period. Pick `1a` for the named greeting.",
	),
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { name: "Morning. What’s next?" }),
		).toBeVisible()
	},
})

export const Morning = meta.story({
	name: "2a · Morning, 05:00 to 11:59",
	render: () => <EmptyHome period="morning" />,
	parameters: withDescription(
		"The greeting from 05:00 to 11:59. `greetingPeriodOf` picks the period from the local hour.",
	),
})

export const Afternoon = meta.story({
	name: "2b · Afternoon, 12:00 to 17:59",
	render: () => <EmptyHome period="afternoon" />,
	parameters: withDescription("The greeting from 12:00 to 17:59."),
})

export const Evening = meta.story({
	name: "2c · Evening, 18:00 to 21:59",
	render: () => <EmptyHome period="evening" />,
	parameters: withDescription("The greeting from 18:00 to 21:59."),
})

export const Night = meta.story({
	name: "2d · Night, 22:00 to 04:59",
	render: () => <EmptyHome period="night" />,
	parameters: withDescription(
		"The greeting from 22:00 to 04:59, the one period that asks rather than greets. Without a first name it reads Still up? What’s next?, a case the file does not draw.",
	),
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { name: "Still up, Sam? What’s next?" }),
		).toBeVisible()
	},
})

export const BandShown = meta.story({
	name: "3a · Atlas has no Application, band shown",
	render: () => <EmptyHome />,
	parameters: withDescription(
		"Reach for this when the selected agent has no Application: the band under the field suggests connecting some, up to five marks, and can be dismissed. Check the dismiss control carries a name and calls back, and that no composer control eases its colour on hover or press.",
	),
	play: async ({ canvas, userEvent }) => {
		const controls = [
			canvas.getByRole("button", { name: "Add files" }),
			canvas.getByRole("button", { name: "Atlas" }),
			canvas.getByRole("button", { name: "Send" }),
			canvas.getByRole("button", { name: "Hide this suggestion" }),
		]
		if (isInBrowserRunner()) {
			await withMotionAllowed(async () => {
				for (const control of controls) {
					await expect(getComputedStyle(control).transitionDuration).toBe("0s")
				}
			})
		}
		await userEvent.click(
			canvas.getByRole("button", { name: "Hide this suggestion" }),
		)
		await expect(dismissedBand).toHaveBeenCalledOnce()
	},
})

export const PickerOpen = meta.story({
	name: "3b · Picker open, switching to Pico",
	render: () => <EmptyHome />,
	parameters: withDescription(
		"The agent picker open from the chip: every agent with its avatar, name and role, a check on the selected one. Arrow keys move through the list, Escape closes it and gives focus back to the chip; the story leaves it open on Pico.",
	),
	play: async ({ canvas, userEvent }) => {
		const chip = canvas.getByRole("button", { name: "Atlas" })
		await userEvent.click(chip)
		const menu = await screen.findByRole("menu")
		await expect(
			screen.getByRole("menuitemradio", { name: /Atlas/ }),
		).toHaveAttribute("aria-checked", "true")
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(menu).not.toBeInTheDocument())
		await expect(chip).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await screen.findByRole("menu")
		await waitFor(() =>
			expect(
				screen.getByRole("menuitemradio", { name: /Atlas/ }),
			).toHaveFocus(),
		)
		await userEvent.keyboard("{ArrowDown}")
		await waitFor(() =>
			expect(screen.getByRole("menuitemradio", { name: /Pico/ })).toHaveFocus(),
		)
	},
})

export const NoBand = meta.story({
	name: "3c · Pico has Applications, no band",
	render: () => <EmptyHome agent={PICO} hasBand={false} />,
	parameters: withDescription(
		"Reach for this once the selected agent has Applications: no band, the field card is the whole composer. Picking an agent in the menu hands its id back and closes the menu.",
	),
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Pico" }))
		await userEvent.click(
			await screen.findByRole("menuitemradio", { name: /Atlas/ }),
		)
		await expect(selectedAgent).toHaveBeenCalledWith("atlas")
		await waitFor(() =>
			expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
		)
	},
})

export const PickerWithoutAgents = meta.story({
	name: "Picker without agents",
	tags: ["test-only"],
	render: () => (
		<HomeLayout stage="empty">
			<HomeComposer
				agents={[]}
				onAttach={attached}
				onSelectAgent={selectedAgent}
				selectedAgentId="atlas"
			/>
		</HomeLayout>
	),
	parameters: withDescription(
		"Proves the composer before any agent exists in the Space, a case no artboard draws: the chip keeps an accessible name and the field falls back to the plain placeholder, with no dangling agent name.",
	),
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: "Agents" })).toBeVisible()
		await expect(canvas.getByRole("textbox")).toHaveAttribute(
			"placeholder",
			"Message",
		)
	},
})

export const FieldFilled = meta.story({
	name: "4a · Field filled",
	render: () => <EmptyHome draft={FLIGHTS_ASK} />,
	parameters: withDescription(
		"The field holds text: send fills in the Space colour and becomes enabled. Pick `3a` for the idle send button.",
	),
	play: async ({ canvas }) => {
		const send = canvas.getByRole("button", { name: "Send" })
		await expect(send).toBeEnabled()
		await expect(send).toHaveAttribute("data-filled", "true")
	},
})

export const FilesAttached = meta.story({
	name: "4d · Files attached, before sending",
	render: () => <EmptyHome attachments={PROMPT_ATTACHMENTS} />,
	parameters: withDescription(
		"Files staged before the first message: the chips sit above the field inside the field card, as in Prompt, and send is enabled with the field empty. Removing a chip keeps focus in the composer. No artboard draws this state.",
	),
	play: async ({ canvas, userEvent }) => {
		await expect(canvas.getAllByRole("listitem")).toHaveLength(2)
		await expect(canvas.getByRole("textbox")).toHaveValue("")
		const send = canvas.getByRole("button", { name: "Send" })
		await expect(send).toBeEnabled()
		await expect(send).toHaveAttribute("data-filled", "true")
		await userEvent.click(
			canvas.getByRole("button", { name: /release-notes\.md/ }),
		)
		await expect(removedAttachment).toHaveBeenCalledWith("notes")
		await expect(canvas.getByRole("textbox")).toHaveFocus()
	},
})

export const Loading = meta.story({
	name: "5a · Loading",
	render: () => (
		<HomeLayout stage="empty">
			<HomeGreetingSkeleton />
			<HomeComposerSkeleton />
		</HomeLayout>
	),
	parameters: withDescription(
		"Reach for this while the Space and its agents load: the greeting and the composer drawn as skeletons, Add files and send idle, nothing focusable.",
	),
})

export const CouldNotSend = meta.story({
	name: "5b · Couldn't send",
	render: () => (
		<>
			<EmptyHome draft={FLIGHTS_ASK} />
			<NoticeSurface />
		</>
	),
	beforeEach: () => () => {
		if (raisedSendFailure) endNotice(raisedSendFailure)
	},
	parameters: withDescription(
		"A send that failed: the failure notice says so, the message is back in the field and send is filled again. The notice is the window's notice surface, anchored where the shell anchors it.",
	),
	play: async () => {
		raisedSendFailure = raiseFailureNotice({
			title: "Couldn’t send that request",
			description: "Your message is back in the field.",
			action: { label: "Retry", onPress: fn() },
		})
		const titles = await screen.findAllByText("Couldn’t send that request")
		await expect(titles.length).toBeGreaterThan(0)
	},
})

export const FreshAfterRelaunch = meta.story({
	name: "6a · Fresh Home after relaunch",
	render: () => (
		<EmptyHome
			after={
				<HomeArchivedLine
					agentName="Atlas"
					onOpen={openedArchive}
					period="morning"
				/>
			}
			hasBand={false}
			period="afternoon"
		/>
	),
	parameters: withDescription(
		"Reach for this after a relaunch: the Home starts empty again and a line under the composer says where the earlier conversation went. Open it calls back.",
	),
	play: async ({ canvas, userEvent }) => {
		await expect(
			canvas.getByText(
				"This morning’s conversation with Atlas is archived in Conversations.",
			),
		).toBeVisible()
		await userEvent.click(canvas.getByRole("button", { name: "Open it" }))
		await expect(openedArchive).toHaveBeenCalledOnce()
	},
})
