import { useState } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectNoHorizontalScrollAt,
	glyphIn,
	hueScopeOf,
	slotIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import {
	OnboardingConnectScreen,
	type OnboardingConnectScreenProps,
} from "@workspace/ui/components/onboarding-connect-screen"
import { OnboardingShell } from "@workspace/ui/components/onboarding-shell"

const ARTBOARD =
	"Measured against the Paper file `Kiroshi, Onboarding v2`, 1200 by 760, in a blue Space."

const WITH_CLAUDE_CODE = `${ARTBOARD} Page \`With Claude Code\`.`

const WITHOUT_CLAUDE_CODE = `${ARTBOARD} Page \`Without Claude Code\`.`

const PASTED_CODE = "kX2v9QmTa4Lr#8bHn3Wp"

const REFUSED_KEY = "sk-ant-api03-••••••••••••Qx4"

type ConnectPlayContext = {
	canvasElement: HTMLElement
	title: string
	action: string
	glyph: Icon
}

const expectConnect = async ({
	canvasElement,
	title,
	action,
	glyph,
}: ConnectPlayContext) => {
	const canvas = within(canvasElement)
	const primary = canvas.getByRole("button", { name: action })

	await expect(
		canvas.getByRole("heading", { level: 1, name: title }),
	).toBeVisible()
	await expect(primary).toBeVisible()
	await expect(
		glyphIn(slotIn(canvasElement, "onboarding-connect-tile"), glyph),
	).not.toBe(null)
	await withMotionAllowed(() =>
		expect(getComputedStyle(primary).transitionDuration).toBe("0s"),
	)
	await expectNoHorizontalScrollAt(canvasElement, 320, "onboarding-shell")
}

const expectSpinnerStillUnderReducedMotion = async (
	canvasElement: HTMLElement,
) => {
	const spinner = slotIn(canvasElement, "onboarding-connect-spinner")
	await expect(getComputedStyle(spinner).animationName).toBe("none")
	await withMotionAllowed(() =>
		expect(getComputedStyle(spinner).animationName).not.toBe("none"),
	)
}

const ConnectScreenHoldingItsFields = (props: OnboardingConnectScreenProps) => {
	const [code, setCode] = useState(props.code)
	const [apiKey, setApiKey] = useState(props.apiKey)

	return (
		<OnboardingConnectScreen
			{...props}
			apiKey={apiKey}
			code={code}
			onApiKeyChange={(value) => {
				props.onApiKeyChange(value)
				setApiKey(value)
			}}
			onCodeChange={(value) => {
				props.onCodeChange(value)
				setCode(value)
			}}
		/>
	)
}

const RING_OF_KEYBOARD_FOCUS = /\b3px\b/

const meta = preview.meta({
	title: "Feedback/OnboardingConnectScreen",
	component: OnboardingConnectScreen,
	subcomponents: { OnboardingShell },
	render: (args) => <ConnectScreenHoldingItsFields {...args} />,
	decorators: [
		(Story) => (
			<div {...hueScopeOf("blue")}>
				<Story />
			</div>
		),
	],
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The onboarding step that connects a model provider, on the onboarding shell with no footer: a 56px tile, a title and a body, then what the step asks for. Ten steps the host chooses: a Claude login found on this machine, nothing found, waiting for the code from the browser, connecting, three sign-in failures, the agent missing, the key field and a refused key. Every field carries a visible label; a refused key marks its field invalid and ties the failure sentence to it; Connecting… is disabled and busy. The primary button wears the Space colour.",
			},
		},
	},
	args: {
		code: "",
		apiKey: "",
		account: {
			email: "alex.martin@example.com",
			initials: "AM",
			plan: "Claude Max",
		},
		onCodeChange: fn(),
		onApiKeyChange: fn(),
		onUseAccount: fn(),
		onUseAnotherAccount: fn(),
		onSignIn: fn(),
		onReopenSignIn: fn(),
		onPasteKey: fn(),
		onSubmitCode: fn(),
		onSubmitKey: fn(),
		onTryAnotherKey: fn(),
		onDownloadAgain: fn(),
	},
})

export const ConnectLoginFoundLight = meta.story({
	name: "Connect / Login found / Light",
	args: { step: "loginFound" },
	parameters: {
		docs: {
			description: {
				story: `${WITH_CLAUDE_CODE} Artboard 2A: a Claude login was found in Claude Code. Check the link tile, the account card with its initials, email and plan, Use this account and the Use another account link, with no Continue. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectConnect({
			canvasElement,
			title: "Use the account already on this machine?",
			action: "Use this account",
			glyph: Icons.Link,
		})
		await expect(
			slotIn(canvasElement, "onboarding-connect-account"),
		).toHaveTextContent(
			"alex.martin@example.comClaude Max · found in Claude Code",
		)
		await expect(
			canvas.queryByRole("button", { name: "Continue" }),
		).not.toBeInTheDocument()

		await userEvent.click(
			canvas.getByRole("button", { name: "Use this account" }),
		)
		await expect(args.onUseAccount).toHaveBeenCalledOnce()
		await userEvent.click(
			canvas.getByRole("button", { name: "Use another account" }),
		)
		await expect(args.onUseAnotherAccount).toHaveBeenCalledOnce()
	},
})

export const ConnectLoginFoundDark = meta.story({
	name: "Connect / Login found / Dark",
	args: { step: "loginFound" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${WITH_CLAUDE_CODE} Artboard 2A, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectConnect({
			canvasElement,
			title: "Use the account already on this machine?",
			action: "Use this account",
			glyph: Icons.Link,
		})
	},
})

const expectNothingFound = async (canvasElement: HTMLElement) =>
	expectConnect({
		canvasElement,
		title: "Connect the model provider",
		action: "Sign in with Claude",
		glyph: Icons.Link,
	})

export const ConnectNothingFoundLight = meta.story({
	name: "Connect / Nothing found / Light",
	args: { step: "nothingFound" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.1: no login on this machine. Check the two numbered options on the card surface, Sign in with Claude and Paste an API key, each calling back. The first option stands for the primary action, since the artboard draws no button. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectNothingFound(canvasElement)

		await expect(
			canvas.getByRole("button", { name: "Sign in with Claude" }),
		).toHaveAccessibleDescription(
			"Opens your browser once. Works with your Pro or Max subscription.",
		)
		await userEvent.click(
			canvas.getByRole("button", { name: "Sign in with Claude" }),
		)
		await expect(args.onSignIn).toHaveBeenCalledOnce()
		await userEvent.click(
			canvas.getByRole("button", { name: "Paste an API key" }),
		)
		await expect(args.onPasteKey).toHaveBeenCalledOnce()

		await userEvent.tab({ shift: true })
		const signIn = canvas.getByRole("button", { name: "Sign in with Claude" })
		await expect(signIn).toHaveFocus()
		await expect(getComputedStyle(signIn).boxShadow).toMatch(
			RING_OF_KEYBOARD_FOCUS,
		)

		const pasteKey = canvas.getByRole("button", { name: "Paste an API key" })
		const { userEvent: pointer } = await import("vitest/browser")
		await pointer.hover(signIn)
		await expect(getComputedStyle(signIn).backgroundColor).not.toBe(
			getComputedStyle(pasteKey).backgroundColor,
		)
		await withMotionAllowed(() =>
			expect(getComputedStyle(signIn).transitionDuration).toBe("0s"),
		)
		await pointer.unhover(signIn)
	},
})

export const ConnectNothingFoundDark = meta.story({
	name: "Connect / Nothing found / Dark",
	args: { step: "nothingFound" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.1, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectNothingFound(canvasElement)
	},
})

export const ConnectWaitingForTheCodeLight = meta.story({
	name: "Connect / Waiting for the code / Light",
	args: { step: "waitingForCode" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.2: the browser opened claude.ai. Check the globe tile, the spinner beside the waiting line announced politely and still under reduced motion, the labelled code field, Continue disabled yet focusable while the field is empty, and the two links. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectConnect({
			canvasElement,
			title: "Sign in with Claude",
			action: "Continue",
			glyph: Icons.Web,
		})
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Waiting for you to sign in, in your browser…",
		)
		await expectSpinnerStillUnderReducedMotion(canvasElement)
		const field = canvas.getByLabelText("Paste the code Claude gave you")
		await expect(field).toHaveAttribute("placeholder", "Code from Claude")
		await expect(
			canvas.getByRole("button", { name: "Continue" }),
		).toHaveAttribute("aria-disabled", "true")

		await userEvent.click(field)
		await expect(getComputedStyle(field).boxShadow).not.toBe("none")
		await userEvent.keyboard("{Enter}")
		await expect(args.onSubmitCode).not.toHaveBeenCalled()
		await userEvent.type(field, `${PASTED_CODE}{Enter}`)
		await expect(args.onCodeChange).toHaveBeenLastCalledWith(PASTED_CODE)
		await expect(args.onSubmitCode).toHaveBeenCalledOnce()
		await expect(args.onSubmitCode).toHaveBeenCalledWith(PASTED_CODE)
		await userEvent.click(
			canvas.getByRole("button", { name: "Open the sign-in page again" }),
		)
		await expect(args.onReopenSignIn).toHaveBeenCalledOnce()
		await userEvent.click(
			canvas.getByRole("button", { name: "Paste a key instead" }),
		)
		await expect(args.onPasteKey).toHaveBeenCalledOnce()
	},
})

export const ConnectWaitingForTheCodeDark = meta.story({
	name: "Connect / Waiting for the code / Dark",
	args: { step: "waitingForCode" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.2, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectConnect({
			canvasElement,
			title: "Sign in with Claude",
			action: "Continue",
			glyph: Icons.Web,
		})
	},
})

const expectConnecting = async (canvasElement: HTMLElement) => {
	const canvas = within(canvasElement)
	await expectConnect({
		canvasElement,
		title: "Sign in with Claude",
		action: "Connecting…",
		glyph: Icons.Web,
	})
	const button = canvas.getByRole("button", { name: "Connecting…" })
	await expect(button).toHaveAttribute("aria-disabled", "true")
	await expect(button).toHaveAttribute("aria-busy", "true")
	await expect(canvas.getByRole("status")).toHaveTextContent(
		"Checking the code with Claude…",
	)
	await expect(
		canvas.getByLabelText("Paste the code Claude gave you"),
	).toHaveValue(PASTED_CODE)
	await expect(
		canvas.queryByRole("button", { name: "Paste a key instead" }),
	).not.toBeInTheDocument()
}

export const ConnectConnectingLight = meta.story({
	name: "Connect / Connecting / Light",
	args: { step: "connecting", code: PASTED_CODE },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.3: the pasted code is being checked. Check the checking line, the filled field, Connecting… disabled and busy, and no links. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectConnecting(canvasElement)
		await expectSpinnerStillUnderReducedMotion(canvasElement)

		await userEvent.click(
			canvas.getByLabelText("Paste the code Claude gave you"),
		)
		await userEvent.keyboard("{Enter}")
		await expect(args.onSubmitCode).not.toHaveBeenCalled()
	},
})

export const ConnectConnectingDark = meta.story({
	name: "Connect / Connecting / Dark",
	args: { step: "connecting", code: PASTED_CODE },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.3, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectConnecting(canvasElement)
	},
})

type SignInFailedContext = { canvasElement: HTMLElement; body: string }

const expectSignInFailed = async ({
	canvasElement,
	body,
}: SignInFailedContext) => {
	await expectConnect({
		canvasElement,
		title: "Couldn’t sign you in",
		action: "Try again",
		glyph: Icons.AlertCircle,
	})
	await expect(within(canvasElement).getByText(body)).toBeVisible()
}

export const ConnectFailedCancelledLight = meta.story({
	name: "Connect / Failed / Cancelled / Light",
	args: { step: "cancelled" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.4: the reader cancelled the sign-in. Check the failure tile on the destructive tint, Try again and the Paste a key instead link. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectSignInFailed({
			canvasElement,
			body: "The sign-in was cancelled. Try again, or paste a key instead.",
		})

		await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
		await expect(args.onSignIn).toHaveBeenCalledOnce()
		await userEvent.click(
			canvas.getByRole("button", { name: "Paste a key instead" }),
		)
		await expect(args.onPasteKey).toHaveBeenCalledOnce()
	},
})

export const ConnectFailedCancelledDark = meta.story({
	name: "Connect / Failed / Cancelled / Dark",
	args: { step: "cancelled" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.4, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSignInFailed({
			canvasElement,
			body: "The sign-in was cancelled. Try again, or paste a key instead.",
		})
	},
})

export const ConnectFailedTimedOutLight = meta.story({
	name: "Connect / Failed / Timed out / Light",
	args: { step: "timedOut" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.5: the sign-in timed out. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSignInFailed({
			canvasElement,
			body: "The sign-in timed out. Try again, or paste a key instead.",
		})
	},
})

export const ConnectFailedTimedOutDark = meta.story({
	name: "Connect / Failed / Timed out / Dark",
	args: { step: "timedOut" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.5, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSignInFailed({
			canvasElement,
			body: "The sign-in timed out. Try again, or paste a key instead.",
		})
	},
})

export const ConnectFailedLinkRefusedLight = meta.story({
	name: "Connect / Failed / Link refused / Light",
	args: { step: "linkRefused" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.6: the sign-in link was refused. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSignInFailed({
			canvasElement,
			body: "The sign-in link was refused. Try again, or paste a key instead.",
		})
	},
})

export const ConnectFailedLinkRefusedDark = meta.story({
	name: "Connect / Failed / Link refused / Dark",
	args: { step: "linkRefused" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.6, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSignInFailed({
			canvasElement,
			body: "The sign-in link was refused. Try again, or paste a key instead.",
		})
	},
})

const expectAgentMissing = async (canvasElement: HTMLElement) => {
	await expectConnect({
		canvasElement,
		title: "Couldn’t find the agent",
		action: "Download Kiroshi again",
		glyph: Icons.AlertCircle,
	})
	await expect(
		within(canvasElement)
			.getAllByRole("button")
			.map((button) => button.textContent),
	).toEqual(["Download Kiroshi again"])
}

export const ConnectFailedAgentMissingLight = meta.story({
	name: "Connect / Failed / Agent missing / Light",
	args: { step: "agentMissing" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.7: the agent is missing from this install. Check Download Kiroshi again as the only control. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectAgentMissing(canvasElement)

		await userEvent.click(
			canvas.getByRole("button", { name: "Download Kiroshi again" }),
		)
		await expect(args.onDownloadAgain).toHaveBeenCalledOnce()
	},
})

export const ConnectFailedAgentMissingDark = meta.story({
	name: "Connect / Failed / Agent missing / Dark",
	args: { step: "agentMissing" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.7, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAgentMissing(canvasElement)
	},
})

export const ConnectKeyFieldLight = meta.story({
	name: "Connect / Key field / Light",
	args: { step: "keyField" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.8: the reader pastes an Anthropic API key. Check the key tile, the labelled Key field with its sk-ant-… placeholder, Continue disabled yet focusable while the field is empty, and Sign in instead. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectConnect({
			canvasElement,
			title: "Paste your Anthropic API key",
			action: "Continue",
			glyph: Icons.Key,
		})
		const field = canvas.getByLabelText("Key")
		await expect(field).toHaveAttribute("placeholder", "sk-ant-…")
		await expect(field).not.toHaveAttribute("aria-invalid")
		await expect(
			canvas.getByRole("button", { name: "Continue" }),
		).toHaveAttribute("aria-disabled", "true")

		await userEvent.click(field)
		await userEvent.keyboard("{Enter}")
		await expect(args.onSubmitKey).not.toHaveBeenCalled()
		await userEvent.type(field, `${REFUSED_KEY}{Enter}`)
		await expect(args.onSubmitKey).toHaveBeenCalledOnce()
		await expect(args.onSubmitKey).toHaveBeenCalledWith(REFUSED_KEY)

		await userEvent.click(
			canvas.getByRole("button", { name: "Sign in instead" }),
		)
		await expect(args.onSignIn).toHaveBeenCalledOnce()
	},
})

export const ConnectKeyFieldDark = meta.story({
	name: "Connect / Key field / Dark",
	args: { step: "keyField" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.8, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectConnect({
			canvasElement,
			title: "Paste your Anthropic API key",
			action: "Continue",
			glyph: Icons.Key,
		})
	},
})

const expectKeyRefused = async (canvasElement: HTMLElement) => {
	const canvas = within(canvasElement)
	await expectConnect({
		canvasElement,
		title: "Couldn’t use that key",
		action: "Try another key",
		glyph: Icons.AlertCircle,
	})
	const field = canvas.getByLabelText("Key")
	await expect(field).toHaveValue(REFUSED_KEY)
	await expect(field).toHaveAttribute("aria-invalid", "true")
	await expect(field).toHaveAccessibleDescription(
		"That key was refused, so nothing was saved.",
	)
}

export const ConnectKeyRefusedLight = meta.story({
	name: "Connect / Key refused / Light",
	args: { step: "keyRefused", apiKey: REFUSED_KEY },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.9: the provider refused the key. Check the failure tile, the Key field invalid with a destructive border and ring, the failure sentence describing it, Try another key and Sign in instead. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectKeyRefused(canvasElement)

		await userEvent.click(
			canvas.getByRole("button", { name: "Try another key" }),
		)
		await expect(args.onTryAnotherKey).toHaveBeenCalledOnce()
	},
})

export const ConnectKeyRefusedDark = meta.story({
	name: "Connect / Key refused / Dark",
	args: { step: "keyRefused", apiKey: REFUSED_KEY },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${WITHOUT_CLAUDE_CODE} Artboard 2B.9, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectKeyRefused(canvasElement)
	},
})
