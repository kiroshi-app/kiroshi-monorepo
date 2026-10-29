import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectNoHorizontalScrollAt,
	hueScopeOf,
	slotIn,
	slotsIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { OnboardingShell } from "@workspace/ui/components/onboarding-shell"
import { OnboardingWelcomeFooter } from "@workspace/ui/components/onboarding-welcome-footer"
import { OnboardingWelcomeScreen } from "@workspace/ui/components/onboarding-welcome-screen"

const ARTBOARD =
	"Measured against the Paper file `Kiroshi, Onboarding v2`, pages `With Claude Code` and `Without Claude Code`, which draw the Welcome screens alike, 1200 by 760, in a blue Space."

type WelcomePlayContext = {
	canvasElement: HTMLElement
	title: string
	action: string
	step: string
	current: number
}

const expectWelcome = async ({
	canvasElement,
	title,
	action,
	step,
	current,
}: WelcomePlayContext) => {
	const canvas = within(canvasElement)
	const footer = slotIn(canvasElement, "onboarding-welcome-footer")
	const dots = slotsIn(footer, "onboarding-step-dot")
	const primary = canvas.getByRole("button", { name: action })

	await expect(
		canvas.getByRole("heading", { level: 1, name: title }),
	).toBeVisible()
	await expect(primary).toBeVisible()
	await withMotionAllowed(() =>
		expect(getComputedStyle(primary).transitionDuration).toBe("0s"),
	)
	await expect(within(footer).getByText(step)).toBeVisible()
	await expect(dots[0]?.parentElement).toHaveAttribute("aria-hidden", "true")
	await expect(dots.map((dot) => dot.getBoundingClientRect().width)).toEqual(
		[1, 2, 3].map((dot) => (dot === current ? 18 : 6)),
	)
	await expect(
		slotIn(footer, "onboarding-welcome-skip").getBoundingClientRect().width,
	).toBe(160)
	await expectNoHorizontalScrollAt(canvasElement, 320, "onboarding-shell")
}

const meta = preview.meta({
	title: "Feedback/OnboardingWelcomeScreen",
	component: OnboardingWelcomeScreen,
	subcomponents: { OnboardingShell, OnboardingWelcomeFooter },
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
					"The three Welcome screens a reader meets before connecting a model provider: an illustration, a title and a body in one centred column on the onboarding shell, and a footer with Skip intro, the step dots, the step count and the primary action. The current dot is the wide one; the dots are hidden from assistive technology, which reads the step count instead. On the last step Skip intro keeps its slot but is gone from sight and from assistive technology, and the action reads Get started. The primary action wears the Space colour.",
			},
		},
	},
	args: {
		onSkip: fn(),
		onNext: fn(),
	},
})

export const WelcomeCompanionsLight = meta.story({
	name: "Welcome / Companions / Light",
	args: { step: "companions" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 1.1: three companions on bot avatars, 96, 132 and 96, the middle one lifted. Check the names and jobs, the first dot wide, 1 of 3, and Next calling back. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectWelcome({
			canvasElement,
			title: "Companions do the work with you",
			action: "Next",
			step: "1 of 3",
			current: 1,
		})
		await expect(
			slotsIn(canvasElement, "bot-identity-avatar").map(
				(avatar) => avatar.getBoundingClientRect().width,
			),
		).toEqual([96, 132, 96])

		await userEvent.click(canvas.getByRole("button", { name: "Next" }))
		await expect(args.onNext).toHaveBeenCalledOnce()
		await userEvent.click(canvas.getByRole("button", { name: "Skip intro" }))
		await expect(args.onSkip).toHaveBeenCalledOnce()
	},
})

export const WelcomeCompanionsDark = meta.story({
	name: "Welcome / Companions / Dark",
	args: { step: "companions" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 1.1, dark. Check the same layout on the dark page, the wide dot in the foreground colour. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectWelcome({
			canvasElement,
			title: "Companions do the work with you",
			action: "Next",
			step: "1 of 3",
			current: 1,
		})
	},
})

export const WelcomeConversationsLight = meta.story({
	name: "Welcome / Conversations / Light",
	args: { step: "conversations" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 1.2: a group Conversation card, the person's bubble in the Space colour and the reply on muted, then a mission row with its Working pill. Check the second dot wide and 2 of 3. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expectWelcome({
			canvasElement,
			title: "Conversations, then missions",
			action: "Next",
			step: "2 of 3",
			current: 2,
		})
		await expect(canvas.getByText("Release notes for 2.4")).toBeVisible()

		await userEvent.tab()
		const skip = canvas.getByRole("button", { name: "Skip intro" })
		await expect(skip).toHaveFocus()
		await expect(getComputedStyle(skip).outlineStyle).not.toBe("none")
	},
})

export const WelcomeConversationsDark = meta.story({
	name: "Welcome / Conversations / Dark",
	args: { step: "conversations" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 1.2, dark. Check the cards on the dark card surface and the bubble in the Space colour's dark tone. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectWelcome({
			canvasElement,
			title: "Conversations, then missions",
			action: "Next",
			step: "2 of 3",
			current: 2,
		})
	},
})

const expectLastStep = async (canvasElement: HTMLElement) => {
	const canvas = within(canvasElement)
	await expect(
		canvas.queryByRole("button", { name: "Skip intro" }),
	).not.toBeInTheDocument()
	await expect(
		getComputedStyle(slotIn(canvasElement, "onboarding-welcome-skip"))
			.visibility,
	).toBe("hidden")
}

export const WelcomeYourToolsLight = meta.story({
	name: "Welcome / Your tools / Light",
	args: { step: "tools" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 1.3: three equal cards, Folders, Applications and Secrets. Check Skip intro gone from sight and from assistive technology with its slot kept, the third dot wide, 3 of 3 and Get started. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expectWelcome({
			canvasElement,
			title: "Your tools, where you allow them",
			action: "Get started",
			step: "3 of 3",
			current: 3,
		})
		await expectLastStep(canvasElement)

		await userEvent.click(canvas.getByRole("button", { name: "Get started" }))
		await expect(args.onNext).toHaveBeenCalledOnce()
	},
})

export const WelcomeYourToolsDark = meta.story({
	name: "Welcome / Your tools / Dark",
	args: { step: "tools" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 1.3, dark. Check the cards and their muted tiles on the dark page. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectWelcome({
			canvasElement,
			title: "Your tools, where you allow them",
			action: "Get started",
			step: "3 of 3",
			current: 3,
		})
		await expectLastStep(canvasElement)
	},
})
