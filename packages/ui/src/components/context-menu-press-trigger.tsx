"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import {
	cloneElement,
	type HTMLAttributes,
	type ReactElement,
	type Ref,
} from "react"

import { ContextMenuTrigger } from "@workspace/ui/components/ui/context-menu"

interface ContextMenuPressTriggerProps {
	render: ReactElement<HTMLAttributes<HTMLElement>>
	ref?: Ref<HTMLDivElement>
}

export const openBelow = (trigger: HTMLElement) => {
	const { left, bottom } = trigger.getBoundingClientRect()
	trigger.dispatchEvent(
		new MouseEvent("contextmenu", {
			bubbles: true,
			clientX: left,
			clientY: bottom,
		}),
	)
}

export const ContextMenuPressTrigger = ({
	render,
	ref,
}: ContextMenuPressTriggerProps) => (
	<ContextMenuTrigger
		aria-haspopup="menu"
		ref={ref}
		onClick={(event) => openBelow(event.currentTarget)}
		render={(props, state) =>
			cloneElement(
				render,
				mergeProps<"div">(props, render.props, {
					"aria-expanded": state.open,
				}),
			)
		}
	/>
)
