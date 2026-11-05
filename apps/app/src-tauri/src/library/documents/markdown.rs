use yrs::updates::decoder::Decode;
use yrs::updates::encoder::Encode;
use yrs::{Assoc, Doc, GetString, IndexedSequence, ReadTxn, StickyIndex, Text, TextRef, Transact};

use super::{decoded, full_state, merged_into, Location, Placement, RemoveStep, WriteStep};
use crate::library::contract::LibraryError;
use crate::library::{undecodable, within, MAX_DOCUMENT_BYTES};

const TEXT_NAME: &str = "markdown";

pub(super) fn exported(doc: &Doc) -> Vec<u8> {
	text_of(doc).into_bytes()
}

pub(super) fn bounded(doc: &Doc, name: &str) -> Result<(), LibraryError> {
	within(name, text_of(doc).len() as u64, MAX_DOCUMENT_BYTES)
}

pub(crate) fn located(
	state: &[u8],
	name: &str,
	placement: &Placement<'_>,
) -> Result<Location, LibraryError> {
	let doc = Doc::new();
	merged_into(&doc, name, decoded(name, state)?)?;
	let text = doc.get_or_insert_text(TEXT_NAME);
	let txn = doc.transact();
	let current = text.get_string(&txn);
	let (start, end) = match placement {
		Placement::End => (current.len(), current.len()),
		Placement::Whole => (0, current.len()),
		Placement::After(passage) | Placement::Replacing(passage) => {
			match passage_starts(&current, passage).as_slice() {
				[] => return Ok(Location::PassageNotFound),
				[start] if matches!(placement, Placement::After(_)) => {
					(start + passage.len(), start + passage.len())
				}
				[start] => (*start, start + passage.len()),
				starts => return Ok(Location::PassageNotUnique { occurrences: starts.len() }),
			}
		}
	};
	let caret = caret_at(&text, &txn, start, name)?;
	if start == end {
		return Ok(Location::Caret(caret));
	}
	Ok(Location::Passage { start: caret, end: caret_at(&text, &txn, end, name)? })
}

fn passage_starts(text: &str, passage: &str) -> Vec<usize> {
	let mut starts = Vec::new();
	let mut from = 0;
	while let Some(found) = text.get(from..).and_then(|rest| rest.find(passage)) {
		let start = from + found;
		starts.push(start);
		from = start + text[start..].chars().next().map_or(1, char::len_utf8);
	}
	starts
}

pub(super) fn inserted_by(
	doc: &Doc,
	name: &str,
	step: &WriteStep<'_>,
) -> Result<(Vec<u8>, Vec<u8>), LibraryError> {
	let writer = writer_of(doc, step.writer, name)?;
	let text = writer.get_or_insert_text(TEXT_NAME);
	let mut txn = writer.transact_mut();
	let index = index_of(step.caret, &text, &txn, name)?;
	text.insert(&mut txn, index, step.text);
	let caret = caret_at(&text, &txn, index as usize + step.text.len(), name)?;
	let update = txn.encode_state_as_update_v1(&doc.transact().state_vector());
	Ok((update, caret))
}

pub(super) fn removed_by(
	doc: &Doc,
	name: &str,
	step: &RemoveStep<'_>,
) -> Result<(Vec<u8>, Vec<u8>), LibraryError> {
	let writer = writer_of(doc, step.writer, name)?;
	let text = writer.get_or_insert_text(TEXT_NAME);
	let mut txn = writer.transact_mut();
	let start = index_of(step.start, &text, &txn, name)?;
	let end = index_of(step.end, &text, &txn, name)?;
	if end > start {
		text.remove_range(&mut txn, start, end - start);
	}
	let caret = caret_at(&text, &txn, start as usize, name)?;
	let update = txn.encode_state_as_update_v1(&doc.transact().state_vector());
	Ok((update, caret))
}

fn writer_of(doc: &Doc, writer: u64, name: &str) -> Result<Doc, LibraryError> {
	let copy = Doc::with_client_id(writer);
	merged_into(&copy, name, decoded(name, &full_state(doc))?)?;
	Ok(copy)
}

fn index_of<T: ReadTxn>(
	caret: &[u8],
	text: &TextRef,
	txn: &T,
	name: &str,
) -> Result<u32, LibraryError> {
	let anchor =
		StickyIndex::decode_v1(caret).map_err(|error| undecodable(name, error.to_string()))?;
	Ok(anchor.get_offset(txn).map_or_else(|| text.len(txn), |offset| offset.index))
}

fn caret_at<T: ReadTxn>(
	text: &TextRef,
	txn: &T,
	index: usize,
	name: &str,
) -> Result<Vec<u8>, LibraryError> {
	u32::try_from(index)
		.ok()
		.and_then(|index| text.sticky_index(txn, index, Assoc::Before))
		.map(|caret| caret.encode_v1())
		.ok_or_else(|| undecodable(name, format!("no caret stands at byte {index}")))
}

fn text_of(doc: &Doc) -> String {
	doc.get_or_insert_text(TEXT_NAME).get_string(&doc.transact())
}

pub(super) fn reconciled(doc: &Doc, wanted: &str) -> bool {
	let text = doc.get_or_insert_text(TEXT_NAME);
	let mut txn = doc.transact_mut();
	let current = text.get_string(&txn);
	if current == wanted {
		return false;
	}
	let prefix = shared_bytes(current.chars(), wanted.chars());
	let suffix = shared_bytes(current[prefix..].chars().rev(), wanted[prefix..].chars().rev());
	let removed = current.len() - prefix - suffix;
	text.remove_range(&mut txn, prefix as u32, removed as u32);
	text.insert(&mut txn, prefix as u32, &wanted[prefix..wanted.len() - suffix]);
	true
}

fn shared_bytes(left: impl Iterator<Item = char>, right: impl Iterator<Item = char>) -> usize {
	left.zip(right).take_while(|(a, b)| a == b).map(|(a, _)| a.len_utf8()).sum()
}
