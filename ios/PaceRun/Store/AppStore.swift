import Foundation
import Observation

/// Valeur JSON libre : le profil garde la forme exacte du site (chaînes et nombres mêlés), lue par le moteur.
enum JSONValue: Codable, Equatable, Sendable {
    case string(String), number(Double), bool(Bool), array([JSONValue]), null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .null }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .array(let a): try c.encode(a)
        case .null: try c.encodeNil()
        }
    }

    var text: String {
        switch self {
        case .string(let s): s
        case .number(let n): n == n.rounded() ? String(Int(n)) : String(n)
        case .bool(let b): b ? "1" : "0"
        default: ""
        }
    }
}

// Même forme que le document du site (docs/CODEMAPS/data.md) : un export de l'un s'importe dans l'autre.
struct LogEntry: Codable, Equatable, Identifiable {
    var date: String          // lundi de la semaine, aaaa-mm-jj
    var poids: Double?
    var sommeil: Double?
    var fatigue: Int?
    var at: Double
    var id: String { date }
}

struct DoneMark: Codable, Equatable {
    var v: String             // "done" | "skip" | "none"
    var sig: String = ""
    var at: Double
}

struct Feel: Codable, Equatable {
    var rpe: Int?
    var mood: Int?
    var pain: Int?
    var at: Double
}

struct Doc: Codable, Equatable {
    var profile: [String: JSONValue] = [:]
    var isExample = true
    var log: [LogEntry] = []
    var done: [String: DoneMark] = [:]
    var feel: [String: Feel] = [:]
    var tutoSeen = false
}

enum Day {
    static let isoFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func iso(_ d: Date) -> String { isoFormatter.string(from: d) }
    static func date(_ s: String) -> Date? { isoFormatter.date(from: s) }
    static var today: String { iso(Date()) }

    static func monday(of s: String) -> String {
        guard let d = date(s) else { return s }
        let cal = Calendar(identifier: .gregorian)
        let wd = (cal.component(.weekday, from: d) + 5) % 7   // lundi = 0
        return iso(cal.date(byAdding: .day, value: -wd, to: d) ?? d)
    }

    static func days(from a: String, to b: String) -> Int? {
        guard let da = date(a), let db = date(b) else { return nil }
        return Calendar(identifier: .gregorian).dateComponents([.day], from: da, to: db).day
    }

    static func label(_ s: String?, style: String = "EEEE d MMMM") -> String {
        guard let s, let d = date(s) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = style
        return f.string(from: d)
    }
}

@Observable
final class AppStore {
    private(set) var doc: Doc
    private(set) var plan: PlanResult?
    private(set) var engineError: String?
    private let engine: PlanEngine?
    private let fileURL: URL?

    static let shortDays = ["L", "M", "M", "J", "V", "S", "D"]

    init(fileURL: URL? = AppStore.defaultURL, bundle: Bundle = .main) {
        self.fileURL = fileURL
        do { engine = try PlanEngine(bundle: bundle); engineError = nil }
        catch { engine = nil; engineError = "\(error)" }
        if let fileURL, let data = try? Data(contentsOf: fileURL), let d = try? JSONDecoder().decode(Doc.self, from: data) {
            doc = d
        } else {
            doc = Doc()
            doc.profile = engine?.exampleProfile() ?? [:]
        }
        recompute()
    }

    static var defaultURL: URL? {
        try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("pacerun-doc.json")
    }

    // MARK: profil

    var onboarded: Bool { !doc.isExample }

    func value(_ key: String) -> String { doc.profile[key]?.text ?? "" }

    func set(_ key: String, _ value: String) {
        doc.profile[key] = .string(value)
    }

    func finishOnboarding() {
        doc.isExample = false
        if value("start").isEmpty { set("start", Day.today) }
        save()
    }

    // MARK: plan

    func recompute() {
        guard let engine else { return }
        do {
            let data = try JSONEncoder().encode(doc)
            plan = try engine.plan(docJSON: String(decoding: data, as: UTF8.self))
            engineError = nil
        } catch {
            engineError = "\(error)"
        }
    }

    var today: String { Day.today }

    var currentWeek: PlanWeek? {
        guard let plan else { return nil }
        let t = today
        return plan.weeks.first { wk in
            guard let a = wk.days.first?.date, let b = wk.days.last?.date else { return false }
            return a <= t && t <= b
        } ?? (plan.start.map { t < $0 } == true ? plan.weeks.first : nil)
    }

    var todayDay: PlanDay? { currentWeek?.days.first { $0.date == today } }

    var nextSessions: [PlanDay] {
        guard let plan else { return [] }
        let t = today
        return Array(plan.weeks.flatMap(\.days).filter { ($0.date ?? "") > t && $0.hasSession }.prefix(3))
    }

    var daysToRace: Int? {
        guard let r = plan?.raceDate else { return nil }
        return Day.days(from: today, to: r)
    }

    // MARK: séances faites, ressenti, suivi

    func status(_ date: String?) -> String? {
        guard let date, let m = doc.done[date], m.v != "none" else { return nil }
        return m.v
    }

    func mark(_ date: String, _ v: String) {
        doc.done[date] = DoneMark(v: v, at: Date().timeIntervalSince1970 * 1000)
        save()
    }

    func setFeel(_ date: String, rpe: Int?, mood: Int?, pain: Int?) {
        doc.feel[date] = Feel(rpe: rpe, mood: mood, pain: pain, at: Date().timeIntervalSince1970 * 1000)
        save()
    }

    func weekProgress(_ wk: PlanWeek) -> (done: Int, total: Int, kmDone: Double) {
        let s = wk.sessions
        let d = s.filter { status($0.date) == "done" }
        return (d.count, s.count, d.reduce(0) { $0 + $1.km })
    }

    func saveLog(poids: Double?, sommeil: Double?, fatigue: Int?) {
        let wk = Day.monday(of: today)
        let e = LogEntry(date: wk, poids: poids, sommeil: sommeil, fatigue: fatigue, at: Date().timeIntervalSince1970 * 1000)
        doc.log.removeAll { $0.date == wk }
        doc.log.append(e)
        doc.log.sort { $0.date < $1.date }
        save()
    }

    func deleteLog(_ date: String) {
        doc.log.removeAll { $0.date == date }
        save()
    }

    func markTutoSeen() {
        doc.tutoSeen = true
        save()
    }

    func resetAll() {
        doc = Doc()
        doc.profile = engine?.exampleProfile() ?? [:]
        save()
    }

    func save() {
        recompute()
        guard let fileURL, let data = try? JSONEncoder().encode(doc) else { return }
        try? data.write(to: fileURL, options: [.atomic, .completeFileProtection])
    }
}
