// Karma for the board's reach test (`npm run test:reach` in the frontend runs it in one window)): headless Chrome or Edge (CHROME_BIN, or the Edge that comes with Windows), at the window size in WINDOW (width x height, 1400x800 by default).
// The size of the window decides whether the store is beside the picture (1200 px or wider) or below it, so the test is run once for each.
const fs = require('fs');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!process.env.CHROME_BIN && fs.existsSync(edge)) process.env.CHROME_BIN = edge;
const os = require('os');
const path = require('path');
const [width, height] = (process.env.WINDOW || '1400x800').split('x');

module.exports = (config) => {
  config.set({
    frameworks: ['jasmine'],
    plugins: [require('karma-jasmine'), require('karma-chrome-launcher')],
    customLaunchers: {
      Sized: { base: 'ChromeHeadless', flags: [`--user-data-dir=${path.join(os.tmpdir(), 'karma-reach-profile')}`, `--window-size=${width},${height}`, '--no-sandbox', '--force-device-scale-factor=1'] },
    },
    browsers: ['Sized'],
    reporters: ['progress'],
    singleRun: true,
    restartOnFileChange: false,
  });
};
