/**
 * IDOR prevention: ensure Device/Hub/Pet belongs to the authenticated user.
 * Use after verifyToken. Attach to routes that use :deviceAddress, :hubAddress, :petId.
 */

const db = require('../models');
const { AppError } = require('./errorHandler');

/**
 * Require that the device in req.params[paramName] is owned by req.user.email.
 * Sets req.device on success. Use 404 for "not found" to avoid enumeration.
 */
function requireDeviceOwnership(paramName = 'deviceAddress') {
  return async function (req, res, next) {
    const address = req.params[paramName];
    if (!address) {
      return next(new AppError('디바이스 식별자가 필요합니다.', 400));
    }
    const device = await db.Device.findOne({
      where: { address, user_email: req.user?.email },
      attributes: ['address', 'user_email'],
    });
    if (!device) {
      return next(new AppError('디바이스를 찾을 수 없습니다.', 404));
    }
    req.device = device;
    next();
  };
}

/**
 * Require that the hub in req.params[paramName] is owned by req.user.email.
 * Sets req.hub on success.
 */
function requireHubOwnership(paramName = 'hubAddress') {
  return async function (req, res, next) {
    const address = req.params[paramName];
    if (!address) {
      return next(new AppError('허브 식별자가 필요합니다.', 400));
    }
    const hub = await db.Hub.findOne({
      where: { address, user_email: req.user?.email },
      attributes: ['address', 'user_email'],
    });
    if (!hub) {
      return next(new AppError('허브를 찾을 수 없습니다.', 404));
    }
    req.hub = hub;
    next();
  };
}

/**
 * Require that the pet in req.params[paramName] is owned by req.user.email.
 * Sets req.pet on success.
 */
function requirePetOwnership(paramName = 'petId') {
  return async function (req, res, next) {
    const id = req.params[paramName];
    if (!id) {
      return next(new AppError('펫 식별자가 필요합니다.', 400));
    }
    const pet = await db.Pet.findOne({
      where: { id, user_email: req.user?.email },
      attributes: ['id', 'user_email'],
    });
    if (!pet) {
      return next(new AppError('펫을 찾을 수 없습니다.', 404));
    }
    req.pet = pet;
    next();
  };
}

module.exports = {
  requireDeviceOwnership,
  requireHubOwnership,
  requirePetOwnership,
};
