"use client"

import {
	type ComponentType,
	type ReactNode,
	type SVGProps,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import type { LibraryBlockType } from "@workspace/ui/components/library-document-blocks"
import {
	PromptMenuRow,
	usePromptMenu,
} from "@workspace/ui/components/prompt-menu"
import { POPUP_CLASS } from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

type SlashGroup = "text" | "rich"

type SlashMarkdown = "heading" | "list" | "checklist" | "quote" | "code"

type SlashItem = {
	type: Exclude<LibraryBlockType, "paragraph" | "other">
	group: SlashGroup
	Icon: ComponentType<SVGProps<SVGSVGElement>>
	markdown?: SlashMarkdown
}

type LibrarySlashType = SlashItem["type"]

const SLASH_ITEMS: SlashItem[] = [
	{ type: "heading", group: "text", Icon: Icons.Heading, markdown: "heading" },
	{ type: "list", group: "text", Icon: Icons.List, markdown: "list" },
	{
		type: "checklist",
		group: "text",
		Icon: Icons.Checklist,
		markdown: "checklist",
	},
	{ type: "quote", group: "text", Icon: Icons.Quote, markdown: "quote" },
	{ type: "gallery", group: "rich", Icon: Icons.Gallery },
	{ type: "callout", group: "rich", Icon: Icons.Info },
	{ type: "table", group: "rich", Icon: Icons.Table },
	{ type: "code", group: "rich", Icon: Icons.Code, markdown: "code" },
	{ type: "web-page", group: "rich", Icon: Icons.Web },
	{ type: "collapsible", group: "rich", Icon: Icons.Collapsible },
]

const SLASH_GROUPS: SlashGroup[] = ["text", "rich"]

const SLASH_KEYS = [
	["moveKeys", "move"],
	["insertKey", "insert"],
	["closeKey", "close"],
] as const

const MENU_GAP = 4

const isScrolling = (element: Element) =>
	/auto|scroll/.test(getComputedStyle(element).overflowY)

const boundsOf = (from: Element) => {
	let parent = from.parentElement
	while (parent && !isScrolling(parent)) parent = parent.parentElement
	return (
		parent?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight }
	)
}

type LibrarySlashMenuProps = {
	open: boolean
	query: string
	onChoose: (type: LibrarySlashType) => void
	onDismiss: () => void
	children: ReactNode
}

const LibrarySlashMenu = ({
	open,
	query,
	onChoose,
	onDismiss,
	children,
}: LibrarySlashMenuProps) => {
	const { t } = useTranslation("common")
	const labelId = useId()
	const panel = useRef<HTMLDivElement>(null)
	const [isAbove, setAbove] = useState(false)

	const matches = useMemo(() => {
		const needle = query.toLocaleLowerCase()
		return SLASH_ITEMS.filter(({ type }) =>
			t(`library.editor.blocks.types.${type}`)
				.toLocaleLowerCase()
				.includes(needle),
		)
	}, [query, t])

	const { rootRef, isOpen, active, activateOnPointerMove } = usePromptMenu({
		open,
		query,
		count: matches.length,
		onChoose: (index) => onChoose(matches[index].type),
		onDismiss,
	})

	useLayoutEffect(() => {
		const line = rootRef.current
		if (!isOpen || matches.length === 0 || !line || !panel.current) return
		const { top, bottom } = line.getBoundingClientRect()
		const room = boundsOf(line)
		const height = panel.current.offsetHeight + MENU_GAP
		setAbove(bottom + height > room.bottom && top - height >= room.top)
	}, [isOpen, rootRef, matches.length])

	const rowOf = (item: SlashItem) => {
		const index = matches.indexOf(item)
		return (
			<PromptMenuRow
				className="flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-start text-compact text-foreground leading-4 outline-none"
				isActive={index === active}
				key={item.type}
				onPointerMove={activateOnPointerMove(index)}
				onSelect={() => onChoose(item.type)}
			>
				<span
					aria-hidden="true"
					className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-border text-foreground [&_svg]:size-3.5"
				>
					<item.Icon />
				</span>
				<span className="min-w-0 flex-1 truncate">
					{t(`library.editor.blocks.types.${item.type}`)}
				</span>
				{item.markdown ? (
					<span className="shrink-0 font-mono text-muted-foreground text-xs leading-4">
						{t(`library.editor.blocks.markdown.${item.markdown}`)}
					</span>
				) : null}
			</PromptMenuRow>
		)
	}

	return (
		<div className="relative" data-slot="library-slash-menu" ref={rootRef}>
			{children}
			{isOpen ? (
				<div
					className={cn(
						POPUP_CLASS,
						"absolute start-0 z-50 flex w-75 flex-col rounded-xl p-1",
						isAbove ? "bottom-full mb-1" : "top-full mt-1",
					)}
					data-side={isAbove ? "top" : "bottom"}
					data-slot="library-slash-menu-panel"
					onPointerDown={(event) => event.preventDefault()}
					ref={panel}
				>
					<div
						aria-labelledby={labelId}
						className="flex flex-col"
						role="listbox"
					>
						<span className="sr-only" id={labelId}>
							{t("library.editor.blocks.slash.label")}
						</span>
						{SLASH_GROUPS.map((group) => {
							const items = matches.filter((item) => item.group === group)
							if (items.length === 0) return null
							const groupId = `${labelId}-${group}`
							return (
								<div
									aria-labelledby={groupId}
									className="flex flex-col"
									data-slot="library-slash-menu-group"
									key={group}
									role="group"
								>
									<span
										className="px-2 pt-2 pb-1 font-medium text-muted-foreground text-xs leading-4"
										id={groupId}
									>
										{t(`library.editor.blocks.slash.${group}`)}
									</span>
									{items.map(rowOf)}
								</div>
							)
						})}
					</div>
					<div
						aria-hidden="true"
						className="-mx-1 -mb-1 mt-1 flex h-8 items-center gap-3 border-border border-t px-3 text-muted-foreground text-xs leading-4"
					>
						{SLASH_KEYS.map(([keys, action]) => (
							<span className="flex gap-1" key={action}>
								<span className="font-mono">
									{t(`library.editor.blocks.slash.${keys}`)}
								</span>
								{t(`library.editor.blocks.slash.${action}`)}
							</span>
						))}
					</div>
				</div>
			) : null}
		</div>
	)
}

export { LibrarySlashMenu, type LibrarySlashType }
