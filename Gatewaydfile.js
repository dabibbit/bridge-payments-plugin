var BridgePaymentPlugin = require('./');

module.exports = function(gatewayd) {
  var plugin = new BridgePaymentPlugin({
    gatewayd: gatewayd
  });
  gatewayd.server.use('/', plugin.router);
}

