/**
 * MQTT 클라이언트: hub/+/data 구독 후 수신 데이터를 일별 CSV로 저장
 * - Broker: mqtt://127.0.0.1:1883 (config에서 변경 가능)
 * - 구독: hub/+/data
 * - 수신 예: {"d":"c1:6e:72:89:5e:14-1,50.51,8,0,0.00,91\n","t":"2026-02-04 13:25:25"}
 */

const mqtt = require('mqtt');
const csvWriter = require('./csvWriter');

class MQTTClient {
  constructor(options = {}) {
    this.client = null;
    this._connected = false;
    this.brokerUrl = options.brokerUrl || 'mqtt://127.0.0.1:1883';
    this.csvDir = options.csvDir || './data/csv';
    this.username = options.username || '';
    this.password = options.password || '';
  }

  connect() {
    const opts = {
      clientId: `backend_${Date.now()}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    };
    if (this.username) opts.username = this.username;
    if (this.password) opts.password = this.password;

    this.client = mqtt.connect(this.brokerUrl, opts);

    this.client.on('connect', () => {
      this._connected = true;
      console.log('[MQTT] Connected to broker:', this.brokerUrl);
      this.client.subscribe('hub/+/data', { qos: 0 }, (err) => {
        if (err) console.error('[MQTT] Subscribe error hub/+/data:', err);
        else console.log('[MQTT] Subscribed to hub/+/data');
      });
    });

    this.client.on('close', () => {
      this._connected = false;
      console.log('[MQTT] Connection closed');
    });

    this.client.on('reconnect', () => {
      console.log('[MQTT] Reconnecting...');
    });

    this.client.on('error', (err) => {
      console.error('[MQTT] Error:', err.message);
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });
  }

  /**
   * 수신 메시지 처리: JSON 파싱 후 CSV 저장
   * 형식: {"d":"device_id-val1,val2,...","t":"2026-02-04 13:25:25"}
   */
  handleMessage(topic, message) {
    let payload;
    try {
      payload = Buffer.isBuffer(message) ? message.toString('utf8') : String(message);
    } catch (e) {
      console.error('[MQTT] Message decode error:', e);
      return;
    }

    let data;
    try {
      data = JSON.parse(payload);
    } catch (e) {
      console.error('[MQTT] Invalid JSON from', topic, payload.slice(0, 100));
      return;
    }

    const d = data.d;
    const t = data.t;
    if (d == null || d === '') {
      console.warn('[MQTT] Missing "d" field from', topic);
      return;
    }

    const timestamp = (t != null && String(t).trim()) ? String(t).trim() : new Date().toISOString().replace('T', ' ').slice(0, 19);
    const dateKey = csvWriter.getDateKey(timestamp);

    const raw = String(d).trim().replace(/\n/g, '');
    const dashIdx = raw.indexOf('-');
    let deviceId;
    let values;

    if (dashIdx >= 0) {
      deviceId = raw.slice(0, dashIdx).trim();
      const rest = raw.slice(dashIdx + 1).trim();
      values = rest ? rest.split(',').map((v) => v.trim()) : [];
    } else {
      deviceId = raw;
      values = [];
    }

    try {
      csvWriter.appendRow(this.csvDir, dateKey, timestamp, deviceId, values);
    } catch (err) {
      console.error('[MQTT] CSV write error:', err);
    }
  }

  isConnected() {
    return this._connected;
  }

  /** 허브 receive 토픽 (기존 socket/라우트 호환) */
  getHubReceiveTopic(hubId) {
    return `hub/${hubId}/receive`;
  }

  /** 메시지 발행 (기존 socket/라우트 호환) */
  publish(topic, message, options = {}) {
    if (!this.client || !this._connected) return false;
    const payload = typeof message === 'object' ? JSON.stringify(message) : String(message);
    try {
      this.client.publish(topic, payload, { qos: 1, retain: false, ...options });
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 명령 전송 (기존 socket 호환, 응답 대기 없이 발행만) */
  sendCommand(hubId, deviceId, command, timeout = 2000) {
    return new Promise((resolve) => {
      const topic = this.getHubReceiveTopic(hubId);
      const payload =
        command && (command.raw_command != null)
          ? command.raw_command
          : command && typeof command === 'object'
            ? JSON.stringify(command)
            : String(command);
      const ok = this.publish(topic, payload, { qos: 1, retain: false });
      setTimeout(() => resolve({ success: ok }), 100);
    });
  }

  shutdown() {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this._connected = false;
      console.log('[MQTT] Client shutdown');
    }
  }
}

module.exports = MQTTClient;
