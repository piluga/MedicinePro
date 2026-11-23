// MedicinePro - main.js
// Avvio dell'app e registrazione del service worker (caricato per ultimo)

// Avvio dell'Applicazione: appena il DOM è pronto (non serve aspettare
// immagini, font e icone come faceva window.onload)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

// ==========================================
// SERVICE WORKER & AGGIORNAMENTI
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('✅ SW Registrato');

            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // Mostra il modale di aggiornamento in modo pulito
                        setTimeout(() => {
                            app.showModal('modal-app-updated');
                        }, 500);
                    }
                });
            });
        }).catch(err => console.error('❌ Errore SW:', err));
    });
}

// Nota: il controllo "nuovo giorno" e il risveglio dal background sono gestiti
// in app.init(), DOPO il caricamento dei dati. Un controllo eseguito prima
// (sui dati iniziali vuoti) rischiava di sovrascrivere i dati salvati.
