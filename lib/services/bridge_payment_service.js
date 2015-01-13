const Promise            = require('bluebird');
const http               = Promise.promisifyAll(require('superagent'));
const BridgeQuoteService = require(__dirname + '/bridge_quote_service.js');
const RippleQuoteService = require(__dirname + '/ripple_quote_service.js');

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
          var ripplePaymentRequest = _this._buildRipplePaymentRequest(bridgePayment.wallet_payment, bridgePayment.source.address, 'to-ripple');
          ripplePaymentRequest.state = 'outgoing';
          ripplePaymentRequest.invoice_id = destinationBridgePayment.wallet_payment.invoice_id;
          var externalPaymentRequest = _this._buildExternalPaymentRequest(addresses.source.address, addresses.source.prefix, bridgePayment.destination_amount);
          _this.gatewayd.api.createGatewayTransaction({
            direction: 'to-ripple',
            ripple: ripplePaymentRequest,
            external: externalPaymentRequest
          }).then(function(gatewayTransaction) {
            bridgePayment.state = 'invoice';
            bridgePayment.wallet_payment.invoice_id = gatewayTransaction.rippleTransaction.invoice_id;
            // do something with gatewayTransaction?
            resolve(bridgePayment)
          }).error(function(error) {
            _this.gatewayd.logger.error('[bridge_payment_service,js:processSourcePayment] Error creating gateway transaction : '+ error);
            return reject(new Error('Internal Server Error'));
          });
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
      var ripplePaymentRequest = _this._buildRipplePaymentRequest(bridgePayment.wallet_payment, bridgePayment.source.address, 'from-ripple');
      ripplePaymentRequest.state = 'invoice';
      var externalPaymentRequest = _this._buildExternalPaymentRequest(addresses.destination.address, addresses.destination.prefix, bridgePayment.destination_amount);
      _this.gatewayd.api.createGatewayTransaction({
        direction: 'from-ripple',
        ripple: ripplePaymentRequest,
        external: externalPaymentRequest
      }).then(function(gatewayTransaction) {
        bridgePayment.wallet_payment.invoice_id = gatewayTransaction.rippleTransaction.invoice_id;
        bridgePayment.state = 'invoice';
        resolve(bridgePayment)
      }).error(function(error) {
        _this.gatewayd.logger.error('[bridge_payment_service,js:processDestinationPayment] Error creating gateway transaction : ' + error);
        return reject(new Error('Internal Server Error'));
      });
    } catch (error) {
      _this.gatewayd.logger.error('[bridge_payment_service,js:processDestinationPayment] Internal server error: '+ error);
      return reject(new Error('Internal Server Error'));
    }
  });
};

BridgePaymentService.prototype._buildRipplePaymentRequest = function (wallet_payment, address, direction) {
  var dtIndex = wallet_payment.destination.indexOf('=');
  var ripplePaymentRequest = {
    destination_amount: wallet_payment.primary_amount.amount,
    destination_currency: wallet_payment.primary_amount.currency,
    destination_address: wallet_payment.destination.substr(0, wallet_payment.destination.indexOf('?dt=')),
    source_address: address
  };
  if (direction === 'from-ripple') {
    ripplePaymentRequest.destination_tag = dtIndex > 0 ? wallet_payment.destination.substr(dtIndex+1) : '';
  }
  return ripplePaymentRequest;
};

BridgePaymentService.prototype._buildExternalPaymentRequest = function (address, type, destination_amount) {
  return {
    address: address,
    type: type,
    amount: destination_amount.amount,
    currency: destination_amount.currency
  };
};

BridgePaymentService.prototype._postBridgePaymentToDestination = function (domain, bridgePayment) {
  var _this = this;
  return new Promise(function(resolve, reject) {
    if (domain === _this.gatewayd.config.get('DOMAIN')) {
      _this.bridgeQuoteService.getAddressDetails({
        sender:   bridgePayment.source.uri,
        receiver: bridgePayment.destination.uri
      }).then(function(addresses) {
        return _this.processDestinationPayment({addresses: addresses, bridgePayment: bridgePayment});
      }).error(reject);
    } else {
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
    }
  });
};

module.exports = BridgePaymentService;
