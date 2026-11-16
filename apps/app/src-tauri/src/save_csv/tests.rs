use std::fs;
use std::future::{ready, Ready};
use std::path::PathBuf;

use tauri_plugin_dialog::FilePath;
use tokio::sync::oneshot;
use uuid::Uuid;

use super::contract::SaveCsvError;
use super::{answered_destination, save_csv};
use crate::removed_on_drop::RemovedOnDrop;

const TEXT: &str = "name,city\r\n\"Zo\u{eb}\",\"K\u{f6}ln\"\n";

fn temp_folder() -> RemovedOnDrop {
	let folder =
		RemovedOnDrop(std::env::temp_dir().join(format!("kiroshi-save-csv-{}", Uuid::new_v4())));
	fs::create_dir_all(&*folder).expect("the destination folder lands");
	folder
}

fn chosen(
	destination: Option<PathBuf>,
) -> impl FnOnce(&str) -> Ready<Result<Option<PathBuf>, SaveCsvError>> {
	move |_| ready(Ok(destination))
}

#[tokio::test]
async fn a_text_lands_byte_for_byte_where_the_person_chose_under_the_suggested_name() {
	let folder = temp_folder();
	let destination = folder.join("picked.csv");
	let mut suggested = None;

	let saved = save_csv("people.csv", TEXT.to_owned(), |name| {
		suggested = Some(name.to_owned());
		ready(Ok(Some(destination.clone())))
	})
	.await;

	assert_eq!(saved, Ok(Some(destination.clone())));
	assert_eq!(suggested.as_deref(), Some("people.csv"));
	assert_eq!(fs::read(&destination).expect("the file reads"), TEXT.as_bytes());
}

#[tokio::test]
async fn a_cancelled_picker_writes_nothing() {
	assert_eq!(save_csv("people.csv", TEXT.to_owned(), chosen(None)).await, Ok(None));
}

#[tokio::test]
async fn a_name_in_any_case_of_the_extension_is_accepted() {
	for name in ["PEOPLE.CSV", "people.Csv", ".csv"] {
		assert_eq!(save_csv(name, TEXT.to_owned(), chosen(None)).await, Ok(None), "{name}");
	}
}

#[tokio::test]
async fn an_invalid_name_never_opens_the_picker() {
	let never_opened = |_: &str| -> Ready<_> { panic!("the picker opened") };

	for name in ["", "people", "people.csv.txt", "csv", "../people.csv", "exports\\people.csv"] {
		assert_eq!(
			save_csv(name, TEXT.to_owned(), never_opened).await,
			Err(SaveCsvError::InvalidName { name: name.to_owned() }),
			"{name:?}"
		);
	}
}

#[tokio::test]
async fn a_text_that_cannot_be_written_carries_the_os_detail() {
	let folder = temp_folder();
	let in_a_missing_folder = folder.join("absent").join("people.csv");

	let saved = save_csv("people.csv", TEXT.to_owned(), chosen(Some(in_a_missing_folder))).await;

	assert!(
		matches!(&saved, Err(SaveCsvError::Unwritable { detail }) if detail.contains("os error")),
		"{saved:?}"
	);
}

#[tokio::test]
async fn a_failure_of_the_picker_is_the_answer() {
	let refused = SaveCsvError::Unwritable { detail: "refused".to_owned() };

	let saved = save_csv("people.csv", TEXT.to_owned(), |_| ready(Err(refused.clone()))).await;

	assert_eq!(saved, Err(refused));
}

#[tokio::test]
async fn a_dialog_closed_without_an_answer_is_unwritable_instead_of_hanging() {
	let (answer, answered) = oneshot::channel::<Option<FilePath>>();
	drop(answer);

	let chosen = answered_destination(answered).await;

	assert!(matches!(chosen, Err(SaveCsvError::Unwritable { .. })), "{chosen:?}");
}

#[tokio::test]
async fn an_answered_dialog_gives_the_path_picked_or_none_when_cancelled() {
	let picked = PathBuf::from("/exports/people.csv");
	let (answer, answered) = oneshot::channel();
	answer.send(Some(FilePath::Path(picked.clone()))).expect("the answer is awaited");
	let (cancel, cancelled) = oneshot::channel();
	cancel.send(None).expect("the cancel is awaited");

	assert_eq!(answered_destination(answered).await, Ok(Some(picked)));
	assert_eq!(answered_destination(cancelled).await, Ok(None));
}

#[test]
fn the_error_is_tagged_kind_in_camel_case() {
	let invalid = SaveCsvError::InvalidName { name: "people".to_owned() };
	let unwritable = SaveCsvError::Unwritable { detail: "denied".to_owned() };

	assert_eq!(
		serde_json::to_value(invalid).expect("the error serialises"),
		serde_json::json!({ "kind": "invalidName", "name": "people" })
	);
	assert_eq!(
		serde_json::to_value(unwritable).expect("the error serialises"),
		serde_json::json!({ "kind": "unwritable", "detail": "denied" })
	);
}
