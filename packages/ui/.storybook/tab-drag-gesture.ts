import { fireEvent } from "storybook/test"

import { slotIn, slotsIn } from "@workspace/storybook/story-utils"

export const barIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "app-title-bar")

export const boxOf = (element: Element) => element.getBoundingClientRect()

export const unpinnedTabsIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "title-bar-tab")

export const POINTER = {
	button: 0,
	isPrimary: true,
	pointerId: 1,
	pointerType: "mouse",
}

export const pointerAt = (clientX: number, clientY: number) => ({
	...POINTER,
	clientX: Math.round(clientX),
	clientY: Math.round(clientY),
})

export const pointAt = (clientX: number, onto: Element) =>
	pointerAt(clientX, boxOf(onto).top + boxOf(onto).height / 2)

export const middleOf = (element: Element) =>
	boxOf(element).left + boxOf(element).width / 2

export const liftTo = (handle: HTMLElement, clientX: number) => {
	fireEvent.pointerDown(handle, pointAt(middleOf(handle), handle))
	fireEvent.pointerMove(handle, pointAt(middleOf(handle) + 8, handle))
	fireEvent.pointerMove(handle, pointAt(clientX, handle))
}

export const isLifted = (tab: HTMLElement) =>
	getComputedStyle(tab).pointerEvents === "none"
