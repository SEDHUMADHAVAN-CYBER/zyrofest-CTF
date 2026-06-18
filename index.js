/**
 * index.js — Firebase Cloud Functions Entry Point for ZYROFEST CTF
 * Firebase automatically loads .env.zyrofest-ctf for this project.
 * server.js exports the Express app; we wrap it with an onRequest handler.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions');

// Set global options for all functions
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const db = require('./db/supabase');
const app = require('./server');

let initialized = false;

exports.app = onRequest({ timeoutSeconds: 60, memory: '512MiB' }, async (req, res) => {
  // Lazy init: only run once per cold start
  if (!initialized) {
    try {
      await db.initialize();
      initialized = true;
    } catch (err) {
      console.error('DB init error:', err);
    }
  }
  return app(req, res);
});
