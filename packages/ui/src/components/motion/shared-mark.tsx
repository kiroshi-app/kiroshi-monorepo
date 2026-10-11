"use client"

import type { ComponentPropsWithRef } from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface SharedMarkProps extends ComponentPropsWithRef<"span"> {
	markId?: string
}

export function SharedMark({ markId, className, ...props }: SharedMarkProps) {
	return (
		<span
			data-slot="shared-mark"
			data-state={markId ? "marked" : "plain"}
			data-mark={markId}
			className={cn("flex w-fit", className)}
			{...props}
		/>
	)
}
