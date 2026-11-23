// MedicinePro - profiles.js
// Profili: creazione, modifica, foto, elenco, codice fiscale

Object.assign(app, {
    openProfile(id) {
        this.currentProfileId = id;
        const profile = this.data.profiles.find(x => x.id === id);

        document.getElementById('view-profiles').classList.add('hidden');
        document.getElementById('view-medications').classList.remove('hidden');
        document.getElementById('btn-back').classList.remove('hidden');

        // Initialize expanded section based on time
        const hour = new Date().getHours();
        let activeTime = 'Mattina';
        if (hour >= 13) activeTime = 'Pomeriggio';
        if (hour >= 19) activeTime = 'Sera';
        this.expandedSections = [activeTime];

        this.renderMedications();
        if (profile) this.checkTherapyEnd(profile);
    },
    selectAvatar(type) {
        this.newProfileAvatar = type;
        document.querySelectorAll('.avatar-btn').forEach(btn => {
            if (btn.dataset.avatar === type) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    },
    createProfile() {
        const name = document.getElementById('input-profile-name').value.trim();
        const nickname = document.getElementById('input-profile-nickname').value.trim();
        const dob = document.getElementById('input-profile-dob').value; // Data di nascita ISO (YYYY-MM-DD)
        const address = document.getElementById('input-profile-address').value.trim();
        const birthplace = document.getElementById('input-profile-birthplace').value.trim();
        const cf = document.getElementById('input-profile-cf').value.trim().toUpperCase();

        if (!name) {
            this.showAlert("Attenzione", "Il nome è obbligatorio.");
            return;
        }

        const age = dob ? this.calculateAge(dob) : "";

        const themeIndex = this.data.profiles.length % this.profileThemes.length;

        this.data.profiles.push({
            id: this.generateId(),
            name, nickname, dob, age, address, birthplace, cf,
            meds: [],
            healthLogs: [],
            themeIndex,
            avatar: this.newProfileAvatar,
            image: this.tempProfileImage || null
        });

        this.saveData();

        // Reset e chiusura
        document.getElementById('input-profile-name').value = '';
        document.getElementById('input-profile-nickname').value = '';
        document.getElementById('input-profile-dob').value = '';
        document.getElementById('input-profile-address').value = '';
        document.getElementById('input-profile-birthplace').value = '';
        document.getElementById('input-profile-cf').value = '';

        // <-- NUOVO RESET FOTO -->
        this.tempProfileImage = null;
        document.getElementById('input-profile-image').value = '';
        document.getElementById('profile-img-preview').classList.add('hidden');
        document.getElementById('profile-img-icon').classList.remove('hidden');

        this.closeModal('modal-add-profile');
        this.renderProfiles();
    },
    openEditProfileModal() {
        const p = this.data.profiles.find(x => x.id === this.currentProfileId);
        if (p) {
            // Carica i dati nei campi edit
            document.getElementById('input-edit-profile-name').value = p.name || '';
            document.getElementById('input-edit-profile-nickname').value = p.nickname || '';
            document.getElementById('input-edit-profile-dob').value = p.dob || ''; // Data Nascita
            document.getElementById('input-edit-profile-address').value = p.address || '';
            document.getElementById('input-edit-profile-birthplace').value = p.birthplace || '';
            document.getElementById('input-edit-profile-cf').value = p.cf || '';

            // <-- NUOVA LOGICA CARICAMENTO FOTO -->
            this.tempEditProfileImage = p.image || null;

            const imgEl = document.getElementById('edit-profile-img-preview');
            const iconEl = document.getElementById('edit-profile-img-icon');
            const removeBtn = document.getElementById('btn-remove-edit-image');

            if (this.tempEditProfileImage) {
                imgEl.src = this.tempEditProfileImage;
                imgEl.classList.remove('hidden');
                iconEl.classList.add('hidden');
                removeBtn.classList.remove('hidden');
            } else {
                imgEl.src = '';
                imgEl.classList.add('hidden');
                iconEl.classList.remove('hidden');
                removeBtn.classList.add('hidden');
            }
            // <-- FINE NUOVA LOGICA -->

            // Imposta visualmente l'avatar E aggiorna la variabile interna per il calcolo del sesso
            this.selectAvatar(p.avatar || 'man');

            this.showModal('modal-edit-profile');
        }
    },
    saveEditedProfile() {
        const p = this.data.profiles.find(x => x.id === this.currentProfileId);
        if (!p) return;

        // Leggi i valori
        const newName = document.getElementById('input-edit-profile-name').value.trim();
        const newNickname = document.getElementById('input-edit-profile-nickname').value.trim();
        const newDob = document.getElementById('input-edit-profile-dob').value;
        const newAddress = document.getElementById('input-edit-profile-address').value.trim();
        const newBirthplace = document.getElementById('input-edit-profile-birthplace').value.trim();
        const newCf = document.getElementById('input-edit-profile-cf').value.trim().toUpperCase();

        if (!newName) {
            this.showAlert("Errore", "Il nome non può essere vuoto.");
            return;
        }

        const newAge = newDob ? this.calculateAge(newDob) : "";

        // Aggiorna Oggetto
        p.name = newName;
        p.nickname = newNickname;
        p.dob = newDob;
        p.age = newAge; // Aggiorniamo anche l'età calcolata
        p.address = newAddress;
        p.birthplace = newBirthplace;
        p.cf = newCf;
        p.avatar = this.newProfileAvatar;
        p.image = this.tempEditProfileImage;

        this.saveData();

        // Aggiorna UI
        // Usa il nickname se c'è, altrimenti il nome (come da tua logica precedente)
        const displayName = (p.nickname && p.nickname.trim() !== '') ? p.nickname : p.name;
        document.getElementById('current-profile-name').textContent = displayName;

        this.renderProfiles();
        this.closeModal('modal-edit-profile');
        this.showAlert("Salvato", "Profilo aggiornato.");
    },
    deleteCurrentProfile() {
        this.showConfirm("Elimina Profilo", "Eliminare definitivamente questo profilo?", () => {
            this.data.profiles = this.data.profiles.filter(x => x.id !== this.currentProfileId);
            this.saveData();
            this.closeModal('modal-edit-profile'); // Chiudi il modale
            this.goHome();
        });
    },
    renderProfiles() {
        const container = document.getElementById('profiles-list');
        container.innerHTML = '';

        if (this.data.profiles.length === 0) {
            container.innerHTML = `<p class="text-center text-slate-400 py-10">Nessun profilo presente.</p>`;
            const btnPharmacy = document.getElementById('btn-home-pharmacy');
            if (btnPharmacy) btnPharmacy.classList.add('hidden');
            return;
        }

        const avatarIcons = {
            'man': 'fa-person', 'woman': 'fa-person-dress', 'dog': 'fa-dog', 'cat': 'fa-cat'
        };

        let hasActiveOrders = false;
        const todayISO = this.getLocalDateString();

        this.data.profiles.forEach(p => {
            if (p.meds.some(m => m.isOTCOrdered)) hasActiveOrders = true;

            if (typeof p.themeIndex === 'undefined') p.themeIndex = Math.floor(Math.random() * this.profileThemes.length);
            const theme = this.profileThemes[p.themeIndex] || this.profileThemes[0];

            // Farmaci distinti (un farmaco preso mattina e sera conta una volta)
            const total = new Set(p.meds.map(m => m.sharedId || m.id)).size;
            // Avanzamento di oggi: solo le dosi previste oggi ("al bisogno" e sospesi esclusi)
            const dueToday = p.meds.filter(m => this.isScheduledOn(m, todayISO));
            const taken = dueToday.filter(m => m.taken).length;
            const perc = dueToday.length === 0 ? 0 : Math.round((taken / dueToday.length) * 100);
            const hasDoctor = p.doctor && p.doctor.name && p.doctor.name.trim() !== '';

            // SICUREZZA: Sanitizziamo il nome utente
            const rawName = (p.nickname && p.nickname.trim() !== '') ? p.nickname : p.name;
            const safeName = this.escapeHTML(rawName);

            const div = document.createElement('div');
            div.className = `${theme.bg} ${theme.border} p-4 rounded-xl card-shadow flex justify-between items-center cursor-pointer border hover:shadow-md transition-all`;
            div.onclick = () => this.openProfile(p.id);

            const percClass = perc === 100 ? 'text-green-600' : theme.progress;
            const percText = dueToday.length === 0 ? '' : `${perc}%`;

            let iconContent;
            if (p.image) {
                iconContent = `<img src="${app.escapeHTML(p.image)}" class="w-full h-full object-cover rounded-full" alt="Foto">`;
            } else if (p.avatar && avatarIcons[p.avatar]) {
                iconContent = `<i class="fa-solid ${avatarIcons[p.avatar]} text-3xl"></i>`;
            } else {
                iconContent = `<span class="text-2xl">${safeName.charAt(0).toUpperCase()}</span>`;
            }

            // UX: Rimosso title="Modifica Dottore" per evitare popup mobile
            const doctorBadge = hasDoctor ? `

                                <div onclick="event.stopPropagation(); app.openDoctorModal('${p.id}')"

                                        class="absolute -bottom-1 -right-1 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm cursor-pointer hover:scale-110 transition-transform z-10">

                                    <i class="fa-solid fa-user-doctor text-[10px] text-blue-500"></i>

                                </div>

                            ` : '';

            const doctorBtn = !hasDoctor ? `

                                <button onclick="event.stopPropagation(); app.openDoctorModal('${p.id}')" class="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors shadow-sm ml-2 shrink-0">

                                    <i class="fa-solid fa-user-doctor mr-1"></i> Medico

                                </button>

                            ` : '';

            div.innerHTML = `

                                <div class="flex items-center gap-4 overflow-hidden">

                                    <div class="w-16 h-16 rounded-full ${theme.iconBg} ${theme.iconText} flex items-center justify-center font-bold shadow-sm border border-white/50 relative shrink-0">

                                        ${iconContent}

                                        ${doctorBadge}

                                    </div>

                                    <div class="overflow-hidden">

                                        <h3 class="font-bold text-slate-800 text-lg leading-tight truncate">${safeName}</h3>

                                        <div class="flex items-center mt-1">

                                            <span class="text-xs text-slate-500 shrink-0">${total} farmaci</span>

                                            ${doctorBtn}

                                        </div>

                                    </div>

                                </div>

                                <span class="text-sm font-bold ${percClass} shrink-0 ml-2">${percText}</span>

                            `;
            container.appendChild(div);
        });

        const btnPharmacy = document.getElementById('btn-home-pharmacy');
        if (btnPharmacy) {
            if (hasActiveOrders) btnPharmacy.classList.remove('hidden');
            else btnPharmacy.classList.add('hidden');
        }
    },
    // --- GENERATORE CODICE FISCALE ---

    async generateFiscalCode(mode = 'add') {
        const prefix = mode === 'add' ? 'input-profile' : 'input-edit-profile';

        // 1. Recupera Dati
        // Accenti rimossi (NICOLÒ -> NICOLO): nel codice fiscale le vocali accentate contano come normali
        const nameField = this.stripAccents(document.getElementById(`${prefix}-name`).value.trim().toUpperCase()).replace(/\s+/g, ' ');
        const dob = document.getElementById(`${prefix}-dob`).value;
        const city = document.getElementById(`${prefix}-birthplace`).value.trim().toUpperCase();

        // Determina sesso dall'avatar selezionato (Man/Dog = M, Woman/Cat = F)
        // Se siamo in edit, dobbiamo recuperare l'avatar corrente dal profilo se non cambiato
        let gender = 'M';
        if (this.newProfileAvatar === 'woman' || this.newProfileAvatar === 'cat') gender = 'F';
        // (In edit mode potresti dover leggere this.currentProfileId, ma per ora usiamo la selezione attiva)

        if (!nameField || !dob || !city) {
            this.showAlert("Dati mancanti", "Inserisci Nome, Data di Nascita e Comune per generare il codice.");
            return;
        }

        this.toggleLoading(true, "Calcolo Codice Fiscale...");

        try {
            // 2. Separa Nome e Cognome (Assumiamo l'ultimo spazio come separatore)
            const parts = nameField.split(' ');
            let surname = parts.length > 1 ? parts.pop() : parts[0];
            let name = parts.length > 1 ? parts.join('') : parts[0]; // Fallback se solo una parola

            // Helper Consonanti/Vocali
            const getConsonants = (str) => str.replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, '');
            const getVowels = (str) => str.replace(/[^AEIOU]/g, '');
            const normalize = (str) => (str + 'XXX').slice(0, 3);

            // A. COGNOME (Prime 3 consonanti)
            let codeSurname = getConsonants(surname);
            if (codeSurname.length < 3) codeSurname += getVowels(surname);
            codeSurname = normalize(codeSurname);

            // B. NOME (1a, 3a, 4a cons se ce ne sono >=4, altrimenti prime 3)
            let codeNameCons = getConsonants(name);
            let codeName = "";
            if (codeNameCons.length >= 4) {
                codeName = codeNameCons[0] + codeNameCons[2] + codeNameCons[3];
            } else {
                codeName = codeNameCons + getVowels(name);
            }
            codeName = normalize(codeName);

            // C. DATA E SESSO
            const d = this.parseLocalDate(dob);
            const year = String(d.getFullYear()).slice(-2);
            const monthCodes = ['A', 'B', 'C', 'D', 'E', 'H', 'L', 'M', 'P', 'R', 'S', 'T'];
            const month = monthCodes[d.getMonth()];
            let day = d.getDate();
            if (gender === 'F') day += 40;
            const dayStr = String(day).padStart(2, '0');

            // D. COMUNE (Fetch JSON Comuni)
            const cityCode = await this.getCityCode(city);
            if (cityCode === undefined) throw new Error("Impossibile scaricare l'elenco dei comuni. Verifica la connessione internet e riprova.");
            if (!cityCode) throw new Error("Comune non trovato. Controlla l'ortografia (per i comuni omonimi aggiungi la provincia, es. \"Castro (LE)\").");

            // E. CODICE PARZIALE (Primi 15 caratteri)
            const partialCF = codeSurname + codeName + year + month + dayStr + cityCode;

            // F. CARATTERE DI CONTROLLO (CIN)
            const cin = this.calculateCIN(partialCF);

            const finalCF = partialCF + cin;

            // Risultato
            document.getElementById(`${prefix}-cf`).value = finalCF;
            this.showAlert("Fatto", "Codice Fiscale generato!");

        } catch (err) {
            console.error(err);
            this.showAlert("Errore", err.message || "Impossibile calcolare il codice.");
        } finally {
            this.toggleLoading(false);
        }
    },
    // Accetta "Forlì", "forli", "Sant'Agata", "Sant Agata" e, per i comuni omonimi,
    // la sigla della provincia: "Castro (LE)" o "Castro LE".
    // Restituisce il codice catastale, null se il comune non esiste, undefined se l'elenco
    // non si può scaricare (es. offline)
    async getCityCode(cityName) {
        if (!this._comuni) {
            try {
                // Elenco ufficiale dei comuni (~2 MB), scaricato una sola volta per sessione
                const response = await fetch('https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json');
                if (!response.ok) return undefined;
                this._comuni = await response.json();
            } catch (e) {
                return undefined;
            }
        }
        try {
            const key = s => this.stripAccents(s).toUpperCase().replace(/[^A-Z]/g, '');
            const input = cityName.trim();
            const withProv = input.match(/^(.*?)[\s(]+([A-Za-z]{2})\)?$/);

            let found = null;
            if (withProv) {
                found = this._comuni.find(c => key(c.nome) === key(withProv[1]) && c.sigla.toUpperCase() === withProv[2].toUpperCase());
            }
            if (!found) found = this._comuni.find(c => key(c.nome) === key(input));
            return found ? found.codiceCatastale : null;
        } catch (e) {
            return null; // Fallback manuale
        }
    },
    calculateCIN(cf15) {
        const oddValues = {
            '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
            'A': 1, 'B': 0, 'C': 5, 'D': 7, 'E': 9, 'F': 13, 'G': 15, 'H': 17, 'I': 19, 'J': 21,
            'K': 2, 'L': 4, 'M': 18, 'N': 20, 'O': 11, 'P': 3, 'Q': 6, 'R': 8, 'S': 12, 'T': 14,
            'U': 16, 'V': 10, 'W': 22, 'X': 25, 'Y': 24, 'Z': 23
        };
        const evenValues = {
            '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
            'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'G': 6, 'H': 7, 'I': 8, 'J': 9,
            'K': 10, 'L': 11, 'M': 12, 'N': 13, 'O': 14, 'P': 15, 'Q': 16, 'R': 17, 'S': 18, 'T': 19,
            'U': 20, 'V': 21, 'W': 22, 'X': 23, 'Y': 24, 'Z': 25
        };

        let sum = 0;
        for (let i = 0; i < 15; i++) {
            const char = cf15[i];
            if ((i + 1) % 2 !== 0) { // Dispari (1°, 3°...)
                sum += oddValues[char];
            } else { // Pari (2°, 4°...)
                sum += evenValues[char];
            }
        }
        return String.fromCharCode((sum % 26) + 65);
    },
    // Nuova funzione per gestire il caricamento della foto profilo
    async handleProfileImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const rawBase64 = e.target.result;

            // Usiamo la tua funzione di compressione (impostata a 400px per i profili)
            const compressedImage = await this.resizeImage(rawBase64, 400, 0.7);
            if (!compressedImage) {
                this.showAlert("Foto non supportata", "Il formato di questa immagine non è supportato. Scegli una foto JPG o PNG.");
                return;
            }

            this.tempProfileImage = compressedImage;

            // Aggiorna l'interfaccia
            const imgEl = document.getElementById('profile-img-preview');
            const iconEl = document.getElementById('profile-img-icon');

            imgEl.src = compressedImage;
            imgEl.classList.remove('hidden');
            iconEl.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    },
    async handleEditProfileImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const rawBase64 = e.target.result;
            // Comprimi l'immagine come fatto in precedenza
            const compressedImage = await this.resizeImage(rawBase64, 400, 0.7);
            if (!compressedImage) {
                this.showAlert("Foto non supportata", "Il formato di questa immagine non è supportato. Scegli una foto JPG o PNG.");
                return;
            }

            this.tempEditProfileImage = compressedImage;

            // Aggiorna l'interfaccia del modale di Modifica
            document.getElementById('edit-profile-img-preview').src = compressedImage;
            document.getElementById('edit-profile-img-preview').classList.remove('hidden');
            document.getElementById('edit-profile-img-icon').classList.add('hidden');
            document.getElementById('btn-remove-edit-image').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    },
    removeEditProfileImage() {
        this.tempEditProfileImage = null; // Svuota la variabile

        // Ripristina l'interfaccia all'icona della fotocamera
        document.getElementById('edit-profile-img-preview').src = '';
        document.getElementById('edit-profile-img-preview').classList.add('hidden');
        document.getElementById('edit-profile-img-icon').classList.remove('hidden');
        document.getElementById('input-edit-profile-image').value = ''; // Resetta l'input
        document.getElementById('btn-remove-edit-image').classList.add('hidden');
    }
});
