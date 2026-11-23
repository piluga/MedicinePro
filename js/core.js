// MedicinePro - core.js
// Stato dell'app, utilità comuni, avvio (init), modali, navigazione, salvataggio dati

const app = {
    data: { lastOpened: null, profiles: [], apiKey: "" },
    tempMedImage: null,// Variabile per tenere la foto mentre si edita
    isPhotoOnlyMode: false,// Per distinguere se stiamo usando la camera solo per foto o per AI
    currentProfileId: null,
    tempContactFields: [],// Per la rubrica dinamica
    editingContactId: null,
    selectedTimes: [],
    selectedDays: [],
    currentTherapyMonth: null,
    therapyMonthSwipeInitialized: false,
    currentEditingMed: null,
    touchStartX: 0,
    touchStartY: 0,
    isSwiping: false,
    stream: null,
    newProfileAvatar: null,
    expandedSections: [],
    confirmCallback: null,
    currentBackupContent: "",
    tempProfileImage: null,
    tempEditProfileImage: null,
    // Variabili per il modale dettagli giorno
    editingDayDate: null,
    editingDayTimes: [],
    // Variabili per export txt temporaneo
    tempExport: { content: null, filename: null },
    // --- 🛡️ FUNZIONE DI SICUREZZA ANTI-XSS ---
    escapeHTML(str) {
        // Il numero 0 va mostrato: si scartano solo valori assenti
        if (str === null || str === undefined || str === false) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },
    // 🎨 TEMI DI COLORE
    profileThemes: [
        { bg: 'bg-blue-50', border: 'border-blue-200', iconBg: 'bg-blue-100', iconText: 'text-blue-600', progress: 'text-blue-500' },
        { bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', progress: 'text-emerald-500' },
        { bg: 'bg-violet-50', border: 'border-violet-200', iconBg: 'bg-violet-100', iconText: 'text-violet-600', progress: 'text-violet-500' },
        { bg: 'bg-amber-50', border: 'border-amber-200', iconBg: 'bg-amber-100', iconText: 'text-amber-600', progress: 'text-amber-500' },
        { bg: 'bg-rose-50', border: 'border-rose-200', iconBg: 'bg-rose-100', iconText: 'text-rose-600', progress: 'text-rose-500' },
        { bg: 'bg-cyan-50', border: 'border-cyan-200', iconBg: 'bg-cyan-100', iconText: 'text-cyan-600', progress: 'text-cyan-500' },
        { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', iconBg: 'bg-fuchsia-100', iconText: 'text-fuchsia-600', progress: 'text-fuchsia-500' },
        { bg: 'bg-lime-50', border: 'border-lime-200', iconBg: 'bg-lime-100', iconText: 'text-lime-600', progress: 'text-lime-500' },
    ],
    // Modifica 1: Init diventa async
    async init() {
        await this.loadData();
        auth.onAuthStateChanged(user => this.updateAuthUI(user));

        // --- MAGIA ANTI-BLOCCO: SPOSTA I MODALI NEL BODY ---
        // Prende tutti i modali intrappolati nel <main> e li sposta nel <body>
        // in modo che il browser non li "addormenti" mai più!
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            document.body.appendChild(modal);
        });
        // ---------------------------------------------------

        this.checkDailyReset();
        this.checkNewDay();
        this.renderProfiles();

        const usage = document.getElementById('input-med-usage');
        if (usage) {
            usage.addEventListener('input', () => {
                usage.style.height = 'auto';
                usage.style.height = usage.scrollHeight + 'px';
            });
        }

        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('current-date-display').textContent = new Date().toLocaleDateString('it-IT', options);
        document.getElementById('btn-back').addEventListener('click', () => this.goBack());

        document.addEventListener('touchstart', e => {
            this.touchStartX = e.changedTouches[0].screenX;
            this.touchStartY = e.changedTouches[0].screenY;
            this.isSwiping = false;
        }, { passive: true });

        document.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            const touchEndY = e.changedTouches[0].screenY;
            this.handleSwipe(touchEndX, touchEndY);
        }, { passive: true });

        document.getElementById('confirm-btn-yes').addEventListener('click', () => {
            if (this.confirmCallback) {
                this.confirmCallback();
            }
            this.closeModal('modal-confirm');
        });

        document.addEventListener('visibilitychange', () => {
            // App in background: spegni la fotocamera se era aperta (batteria e privacy)
            if (document.visibilityState === 'hidden' && this.stream) this.stopScanner();
            if (document.visibilityState === 'visible') {
                this.checkDailyReset();
                this.checkNewDay();
                // Aggiorna la grafica al rientro dal background
                if (this.currentProfileId) this.renderMedications();
            }
        });

        setInterval(() => {
            this.checkDailyReset();
            this.checkNewDay();
            if (this.currentProfileId) {
                this.renderMedications();
            }
        }, 60 * 1000);
    },
    // --- GESTIONE MODALI DI SISTEMA ---
    showAlert(title, message) {
        document.getElementById('alert-title').textContent = title;
        document.getElementById('alert-message').textContent = message;
        this.showModal('modal-alert');
    },
    showConfirm(title, message, onConfirm) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').innerHTML = message;
        this.confirmCallback = onConfirm;
        this.showModal('modal-confirm');
    },
    // Numero nel formato richiesto da wa.me (prefisso internazionale, solo cifre).
    // Non basta controllare se inizia con "39": molti cellulari italiani
    // iniziano con 39x (es. 392 1234567) e resterebbero senza prefisso.
    toWhatsAppNumber(raw) {
        const str = String(raw || '').trim();
        let digits = str.replace(/[^0-9]/g, '');
        // "+..." o "00..." = già internazionale
        if (str.startsWith('+')) return digits;
        if (digits.startsWith('00')) return digits.slice(2);
        // Numeri italiani: max 10-11 cifre; con il 39 davanti diventano 11-13
        if (digits.startsWith('39') && digits.length >= 11) return digits;
        return '39' + digits;
    },
    // Età in anni compiuti a partire da una data AAAA-MM-GG
    calculateAge(dob) {
        const birth = this.parseLocalDate(dob);
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
        return age;
    },
    parseLocalDate(dateStr) {
        // PROTEZIONE: Se la data è vuota, nulla o indefinita, restituisci la data di oggi
        if (!dateStr) {
            const today = new Date();
            return new Date(today.getFullYear(), today.getMonth(), today.getDate());
        }

        // Codice originale
        const parts = dateStr.split('-');
        return new Date(parts[0], parts[1] - 1, parts[2]);
    },
    // NUOVA FUNZIONE: Riconoscimento farmaco gratuito via OCR (Tesseract.js)
    // Nessuna chiave API, gira interamente nel browser. Meno preciso di Gemini
    // (nessuna comprensione del contenuto, solo lettura del testo), quindi i
    // campi vanno sempre controllati/corretti dall'utente dopo il riempimento.
    // Carica uno script esterno solo quando serve (una volta sola)
    loadScript(src) {
        this._scriptPromises = this._scriptPromises || {};
        if (!this._scriptPromises[src]) {
            this._scriptPromises[src] = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = resolve;
                s.onerror = () => {
                    delete this._scriptPromises[src];
                    s.remove();
                    reject(new Error('Impossibile caricare ' + src));
                };
                document.head.appendChild(s);
            });
        }
        return this._scriptPromises[src];
    },
    async fetchWithRetry(url, options, retries = 3, backoff = 1000, extraHeaders = {}) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...extraHeaders },
                body: JSON.stringify(options)
            });

            // Se è 429 (Too Many Requests), lancia errore per attivare il retry
            if (response.status === 429) {
                const err429 = new Error("429 Too Many Requests");
                err429.status = 429;
                throw err429;
            }

            if (!response.ok) {
                const errBody = await response.text().catch(() => '');
                const httpErr = new Error(`HTTP error! status: ${response.status} ${errBody.slice(0, 200)}`);
                httpErr.status = response.status;
                throw httpErr;
            }

            return await response.json();
        } catch (error) {
            // Riprova solo per errori transitori (rate limit o rete assente).
            // Un 400/401/403/404 è un errore permanente: ritentare non serve e ritarda solo il messaggio all'utente.
            const isTransient = error.status === 429 || error.name === 'TypeError';
            if (isTransient && retries > 0) {
                console.warn(`Retrying... attempts left: ${retries}. Error: ${error.message}`);
                // Aspetta (backoff) ms prima di riprovare
                await new Promise(resolve => setTimeout(resolve, backoff));
                return this.fetchWithRetry(url, options, retries - 1, backoff * 2, extraHeaders); // Raddoppia l'attesa
            } else {
                throw error;
            }
        }
    },
    toggleLoading(show, text = "") {
        const overlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');
        loadingText.textContent = text;
        overlay.style.display = show ? 'flex' : 'none';
    },
    // --- NAVIGATION ---

    goBack() {
        this.goHome();
    },
    goHome() {
        this.currentProfileId = null;

        // 1. Mostra la Home
        document.getElementById('view-profiles').classList.remove('hidden');

        // 2. Nascondi TUTTE le altre viste (inclusa la nuova view-management)
        document.getElementById('view-medications').classList.add('hidden');
        document.getElementById('view-settings').classList.add('hidden');
        document.getElementById('view-management').classList.add('hidden'); // <--- QUESTA RIGA MANCAVA
        document.getElementById('view-contacts').classList.add('hidden');

        // 3. Nascondi il tasto indietro
        document.getElementById('btn-back').classList.add('hidden');

        // 4. Aggiorna la lista profili e il tasto "Al Banco"
        this.renderProfiles();
    },
    showSettings() {
        this.currentProfileId = null;

        document.getElementById('view-profiles').classList.add('hidden');
        document.getElementById('view-medications').classList.add('hidden');
        document.getElementById('view-management').classList.add('hidden');
        document.getElementById('view-contacts').classList.add('hidden');

        const settingsView = document.getElementById('view-settings');
        settingsView.classList.remove('hidden');

        document.getElementById('btn-back').classList.remove('hidden');

        // Caricamento valori
        document.getElementById('input-settings-apikey').value = this.data.apiKey || "";
        const prefs = this.data.preferences || { showCart: true, showNotes: true, showEdit: true, showDelete: true };
        document.getElementById('pref-show-cart').checked = prefs.showCart;
        document.getElementById('pref-show-notes').checked = prefs.showNotes;
        document.getElementById('pref-show-edit').checked = prefs.showEdit;
        document.getElementById('pref-show-delete').checked = prefs.showDelete;

        // Nota: usiamo !== false così di default è ATTIVO per i nuovi utenti
        document.getElementById('pref-show-image').checked = (prefs.showImage !== false);
        // Scanner: preferisci sempre l'OCR gratuito, anche se è configurata una chiave Gemini
        document.getElementById('pref-prefer-ocr').checked = !!prefs.preferOcr;
        // ----------------------------

        window.scrollTo(0, 0);
    },
    showManagement() {
        this.currentProfileId = null;

        // Nascondi tutto il resto
        document.getElementById('view-profiles').classList.add('hidden');
        document.getElementById('view-medications').classList.add('hidden');
        document.getElementById('view-settings').classList.add('hidden');
        document.getElementById('view-contacts').classList.add('hidden');

        // Mostra Gestione
        const mgmtView = document.getElementById('view-management');
        mgmtView.classList.remove('hidden');

        document.getElementById('btn-back').classList.remove('hidden');

        // Aggiorna lo stato del pulsante spesa (colori testo)
        this.updateShoppingBtnState();

        window.scrollTo(0, 0);
    },
    goToSettingsFromModal() {
        this.closeModal('modal-no-api');
        // Chiudi anche il modale farmaco se aperto
        this.closeModal('modal-med');
        this.showSettings();
    },
    saveSettings() {
        this.data.apiKey = document.getElementById('input-settings-apikey').value.trim();

        // --- NUOVO: Salva Preferenze ---
        this.data.preferences = {
            showCart: document.getElementById('pref-show-cart').checked,
            showNotes: document.getElementById('pref-show-notes').checked,
            showEdit: document.getElementById('pref-show-edit').checked,
            showDelete: document.getElementById('pref-show-delete').checked,
            showImage: document.getElementById('pref-show-image').checked,
            preferOcr: document.getElementById('pref-prefer-ocr').checked
        };
        // -------------------------------

        this.saveData();
        this.showAlert("Successo", "Impostazioni salvate!");
        this.goHome(); // Torna alla home dopo il salvataggio
    },
    resetAllData() {
        this.showConfirm(
            "Attenzione",
            "Sei sicuro di voler resettare tutto? Tutti i dati andranno persi.",
            () => {
                this.resetData();
                this.goHome();
            }
        );
    },
    // --- DATA LOGIC ---
    // Modifica 2: loadData con idbKeyval
    // MODIFICA: app.loadData (Assicurati che drugDb esista)
    async loadData() {
        try {
            let stored = null;

            // 1. Prova a leggere dal database avanzato
            if (window.idbKeyval) {
                try {
                    stored = await window.idbKeyval.get('MedicineProData');
                } catch (dbErr) {
                    console.warn("Lettura IDB fallita.", dbErr);
                }
            }

            // 2. Se è vuoto o la libreria manca, cerca nel vecchio localStorage
            if (!stored) {
                try {
                    const localStored = localStorage.getItem('MedicineProData');
                    if (localStored) {
                        stored = JSON.parse(localStored);
                        console.log("Dati recuperati da localStorage (Migrazione...)");
                    }
                } catch (e) {
                    console.warn("Lettura localStorage fallita.", e);
                }
            }

            // 3. Se non c'è proprio nulla, partiamo da zero
            if (!stored) {
                this.resetData();
                return;
            }

            this.data = stored;

            // --- NORMALIZZAZIONI DI SICUREZZA ---
            if (!this.data.contacts) this.data.contacts = [];
            // Ripara le date dei contatti rovinate dalle versioni precedenti, che le
            // sovrascrivevano a ogni visualizzazione ("01/12/2026", "undefined/undefined/01/12/2026")
            this.data.contacts.forEach(c => (c.fields || []).forEach(f => {
                if (f.type !== 'date' || !f.value || /^\d{4}-\d{2}-\d{2}$/.test(f.value)) return;
                const it = String(f.value).match(/(\d{2})\/(\d{2})\/(\d{4})$/);
                if (it) f.value = `${it[3]}-${it[2]}-${it[1]}`;
            }));
            if (!this.data.apiKey) this.data.apiKey = "";
            if (!this.data.preferences) this.data.preferences = { showCart: true, showNotes: true, showEdit: true, showDelete: true };
            if (!Array.isArray(this.data.drugDb)) this.data.drugDb = [];

            this.data.profiles.forEach((profile, index) => {
                if (typeof profile.themeIndex === 'undefined') profile.themeIndex = index % this.profileThemes.length;
                this.normalizeMedications(profile);

                profile.meds.forEach(med => {
                    if (!Array.isArray(med.days)) med.days = [];
                    if (typeof med.boxQty !== "number") med.boxQty = 0;
                    if (typeof med.minQty !== "number") med.minQty = 0;
                    if (typeof med.alertShown !== "boolean") med.alertShown = false;
                    if (typeof med.taken !== "boolean") med.taken = false;
                    if (med.startDate === undefined) med.startDate = null;
                    if (med.durationDays === undefined) med.durationDays = null;
                    if (med.endDate === undefined) med.endDate = null;
                    if (typeof med.therapyEndedAlertShown !== "boolean") med.therapyEndedAlertShown = false;
                    if (!med.frequency) med.frequency = "daily";
                    if (!med.specificDays) med.specificDays = {};
                });
                if (!Array.isArray(profile.healthLogs)) profile.healthLogs = [];
            });

            // 4. Risalviamo tutto subito per assicurare la persistenza
            await this.saveData();

        } catch (e) {
            console.error("Errore fatale nel caricamento dati DB", e);
            this.resetData();
        }
    },
    // MODIFICA: app.resetData (Aggiungi drugDb)
    resetData() {
        if (!this.data.contacts) this.data.contacts = [];
        this.data = {
            lastOpened: app.getLocalDateString(new Date()),
            profiles: [],
            drugDb: [], // <--- NUOVO: Database permanente farmaci
            apiKey: "",
            preferences: {
                showCart: true,
                showNotes: true,
                showEdit: true,
                showDelete: true
            }
        };
        this.saveData();
    },
    // Modifica 3: saveData con idbKeyval
    async saveData() {
        try {
            // 1. Prova a salvare nel Database Avanzato
            if (typeof idbKeyval !== 'undefined') {
                await idbKeyval.set('MedicineProData', this.data);
                console.log("✅ Salvataggio su IndexedDB completato.");
            } else {
                // 2. Piano B
                localStorage.setItem('MedicineProData', JSON.stringify(this.data));
                console.warn("⚠️ Salvataggio su localStorage completato (IDB non disponibile).");
            }
            this.updateShoppingBtnState();
        } catch (err) {
            console.error("Errore critico di salvataggio:", err);
            // 3. SE FALLISCE, ORA CE LO DICE CHIARAMENTE!
            alert("❌ IMPOSSIBILE SALVARE I DATI!\nMotivo: " + err.message + "\n\nSe il backup contiene foto, il file è troppo grande per la memoria base. Assicurati di aprire l'app tramite Live Server.");
        }
    },
    generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); },
    // Data locale in formato YYYY-MM-DD (evita i disallineamenti di toISOString, che usa UTC)
    getLocalDateString(d = new Date()) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    showModal(id) {
        if (id === 'modal-med') {
            const editId = document.getElementById('input-med-edit-id').value;
            if (!editId) {
                this.resetMedModal();
            }
        }

        if (id === 'modal-add-profile') {
            this.selectAvatar(null);
            this.newProfileAvatar = null;
            // Resetta la foto se il modale viene riaperto
            this.tempProfileImage = null;
            const imgEl = document.getElementById('profile-img-preview');
            const iconEl = document.getElementById('profile-img-icon');
            if (imgEl) imgEl.classList.add('hidden');
            if (iconEl) iconEl.classList.remove('hidden');
            const fileInput = document.getElementById('input-profile-image');
            if (fileInput) fileInput.value = '';
        }

        document.getElementById(id).classList.remove('hidden');
    },
    closeModal(id) {
        document.getElementById(id).classList.add('hidden');
        if (id === 'modal-med') {
            document.getElementById('input-med-edit-id').value = '';
        }
    },
    handleSwipe(endX, endY) {
        if (!this.currentProfileId) return;
        if (!document.getElementById('view-settings').classList.contains('hidden')) return;
        if (document.querySelector('.modal-overlay:not(.hidden)')) return;

        const diffX = endX - this.touchStartX;
        const diffY = endY - this.touchStartY;

        // Prevenzione scroll verticale interpretato come swipe
        if (Math.abs(diffY) > Math.abs(diffX)) return;

        // Soglia minima movimento
        if (Math.abs(diffX) < 60) return;

        const edgeThreshold = 40; // Pixel dal bordo per attivare la gesture "Indietro"
        const isLeftEdge = this.touchStartX < edgeThreshold;
        const isRightEdge = this.touchStartX > (window.innerWidth - edgeThreshold);

        // --- GESTURE 1: SWIPE DAI BORDI (TORNA ALLA HOME) ---
        // Bordo SX verso DX  oppure  Bordo DX verso SX
        if ((isLeftEdge && diffX > 0) || (isRightEdge && diffX < 0)) {
            this.goHome();
            return; // Blocca qui per non scatenare il cambio profilo
        }

        // --- GESTURE 2: SWIPE CENTRALE (CAMBIO PROFILO) ---
        // Solo se NON siamo partiti dai bordi
        if (!isLeftEdge && !isRightEdge) {
            const currentIndex = this.data.profiles.findIndex(p => p.id === this.currentProfileId);

            if (diffX > 0) {
                if (currentIndex > 0) {
                    this.openProfile(this.data.profiles[currentIndex - 1].id);
                }
            }

            if (diffX < 0 && currentIndex < this.data.profiles.length - 1) {
                this.openProfile(this.data.profiles[currentIndex + 1].id);
            }
        }
    },
    // Variabile temporanea per memorizzare cosa stiamo ricevendo
    tempReceiveData: null,
    // NUOVA FUNZIONE: Chiude l'avviso e porta l'utente a rifare il calendario
    goToSettingsFromReminder() {
        this.closeModal('modal-reminder-update');
        this.showSettings();
    },
    stripAccents(str) {
        return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '');
    },
    currentHealthType: 'pressure'
};
