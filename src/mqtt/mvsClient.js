'use strict';

/**
 * MQTT client for MVS sync: subscribes to hub/+/send, handles pending_devices and delete:mac.
 * Uses Prisma for DB. Republishes to hub/{hubId}/receive with QoS 1.
 */

const mqtt = require('mqtt');
const mvsSyncHandler = require('./mvsSyncHandler');
const logger = require('../utils/logger');

class MvsMqttClient {
  constructor(options = {}) {
    this.client = null;
    this._connected = false;
    this.brokerUrl = options.brokerUrl || 'mqtt://127.0.0.1:1883';
    this.username = options.username || '';
    this.password = options.password || '';
  }

  connect() {
    const opts = {
      clientId: `backend_mvs_${Date.now()}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    };
    if (this.username) opts.username = this.username;
    if (this.password) opts.password = this.password;

    this.client = mqtt.connect(this.brokerUrl, opts);

    this.client.on('connect', () => {
      this._connected = true;
      logger.info('[MVS MQTT] Connected', { broker: this.brokerUrl });
      this.client.subscribe('hub/+/send', { qos: 1 }, (err) => {
        if (err) logger.error('[MVS MQTT] Subscribe error hub/+/send', { error: err.message });
        else logger.info('[MVS MQTT] Subscribed to hub/+/send');
      });
    });

    this.client.on('close', () => {
      this._connected = false;
      logger.info('[MVS MQTT] Connection closed');
    });

    this.client.on('reconnect', () => {
      logger.info('[MVS MQTT] Reconnecting...');
    });

    this.client.on('error', (err) => {
      logger.error('[MVS MQTT] Error', { message: err.message });
    });

    this.client.on('message', (topic, message) => {
      this._onMessage(topic, message);
    });
  }

  _onMessage(topic, message) {
    const publish = (t, payload, opts = {}) => {
      if (!this.client || !this._connected) return false;
      const data = typeof payload === 'object' && payload !== null && !Buffer.isBuffer(payload)
        ? JSON.stringify(payload)
        : String(payload);
      try {
        this.client.publish(t, data, { qos: 1, retain: false, ...opts });
        return true;
      } catch (e) {
        return false;
      }
    };
    mvsSyncHandler.handle(topic, message, publish);
  }

  isConnected() {
    return this._connected;
  }

  shutdown() {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this._connected = false;
      logger.info('[MVS MQTT] Client shutdown');
    }
  }
}

module.exports = MvsMqttClient;
