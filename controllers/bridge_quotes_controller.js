const BridgeQuotesService = require(__dirname + '/../lib/services/bridge_quotes_service.js');

function BridgeQuotesController(options) {
  this.gatewayd = options.gatewayd;
  this.bridgeQuotesService = new BridgeQuotesService(options);
}

BridgeQuotesController.prototype.getQuotes = function getQuotes(request, response) {
  var _this = this;
  _this.bridgeQuotesService.process(request.params)
    .then(function(quote) {
      response
        .status(200)
        .send({
          success: true,
          bridge_payments: [quote]
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

module.exports = BridgeQuotesController;