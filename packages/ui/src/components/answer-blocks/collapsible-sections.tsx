import { Accordion } from "@base-ui/react/accordion"
import type { ReactNode } from "react"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type CollapsibleSection = {
	id: string
	label: string
	value?: string
	body: ReactNode
}

type CollapsibleSectionsProps = {
	sections: readonly CollapsibleSection[]
	defaultOpen?: string[]
	className?: string
}

const CollapsibleSections = ({
	sections,
	defaultOpen,
	className,
}: CollapsibleSectionsProps) => (
	<Accordion.Root
		data-slot="collapsible-sections"
		defaultValue={defaultOpen}
		multiple
		className={cn(
			"flex w-full min-w-0 flex-col border-t border-shell-divider",
			className,
		)}
	>
		{sections.map((section) => (
			<Accordion.Item
				key={section.id}
				value={section.id}
				className="flex flex-col gap-1.5 border-b border-shell-divider p-3"
			>
				<Accordion.Header className="flex">
					<Accordion.Trigger
						data-slot="collapsible-sections-head"
						className="group/head flex min-h-6 w-full min-w-0 items-center gap-2.5 text-start outline-offset-2"
					>
						<Icons.Expand
							aria-hidden="true"
							className="size-4 shrink-0 -rotate-90 text-muted-foreground group-aria-expanded/head:rotate-0 rtl:rotate-90"
						/>
						<span className="min-w-0 flex-1 text-base wrap-anywhere group-aria-expanded/head:font-semibold">
							{section.label}
						</span>
						{section.value ? (
							<span className="shrink-0 text-compact leading-4.5 text-muted-foreground tabular-nums">
								{section.value}
							</span>
						) : null}
					</Accordion.Trigger>
				</Accordion.Header>
				<Accordion.Panel className="ps-6.5 text-reading leading-6 text-muted-foreground wrap-anywhere">
					{section.body}
				</Accordion.Panel>
			</Accordion.Item>
		))}
	</Accordion.Root>
)

export {
	type CollapsibleSection,
	CollapsibleSections,
	type CollapsibleSectionsProps,
}
