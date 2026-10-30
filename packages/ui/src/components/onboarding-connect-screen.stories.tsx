import { useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectNoHorizontalScrollAt,
	expectOnboardingDragStrip,
	hueScopeOf,
	resolvedChannelsOf,
	slotIn,
	slotsIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import {
	OnboardingConnectScreen,
	type OnboardingConnectScreenProps,
} from "@workspace/ui/components/onboarding-connect-screen"
import { OnboardingShell } from "@workspace/ui/components/onboarding-shell"

const ARTBOARD =
	"Measured against the Paper file `Kiroshi, Onboarding v2`, 1200 by 760, in a blue Space."

const FLOW_FINAL =
	"Measured against the Paper page `Flow · Final`, 1200 by 680, in a blue Space."

const WITHOUT_CLAUDE_CODE = `${ARTBOARD} Page \`Without Claude Code\`.`

const PASTED_CODE = "kX2v9QmTa4Lr#8bHn3Wp"

const REFUSED_KEY = "sk-ant-api03-••••••••••••Qx4"

const LONG_EMAIL =
	"alexandra.montgomery-whitfield.engineering.department@example-corporation.com"

type ConnectPlayContext = {
	canvasElement: HTMLElement
	title: string
	action: string
}

const expectConnect = async ({
	canvasElement,
	title,
	action,
}: ConnectPlayContext) => {
	const canvas = within(canvasElement)
	const primary = canvas.getByRole("button", { name: action })

	await expect(
		canvas.getByRole("heading", { level: 1, name: title }),
	).toBeVisible()
	await expect(primary).toBeVisible()
	await expect(slotIn(canvasElement, "onboarding-controls")).toContainElement(
		primary,
	)
	await expect(slotsIn(canvasElement, "onboarding-connect-tile")).toHaveLength(
		0,
	)
	await withMotionAllowed(() =>
		expect(getComputedStyle(primary).transitionDuration).toBe("0s"),
	)
	await expectInsideSlot(slotIn(canvasElement, "onboarding-content"))
	await expectInsideSlot(slotIn(canvasElement, "onboarding-controls"))
	await expectNoHorizontalScrollAt(canvasElement, 320, "onboarding-shell")
}

const expectInsideSlot = async (slot: HTMLElement) => {
	const bounds = slot.getBoundingClientRect()
	await expect(slot.scrollHeight).toBeLessThanOrEqual(slot.clientHeight)
	for (const child of slot.children) {
		const { top, bottom } = child.getBoundingClientRect()
		await expect(top).toBeGreaterThanOrEqual(bounds.top)
		await expect(bottom).toBeLessThanOrEqual(bounds.bottom)
	}
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

const meta = preview.meta({
	afterEach: ({ canvasElement }) => expectOnboardingDragStrip(canvasElement),
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
					"The onboarding step that connects a model provider, on the onboarding shell: a 352px content slot aligned to its bottom, holding the title, the body and what the step asks for, above a 120px controls slot holding the primary button and the secondary actions, so the controls sit at one height on every step. Eleven steps the host chooses: a Claude login found on this computer, another account, nothing found, waiting for the code from the browser, connecting, three sign-in failures, the agent missing, the key field and a refused key. The two ways to connect are a radio group the arrow keys walk, the first picked on entry. Every field carries a visible label; a refused key marks its field invalid and ties the failure sentence to it; Connecting… is disabled and busy. The primary button and the picked option wear the Space colour.",
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
				story: `${FLOW_FINAL} Artboard 2.1: a Claude login was found in Claude Code. Check the account card above the title, with the initials the host passes, the email and the plan, then Use this account and Use another account in the controls slot, with no tile and no Continue. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectConnect({
			canvasElement,
			title: "Use the account already on your computer?",
			action: "Use this account",
		})
		const card = slotIn(canvasElement, "onboarding-connect-account")
		await expect(card).toHaveTextContent(
			"AMalex.martin@example.comClaude Max · found in Claude Code",
		)
		await expect(
			card.compareDocumentPosition(canvas.getByRole("heading", { level: 1 })) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
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

		const another = canvas.getByRole("button", { name: "Use another account" })
		await userEvent.tab({ shift: true })
		await userEvent.tab()
		await expect(another).toHaveFocus()
		await expect(getComputedStyle(another).boxShadow).toMatch(/\b3px\b/)
		await withMotionAllowed(() =>
			expect(getComputedStyle(another).transitionDuration).toBe("0s"),
		)
	},
})

export const ConnectLoginFoundDark = meta.story({
	name: "Connect / Login found / Dark",
	args: { step: "loginFound" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${FLOW_FINAL} Artboard 2.1, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectConnect({
			canvasElement,
			title: "Use the account already on your computer?",
			action: "Use this account",
		})
	},
})

export const ConnectLoginFoundLongEmail = meta.story({
	name: "Connect / Login found / Long email",
	tags: ["test-only"],
	args: {
		step: "loginFound",
		account: { email: LONG_EMAIL, initials: "AM", plan: "Claude Max" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"An email with no break opportunity, longer than the card. Check that it wraps inside the 360px card and the card keeps its width.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const card = slotIn(canvasElement, "onboarding-connect-account")
		const email = canvas.getByText(LONG_EMAIL)
		await expect(card.getBoundingClientRect().width).toBe(360)
		await expect(email.scrollWidth).toBeLessThanOrEqual(email.clientWidth)
		await expect(email.getBoundingClientRect().height).toBeGreaterThan(22)
	},
})

type MethodChoiceContext = {
	canvasElement: HTMLElement
	title: string
	body: string
}

const expectMethodChoice = async ({
	canvasElement,
	title,
	body,
}: MethodChoiceContext) => {
	const canvas = within(canvasElement)
	await expectConnect({ canvasElement, title, action: "Continue" })
	await expect(canvas.getByText(body)).toBeVisible()
	await expect(canvas.getByRole("radiogroup", { name: title })).toBeVisible()
	await expect(
		canvas.getByRole("radio", { name: "Sign in with Claude" }),
	).toBeChecked()
	await expect(
		canvas.getByRole("radio", { name: "Paste an API key" }),
	).not.toBeChecked()
	await expect(
		canvas.queryByRole("button", { name: "Use another account" }),
	).not.toBeInTheDocument()
}

const expectPickedInPrimary = async (canvasElement: HTMLElement) => {
	const [picked, other] = slotsIn(canvasElement, "onboarding-connect-option")
	const primary = resolvedChannelsOf("var(--primary)", picked)
	const radioOf = (option: HTMLElement) => slotIn(option, "radio-group-item")
	await expect(
		resolvedChannelsOf(getComputedStyle(picked).borderTopColor, picked),
	).toEqual(primary)
	await expect(
		resolvedChannelsOf(
			getComputedStyle(radioOf(picked)).borderTopColor,
			picked,
		),
	).toEqual(primary)
	await expect(
		resolvedChannelsOf(getComputedStyle(other).borderTopColor, other),
	).not.toEqual(primary)
	await withMotionAllowed(() =>
		expect(getComputedStyle(picked).transitionDuration).toBe("0s"),
	)
}

type MethodChoicePlayContext = {
	args: OnboardingConnectScreenProps
	canvasElement: HTMLElement
}

const playMethodChoice = async ({
	args,
	canvasElement,
}: MethodChoicePlayContext) => {
	const canvas = within(canvasElement)
	const signIn = canvas.getByRole("radio", { name: "Sign in with Claude" })
	const pasteKey = canvas.getByRole("radio", { name: "Paste an API key" })
	const proceed = () =>
		userEvent.click(canvas.getByRole("button", { name: "Continue" }))

	await expect(signIn).toHaveAccessibleDescription(
		"Opens your browser once. Works with your Pro or Max subscription.",
	)
	await expectPickedInPrimary(canvasElement)

	await userEvent.tab()
	await expect(signIn).toHaveFocus()
	await expect(
		getComputedStyle(slotsIn(canvasElement, "onboarding-connect-option")[0])
			.boxShadow,
	).toMatch(/\b3px\b/)
	await userEvent.keyboard("{ArrowDown}")
	await expect(pasteKey).toBeChecked()
	await expect(pasteKey).toHaveFocus()
	await proceed()
	await expect(args.onPasteKey).toHaveBeenCalledOnce()
	await expect(args.onSignIn).not.toHaveBeenCalled()

	await userEvent.click(signIn)
	await expect(signIn).toBeChecked()
	await proceed()
	await expect(args.onSignIn).toHaveBeenCalledOnce()
}

export const ConnectAnotherAccountLight = meta.story({
	name: "Connect / Another account / Light",
	args: { step: "anotherAccount" },
	parameters: {
		docs: {
			description: {
				story: `${FLOW_FINAL} Artboard 2.2: the reader wants another account. Check the two options as a radio group, Sign in with Claude picked on entry with its card border and radio ring in the Space colour, the arrow keys moving the pick, and Continue calling the picked way. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		await expectMethodChoice({
			canvasElement,
			title: "How do you want to connect?",
			body: "Sign in again with a different one.",
		})
		await playMethodChoice({ args, canvasElement })
	},
})

export const ConnectAnotherAccountDark = meta.story({
	name: "Connect / Another account / Dark",
	args: { step: "anotherAccount" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${FLOW_FINAL} Artboard 2.2, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectMethodChoice({
			canvasElement,
			title: "How do you want to connect?",
			body: "Sign in again with a different one.",
		})
		await expectPickedInPrimary(canvasElement)
	},
})

const expectNothingFound = async (canvasElement: HTMLElement) =>
	expectMethodChoice({
		canvasElement,
		title: "Connect the model provider",
		body: "Your companions need a model to think with. Use your Claude subscription, or a key.",
	})

export const ConnectNothingFoundLight = meta.story({
	name: "Connect / Nothing found / Light",
	args: { step: "nothingFound" },
	parameters: {
		docs: {
			description: {
				story: `${FLOW_FINAL} Artboard 2.3: no login on this computer. Check the same radio group as 2.2 under its own title, with Continue alone in the controls slot. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		await expectNothingFound(canvasElement)
		await playMethodChoice({ args, canvasElement })
	},
})

export const ConnectNothingFoundDark = meta.story({
	name: "Connect / Nothing found / Dark",
	args: { step: "nothingFound" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${FLOW_FINAL} Artboard 2.3, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectNothingFound(canvasElement)
		await expectPickedInPrimary(canvasElement)
	},
})

export const ConnectWaitingForTheCodeLight = meta.story({
	name: "Connect / Waiting for the code / Light",
	args: { step: "waitingForCode" },
	parameters: {
		docs: {
			description: {
				story: `${FLOW_FINAL} Artboard 2.4: the browser opened claude.ai. Check the full paragraph, the spinner beside the waiting line announced politely and still under reduced motion, the labelled code field, Continue disabled at 45% yet focusable while the field is empty, and the two secondary actions side by side. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectConnect({
			canvasElement,
			title: "Sign in with Claude",
			action: "Continue",
		})
		await expect(
			canvas.getByText(
				"Your browser opened claude.ai. Sign in there with your Pro or Max subscription, then paste the code it shows you.",
			),
		).toBeVisible()
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Waiting for you to sign in, in your browser…",
		)
		await expectSpinnerStillUnderReducedMotion(canvasElement)
		const field = canvas.getByLabelText("Paste the code Claude gave you")
		await expect(field).toHaveAttribute("placeholder", "Code from Claude")
		const proceed = canvas.getByRole("button", { name: "Continue" })
		await expect(proceed).toHaveAttribute("aria-disabled", "true")
		await expect(getComputedStyle(proceed).opacity).toBe("0.45")
		const reopen = canvas.getByRole("button", {
			name: "Open the sign-in page again",
		})
		const pasteKey = canvas.getByRole("button", { name: "Paste a key instead" })
		await expect(reopen.getBoundingClientRect().top).toBe(
			pasteKey.getBoundingClientRect().top,
		)

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
				story: `${FLOW_FINAL} Artboard 2.4, dark. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectConnect({
			canvasElement,
			title: "Sign in with Claude",
			action: "Continue",
		})
	},
})

const expectConnecting = async (canvasElement: HTMLElement) => {
	const canvas = within(canvasElement)
	await expectConnect({
		canvasElement,
		title: "Sign in with Claude",
		action: "Connecting…",
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
		await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
		await expect(args.onSubmitKey).toHaveBeenCalledTimes(2)

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
		})
	},
})

const expectKeyRefused = async (canvasElement: HTMLElement) => {
	const canvas = within(canvasElement)
	await expectConnect({
		canvasElement,
		title: "Couldn’t use that key",
		action: "Try another key",
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

const STEPS_SHARING_THE_CONTROLS_ROW = [
	"loginFound",
	"nothingFound",
	"waitingForCode",
] as const

export const ConnectControlsAtOneHeight = meta.story({
	name: "Connect / Controls at one height",
	tags: ["test-only"],
	render: (args) => (
		<div className="grid grid-cols-3">
			{STEPS_SHARING_THE_CONTROLS_ROW.map((step) => (
				<OnboardingConnectScreen {...args} key={step} step={step} />
			))}
		</div>
	),
	args: { step: "loginFound" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboards 2.1, 2.3 and 2.4 side by side. Check that the controls slot starts at the same height on all three, whatever the content above it holds.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const tops = slotsIn(canvasElement, "onboarding-controls").map(
			(controls) => controls.getBoundingClientRect().top,
		)
		await expect(tops).toHaveLength(STEPS_SHARING_THE_CONTROLS_ROW.length)
		await expect(new Set(tops).size).toBe(1)
	},
})
