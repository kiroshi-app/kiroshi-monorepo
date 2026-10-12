"use client"

import { type FormEvent, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { AvatarFrame } from "@workspace/ui/components/initials-avatar"
import {
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_INVALID_CLASS,
	FIELD_LABEL_CLASS,
	SETTINGS_TAG_CLASS,
} from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type SpaceMemberStatus = "host" | "joined" | "pending"

type SpaceMember = {
	id: string
	name?: string
	email: string
	status: SpaceMemberStatus
}

type InviteRefusal = "invited" | "self" | "malformed"

type MembersFailureReason =
	| "notHosting"
	| "notOwner"
	| "needsSignIn"
	| "unreachable"
	| "generic"

type MembersFailure =
	| {
			action: "invite"
			reason: MembersFailureReason | "limitReached"
			email: string
	  }
	| {
			action: "withdraw"
			reason: MembersFailureReason | "gone" | "joined"
			member: SpaceMember
	  }
	| {
			action: "remove"
			reason: MembersFailureReason | "gone" | "pending" | "host"
			member: SpaceMember
	  }

type MembersPanelProps = {
	space: string
	members: SpaceMember[]
	email: string
	onEmailChange: (email: string) => void
	onInvite: (email: string) => void
	refusal?: InviteRefusal
	failure?: MembersFailure
	isHosted: boolean
	removing?: SpaceMember | null
	onRemove: (member: SpaceMember) => void
	onWithdraw: (member: SpaceMember) => void
	onRemoveConfirm: () => void
	onRemoveCancel: () => void
}

const AVATAR_SIZE = 28

const nameOf = (member: SpaceMember) => member.name ?? member.email

const firstNameOf = (member: SpaceMember) => nameOf(member).split(/\s+/)[0]

const failureKeyOf = (failure: MembersFailure) => {
	switch (failure.action) {
		case "invite":
			return `space.members.failure.invite.${failure.reason}` as const
		case "withdraw":
			return `space.members.failure.withdraw.${failure.reason}` as const
		case "remove":
			return `space.members.failure.remove.${failure.reason}` as const
	}
}

const useFailureText = (failure: MembersFailure | undefined, space: string) => {
	const { t } = useTranslation("settings")
	if (!failure) {
		return ""
	}
	const isInvite = failure.action === "invite"
	return t(failureKeyOf(failure), {
		space,
		email: isInvite ? failure.email : failure.member.email,
		name: isInvite ? "" : nameOf(failure.member),
	})
}

type InviteFieldProps = Pick<
	MembersPanelProps,
	"space" | "email" | "onEmailChange" | "onInvite" | "refusal" | "isHosted"
> & {
	failure?: MembersFailure
}

const InviteField = ({
	space,
	email,
	onEmailChange,
	onInvite,
	refusal,
	failure,
	isHosted,
}: InviteFieldProps) => {
	const { t } = useTranslation("settings")
	const id = useId()
	const helperId = `${id}-helper`
	const [resentFailure, setResentFailure] = useState<MembersFailure>()
	const failureText = useFailureText(
		refusal || failure === resentFailure ? undefined : failure,
		space,
	)
	const isEmpty = email.trim() === ""
	const hint = isHosted
		? t("space.members.invite.hint")
		: t("space.members.invite.notShared", { name: space })

	const submit = (event: FormEvent) => {
		event.preventDefault()
		if (!isEmpty) {
			setResentFailure(failure)
			onInvite(email)
		}
	}

	return (
		<form className="flex flex-col gap-1.5" noValidate onSubmit={submit}>
			<label
				className={cn(FIELD_LABEL_CLASS, !isHosted && "opacity-50")}
				htmlFor={id}
			>
				{t("space.members.invite.label")}
			</label>
			<div className="flex gap-1.5">
				<input
					aria-describedby={helperId}
					aria-invalid={refusal ? true : undefined}
					autoComplete="email"
					className={cn(
						FIELD_CONTROL_CLASS,
						"min-w-0 flex-1 disabled:opacity-50",
						refusal && [
							FIELD_CONTROL_INVALID_CLASS,
							"ring-3 ring-destructive/20",
						],
					)}
					id={id}
					inputMode="email"
					onChange={(event) => onEmailChange(event.target.value)}
					placeholder={t("space.members.invite.placeholder")}
					spellCheck={false}
					type="email"
					disabled={!isHosted}
					value={email}
				/>
				<Button disabled={!isHosted || isEmpty} type="submit">
					{t("space.members.invite.action")}
				</Button>
			</div>
			<p
				className={cn(
					"break-words text-xs",
					refusal || failureText ? "text-destructive" : "text-muted-foreground",
				)}
				id={helperId}
			>
				{refusal
					? t(`space.members.invite.refusal.${refusal}`, { email })
					: !failureText && hint}
				<span role="status">{failureText}</span>
			</p>
		</form>
	)
}

type MemberAvatarProps = {
	member: SpaceMember
}

const MemberAvatar = ({ member }: MemberAvatarProps) =>
	member.status === "pending" ? (
		<span
			aria-hidden="true"
			className="grid size-7 place-items-center rounded-full border border-input border-dashed"
		>
			<Icons.Mail className="size-3.5 text-muted-foreground" />
		</span>
	) : (
		<AvatarFrame shape="round" size={AVATAR_SIZE} slot="member-avatar">
			<span
				aria-hidden="true"
				className="grid size-full place-items-center bg-muted font-semibold text-foreground text-xs/4 uppercase"
			>
				{Array.from(nameOf(member))[0]}
			</span>
		</AvatarFrame>
	)

type MemberRowProps = Pick<MembersPanelProps, "onRemove" | "onWithdraw"> & {
	member: SpaceMember
	failureText: string
}

const MemberRow = ({
	member,
	failureText,
	onRemove,
	onWithdraw,
}: MemberRowProps) => {
	const { t } = useTranslation("settings")
	const isPending = member.status === "pending"

	return (
		<li
			className="col-span-full grid grid-cols-subgrid items-center py-2 pr-2 pl-3"
			data-slot="space-member"
		>
			<MemberAvatar member={member} />
			<div className="flex min-w-0 flex-col">
				<p className="truncate text-foreground text-sm">{nameOf(member)}</p>
				{isPending ? null : (
					<p className="truncate text-muted-foreground text-xs">
						{member.email}
					</p>
				)}
				<p className="break-words text-destructive text-xs" role="status">
					{failureText}
				</p>
			</div>
			<span
				className={cn(
					SETTINGS_TAG_CLASS,
					"justify-self-end",
					isPending ? "text-muted-foreground" : "text-foreground",
				)}
			>
				{t(`space.members.status.${member.status}`)}
			</span>
			{member.status === "host" ? (
				<span aria-hidden="true" className="h-7 w-17.5" />
			) : (
				<Button
					aria-label={t("space.members.removeLabel", { name: nameOf(member) })}
					className="min-w-17.5 rounded-control px-2.5 text-compact text-muted-foreground leading-5"
					onClick={() => (isPending ? onWithdraw : onRemove)(member)}
					size="sm"
					variant="ghost"
				>
					{t("space.members.remove")}
				</Button>
			)}
		</li>
	)
}

const MembersPanel = ({
	space,
	members,
	email,
	onEmailChange,
	onInvite,
	refusal,
	failure,
	isHosted,
	removing,
	onRemove,
	onWithdraw,
	onRemoveConfirm,
	onRemoveCancel,
}: MembersPanelProps) => {
	const { t } = useTranslation("settings")
	const isAnswered = useRef(false)
	const [asked, setAsked] = useState(removing)

	if (removing && removing !== asked) {
		setAsked(removing)
	}

	const confirm = () => {
		isAnswered.current = true
		onRemoveConfirm()
	}

	const close = () => {
		if (!isAnswered.current) {
			onRemoveCancel()
		}
		isAnswered.current = false
	}

	const name = asked ? firstNameOf(asked) : ""
	const rowFailure = failure?.action === "invite" ? undefined : failure
	const rowFailureText = useFailureText(rowFailure, space)

	return (
		<div className="flex flex-col gap-6" data-slot="members-panel">
			<InviteField
				email={email}
				failure={failure?.action === "invite" ? failure : undefined}
				isHosted={isHosted}
				onEmailChange={onEmailChange}
				onInvite={onInvite}
				refusal={refusal}
				space={space}
			/>
			<ul className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-x-2.5 divide-y divide-border rounded-xl border border-border">
				{members.map((member) => (
					<MemberRow
						failureText={
							rowFailure?.member.id === member.id ? rowFailureText : ""
						}
						key={member.id}
						member={member}
						onRemove={onRemove}
						onWithdraw={onWithdraw}
					/>
				))}
			</ul>
			<ConfirmDialog
				confirmLabel={t("space.members.remove")}
				description={t("space.members.confirm.description", { name })}
				onConfirm={confirm}
				onOpenChange={close}
				open={Boolean(removing)}
				title={t("space.members.confirm.title", { name, space })}
			/>
		</div>
	)
}

export {
	type InviteRefusal,
	type MembersFailure,
	MembersPanel,
	type MembersPanelProps,
	type SpaceMember,
	type SpaceMemberStatus,
}
