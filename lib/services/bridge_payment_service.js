var Promise            = require('bluebird');
var _                  = require('lodash');
var http               = Promise.promisifyAll(require('superagent'));
var BridgeQuoteService = require(__dirname + '/bridge_quote_service.js');
var RippleQuoteService = require(__dirname + '/ripple_quote_service.js');

function BridgePaymentService(options) {
  this.gatewayd = options.gatewayd;
  this.bridgeQuoteService = new BridgeQuoteService({
    gatewayd:           options.gatewayd,
    rippleQuoteService: new RippleQuoteService({
      logger:        this.gatewayd.logger,
      rippleRestUrl: this.gatewayd.config.get('RIPPLE_REST_API')
    })
  });
}

BridgePaymentService.prototype.acceptQuote = function (options) {
  var _this = this;
  return new Promise(function(resolve, reject) {
    var bridgePayment = options.bridge_payments[0];
    _this.bridgeQuoteService.getAddressDetails({
      sender:   bridgePayment.source.uri,
      receiver: bridgePayment.destination.uri
    }).then(function(addresses) {
      if (addresses.source.domain === _this.gatewayd.config.get('DOMAIN')) {
        return _this.processSourcePayment({bridgePayment: bridgePayment, addresses: addresses})
          .then(function(processedBridgePayment) {
            resolve(processedBridgePayment);
          });
      } else if (addresses.destination.domain === _this.gatewayd.config.get('DOMAIN')) {
        return _this.processDestinationPayment({bridgePayment: bridgePayment, addresses: addresses})
          .then(function(processedBridgePayment) {
            resolve(processedBridgePayment);
          });
      } else {
        return reject(new Error('Sender and receiver not found on gateway'));
      }
    }).error(reject);
  });
};

BridgePaymentService.prototype.processSourcePayment = function (options) {
  var _this = this;
  var bridgePayment = options.bridgePayment;
  var addresses = options.addresses;
  return new Promise(function(resolve, reject) {
    try {
      _this._postBridgePaymentToDestination(addresses.destination.domain, bridgePayment)
        .then(function(destinationBridgePayment) {
          var ripplePaymentRequest = _this._buildRipplePaymentRequest(bridgePayment.wallet_payment, bridgePayment.destination_amount, bridgePayment.source.address, 'to-ripple');
          ripplePaymentRequest.state = 'outgoing';
          ripplePaymentRequest.invoice_id = destinationBridgePayment.wallet_payment.invoice_id;
          bridgePayment.destination_gateway_transaction_id = destinationBridgePayment.gateway_transaction_id;
          _this._buildExternalPaymentRequest('to', {
            address: addresses.source.address,
            type: addresses.source.prefix,
            amount: bridgePayment.wallet_payment.primary_amount.amount,
            currency: bridgePayment.wallet_payment.primary_amount.currency
          }).then(function(externalPaymentRequest) {
            _this.gatewayd.api.createGatewayTransaction({
              direction: 'to-ripple',
              ripple: ripplePaymentRequest,
              external: externalPaymentRequest
            }).then(function(gatewayTransaction) {
              bridgePayment.state = 'invoice';
              bridgePayment.wallet_payment.invoice_id = gatewayTransaction.rippleTransaction.invoice_id;
              bridgePayment.gateway_transaction_id = gatewayTransaction.id;
              resolve(bridgePayment)
            }).error(function(error) {
              _this.gatewayd.logger.error('[bridge_payment_service,js:processSourcePayment] Error creating gateway transaction : '+ error);
              return reject(new Error('Internal Server Error'));
            });
          }).error(reject);
        }).error(reject);
    } catch (error) {
      _this.gatewayd.logger.error('[bridge_payment_service,js:processSourcePayment] Internal server error: '+ error);
      return reject(new Error('Internal Server Error'));
    }
  });
};

BridgePaymentService.prototype.processDestinationPayment = function (options) {
  var _this = this;
  var bridgePayment = options.bridgePayment;
  var addresses = options.addresses;
  return new Promise(function(resolve, reject) {
    try {
      var ripplePaymentRequest = _this._buildRipplePaymentRequest(bridgePayment.wallet_payment, bridgePayment.destination_amount, bridgePayment.source.address, 'from-ripple');
      ripplePaymentRequest.state = 'invoice';
      _this._buildExternalPaymentRequest('from', {
        address: addresses.destination.address,
        type: addresses.destination.prefix,
        amount: bridgePayment.destination_amount.amount,
        currency: bridgePayment.destination_amount.currency
      }).then(function(externalPaymentRequest) {
        _this.gatewayd.api.createGatewayTransaction({
          direction: 'from-ripple',
          ripple: ripplePaymentRequest,
          external: externalPaymentRequest
        }).then(function(gatewayTransaction) {
          bridgePayment.wallet_payment.invoice_id = gatewayTransaction.rippleTransaction.invoice_id;
          bridgePayment.state = 'invoice';
          bridgePayment.gateway_transaction_id = gatewayTransaction.id;
          resolve(bridgePayment)
        }).error(function(error) {
          _this.gatewayd.logger.error('[bridge_payment_service,js:processDestinationPayment] Error creating gateway transaction : ' + error);
          return reject(new Error('Internal Server Error'));
        });
      }).error(reject);
    } catch (error) {
      _this.gatewayd.logger.error('[bridge_payment_service,js:processDestinationPayment] Internal server error: '+ error);
      return reject(new Error('Internal Server Error'));
    }
  });
};

BridgePaymentService.prototype.paymentStatus = function (paymentId) {
  var _this = this;
  return new Promise(function(resolve, reject) {
    try {
      _this.gatewayd.models.gatewayTransactions.find({
        where: {
          id: paymentId
        },
        include: [
          { model: _this.gatewayd.models.rippleTransactions, as: 'RipplePayment' },
          { model: _this.gatewayd.models.externalTransactions, as: 'ExternalPayment' }
        ]
      }).then(resolve)
        .error(function(error) {
          _this.gatewayd.logger.error('[bridge_payment_service,js:paymentStatus] Unable to fetch gateway transaction, error: '+ error);
          return reject(new Error('Internal Server Error'));
        });
    } catch (error) {
      _this.gatewayd.logger.error('[bridge_payment_service,js:processDestinationPayment] Internal server error: '+ error);
      return reject(new Error('Internal Server Error'));
    }
  });
};

BridgePaymentService.prototype._buildRipplePaymentRequest = function (wallet_payment, destination_amount, address, direction) {
  var dtIndex = wallet_payment.destination.indexOf('=');
  var ripplePaymentRequest = {
    destination_amount: destination_amount.amount,
    destination_currency: destination_amount.currency,
    source_amount: wallet_payment.primary_amount.amount,
    source_currency: wallet_payment.primary_amount.currency,
    destination_address: wallet_payment.destination.substr(0, wallet_payment.destination.indexOf('?dt=')),
    source_address: address
  };
  if (direction === 'from-ripple') {
    ripplePaymentRequest.destination_tag = dtIndex > 0 ? wallet_payment.destination.substr(dtIndex+1) : '';
  }
  return ripplePaymentRequest;
};

BridgePaymentService.prototype._buildExternalPaymentRequest = function (direction, payment) {
  var _this = this;
  var externalRequest = {
    address: payment.address,
    type: payment.type,
    amount: payment.amount,
    currency: payment.currency,
    source_amount: payment.amount,
    source_currency: payment.currency,
    destination_amount: payment.amount,
    destination_currency: payment.currency
  };
  return new Promise(function(resolve, reject) {
    return Promise.props({
      userAccount: _this.gatewayd.models.externalAccounts.find({where: {address: payment.address, type: payment.type}}),
      gatewayAccount: _this.gatewayd.models.externalAccounts.find({where: {type: 'gateway'}})
    }).then(function(result) {
      if (direction === 'to') {
        externalRequest = _.extend({
          source_account_id: result.userAccount.id,
          destination_account_id: result.gatewayAccount.id
        }, externalRequest);
      } else {
        externalRequest = _.extend({
          source_account_id: result.gatewayAccount.id,
          destination_account_id: result.userAccount.id
        }, externalRequest);
      }
      resolve(externalRequest);
    }).error(function(error) {
      _this.gatewayd.logger.error('[bridge_payment_service,js:_buildExternalPaymentRequest] Could not setup external_transaction', error);
      return reject(new Error('Could not setup external_transaction record'));
    });
  });
};

BridgePaymentService.prototype._postBridgePaymentToDestination = function (domain, bridgePayment) {
  var _this = this;
  if (domain === _this.gatewayd.config.get('DOMAIN')) {
    return _this.bridgeQuoteService.getAddressDetails({
      sender:   bridgePayment.source.uri,
      receiver: bridgePayment.destination.uri
    }).then(function(addresses) {
      return _this.processDestinationPayment({addresses: addresses, bridgePayment: bridgePayment});
    });
  } else {
    return new Promise(function (resolve, reject) {
      http
        .post('https://' + domain + '/v1/bridge_payments/')
        .send({
          bridge_payments: [bridgePayment]
        }).endAsync().then(function (response) {
          if (!response.body.success) {
            _this.gatewayd.logger.error('[bridge_payment_service,js:processSourcePayment] Error sending bridge payment to destination gateway');
            return reject(new Error('Error sending bridge payment to destination gateway'));
          } else {
            resolve(response.body.bridge_payments[0]);
          }
        }).error(function (error) {
          _this.gatewayd.logger.error('[bridge_payment_service,js:processSourcePayment] Error sending bridge payment to destination gateway: ' + error);
          return reject(new Error('Internal Server Error'));
        });
    });
  }
};

module.exports = BridgePaymentService;
