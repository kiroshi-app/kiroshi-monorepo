"use client"

import { useTranslation } from "react-i18next"

import {
	type ActivityIndicatorKind,
	BotIdentityAvatar,
} from "@workspace/ui/components/bot-identity-avatar"
import type { BotIdentity } from "@workspace/ui/components/bot-settings"
import { ColourField } from "@workspace/ui/components/colour-field"
import { blotOf } from "@workspace/ui/components/companion-colour"
import { DitheredFieldAvatar } from "@workspace/ui/components/dithered-field-avatar"
import { ProfilePictureField } from "@workspace/ui/components/profile-picture-field"
import { SettingsGroup } from "@workspace/ui/components/settings-group"
import { PICTURE_FIELD_SIZE } from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

const PREVIEW_SIZE = 64
const OPTION_AVATAR_SIZE = 52

type BotIdentityFieldsProps = {
	identity: BotIdentity
	hue: number | null
	name?: string
	seed?: string
	working?: boolean
	workingKind?: ActivityIndicatorKind
	onIdentityChange: (identity: BotIdentity) => void
	onHueChange: (hue: number | null) => void
	onAvatarUpload: (file: File) => void
	className?: string
}

const BotIdentityFields = ({
	identity,
	hue,
	name,
	seed,
	working = false,
	workingKind,
	onIdentityChange,
	onHueChange,
	onAvatarUpload,
	className,
}: BotIdentityFieldsProps) => {
	const { t } = useTranslation("bots")

	const dropPicture = () => onIdentityChange({ blot: identity.blot })

	const colourLabel = () => {
		if (hue === null) return t("identity.colour.none")
		const blot = blotOf(hue)
		return blot
			? t(`identity.colour.option.${blot}`)
			: t("identity.colour.ownValue", { hue })
	}

	const currentLabel = identity.image
		? t("identity.uploadedImage")
		: colourLabel()

	return (
		<div
			className={cn("flex flex-col gap-6", className)}
			data-slot="bot-identity-fields"
		>
			<div className="flex items-center gap-4">
				<BotIdentityAvatar
					hue={hue ?? undefined}
					image={identity.image}
					kind={workingKind}
					name={name}
					seed={seed}
					size={PREVIEW_SIZE}
					working={working}
				/>
				<div className="flex min-w-0 flex-col gap-1">
					<span className="font-medium text-foreground text-sm">
						{t("identity.avatar")}
					</span>
					<p className="truncate text-muted-foreground text-xs">
						{currentLabel}
					</p>
				</div>
			</div>

			<ColourField
				look="avatar"
				mark={(option) => (
					<span aria-hidden="true" className="flex">
						<DitheredFieldAvatar
							hue={option ?? undefined}
							name={name ?? seed ?? ""}
							size={OPTION_AVATAR_SIZE}
						/>
					</span>
				)}
				onValueChange={onHueChange}
				value={hue}
			/>

			<SettingsGroup grid="grid-cols-1" label={t("identity.picture.label")}>
				<ProfilePictureField
					fileLabel={t("identity.picture.file")}
					onPick={onAvatarUpload}
					onRemove={identity.image ? dropPicture : undefined}
					pickLabel={t(
						identity.image ? "identity.picture.change" : "identity.picture.add",
					)}
					preview={
						<BotIdentityAvatar
							hue={hue ?? undefined}
							image={identity.image}
							name={name}
							seed={seed}
							size={PICTURE_FIELD_SIZE}
						/>
					}
					removeLabel={t("identity.picture.remove")}
				/>
			</SettingsGroup>
		</div>
	)
}

export { BotIdentityFields, type BotIdentityFieldsProps }
