'use strict';

/**
 * MVS Republish: after sync or delete, publish current pending_devices for hub (MVS=true only). (Sequelize)
 */

const db = require('../models');
const logger = require('../utils/logger');

function formatFirstTime(d) {
  if (d == null || !(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

async function buildPayload(hubId) {
  const { MvsDevice } = db;
  const devices = await MvsDevice.findAll({
    where: { hubId, MVS: true },
    attributes: ['macAddress', 'length', 'firstTime'],
  });

  const pending_devices = devices.map((d) => ({
    mac_address: d.macAddress,
    data_count: d.length != null ? d.length : 0,
    first_time: formatFirstTime(d.firstTime) || '',
  }));

  return { pending_devices };
}

async function republish(hubId, publish) {
  if (typeof publish !== 'function') {
    logger.error('[MVS Republish] publish function not provided');
    return false;
  }
  const payload = await buildPayload(hubId);
  const topic = `hub/${hubId}/receive`;
  const payloadStr = JSON.stringify(payload);
  const ok = publish(topic, payloadStr, { qos: 1 });
  if (ok) {
    logger.info('[MVS Republish] Published', { hubId, deviceCount: payload.pending_devices.length });
  } else {
    logger.warn('[MVS Republish] Publish failed (client not connected?)', { hubId });
  }
  return ok;
}

module.exports = {
  buildPayload,
  republish,
  formatFirstTime,
};
