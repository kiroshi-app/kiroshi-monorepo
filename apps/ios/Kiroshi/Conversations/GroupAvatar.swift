import SwiftUI

struct GroupAvatar: View {
    let group: GroupConversation
    let size: CompanionAvatar.Size
    let working: Set<Companion.ID>

    init(group: GroupConversation, size: CompanionAvatar.Size, working: Set<Companion.ID> = []) {
        self.group = group
        self.size = size
        self.working = working
    }

    var body: some View {
        ScaledHive(members: group.members, working: working, size: size)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .accessibilityHidden(true)
    }
}

private struct ScaledHive: View {
    let members: [Companion]
    let working: Set<Companion.ID>
    @ScaledMetric private var side: CGFloat

    init(members: [Companion], working: Set<Companion.ID>, size: CompanionAvatar.Size) {
        self.members = members
        self.working = working
        _side = ScaledMetric(wrappedValue: size.points, relativeTo: size.textStyle)
    }

    var body: some View {
        ZStack {
            if let layout {
                ForEach(layout.cells, id: \.id) { cell in
                    CompanionAvatarArt(
                        companion: members.first { $0.id == cell.id },
                        isWorking: working.contains(cell.id)
                    )
                    .frame(width: cell.side, height: cell.side)
                    .position(cell.centre.point)
                }
                if let overflow = layout.overflow {
                    HiveCounter(overflow: overflow)
                        .position(overflow.centre.point)
                }
            }
        }
        .frame(width: side, height: side)
    }

    private var layout: HiveLayout? {
        let hive = members.map { HiveLayout.Member(id: $0.id, isWorking: working.contains($0.id)) }
        do {
            return try CompanionAvatarEngine.shared?.hiveLayout(of: hive, side: side)
        } catch {
            CompanionAvatarEngine.log.error(
                "The group hive isn't laid out: \(String(describing: error))")
            return nil
        }
    }
}

private struct HiveCounter: View {
    let overflow: HiveLayout.Overflow

    var body: some View {
        ZStack(alignment: Alignment(horizontal: .center, vertical: .firstTextBaseline)) {
            HiveOutline(path: overflow.outline)
                .fill(Color.kiroshi(.secondary))
                .overlay {
                    HiveOutline(path: overflow.outline)
                        .stroke(Color.kiroshi(.imageOutline), lineWidth: 2)
                        .clipShape(HiveOutline(path: overflow.outline))
                }
                .alignmentGuide(.firstTextBaseline) { _ in CGFloat(overflow.baseline) }
            Text("+\(overflow.hiddenCount)")
                .font(.system(size: overflow.fontSize, weight: .bold).monospacedDigit())
                .foregroundStyle(Color.kiroshi(.mutedForeground))
        }
        .frame(width: overflow.side, height: overflow.side)
    }
}

private struct HiveOutline: Shape {
    let path: Path

    func path(in rect: CGRect) -> Path {
        path.offsetBy(dx: rect.minX, dy: rect.minY)
    }
}
