"use client"

import { useId, useState } from "react"

import { Disclosure } from "@workspace/ui/components/disclosure"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

export interface OptionsCardOption {
	id: string
	label: string
	description: string
}

export interface OptionsCardProps {
	title: string
	subtitle?: string
	options: OptionsCardOption[]
	defaultOpenId?: string | null
	onPick?: (id: string | null) => void
	className?: string
}

export const OptionsCard = ({
	title,
	subtitle,
	options,
	defaultOpenId = null,
	onPick,
	className,
}: OptionsCardProps) => {
	const [openId, setOpenId] = useState(defaultOpenId)
	const baseId = useId()
	const titleId = `${baseId}-title`

	const toggle = (id: string) => {
		const next = openId === id ? null : id
		setOpenId(next)
		onPick?.(next)
	}

	return (
		<section
			aria-labelledby={titleId}
			data-slot="options-card"
			className={cn(
				"flex flex-col gap-2 rounded-xl border border-shell-divider bg-card-raised p-4",
				className,
			)}
		>
			<header className="flex flex-col gap-0.5">
				<h3
					id={titleId}
					className="wrap-break-word font-semibold text-foreground text-reading"
				>
					{title}
				</h3>
				{subtitle ? (
					<p className="wrap-break-word text-compact text-muted-foreground leading-4.5">
						{subtitle}
					</p>
				) : null}
			</header>
			<ul className="flex flex-col gap-1">
				{options.map((option) => {
					const isOpen = openId === option.id
					const bodyId = `${baseId}-${option.id}`

					return (
						<li
							key={option.id}
							data-slot="options-card-option"
							data-open={isOpen || undefined}
							className={cn("rounded-lg", isOpen && "bg-primary/8")}
						>
							<button
								type="button"
								aria-expanded={isOpen}
								aria-controls={bodyId}
								onClick={() => toggle(option.id)}
								className={cn(
									"flex w-full items-center gap-3 rounded-lg px-3 text-start text-foreground text-reading focus-visible:outline-offset-2",
									isOpen
										? "pt-3 font-semibold"
										: "min-h-11 hover:bg-foreground/4",
								)}
							>
								<span className="min-w-0 flex-1 wrap-break-word">
									{option.label}
								</span>
								<Icons.Expand
									aria-hidden="true"
									className={cn(
										"size-4 shrink-0 text-muted-foreground",
										isOpen && "rotate-180",
									)}
								/>
							</button>
							<Disclosure id={bodyId} open={isOpen}>
								<p className="wrap-break-word px-3 pt-1 pb-3 text-soft-foreground text-sm">
									{option.description}
								</p>
							</Disclosure>
						</li>
					)
				})}
			</ul>
		</section>
	)
}
