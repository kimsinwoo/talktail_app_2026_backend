'use strict';

/**
 * MVS Delete handler: delete:{mac} command. (Sequelize)
 */

const db = require('../models');
const logger = require('../utils/logger');

function normalizeMac(mac) {
  return typeof mac === 'string' ? mac.trim().toLowerCase() : '';
}

async function handleDelete(hubId, macAddress) {
  const { MvsDevice } = db;
  const mac = normalizeMac(macAddress);
  if (!mac) return false;

  const device = await MvsDevice.findOne({
    where: { hubId, macAddress: mac },
  });

  if (!device) return false;

  await MvsDevice.update(
    { MVS: false, length: null, firstTime: null },
    { where: { id: device.id } }
  );

  logger.info('[MVS Delete] Device cleared', { hubId, macAddress: mac });
  return true;
}

module.exports = {
  handleDelete,
  normalizeMac,
};
