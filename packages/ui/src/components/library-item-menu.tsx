"use client"

import {
	type ComponentProps,
	type ComponentType,
	Fragment,
	type ReactElement,
	type ReactNode,
	useEffect,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import {
	HeaderIsland,
	HeaderIslandButton,
} from "@workspace/ui/components/header-island"
import { IconSwap } from "@workspace/ui/components/icon-swap"
import { Icons } from "@workspace/ui/components/icons"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu"
import { Separator } from "@workspace/ui/components/ui/separator"
import { COPIED_RESET_MS } from "@workspace/ui/hooks/use-copy-text"
import { libraryDisplayName } from "@workspace/ui/lib/library-display-name"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

type LibraryMenuSubject = {
	name: string
}

type LibraryItemAction<Item> = (item: Item) => void | Promise<void>

type LibraryItemHandlers<Item> = {
	onOpen?: LibraryItemAction<Item>
	onOpenInNewTab?: LibraryItemAction<Item>
	onRename?: LibraryItemAction<Item>
	onCopy?: LibraryItemAction<Item>
	onDownload?: LibraryItemAction<Item>
	onShowInFolder?: LibraryItemAction<Item>
	onDelete?: LibraryItemAction<Item>
}

type LibraryItemActionName = keyof LibraryItemHandlers<unknown>

type ImageHandlers<Item> = {
	onSaveToLibrary?: LibraryItemAction<Item>
	onCopyImage?: LibraryItemAction<Item>
	onOpenInViewer?: LibraryItemAction<Item>
}

type LibraryItemActions<Item> = LibraryItemHandlers<Item> & {
	isActionShown?: (item: Item, action: LibraryItemActionName) => boolean
}

const LIBRARY_ITEM_ACTIONS = [
	{ handler: "onOpen", label: "library.itemMenu.open", Icon: Icons.Reveal },
	{
		handler: "onOpenInNewTab",
		label: "library.itemMenu.openInNewTab",
		Icon: Icons.NewTab,
	},
	{ handler: "onRename", label: "library.itemMenu.rename", Icon: Icons.Edit },
	{ handler: "onCopy", label: "library.itemMenu.copy", Icon: Icons.Copy },
	{
		handler: "onDownload",
		label: "library.itemMenu.download",
		Icon: Icons.Download,
	},
	{
		handler: "onShowInFolder",
		label: "library.itemMenu.showInFolder",
		Icon: Icons.Folder,
	},
	{ handler: "onDelete", label: "library.itemMenu.delete", Icon: Icons.Delete },
] as const satisfies {
	handler: LibraryItemActionName
	label: string
	Icon: ComponentType
}[]

const IMAGE_ACTIONS = [
	{
		handler: "onSaveToLibrary",
		label: "library.imageMenu.saveToLibrary",
		Icon: Icons.Library,
	},
	{
		handler: "onCopyImage",
		label: "library.imageMenu.copyImage",
		Icon: Icons.Copy,
	},
	{
		handler: "onOpenInViewer",
		label: "library.imageMenu.openInViewer",
		Icon: Icons.Fullscreen,
	},
] as const satisfies {
	handler: keyof ImageHandlers<unknown>
	label: string
	Icon: ComponentType
}[]

const hasImageActions = <Item,>(handlers: ImageHandlers<Item>) =>
	IMAGE_ACTIONS.some(({ handler }) => handlers[handler] !== undefined)

type ImageMenuItemsProps<Item> = {
	item: Item
	actions: ImageHandlers<Item>
	isSavingToLibrary?: boolean
}

const ImageMenuItems = <Item,>({
	item,
	actions,
	isSavingToLibrary = false,
}: ImageMenuItemsProps<Item>) => {
	const { t } = useTranslation("common")

	return IMAGE_ACTIONS.map(({ handler, label, Icon }) => {
		const action = actions[handler]
		return action ? (
			<ContextMenuItem
				key={handler}
				disabled={handler === "onSaveToLibrary" && isSavingToLibrary}
				onClick={() => action(item)}
			>
				<Icon aria-hidden="true" className="size-3.5" />
				{t(label)}
			</ContextMenuItem>
		) : null
	})
}

type LibraryItemMenuEntry = (typeof LIBRARY_ITEM_ACTIONS)[number]

const BAR_BUTTON_ORDER: readonly string[] = ["onDownload", "onCopy"]

const BAR_BUTTON_ACTIONS = new Set(BAR_BUTTON_ORDER)

const barRankOf = (handler: string) => {
	const rank = BAR_BUTTON_ORDER.indexOf(handler)
	return rank === -1 ? BAR_BUTTON_ORDER.length : rank
}

type LibraryItemMenuOrder = "menu" | "bar"

const ACTIONS_IN_ORDER: Record<
	LibraryItemMenuOrder,
	readonly LibraryItemMenuEntry[]
> = {
	menu: LIBRARY_ITEM_ACTIONS,
	bar: [...LIBRARY_ITEM_ACTIONS].sort(
		(first, second) => barRankOf(first.handler) - barRankOf(second.handler),
	),
}

const shownActionsOf = <Item,>(
	handlers: LibraryItemHandlers<Item>,
	order: LibraryItemMenuOrder = "menu",
) =>
	ACTIONS_IN_ORDER[order].filter(
		({ handler }) => handlers[handler] !== undefined,
	)

const hasLibraryItemActions = <Item,>(handlers: LibraryItemHandlers<Item>) =>
	shownActionsOf(handlers).length > 0

const handlersFor = <Item,>(
	{ isActionShown = () => true, ...handlers }: LibraryItemActions<Item>,
	item: Item,
): LibraryItemHandlers<Item> =>
	Object.fromEntries(
		LIBRARY_ITEM_ACTIONS.filter(({ handler }) =>
			isActionShown(item, handler),
		).map(({ handler }) => [handler, handlers[handler]]),
	)

type MenuItemPartProps = {
	onClick: () => void
	variant?: "default" | "destructive"
	children: ReactNode
}

type LibraryItemMenuParts = {
	Item: ComponentType<MenuItemPartProps>
	Separator: ComponentType
}

type LibraryItemMenuItemsProps<Item> = {
	item: Item
	actions: LibraryItemHandlers<Item>
	parts: LibraryItemMenuParts
	onPickDelete: () => void
	order?: LibraryItemMenuOrder
}

const LibraryItemMenuItems = <Item,>({
	item,
	actions,
	parts: { Item: MenuItem, Separator },
	onPickDelete,
	order,
}: LibraryItemMenuItemsProps<Item>) => {
	const { t } = useTranslation("common")

	const shown = shownActionsOf(actions, order)

	return shown.map(({ handler, label, Icon }, index) =>
		handler === "onDelete" ? (
			<Fragment key={handler}>
				{index > 0 ? <Separator /> : null}
				<MenuItem onClick={onPickDelete} variant="destructive">
					<Icon aria-hidden="true" className="size-3.5" />
					{t(label)}
				</MenuItem>
			</Fragment>
		) : (
			<MenuItem key={handler} onClick={() => actions[handler]?.(item)}>
				<Icon aria-hidden="true" className="size-3.5" />
				{t(label)}
			</MenuItem>
		),
	)
}

type LibraryItemDeleteDialogProps = {
	name: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void | Promise<void>
}

const LibraryItemDeleteDialog = ({
	name,
	open,
	onOpenChange,
	onConfirm,
}: LibraryItemDeleteDialogProps) => {
	const { t } = useTranslation("common")
	const shownName = libraryDisplayName(name, t)

	return (
		<ConfirmDialog
			confirmLabel={t("library.itemMenu.delete")}
			description={t("library.itemMenu.deleteConfirm.description")}
			failureLabel={t("library.itemMenu.deleteConfirm.failure", {
				name: shownName,
			})}
			onConfirm={onConfirm}
			onOpenChange={onOpenChange}
			open={open}
			title={t("library.itemMenu.deleteConfirm.title", { name: shownName })}
		/>
	)
}

const CONTEXT_MENU_PARTS: LibraryItemMenuParts = {
	Item: ContextMenuItem,
	Separator: ContextMenuSeparator,
}

type LibraryItemContextMenuProps<Item extends LibraryMenuSubject> =
	LibraryItemActions<Item> &
		Pick<ImageHandlers<Item>, "onSaveToLibrary" | "onCopyImage"> & {
			item: Item
			trigger: ReactElement
		}

const LibraryItemContextMenu = <Item extends LibraryMenuSubject>({
	item,
	trigger,
	onSaveToLibrary,
	onCopyImage,
	...actions
}: LibraryItemContextMenuProps<Item>) => {
	const { t } = useTranslation("common")
	const [isConfirmingDelete, setConfirmingDelete] = useState(false)
	const handlers = handlersFor(actions, item)
	const imageHandlers = { onSaveToLibrary, onCopyImage }
	const hasItemActions = hasLibraryItemActions(handlers)
	const hasImageMenuActions = hasImageActions(imageHandlers)

	if (!hasItemActions && !hasImageMenuActions) return trigger

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger render={trigger} />
				<ContextMenuContent
					aria-label={t("library.itemMenu.label", {
						name: libraryDisplayName(item.name, t),
					})}
					className={STILL_UNDER_REDUCED_MOTION}
				>
					<LibraryItemMenuItems
						actions={handlers}
						item={item}
						onPickDelete={() => setConfirmingDelete(true)}
						parts={CONTEXT_MENU_PARTS}
					/>
					{hasItemActions && hasImageMenuActions ? (
						<ContextMenuSeparator />
					) : null}
					<ImageMenuItems actions={imageHandlers} item={item} />
				</ContextMenuContent>
			</ContextMenu>
			<LibraryItemDeleteDialog
				name={item.name}
				onConfirm={() => handlers.onDelete?.(item)}
				onOpenChange={setConfirmingDelete}
				open={isConfirmingDelete}
			/>
		</>
	)
}

const LIBRARY_BAR = "flex h-14 shrink-0 items-center justify-between gap-4 px-3"

const LIBRARY_BAR_ROUND = "rounded-full text-foreground transition-none"

const LIBRARY_BAR_BARE = cn(LIBRARY_BAR_ROUND, "size-8 hover:bg-foreground/8")

const LIBRARY_BAR_DIVIDER = "bg-foreground/12 data-vertical:self-center"

const LIBRARY_ISLAND_CONTEXT = "min-w-0 shrink"

const LIBRARY_ISLAND_TITLE =
	"min-w-0 truncate p-2 font-medium text-foreground text-sm leading-4"

const LIBRARY_OVERLAY_ISLAND =
	"bg-header-island-overlay backdrop-blur-lg dark:bg-header-island-overlay"

const LibraryIslandButton = ({
	"aria-label": label,
	...props
}: ComponentProps<typeof HeaderIslandButton>) => (
	<TooltipHint content={label} side="bottom">
		<HeaderIslandButton aria-label={label} {...props} />
	</TooltipHint>
)

const barMenuActionsOf = <Item,>(
	handlers: LibraryItemHandlers<Item>,
): LibraryItemHandlers<Item> =>
	Object.fromEntries(
		Object.entries(handlers).filter(
			([handler]) => !BAR_BUTTON_ACTIONS.has(handler),
		),
	)

const DROPDOWN_MENU_PARTS: LibraryItemMenuParts = {
	Item: DropdownMenuItem,
	Separator: DropdownMenuSeparator,
}

type LibraryItemBarSurface = "lightbox" | "document"

type LibraryItemBarActionsProps<Item extends LibraryMenuSubject> = {
	item: Item
	actions: LibraryItemHandlers<Item>
	surface: LibraryItemBarSurface
	leading?: ReactNode
	onClose: () => void
	onMenuOpenChange?: ComponentProps<typeof DropdownMenu>["onOpenChange"]
	menuFinalFocus?: () => HTMLElement | boolean
	onConfirmingDeleteChange?: (isConfirming: boolean) => void
}

const LibraryItemBarActions = <Item extends LibraryMenuSubject>({
	item,
	actions,
	surface,
	leading,
	onClose,
	onMenuOpenChange,
	menuFinalFocus,
	onConfirmingDeleteChange,
}: LibraryItemBarActionsProps<Item>) => {
	const { t } = useTranslation("common")
	const [copiedItem, setCopiedItem] = useState<Item | null>(null)
	const [isConfirmingDelete, setConfirmingDelete] = useState(false)
	const isCopied = copiedItem === item
	const { onCopy, onDownload, onDelete } = actions
	const menuActions = barMenuActionsOf(actions)
	const hasMenu = hasLibraryItemActions(menuActions)

	useEffect(() => {
		if (copiedItem === null) return
		const timer = window.setTimeout(() => setCopiedItem(null), COPIED_RESET_MS)
		return () => window.clearTimeout(timer)
	}, [copiedItem])

	const confirmDelete = (isConfirming: boolean) => {
		setConfirmingDelete(isConfirming)
		onConfirmingDeleteChange?.(isConfirming)
	}

	const copy = async () => {
		try {
			await onCopy?.(item)
			setCopiedItem(item)
		} catch {
			setCopiedItem(null)
		}
	}

	return (
		<HeaderIsland
			className={cn(surface === "lightbox" && LIBRARY_OVERLAY_ISLAND)}
		>
			{leading}
			{onDownload ? (
				<LibraryIslandButton
					aria-label={t(`library.${surface}.download`)}
					onClick={() => onDownload(item)}
				>
					<Icons.Download aria-hidden="true" />
				</LibraryIslandButton>
			) : null}
			{onCopy ? (
				<LibraryIslandButton
					aria-label={t(`library.${surface}.copy`)}
					onClick={copy}
				>
					<IconSwap
						icon={<Icons.Copy aria-hidden="true" />}
						isSwapped={isCopied}
						swappedIcon={<Icons.Check aria-hidden="true" />}
					/>
				</LibraryIslandButton>
			) : null}
			{hasMenu ? (
				<DropdownMenu onOpenChange={onMenuOpenChange}>
					<DropdownMenuTrigger
						render={
							<LibraryIslandButton
								aria-label={t(`library.${surface}.more`)}
								className="aria-expanded:bg-header-island-control-hover aria-expanded:text-foreground"
							/>
						}
					>
						<Icons.More aria-hidden="true" />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						aria-label={t("library.itemMenu.label", {
							name: libraryDisplayName(item.name, t),
						})}
						className={cn(
							"w-auto",
							surface === "lightbox" && "dark",
							STILL_UNDER_REDUCED_MOTION,
						)}
						finalFocus={menuFinalFocus}
					>
						<LibraryItemMenuItems
							actions={menuActions}
							item={item}
							onPickDelete={() => confirmDelete(true)}
							parts={DROPDOWN_MENU_PARTS}
						/>
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
			{onDownload || onCopy || hasMenu ? (
				<Separator
					className="mx-1 h-4 bg-header-island-rule data-vertical:self-center"
					orientation="vertical"
				/>
			) : null}
			<LibraryIslandButton
				aria-label={t(`library.${surface}.close`)}
				onClick={onClose}
			>
				<Icons.Close aria-hidden="true" />
			</LibraryIslandButton>
			<span aria-live="polite" className="sr-only">
				{isCopied ? t(`library.${surface}.copied`) : ""}
			</span>
			<LibraryItemDeleteDialog
				name={item.name}
				onConfirm={() => onDelete?.(item)}
				onOpenChange={confirmDelete}
				open={isConfirmingDelete}
			/>
		</HeaderIsland>
	)
}

export {
	CONTEXT_MENU_PARTS,
	handlersFor,
	hasImageActions,
	hasLibraryItemActions,
	type ImageHandlers,
	ImageMenuItems,
	LIBRARY_BAR,
	LIBRARY_BAR_BARE,
	LIBRARY_BAR_DIVIDER,
	LIBRARY_BAR_ROUND,
	LIBRARY_ISLAND_CONTEXT,
	LIBRARY_ISLAND_TITLE,
	LIBRARY_OVERLAY_ISLAND,
	LibraryIslandButton,
	type LibraryItemActions,
	LibraryItemBarActions,
	LibraryItemContextMenu,
	LibraryItemDeleteDialog,
	type LibraryItemHandlers,
	LibraryItemMenuItems,
	type LibraryItemMenuParts,
	type LibraryMenuSubject,
}
