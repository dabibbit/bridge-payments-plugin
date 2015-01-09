const BridgePaymentService = require(__dirname + '/../lib/services/bridge_payment_service.js');

function BridgePaymentController(options) {
  this.gatewayd = options.gatewayd;
  this.bridgePaymentService = new BridgePaymentService(options);
}

BridgePaymentController.prototype.post = function (request, response) {
  var _this = this;
  _this.bridgePaymentService.acceptQuote(request.body)
    .then(function(payment) {
      response
        .status(200)
        .send({
          success: true,
          bridge_payments: [payment]
        });
    })
    .error(function (error) {
      response
        .status(400)
        .send({
          success: false,
          errors: [error.message]
        });
    });
};

module.exports = BridgePaymentController;