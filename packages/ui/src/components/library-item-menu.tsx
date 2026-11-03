"use client"

import {
	type ComponentType,
	Fragment,
	type ReactElement,
	type ReactNode,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"

type LibraryMenuSubject = {
	name: string
}

type LibraryItemAction<Item> = (item: Item) => void | Promise<void>

type LibraryItemActions<Item> = {
	onOpen?: LibraryItemAction<Item>
	onOpenInNewTab?: LibraryItemAction<Item>
	onRename?: LibraryItemAction<Item>
	onCopy?: LibraryItemAction<Item>
	onDownload?: LibraryItemAction<Item>
	onShowInFolder?: LibraryItemAction<Item>
	onDelete?: LibraryItemAction<Item>
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
	handler: keyof LibraryItemActions<unknown>
	label: string
	Icon: ComponentType
}[]

const shownActionsOf = <Item,>(actions: LibraryItemActions<Item>) =>
	LIBRARY_ITEM_ACTIONS.filter(({ handler }) => actions[handler] !== undefined)

const hasLibraryItemActions = <Item,>(actions: LibraryItemActions<Item>) =>
	shownActionsOf(actions).length > 0

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
	actions: LibraryItemActions<Item>
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

	if (!hasLibraryItemActions(actions)) return trigger

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger render={trigger} />
				<ContextMenuContent
					aria-label={t("library.itemMenu.label", { name: item.name })}
					className={STILL_UNDER_REDUCED_MOTION}
				>
					<LibraryItemMenuItems
						actions={actions}
						item={item}
						onPickDelete={() => setConfirmingDelete(true)}
						parts={CONTEXT_MENU_PARTS}
					/>
				</ContextMenuContent>
			</ContextMenu>
			<LibraryItemDeleteDialog
				name={item.name}
				onConfirm={() => actions.onDelete?.(item)}
				onOpenChange={setConfirmingDelete}
				open={isConfirmingDelete}
			/>
		</>
	)
}

export {
	hasLibraryItemActions,
	type LibraryItemActions,
	LibraryItemContextMenu,
	LibraryItemDeleteDialog,
	LibraryItemMenuItems,
	type LibraryItemMenuParts,
}
