use std::cmp::Ordering;

use serde_json::Value;

use super::contract::{
	FieldType, Filter, FilterMatchMode, FilterOperator, FilterRow, PayloadField, RoutineError,
};

pub fn validate(declared: &[PayloadField], filter: &Filter) -> Result<(), RoutineError> {
	for (index, row) in filter.rows.iter().enumerate() {
		let Some(field_type) = declared_type(declared, &row.field) else {
			continue;
		};
		if !field_type.operators().contains(&row.operator) {
			return Err(RoutineError::UnsupportedOperator {
				row: index,
				field: row.field.clone(),
				operator: row.operator,
				field_type,
			});
		}
	}
	Ok(())
}

pub fn admits(filter: &Filter, declared: &[PayloadField], payload: &Value) -> bool {
	let mut rows = filter.rows.iter().map(|row| holds(row, declared, payload));
	match filter.match_mode {
		FilterMatchMode::All => rows.all(|held| held),
		FilterMatchMode::Any => filter.rows.is_empty() || rows.any(|held| held),
	}
}

pub fn at_path<'a>(payload: &'a Value, path: &str) -> Option<&'a Value> {
	let found = path.split('.').try_fold(payload, |held, segment| held.get(segment))?;
	(!found.is_null()).then_some(found)
}

fn declared_type(declared: &[PayloadField], field: &str) -> Option<FieldType> {
	declared.iter().find(|held| held.name == field).map(|held| held.field_type)
}

fn holds(row: &FilterRow, declared: &[PayloadField], payload: &Value) -> bool {
	let held = at_path(payload, &row.field);
	match row.operator {
		FilterOperator::Exists => return held.is_some(),
		FilterOperator::NotExists => return held.is_none(),
		_ => {}
	}
	let (Some(held), Some(field_type)) = (held, declared_type(declared, &row.field)) else {
		return false;
	};
	let Some(expected) = row.value.as_ref() else {
		return false;
	};
	compared(row.operator, read(held, field_type), read(expected, field_type))
}

#[derive(PartialEq)]
enum Reading {
	Text(String),
	Number(f64),
	Flag(bool),
}

fn read(value: &Value, field_type: FieldType) -> Option<Reading> {
	match field_type {
		FieldType::String => value.as_str().map(|text| Reading::Text(text.to_owned())),
		FieldType::Number => value.as_f64().map(Reading::Number),
		FieldType::Boolean => value.as_bool().map(Reading::Flag),
		FieldType::Datetime => match value {
			Value::String(text) => Some(Reading::Text(text.clone())),
			Value::Number(_) => value.as_f64().map(Reading::Number),
			_ => None,
		},
	}
}

fn compared(operator: FilterOperator, held: Option<Reading>, expected: Option<Reading>) -> bool {
	let (Some(held), Some(expected)) = (held, expected) else {
		return false;
	};
	match operator {
		FilterOperator::Equals => held == expected,
		FilterOperator::NotEquals => held != expected,
		FilterOperator::Contains => texts(&held, &expected).is_some_and(|(a, b)| a.contains(b)),
		FilterOperator::NotContains => texts(&held, &expected).is_some_and(|(a, b)| !a.contains(b)),
		FilterOperator::StartsWith => {
			texts(&held, &expected).is_some_and(|(a, b)| a.starts_with(b))
		}
		FilterOperator::EndsWith => texts(&held, &expected).is_some_and(|(a, b)| a.ends_with(b)),
		FilterOperator::Gt => ordered(&held, &expected) == Some(Ordering::Greater),
		FilterOperator::Lt => ordered(&held, &expected) == Some(Ordering::Less),
		FilterOperator::Exists | FilterOperator::NotExists => false,
	}
}

fn texts<'a>(held: &'a Reading, expected: &'a Reading) -> Option<(&'a str, &'a str)> {
	match (held, expected) {
		(Reading::Text(held), Reading::Text(expected)) => Some((held, expected)),
		_ => None,
	}
}

fn ordered(held: &Reading, expected: &Reading) -> Option<Ordering> {
	match (held, expected) {
		(Reading::Text(held), Reading::Text(expected)) => Some(held.as_str().cmp(expected)),
		(Reading::Number(held), Reading::Number(expected)) => held.partial_cmp(expected),
		_ => None,
	}
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::*;

	fn declared() -> Vec<PayloadField> {
		vec![
			PayloadField { name: "issue.title".to_owned(), field_type: FieldType::String },
			PayloadField { name: "issue.votes".to_owned(), field_type: FieldType::Number },
			PayloadField { name: "issue.draft".to_owned(), field_type: FieldType::Boolean },
			PayloadField { name: "issue.closedAt".to_owned(), field_type: FieldType::Datetime },
		]
	}

	fn payload() -> Value {
		json!({
			"issue": {
				"title": "a broken pipe",
				"votes": 7,
				"draft": false,
				"closedAt": "2026-09-02T10:00:00Z",
			},
		})
	}

	fn row(field: &str, operator: FilterOperator, value: Option<Value>) -> FilterRow {
		FilterRow { field: field.to_owned(), operator, value }
	}

	fn filtering(match_mode: FilterMatchMode, rows: Vec<FilterRow>) -> Filter {
		Filter { match_mode, rows }
	}

	fn admitted(rows: Vec<FilterRow>) -> bool {
		admits(&filtering(FilterMatchMode::All, rows), &declared(), &payload())
	}

	#[test]
	fn a_dotted_path_reads_the_value_it_names() {
		assert!(admitted(vec![row(
			"issue.title",
			FilterOperator::Equals,
			Some(json!("a broken pipe"))
		)]));
	}

	#[test]
	fn a_star_segment_is_read_as_a_key_and_expands_nothing() {
		let starred = json!({ "issue": { "*": "matched" } });

		assert_eq!(at_path(&starred, "issue.*"), Some(&json!("matched")));
		assert_eq!(at_path(&payload(), "issue.*"), None);
	}

	#[test]
	fn a_field_the_payload_does_not_hold_reads_the_row_as_false() {
		assert!(!admitted(vec![row("issue.author", FilterOperator::Equals, Some(json!("me")))]));
		assert!(!admitted(vec![row("issue.title.deeper", FilterOperator::Exists, None)]));
	}

	#[test]
	fn a_value_the_operator_cannot_read_as_that_field_type_reads_the_row_as_false() {
		assert!(!admitted(vec![row("issue.votes", FilterOperator::Gt, Some(json!("seven")))]));
		assert!(!admitted(vec![row("issue.draft", FilterOperator::Equals, Some(json!("false")))]));
		assert!(!admitted(vec![row("issue.title", FilterOperator::Contains, None)]));
	}

	#[test]
	fn a_row_over_a_field_no_source_declares_reads_as_false_unless_it_only_asks_for_presence() {
		let undeclared = json!({ "extra": "held" });

		assert!(!admits(
			&filtering(
				FilterMatchMode::All,
				vec![row("extra", FilterOperator::Equals, Some(json!("held")))]
			),
			&declared(),
			&undeclared,
		));
		assert!(admits(
			&filtering(FilterMatchMode::All, vec![row("extra", FilterOperator::Exists, None)]),
			&declared(),
			&undeclared,
		));
	}

	#[test]
	fn every_operator_reads_the_field_type_it_is_given() {
		assert!(admitted(vec![
			row("issue.title", FilterOperator::Contains, Some(json!("broken"))),
			row("issue.title", FilterOperator::StartsWith, Some(json!("a "))),
			row("issue.title", FilterOperator::EndsWith, Some(json!("pipe"))),
			row("issue.title", FilterOperator::NotContains, Some(json!("working"))),
			row("issue.votes", FilterOperator::Gt, Some(json!(3))),
			row("issue.votes", FilterOperator::Lt, Some(json!(10))),
			row("issue.draft", FilterOperator::NotEquals, Some(json!(true))),
			row("issue.closedAt", FilterOperator::Gt, Some(json!("2026-09-01T00:00:00Z"))),
			row("issue.closedAt", FilterOperator::Lt, Some(json!("2026-09-03T00:00:00Z"))),
		]));
	}

	#[test]
	fn match_all_admits_only_when_every_row_is_true() {
		assert!(admitted(vec![
			row("issue.votes", FilterOperator::Gt, Some(json!(3))),
			row("issue.draft", FilterOperator::Equals, Some(json!(false))),
		]));
		assert!(!admitted(vec![
			row("issue.votes", FilterOperator::Gt, Some(json!(3))),
			row("issue.draft", FilterOperator::Equals, Some(json!(true))),
		]));
	}

	#[test]
	fn match_any_admits_as_soon_as_one_row_is_true() {
		let rows = vec![
			row("issue.votes", FilterOperator::Gt, Some(json!(99))),
			row("issue.draft", FilterOperator::Equals, Some(json!(false))),
		];

		assert!(admits(&filtering(FilterMatchMode::Any, rows), &declared(), &payload()));
	}

	#[test]
	fn a_filter_holding_no_row_admits_in_either_mode() {
		for match_mode in FilterMatchMode::ALL {
			assert!(
				admits(&filtering(match_mode, Vec::new()), &declared(), &payload()),
				"{match_mode:?} refused an event on an empty filter"
			);
		}
	}

	#[test]
	fn a_row_pairing_an_operator_its_field_type_does_not_give_it_is_refused_by_its_index() {
		let filter = filtering(
			FilterMatchMode::All,
			vec![
				row("issue.title", FilterOperator::Equals, Some(json!("a broken pipe"))),
				row("issue.draft", FilterOperator::Contains, Some(json!("true"))),
			],
		);

		let refused = validate(&declared(), &filter).expect_err("the save is refused");

		assert_eq!(
			refused,
			RoutineError::UnsupportedOperator {
				row: 1,
				field: "issue.draft".to_owned(),
				operator: FilterOperator::Contains,
				field_type: FieldType::Boolean,
			}
		);
	}

	#[test]
	fn a_filter_whose_every_row_pairs_a_declared_operator_is_accepted() {
		let filter = filtering(
			FilterMatchMode::Any,
			vec![
				row("issue.closedAt", FilterOperator::Exists, None),
				row("issue.votes", FilterOperator::Lt, Some(json!(3))),
			],
		);

		assert_eq!(validate(&declared(), &filter), Ok(()));
	}
}
