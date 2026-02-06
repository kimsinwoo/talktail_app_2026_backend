module.exports = {
  apps: [
    {
      name: 'talktail-backend',
      cwd: __dirname,
      script: 'src/server.js',
      args: '--host 0.0.0.0',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOST: '0.0.0.0',
      },
      time: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};

