import SwiftUI

struct PlanView: View {
    @Environment(AppStore.self) private var store
    @State private var week = 1
    @State private var selected: PlanDay?

    var body: some View {
        NavigationStack {
            Group {
                if let plan = store.plan, !plan.weeks.isEmpty {
                    VStack(spacing: 0) {
                        weekPicker(plan)
                        TabView(selection: $week) {
                            ForEach(plan.weeks) { wk in
                                ScrollView { weekBody(wk).padding(16) }.tag(wk.w)
                            }
                        }
                        .tabViewStyle(.page(indexDisplayMode: .never))
                    }
                } else {
                    ContentUnavailableView("Pas encore de plan", systemImage: "calendar.badge.exclamationmark",
                                           description: Text("Complète ton profil pour générer ton plan."))
                }
            }
            .background(Theme.bg)
            .navigationTitle("Plan")
            .toolbarBackground(Theme.bg, for: .navigationBar)
            .onAppear { week = store.currentWeek?.w ?? 1 }
            .sheet(item: $selected) { SessionDetailView(day: $0) }
        }
    }

    private func weekPicker(_ plan: PlanResult) -> some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(plan.weeks) { wk in
                        let on = wk.w == week, cur = wk.w == store.currentWeek?.w
                        Button { withAnimation { week = wk.w } } label: {
                            VStack(spacing: 2) {
                                Text("S\(wk.w)").font(.display(17, weight: .bold))
                                Text(plan.sport == "force" ? "\(wk.sessions.count) s." : "\(fmt(wk.km)) km").font(.caption2)
                            }
                            .foregroundStyle(on ? Theme.ink : cur ? Theme.accent : Theme.fg2)
                            .frame(width: 58, height: 48)
                            .background(on ? Theme.accent : Theme.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .id(wk.w)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 8)
            }
            .onChange(of: week) { _, w in withAnimation { proxy.scrollTo(w, anchor: .center) } }
            .onAppear { proxy.scrollTo(week, anchor: .center) }
        }
    }

    private func weekBody(_ wk: PlanWeek) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Chip(text: wk.phaseLabel, color: wk.phase == "race" ? Theme.race : Theme.accent)
                if wk.deload { Chip(text: "Semaine allégée", color: Theme.easy) }
                Spacer()
                if store.plan?.sport != "force" { Text("\(fmt(wk.km)) km").font(.display(22)).foregroundStyle(Theme.fg) }
            }
            if let a = wk.days.first?.date, let b = wk.days.last?.date {
                Text("\(Day.label(a, style: "d MMM")) – \(Day.label(b, style: "d MMM"))").foregroundStyle(Theme.muted)
            }
            ForEach(wk.days) { d in
                if d.hasSession {
                    Button { selected = d } label: { SessionRow(day: d) }.buttonStyle(.plain)
                } else {
                    HStack {
                        Text(Day.label(d.date, style: "EEEE").capitalized(with: Locale(identifier: "fr_FR"))).foregroundStyle(Theme.muted)
                        Spacer()
                        Text(d.title).foregroundStyle(Theme.muted)
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                }
            }
        }
    }
}

// Détail d'une séance : étapes, allures, notes, puis « fait / pas fait » et le ressenti (RPE).
struct SessionDetailView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let day: PlanDay
    @State private var rpe = 5.0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(Day.label(day.date).capitalized(with: Locale(identifier: "fr_FR"))).foregroundStyle(Theme.muted)
                        Text(day.title).font(.display(34)).foregroundStyle(Theme.fg)
                        HStack(spacing: 8) {
                            if day.km > 0 { Chip(text: "\(fmt(day.km)) km", color: Theme.color(forType: day.colorType)) }
                            if day.min > 0 { Chip(text: durText(day.min), color: Theme.muted) }
                            if let d = day.run?.dplus { Chip(text: "D+ \(Int(d)) m", color: Theme.long) }
                        }
                    }
                    if let a = day.adapted { Card { Label(a, systemImage: "arrow.triangle.2.circlepath").foregroundStyle(Theme.long) } }
                    if let date = day.date, let w = store.doc.watch[date] {
                        Card {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("Faite avec ta montre", systemImage: "applewatch").font(.headline).foregroundStyle(Theme.race)
                                HStack(spacing: 18) {
                                    if w.km > 0 { Text("\(fmt(w.km)) km") }
                                    Text(durText(Int(w.min.rounded())))
                                    if let hr = w.avgHR { Text("FC moy. \(Int(hr.rounded()))") }
                                }
                                .foregroundStyle(Theme.fg)
                            }
                        }
                    }
                    if let run = day.run {
                        Card {
                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(Array(run.blocks.enumerated()), id: \.offset) { i, b in
                                    blockRow(b, last: i == run.blocks.count - 1)
                                }
                            }
                        }
                        if let note = run.note { Card { Label(note, systemImage: "lightbulb").foregroundStyle(Theme.fg2) } }
                    }
                    if let r = day.renfo { renfoCard(r) }
                    if let date = day.date { doneBox(date) }
                }
                .padding(16)
            }
            .background(Theme.bg)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Fermer") { dismiss() } } }
            .onAppear { if let date = day.date, let r = store.doc.feel[date]?.rpe { rpe = Double(r) } }
        }
        .presentationDetents([.large])
        .presentationBackground(Theme.bg)
    }

    private func blockRow(_ b: Block, last: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
                Circle().fill(Theme.zoneColor(b.z)).frame(width: 12, height: 12)
                if !last { Rectangle().fill(Theme.line).frame(width: 2).frame(maxHeight: .infinity) }
            }
            .padding(.top, 4)
            VStack(alignment: .leading, spacing: 4) {
                Text(b.l).font(.body.weight(.semibold)).foregroundStyle(Theme.fg)
                HStack(spacing: 8) {
                    if b.min > 0 { Text("\(b.min) min").foregroundStyle(Theme.fg2) }
                    if let p = b.pace { Text(p).foregroundStyle(Theme.accent) }
                    if let z = Theme.zoneLabel(b.z) { Text(z).foregroundStyle(Theme.zoneColor(b.z)) }
                }
                .font(.subheadline)
                if let e = b.eff { Text(e).font(.caption).foregroundStyle(Theme.muted) }
            }
            .padding(.bottom, last ? 0 : 16)
        }
    }

    private func renfoCard(_ r: Renfo) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack { Text(r.t).font(.headline).foregroundStyle(Theme.renfo); Spacer(); Text(r.m).font(.caption).foregroundStyle(Theme.muted) }
                ForEach(Array(r.rows.enumerated()), id: \.offset) { _, row in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.first ?? "").foregroundStyle(Theme.fg)
                        if row.count > 1 { Text(row[1]).font(.caption).foregroundStyle(Theme.muted) }
                    }
                }
            }
        }
    }

    private func doneBox(_ date: String) -> some View {
        let st = store.status(date)
        return Card {
            VStack(alignment: .leading, spacing: 14) {
                SectionTitle(text: "Après la séance")
                HStack(spacing: 10) {
                    Button { store.mark(date, st == "done" ? "none" : "done") } label: {
                        Label(st == "done" ? "Faite" : "C'est fait", systemImage: st == "done" ? "checkmark.circle.fill" : "checkmark.circle")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    Button { store.mark(date, st == "skip" ? "none" : "skip") } label: { Text(st == "skip" ? "Pas faite ✓" : "Pas faite") }
                        .buttonStyle(GhostButtonStyle())
                }
                if st == "done" {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Effort ressenti : \(Int(rpe)) / 10").foregroundStyle(Theme.fg)
                        Slider(value: $rpe, in: 1...10, step: 1) { editing in
                            if !editing { store.setFeel(date, rpe: Int(rpe), mood: store.doc.feel[date]?.mood, pain: store.doc.feel[date]?.pain) }
                        }
                        Text(rpe <= 3 ? "Très facile" : rpe <= 5 ? "Facile, tu peux parler" : rpe <= 7 ? "Soutenu" : "Très dur")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            }
        }
        .sensoryFeedback(.success, trigger: st)
    }
}
