use serde_json::json;

use super::*;

const NOW: &str = "2026-11-09T12:00:00Z";

fn now() -> DateTime<Utc> {
	DateTime::parse_from_rfc3339(NOW).expect("the clock reads").with_timezone(&Utc)
}

fn account(value: serde_json::Value) -> KiroshiAccount {
	serde_json::from_value(value).expect("the account reads")
}

fn signed_in() -> KiroshiAccount {
	account(json!({ "kind": "signedIn", "email": "ada@example.com", "plan": null }))
}

fn refused() -> KiroshiAccount {
	account(json!({ "kind": "signedOut", "reason": "deviceRefused" }))
}

fn approval(value: serde_json::Value) -> Approval {
	serde_json::from_value(value).expect("the approval reads")
}

fn pending() -> Approval {
	approval(json!({ "kind": "pending", "expiresAt": "2026-11-09T12:30:00Z" }))
}

fn listed(id: &str, status: &str, expires_at: Option<&str>, current: bool) -> ListedDevice {
	serde_json::from_value(json!({
		"id": id,
		"name": format!("{id} laptop"),
		"kind": "computer",
		"status": status,
		"approvalExpiresAt": expires_at,
		"lastActiveAt": NOW,
		"current": current,
		"fingerprint": null,
	}))
	.expect("the device reads")
}

fn asking(id: &str) -> ListedDevice {
	listed(id, "pending", Some("2026-11-09T12:10:00Z"), false)
}

#[test]
fn every_approval_and_account_lands_on_its_new_device_step() {
	let signed_out = account(json!({ "kind": "signedOut", "reason": null }));
	let revoked = account(json!({ "kind": "signedOut", "reason": "deviceRevoked" }));
	let unreachable = account(json!({ "kind": "unreachable", "reason": "offline" }));
	let cases = [
		(Some(pending()), Some(signed_in()), false, Some(NewDeviceStep::Waiting)),
		(Some(pending()), Some(signed_in()), true, Some(NewDeviceStep::Code)),
		(Some(Approval::Expired), Some(signed_in()), true, Some(NewDeviceStep::Expired)),
		(Some(pending()), Some(refused()), false, Some(NewDeviceStep::Rejected)),
		(None, Some(refused()), false, Some(NewDeviceStep::Rejected)),
		(Some(Approval::Approved), Some(signed_in()), true, None),
		(Some(Approval::None), Some(signed_out), false, None),
		(Some(Approval::None), Some(revoked), false, None),
		(Some(Approval::None), Some(unreachable), false, None),
		(None, None, false, None),
	];
	for (approval, account, is_code_asked, step) in cases {
		assert_eq!(
			step_of(approval.as_ref(), account.as_ref(), is_code_asked),
			step,
			"{approval:?} {account:?} {is_code_asked}"
		);
	}
}

#[test]
fn every_core_device_kind_has_its_card_kind() {
	assert_eq!(device_kind_of(CoreDeviceKind::Phone), DeviceKind::Phone);
	assert_eq!(device_kind_of(CoreDeviceKind::Computer), DeviceKind::Laptop);
}

#[test]
fn the_approval_status_follows_the_run_on_the_asked_device_only() {
	let asked = Asking {
		device_id: "d1".to_owned(),
		name: None,
		kind: CoreDeviceKind::Computer,
		expires_at: String::new(),
	};
	let run = |device_id: &str, has_failed| Run { device_id: device_id.to_owned(), has_failed };
	assert_eq!(approval_status_of(None, &asked), ApprovalStatus::Asking);
	assert_eq!(approval_status_of(Some(&run("d2", false)), &asked), ApprovalStatus::Asking);
	assert_eq!(approval_status_of(Some(&run("d1", false)), &asked), ApprovalStatus::Approving);
	assert_eq!(approval_status_of(Some(&run("d1", true)), &asked), ApprovalStatus::Failed);
}

#[test]
fn only_another_pending_device_still_in_time_asks_for_approval() {
	let devices = vec![
		asking("asking"),
		listed("this", "pending", Some("2026-11-09T12:10:00Z"), true),
		listed("approved", "approved", None, false),
		listed("lapsed", "pending", Some("2026-11-09T11:59:00Z"), false),
		listed("undated", "pending", None, false),
	];
	let ids: Vec<String> =
		asking_devices_of(devices, now()).into_iter().map(|device| device.device_id).collect();
	assert_eq!(ids, vec!["asking".to_owned()]);
}

#[test]
fn a_pending_device_watches_its_approval_once_until_the_watch_is_due() {
	let mut devices = Devices::default();
	let watch = Call::Wake(DEVICE_WATCH, Due::DeviceWatch);

	assert_eq!(devices.read(pending(), Some(&signed_in())), vec![watch.clone()]);
	assert!(devices.read(pending(), Some(&signed_in())).is_empty());
	assert_eq!(devices.watch_due(), vec![Call::ReadDeviceApproval, Call::ReadKiroshiAccount]);
	assert_eq!(devices.read(pending(), Some(&signed_in())), vec![watch]);

	assert_eq!(devices.read(Approval::Approved, Some(&signed_in())), vec![Call::ReadDevices]);
	assert!(devices.watch_due().is_empty());
	assert!(devices.read(Approval::Approved, Some(&signed_in())).is_empty());
}

#[test]
fn the_code_takes_six_digits_and_is_sent_only_when_full() {
	let mut devices = Devices::default();
	devices.read(pending(), Some(&signed_in()));

	assert_eq!(devices.event(NewDeviceEvent::UseCode), Some(Call::RequestDeviceCode));
	assert_eq!(devices.step(Some(&signed_in())), Some(NewDeviceStep::Code));
	for digit in "1234567".chars() {
		devices.event(NewDeviceEvent::TypeDigit(digit));
	}
	assert_eq!(devices.code, "123456");
	devices.event(NewDeviceEvent::EraseDigit);
	assert_eq!(devices.event(NewDeviceEvent::ApproveWithCode), None);
	devices.event(NewDeviceEvent::TypeDigit('9'));
	assert_eq!(
		devices.event(NewDeviceEvent::ApproveWithCode),
		Some(Call::SubmitDeviceCode("123459".to_owned()))
	);

	devices.read(Approval::Expired, Some(&signed_in()));
	devices.read(pending(), Some(&signed_in()));
	assert_eq!(devices.step(Some(&signed_in())), Some(NewDeviceStep::Waiting));
}

#[test]
fn each_screen_link_calls_the_core_it_names() {
	let mut devices = Devices::default();
	let cases = [
		(NewDeviceEvent::ResendCode, Call::RequestDeviceCode),
		(NewDeviceEvent::AskAgain, Call::RetryDeviceApproval),
		(NewDeviceEvent::SignOut, Call::KiroshiSignOut),
		(NewDeviceEvent::BackToSignIn, Call::KiroshiSignIn),
	];
	for (event, call) in cases {
		assert_eq!(devices.event(event), Some(call), "{event:?}");
	}
}

#[test]
fn a_settled_request_leaves_the_queue_and_is_not_asked_again() {
	let mut devices = Devices::default();
	devices.listed(vec![asking("d1"), asking("d2")], now());
	devices.listed(vec![asking("d1")], now());

	assert_eq!(devices.asked().map(|asked| asked.device_id.as_str()), Some("d1"));
	assert_eq!(devices.approve(), Some(Call::ApproveDevice("d1".to_owned())));
	assert_eq!(devices.approve(), None);
	assert_eq!(devices.refuse(), None);

	devices.approval_failed("d1");
	assert_eq!(devices.asked().map(|asked| devices.status_of(asked)), Some(ApprovalStatus::Failed));

	assert!(devices.settle("d1").is_some());
	devices.listed(vec![asking("d1")], now());
	assert_eq!(devices.asked().map(|asked| asked.device_id.as_str()), Some("d2"));
	assert_eq!(devices.asked().map(|asked| devices.status_of(asked)), Some(ApprovalStatus::Asking));
}
