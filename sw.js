const CACHE_NAME = 'medicinepro-cache-v8';

// 1. Risorse Locali
const localUrls = [
    './index.html',
    './manifest.json',
    './style.css',
    './app.js'
];

// 2. Risorse Esterne (CDN e Font)
const externalUrls = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/idb-keyval@6/dist/umd.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap',
    'https://i.ibb.co/N6db36Sf/medicine.png'
];

// FASE DI INSTALLAZIONE
self.addEventListener('install', event => {
    // Forza l'installazione immediata senza aspettare
    self.skipWaiting(); 
    
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[Service Worker] Salvataggio risorse locali...');
            // Salva file locali
            cache.addAll(localUrls);
            
            console.log('[Service Worker] Salvataggio risorse esterne...');
            // Salva file esterni (modalità no-cors per evitare blocchi di sicurezza)
            return Promise.all(
                externalUrls.map(url => {
                    return fetch(url, { mode: 'no-cors' }).then(response => {
                        return cache.put(url, response);
                    }).catch(err => console.log('Impossibile mettere in cache:', url, err));
                })
            );
        })
    );
});

// FASE DI ATTIVAZIONE (Pulizia vecchia cache)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Se la versione è vecchia, eliminala!
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Elimino vecchia cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Prende il controllo immediato di tutte le schede aperte
            return self.clients.claim(); 
        })
    );
});

// FASE DI RECUPERO (Fetch)
self.addEventListener('fetch', event => {
    // Ignora le richieste alle API di Gemini (devono sempre essere live)
    if (event.request.url.includes('generativelanguage.googleapis.com')) return;

    // Ignora estensioni di Chrome o protocolli strani (file://)
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request).then(response => {
            // Se c'è in cache, restituiscilo subito
            if (response) return response;
            
            // Altrimenti scaricalo da internet
            return fetch(event.request).then(networkResponse => {
                // Controllo di validità
                if (!networkResponse || (networkResponse.status !== 200 && networkResponse.status !== 0)) {
                    return networkResponse;
                }

                // Salva una copia in cache per la volta successiva
                if (event.request.url.startsWith('http')) {
                    let responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }

                return networkResponse;
            }).catch(() => {
                console.log('[Service Worker] Modalità offline - Risorsa non trovata:', event.request.url);
            });
        })
    );
});
