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
import { IconSwap } from "@workspace/ui/components/icon-swap"
import { Icons } from "@workspace/ui/components/icons"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
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

const shownActionsOf = <Item,>(handlers: LibraryItemHandlers<Item>) =>
	LIBRARY_ITEM_ACTIONS.filter(({ handler }) => handlers[handler] !== undefined)

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
}

const LibraryItemMenuItems = <Item,>({
	item,
	actions,
	parts: { Item: MenuItem, Separator },
	onPickDelete,
}: LibraryItemMenuItemsProps<Item>) => {
	const { t } = useTranslation("common")

	return shownActionsOf(actions).map(({ handler, label, Icon }, index) =>
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

	return (
		<ConfirmDialog
			confirmLabel={t("library.itemMenu.delete")}
			description={t("library.itemMenu.deleteConfirm.description")}
			failureLabel={t("library.itemMenu.deleteConfirm.failure", { name })}
			onConfirm={onConfirm}
			onOpenChange={onOpenChange}
			open={open}
			title={t("library.itemMenu.deleteConfirm.title", { name })}
		/>
	)
}

const CONTEXT_MENU_PARTS: LibraryItemMenuParts = {
	Item: ContextMenuItem,
	Separator: ContextMenuSeparator,
}

type LibraryItemContextMenuProps<Item extends LibraryMenuSubject> =
	LibraryItemActions<Item> & {
		item: Item
		trigger: ReactElement
	}

const LibraryItemContextMenu = <Item extends LibraryMenuSubject>({
	item,
	trigger,
	...actions
}: LibraryItemContextMenuProps<Item>) => {
	const { t } = useTranslation("common")
	const [isConfirmingDelete, setConfirmingDelete] = useState(false)
	const handlers = handlersFor(actions, item)

	if (!hasLibraryItemActions(handlers)) return trigger

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger render={trigger} />
				<ContextMenuContent
					aria-label={t("library.itemMenu.label", { name: item.name })}
					className={STILL_UNDER_REDUCED_MOTION}
				>
					<LibraryItemMenuItems
						actions={handlers}
						item={item}
						onPickDelete={() => setConfirmingDelete(true)}
						parts={CONTEXT_MENU_PARTS}
					/>
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

const BAR_ACTION = cn(
	LIBRARY_BAR_ROUND,
	"size-8 bg-foreground/8 hover:bg-foreground/14",
)

const BAR_BUTTON_ACTIONS = new Set<string>(["onDownload", "onCopy"])

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
	onConfirmingDeleteChange?: (isConfirming: boolean) => void
}

const LibraryItemBarActions = <Item extends LibraryMenuSubject>({
	item,
	actions,
	surface,
	leading,
	onClose,
	onMenuOpenChange,
	onConfirmingDeleteChange,
}: LibraryItemBarActionsProps<Item>) => {
	const { t } = useTranslation("common")
	const [copiedItem, setCopiedItem] = useState<Item | null>(null)
	const [isConfirmingDelete, setConfirmingDelete] = useState(false)
	const isCopied = copiedItem === item
	const { onCopy, onDownload, onDelete } = actions
	const menuActions = barMenuActionsOf(actions)

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
		<div className="flex shrink-0 items-center gap-2">
			{leading}
			{onDownload ? (
				<TooltipButton
					aria-label={t(`library.${surface}.download`)}
					className={BAR_ACTION}
					onClick={() => onDownload(item)}
					size="icon"
					tooltip={t(`library.${surface}.download`)}
					tooltipSide="bottom"
					variant="ghost"
				>
					<Icons.Download aria-hidden="true" />
				</TooltipButton>
			) : null}
			{onCopy ? (
				<TooltipButton
					aria-label={t(`library.${surface}.copy`)}
					className={BAR_ACTION}
					onClick={copy}
					size="icon"
					tooltip={t(`library.${surface}.copy`)}
					tooltipSide="bottom"
					variant="ghost"
				>
					<IconSwap
						icon={<Icons.Copy aria-hidden="true" />}
						isSwapped={isCopied}
						swappedIcon={<Icons.Check aria-hidden="true" />}
					/>
				</TooltipButton>
			) : null}
			{hasLibraryItemActions(menuActions) ? (
				<>
					<DropdownMenu onOpenChange={onMenuOpenChange}>
						<DropdownMenuTrigger
							render={
								<TooltipButton
									aria-label={t(`library.${surface}.more`)}
									className={BAR_ACTION}
									size="icon"
									tooltip={t(`library.${surface}.more`)}
									tooltipSide="bottom"
									variant="ghost"
								/>
							}
						>
							<Icons.More aria-hidden="true" />
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							aria-label={t("library.itemMenu.label", { name: item.name })}
							className={cn(
								"w-auto",
								surface === "lightbox" && "dark",
								STILL_UNDER_REDUCED_MOTION,
							)}
						>
							<LibraryItemMenuItems
								actions={menuActions}
								item={item}
								onPickDelete={() => confirmDelete(true)}
								parts={DROPDOWN_MENU_PARTS}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
					<Separator
						className={cn(LIBRARY_BAR_DIVIDER, "h-5")}
						orientation="vertical"
					/>
				</>
			) : null}
			<TooltipButton
				aria-label={t(`library.${surface}.close`)}
				className={LIBRARY_BAR_BARE}
				onClick={onClose}
				size="icon"
				tooltip={t(`library.${surface}.close`)}
				tooltipSide="bottom"
				variant="ghost"
			>
				<Icons.Close aria-hidden="true" />
			</TooltipButton>
			<span aria-live="polite" className="sr-only">
				{isCopied ? t(`library.${surface}.copied`) : ""}
			</span>
			<LibraryItemDeleteDialog
				name={item.name}
				onConfirm={() => onDelete?.(item)}
				onOpenChange={confirmDelete}
				open={isConfirmingDelete}
			/>
		</div>
	)
}

export {
	handlersFor,
	hasLibraryItemActions,
	LIBRARY_BAR,
	LIBRARY_BAR_BARE,
	LIBRARY_BAR_DIVIDER,
	LIBRARY_BAR_ROUND,
	type LibraryItemActions,
	LibraryItemBarActions,
	LibraryItemContextMenu,
	LibraryItemDeleteDialog,
	LibraryItemMenuItems,
	type LibraryItemMenuParts,
	type LibraryMenuSubject,
}
