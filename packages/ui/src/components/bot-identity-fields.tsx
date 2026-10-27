"use client"

import { type CSSProperties, useId } from "react"
import { useTranslation } from "react-i18next"

import {
	type ActivityIndicatorKind,
	BotIdentityAvatar,
} from "@workspace/ui/components/bot-identity-avatar"
import {
	BLOT_TINTS,
	type BotAvatarBlot,
	type BotIdentity,
} from "@workspace/ui/components/bot-settings"
import { BLOT_HUES, hueOf } from "@workspace/ui/components/companion-colour"
import { DitheredFieldAvatar } from "@workspace/ui/components/dithered-field-avatar"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { ProfilePictureField } from "@workspace/ui/components/profile-picture-field"
import { SettingsGroup } from "@workspace/ui/components/settings-group"
import { PICTURE_FIELD_SIZE } from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

const PREVIEW_SIZE = 64
const BLOT_SIZE = 56

const BLOT_OPTIONS = [undefined, ...BLOT_TINTS] as const

const BLOT_OPTION_CLASS =
	"cursor-pointer rounded-control border border-border bg-muted/40 p-1 hover:bg-muted has-[:checked]:border-(--swatch) has-[:checked]:bg-(--swatch)/12 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"

const swatchColour = (blot?: BotAvatarBlot) =>
	({
		...(blot && hueStyle(BLOT_HUES[blot])),
		"--swatch": blot
			? "var(--primary-strong)"
			: "var(--bot-avatar-field-untinted)",
	}) as CSSProperties

type BotIdentityFieldsProps = {
	identity: BotIdentity
	name?: string
	seed?: string
	working?: boolean
	workingKind?: ActivityIndicatorKind
	onIdentityChange: (identity: BotIdentity) => void
	onAvatarUpload: (file: File) => void
	className?: string
}

const BotIdentityFields = ({
	identity,
	name,
	seed,
	working = false,
	workingKind,
	onIdentityChange,
	onAvatarUpload,
	className,
}: BotIdentityFieldsProps) => {
	const { t } = useTranslation("bots")
	const groupId = useId()

	const blotLabel = (blot?: BotAvatarBlot) =>
		blot ? t(`identity.colour.option.${blot}`) : t("identity.colour.none")

	const dropPicture = () => onIdentityChange({ blot: identity.blot })

	const currentLabel = identity.image
		? t("identity.uploadedImage")
		: blotLabel(identity.blot)

	return (
		<div
			className={cn("flex flex-col gap-6", className)}
			data-slot="bot-identity-fields"
		>
			<div className="flex items-center gap-4">
				<BotIdentityAvatar
					blot={identity.blot}
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

			<SettingsGroup
				grid="grid-cols-[repeat(auto-fill,--spacing(16.5))] gap-1"
				label={t("identity.colour.label")}
			>
				{BLOT_OPTIONS.map((blot) => (
					<label
						className={BLOT_OPTION_CLASS}
						data-hue={hueOf(blot)}
						key={blot ?? "none"}
						style={swatchColour(blot)}
						title={blotLabel(blot)}
					>
						<input
							checked={identity.blot === blot}
							className="sr-only"
							name={`${groupId}-blot`}
							onChange={() => onIdentityChange({ blot })}
							type="radio"
							value={blot ?? ""}
						/>
						<span aria-hidden="true" className="flex">
							<DitheredFieldAvatar
								name={name ?? seed ?? ""}
								size={BLOT_SIZE}
								hue={hueOf(blot)}
							/>
						</span>
						<span className="sr-only">{blotLabel(blot)}</span>
					</label>
				))}
			</SettingsGroup>

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
							blot={identity.blot}
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
