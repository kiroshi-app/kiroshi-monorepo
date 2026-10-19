"use client"

import { type FormEvent, type ReactNode, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { AvatarFrame } from "@workspace/ui/components/initials-avatar"
import {
	ListSkeleton,
	SkeletonBar,
} from "@workspace/ui/components/list-skeleton"
import {
	FIELD_CONTROL_CLASS,
	FIELD_LABEL_CLASS,
	SETTINGS_TAG_CLASS,
} from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { useSkeletonTiming } from "@workspace/ui/hooks/use-skeleton-timing"
import { formatDateTime } from "@workspace/ui/lib/time-format"
import { cn } from "@workspace/ui/lib/utils"

type SpaceMemberStatus =
	| "host"
	| "joined"
	| "needsInvitation"
	| "pending"
	| "expired"

type SpaceMember = {
	id: string
	name?: string
	email: string
	status: SpaceMemberStatus
	fingerprint?: string
	expiresInDays?: number
	sentAt?: number
}

type InviteRefusal = "invited" | "self" | "malformed"

type InviteBlocker = "signedOut" | "hostOffline"

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
	isPending?: boolean
	email: string
	onEmailChange: (email: string) => void
	onInvite: (email: string) => void
	refusal?: InviteRefusal
	failure?: MembersFailure
	isHosted: boolean
	blockedBy?: InviteBlocker
	viewerId?: string
	removing?: SpaceMember | null
	onRemove: (member: SpaceMember) => void
	onWithdraw: (member: SpaceMember) => void
	onInviteAgain: (member: SpaceMember) => void
	onRemoveConfirm: () => void
	onRemoveCancel: () => void
}

const AVATAR_SIZE = 28

const MONTH_AND_DAY: Intl.DateTimeFormatOptions = {
	month: "long",
	day: "numeric",
}

const ROW_ACTION_SLOT = "size-7 shrink-0"

const MEMBERS_LIST = "divide-y divide-border rounded-xl border border-border"

const MEMBER_SKELETON_LIST =
	"gap-0 [--skeleton-title:--spacing(21)] [--skeleton-sub:--spacing(30)] [&>:nth-child(3n+2)]:[--skeleton-title:--spacing(18)] [&>:nth-child(3n+2)]:[--skeleton-sub:--spacing(33)] [&>:nth-child(3n)]:[--skeleton-title:--spacing(24)] [&>:nth-child(3n)]:[--skeleton-sub:--spacing(27.5)]"

const nameOf = (member: SpaceMember) => member.name ?? member.email

const firstNameOf = (member: SpaceMember) => nameOf(member).split(/\s+/)[0]

const isInvitation = (member: SpaceMember) =>
	member.status === "pending" || member.status === "expired"

const failureKeyOf = (failure: MembersFailure, viewerId?: string) => {
	switch (failure.action) {
		case "invite":
			return `space.members.failure.invite.${failure.reason}` as const
		case "withdraw":
			return `space.members.failure.withdraw.${failure.reason}` as const
		case "remove":
			return failure.reason === "host" &&
				viewerId !== undefined &&
				viewerId !== failure.member.id
				? "space.members.failure.remove.hostedBy"
				: (`space.members.failure.remove.${failure.reason}` as const)
	}
}

const useFailureText = (
	failure: MembersFailure | undefined,
	space: string,
	viewerId?: string,
) => {
	const { t } = useTranslation("settings")
	if (!failure) {
		return ""
	}
	const isInvite = failure.action === "invite"
	return t(failureKeyOf(failure, viewerId), {
		space,
		email: isInvite ? failure.email : failure.member.email,
		name: isInvite ? "" : nameOf(failure.member),
	})
}

type InviteFieldProps = Pick<
	MembersPanelProps,
	| "space"
	| "email"
	| "onEmailChange"
	| "onInvite"
	| "refusal"
	| "isHosted"
	| "blockedBy"
> & {
	failure?: MembersFailure
	host: string
}

const InviteField = ({
	space,
	email,
	onEmailChange,
	onInvite,
	refusal,
	failure,
	isHosted,
	blockedBy,
	host,
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
	const isBlocked = !isHosted || blockedBy !== undefined
	const message = refusal
		? t(`space.members.invite.refusal.${refusal}`, { email })
		: failureText
	const hint =
		blockedBy === "hostOffline"
			? t("space.members.invite.hostOffline", { name: space, host })
			: blockedBy === "signedOut"
				? t("space.members.invite.signedOut")
				: isHosted
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
				className={cn(FIELD_LABEL_CLASS, isBlocked && "opacity-50")}
				htmlFor={id}
			>
				{t("space.members.invite.label")}
			</label>
			<div className="flex gap-1.5">
				<input
					aria-describedby={helperId}
					aria-invalid={message ? true : undefined}
					autoComplete="email"
					className={cn(
						FIELD_CONTROL_CLASS,
						"min-w-0 flex-1 disabled:opacity-50",
					)}
					id={id}
					inputMode="email"
					onChange={(event) => onEmailChange(event.target.value)}
					placeholder={t("space.members.invite.placeholder")}
					spellCheck={false}
					type="email"
					disabled={isBlocked}
					value={email}
				/>
				<Button disabled={isBlocked || isEmpty} type="submit">
					{t("space.members.invite.action")}
				</Button>
			</div>
			<p
				className={cn(
					"break-words text-xs",
					message ? "text-destructive" : "text-muted-foreground",
				)}
				id={helperId}
			>
				{message ? null : hint}
				<span role="status">{message}</span>
			</p>
		</form>
	)
}

type MemberAvatarProps = {
	member: SpaceMember
}

const MemberAvatar = ({ member }: MemberAvatarProps) =>
	isInvitation(member) ? (
		<span
			aria-hidden="true"
			className="grid size-7 shrink-0 place-items-center rounded-full border border-input border-dashed"
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

type MemberAction = {
	icon: ReactNode
	label: string
	run: () => void
}

type MemberRowProps = Pick<
	MembersPanelProps,
	"onInvite" | "onRemove" | "onWithdraw" | "onInviteAgain"
> & {
	member: SpaceMember
	failureText: string
	isViewer: boolean
	isDisabled: boolean
}

const MemberRow = ({
	member,
	failureText,
	isViewer,
	isDisabled,
	onInvite,
	onRemove,
	onWithdraw,
	onInviteAgain,
}: MemberRowProps) => {
	const { t } = useTranslation("settings")
	const name = nameOf(member)
	const { status, email, fingerprint, expiresInDays, sentAt } = member

	const actionOf: Partial<Record<SpaceMemberStatus, MemberAction>> = {
		pending: {
			icon: <Icons.Close />,
			label: t("space.members.withdrawLabel", { email }),
			run: () => onWithdraw(member),
		},
		expired: {
			icon: <Icons.Retry />,
			label: t("space.members.inviteAgainLabel", { email }),
			run: () => onInvite(email),
		},
		joined: {
			icon: <Icons.Delete />,
			label: t("space.members.removeLabel", { name }),
			run: () => onRemove(member),
		},
	}
	const action = isViewer ? undefined : actionOf[status]

	const sublineOf: Record<SpaceMemberStatus, string | undefined> = {
		host: email,
		joined: email,
		needsInvitation: t("space.members.needsInvitation"),
		pending:
			expiresInDays === undefined
				? undefined
				: t("space.members.pending", { count: expiresInDays }),
		expired:
			sentAt === undefined
				? undefined
				: t("space.members.expired", {
						date: formatDateTime(sentAt, MONTH_AND_DAY),
					}),
	}
	const subline = sublineOf[status]
	const isTagged = status === "host" || status === "expired"

	return (
		<li
			className="flex items-center gap-2.5 py-2 ps-3 pe-2"
			data-slot="space-member"
			data-status={status}
		>
			<MemberAvatar member={member} />
			<div className="flex min-w-0 flex-1 flex-col">
				<p className="truncate text-foreground text-sm/5">
					{isViewer ? t("space.members.you", { name }) : name}
				</p>
				{subline === undefined ? null : (
					<p className="truncate text-muted-foreground text-xs/4">{subline}</p>
				)}
				{fingerprint === undefined || isInvitation(member) ? null : (
					<p
						className="break-words font-mono text-muted-foreground text-xs/4.5"
						data-slot="member-fingerprint"
					>
						{fingerprint}
					</p>
				)}
				<p className="break-words text-destructive text-xs" role="status">
					{failureText}
				</p>
			</div>
			{isTagged ? (
				<span
					className={cn(
						SETTINGS_TAG_CLASS,
						status === "host" ? "text-foreground" : "text-muted-foreground",
					)}
				>
					{t(`space.members.status.${status}`)}
				</span>
			) : null}
			{status === "needsInvitation" && !isViewer ? (
				<Button
					className="rounded-control"
					disabled={isDisabled}
					onClick={() => onInviteAgain(member)}
					size="sm"
					variant="outline"
				>
					{t("space.members.inviteMemberAgain")}
				</Button>
			) : action ? (
				<Button
					aria-label={action.label}
					className="rounded-control text-muted-foreground"
					disabled={isDisabled}
					onClick={action.run}
					size="icon-sm"
					variant="ghost"
				>
					{action.icon}
				</Button>
			) : (
				<span aria-hidden="true" className={ROW_ACTION_SLOT} />
			)}
		</li>
	)
}

const MemberRowSkeleton = () => (
	<div className="flex items-center gap-2.5 border-border border-b py-2 ps-3 pe-2">
		<Skeleton className="size-7 shrink-0 animate-none rounded-full bg-border" />
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="flex h-5 items-center">
				<SkeletonBar className="h-2.5 w-(--skeleton-title)" />
			</div>
			<div className="flex h-4 items-center">
				<SkeletonBar className="h-2 w-(--skeleton-sub)" isFaint />
			</div>
			<div className="flex h-4.5 items-center">
				<SkeletonBar className="h-2 w-(--skeleton-sub)" isFaint />
			</div>
		</div>
		<div className={ROW_ACTION_SLOT} />
	</div>
)

type MembersSectionProps = {
	label: string
	isFilling?: boolean
	children: (labelId: string) => ReactNode
}

const MembersSection = ({
	label,
	isFilling = false,
	children,
}: MembersSectionProps) => {
	const labelId = useId()

	return (
		<div
			className={cn("flex flex-col gap-1.5", isFilling && "min-h-0 flex-1")}
			data-slot="members-section"
		>
			<p className={FIELD_LABEL_CLASS} id={labelId}>
				{label}
			</p>
			{children(labelId)}
		</div>
	)
}

const MembersPanel = ({
	space,
	members,
	isPending = false,
	email,
	onEmailChange,
	onInvite,
	refusal,
	failure,
	isHosted,
	blockedBy,
	viewerId,
	removing,
	onRemove,
	onWithdraw,
	onInviteAgain,
	onRemoveConfirm,
	onRemoveCancel,
}: MembersPanelProps) => {
	const { t } = useTranslation("settings")
	const isAnswered = useRef(false)
	const [asked, setAsked] = useState(removing)
	const phase = useSkeletonTiming(isPending)
	const isAwaiting = phase === "delay" || phase === "skeleton"

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
	const rowFailureText = useFailureText(rowFailure, space, viewerId)
	const host = members.find((member) => member.status === "host")
	const invitations = members.filter(isInvitation)
	const people = members.filter((member) => !isInvitation(member))

	const rowsOf = (shown: SpaceMember[]) =>
		shown.map((member) => (
			<MemberRow
				failureText={rowFailure?.member.id === member.id ? rowFailureText : ""}
				isDisabled={blockedBy === "hostOffline"}
				isViewer={member.id === viewerId}
				key={member.id}
				member={member}
				onInvite={onInvite}
				onInviteAgain={onInviteAgain}
				onRemove={onRemove}
				onWithdraw={onWithdraw}
			/>
		))

	return (
		<div
			aria-busy={isAwaiting}
			className="flex flex-1 flex-col gap-6"
			data-slot="members-panel"
		>
			<InviteField
				blockedBy={blockedBy}
				email={email}
				failure={failure?.action === "invite" ? failure : undefined}
				host={host ? firstNameOf(host) : ""}
				isHosted={isHosted}
				onEmailChange={onEmailChange}
				onInvite={onInvite}
				refusal={refusal}
				space={space}
			/>
			{phase === "skeleton" ? (
				<MembersSection isFilling label={t("space.members.list")}>
					{() => (
						<div
							className="flex min-h-0 flex-1 flex-col rounded-xl border border-border"
							data-slot="members-skeleton-frame"
						>
							<ListSkeleton
								className={MEMBER_SKELETON_LIST}
								row={<MemberRowSkeleton />}
							/>
						</div>
					)}
				</MembersSection>
			) : null}
			{isAwaiting || invitations.length === 0 ? null : (
				<MembersSection label={t("space.members.invitations")}>
					{(labelId) => (
						<ul aria-labelledby={labelId} className={MEMBERS_LIST}>
							{rowsOf(invitations)}
						</ul>
					)}
				</MembersSection>
			)}
			{isAwaiting ? null : (
				<MembersSection label={t("space.members.list")}>
					{(labelId) => (
						<ul aria-labelledby={labelId} className={MEMBERS_LIST}>
							{rowsOf(people)}
						</ul>
					)}
				</MembersSection>
			)}
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
