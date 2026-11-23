// MedicinePro - backup.js
// Backup su file, export testo della terapia, account Google e backup cloud

Object.assign(app, {
    // Nuova logica di export (Stile ControlliPro)
    openBackupModal() {
        const safeData = JSON.parse(JSON.stringify(this.data));
        safeData.apiKey = ""; // Rimuovi chiave API per sicurezza

        const jsonContent = JSON.stringify(safeData, null, 2);
        this.currentBackupContent = jsonContent;

        // Gestione visibilità tasto share nativo
        const shareBtn = document.getElementById('btn-share-backup-native');
        const grid = document.getElementById('modal-backup-preview').querySelector('.grid');

        if (!navigator.share) {
            shareBtn.style.display = 'none';
            if (grid) grid.classList.replace('grid-cols-2', 'grid-cols-1');
        } else {
            shareBtn.style.display = 'flex';
            if (grid) grid.classList.replace('grid-cols-1', 'grid-cols-2');
        }

        this.showModal('modal-backup-preview');
    },
    // Rinominiamo la vecchia chiamata per puntare al nuovo modale
    exportData() {
        this.openBackupModal();
    },
    backupFileName() {
        return `MedicinePro_Backup_${this.getLocalDateString(new Date())}.json`;
    },
    // Condivide il backup come FILE (es. su Drive, email, WhatsApp): come testo
    // sarebbero megabyte incollati in un messaggio, che molte app rifiutano
    async shareBackup() {
        if (!navigator.share) return;
        const file = new File([this.currentBackupContent], this.backupFileName(), { type: 'application/json' });
        try {
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ title: 'Backup MedicinePro', files: [file] });
            } else {
                // Il dispositivo non può condividere file: meglio scaricarlo
                this.confirmBackupDownload();
                return;
            }
            this.closeModal('modal-backup-preview');
        } catch (err) {
            // Condivisione annullata dall'utente: niente da fare
        }
    },
    confirmBackupDownload() {
        const content = this.currentBackupContent;
        const blob = new Blob([content], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.backupFileName();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        this.closeModal('modal-backup-preview');
    },
    exportProfileTxt() {
        const profile = this.data.profiles.find(x => x.id === this.currentProfileId);
        if (!profile) return;

        // Generazione contenuto Report
        let content = `TERAPIA: ${profile.name.toUpperCase()}\n`;
        content += `Esportata il: ${new Date().toLocaleDateString('it-IT')}\n`;
        content += `--------------------------------------------------\n\n`;
        const times = ['Mattina', 'Pomeriggio', 'Sera'];
        times.forEach(time => {
            const meds = profile.meds.filter(m => m.time === time);
            if (meds.length > 0) {
                content += `[${time.toUpperCase()}]\n`;
                meds.forEach(m => {
                    content += `- ${m.name}`;
                    //if (m.category) content += ` (${m.category})`;
                    if (m.dose) content += ` | Dose: ${m.dose}`;
                    //if (m.usage) content += ` | Uso: ${m.usage}`;
                    content += `\n`;
                });
                content += `\n`;
            }
        });

        // Salva dati temporanei
        this.tempExport.content = content;
        this.tempExport.filename = `Terapia_${profile.name.replace(/\s+/g, '_')}.txt`;

        // Mostra anteprima
        document.getElementById('export-preview-content').textContent = content;

        // LOGICA PULSANTE CONDIVISIONE (Come nel Backup)
        const shareBtn = document.getElementById('btn-share-txt');
        const grid = document.getElementById('export-txt-buttons');

        if (!navigator.share) {
            shareBtn.style.display = 'none';
            if (grid) grid.classList.replace('grid-cols-2', 'grid-cols-1');
        } else {
            shareBtn.style.display = 'flex';
            if (grid) grid.classList.replace('grid-cols-1', 'grid-cols-2');
        }

        this.showModal('modal-export-preview');
    },
    // Nuova funzione per condividere il testo
    shareProfileTxt() {
        if (navigator.share && this.tempExport.content) {
            navigator.share({
                title: this.tempExport.filename.replace('.txt', ''),
                text: this.tempExport.content
            }).catch(() => { /* condivisione annullata */ });
        }
    },
    confirmExportTxt() {
        if (!this.tempExport.content) return;

        const blob = new Blob([this.tempExport.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.tempExport.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);

        this.closeModal('modal-export-preview');
    },
    // --- LOGICA FIREBASE CLOUD ---

    // Viene chiamata al login per aggiornare l'interfaccia
    updateAuthUI(user) {
        const loginSec = document.getElementById('cloud-login-section');
        const userSec = document.getElementById('cloud-user-section');

        if (user) {
            document.getElementById('cloud-user-name').textContent = user.displayName || user.email;
            // Senza foto dell'account si usa l'icona dell'app (il vecchio segnaposto esterno non esiste più)
            document.getElementById('cloud-user-pic').src = user.photoURL || 'icons/icon-192.png';
            loginSec.classList.add('hidden');
            userSec.classList.remove('hidden');
        } else {
            loginSec.classList.remove('hidden');
            userSec.classList.add('hidden');
        }
    },
    loginWithGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(err => {
            this.showAlert("Errore Login", err.message);
        });
    },
    logout() {
        auth.signOut();
    },
    async backupToCloud() {
        const user = auth.currentUser;
        if (!user) {
            this.showAlert("Accesso Richiesto", "Devi accedere con Google prima di poter salvare nel Cloud.");
            return;
        }

        this.toggleLoading(true, "Salvataggio nel Cloud...");

        try {
            // Creiamo una copia pulita dei dati
            const safeData = JSON.parse(JSON.stringify(this.data));
            safeData.apiKey = ""; // Non salviamo la chiave Gemini nel cloud per sicurezza
            const json = JSON.stringify(safeData);

            // Un documento Firestore non può superare 1 MB e le foto (in base64) lo
            // superano facilmente: il backup è diviso in parti da max ~1 MB
            // (250.000 caratteri = al massimo 1 MB anche con caratteri multi-byte).
            const CHUNK = 250000;
            const parts = [];
            for (let i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));

            const metaRef = db.collection('backups').doc(user.uid);
            const chunksRef = metaRef.collection('chunks');
            const prev = await metaRef.get();
            const prevCount = (prev.exists && prev.data().chunks) || 0;

            // Scrittura atomica: o si salva tutto o niente
            const batch = db.batch();
            batch.set(metaRef, {
                version: 2,
                chunks: parts.length,
                size: json.length,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            parts.forEach((data, i) => batch.set(chunksRef.doc(String(i)), { data }));
            for (let i = parts.length; i < prevCount; i++) batch.delete(chunksRef.doc(String(i)));
            await batch.commit();

            const mb = (json.length / 1048576).toFixed(1);
            this.showAlert("Successo!", `Il tuo backup è ora al sicuro nel Cloud! ☁️\n(${mb} MB)`);
        } catch (error) {
            console.error(error);
            this.showAlert("Errore", "Impossibile salvare il backup. Motivo: " + error.message);
        } finally {
            this.toggleLoading(false);
        }
    },
    async restoreFromCloud() {
        const user = auth.currentUser;
        if (!user) {
            this.showAlert("Accesso Richiesto", "Devi accedere con Google per ripristinare un backup.");
            return;
        }

        this.showConfirm("Ripristina Dati", "Attenzione: questo sovrascriverà tutti i dati attualmente presenti sul telefono. Vuoi continuare?", async () => {
            this.toggleLoading(true, "Download dal Cloud...");

            try {
                const metaRef = db.collection('backups').doc(user.uid);
                const doc = await metaRef.get();

                if (doc.exists) {
                    const meta = doc.data();
                    let json;
                    if (meta.backupData) {
                        // Formato vecchio: tutto in un unico documento
                        json = meta.backupData;
                    } else {
                        // Formato a parti: ricomponi in ordine
                        const snap = await metaRef.collection('chunks').get();
                        const byIndex = {};
                        snap.forEach(d => { byIndex[d.id] = d.data().data; });
                        const parts = [];
                        for (let i = 0; i < meta.chunks; i++) {
                            if (typeof byIndex[String(i)] !== 'string') throw new Error("backup incompleto nel cloud");
                            parts.push(byIndex[String(i)]);
                        }
                        json = parts.join('');
                    }

                    const cloudData = JSON.parse(json);
                    if (!cloudData || !Array.isArray(cloudData.profiles)) throw new Error("formato del backup non valido");

                    // La chiave Gemini non è nel cloud: mantieni quella già presente sul telefono
                    cloudData.apiKey = this.data.apiKey || "";

                    // Applica i dati e salva in locale (se il salvataggio fallisce l'utente è già avvisato)
                    this.data = cloudData;
                    if (!(await this.saveData())) return;

                    this.showAlert("Ripristino Completato", "I dati sono stati scaricati. L'app si riavvierà per applicare le modifiche.");
                    setTimeout(() => window.location.reload(), 2000);
                } else {
                    this.showAlert("Attenzione", "Non abbiamo trovato nessun backup associato al tuo account Google.");
                }
            } catch (error) {
                console.error(error);
                this.showAlert("Errore", "Impossibile scaricare il backup. Motivo: " + error.message);
            } finally {
                this.toggleLoading(false);
            }
        });
    },
    triggerImport() { document.getElementById('import-file').click(); },
    async handleImport(input) {
        const file = input.files[0];
        if (!file) return;

        this.toggleLoading(true, "Lettura file in corso...");

        const reader = new FileReader();
        reader.onerror = () => {
            this.toggleLoading(false);
            this.showAlert("Errore", "Impossibile leggere il file selezionato.");
        };
        reader.onload = (e) => {
            this.toggleLoading(false);
            let json;
            try {
                json = JSON.parse(e.target.result);
            } catch (err) {
                this.showAlert("File non valido", "Il file scelto non è un backup di MedicinePro (contenuto non leggibile).");
                return;
            }
            if (!json || !Array.isArray(json.profiles)) {
                this.showAlert("File non valido", "Il file scelto non è un backup di MedicinePro.");
                return;
            }

            // Riepilogo e conferma PRIMA di sovrascrivere i dati del telefono
            const nProfili = json.profiles.length;
            const nFarmaci = new Set(json.profiles.flatMap(p => (p.meds || []).map(m => m.sharedId || m.id))).size;
            const msg = `Il file contiene <b>${nProfili} ${nProfili === 1 ? 'profilo' : 'profili'}</b> e <b>${nFarmaci} ${nFarmaci === 1 ? 'farmaco' : 'farmaci'}</b>.<br><br>` +
                `Tutti i dati attualmente sul telefono verranno <b>sostituiti</b>. Vuoi continuare?`;

            this.showConfirm("Importa Backup", msg, async () => {
                try {
                    this.toggleLoading(true, "Scrittura nel database...");
                    this.currentProfileId = null;
                    document.getElementById('input-med-edit-id').value = '';

                    // La chiave Gemini non è nel file: mantieni quella del telefono
                    json.apiKey = this.data.apiKey || "";
                    this.data = json;

                    // Aspetta che il salvataggio sia finito (se fallisce l'utente è già avvisato)
                    const saved = await this.saveData();
                    this.toggleLoading(false);
                    if (!saved) return;

                    this.showAlert("Backup Importato", "Dati ripristinati con successo. L'app si riavvierà per applicarli.");
                    setTimeout(() => window.location.reload(), 1500);
                } catch (err) {
                    this.toggleLoading(false);
                    this.showAlert("Errore", "Errore durante l'importazione: " + err.message);
                }
            });
        };
        reader.readAsText(file);
        input.value = '';
    }
});
