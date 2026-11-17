"use client"

import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import { DialogClose, DialogContent } from "@workspace/ui/components/ui/dialog"
import { cn } from "@workspace/ui/lib/utils"

const SURFACE_CLASS =
	"motion-reduce:duration-[0.01ms]! flex max-h-[calc(100dvh-3rem)] w-128 max-w-[calc(100vw-3rem)] flex-col gap-4 overflow-y-auto rounded-2xl p-6 sm:max-w-[calc(100vw-3rem)] [&_[data-slot=dialog-title]]:pe-8 [&>[data-slot=dialog-title]+[data-slot=dialog-description]]:-mt-3"

type DialogSurfaceProps = Omit<
	React.ComponentProps<typeof DialogContent>,
	"initialFocus" | "finalFocus" | "showCloseButton"
>

const DialogSurface = ({
	children,
	className,
	...props
}: DialogSurfaceProps) => {
	const { t } = useTranslation("common")

	return (
		<DialogContent
			className={cn(SURFACE_CLASS, className)}
			showCloseButton={false}
			{...props}
		>
			<DialogClose
				aria-label={t("dialog.close")}
				render={
					<Button
						className="absolute top-4 right-4"
						size="icon-sm"
						variant="ghost"
					/>
				}
			>
				<Icons.Close aria-hidden="true" className="size-4" />
			</DialogClose>
			{children}
		</DialogContent>
	)
}

export { DialogSurface }
