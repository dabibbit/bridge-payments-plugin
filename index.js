const BridgeQuotesController = require(__dirname + '/controllers/bridge_quotes_controller.js');

const express = require('express');

function BridgePaymentPlugin(options) {
  var router = new express.Router();

  var bridgeQuotesController = new BridgeQuotesController(options);

  router.get('/v1/bridge_payments/quotes/:sender/:receiver/:amount', bridgeQuotesController.getQuotes.bind(bridgeQuotesController));

  this.router = router;
}

module.exports = BridgePaymentPlugin;

