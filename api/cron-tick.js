// Vercel Cron hits /api/cron-tick (root-level because Vercel cron paths
// resolve against the project root, not the directory). This file just
// re-exports the cron/tick handler.
module.exports = require('./cron/tick.js');
