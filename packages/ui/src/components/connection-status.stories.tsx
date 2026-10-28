import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	listExhaustively,
	Row,
	resolvedRootColor,
} from "@workspace/storybook/story-utils"
import {
	ConnectionStatus,
	type ConnectionStatusState,
} from "@workspace/ui/components/connection-status"

const AGENT_NAME = "Nest Keeper"

const CONNECTION_STATUS_STATES = listExhaustively<ConnectionStatusState>({
	checking: true,
	ready: true,
	unavailable: true,
	crashed: true,
})

const E3_DARK_CONNECTED = "rgb(95, 191, 133)"

const expectReadyDot = async (
	canvasElement: HTMLElement,
	backgroundColor: string,
) => {
	const dot = canvasElement.querySelector<HTMLElement>(
		'[data-slot="connection-status"] > [aria-hidden="true"]',
	)
	if (!dot) throw new Error("No dot in the connection status.")
	await expect(dot).toHaveClass("bg-success")
	await expect(getComputedStyle(dot).backgroundColor).toBe(backgroundColor)
}

const meta = preview.meta({
	title: "Feedback/ConnectionStatus",
	component: ConnectionStatus,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Reports whether the local agent can be reached, as a single coloured dot inside the header's identity button. The copy stays for screen readers only, so the header carries no prose. It holds no action: recovery belongs to Notice or ChatEmptyState, which is why this never renders a button. It reports the CLI, never the turn — a running turn shows up in the transcript, not here.",
			},
		},
	},
	args: { state: "ready", version: "2.1.233" },
	argTypes: {
		state: { control: "inline-radio", options: CONNECTION_STATUS_STATES },
	},
})

export const Default = meta.story({
	args: { name: AGENT_NAME, state: "ready", version: "2.1.233" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this once the preflight answered: the binary resolved, reported its version, and the composer below is live. Check that nothing but the green dot is painted, while the label and version still reach a screen reader. Pick `Variants` to compare it against the three states where typing would fail.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("status")).toHaveTextContent(
			`${AGENT_NAME} is ready v2.1.233`,
		)
		await expect(canvas.getByRole("status")).toHaveClass("sr-only")
		await expectReadyDot(canvasElement, resolvedRootColor("--success"))
	},
})

export const DefaultDark = meta.story({
	globals: { theme: "dark" },
	args: Default.input.args,
	parameters: {
		docs: {
			description: {
				story:
					"The ready state in the dark theme. Check that the dot wears the same green as the connected applications of the settings menu.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectReadyDot(canvasElement, E3_DARK_CONNECTED)
	},
})

export const Variants = meta.story({
	tags: ["test-only"],
	args: { name: AGENT_NAME, state: "ready" },
	parameters: {
		docs: {
			description: {
				story:
					"Every state the preflight and the session can land in, top to bottom. Check that `checking` is the only one that animates, and that `unavailable` and `crashed` share the destructive dot while keeping distinct copy — one means the CLI was never reachable, the other that it died mid-session. Pick `ZeroValue` for the window before a version is known.",
			},
		},
	},
	render: () => (
		<div className="flex flex-col gap-3">
			{CONNECTION_STATUS_STATES.map((state) => (
				<Row key={state}>
					<ConnectionStatus name={AGENT_NAME} state={state} version="2.1.233" />
				</Row>
			))}
		</div>
	),
})

export const ZeroValue = meta.story({
	args: { name: AGENT_NAME, state: "checking", version: null },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the first frame after launch: the check is in flight, so no version exists yet. Check that the version slot collapses instead of rendering an empty `v`, and that the label carries the wait on its own. Pick `Default` once the binary has answered.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("status")).toHaveTextContent(
			`Checking ${AGENT_NAME}…`,
		)
		await expect(canvas.queryByText(/^v/)).toBeNull()
	},
})
