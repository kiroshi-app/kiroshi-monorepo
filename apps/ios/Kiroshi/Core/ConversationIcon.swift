enum ConversationIcon: String, CaseIterable, Hashable, Sendable {
    case messageSquare = "MessageSquare"
    case bug = "Bug"
    case rocket = "Rocket"
    case shieldKey = "ShieldKey"
    case pen = "Pen"
    case fileText = "FileText"
    case download = "Download"
    case laptop = "Laptop"
    case smartphone = "Smartphone"
    case bookOpen = "BookOpen"
    case creditCard = "CreditCard"
    case megaphone = "Megaphone"
    case panelLeft = "PanelLeft"
    case code = "Code"
    case terminal = "Terminal"
    case server = "Server"
    case globe = "Globe"
    case palette = "Palette"
    case lightbulb = "Lightbulb"
    case chartLine = "ChartLine"
    case calendar = "Calendar"
    case users = "Users"
    case flag = "Flag"
    case sparkles = "Sparkles"

    init(named name: String?) {
        self = name.flatMap(ConversationIcon.init(rawValue:)) ?? .messageSquare
    }

    var symbolName: String {
        switch self {
        case .messageSquare: "message.fill"
        case .bug: "ladybug.fill"
        case .rocket: "paperplane.fill"
        case .shieldKey: "key.shield.fill"
        case .pen: "pencil"
        case .fileText: "doc.text.fill"
        case .download: "tray.and.arrow.down"
        case .laptop: "laptopcomputer"
        case .smartphone: "iphone"
        case .bookOpen: "book.fill"
        case .creditCard: "creditcard.fill"
        case .megaphone: "megaphone.fill"
        case .panelLeft: "rectangle.lefthalf.filled"
        case .code: "chevron.left.chevron.right"
        case .terminal: "apple.terminal.fill"
        case .server: "server.rack"
        case .globe: "globe"
        case .palette: "paintpalette.fill"
        case .lightbulb: "lightbulb"
        case .chartLine: "chart.line.uptrend.xyaxis"
        case .calendar: "calendar"
        case .users: "person.2.fill"
        case .flag: "flag.fill"
        case .sparkles: "sparkles"
        }
    }
}
