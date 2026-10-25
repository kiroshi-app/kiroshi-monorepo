import Foundation

struct WorkingNames: Equatable {
    let names: [String]

    init(_ ids: [Companion.ID], among companions: [Companion]) {
        names = ids.compactMap { id in companions.first { $0.id == id }?.name }
    }

    var joined: String? {
        switch names.count {
        case 0: nil
        case 1: names[0]
        case 2: String(localized: "\(names[0]) and \(names[1])")
        default: String(localized: "\(names[0]) and \(names.count - 1) others")
        }
    }

    var line: String? {
        guard let joined else { return nil }
        return names.count == 1
            ? String(localized: "\(joined) is working…")
            : String(localized: "\(joined) are working…")
    }
}
