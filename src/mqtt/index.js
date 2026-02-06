/**
 * Backend MQTT 서비스: hub/+/data 구독 → 일별 CSV 저장
 * server.js에서 require('./mqtt') 후 init(config) 호출
 */

const MQTTClient = require('./client');

let mqttClient = null;

function init(config) {
  if (mqttClient) {
    mqttClient.shutdown();
  }
  const brokerUrl = (config && config.mqtt && config.mqtt.brokerUrl) || 'mqtt://127.0.0.1:1883';
  const csvDir = (config && config.mqtt && config.mqtt.csvDir) || './data/csv';
  mqttClient = new MQTTClient({
    brokerUrl,
    csvDir,
    username: config && config.mqtt && config.mqtt.username,
    password: config && config.mqtt && config.mqtt.password,
  });
  mqttClient.connect();
  return mqttClient;
}

function getClient() {
  return mqttClient;
}

module.exports = {
  init,
  getClient,
  MQTTClient,
};
