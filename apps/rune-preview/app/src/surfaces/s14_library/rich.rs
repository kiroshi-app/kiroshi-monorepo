use kiroshi_rune_kit::surfaces::s14_library::{TableEvent, cell_field};

use super::State;
use super::blocks::table_columns;

impl State {
	pub fn handle_table(&mut self, is_beside: bool, block: &str, event: TableEvent) {
		let Some(document) = self.document_mut(is_beside) else { return };
		let Some(at) = document.block_at(block) else { return };
		let columns = table_columns(&document.blocks[at].source);
		match event {
			TableEvent::Edited { row, column } => {
				document.typed(block, cell_field(columns, (row, column)));
				self.arm_flush();
			}
			TableEvent::Focus { row, column } => {
				document.focus_cell(block, cell_field(columns, (row, column)))
			}
		}
	}
}
