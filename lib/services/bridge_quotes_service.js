const BridgePayment = require(__dirname + '/../bridge_payment.js');
const Promise = require('bluebird');
const http = Promise.promisifyAll(require('superagent'));
const rippleName = require('ripple-name');
const validator = require('validator');

function BridgeQuotesService(options) {
  this.gatewayd = options.gatewayd;
}

BridgeQuotesService.prototype.generateQuotes = function generateQuotes(requestParams) {
  var _this = this;
  return new Promise(function(resolve, reject) {
    _this._validateRequest(requestParams)
      .then(function(validatedRequest) {
        Promise.props({
          source: _this._validateAndGenerateSource(validatedRequest.sender),
          destination: _this._validateAndGenerateDestination(validatedRequest.receiver)
        }).then(function(result) {
          var bridgePayment = new BridgePayment({
            state: 'quote',
            expiration: new Date((new Date()).getTime() + 60 * 60000).toISOString(), // 60 mins
            source: result.source,
            wallet_payment: {},
            destination: result.destination,
            destination_amount: {
              amount: validatedRequest.amount.value,
              currency: validatedRequest.amount.currency,
              issuer: _this.gatewayd.config.get('COLD_WALLET')
            },
            parties: {}
          });
          resolve(bridgePayment);
        }).error(reject);
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

BridgeQuotesService.prototype._validateAndGenerateSource = function _generateSource(address) {
  var _this = this;
  return new Promise(function(resolve, reject) {
    var addressArray = address.split(':');
    if (addressArray.length !== 2 || !addressArray[0] || addressArray[0] !== 'acct' || !addressArray[1]) {
      reject(new Error('Source formatting error'));
    }
    var externalAccountAddress = addressArray[1];
    _this.gatewayd.models.externalAccounts.find({where: {address: externalAccountAddress}})
      .success(function(externalAccount) {
        if (!externalAccount) {
          reject(new Error('Gateway user not found'));
        }
        resolve({
          uri: address
          // Potentially other information known by the Gateway
        })
      })
  });
};

BridgeQuotesService.prototype._validateAndGenerateDestination = function _validateAndGenerateDestination(address) {
  var _this = this;
  return new Promise(function(resolve, reject) {
    var addressArray = address.split(':');
    if (addressArray.length !== 2 || !addressArray[0] || (addressArray[0] !== 'acct' && addressArray[0] !== 'ripple') || !addressArray[1]) {
      reject(new Error('Invalid destination address'));
    }
    var prefix = addressArray[0];
    var destinationAddress = addressArray[1];

    if (prefix === 'ripple') {
      rippleName.lookup(destinationAddress)
        .then(function(user){
          if (!user.exists) {
            reject(new Error('Destination address is not a valid ripple address'));
          } else {
            resolve({
              uri: address
            });
          }
        })
        .error(reject);
    } else {
      // Can assume prefix begins with acct at this point
      var destinationArray = destinationAddress.split('@');
      if (destinationArray.length !== 2) {
        reject(new Error('Invalid destination address'));
      }
      var url = 'https://' + destinationArray[1] + '/.well-known/webfinger.json?resource=' + destinationAddress;
      console.log(url);
      http
        .get(url)
        .endAsync().then(function(response) {
          if (!response.body.aliases) {
            reject(new Error('Unable to webfinger destination address'));
          }
          var aliases = response.body.aliases;
          var rippleAlias = false;
          for (var i = 0; i < aliases; i++) {
            if (aliases[i].indexOf('ripple:')) {
              rippleAlias = true;
              break;
            }
          }
          if (!rippleAlias) {
            reject(new Error('Destination address does not contain ripple address alias'));
          }
          resolve({
            uri: address
          });
        }).error(function(error) {
          reject(new Error('Unable to webfinger destination address'));
        });
    }
  });
};


module.exports = BridgeQuotesService;
