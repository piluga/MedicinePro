// MedicinePro - camera.js
// Fotocamera, foto dei farmaci, riconoscimento con Gemini AI e OCR gratuito

Object.assign(app, {
    // --- CAMERA SCANNER LOGIC ---

    // MODIFICA: startScanner accetta un parametro opzionale
    // useFreeOcr: l'utente ha scelto la lettura gratuita (Tesseract) senza chiave Gemini
    startScanner(photoOnly = false, useFreeOcr = false) {
        if (useFreeOcr) this.closeModal('modal-no-api');
        const preferOcr = this.data.preferences && this.data.preferences.preferOcr;
        if (!this.data.apiKey && !photoOnly && !preferOcr && !useFreeOcr) {
            this.showModal('modal-no-api');
            return;
        }

        this.isPhotoOnlyMode = photoOnly; // Salviamo la modalità

        const container = document.getElementById('camera-container');
        const video = document.getElementById('camera-feed');
        // ... resto del codice getUserMedia identico a prima ...
        try {
            navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } }
            }).then(stream => {
                this.stream = stream;
                video.srcObject = this.stream;
                container.style.display = 'flex';
            }).catch(err => {
                this.showAlert("Errore Camera", "Impossibile accedere alla fotocamera.");
            });
        } catch (e) { console.error(e); }
    },
    stopScanner() {
        const container = document.getElementById('camera-container');
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        document.getElementById('camera-feed').srcObject = null;
        container.style.display = 'none';
    },
    // MODIFICA: captureImage
    async captureImage() {
        const video = document.getElementById('camera-feed');
        const canvas = document.getElementById('camera-canvas');
        const ctx = canvas.getContext('2d');

        // La fotocamera non ha ancora prodotto immagini (scatto troppo rapido)
        if (!video.videoWidth || !video.videoHeight) {
            this.showAlert("Attendi", "La fotocamera si sta ancora avviando. Riprova tra un istante.");
            return;
        }

        // 1. Cattura frame originale
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Stop camera
        this.stopScanner();

        // 2. Ottieni Base64 grezzo
        const rawBase64 = canvas.toDataURL('image/jpeg', 0.9);

        // 3. COMPRIMI L'IMMAGINE (Importante per IndexedDB!)
        const compressedBase64 = await this.resizeImage(rawBase64, 800, 0.7) || rawBase64;

        // 4. Salva nella variabile temporanea
        this.tempMedImage = compressedBase64;
        this.updateImagePreview(); // Mostra anteprima nel modale

        // 5. Se NON è solo modalità foto, procedi con l'analisi
        if (!this.isPhotoOnlyMode) {
            // Scegli il motore: OCR gratuito (nessuna chiave / preferenza utente) oppure Gemini AI
            const preferOcr = this.data.preferences && this.data.preferences.preferOcr;
            if (preferOcr || !this.data.apiKey) {
                await this.analyzeImageOCR(compressedBase64);
            } else {
                const base64Data = compressedBase64.split(',')[1];
                await this.analyzeImage(base64Data);
            }
        }
    },
    // NUOVA FUNZIONE: Ridimensiona immagini (Helper)
    resizeImage(base64Str, maxWidth = 800, quality = 0.7) {
        // Restituisce null se il browser non riesce a leggere l'immagine (es. HEIC)
        return new Promise((resolve) => {
            const img = new Image();
            img.onerror = () => resolve(null);
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxWidth) {
                        width *= maxWidth / height;
                        height = maxWidth;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        });
    },
    // NUOVE FUNZIONI UI IMMAGINI
    updateImagePreview() {
        const previewContainer = document.getElementById('med-img-preview-container');
        const placeholder = document.getElementById('med-img-placeholder');
        const img = document.getElementById('med-img-preview');

        if (this.tempMedImage) {
            img.src = this.tempMedImage;
            previewContainer.classList.remove('hidden');
            placeholder.classList.add('hidden');
        } else {
            img.src = '';
            previewContainer.classList.add('hidden');
            placeholder.classList.remove('hidden');
        }
    },
    removeMedImage() {
        this.tempMedImage = null;
        this.updateImagePreview();
    },
    viewFullImage() {
        if (this.tempMedImage) {
            document.getElementById('full-image-display').src = this.tempMedImage;
            document.getElementById('modal-image-view').classList.remove('hidden');
        }
    },
    // Riconoscimento del farmaco dalla foto con Gemini: compila il modulo
    async analyzeImage(base64Image) {
        // 1. Verifica API Key
        if (!this.data.apiKey) {
            this.showModal('modal-no-api');
            return;
        }

        this.toggleLoading(true, "Analisi farmaco in corso...");

        const payload = this.buildGeminiPayload(base64Image);

        try {
            // --- MODIFICA FONDAMENTALE QUI SOTTO ---
            // 'gemini-1.5-flash' e 'gemini-2.0-*' sono stati dismessi da Google (404).
            // Usiamo l'alias 'gemini-flash-latest', che punta sempre al modello Flash
            // stabile più recente: evita di dover aggiornare questo URL a mano
            // ogni volta che Google ritira una versione.
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`;
            // La chiave va nell'header (non nell'URL) così non finisce in log e cronologia
            const geminiHeaders = { 'x-goog-api-key': this.data.apiKey };

            const result = await this.fetchWithRetry(url, payload, 3, 1000, geminiHeaders);

            const parsedData = this.parseGeminiResponse(result);
            this.fillMedFormFromScan(parsedData);
        } catch (err) {
            console.error("ERRORE SCANNER:", err);
            this.showAlert("Errore Analisi", this.geminiErrorMessage(err));
        } finally {
            this.toggleLoading(false);
        }
    },

    // Richiesta per Gemini: istruzioni (prompt) + foto, con risposta in JSON
    buildGeminiPayload(base64Image) {
        // 2. Prompt per Gemini
        const prompt = `Analizza questa immagine di un farmaco.

                                                                                        Estrai i dati e rispondi ESCLUSIVAMENTE con un oggetto JSON valido (senza markdown o testo extra) con questi campi:

                                                                                        - "name": nome commerciale e dosaggio (es. 'Oki 80mg').

                                                                                        - "form": forma farmaceutica (es. 'Bustine', 'Pillole', 'Capsule', 'Compresse Effervescenti', 'Sciroppo', 'Gocce').

                                                                                        - "dose": dosaggio numerico (es. '80mg').

                                                                                        - "type": CATEGORIA TERAPEUTICA. Scegli SOLO tra: Antibiotico, Antimicrobico, Antidolorifico, Analgesico, Antinfiammatorio, Antiacido, Anticoagulante, Antidepressivo, Antistaminico, Anticonvulsivante, Cardiovascolare, Integratore, Vitamine, Gastroprotettore. Se incerto usa stringa vuota.

                                                                                        - "usage": breve descrizione a cosa serve.

                                                                                        - "blister_count": numero intero di blister visibili (o null).

                                                                                        - "pills_per_blister": numero intero di pillole per blister (o null).`;

        const payload = {
            contents: [{
                role: "user",
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "image/jpeg", data: base64Image } }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };
        return payload;
    },

    // Estrae e interpreta il JSON dalla risposta di Gemini (errore se la risposta non è valida)
    parseGeminiResponse(result) {
        if (!result || !result.candidates || result.candidates.length === 0) {
            throw new Error("Nessuna risposta dal modello AI.");
        }

        const candidate = result.candidates[0];
        if (candidate.finishReason && candidate.finishReason !== 'STOP' || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
            throw new Error(`Risposta non valida dal modello (motivo: ${candidate.finishReason || 'sconosciuto'}).`);
        }

        let text = candidate.content.parts[0].text;

        // Pulizia JSON
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) text = jsonMatch[0];

        const parsedData = JSON.parse(text);
        return parsedData;
    },

    // Compila i campi del modulo farmaco con i dati riconosciuti
    fillMedFormFromScan(parsedData) {
        // Popolamento campi
        if (parsedData.name) {
            document.getElementById('input-med-name').value = parsedData.name;
            document.getElementById('input-med-category').value = parsedData.form || "";
            document.getElementById('input-med-dose').value = parsedData.dose || "";
            document.getElementById('input-med-usage').value = parsedData.usage || "";
            document.getElementById('input-med-type').value = parsedData.type || "";

            // Blister
            if (parsedData.blister_count) document.getElementById('med-blister-count').value = parsedData.blister_count;
            if (parsedData.pills_per_blister) document.getElementById('med-pills-per-blister').value = parsedData.pills_per_blister;

            if (parsedData.blister_count && parsedData.pills_per_blister) {
                this.calculateTotalStock();
            }

            this.showAlert("Analisi Completata", `Ho identificato: ${parsedData.name}`);
        } else {
            this.showAlert("Attenzione", "L'AI non ha trovato dati validi.");
        }
    },

    // Messaggio comprensibile per l'utente a partire dall'errore tecnico
    geminiErrorMessage(err) {
        const text = String((err && err.message) || '');
        let msg = `Errore imprevisto: ${text || 'sconosciuto'}.`;
        if (text.includes("429")) msg = "Troppe richieste. Riprova tra poco.";
        else if (text.includes("403")) msg = "API Key non valida.";
        else if (text.includes("400")) msg = "Richiesta non valida (formato immagine o payload). Riprova con un'altra foto.";
        else if (text.includes("500") || text.includes("503")) msg = "Il servizio Gemini è momentaneamente non disponibile. Riprova tra poco.";
        else if (text.includes("motivo:")) msg = `L'AI non ha potuto analizzare l'immagine (${err.message}).`;
        else if (err && err.name === 'TypeError') msg = "Errore di rete: verifica la connessione internet.";
        return msg;
    },
    async analyzeImageOCR(dataUrlImage) {
        // Tesseract (~60 KB + dati lingua) viene scaricato solo al primo uso dell'OCR
        if (typeof Tesseract === 'undefined') {
            this.toggleLoading(true, "Caricamento modulo OCR...");
            try {
                await this.loadScript(TESSERACT_URL);
            } catch (e) {
                this.toggleLoading(false);
                this.showAlert("OCR non disponibile", "Il modulo di riconoscimento testo non è stato caricato. Verifica la connessione internet e riprova.");
                return;
            }
        }
        this.toggleLoading(true, "Lettura testo (OCR)...");
        try {
            const { data } = await Tesseract.recognize(dataUrlImage, 'ita+eng');
            const fullText = (data.text || '').trim();
            if (!fullText) {
                this.showAlert("Attenzione", "L'OCR non ha trovato testo leggibile nella foto. Prova con più luce o inquadrando meglio l'etichetta.");
                return;
            }
            // 1. Nome: la riga con il testo più "grande" (bbox più alta) è di solito
            // il nome commerciale stampato in evidenza sulla confezione.
            const lines = (data.lines || []).filter(l => l.text && l.text.replace(/[^a-zA-Z]/g, '').length >= 3);
            let nameGuess = '';
            if (lines.length > 0) {
                const tallest = lines.reduce((best, l) => {
                    const h = l.bbox ? (l.bbox.y1 - l.bbox.y0) : 0;
                    const bestH = best.bbox ? (best.bbox.y1 - best.bbox.y0) : 0;
                    return h > bestH ? l : best;
                }, lines[0]);
                nameGuess = tallest.text.trim().replace(/\s+/g, ' ');
            }
            // 2. Dose: prima occorrenza di un numero seguito da un'unità di misura comune
            const doseMatch = fullText.match(/(\d+[.,]?\d*)\s?(mg|mcg|µg|ug|g|ml|u\.?i\.?|%)\b/i);
            const doseGuess = doseMatch ? `${doseMatch[1]}${doseMatch[2].toLowerCase()}` : '';
            // 3. Forma farmaceutica: cerca parole chiave note nel testo riconosciuto
            const formKeywords = ['compresse', 'capsule', 'sciroppo', 'gocce', 'bustine', 'fiale', 'supposte', 'crema', 'pomata', 'spray', 'collirio', 'granulato', 'effervescenti'];
            const lowerText = fullText.toLowerCase();
            const formMatch = formKeywords.find(k => lowerText.includes(k));
            const formGuess = formMatch ? formMatch.charAt(0).toUpperCase() + formMatch.slice(1) : '';
            if (nameGuess) {
                document.getElementById('input-med-name').value = nameGuess;
                if (formGuess) document.getElementById('input-med-category').value = formGuess;
                if (doseGuess) document.getElementById('input-med-dose').value = doseGuess;
                this.showAlert("Lettura OCR completata", `Ho letto: "${nameGuess}". Controlla e correggi i campi se necessario: l'OCR legge il testo ma non "capisce" il farmaco come l'AI.`);
            } else {
                this.showAlert("Attenzione", "Non sono riuscito a individuare un nome chiaro. Ecco il testo letto, copialo manualmente se utile:\n\n" + fullText.slice(0, 300));
            }
        } catch (err) {
            console.error("ERRORE OCR:", err);
            this.showAlert("Errore OCR", `Lettura del testo non riuscita: ${err.message || 'errore sconosciuto'}. Verifica la connessione internet e riprova.`);
        } finally {
            this.toggleLoading(false);
        }
    }
});
