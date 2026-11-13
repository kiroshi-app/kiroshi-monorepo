// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"
import { AppBootScreen } from "@workspace/ui/components/app-boot-screen"

const GET_ANIMATIONS = "getAnimations"

const nativeGetAnimations = Object.getOwnPropertyDescriptor(
	Element.prototype,
	GET_ANIMATIONS,
)

const RUNNING_ANIMATION = {
	finished: Promise.resolve(),
} as unknown as Animation

const DOMS_WITHOUT_WEB_ANIMATIONS = [
	{
		lacks: "Element.getAnimations",
		strip: () => {
			Reflect.deleteProperty(Element.prototype, GET_ANIMATIONS)
		},
	},
	{
		lacks: "the CSSTransition global",
		strip: () => {
			Object.defineProperty(Element.prototype, GET_ANIMATIONS, {
				configurable: true,
				value: () => [RUNNING_ANIMATION],
			})
			vi.stubGlobal("CSSTransition", undefined)
		},
	},
]

const pendingWorkDone = () =>
	act(() => new Promise<void>((resolve) => setTimeout(resolve)))

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	Reflect.deleteProperty(Element.prototype, GET_ANIMATIONS)
	if (nativeGetAnimations)
		Object.defineProperty(
			Element.prototype,
			GET_ANIMATIONS,
			nativeGetAnimations,
		)
})

describe("the exit signal in a DOM without the Web Animations API", () => {
	it.each(DOMS_WITHOUT_WEB_ANIMATIONS)(
		"fires once when the DOM lacks $lacks",
		async ({ strip }) => {
			strip()
			const onExitComplete = vi.fn()
			const { container, rerender } = render(
				<AppBootScreen onExitComplete={onExitComplete} />,
			)
			await pendingWorkDone()
			expect(onExitComplete).not.toHaveBeenCalled()

			rerender(<AppBootScreen isExiting onExitComplete={onExitComplete} />)
			await pendingWorkDone()
			expect(
				container
					.querySelector('[data-slot="app-boot-screen"]')
					?.getAttribute("data-phase"),
			).toBe("leaving")
			expect(onExitComplete).toHaveBeenCalledOnce()

			rerender(<AppBootScreen isExiting onExitComplete={onExitComplete} />)
			await pendingWorkDone()
			expect(onExitComplete).toHaveBeenCalledOnce()
		},
	)
})
