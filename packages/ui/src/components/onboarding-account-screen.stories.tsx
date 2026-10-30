import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectOnboardingDragStrip,
	resolvedChannelsOf,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { OnboardingAccountScreen } from "@workspace/ui/components/onboarding-account-screen"
import type { AccountState } from "@workspace/ui/components/user-settings-dialog/account-panel"
import { en } from "@workspace/ui/lib/i18n-en"

const ACCOUNT = en.settings.account

const ONBOARDING = ACCOUNT.onboarding

const SIGNED_OUT: AccountState = { status: "signedOut" }

const lightScreenIn = (canvasElement: HTMLElement) => {
	const screens = slotsIn(canvasElement, "onboarding-account-screen")
	expect(screens).toHaveLength(2)
	return screens[0]
}

const expectRingOnFocus = async (control: HTMLElement) => {
	await expect(control).toHaveFocus()
	await expect(getComputedStyle(control).outlineStyle).not.toBe("none")
}

const expectKiroshiRing = async (canvasElement: HTMLElement) => {
	const rings = slotsIn(canvasElement, "onboarding-account-mark")
	await expect(rings).toHaveLength(2)
	for (const ring of rings) {
		await expect(ring).toHaveAttribute("aria-hidden", "true")
		const { width, height } = ring.getBoundingClientRect()
		await expect({ width, height }).toEqual({ width: 128, height: 116 })
	}
	await expect(slotsIn(canvasElement, "onboarding-content")).toHaveLength(2)
	await expect(slotsIn(canvasElement, "onboarding-controls")).toHaveLength(2)
}

const expectPersonAvatarInitials = async (canvasElement: HTMLElement) => {
	for (const screen of slotsIn(canvasElement, "onboarding-account-screen")) {
		const initials = slotIn(screen, "avatar-fallback")
			.firstElementChild as HTMLElement
		const { backgroundColor, fontSize, lineHeight, fontWeight } =
			getComputedStyle(initials)
		await expect(resolvedChannelsOf(backgroundColor, screen)).toEqual(
			resolvedChannelsOf("var(--person-avatar)", screen),
		)
		await expect({ fontSize, lineHeight, fontWeight }).toEqual({
			fontSize: "14px",
			lineHeight: "20px",
			fontWeight: "500",
		})
	}
}

const meta = preview.meta({
	afterEach: ({ canvasElement }) => expectOnboardingDragStrip(canvasElement),
	title: "Conversation/Onboarding/OnboardingAccountScreen",
	component: OnboardingAccountScreen,
	globals: { theme_layout: "side-by-side" },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The onboarding step that offers a Kiroshi account, drawn from the Paper file `Kiroshi, Onboarding v2`, artboards 4.1 to 4.3, and page Flow · Final, artboard 4. One centred column on the app background: the Kiroshi hexagon ring, decorative, 32 px above the title and body, then the actions of the state the host hands in, `signedOut`, `waiting` or `signedIn`, the same `AccountState` the Account panel of the user Settings reads. Signing in happens in the browser only. Until the reader is signed in, Skip for now moves on without an account. It holds nothing: every gesture goes back through its own callback. Every story draws light and dark side by side.",
			},
		},
	},
	args: {
		account: SIGNED_OUT,
		onSignIn: fn(),
		onCancel: fn(),
		onCopySignInLink: fn(),
		onSkip: fn(),
		onContinue: fn(),
	},
})

export const AccountEmpty = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 4.1: no account yet. Check the Kiroshi hexagon ring, 128 by 116 in the foreground colour, hidden from assistive tech, in light and dark, that the body opens on Optional, that Sign in with your browser carries the external link mark and calls `onSignIn` with no caption under it, and that Skip for now is a button the keyboard reaches with a visible ring and calls `onSkip`. Pick `AccountWaiting` once the browser is open.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const screen = within(lightScreenIn(canvasElement))

		await expect(
			screen.getByRole("heading", { level: 1, name: ACCOUNT.signedOut.title }),
		).toBeVisible()
		await expect(screen.getByText(ONBOARDING.body)).toBeVisible()
		await expect(screen.queryByText(ACCOUNT.signedOut.caption)).toBeNull()
		await expectKiroshiRing(canvasElement)

		await userEvent.click(
			screen.getByRole("button", { name: ACCOUNT.signedOut.signIn }),
		)
		await expect(args.onSignIn).toHaveBeenCalledOnce()

		await userEvent.tab()
		await expectRingOnFocus(
			screen.getByRole("button", { name: ONBOARDING.skip }),
		)
		await userEvent.keyboard("{Enter}")
		await expect(args.onSkip).toHaveBeenCalledOnce()
	},
})

export const AccountWaiting = meta.story({
	args: { account: { status: "waiting" } },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 4.2: the browser is open and the screen waits for it. Check the same ring as `AccountEmpty`, that the primary button is dimmed, spins its mark and names the wait, that it stays in the tab order without calling back, that Cancel calls `onCancel`, that the caption says where to finish, and that Copy the sign-in link and Skip for now are buttons the keyboard reaches with a visible ring. The mark holds still for a reader who asked for reduced motion.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const screen = within(lightScreenIn(canvasElement))

		const waiting = screen.getByRole("button", { name: ACCOUNT.waiting.label })
		await expect(waiting).toHaveAttribute("aria-disabled", "true")
		waiting.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onSignIn).not.toHaveBeenCalled()

		const mark = waiting.querySelector("svg") as SVGElement
		const asksForStillness = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches
		await expect(getComputedStyle(mark).animationName).toBe(
			asksForStillness ? "none" : "spin",
		)

		await expectKiroshiRing(canvasElement)
		await expect(screen.getByText(ACCOUNT.waiting.caption)).toBeVisible()
		await expect(
			screen.getByText(ACCOUNT.waiting.browserDidNotOpen),
		).toBeVisible()

		await userEvent.click(
			screen.getByRole("button", { name: ACCOUNT.waiting.cancel }),
		)
		await expect(args.onCancel).toHaveBeenCalledOnce()

		await userEvent.tab()
		await expectRingOnFocus(
			screen.getByRole("button", { name: ACCOUNT.waiting.copySignInLink }),
		)
		await userEvent.keyboard("{Enter}")
		await expect(args.onCopySignInLink).toHaveBeenCalledOnce()

		await userEvent.tab()
		await expectRingOnFocus(
			screen.getByRole("button", { name: ONBOARDING.skip }),
		)
		await userEvent.keyboard("{Enter}")
		await expect(args.onSkip).toHaveBeenCalledOnce()
	},
})

export const AccountSignedIn = meta.story({
	args: {
		account: {
			status: "signedIn",
			name: "Ada Martin",
			email: "ada.martin@example.com",
			plan: "pro",
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 4.3: the browser handed the account back. Check the same ring as `AccountEmpty` above the title, the card the Account panel draws, with the initials on the person avatar fill at 14/20 medium in light and dark, the name, the email and the Pro plan behind Free during the beta, that Continue calls `onContinue`, and that Skip for now is gone.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const light = lightScreenIn(canvasElement)
		const screen = within(light)

		await expect(
			screen.getByRole("heading", {
				level: 1,
				name: ONBOARDING.signedIn.title,
			}),
		).toBeVisible()
		const card = within(slotIn(light, "account-card"))
		await expectKiroshiRing(canvasElement)
		await expect(slotIn(light, "user-avatar")).toHaveTextContent("AM")
		await expectPersonAvatarInitials(canvasElement)
		await expect(card.getByText("Ada Martin")).toBeVisible()
		await expect(card.getByText("ada.martin@example.com")).toBeVisible()
		await expect(card.getByText(ACCOUNT.signedIn.plan.beta)).toBeVisible()
		await expect(card.getByText(ACCOUNT.signedIn.plan.pro)).toBeVisible()
		await expect(
			screen.queryByRole("button", { name: ONBOARDING.skip }),
		).toBeNull()

		await userEvent.click(
			screen.getByRole("button", { name: ONBOARDING.signedIn.continue }),
		)
		await expect(args.onContinue).toHaveBeenCalledOnce()
	},
})
