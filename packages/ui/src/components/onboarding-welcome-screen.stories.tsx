import { useState } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	colourTransitionsOf,
	expectNoHorizontalScrollAt,
	expectOnboardingDragStrip,
	hueScopeOf,
	resolvedRootColor,
	slotIn,
	slotsIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { OnboardingShell } from "@workspace/ui/components/onboarding-shell"
import { OnboardingWelcomeFooter } from "@workspace/ui/components/onboarding-welcome-footer"
import {
	OnboardingWelcomeScreen,
	type OnboardingWelcomeScreenProps,
	type OnboardingWelcomeStep,
} from "@workspace/ui/components/onboarding-welcome-screen"
import { DEFAULT_LANGUAGE, i18n } from "@workspace/ui/lib/i18n"

const ARTBOARD =
	"Measured against the Paper file `Kiroshi, Onboarding v2`, page `Welcome · Bottom row directions`, artboards `M · K, stepper below`, 1200 by 760: a visual zone as tall as the tallest illustration and a text zone as tall as the tallest body plus one line, French included, then the stepper and one action, centred on the paragraph."

const ARTBOARD_WIDTH = 1200

const ILLUSTRATION_GAP = 32

const CONVERSATIONS_GEOMETRY = {
	column: 440,
	cardGap: 12,
	bubbleMaxWidth: 340,
	bubblePadding: ["8px", "12px"],
	bubbleType: ["14px", "20px"],
	statusHeight: 24,
}

const SLIDES: OnboardingWelcomeStep[] = [
	"companions",
	"conversations",
	"spaces",
	"tools",
]

type WelcomePlayContext = {
	canvasElement: HTMLElement
	title: string
	current: number
}

const footerOf = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "onboarding-welcome-footer")

const actionOf = (canvasElement: HTMLElement) =>
	footerOf(canvasElement).lastElementChild as HTMLElement

const centreOf = (element: Element) => {
	const { left, width } = element.getBoundingClientRect()
	return left + width / 2
}

const atArtboardWidth = async (
	canvasElement: HTMLElement,
	run: () => Promise<void>,
) => {
	const previousWidth = canvasElement.style.width
	canvasElement.style.width = `${ARTBOARD_WIDTH}px`
	try {
		await run()
	} finally {
		canvasElement.style.width = previousWidth
	}
}

const expectRowOnParagraphAxis = (canvasElement: HTMLElement) =>
	atArtboardWidth(canvasElement, async () => {
		const axis = centreOf(
			within(canvasElement).getByRole("heading", { level: 1 })
				.parentElement as HTMLElement,
		)

		await expect(
			centreOf(slotIn(canvasElement, "onboarding-welcome-stepper")),
		).toBeCloseTo(axis, 0)
		await expect(centreOf(actionOf(canvasElement))).toBeCloseTo(axis, 0)
	})

const expectWelcome = async ({
	canvasElement,
	title,
	current,
}: WelcomePlayContext) => {
	const canvas = within(canvasElement)
	const progress = canvas.getByRole("progressbar", { name: "Intro progress" })
	const controls = [
		canvas.getByRole("button", { name: "Back" }),
		canvas.getByRole("button", { name: "Next" }),
		actionOf(canvasElement),
	]

	await expect(
		canvas.getByRole("heading", { level: 1, name: title }),
	).toBeVisible()
	await expect(progress).toHaveAttribute("aria-valuenow", String(current))
	await expect(progress).toHaveAttribute("aria-valuemax", "4")
	await expect(progress).toHaveAttribute(
		"aria-valuetext",
		`Step ${current} of 4`,
	)
	await expect(
		slotsIn(progress, "onboarding-step-segment").map(
			(segment) => segment.dataset.filled,
		),
	).toEqual([1, 2, 3, 4].map((segment) => String(segment <= current)))
	await expect(canvas.queryByText(/\bof 4\b/)).not.toBeInTheDocument()
	await expect(
		getComputedStyle(actionOf(canvasElement)).textDecorationLine,
	).toBe("none")
	await withMotionAllowed(async () => {
		for (const control of controls) {
			await expect(colourTransitionsOf(control)).toEqual([])
		}
	})
	for (const control of controls) {
		control.focus({ focusVisible: true } as FocusOptions)
		await expect(control).toHaveFocus()
		await expect(getComputedStyle(control).boxShadow).toMatch(/\b3px\b/)
	}
	await expectRowOnParagraphAxis(canvasElement)
	await expectContentSlot(canvasElement)
	await expectNoHorizontalScrollAt(canvasElement, 320, "onboarding-shell")
}

const expectContentSlot = async (canvasElement: HTMLElement) => {
	const content = slotIn(canvasElement, "onboarding-content")
	const [illustration, heading] = [...content.children] as HTMLElement[]
	const slot = content.getBoundingClientRect()
	const drawn = illustration.getBoundingClientRect()
	const column = heading.getBoundingClientRect()

	await expect(column.top - drawn.bottom).toBe(ILLUSTRATION_GAP)
	await expect(column.bottom).toBe(slot.bottom)
	if (
		slotIn(canvasElement, "onboarding-welcome-screen").dataset.step ===
		"conversations"
	) {
		await expectConversationsGeometry(illustration)
		return
	}
	await expect(content.scrollHeight).toBeLessThanOrEqual(content.clientHeight)
	await expect(drawn.top).toBeGreaterThanOrEqual(slot.top)
}

const expectConversationsGeometry = async (illustration: HTMLElement) => {
	const [thread, mission] = [...illustration.children] as HTMLElement[]
	const bubbles = slotsIn(illustration, "message-bubble-text").map(
		(text) => text.parentElement as HTMLElement,
	)
	const status = mission.lastElementChild as HTMLElement

	await expect(illustration.getBoundingClientRect().width).toBe(
		CONVERSATIONS_GEOMETRY.column,
	)
	await expect(
		mission.getBoundingClientRect().top - thread.getBoundingClientRect().bottom,
	).toBe(CONVERSATIONS_GEOMETRY.cardGap)
	await expect(bubbles).toHaveLength(2)
	for (const bubble of bubbles) {
		const { paddingTop, paddingLeft, fontSize, lineHeight } =
			getComputedStyle(bubble)
		await expect(bubble.getBoundingClientRect().width).toBeLessThanOrEqual(
			CONVERSATIONS_GEOMETRY.bubbleMaxWidth,
		)
		await expect([paddingTop, paddingLeft]).toEqual(
			CONVERSATIONS_GEOMETRY.bubblePadding,
		)
		await expect([fontSize, lineHeight]).toEqual(
			CONVERSATIONS_GEOMETRY.bubbleType,
		)
	}
	await expect(status.getBoundingClientRect().height).toBe(
		CONVERSATIONS_GEOMETRY.statusHeight,
	)
}

type ArrowPlayContext = {
	canvasElement: HTMLElement
	name: string
	isDisabled: boolean
	onPress: () => void
}

const expectArrow = async ({
	canvasElement,
	name,
	isDisabled,
	onPress,
}: ArrowPlayContext) => {
	const arrow = within(canvasElement).getByRole("button", { name })

	await expect(arrow.tabIndex).toBe(0)
	if (isDisabled) {
		await expect(arrow).toHaveAttribute("aria-disabled", "true")
		await expect(getComputedStyle(arrow).opacity).toBe("0.35")
		await userEvent.click(arrow, { pointerEventsCheck: 0 })
		await expect(onPress).not.toHaveBeenCalled()
		return
	}
	await expect(arrow).not.toHaveAttribute("aria-disabled", "true")
	await userEvent.click(arrow)
	await expect(onPress).toHaveBeenCalledOnce()
}

type ArrowsPlayContext = {
	canvasElement: HTMLElement
	args: Pick<OnboardingWelcomeScreenProps, "onBack" | "onNext">
	current: number
}

const expectArrows = async ({
	canvasElement,
	args,
	current,
}: ArrowsPlayContext) => {
	await expectArrow({
		canvasElement,
		name: "Back",
		isDisabled: current === 1,
		onPress: args.onBack,
	})
	await expectArrow({
		canvasElement,
		name: "Next",
		isDisabled: current === SLIDES.length,
		onPress: args.onNext,
	})
}

type WalkProps = Omit<
	OnboardingWelcomeScreenProps,
	"step" | "onBack" | "onNext"
>

const WelcomeWalk = (props: WalkProps) => {
	const [index, setIndex] = useState(0)

	return (
		<OnboardingWelcomeScreen
			{...props}
			onBack={() => setIndex((previous) => previous - 1)}
			onNext={() => setIndex((previous) => previous + 1)}
			step={SLIDES[index] ?? "companions"}
		/>
	)
}

const spreadOf = (values: number[]) => Math.max(...values) - Math.min(...values)

const expectRowFixedAcrossTheWalk = (
	canvasElement: HTMLElement,
	next: string,
) =>
	atArtboardWidth(canvasElement, async () => {
		const screen = slotIn(canvasElement, "onboarding-welcome-screen")
		const contentHeights: number[] = []
		const stepperTops: number[] = []
		const actionTops: number[] = []

		for (const [index, slide] of SLIDES.entries()) {
			await waitFor(() => expect(screen).toHaveAttribute("data-step", slide))
			const content = slotIn(canvasElement, "onboarding-content")
			await expect(content.scrollHeight).toBeLessThanOrEqual(
				content.clientHeight,
			)
			contentHeights.push(content.getBoundingClientRect().height)
			stepperTops.push(
				slotIn(
					canvasElement,
					"onboarding-welcome-stepper",
				).getBoundingClientRect().top,
			)
			actionTops.push(actionOf(canvasElement).getBoundingClientRect().top)
			if (index < SLIDES.length - 1) {
				await userEvent.click(
					within(canvasElement).getByRole("button", { name: next }),
				)
			}
		}

		await expect(spreadOf(contentHeights)).toBe(0)
		await expect(spreadOf(stepperTops)).toBeLessThanOrEqual(1)
		await expect(spreadOf(actionTops)).toBeLessThanOrEqual(1)
	})

const inFrench = async () => {
	await i18n.changeLanguage("fr")
	return () => i18n.changeLanguage(DEFAULT_LANGUAGE)
}

const COMPANION_ROLES = [
	"Reviews code",
	"Keeps the docs",
	"Writes release notes",
]

const FRENCH_COMPANION_ROLES = [
	"Relit le code",
	"Tient la documentation",
	"Rédige les notes de version",
]

const expectCompanionRoles = async (
	canvasElement: HTMLElement,
	roles = COMPANION_ROLES,
) => {
	for (const role of roles) {
		const badge = within(canvasElement).getByText(role)
		const card = badge.parentElement as HTMLElement
		const name = badge.previousElementSibling as HTMLElement
		const pill = badge.getBoundingClientRect()
		const column = card.getBoundingClientRect()

		await expect(badge).toBeVisible()
		await expect(badge).toHaveAttribute("data-slot", "bot-title-badge")
		await expect(pill.height).toBeGreaterThan(0)
		await expect(badge.scrollWidth).toBeLessThanOrEqual(badge.clientWidth)
		await expect(getComputedStyle(badge).backgroundColor).not.toBe(
			getComputedStyle(card).backgroundColor,
		)
		await expect(pill.top).toBeGreaterThanOrEqual(
			name.getBoundingClientRect().bottom,
		)
		await expect(pill.left + pill.width / 2).toBeCloseTo(
			column.left + column.width / 2,
			0,
		)
		await withMotionAllowed(() =>
			expect(colourTransitionsOf(badge)).toEqual([]),
		)
	}
}

const WRAPPED_ROLE = "Reviews pull requests and test plans"

const ATLAS_JOB_KEY = "onboarding.intro.companions.atlas.job"

const ONE_LINE_PILL_HEIGHT = 14

const withWrappedAtlasRole = () => {
	const role = i18n.t(ATLAS_JOB_KEY)
	i18n.addResource(DEFAULT_LANGUAGE, "chat", ATLAS_JOB_KEY, WRAPPED_ROLE)
	return () => {
		i18n.addResource(DEFAULT_LANGUAGE, "chat", ATLAS_JOB_KEY, role)
	}
}

const lineBoxesOf = (badge: HTMLElement) => {
	const range = document.createRange()
	range.selectNodeContents(badge)
	return [...range.getClientRects()]
}

const isInsideCorner = (
	x: number,
	y: number,
	cornerX: number,
	cornerY: number,
	radius: number,
) => {
	const centreX = cornerX + Math.sign(x - cornerX) * radius
	const centreY = cornerY + Math.sign(y - cornerY) * radius
	const isInCornerZone =
		Math.abs(x - cornerX) < radius && Math.abs(y - cornerY) < radius
	return !isInCornerZone || Math.hypot(x - centreX, y - centreY) <= radius
}

const expectWrappedCompanionRole = async (canvasElement: HTMLElement) => {
	const canvas = within(canvasElement)
	const wrapped = canvas.getByText(WRAPPED_ROLE)
	const oneLine = canvas.getByText("Keeps the docs")
	const wrappedStyle = getComputedStyle(wrapped)
	const oneLineStyle = getComputedStyle(oneLine)
	const lineHeight = Number.parseFloat(wrappedStyle.lineHeight)
	const pill = wrapped.getBoundingClientRect()
	const oneLinePill = oneLine.getBoundingClientRect()
	const lines = lineBoxesOf(wrapped)
	const [oneLineText] = lineBoxesOf(oneLine) as [DOMRect]
	const radius = Number.parseFloat(wrappedStyle.borderTopLeftRadius)

	await expectCompanionRoles(canvasElement, [
		WRAPPED_ROLE,
		"Keeps the docs",
		"Writes release notes",
	])
	await expect(lineHeight).toBeGreaterThan(
		Number.parseFloat(wrappedStyle.fontSize),
	)
	await expect(wrappedStyle.paddingTop).toBe(oneLineStyle.paddingTop)
	await expect(wrappedStyle.paddingBottom).toBe(oneLineStyle.paddingBottom)
	await expect(oneLinePill.height).toBe(ONE_LINE_PILL_HEIGHT)
	await expect(lines).toHaveLength(2)
	await expect(pill.height).toBeCloseTo(
		2 * lineHeight +
			Number.parseFloat(wrappedStyle.paddingTop) +
			Number.parseFloat(wrappedStyle.paddingBottom),
		1,
	)
	const [firstLine, secondLine] = lines as [DOMRect, DOMRect]
	await expect(secondLine.top).toBeGreaterThan(firstLine.bottom)
	await expect(firstLine.top - pill.top).toBeCloseTo(
		oneLineText.top - oneLinePill.top,
		1,
	)
	await expect(pill.bottom - secondLine.bottom).toBeCloseTo(
		oneLinePill.bottom - oneLineText.bottom,
		1,
	)
	await expect(wrapped.scrollHeight).toBeLessThanOrEqual(wrapped.clientHeight)
	for (const line of lines) {
		for (const [x, y] of [
			[line.left, line.top],
			[line.right, line.top],
			[line.left, line.bottom],
			[line.right, line.bottom],
		] as const) {
			const cornerX = x < pill.left + pill.width / 2 ? pill.left : pill.right
			const cornerY = y < pill.top + pill.height / 2 ? pill.top : pill.bottom
			await expect(isInsideCorner(x, y, cornerX, cornerY, radius)).toBe(true)
		}
	}
}

const meta = preview.meta({
	afterEach: ({ canvasElement }) => expectOnboardingDragStrip(canvasElement),
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
					"The four Welcome screens a reader meets before connecting a model provider, in one centred column on the onboarding shell: a visual zone and a text zone of one fixed height on every slide, then the stepper and one action, centred on the paragraph and at the same height on every slide. The stepper holds Back, four segments filled up to the current slide, and Next; the segments read as one progress bar, Step 2 of 4. Back is disabled on the first slide and Next on the last, both still in the tab order. The action is Skip intro as plain text on the first three slides and Get started on the last. Segments, Next and Get started wear the Kiroshi primary, whatever the Space colour.",
			},
		},
	},
	args: {
		onSkip: fn(),
		onBack: fn(),
		onNext: fn(),
	},
})

export const WelcomeCompanionsLight = meta.story({
	name: "Welcome / Companions / Light",
	args: { step: "companions" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Slide 1: three companions on bot avatars, 96, 132 and 96, the middle one lifted. Check the first segment filled, Back disabled and faded, Next filled in the primary, and Skip intro as plain muted text. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expectWelcome({
			canvasElement,
			title: "Companions do the work with you",
			current: 1,
		})
		await expect(
			slotsIn(canvasElement, "bot-identity-avatar").map(
				(avatar) => avatar.getBoundingClientRect().width,
			),
		).toEqual([96, 132, 96])
		await expectCompanionRoles(canvasElement)
		await expectArrows({ canvasElement, args, current: 1 })

		canvas.getByRole("button", { name: "Back" }).focus()
		await userEvent.tab()
		await expect(canvas.getByRole("button", { name: "Next" })).toHaveFocus()
		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: "Skip intro" }),
		).toHaveFocus()

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
				story: `${ARTBOARD} Slide 1, dark. Check the job pills legible on the dark page, the first segment and Next in the dark primary, Back faded. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		await expectWelcome({
			canvasElement,
			title: "Companions do the work with you",
			current: 1,
		})
		await expectCompanionRoles(canvasElement)
		await expectArrows({ canvasElement, args, current: 1 })
	},
})

export const WelcomeCompanionsFrench = meta.story({
	name: "Welcome / Companions / French",
	tags: ["test-only"],
	args: { step: "companions" },
	beforeEach: inFrench,
	parameters: {
		docs: {
			description: {
				story:
					"The Companions slide in French, whose jobs run longer than the English ones. Check each job whole in its pill, wrapped rather than cut when wider than the column, centred under its name.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectCompanionRoles(canvasElement, FRENCH_COMPANION_ROLES)

		const longest = within(canvasElement).getByText(
			"Rédige les notes de version",
		)
		const card = longest.parentElement as HTMLElement
		const lineHeight = Number.parseFloat(getComputedStyle(longest).lineHeight)
		try {
			card.style.width = "max-content"
			const singleLine = longest.getBoundingClientRect()
			card.style.width = `${Math.floor(singleLine.width / 2)}px`
			await expect(
				longest.getBoundingClientRect().height,
			).toBeGreaterThanOrEqual(singleLine.height + lineHeight)
			await expect(longest.scrollWidth).toBeLessThanOrEqual(longest.clientWidth)
		} finally {
			card.style.width = ""
		}
	},
})

export const WelcomeCompanionsWrappedRoleLight = meta.story({
	name: "Welcome / Companions / Wrapped role / Light",
	args: { step: "companions" },
	beforeEach: withWrappedAtlasRole,
	parameters: {
		docs: {
			description: {
				story:
					"The Companions slide with a job too long for its column next to two one-line jobs. Check the long job whole on two lines with space between them, as much space above and below as in a one-line pill, every glyph inside the pill corners, and the one-line pills as on the plain slide. Pick the Dark twin for the other theme.",
			},
		},
	},
	play: ({ canvasElement }) => expectWrappedCompanionRole(canvasElement),
})

export const WelcomeCompanionsWrappedRoleDark = meta.story({
	name: "Welcome / Companions / Wrapped role / Dark",
	args: { step: "companions" },
	globals: { theme: "dark" },
	beforeEach: withWrappedAtlasRole,
	parameters: {
		docs: {
			description: {
				story:
					"The wrapped job on the dark page. Check the two lines legible and spaced inside the pill, the same breathing room as the one-line pills. Pick the Light twin for the other theme.",
			},
		},
	},
	play: ({ canvasElement }) => expectWrappedCompanionRole(canvasElement),
})

export const WelcomeConversationsLight = meta.story({
	name: "Welcome / Conversations / Light",
	args: { step: "conversations" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Slide 2: a group Conversation card, the person's bubble in the Space colour and the reply on muted, then a mission row with its Working pill. Check two segments filled, Back as an outline circle calling back, and Next calling forward. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expectWelcome({
			canvasElement,
			title: "Conversations, then missions",
			current: 2,
		})
		await expect(canvas.getByText("Release notes for 2.4")).toBeVisible()
		await expectArrows({ canvasElement, args, current: 2 })
	},
})

export const WelcomeConversationsDark = meta.story({
	name: "Welcome / Conversations / Dark",
	args: { step: "conversations" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Slide 2, dark. Check the cards on the dark card surface, Back's outline on the dark page, and two segments in the dark primary. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		await expectWelcome({
			canvasElement,
			title: "Conversations, then missions",
			current: 2,
		})
		await expectArrows({ canvasElement, args, current: 2 })
	},
})

export const WelcomeSpacesLight = meta.story({
	name: "Welcome / Spaces / Light",
	args: { step: "spaces" },
	parameters: {
		docs: {
			description: {
				story:
					"No artboard draws this slide: it takes the anatomy of the others. Two Space cards, Orbit web and Newsletter, each with its Space avatar, its companions and its Conversation count. Check the Space avatars in two colours, three segments filled, and Skip intro still in place. Pick the Dark twin for the other theme.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expectWelcome({
			canvasElement,
			title: "Spaces keep things apart",
			current: 3,
		})
		await expect(slotsIn(canvasElement, "space-avatar")).toHaveLength(2)
		await expectArrows({ canvasElement, args, current: 3 })

		await userEvent.click(canvas.getByRole("button", { name: "Skip intro" }))
		await expect(args.onSkip).toHaveBeenCalledOnce()
	},
})

export const WelcomeSpacesDark = meta.story({
	name: "Welcome / Spaces / Dark",
	args: { step: "spaces" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The Spaces slide, dark. Check both Space avatars in their dark tone and three segments in the dark primary. Pick the Light twin for the other theme.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		await expectWelcome({
			canvasElement,
			title: "Spaces keep things apart",
			current: 3,
		})
		await expectArrows({ canvasElement, args, current: 3 })
	},
})

export const WelcomeYourToolsLight = meta.story({
	name: "Welcome / Your tools / Light",
	args: { step: "tools" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Slide 4: three equal cards, Folders, Applications and Secrets. Check every segment filled, Next disabled on a faded muted fill, and Get started in the primary where Skip intro stood. Pick the Dark twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expectWelcome({
			canvasElement,
			title: "Your tools, where you allow them",
			current: 4,
		})
		await expect(
			canvas.queryByRole("button", { name: "Skip intro" }),
		).not.toBeInTheDocument()
		await expectArrows({ canvasElement, args, current: 4 })

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
				story: `${ARTBOARD} Slide 4, dark. Check the cards and their muted tiles on the dark page, Next faded, and Get started in the dark primary. Pick the Light twin for the other theme.`,
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expectWelcome({
			canvasElement,
			title: "Your tools, where you allow them",
			current: 4,
		})
		await expectArrows({ canvasElement, args, current: 4 })
		await expect(
			canvas.getByRole("button", { name: "Get started" }),
		).toBeVisible()
	},
})

export const WelcomeEverySlide = meta.story({
	name: "Welcome / Every slide",
	tags: ["test-only"],
	args: { step: "companions" },
	render: (args) => <WelcomeWalk onSkip={args.onSkip} />,
	parameters: {
		docs: {
			description: {
				story:
					"The four slides walked with Next in an artboard-wide window. Check the visual and text zones at one height on every slide, each body whole inside its zone, and the stepper and the action at the same height on all four.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectRowFixedAcrossTheWalk(canvasElement, "Next"),
})

export const WelcomeEverySlideFrench = meta.story({
	name: "Welcome / Every slide / French",
	tags: ["test-only"],
	args: { step: "companions" },
	beforeEach: inFrench,
	render: (args) => <WelcomeWalk onSkip={args.onSkip} />,
	parameters: {
		docs: {
			description: {
				story:
					"The four slides walked in French, whose bodies run longer. Check every body whole inside the text zone and the stepper and the action at the same height on all four.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectRowFixedAcrossTheWalk(canvasElement, "Suivant"),
})

export const WelcomeInAnOrangeSpace = meta.story({
	name: "Welcome / In an orange Space",
	tags: ["test-only"],
	args: { step: "companions" },
	decorators: [
		(Story) => (
			<div {...hueScopeOf("orange")}>
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The first slide under an orange Space. Check the filled segment and Next in the Kiroshi primary, not in the Space colour.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const fixedPrimary = resolvedRootColor("--primary")
		const spaceScope = slotIn(canvasElement, "onboarding-shell")
			.parentElement as HTMLElement
		const spacePrimary = getComputedStyle(spaceScope)
			.getPropertyValue("--color-primary")
			.trim()
		const [filled] = slotsIn(canvasElement, "onboarding-step-segment")

		await expect(spacePrimary).not.toBe(
			getComputedStyle(document.documentElement)
				.getPropertyValue("--primary")
				.trim(),
		)
		await expect(
			getComputedStyle(canvas.getByRole("button", { name: "Next" }))
				.backgroundColor,
		).toBe(fixedPrimary)
		await expect(getComputedStyle(filled as HTMLElement).backgroundColor).toBe(
			fixedPrimary,
		)
	},
})
