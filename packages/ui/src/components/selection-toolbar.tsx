"use client"

import { Toolbar } from "@base-ui/react/toolbar"
import {
	type FormEvent,
	type KeyboardEvent,
	type MouseEvent,
	type Ref,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { flushSync } from "react-dom"
import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import { HOVER_INTENT_DELAY_MS } from "@workspace/ui/components/tooltip-hint"
import { Button } from "@workspace/ui/components/ui/button"
import { Input } from "@workspace/ui/components/ui/input"
import { Kbd } from "@workspace/ui/components/ui/kbd"
import { Separator } from "@workspace/ui/components/ui/separator"
import { Toggle } from "@workspace/ui/components/ui/toggle"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

type SelectionToolbarFormat =
	| "bold"
	| "italic"
	| "strikethrough"
	| "code"
	| "link"
	| "heading"
	| "list"

type SelectionToolbarMessageAction = "reply" | "copy"

type SelectionToolbarAction =
	| {
			name: Exclude<SelectionToolbarFormat, "link">
			isOn: boolean
			onPress?: () => void
	  }
	| { name: "link"; isOn: boolean }
	| { name: SelectionToolbarMessageAction; onPress: () => void }

const SELECTION_TOOLBAR_SEPARATOR = "separator"

type SelectionToolbarItem =
	| SelectionToolbarAction
	| typeof SELECTION_TOOLBAR_SEPARATOR

type SelectionToolbarAnchor = {
	centre: number
	top: number
	bottom: number
	roomAbove: number
}

const SELECTION_TOOLBAR_SLOT = "selection-toolbar"

const SELECTION_GAP = 8

const TOOLTIP_GAP = 14

const SURFACE =
	"rounded-control border border-selection-toolbar-border bg-card-raised p-1 text-foreground shadow-selection-toolbar"

const BUTTON =
	"size-7 min-w-7 rounded-md px-0 transition-none hover:bg-selection-toolbar-highlight aria-pressed:bg-user-bubble/15 aria-pressed:text-user-bubble hover:aria-pressed:bg-user-bubble/15 hover:aria-pressed:text-user-bubble"

const PLAIN_BUTTON = cn(
	BUTTON,
	"border-0 active:scale-none! dark:hover:bg-selection-toolbar-highlight",
)

const TOOLTIP = cn(
	"break-words **:data-[slot=kbd]:rounded-md",
	STILL_UNDER_REDUCED_MOTION,
)

const SHORTCUT = "px-0.5"

const NAME = {
	bold: "library.editor.toolbar.bold",
	italic: "library.editor.toolbar.italic",
	strikethrough: "library.editor.toolbar.strikethrough",
	code: "library.editor.toolbar.code",
	link: "library.editor.toolbar.link",
	heading: "library.editor.toolbar.heading",
	list: "library.editor.toolbar.list",
	reply: "chat:turn.reply",
	copy: "chat:turn.copy",
} as const

const SHORTCUT_OF = {
	bold: "library.editor.toolbar.boldShortcut",
	italic: "library.editor.toolbar.italicShortcut",
	strikethrough: "library.editor.toolbar.strikethroughShortcut",
	code: "library.editor.toolbar.codeShortcut",
	link: "library.editor.toolbar.linkShortcut",
	heading: undefined,
	list: undefined,
	reply: undefined,
	copy: undefined,
} as const satisfies Record<SelectionToolbarAction["name"], string | undefined>

const ICON: Record<SelectionToolbarAction["name"], Icon> = {
	bold: Icons.Bold,
	italic: Icons.Italic,
	strikethrough: Icons.Strikethrough,
	code: Icons.Code,
	link: Icons.Link,
	heading: Icons.Heading,
	list: Icons.List,
	reply: Icons.Reply,
	copy: Icons.Copy,
}

type ActionButtonProps = {
	action: SelectionToolbarAction
	onPress?: () => void
	buttonRef?: Ref<HTMLButtonElement>
}

const ActionButton = ({ action, onPress, buttonRef }: ActionButtonProps) => {
	const { t } = useTranslation(["common", "chat"])
	const name = t(NAME[action.name])
	const shortcut = SHORTCUT_OF[action.name]
	const ActionIcon = ICON[action.name]

	return (
		<Tooltip>
			<TooltipTrigger
				delay={HOVER_INTENT_DELAY_MS}
				render={
					<Toolbar.Button
						aria-label={name}
						ref={buttonRef}
						render={
							"isOn" in action ? (
								<Toggle
									className={BUTTON}
									onPressedChange={() => onPress?.()}
									pressed={action.isOn}
									size="sm"
								/>
							) : (
								<Button
									className={PLAIN_BUTTON}
									onClick={onPress}
									size="icon-sm"
									variant="ghost"
								/>
							)
						}
					>
						<ActionIcon aria-hidden="true" />
					</Toolbar.Button>
				}
			/>
			<TooltipContent
				className={TOOLTIP}
				role="tooltip"
				side="top"
				sideOffset={TOOLTIP_GAP}
			>
				{name}
				{shortcut ? <Kbd className={SHORTCUT}>{t(shortcut)}</Kbd> : null}
			</TooltipContent>
		</Tooltip>
	)
}

const ToolbarSeparator = () => (
	<Separator
		className="mx-1 bg-selection-toolbar-border data-vertical:h-4 data-vertical:self-center"
		orientation="vertical"
	/>
)

type LinkFieldProps = {
	link?: string
	onConfirm: (url: string) => void
	onCancel: () => void
}

const LinkField = ({ link = "", onConfirm, onCancel }: LinkFieldProps) => {
	const { t } = useTranslation("common")
	const [url, setUrl] = useState(link)
	const input = useRef<HTMLInputElement>(null)

	useLayoutEffect(() => {
		input.current?.focus()
		input.current?.select()
	}, [])

	const confirm = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		onConfirm(url)
	}

	const cancelOnEscape = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Escape") return
		event.preventDefault()
		onCancel()
	}

	return (
		<form
			aria-label={t("library.editor.toolbar.link")}
			className={cn("flex w-85 items-center gap-1", SURFACE)}
			onSubmit={confirm}
		>
			<span
				aria-hidden="true"
				className="flex size-7 shrink-0 items-center justify-center text-muted-foreground"
			>
				<Icons.Link className="size-4" />
			</span>
			<Input
				aria-label={t("library.editor.toolbar.linkField")}
				className="h-7 flex-1 rounded-md border-transparent bg-transparent px-0 text-compact text-foreground leading-4 focus-visible:border-transparent md:text-compact dark:bg-transparent"
				onChange={(event) => setUrl(event.target.value)}
				onKeyDown={cancelOnEscape}
				ref={input}
				value={url}
			/>
			<Kbd
				aria-hidden="true"
				className="rounded-md bg-selection-toolbar-highlight px-0.5"
			>
				<Icons.Return />
			</Kbd>
			<Button
				aria-label={t("library.editor.toolbar.confirmLink")}
				className="rounded-md transition-none hover:bg-selection-toolbar-highlight dark:hover:bg-selection-toolbar-highlight"
				size="icon-sm"
				type="submit"
				variant="ghost"
			>
				<Icons.Check aria-hidden="true" />
			</Button>
		</form>
	)
}

type SelectionToolbarProps = {
	anchor: SelectionToolbarAnchor
	label: string
	actions: readonly SelectionToolbarItem[]
	link?: string
	onLink?: (url: string) => void
	isLinking?: boolean
	onLinkingChange?: (isLinking: boolean) => void
}

const keepTextSelection = (event: MouseEvent<HTMLElement>) =>
	event.preventDefault()

const SelectionToolbar = ({
	anchor,
	label,
	actions,
	link,
	onLink,
	isLinking: isLinkingProp,
	onLinkingChange,
}: SelectionToolbarProps) => {
	const [isOwnLinking, setIsOwnLinking] = useState(false)
	const isLinking = isLinkingProp ?? isOwnLinking
	const setIsLinking = (next: boolean) => {
		setIsOwnLinking(next)
		onLinkingChange?.(next)
	}
	const [height, setHeight] = useState(0)
	const frame = useRef<HTMLDivElement>(null)
	const linkButton = useRef<HTMLButtonElement>(null)

	useLayoutEffect(() => {
		setHeight(frame.current?.offsetHeight ?? 0)
	}, [])

	const isBelow = anchor.roomAbove < height + SELECTION_GAP

	const returnToBar = () => {
		flushSync(() => setIsLinking(false))
		linkButton.current?.focus()
	}

	return (
		<div
			className={cn(
				"absolute z-10 w-max -translate-x-1/2",
				!isBelow && "-translate-y-full",
			)}
			data-placement={isBelow ? "below" : "above"}
			data-slot={SELECTION_TOOLBAR_SLOT}
			ref={frame}
			style={{
				left: anchor.centre,
				top: isBelow
					? anchor.bottom + SELECTION_GAP
					: anchor.top - SELECTION_GAP,
			}}
		>
			{isLinking ? (
				<LinkField
					link={link}
					onCancel={returnToBar}
					onConfirm={(url) => {
						onLink?.(url)
						returnToBar()
					}}
				/>
			) : (
				<Toolbar.Root
					aria-label={label}
					className={cn("flex items-center gap-0.5", SURFACE)}
					onMouseDown={keepTextSelection}
				>
					{actions.map((action, index) =>
						action === SELECTION_TOOLBAR_SEPARATOR ? (
							// biome-ignore lint/suspicious/noArrayIndexKey: a separator is identified by its place between two groups
							<ToolbarSeparator key={`separator-${index}`} />
						) : action.name === "link" ? (
							<ActionButton
								action={action}
								buttonRef={linkButton}
								key={action.name}
								onPress={() => setIsLinking(true)}
							/>
						) : (
							<ActionButton
								action={action}
								key={action.name}
								onPress={action.onPress}
							/>
						),
					)}
				</Toolbar.Root>
			)}
		</div>
	)
}

export {
	SELECTION_TOOLBAR_SEPARATOR,
	SELECTION_TOOLBAR_SLOT,
	SelectionToolbar,
	type SelectionToolbarAction,
	type SelectionToolbarAnchor,
	type SelectionToolbarFormat,
	type SelectionToolbarItem,
	type SelectionToolbarProps,
}
