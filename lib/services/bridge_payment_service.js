const Promise            = require('bluebird');
const http               = Promise.promisifyAll(require('superagent'));
const validator          = require('validator');
const BridgeQuoteService = require(__dirname + '/bridge_quote_service.js');
const RippleQuoteService = require(__dirname + '/ripple_quote_service.js');
const BridgePayment      = require(__dirname + '/../bridge_payment.js');

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

BridgePaymentService.prototype.acceptQuote = function(options) {
  var _this = this;
  // TODO: Validate everything
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

BridgePaymentService.prototype.processSourcePayment = function(options) {
  var _this = this;
  var bridgePayment = options.bridgePayment;
  var addresses = options.addresses;
  return new Promise(function(resolve, reject) {
    // Persist 'pending' rippleTransaction
    try {
      http
        .post('https://' + addresses.destination.domain +'/v1/bridge_payments/')
        .send({
          bridge_payments: [bridgePayment]
        }).endAsync().then(function(response) {
          if (!response.body.success || !response.body.bridge_payments || !response.body.bridge_payments.length > 0) {
            _this.gatewayd.logger.error('[bridge_payment_service,js:processSourcePayment] Error sending bridge payment to destination gateway');
            return reject(new Error('Error sending bridge payment to destination gateway'));
          }
          var ripplePaymentRequest = _this.parseRipplePaymentDetails(bridgePayment);
          ripplePaymentRequest.direction = 'to-ripple';
          ripplePaymentRequest.state = 'outgoing';
          _this.gatewayd.api.createRipplePayment(ripplePaymentRequest)
            .then(function(ripplePayment){
              bridgePayment.wallet_payment.invoice_id = ripplePayment.invoice_id;
              _this.gatewayd.api.createExternalPayment({
                address: addresses.source.address,
                type: addresses.source.prefix,
                amount: bridgePayment.wallet_payment.primary_amount.amount,
                currency: bridgePayment.wallet_payment.primary_amount.currency,
                status: 'invoice'
              }).then(function(externalTransaction) {
                resolve(bridgePayment);
              }).error(reject);
            }).error(reject);
        }).error(function(error) {
          _this.gatewayd.logger.error('[bridge_payment_service,js:processSourcePayment] Error sending bridge payment to destination gateway', error);
          return reject(new Error('Internal Server Error'));
        });

    } catch (error) {
      _this.gatewayd.logger.error('[bridge_payment_service,js:processSourcePayment] Internal server error', error);
      return reject(new Error('Internal Server Error'));
    }
  });
};

BridgePaymentService.prototype.processDestinationPayment = function(options) {
  var _this = this;
  var bridgePayment = options.bridgePayment;
  var addresses = options.addresses;
  return new Promise(function(resolve, reject) {
    // Persist 'pending' rippleTransaction
    try {
      var ripplePaymentRequest = _this.parseRipplePaymentDetails(bridgePayment);
      ripplePaymentRequest.direction = 'from-ripple';
      ripplePaymentRequest.state = 'invoice';
      _this.gatewayd.api.createRipplePayment(ripplePaymentRequest)
        .then(function(ripplePayment){
          // TODO: Sign this or something
          bridgePayment.wallet_payment.invoice_id = ripplePayment.invoice_id;
          _this.gatewayd.api.createExternalPayment({
            address: addresses.destination.address,
            type: addresses.destination.prefix,
            amount: bridgePayment.destination_amount.amount,
            currency: bridgePayment.destination_amount.currency,
            status: 'outgoing'
          }).then(function(externalTransaction) {
            resolve(bridgePayment);
          }).error(reject);
        }).error(reject);
    } catch (error) {
      _this.gatewayd.logger.error('[bridge_payment_service,js:processDestinationPayment] Internal server error', error);
      return reject(new Error('Internal Server Error)'));
    }
  });
};

BridgePaymentService.prototype.parseRipplePaymentDetails = function(bridgePayment) {
  var dtIndex = bridgePayment.wallet_payment.destination.indexOf('=');
  return {
    destination_amount: bridgePayment.wallet_payment.primary_amount.amount,
    destination_currency: bridgePayment.wallet_payment.primary_amount.currency,
    destination_address: bridgePayment.wallet_payment.destination.substr(0, bridgePayment.wallet_payment.destination.indexOf('?dt=')),
    source_address: bridgePayment.source.address,
    destination_tag: dtIndex > 0 ? bridgePayment.wallet_payment.destination.substr(dtIndex+1) : ''
  };
};

module.exports = BridgePaymentService;
