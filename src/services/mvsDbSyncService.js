'use strict';

/**
 * MVS DB Sync Service (Sequelize)
 * Handles pending_devices payload: bulk update in a single transaction.
 */

const db = require('../models');
const logger = require('../utils/logger');

function parseFirstTime(s) {
  if (s == null || typeof s !== 'string' || !s.trim()) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeMac(mac) {
  return typeof mac === 'string' ? mac.trim().toLowerCase() : '';
}

async function syncPendingDevices(hubId, pendingDevices) {
  const { MvsDevice, sequelize } = db;
  const list = Array.isArray(pendingDevices) ? pendingDevices : [];
  const inPayloadMacs = new Set(
    list.map((d) => normalizeMac(d && d.mac_address)).filter((mac) => mac.length > 0)
  );

  const payloadByMac = new Map();
  for (const p of list) {
    const mac = normalizeMac(p && p.mac_address);
    if (!mac) continue;
    payloadByMac.set(mac, {
      data_count: typeof (p && p.data_count) === 'number' ? p.data_count : null,
      first_time: parseFirstTime(p && p.first_time),
    });
  }

  await sequelize.transaction(async (t) => {
    const hubDevices = await MvsDevice.findAll({
      where: { hubId },
      attributes: ['id', 'macAddress', 'MVS'],
      transaction: t,
    });

    const idsToSetFalse = hubDevices
      .filter((d) => d.MVS && !inPayloadMacs.has(normalizeMac(d.macAddress)))
      .map((d) => d.id);

    if (idsToSetFalse.length > 0) {
      await MvsDevice.update(
        { MVS: false, length: null, firstTime: null },
        { where: { id: idsToSetFalse }, transaction: t }
      );
    }

    const toSetMvsTrue = [];
    for (const mac of inPayloadMacs) {
      const info = payloadByMac.get(mac) || {};
      toSetMvsTrue.push({
        mac,
        firstTime: info.first_time ?? null,
        length: info.data_count != null ? info.data_count : null,
      });
    }

    const upserts = toSetMvsTrue.map(({ mac, firstTime, length }) => {
      const dev = hubDevices.find((d) => normalizeMac(d.macAddress) === mac);
      return dev
        ? MvsDevice.update(
            { MVS: true, length, firstTime },
            { where: { id: dev.id }, transaction: t }
          )
        : MvsDevice.create(
            { macAddress: mac, hubId, MVS: true, length, firstTime },
            { transaction: t }
          );
    });
    if (upserts.length > 0) await Promise.all(upserts);
  });

  logger.info('[MVS Sync] Synced hub', { hubId, inPayloadCount: inPayloadMacs.size });
}

module.exports = {
  syncPendingDevices,
  parseFirstTime,
  normalizeMac,
};
