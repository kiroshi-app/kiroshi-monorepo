"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import {
	cloneElement,
	type HTMLAttributes,
	type ReactElement,
	type Ref,
} from "react"

import { ContextMenuTrigger } from "@workspace/ui/components/ui/context-menu"

type PressEdge = "start" | "end"

interface ContextMenuPressTriggerProps {
	render: ReactElement<HTMLAttributes<HTMLElement>>
	ref?: Ref<HTMLElement>
	edge?: PressEdge
}

export const openBelow = (trigger: HTMLElement, edge: PressEdge = "start") => {
	const { left, right, bottom } = trigger.getBoundingClientRect()
	trigger.dispatchEvent(
		new MouseEvent("contextmenu", {
			bubbles: true,
			clientX: Math.round(edge === "end" ? right : left),
			clientY: bottom,
		}),
	)
}

export const ContextMenuPressTrigger = ({
	render,
	ref,
	edge,
}: ContextMenuPressTriggerProps) => (
	<ContextMenuTrigger
		aria-haspopup="menu"
		ref={ref as Ref<HTMLDivElement>}
		onClick={(event) => openBelow(event.currentTarget, edge)}
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
