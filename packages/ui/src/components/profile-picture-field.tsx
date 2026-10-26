"use client"

import type { ReactNode } from "react"

import {
	PICTURE_BOX_CLASS,
	PICTURE_FIELD_SIZE,
} from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { usePicturePicker } from "@workspace/ui/hooks/use-picture-picker"
import { cn } from "@workspace/ui/lib/utils"

type ProfilePictureFieldProps = {
	preview: ReactNode
	fileLabel: string
	pickLabel: string
	removeLabel: string
	onPick: (file: File) => void
	onRemove?: () => void
	className?: string
}

const ProfilePictureField = ({
	preview,
	fileLabel,
	pickLabel,
	removeLabel,
	onPick,
	onRemove,
	className,
}: ProfilePictureFieldProps) => {
	const { controlProps, inputProps } = usePicturePicker({
		label: fileLabel,
		onPick,
	})

	return (
		<div
			className={cn(PICTURE_BOX_CLASS, className)}
			data-slot="profile-picture-field"
		>
			<span
				className="grid shrink-0 place-items-center overflow-hidden rounded-full"
				style={{ width: PICTURE_FIELD_SIZE, height: PICTURE_FIELD_SIZE }}
			>
				{preview}
			</span>
			<div className="flex items-center gap-2">
				{onRemove ? (
					<Button onClick={onRemove} variant="ghost">
						{removeLabel}
					</Button>
				) : null}
				<Button
					{...controlProps}
					className="data-dragging:border-primary data-dragging:bg-primary/10"
					variant="outline"
				>
					{pickLabel}
				</Button>
			</div>
			<input {...inputProps} />
		</div>
	)
}

export { ProfilePictureField }
