import type { MouseEvent } from "react"

interface ClickModifiers {
	meta: boolean
	ctrl: boolean
	shift: boolean
	middle: boolean
}

const NO_CLICK_MODIFIERS: ClickModifiers = {
	meta: false,
	ctrl: false,
	shift: false,
	middle: false,
}

const MIDDLE_BUTTON = 1

const isKeyboardActivation = (event: MouseEvent) => event.detail === 0

const isMiddleButton = (event: MouseEvent) => event.button === MIDDLE_BUTTON

const modifiersOf = (event: MouseEvent): ClickModifiers =>
	isKeyboardActivation(event)
		? NO_CLICK_MODIFIERS
		: {
				meta: event.metaKey,
				ctrl: event.ctrlKey,
				shift: event.shiftKey,
				middle: isMiddleButton(event),
			}

const isPlainClick = ({ meta, ctrl, shift, middle }: ClickModifiers) =>
	!(meta || ctrl || shift || middle)

const middleClickHandlers = (onMiddleClick: (event: MouseEvent) => void) => ({
	onAuxClick: (event: MouseEvent) => {
		if (isMiddleButton(event)) onMiddleClick(event)
	},
	onMouseDown: (event: MouseEvent) => {
		if (isMiddleButton(event)) event.preventDefault()
	},
})

const clickHandlersFor = (onClick: (modifiers: ClickModifiers) => void) => {
	const click = (event: MouseEvent) => onClick(modifiersOf(event))
	return { onClick: click, ...middleClickHandlers(click) }
}

export {
	type ClickModifiers,
	clickHandlersFor,
	isPlainClick,
	middleClickHandlers,
	modifiersOf,
	NO_CLICK_MODIFIERS,
}
