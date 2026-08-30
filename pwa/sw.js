/**
 * pwa/sw.js - ServiceWorker für W-Link ERP Baustellenbegleiter PWA
 * Gewährleistet 100% Offline-Verfügbarkeit der App-Shell und Fachmodule.
 */

const CACHE_NAME = 'wlink-mobile-v1.2.0';
const APP_SHELL = [
    './',
    './index.html',
    './css/pwa.css',
    './js/dexie.min.js',
    './js/pwa-db.js',
    './js/camera-engine.js',
    './js/sync-worker.js',
    './js/pwa-app.js',
    '../controllers/ZeiterfassungController.js',
    '../controllers/BautagebuchMobileController.js',
    './manifest.webmanifest'
];

// 1. Installation: App Shell vorab cachen
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[ServiceWorker] Caching App-Shell...');
            return cache.addAll(APP_SHELL).catch(err => {
                console.warn('[ServiceWorker] Einzelelement Cache-Fallback:', err.message);
            });
        }).then(() => self.skipWaiting())
    );
});

// 2. Aktivierung: Veraltete Caches bereinigen
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => {
                    console.log('[ServiceWorker] Lösche veralteten Cache:', key);
                    return caches.delete(key);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Fetch-Strategie: Cache-First für statische Dateien, Network-Only für Sync-APIs & WebSockets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Sync-API-Aufrufe NIEMALS cachen
    if (url.pathname.includes('/api/') || url.pathname.includes('/sync') || url.protocol === 'ws:' || url.protocol === 'wss:') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});

// 4. Background Sync API Trigger
self.addEventListener('sync', event => {
    if (event.tag === 'sync-outbox') {
        event.waitUntil(
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({ type: 'TRIGGER_BACKGROUND_SYNC' }));
            })
        );
    }
});
