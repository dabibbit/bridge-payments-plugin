const BridgePayment = require(__dirname + '/../bridge_payment.js');
const Promise = require('bluebird');
const validator = require('validator');

function BridgeQuotesService(options) {
  this.gatewayd = options.gatewayd;
}

BridgeQuotesService.prototype.generateQuotes = function generateQuotes(requestParams) {
  var _this = this;
  return new Promise(function(resolve, reject) {
    _this._validateRequest(requestParams)
      .then(function(validatedRequest) {
        var bridgePayment = new BridgePayment({
          state: 'quote',
          expiration: new Date((new Date()).getTime() + 60 * 60000).toISOString(), // 60 mins
          source: _this._getAddressDetails(validatedRequest.sender),
          wallet_payment: {},
          destination: _this._getAddressDetails(validatedRequest.receiver),
          destination_amount: {
            amount: validatedRequest.amount.value,
            currency: validatedRequest.amount.currency,
            issuer: _this.gatewayd.config.get('COLD_WALLET')
          },
          parties: {}
        });
        resolve(bridgePayment);
      })
      .error(reject);
  });
};

BridgeQuotesService.prototype._validateRequest = function _validateRequest(requestParams) {
  var _this = this;
  return new Promise(function (resolve, reject) {
    var sender = requestParams.sender;
    if (!sender) {
      reject(new Error('Missing sender'));
    }
    var receiver = requestParams.receiver;
    if (!receiver) {
      reject(new Error('Missing destination'));
    }
    _this._parseAmount(requestParams.amount)
      .then(function(amount) {
        resolve({
          sender: sender,
          receiver: receiver,
          amount: amount
        })
      })
      .error(reject);
  });
};

BridgeQuotesService.prototype._parseAmount = function _parseAmount(amountParam) {
  return new Promise(function (resolve, reject) {
    if (!amountParam) {
      reject(new Error('Missing Amount'));
    }

    var amountArray = amountParam.split('+');
    if (amountArray.length < 2) {
      reject(new Error('Payment formatting error'));
    }

    var value = amountArray[0];
    var currency = amountArray[1];
    if (!value) {
      reject(new Error('Missing amount'));
    }
    if (!validator.isNumeric(value)) {
      reject(new Error('Invalid amount'));
    }
    if (!currency) {
      reject(new Error('Missing currency'));
    }
    if (!validator.isAlpha(currency) || !validator.isLength(currency, 3, 3)) {
      reject(new Error('Invalid currency code'));
    }

    resolve({
      value: value,
      currency: currency
    });
  });
};

BridgeQuotesService.prototype._getAddressDetails = function _getAddressDetails(address) {
  // Logic to determine more details
  return {
    uri: address
  };
};


module.exports = BridgeQuotesService;
