'use strict';

/**
 * MVS MQTT message handler: hub/{hubId}/send
 * Case 1: JSON with pending_devices → sync DB, then republish.
 * Case 2: delete:mac → delete handler, then republish.
 * Invalid JSON → log and ignore. Does not block event loop.
 */

const mvsDbSyncService = require('../services/mvsDbSyncService');
const mvsDeleteService = require('../services/mvsDeleteService');
const mvsRepublishService = require('../services/mvsRepublishService');
const logger = require('../utils/logger');

const DELETE_PREFIX = 'delete:';

/**
 * Extract hubId from topic hub/{hubId}/send
 * @param {string} topic
 * @returns {string|null}
 */
function extractHubId(topic) {
  if (typeof topic !== 'string' || !topic) return null;
  const parts = topic.split('/');
  if (parts.length >= 2 && parts[0] === 'hub') return parts[1];
  return null;
}

/**
 * Handle one MQTT message. Runs async without blocking.
 * @param {string} topic - e.g. hub/b8:f8:62:f3:2e:9e/send
 * @param {Buffer|string} message
 * @param {function(string, string|object, object): boolean} publish - (topic, payload, opts) => boolean
 */
function handle(topic, message, publish) {
  const hubId = extractHubId(topic);
  if (!hubId) {
    logger.warn('[MVS Handler] Invalid topic, missing hubId', { topic });
    return;
  }

  let payloadStr;
  try {
    payloadStr = Buffer.isBuffer(message) ? message.toString('utf8') : String(message);
  } catch (e) {
    logger.error('[MVS Handler] Message decode error', { topic, error: e.message });
    return;
  }

  const trimmed = payloadStr.trim();

  if (trimmed.startsWith(DELETE_PREFIX)) {
    const mac = trimmed.slice(DELETE_PREFIX.length).trim();
    setImmediate(async () => {
      try {
        await mvsDeleteService.handleDelete(hubId, mac);
        await mvsRepublishService.republish(hubId, publish);
      } catch (err) {
        logger.error('[MVS Handler] Delete/repub error', { hubId, mac, error: err.message });
      }
    });
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (_) {
    logger.warn('[MVS Handler] Invalid JSON, ignoring', { topic, preview: trimmed.slice(0, 80) });
    return;
  }

  if (!parsed || typeof parsed !== 'object') {
    return;
  }

  if (!Array.isArray(parsed.pending_devices)) {
    return;
  }

  setImmediate(async () => {
    try {
      await mvsDbSyncService.syncPendingDevices(hubId, parsed.pending_devices);
      await mvsRepublishService.republish(hubId, publish);
    } catch (err) {
      logger.error('[MVS Handler] Sync/repub error', { hubId, error: err.message, stack: err.stack });
    }
  });
}

module.exports = {
  handle,
  extractHubId,
};
