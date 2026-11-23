// MedicinePro - health.js
// Statistiche di aderenza, report di stampa, diario salute

Object.assign(app, {
    // --- NUOVE FUNZIONI STATISTICHE (Aggiungi queste all'oggetto app) ---

    // Statistiche di un profilo: aderenza (30 giorni), giorni consecutivi, grafico settimanale
    calculateStats(profile) {
        if (!profile || !profile.meds.length) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { totalScheduled, totalTaken, adherencePct } = this.calculateAdherence(profile, today);
        const currentStreak = this.calculateStreak(profile, today);
        const weeklyData = this.calculateWeeklyData(profile, today);

        return { adherencePct, currentStreak, weeklyData, totalScheduled, totalTaken };
    },

    // Dosi previste e prese negli ultimi 30 giorni (in base allo storico)
    calculateAdherence(profile, today) {
        let totalScheduled = 0;
        let totalTaken = 0;

        // 1. Calcolo Aderenza Globale (ultimi 30 giorni o dall'inizio)
        profile.meds.forEach(med => {
            if (!med.history) med.history = {};

            // Se il farmaco ha una data inizio, usala, altrimenti usa oggi
            // (Per semplificare, calcoliamo sugli ultimi 30gg per evitare calcoli infiniti)
            for (let i = 0; i < 30; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const iso = app.getLocalDateString(d);

                // Salta il futuro o oggi (se vogliamo statistiche consolidate, ma includiamo oggi per reattività)

                // Controlla se il farmaco era previsto per quel giorno
                const isScheduled = this.isScheduledOn(med, iso); // Usa la tua funzione esistente

                if (isScheduled) {
                    totalScheduled++;
                    if (med.history[iso]) {
                        totalTaken++;
                    }
                }
            }
        });

        const adherencePct = totalScheduled === 0 ? 0 : Math.round((totalTaken / totalScheduled) * 100);
        return { totalScheduled, totalTaken, adherencePct };
    },

    // Giorni consecutivi con tutte le dosi prese (da ieri all'indietro, + oggi se completo)
    calculateStreak(profile, today) {
        let currentStreak = 0;

        // 2. Calcolo Streak (Giorni consecutivi perfetti)
        // Conta quanti giorni consecutivi INDIETRO da IERI sono stati perfetti (tutto preso)
        let dayOffset = 1; // Inizia da ieri
        while (true) {
            const d = new Date(today);
            d.setDate(d.getDate() - dayOffset);
            const iso = app.getLocalDateString(d);

            let dayScheduled = 0;
            let dayTaken = 0;

            profile.meds.forEach(med => {
                if (this.isScheduledOn(med, iso)) {
                    dayScheduled++;
                    if (med.history && med.history[iso]) dayTaken++;
                }
            });

            // Se non c'era nulla di programmato, continua indietro (non rompe la streak)
            if (dayScheduled === 0) {
                dayOffset++;
                if (dayOffset > 365) break; // Safety break
                continue;
            }

            if (dayScheduled > 0 && dayTaken === dayScheduled) {
                currentStreak++;
                dayOffset++;
            } else {
                break; // Streak interrotta
            }
        }

        // Se OGGI ho preso tutto, aggiungi 1 alla streak (gratificazione immediata)
        const todayISO = app.getLocalDateString(today);
        let todaySched = 0;
        let todayT = 0;
        profile.meds.forEach(med => {
            if (this.isScheduledOn(med, todayISO)) {
                todaySched++;
                if (med.taken) todayT++;
            }
        });
        if (todaySched > 0 && todaySched === todayT) currentStreak++;
        return currentStreak;
    },

    // Percentuale di dosi prese negli ultimi 7 giorni (-1 = giorno senza dosi previste)
    calculateWeeklyData(profile, today) {
        // 3. Dati Grafico Settimanale (Ultimi 7 giorni)
        const weeklyData = [];
        const daysMap = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];

        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const iso = app.getLocalDateString(d);
            const dayLabel = daysMap[d.getDay()];

            let dSched = 0;
            let dTaken = 0;

            profile.meds.forEach(med => {
                if (this.isScheduledOn(med, iso)) {
                    dSched++;
                    if (med.history && med.history[iso]) dTaken++; // Usa history anche per oggi per coerenza
                    // Fix per oggi: usa med.taken se è oggi e history non è ancora salvato (anche se toggle salva subito)
                    if (i === 0 && med.taken) dTaken = Math.max(dTaken, 1); // fallback
                }
            });

            let pct = dSched === 0 ? -1 : Math.round((dTaken / dSched) * 100); // -1 indica "riposo"
            weeklyData.push({ day: dayLabel, pct: pct, date: iso });
        }
        return weeklyData;
    },
    openStatsModal() {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        if (!profile) return;

        const stats = this.calculateStats(profile);
        if (!stats) return;

        // Popola UI
        document.getElementById('stat-adherence-val').textContent = stats.adherencePct + '%';
        document.getElementById('stat-streak-val').textContent = stats.currentStreak + ' gg';

        // Colore cerchio aderenza
        const ring = document.getElementById('stat-progress-ring');
        const circumference = 2 * Math.PI * 45; // raggio 45
        const offset = circumference - (stats.adherencePct / 100) * circumference;
        ring.style.strokeDasharray = `${circumference} ${circumference}`;
        ring.style.strokeDashoffset = offset;

        // Colore testo
        const textCol = stats.adherencePct >= 80 ? 'text-emerald-500' : (stats.adherencePct >= 50 ? 'text-orange-500' : 'text-red-500');
        document.getElementById('stat-adherence-val').className = `text-3xl font-bold ${textCol}`;
        ring.style.stroke = stats.adherencePct >= 80 ? '#10b981' : (stats.adherencePct >= 50 ? '#f97316' : '#ef4444');

        // Popola Grafico
        const chartContainer = document.getElementById('stat-weekly-chart');
        chartContainer.innerHTML = '';

        stats.weeklyData.forEach(d => {
            let barColor = 'bg-slate-200';
            let height = 'h-1';

            if (d.pct === -1) {
                height = 'h-full';
                barColor = 'bg-slate-100 pattern-diagonal'; // Giorno di riposo
            } else {
                height = `h-[${d.pct}%]`; // Tailwind arbitrario potrebbe non andare, usiamo style inline
                if (d.pct === 100) barColor = 'bg-emerald-500';
                else if (d.pct >= 50) barColor = 'bg-orange-400';
                else barColor = 'bg-red-400';
            }

            const barDiv = document.createElement('div');
            barDiv.className = "flex flex-col items-center gap-1 flex-1";
            // Style height dinamico
            const barH = d.pct === -1 ? '100%' : (d.pct || 5) + '%'; // Minimo 5% per visibilità

            barDiv.innerHTML = `

                                                                    <div class="w-full bg-slate-100 rounded-lg h-24 flex items-end overflow-hidden relative">

                                                                         ${d.pct === -1 ? '<div class="absolute inset-0 bg-slate-100 opacity-50 flex items-center justify-center"><i class="fa-solid fa-minus text-slate-300"></i></div>' : ''}

                                                                         <div style="height: ${barH}" class="w-full ${barColor} rounded-t-sm transition-all duration-500"></div>

                                                                    </div>

                                                                    <span class="text-[10px] font-bold text-slate-500">${d.day}</span>

                                                                `;
            chartContainer.appendChild(barDiv);
        });

        // Insight Testuale
        const insight = document.getElementById('stat-insight');
        const missed = stats.totalScheduled - stats.totalTaken;
        if (stats.adherencePct === 100) {
            insight.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fa-solid fa-trophy"></i> Perfetto!</span> Stai seguendo la terapia alla lettera.`;
        } else if (missed > 0) {
            insight.innerHTML = `<span class="text-orange-600 font-bold"><i class="fa-solid fa-triangle-exclamation"></i> Attenzione.</span> Hai saltato ${missed} assunzioni negli ultimi 30 giorni.`;
        } else {
            insight.textContent = "Dati insufficienti per un'analisi dettagliata.";
        }

        this.showModal('modal-stats');
    },
    printReport() {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        if (!profile) return;

        // Calcola Statistiche aggiornate
        const stats = this.calculateStats(profile); // Usa la funzione creata nello step precedente

        this.fillPrintHeader(profile, stats);

        // 2. Compila Tabella Farmaci
        const tbody = document.getElementById('print-meds-list');
        tbody.innerHTML = '';

        // Ordina: prima i farmaci attivi, poi al bisogno
        const slotOrder = ['Mattina', 'Pomeriggio', 'Sera', 'Al Bisogno'];
        const sortedMeds = [...profile.meds].sort((a, b) => slotOrder.indexOf(a.time) - slotOrder.indexOf(b.time));

        sortedMeds.forEach(med => tbody.appendChild(this.buildPrintMedRow(med)));

        // 3. Lancia Stampa
        window.print();
    },

    // Intestazione del report: paziente, codice fiscale, età, medico, aderenza globale, avatar
    fillPrintHeader(profile, stats) {
        // 1. Compila Intestazione
        document.getElementById('print-date').textContent = new Date().toLocaleDateString('it-IT');
        document.getElementById('print-patient-name').textContent = profile.name;
        document.getElementById('print-cf').textContent = profile.cf || "Non specificato";
        document.getElementById('print-age').textContent = profile.dob ? this.calculateAge(profile.dob) + " anni" : "-";

        // Medico
        let docText = "Non assegnato";
        if (profile.doctor && profile.doctor.name) {
            docText = profile.doctor.name;
            if (profile.doctor.phoneMobile) docText += ` (${profile.doctor.phoneMobile})`;
        }
        document.getElementById('print-doctor').textContent = docText;

        // Aderenza Globale
        const adhEl = document.getElementById('print-adherence');
        adhEl.textContent = (stats ? stats.adherencePct : 0) + '%';

        // Icona Avatar
        const iconMap = { 'man': 'fa-user', 'woman': 'fa-user-nurse', 'dog': 'fa-dog', 'cat': 'fa-cat' };
        const avatarClass = iconMap[profile.avatar] || 'fa-user';
        document.getElementById('print-avatar-icon').className = `fa-solid ${avatarClass}`;
    },

    // Calcolo aderenza specifica per farmaco (semplificata)
    calculateMedAdherence(med) {
        let medAdherence = 0;
        let takenCount = 0;
        let schedCount = 0;
        const today = new Date();
        // Calcola ultimi 30gg per questo farmaco
        for (let i = 0; i < 30; i++) {
            const d = new Date(); d.setDate(today.getDate() - i);
            const iso = app.getLocalDateString(d);
            if (this.isScheduledOn(med, iso)) {
                schedCount++;
                if (med.history && med.history[iso]) takenCount++;
            }
        }
        if (schedCount > 0) medAdherence = Math.round((takenCount / schedCount) * 100);
        return { medAdherence, takenCount, schedCount };
    },

    // Dosi cambiate dal calendario per oggi e i giorni successivi (max 6, poi "+N altre")
    buildPrintDayDoses(med) {
        if (med.time === 'Al Bisogno' || !med.daySpecificDoses) return '';
        const today = this.getLocalDateString();
        const changes = Object.keys(med.daySpecificDoses)
            .filter(iso => iso >= today && med.daySpecificDoses[iso])
            .sort();
        if (changes.length === 0) return '';
        const shown = changes.slice(0, 6).map(iso => {
            const label = iso === today ? 'oggi' : this.parseLocalDate(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
            return `<div><span class="font-semibold">${label}:</span> ${app.escapeHTML(med.daySpecificDoses[iso])}</div>`;
        }).join('');
        const more = changes.length > 6 ? `<div>+${changes.length - 6} altre</div>` : '';
        return `<div class="text-[10px] text-amber-700 mt-1 leading-tight"><div class="font-bold uppercase">Dosi variate</div>${shown}${more}</div>`;
    },

    // Riga della tabella farmaci del report (nome, dose, orario, frequenza, aderenza)
    buildPrintMedRow(med) {
        const { medAdherence, takenCount, schedCount } = this.calculateMedAdherence(med);

        // Colore barra
        let barColor = 'bg-red-500';
        if (medAdherence >= 80) barColor = 'bg-emerald-500';
        else if (medAdherence >= 50) barColor = 'bg-orange-400';

        // Formattazione riga
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100";
        tr.innerHTML = `

                                                                <td class="py-3 pr-2 align-top">

                                                                    <div class="font-bold text-slate-800">${app.escapeHTML(med.name)}${this.isSuspended(med) ? ' <span class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">SOSPESO</span>' : ''}</div>

                                                                    <div class="text-xs text-slate-500">${app.escapeHTML(med.category || '')}</div>

                                                                </td>

                                                                <td class="py-3 pr-2 align-top">

                                                                    <div class="font-semibold text-slate-700">${app.escapeHTML(med.dose || '-')}</div>

                                                                    ${this.buildPrintDayDoses(med)}

                                                                    <div class="text-xs text-slate-500 italic">${app.escapeHTML(med.type || '')}</div>

                                                                </td>

                                                                <td class="py-3 pr-2 align-top">

                                                                    <div class="text-xs font-bold bg-slate-100 inline-block px-2 py-1 rounded text-slate-600">

                                                                        ${app.escapeHTML(med.time === 'Al Bisogno' ? 'Al Bisogno' : [med.time, med.specificTime].filter(Boolean).join(' • '))}

                                                                    </div>

                                                                    <div class="text-[10px] text-slate-400 mt-1">

                                                                        ${(Array.isArray(med.days) && med.days.length) ? app.escapeHTML(med.days.join(', ')) : (med.frequency === 'alternate' ? 'A giorni alterni' : 'Tutti i giorni')}

                                                                    </div>

                                                                </td>

                                                                <td class="py-3 align-middle text-right w-32">

                                                                    ${med.time === 'Al Bisogno'
                ? `<span class="text-xs text-slate-400">N.A. (Al bisogno)</span>`
                : `

                                                                        <div class="flex items-center justify-end gap-2">

                                                                            <span class="text-xs font-bold text-slate-600">${medAdherence}%</span>

                                                                            <div class="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">

                                                                                <div class="${barColor} h-full" style="width: ${medAdherence}%"></div>

                                                                            </div>

                                                                        </div>

                                                                        <div class="text-[10px] text-slate-400 mt-0.5">${takenCount}/${schedCount} assunzioni</div>

                                                                        `
            }

                                                                </td>

                                                            `;
        return tr;
    },
    // --- DIARIO SALUTE LOGIC ---

    openHealthDiary() {
        this.renderHealthLog();
        this.showModal('modal-health-diary');
    },
    renderHealthLog() {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        if (!profile) return;

        const container = document.getElementById('health-diary-list');
        container.innerHTML = '';

        if (!profile.healthLogs || profile.healthLogs.length === 0) {
            container.innerHTML = `

                                        <div class="flex flex-col items-center justify-center py-10 opacity-50">

                                            <div class="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-3 text-slate-400 text-2xl">

                                                <i class="fa-solid fa-notes-medical"></i>

                                            </div>

                                            <p class="text-sm font-bold text-slate-500">Nessuna misurazione</p>

                                            <p class="text-xs text-slate-400">Inizia a registrare i tuoi parametri.</p>

                                        </div>

                                    `;
            return;
        }

        // Ordina dal più recente
        const sortedLogs = [...profile.healthLogs].sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedLogs.forEach((log, index) => {
            const dateObj = new Date(log.date);
            const dateStr = dateObj.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
            const timeStr = dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

            let icon = '', colorClass = '', valDisplay = '';

            switch (log.type) {
                case 'pressure':
                    icon = 'fa-heart-pulse'; colorClass = 'text-rose-500 bg-rose-50 border-rose-100';
                    valDisplay = `<span class="text-lg font-black text-rose-600">${app.escapeHTML(log.values.sys)}/${app.escapeHTML(log.values.dia)}</span> <span class="text-xs text-slate-400">mmHg</span>`;
                    if (log.values.pulse) valDisplay += `<div class="text-xs text-slate-400 mt-1"><i class="fa-solid fa-heart-crack mr-1"></i>${app.escapeHTML(log.values.pulse)} bpm</div>`;
                    break;
                case 'weight':
                    icon = 'fa-weight-scale'; colorClass = 'text-blue-500 bg-blue-50 border-blue-100';
                    valDisplay = `<span class="text-lg font-black text-blue-600">${app.escapeHTML(log.values.weight)}</span> <span class="text-xs text-slate-400">Kg</span>`;
                    break;
                case 'glucose':
                    icon = 'fa-droplet'; colorClass = 'text-purple-500 bg-purple-50 border-purple-100';
                    valDisplay = `<span class="text-lg font-black text-purple-600">${app.escapeHTML(log.values.glucose)}</span> <span class="text-xs text-slate-400">mg/dL</span>`;
                    if (log.values.tag) valDisplay += `<span class="ml-2 text-[9px] uppercase px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">${app.escapeHTML(log.values.tag)}</span>`;
                    break;
                case 'temp':
                    icon = 'fa-temperature-half'; colorClass = 'text-orange-500 bg-orange-50 border-orange-100';
                    valDisplay = `<span class="text-lg font-black text-orange-600">${app.escapeHTML(log.values.temp)}°</span> <span class="text-xs text-slate-400">C</span>`;
                    break;
                case 'spo2':
                    icon = 'fa-lungs'; colorClass = 'text-cyan-500 bg-cyan-50 border-cyan-100';
                    valDisplay = `<span class="text-lg font-black text-cyan-600">${app.escapeHTML(log.values.spo2)}%</span>`;
                    break;
            }

            const div = document.createElement('div');
            div.className = "bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between relative overflow-hidden";
            // Click per eliminare (con conferma)
            div.onclick = () => this.deleteHealthEntry(log.id);

            div.innerHTML = `

                                        <div class="flex items-center gap-3">

                                            <div class="w-10 h-10 rounded-full flex items-center justify-center text-lg border ${colorClass}">

                                                <i class="fa-solid ${icon}"></i>

                                            </div>

                                            <div>

                                                <div class="leading-none mb-1">${valDisplay}</div>

                                                <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${dateStr} • ${timeStr}</div>

                                            </div>

                                        </div>

                                        <i class="fa-solid fa-trash-can text-slate-200 hover:text-red-400 transition-colors ml-2 p-2"></i>

                                    `;
            container.appendChild(div);
        });
    },
    openAddHealthEntry() {
        this.setHealthType('pressure'); // Default
        // Reset campi
        document.querySelectorAll('#modal-add-health input').forEach(i => i.value = '');
        document.getElementById('health-glucose-tag').value = '';
        document.querySelectorAll('.glucose-tag').forEach(b => b.classList.remove('selected'));

        this.showModal('modal-add-health');
    },
    setHealthType(type) {
        this.currentHealthType = type;

        // Aggiorna UI bottoni
        document.querySelectorAll('.health-type-btn').forEach(btn => {
            if (btn.dataset.type === type) btn.classList.add('selected');
            else btn.classList.remove('selected');
        });

        // Mostra input corretti
        document.querySelectorAll('.health-input-group').forEach(grp => grp.classList.add('hidden'));
        document.getElementById(`input-group-${type}`).classList.remove('hidden');
    },
    setGlucoseTag(tag) {
        document.getElementById('health-glucose-tag').value = tag;
        // UI bottoni tag
        const btns = document.querySelectorAll('.glucose-tag'); // Assumendo che aggiungi questa classe ai bottoni glicemia
        btns.forEach(b => {
            if (b.textContent.toLowerCase().includes(tag)) b.classList.add('selected');
            else b.classList.remove('selected');
        });
    },
    saveHealthEntry() {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        if (!profile) return;
        if (!profile.healthLogs) profile.healthLogs = [];

        const type = this.currentHealthType;
        let values = {};
        let isValid = false;

        // Recupera valori in base al tipo
        if (type === 'pressure') {
            const sys = document.getElementById('health-sys').value;
            const dia = document.getElementById('health-dia').value;
            const pulse = document.getElementById('health-pulse').value;
            if (sys && dia) { values = { sys, dia, pulse }; isValid = true; }
        }
        else if (type === 'weight') {
            const w = document.getElementById('health-weight').value;
            if (w) { values = { weight: w }; isValid = true; }
        }
        else if (type === 'glucose') {
            const g = document.getElementById('health-glucose').value;
            const tag = document.getElementById('health-glucose-tag').value;
            if (g) { values = { glucose: g, tag }; isValid = true; }
        }
        else if (type === 'temp') {
            const t = document.getElementById('health-temp').value;
            if (t) { values = { temp: t }; isValid = true; }
        }
        else if (type === 'spo2') {
            const s = document.getElementById('health-spo2').value;
            if (s) { values = { spo2: s }; isValid = true; }
        }

        if (!isValid) {
            this.showAlert("Errore", "Inserisci i valori richiesti.");
            return;
        }

        // Controllo di plausibilità: blocca solo i valori impossibili (refusi tipo
        // "1200" invece di "120"), con limiti volutamente ampi
        const LIMITS = {
            sys: [50, 300, 'Pressione massima', 'mmHg'], dia: [30, 200, 'Pressione minima', 'mmHg'],
            pulse: [20, 250, 'Battito', 'bpm'], weight: [1, 400, 'Peso', 'kg'],
            glucose: [10, 1000, 'Glicemia', 'mg/dL'], temp: [30, 45, 'Temperatura', '°C'],
            spo2: [50, 100, 'Saturazione', '%']
        };
        for (const [field, [min, max, label, unit]] of Object.entries(LIMITS)) {
            if (values[field] === undefined || values[field] === '') continue;
            const n = parseFloat(String(values[field]).replace(',', '.'));
            if (isNaN(n) || n < min || n > max) {
                this.showAlert("Valore non valido", `${label}: "${values[field]}" non sembra corretto.\nValori accettati: da ${min} a ${max} ${unit}.`);
                return;
            }
        }
        if (type === 'pressure' && parseFloat(values.sys) <= parseFloat(values.dia)) {
            this.showAlert("Valore non valido", "La pressione massima deve essere più alta della minima.\nControlla di non averle invertite.");
            return;
        }

        // Salva
        profile.healthLogs.push({
            id: this.generateId(),
            date: new Date().toISOString(),
            type: type,
            values: values
        });

        this.saveData();
        this.closeModal('modal-add-health');
        this.renderHealthLog(); // Aggiorna la lista
        this.showAlert("Salvato", "Misurazione registrata.");
    },
    deleteHealthEntry(id) {
        this.showConfirm("Elimina", "Vuoi cancellare questa misurazione?", () => {
            const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
            if (profile) {
                profile.healthLogs = profile.healthLogs.filter(x => x.id !== id);
                this.saveData();
                this.renderHealthLog();
            }
        });
    }
});
