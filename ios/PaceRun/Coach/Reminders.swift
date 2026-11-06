import Foundation
import UserNotifications

// Rappels locaux : une notification le matin de chaque séance (les 14 prochaines), reprogrammées à chaque recalcul du plan.
enum Reminders {
    private static let prefix = "pacerun."

    static func requestPermission() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
    }

    static func schedule(hour: Int?, days: [PlanDay]) {
        let center = UNUserNotificationCenter.current()
        let items: [(String, String, String, DateComponents)] = days.compactMap { d in
            guard let hour, let date = d.date, let dt = Day.date(date) else { return nil }
            var dc = Calendar.current.dateComponents([.year, .month, .day], from: dt)
            dc.hour = hour
            guard let fire = Calendar.current.date(from: dc), fire > Date() else { return nil }
            let detail = [d.km > 0 ? "\(fmt(d.km)) km" : nil, d.min > 0 ? durText(d.min) : nil].compactMap { $0 }.joined(separator: " · ")
            return (prefix + date, "Aujourd'hui : \(d.title)", detail.isEmpty ? "Ta séance t'attend." : detail, dc)
        }
        center.getPendingNotificationRequests { reqs in
            center.removePendingNotificationRequests(withIdentifiers: reqs.map(\.identifier).filter { $0.hasPrefix(prefix) })
            for (id, title, body, dc) in items {
                let c = UNMutableNotificationContent()
                c.title = title
                c.body = body
                c.sound = .default
                center.add(UNNotificationRequest(identifier: id, content: c, trigger: UNCalendarNotificationTrigger(dateMatching: dc, repeats: false)))
            }
        }
    }
}
