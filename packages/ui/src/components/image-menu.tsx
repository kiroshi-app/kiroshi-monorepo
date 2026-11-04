"use client"

import {
	type ComponentProps,
	type ComponentType,
	type ReactElement,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	CONTEXT_MENU_PARTS,
	hasLibraryItemActions,
	LibraryItemDeleteDialog,
	type LibraryItemHandlers,
	LibraryItemMenuItems,
} from "@workspace/ui/components/library-item-menu"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

type ImageMenuAction<Item> = (item: Item) => void | Promise<void>

type ImageHandlers<Item> = {
	onSaveToLibrary?: ImageMenuAction<Item>
	onCopyImage?: ImageMenuAction<Item>
	onOpenInViewer?: ImageMenuAction<Item>
}

type ImageMenuActions<Item> = LibraryItemHandlers<Item> & ImageHandlers<Item>

type ImageMenuSurface = "thread" | "viewer"

type ImageMenuProps<Item> = ImageMenuActions<Item> & {
	item: Item
	name: string
	trigger: ReactElement
	surface?: ImageMenuSurface
	onOpenChange?: ComponentProps<typeof ContextMenu>["onOpenChange"]
	onConfirmingDeleteChange?: (isConfirming: boolean) => void
}

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

const imageMenuActionsFor = <From, To>(
	actions: ImageMenuActions<To>,
	itemOf: (from: From) => To,
): ImageMenuActions<From> =>
	Object.fromEntries(
		Object.entries(actions).map(([handler, action]) => [
			handler,
			action && ((from: From) => action(itemOf(from))),
		]),
	)

const ImageMenu = <Item,>({
	item,
	name,
	trigger,
	surface = "thread",
	onOpenChange,
	onConfirmingDeleteChange,
	onSaveToLibrary,
	onCopyImage,
	onOpenInViewer,
	...viewerActions
}: ImageMenuProps<Item>) => {
	const { t } = useTranslation("common")
	const [isConfirmingDelete, setConfirmingDelete] = useState(false)
	const imageHandlers: ImageHandlers<Item> = {
		onSaveToLibrary,
		onCopyImage,
		onOpenInViewer: surface === "viewer" ? undefined : onOpenInViewer,
	}
	const imageActions = IMAGE_ACTIONS.filter(
		({ handler }) => imageHandlers[handler] !== undefined,
	)
	const hasViewerActions = hasLibraryItemActions(viewerActions)

	if (!hasViewerActions && imageActions.length === 0) return trigger

	const confirmDelete = (isConfirming: boolean) => {
		setConfirmingDelete(isConfirming)
		onConfirmingDeleteChange?.(isConfirming)
	}

	return (
		<>
			<ContextMenu onOpenChange={onOpenChange}>
				<ContextMenuTrigger render={trigger} />
				<ContextMenuContent
					aria-label={t("library.itemMenu.label", { name })}
					className={cn(
						surface === "viewer" && "dark",
						STILL_UNDER_REDUCED_MOTION,
					)}
				>
					<LibraryItemMenuItems
						actions={viewerActions}
						item={item}
						onPickDelete={() => confirmDelete(true)}
						order="bar"
						parts={CONTEXT_MENU_PARTS}
					/>
					{hasViewerActions && imageActions.length > 0 ? (
						<ContextMenuSeparator />
					) : null}
					{imageActions.map(({ handler, label, Icon }) => (
						<ContextMenuItem
							key={handler}
							onClick={() => imageHandlers[handler]?.(item)}
						>
							<Icon aria-hidden="true" className="size-3.5" />
							{t(label)}
						</ContextMenuItem>
					))}
				</ContextMenuContent>
			</ContextMenu>
			<LibraryItemDeleteDialog
				name={name}
				onConfirm={() => viewerActions.onDelete?.(item)}
				onOpenChange={confirmDelete}
				open={isConfirmingDelete}
			/>
		</>
	)
}

export {
	ImageMenu,
	type ImageMenuActions,
	type ImageMenuProps,
	imageMenuActionsFor,
}
