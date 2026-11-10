use super::contract::{AccountDevice, DeviceApproval, DeviceError};
use super::Devices;

pub fn device_approval(core: &crate::core_context::Core) -> DeviceApproval {
	let devices = core.state::<Devices>();
	devices.current()
}

pub async fn device_approval_retry(
	core: &crate::core_context::Core,
) -> Result<DeviceApproval, DeviceError> {
	super::retried(core).await
}

pub async fn device_approval_code_request(
	core: &crate::core_context::Core,
) -> Result<(), DeviceError> {
	super::code_requested(core).await
}

pub async fn device_approval_code_submit(
	core: &crate::core_context::Core,
	code: String,
) -> Result<(), DeviceError> {
	super::code_submitted(core, &code).await
}

pub async fn device_approve(
	core: &crate::core_context::Core,
	device_id: String,
) -> Result<(), DeviceError> {
	super::approved(core, &device_id).await
}

pub async fn device_refuse(
	core: &crate::core_context::Core,
	device_id: String,
) -> Result<(), DeviceError> {
	super::refused(core, &device_id).await
}

pub async fn devices_list(
	core: &crate::core_context::Core,
) -> Result<Vec<AccountDevice>, DeviceError> {
	super::listed(core).await
}

pub async fn device_remove(
	core: &crate::core_context::Core,
	device_id: String,
) -> Result<(), DeviceError> {
	super::removed(core, &device_id).await
}
