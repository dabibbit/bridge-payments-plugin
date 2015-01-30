const BridgeQuotesController = require(__dirname + '/controllers/bridge_quotes_controller.js');
const BridgePaymentController = require(__dirname + '/controllers/bridge_payment_controller.js');

const express = require('express');

function BridgePaymentPlugin(options) {
  var router = new express.Router();

  var bridgeQuotesController = new BridgeQuotesController(options);
  var bridgePaymentController = new BridgePaymentController(options);

  router.get('/v1/bridge_payments/quotes/:sender/:receiver/:amount', bridgeQuotesController.getQuotes.bind(bridgeQuotesController));

  router.post('/v1/bridge_payments/', bridgePaymentController.payment.bind(bridgePaymentController));
  router.get('/v1/bridge_payments/status/:id', bridgePaymentController.paymentStatus.bind(bridgePaymentController));

  this.router = router;
}

module.exports = BridgePaymentPlugin;

