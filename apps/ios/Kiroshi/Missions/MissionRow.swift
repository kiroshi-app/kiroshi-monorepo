import SwiftUI

struct MissionRow: View {
    let mission: Mission
    let companion: MissionCompanion?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(spacing: 12) {
            CompanionAvatar(companion, size: .row, isWorking: mission.isWorking)
            VStack(alignment: .leading, spacing: 2) {
                headerLayout {
                    Text(mission.objective)
                        .font(.headline)
                        .lineLimit(lineLimit)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    TicketChip(id: mission.ticket.externalId)
                }
                Text(mission.detailLine(companion: companion))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(lineLimit)
            }
        }
        .padding(.vertical, 12)
        .foregroundStyle(.primary)
        .accessibilityElement(children: .combine)
    }

    private var lineLimit: Int {
        dynamicTypeSize.isAccessibilitySize ? 3 : 1
    }

    private var headerLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(spacing: 6))
    }
}

struct TicketChip: View {
    let id: String

    var body: some View {
        Text(id)
            .font(.caption.monospaced())
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(Color(.systemGray5), in: .rect(cornerRadius: 6))
    }
}

struct MissionSectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Color(.secondaryLabel))
            .textCase(.uppercase)
            .accessibilityAddTraits(.isHeader)
    }
}
