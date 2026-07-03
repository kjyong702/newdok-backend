module.exports = {
  apps: [
    {
      name: 'newdok-dev',
      script: 'dist/src/main.js',
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'newdok-prod',
      script: 'dist/src/main.js',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
