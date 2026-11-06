import SwiftUI
import Charts

// Accueil : une seule question par bloc. Quoi aujourd'hui ? Où j'en suis cette semaine ? Où va le plan ? Et ensuite ?
struct DashboardView: View {
    @Environment(AppStore.self) private var store
    @Binding var tab: Int
    @State private var selected: PlanDay?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    header
                    if let msg = store.engineError {
                        Card { Text("Le plan n'a pas pu être calculé : \(msg)").foregroundStyle(Theme.coral) }
                    }
                    todayCard
                    if let wk = store.currentWeek { weekCard(wk) }
                    if let plan = store.plan, plan.weeks.count > 1 { volumeCard(plan) }
                    upcoming
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Theme.bg)
            .scrollContentBackground(.hidden)
            .sheet(item: $selected) { SessionDetailView(day: $0) }
        }
    }

    // MARK: en-tête

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(Day.label(store.today).capitalized(with: Locale(identifier: "fr_FR")))
                    .font(.subheadline).foregroundStyle(Theme.muted)
                Text("PACE'RUN").font(.display(34)).foregroundStyle(Theme.fg)
            }
            Spacer()
            if let n = store.daysToRace, n >= 0 {
                VStack(alignment: .trailing, spacing: 0) {
                    Text("J-\(n)").font(.display(30)).foregroundStyle(Theme.accent)
                    Text(store.plan?.sport == "course" || store.plan?.sport == "trail" ? "avant la course" : "avant l'objectif")
                        .font(.caption).foregroundStyle(Theme.muted)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.top, 8)
    }

    // MARK: aujourd'hui

    private var todayCard: some View {
        let day = store.todayDay
        let color = Theme.color(forType: day?.colorType)
        let st = store.status(day?.date)
        return Card(padding: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Chip(text: "Aujourd'hui", color: color)
                    if let wk = store.currentWeek { Chip(text: wk.phaseLabel, color: Theme.muted) }
                    Spacer()
                    if st == "done" { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.race).font(.title2) }
                }
                Text(day?.title ?? "Pas de séance").font(.display(32)).foregroundStyle(Theme.fg)
                if let day, day.hasSession {
                    HStack(spacing: 22) {
                        if day.km > 0 { metric("\(fmt(day.km))", "km") }
                        if day.min > 0 { metric(durText(day.min), "durée") }
                        if let b = keyBlock(day), let p = b.pace { metric(p, b.z == "z1" ? "allure facile" : "allure clé") }
                    }
                    HStack(spacing: 10) {
                        Button("Voir la séance") { selected = day }.buttonStyle(GhostButtonStyle())
                        if let date = day.date, st != "done" {
                            Button("C'est fait") { withAnimation { store.mark(date, "done") } }.buttonStyle(PrimaryButtonStyle())
                        }
                    }
                } else {
                    Text(day?.isBeforePlan == true ? "Ton plan n'a pas encore commencé : footing facile ou repos." : "Jour de repos : marche, mobilité, et dors bien.")
                        .foregroundStyle(Theme.fg2)
                }
            }
            .padding(18)
            .background(alignment: .leading) { color.frame(width: 4) }
        }
    }

    // MARK: semaine

    private func weekCard(_ wk: PlanWeek) -> some View {
        let p = store.weekProgress(wk)
        return Card {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    SectionTitle(text: "Semaine \(wk.w)\(wk.deload ? " · allégée" : "")")
                    Button { tab = 1 } label: { Text("Tout le plan").font(.subheadline) }
                }
                HStack(spacing: 18) {
                    ring(done: p.done, total: p.total)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(p.done) / \(p.total) séances").font(.headline).foregroundStyle(Theme.fg)
                        Text("\(fmt(p.kmDone)) sur \(fmt(wk.km)) km").foregroundStyle(Theme.fg2)
                        ProgressView(value: wk.km > 0 ? min(1, p.kmDone / wk.km) : 0).tint(Theme.accent)
                    }
                }
                HStack(spacing: 6) {
                    ForEach(wk.days) { d in dayPill(d) }
                }
            }
        }
    }

    private func dayPill(_ d: PlanDay) -> some View {
        let isToday = d.date == store.today
        let st = store.status(d.date)
        let c = Theme.color(forType: d.colorType)
        return Button { if d.hasSession { selected = d } } label: {
            VStack(spacing: 6) {
                Text(AppStore.shortDays[d.i]).font(.caption2.weight(.bold)).foregroundStyle(isToday ? Theme.ink : Theme.muted)
                ZStack {
                    Circle().fill(d.hasSession ? (isToday && st != "done" ? Theme.ink.opacity(0.35) : c.opacity(st == "done" ? 1 : 0.22)) : Theme.fill)
                        .frame(width: 26, height: 26)
                    if st == "done" { Image(systemName: "checkmark").font(.caption2.weight(.heavy)).foregroundStyle(Theme.ink) }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(isToday ? Theme.accent : .clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(Day.label(d.date, style: "EEEE")) : \(d.title)\(st == "done" ? ", fait" : "")")
    }

    private func ring(done: Int, total: Int) -> some View {
        let f = total > 0 ? Double(done) / Double(total) : 0
        return ZStack {
            Circle().stroke(Theme.fill, lineWidth: 9)
            Circle().trim(from: 0, to: f).stroke(Theme.accent, style: StrokeStyle(lineWidth: 9, lineCap: .round)).rotationEffect(.degrees(-90))
            Text("\(Int((f * 100).rounded())) %").font(.display(18, weight: .bold)).foregroundStyle(Theme.fg)
        }
        .frame(width: 72, height: 72)
        .animation(.spring, value: done)
    }

    // MARK: volume du plan

    private func volumeCard(_ plan: PlanResult) -> some View {
        let cur = store.currentWeek?.w
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: plan.sport == "force" ? "Séances par semaine" : "Volume du plan (km)")
                Chart(plan.weeks) { wk in
                    BarMark(x: .value("Semaine", wk.w), y: .value("Km", plan.sport == "force" ? Double(wk.sessions.count) : wk.km))
                        .foregroundStyle(wk.w == cur ? Theme.accent : wk.phase == "race" ? Theme.race : Theme.easy.opacity(0.45))
                        .cornerRadius(3)
                }
                .chartXAxis { AxisMarks(values: .stride(by: 4)) { AxisValueLabel().foregroundStyle(Theme.muted) } }
                .chartYAxis { AxisMarks(position: .leading) { AxisGridLine().foregroundStyle(Theme.line); AxisValueLabel().foregroundStyle(Theme.muted) } }
                .frame(height: 140)
            }
        }
    }

    // MARK: à venir

    @ViewBuilder private var upcoming: some View {
        let next = store.nextSessions
        if !next.isEmpty {
            VStack(spacing: 10) {
                SectionTitle(text: "À venir")
                ForEach(next) { d in
                    Button { selected = d } label: { SessionRow(day: d) }.buttonStyle(.plain)
                }
            }
        }
    }

    // le bloc le plus intense qui a une allure (pas l'échauffement d'une séance de fractionné)
    private func keyBlock(_ day: PlanDay) -> Block? {
        let rank = ["z1": 1, "z2": 2, "z3": 3]
        return day.run?.blocks.filter { $0.pace != nil }.max { (rank[$0.z ?? ""] ?? 0) < (rank[$1.z ?? ""] ?? 0) }
    }

    private func metric(_ v: String, _ k: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(v).font(.display(22, weight: .bold)).foregroundStyle(Theme.fg)
            Text(k).font(.caption).foregroundStyle(Theme.muted)
        }
    }
}

struct SessionRow: View {
    @Environment(AppStore.self) private var store
    let day: PlanDay

    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 3).fill(Theme.color(forType: day.colorType)).frame(width: 5, height: 40)
            VStack(alignment: .leading, spacing: 3) {
                Text(Day.label(day.date, style: "EEEE d MMM").capitalized(with: Locale(identifier: "fr_FR")))
                    .font(.caption).foregroundStyle(Theme.muted)
                Text(day.title).font(.headline).foregroundStyle(Theme.fg)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                if day.km > 0 { Text("\(fmt(day.km)) km").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.fg) }
                if day.min > 0 { Text(durText(day.min)).font(.caption).foregroundStyle(Theme.muted) }
            }
            if store.status(day.date) == "done" { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.race) }
        }
        .padding(14)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .contentShape(Rectangle())
    }
}

func fmt(_ v: Double) -> String {
    v.formatted(.number.precision(.fractionLength(0...1)).locale(Locale(identifier: "fr_FR")))
}

func durText(_ min: Int) -> String {
    min < 60 ? "\(min) min" : "\(min / 60) h \(String(format: "%02d", min % 60))"
}
