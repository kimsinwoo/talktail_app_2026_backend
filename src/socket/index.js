const jwt = require('jsonwebtoken');
const db = require('../models');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Socket.IO 핸들러
 * hub_project/back/socket/index.js를 기반으로 보안 강화
 */
module.exports = (io) => {
  // 인증 미들웨어
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      if (!config.jwt.secret) {
        logger.error('❌ CRITICAL: JWT_SECRET is not set in Socket.IO middleware');
        return next(new Error('Authentication error: Server configuration error'));
      }

      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await db.User.findByPk(decoded.email);

      if (!user || !user.isActive) {
        return next(new Error('Authentication error: Invalid or inactive user'));
      }

      socket.user = {
        email: user.email,
        name: user.name,
        role: user.role || 'user',
      };

      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Authentication error: Token expired'));
      }
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.user.name} (${socket.id})`);

    const roomName = `user:${socket.user.email}`;
    socket.join(roomName);

    const room = io.sockets.adapter.rooms.get(roomName);
    const socketCount = room ? room.size : 0;
    logger.info(`User joined room: "${roomName}"`, {
      roomExists: !!room,
      socketCount,
      totalRooms: io.sockets.adapter.rooms.size,
    });

    socket.emit('connected', {
      message: '소켓 연결 성공',
      user: socket.user,
    });

    /**
     * CONTROL_REQUEST: 프론트에서 기기 제어 명령 전송
     */
    socket.on('CONTROL_REQUEST', async (data) => {
      try {
        const { hubId, deviceId, command, requestId } = data;

        logger.info('CONTROL_REQUEST received', {
          hubId,
          deviceId,
          command: JSON.stringify(command),
          requestId,
          user: socket.user.email,
        });

        if (!hubId || !deviceId || !command) {
          socket.emit('CONTROL_RESULT', {
            requestId: requestId || `req_${Date.now()}`,
            success: false,
            error: 'hubId, deviceId, command는 필수입니다.',
          });
          return;
        }

        // CONTROL_ACK 전송
        socket.emit('CONTROL_ACK', {
          requestId: requestId || `req_${Date.now()}`,
          hubId,
          deviceId,
          command,
          timestamp: new Date().toISOString(),
        });

        // MQTT 서비스 가져오기
        const mqttService = io.mqttService;
        if (!mqttService || !mqttService.isConnected()) {
          socket.emit('CONTROL_RESULT', {
            requestId: requestId || `req_${Date.now()}`,
            hubId,
            deviceId,
            success: false,
            error: 'MQTT 서비스가 연결되지 않았습니다.',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // 허브 소유권 확인
        const hub = await db.Hub.findByPk(hubId);
        if (!hub || hub.user_email !== socket.user.email) {
          socket.emit('CONTROL_RESULT', {
            requestId: requestId || `req_${Date.now()}`,
            hubId,
            deviceId,
            success: false,
            error: '허브에 대한 권한이 없습니다.',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // 허브 토픽 모드에 맞는 receive 토픽 선택
        const receiveTopic =
          typeof mqttService.getHubReceiveTopic === 'function'
            ? mqttService.getHubReceiveTopic(hubId)
            : `hub/${hubId}/receive`;

        // 명령 처리 (hub_project/back/socket/index.js 로직 참고)
        if (command.action === 'connect_devices') {
          const topic = receiveTopic;
          const payload = 'connect:devices';
          const success = mqttService.publish(topic, payload, { qos: 1, retain: false });

          socket.emit('CONTROL_RESULT', {
            requestId: requestId || `req_${Date.now()}`,
            hubId,
            deviceId,
            success,
            data: { command },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (command.action === 'blink' && command.mac_address) {
          const topic = receiveTopic;
          const payload = `blink:${command.mac_address}`;
          const success = mqttService.publish(topic, payload, { qos: 1, retain: false });

          socket.emit('CONTROL_RESULT', {
            requestId: requestId || `req_${Date.now()}`,
            hubId,
            deviceId,
            success,
            data: { command },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (command.action === 'start_measurement') {
          const topic = receiveTopic;
          const payload = command.raw_command || `start:${deviceId}`;
          const success = mqttService.publish(topic, payload, { qos: 1, retain: false });

          socket.emit('CONTROL_RESULT', {
            requestId: requestId || `req_${Date.now()}`,
            hubId,
            deviceId,
            success,
            data: { command },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (command.action === 'stop_measurement') {
          const topic = receiveTopic;
          const payload = command.raw_command || `stop:${deviceId}`;
          const success = mqttService.publish(topic, payload, { qos: 1, retain: false });

          socket.emit('CONTROL_RESULT', {
            requestId: requestId || `req_${Date.now()}`,
            hubId,
            deviceId,
            success,
            data: { command },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (command.raw_command === 'state:hub' || command.action === 'check_hub_state') {
          const topic = receiveTopic;
          const payload = 'state:hub';
          const success = mqttService.publish(topic, payload, { qos: 1, retain: false });

          socket.emit('CONTROL_RESULT', {
            requestId: requestId || `req_${Date.now()}`,
            hubId,
            deviceId,
            success,
            data: { command, message: '상태 확인 명령이 전송되었습니다.' },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // 일반 MQTT 명령
        try {
          const response = await mqttService.sendCommand(hubId, deviceId, command, 2000);
          logger.info('Command sent successfully', { hubId, deviceId });
        } catch (error) {
          logger.error('Failed to send command', { hubId, deviceId, error: error.message });
          socket.emit('CONTROL_RESULT', {
            requestId: requestId || `req_${Date.now()}`,
            hubId,
            deviceId,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        logger.error('CONTROL_REQUEST error:', error);
        socket.emit('CONTROL_RESULT', {
          requestId: data.requestId || `req_${Date.now()}`,
          success: false,
          error: '명령 처리 중 오류가 발생했습니다.',
        });
      }
    });

    /**
     * 연결 해제 처리
     */
    socket.on('disconnect', (reason) => {
      logger.info(`User disconnected: ${socket.user.name} (${socket.id}) - Reason: ${reason}`);
    });

    /**
     * 에러 처리
     */
    socket.on('error', (error) => {
      logger.error('Socket error:', error);
    });
  });

  return io;
};
