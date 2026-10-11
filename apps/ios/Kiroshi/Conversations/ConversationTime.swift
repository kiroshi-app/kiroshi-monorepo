import Foundation

struct ConversationTime {
    var now: Date = .now
    var calendar: Calendar = .current
    var locale: Locale = .current

    func listLabel(for date: Date) -> String {
        calendar.isDate(date, inSameDayAs: now) ? timeLabel(for: date) : dayLabel(for: date)
    }

    func dayLabel(for date: Date) -> String {
        if calendar.isDate(date, inSameDayAs: now) {
            return String(localized: "Today")
        }
        if calendar.isDateInYesterday(date, relativeTo: now) {
            return String(localized: "Yesterday")
        }
        if isThisWeek(date) {
            return date.formatted(style.weekday(.wide))
        }
        return date.formatted(style.day(.twoDigits).month(.twoDigits))
    }

    func timeLabel(for date: Date) -> String {
        date.formatted(
            Date.FormatStyle(
                date: .omitted, time: .shortened, locale: locale, calendar: calendar,
                timeZone: calendar.timeZone))
    }

    static func elapsed(since start: Date, at now: Date) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(start)))
        let minutes = seconds / 60
        let rest = seconds % 60
        return minutes > 0 ? "\(minutes)m \(rest < 10 ? "0" : "")\(rest)s" : "\(rest)s"
    }

    private var style: Date.FormatStyle {
        Date.FormatStyle(locale: locale, calendar: calendar, timeZone: calendar.timeZone)
    }

    private func isThisWeek(_ date: Date) -> Bool {
        guard
            let weekAgo = calendar.date(
                byAdding: .day, value: -6, to: calendar.startOfDay(for: now))
        else { return false }
        return date >= weekAgo && date < now
    }
}

extension Calendar {
    fileprivate func isDateInYesterday(_ date: Date, relativeTo now: Date) -> Bool {
        guard let yesterday = self.date(byAdding: .day, value: -1, to: now) else { return false }
        return isDate(date, inSameDayAs: yesterday)
    }
}
