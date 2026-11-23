// Con la strategia network-first per i file locali NON serve più cambiare
// questo nome a ogni modifica di js/*.js, index.html o style.css: basta pubblicare.
// Incrementalo solo se cambi l'elenco delle risorse precaricate qui sotto
// (per esempio se aggiungi o rinomini un file in js/).
const CACHE_NAME = 'medicinepro-cache-v31';

// Tempo massimo di attesa della rete per i file locali prima di usare la cache
const NETWORK_TIMEOUT_MS = 4000;

// 1. Risorse locali (obbligatorie: se manca una di queste l'installazione fallisce)
const localUrls = [
    './',
    './index.html',
    './manifest.json',
    './style.css',
    './tailwind.css',
    // Codice dell'app (stesso elenco e ordine di index.html)
    './js/config.js',
    './js/core.js',
    './js/profiles.js',
    './js/medications.js',
    './js/therapy.js',
    './js/drug-database.js',
    './js/camera.js',
    './js/stock.js',
    './js/doctor.js',
    './js/health.js',
    './js/reminders.js',
    './js/backup.js',
    './js/contacts.js',
    './js/main.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png'
];

// 2. Risorse esterne (CDN): scaricate in modalità 'no-cors', best-effort
const externalUrls = [
    'https://cdn.jsdelivr.net/npm/idb-keyval@6.3.0/dist/umd.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap'
];

// Host che NON devono mai passare dalla cache (dati live, login, AI)
const BYPASS_HOSTS = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'generativelanguage.googleapis.com',
    'firebaseapp.com',
    'firebaseinstallations.googleapis.com'
];

// FASE DI INSTALLAZIONE
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);

        // File locali: scaricati saltando la cache HTTP del browser
        await cache.addAll(localUrls.map(url => new Request(url, { cache: 'reload' })));

        // File esterni: un errore su uno non blocca l'installazione
        await Promise.all(externalUrls.map(async url => {
            try {
                const response = await fetch(new Request(url, { mode: 'no-cors' }));
                await cache.put(url, response);
            } catch (err) {
                console.log('[Service Worker] Errore salvataggio CDN:', url, err);
            }
        }));

        await self.skipWaiting();
    })());
});

// FASE DI ATTIVAZIONE (pulizia vecchie cache)
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(
            names
                .filter(name => name !== CACHE_NAME)
                .map(name => {
                    console.log('[Service Worker] Rimuovo vecchia cache:', name);
                    return caches.delete(name);
                })
        );
        await self.clients.claim();
    })());
});

// Una risposta è salvabile se è valida (200) o opaca (CDN no-cors)
function isCacheable(response) {
    return response && (response.ok || response.type === 'opaque');
}

async function putInCache(request, response) {
    try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response);
    } catch (err) {
        console.log('[Service Worker] Impossibile salvare in cache:', request.url, err);
    }
}

// File locali: prima la rete (versione sempre aggiornata), cache se offline/lenta
async function networkFirst(event) {
    const request = event.request;
    const isNavigation = request.mode === 'navigate';

    let cacheUpdate = Promise.resolve();
    const networkPromise = fetch(request, { cache: 'no-cache' }).then(response => {
        if (isCacheable(response)) {
            cacheUpdate = putInCache(isNavigation ? './index.html' : request, response.clone());
        }
        return response;
    });
    // Registrato subito (in modo sincrono) così il SW resta vivo finché la cache è aggiornata
    event.waitUntil(networkPromise.then(() => cacheUpdate, () => {}));

    const fromCache = async () => {
        const cached = await caches.match(request, { ignoreSearch: isNavigation });
        if (cached) return cached;
        if (isNavigation) return caches.match('./index.html');
        return undefined;
    };

    // Gara tra rete e timeout: se la rete è lenta si usa la cache,
    // ma la risposta di rete continua ad aggiornare la cache in background.
    const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS));
    try {
        const winner = await Promise.race([networkPromise, timeout]);
        if (winner) return winner;
        const cached = await fromCache();
        return cached || await networkPromise;
    } catch (err) {
        const cached = await fromCache();
        if (cached) return cached;
        return new Response('Offline e risorsa non disponibile in cache', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

// Risorse esterne: risposta immediata dalla cache, aggiornamento in background
async function staleWhileRevalidate(event) {
    const request = event.request;

    let cacheUpdate = Promise.resolve();
    const networkPromise = fetch(request).then(response => {
        if (isCacheable(response)) {
            cacheUpdate = putInCache(request, response.clone());
        }
        return response;
    }).catch(() => undefined);
    event.waitUntil(networkPromise.then(() => cacheUpdate));

    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await networkPromise;
    return response || Response.error();
}

// FASE DI FETCH
self.addEventListener('fetch', event => {
    const request = event.request;

    // Solo GET http/https (Firestore usa POST, estensioni usano altri protocolli)
    if (request.method !== 'GET') return;
    if (!request.url.startsWith('http')) return;

    const url = new URL(request.url);
    if (BYPASS_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) return;
    if (url.pathname.startsWith('/__/auth/')) return; // handler login Firebase

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(event));
    } else {
        event.respondWith(staleWhileRevalidate(event));
    }
});
