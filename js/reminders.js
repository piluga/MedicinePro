// MedicinePro - reminders.js
// Promemoria nel calendario del telefono (file .ics)

Object.assign(app, {
    // --- LOGICA CALENDARIO RAGGRUPPATA ---

    // Promemoria nel calendario del telefono: un evento ripetuto per ogni farmaco e fascia oraria
    exportToCalendar(method = 'PUBLISH') {
        let events = [];
        const now = new Date();
        const todayStr = app.getLocalDateString(now);

        // Mappa Orari Standard
        const STANDARD_TIMES = {
            'Mattina': '08:00',
            'Pomeriggio': '14:00', // Spostato alle 14:00 per differenziarlo dal pranzo
            'Sera': '20:00'
        };

        // Mappa Giorni della settimana per formato ICS
        const ICS_DAYS = {
            'Dom': 'SU', 'Lun': 'MO', 'Mar': 'TU', 'Mer': 'WE',
            'Gio': 'TH', 'Ven': 'FR', 'Sab': 'SA'
        };

        const ctx = { now, todayStr, STANDARD_TIMES, ICS_DAYS, usedUids: new Set() };
        // Cicla per ogni profilo
        this.data.profiles.forEach(profile => {
            profile.meds.forEach(med => {
                const event = this.buildCalendarEvent(profile, med, ctx);
                if (event) events.push(event);
            });
        });

        if (events.length === 0) {
            this.showAlert("Nessun Evento", "Non ci sono farmaci attivi e programmati da esportare.");
            return;
        }

        this.generateICSFile(events, method);
    },

    // Evento ICS di un farmaco in una fascia oraria (null se "al bisogno" o terapia finita)
    buildCalendarEvent(profile, med, ctx) {
        const { now, todayStr, STANDARD_TIMES, ICS_DAYS, usedUids } = ctx;

        // 1. Escludi farmaci "Al Bisogno", sospesi o già terminati
        if (med.time === 'Al Bisogno') return null;
        if (this.isSuspended(med)) return null;
        if (med.endDate && med.endDate < todayStr) return null;

        // 2. Calcola Data di Inizio Evento
        // Se la terapia è iniziata nel passato, il calendario nativo
        // la gestirà senza suonare per i giorni vecchi
        let startD = med.startDate ? app.parseLocalDate(med.startDate) : new Date();
        // Con giorni specifici la prima occorrenza deve cadere in uno di quei giorni,
        // altrimenti molti calendari suonano anche nel giorno di partenza
        if (Array.isArray(med.days) && med.days.length > 0) {
            const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
            for (let i = 0; i < 7 && !med.days.includes(dayNames[startD.getDay()]); i++) {
                startD.setDate(startD.getDate() + 1);
            }
        }

        // 3. Imposta l'orario (Specifico o Standard)
        const timeStr = med.specificTime || STANDARD_TIMES[med.time] || '08:00';

        // Creazione stringhe data-ora in formato ICS (es: 20231012T080000)
        // Senza la "Z" finale: crea un orario "locale" (se viaggi, suona sempre alle 8 del mattino locali)
        const startDateTime = app.getLocalDateString(startD).replace(/-/g, '') + 'T' + timeStr.replace(':', '') + '00';

        let endObj = new Date(app.getLocalDateString(startD) + 'T' + timeStr);
        endObj.setMinutes(endObj.getMinutes() + 15); // Durata evento: 15 min
        const endDateTime = app.getLocalDateString(endObj).replace(/-/g, '') + 'T' + String(endObj.getHours()).padStart(2, '0') + String(endObj.getMinutes()).padStart(2, '0') + '00';

        // 4. COSTRUZIONE REGOLA DI RIPETIZIONE (RRULE)
        let rrule = '';
        if (med.days && med.days.length > 0) {
            // Giorni specifici (es. solo Lun e Mer)
            const daysList = med.days.map(d => ICS_DAYS[d]).join(',');
            rrule = `FREQ=WEEKLY;BYDAY=${daysList}`;
        } else if (med.frequency === 'alternate') {
            // Giorni alterni
            rrule = `FREQ=DAILY;INTERVAL=2`;
        } else {
            // Tutti i giorni
            rrule = `FREQ=DAILY`;
        }

        // Se c'è una data di fine, aggiungi la clausola UNTIL
        if (med.endDate) {
            // UNTIL richiede formato UTC assoluto (Z)
            const untilD = new Date(med.endDate + 'T23:59:59Z');
            const untilStr = untilD.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
            rrule += `;UNTIL=${untilStr}`;
        }

        // ID univoco per l'evento (Essenziale per poterlo cancellare in futuro).
        // Le fasce dello stesso farmaco condividono lo sharedId: con lo stesso UID il calendario
        // ne terrebbe una sola. La prima fascia mantiene l'UID storico (così gli eventi già
        // esportati si possono ancora cancellare), le altre ricevono la fascia come suffisso.
        const baseUid = `medpro-${profile.id}-${med.sharedId || med.id}`;
        let uid = `${baseUid}@medicinepro.app`;
        if (usedUids.has(uid)) uid = `${baseUid}-${String(med.time).toLowerCase().replace(/\s+/g, '-')}@medicinepro.app`;
        usedUids.add(uid);

        return {
            uid: uid,
            title: `💊 ${profile.name}: ${med.name}`,
            description: `Dose: ${med.dose || 'Standard'}\\nNote: ${med.usage || ''}\\nGenerato da MedicinePro`,
            start: startDateTime,
            end: endDateTime,
            rrule: rrule,
            stamp: now.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'
        };
    },
    async generateICSFile(events, method) {
        let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//MedicinePro//IT\nCALSCALE:GREGORIAN\n";

        // Gestione Eliminazione/Aggiunta
        icsContent += method === 'CANCEL' ? "METHOD:CANCEL\n" : "METHOD:PUBLISH\n";

        events.forEach(ev => {
            icsContent += "BEGIN:VEVENT\n";
            icsContent += `UID:${ev.uid}\n`;
            icsContent += `DTSTAMP:${ev.stamp}\n`;
            icsContent += `DTSTART:${ev.start}\n`;
            icsContent += `DTEND:${ev.end}\n`;

            // Inserisce la regola di ripetizione ottimizzata
            if (ev.rrule) {
                icsContent += `RRULE:${ev.rrule}\n`;
            }

            if (method === 'CANCEL') {
                icsContent += `STATUS:CANCELLED\n`;
                icsContent += `SUMMARY:CANCELLATO: ${ev.title}\n`;
            } else {
                icsContent += `SUMMARY:${ev.title}\n`;
                icsContent += `DESCRIPTION:${ev.description}\n`;
                icsContent += `STATUS:CONFIRMED\n`;

                // DOPPIO ALLARME (Migliora l'aderenza)
                // 1. Suona 10 minuti prima per prepararsi
                icsContent += `BEGIN:VALARM\nTRIGGER:-PT10M\nACTION:DISPLAY\nDESCRIPTION:Tra poco: ${ev.title}\nEND:VALARM\n`;
                // 2. Suona all'orario esatto
                icsContent += `BEGIN:VALARM\nTRIGGER:PT0M\nACTION:DISPLAY\nDESCRIPTION:Assumi ora: ${ev.title}\nEND:VALARM\n`;
            }

            icsContent += "END:VEVENT\n";
        });

        icsContent += "END:VCALENDAR";

        const fileName = method === 'CANCEL' ? 'Rimuovi_Terapia.ics' : 'Terapia_MedPro.ics';
        const file = new File([icsContent], fileName, { type: 'text/calendar' });

        // TENTA LA CONDIVISIONE NATIVA (Android/iOS)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'Terapia MedicinePro',
                    text: 'Aggiungi la terapia al calendario'
                });
                return;
            } catch (error) {
                // Condivisione annullata: si passa al download manuale
            }
        }

        // FALLBACK: DOWNLOAD MANUALE + MODALE ISTRUZIONI
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showModal('modal-ics-instruction');
    }
});
