const Promise            = require('bluebird');
const http               = Promise.promisifyAll(require('superagent'));
const validator          = require('validator');
const BridgePayment      = require(__dirname + '/../bridge_payment.js');
const RippleQuoteService = require(__dirname + '/ripple_quote_service.js');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function BridgeQuotesService(options) {
  this.gatewayd = options.gatewayd;
  this.rippleQuoteService = new RippleQuoteService({
    logger:        this.gatewayd.logger,
    rippleRestUrl: this.gatewayd.config.get('RIPPLE_REST_API')
  });
}

BridgeQuotesService.prototype.buildBridgeQuotes = function (options) {
  var _this = this;
  return new Promise(function(resolve, reject) {
    _this._validateRequest(options)
      .then(function(validatedRequest) {
        return _this.getAddressDetails({sender: validatedRequest.sender, receiver: validatedRequest.receiver})
          .then(function(addresses) {
            if (addresses.source.domain === _this.gatewayd.config.get('DOMAIN')) {
              return _this.buildSenderBridgeQuote({
                addresses: addresses,
                amount:    validatedRequest.amount
              }).then(function(bridgeQuote) {
                resolve(_this.combineBridgeQuoteRippleQuotes({
                  bridgeQuote: bridgeQuote
                }));
              });
            } else if (addresses.destination.domain === _this.gatewayd.config.get('DOMAIN')) {
              return _this.buildReceiverBridgeQuote({
                addresses: addresses,
                amount:    validatedRequest.amount
              }).then(function(bridgeQuote) {
                resolve([bridgeQuote]);
              });
            } else {
              // TODO: English
              return reject(new Error('Sender and receiver not found on gateway'));
            }
          }).error(reject);
      });
  });
};

/**
 *  Finds all available rippleQuotes for a bridgeQuote and returns an array of available BridgePayments that represent
 *  the combined bridgeQuote and rippleQuotes
 *
 *  @param {Object} options                     - Holds various options
 *  @param {String}  [options.bridgeQuote]      - BridgeQuote to combine rippleQuote with

 *  @promise {Object}
 *    @resolve {Array} Array of possible BridgePayments
 *    @reject  {Error}
 */
BridgeQuotesService.prototype.combineBridgeQuoteRippleQuotes = function(options) {
  var _this = this;
  var baseQuote = options.bridgeQuote;
  return new Promise(function(resolve, reject) {
    _this.rippleQuoteService.build({
      source: {
        address: _this.gatewayd.config.get('HOT_WALLET').address
      },
      destination: {
        // Remove the destination tag on the address
        address: baseQuote.wallet_payment.destination.replace(/\?dt.*/, ''),
        amount: baseQuote.wallet_payment.primary_amount.amount,
        currency: baseQuote.wallet_payment.primary_amount.currency
      }
    }).then(function(rippleQuotes) {
      var bridgeQuotes = [];
      for (var i = 0; i < rippleQuotes.length; i++) {
        var rippleQuote = rippleQuotes[i];
        var bridgeQuote = new BridgePayment(baseQuote);
        bridgeQuote.wallet_payment.primary_amount.amount = rippleQuote.source_amount.value;
        bridgeQuote.wallet_payment.primary_amount.currency = rippleQuote.source_amount.currency;
        bridgeQuote.created = new Date().toISOString();
        bridgeQuote.state = 'quote';
        // Add id
        bridgeQuotes.push(bridgeQuote);
      }
      resolve(bridgeQuotes);
    }).error(reject);
  })
};

/**
 *  Finds the external account record associated with the source address and returns a BridgePayment with the
 *  gateway cold_wallet address as the destination_amount.issuer and fetches a bridgeQuote from the destination gateway
 *  and appends the wallet_payment and destination from that to the returned BridgePayment
 *
 *  @param {Object} options                                    - Holds various options
 *  @param {String}  [options.addresses.source.federated]      - Source account in federation format
 *  @param {String}  [options.addresses.source.prefix]         - Source account prefix
 *  @param {String}  [options.addresses.source.address]        - Source account address
 *  @param {String}  [options.addresses.source.domain]         - Source account gateway domain
 *  @param {String}  [options.addresses.destination.federated] - Destination account in federation format
 *  @param {String}  [options.addresses.destination.prefix]    - Destination account prefix
 *  @param {String}  [options.addresses.destination.address]   - Destination account address
 *  @param {String}  [options.addresses.destination.domain]    - Destination account gateway domain
 *  @param {String}  [options.amount.value]                    - Amount used for the quote
 *  @param {String}  [options.amount.currency]                 - Currency of the amount used for the quote
 *
 *  @promise {Object}
 *    @resolve {Object} BridgePayment
 *    @reject  {Error}
 */
BridgeQuotesService.prototype.buildSenderBridgeQuote = function (options) {
  var _this = this;
  var source = options.addresses.source;
  return new Promise(function(resolve, reject) {
    _this.gatewayd.models.externalAccounts.find({where: {address: source.address}})
      .then(function(externalAccount) {
        if (!externalAccount) {
          return reject(new Error('Gateway user not found [sender:' + source.address +']'));
        }
        var bridgePayment = new BridgePayment({
          source: {
            uri: source.federated
            // Add additional info if need be
          },
          destination_amount: {
            amount:   options.amount.value,
            currency: options.amount.currency,
            issuer:   _this.gatewayd.config.get('COLD_WALLET')
          }
        });
        _this.fetchExternalQuote(options)
          .then(function(externalQuote) {
            bridgePayment.wallet_payment = externalQuote.wallet_payment;
            bridgePayment.destination = externalQuote.destination;
            resolve(bridgePayment)
          }).error(reject);
      }).error(function(error) {
        _this.gatewayd.logger('[bridge_quote_service.js:buildSenderQuote] Unable to fetch address [{}]', source.address);
        reject(new Error('Internal error'));
      })
  });
};

/**
 *  Finds the external account record associated with the destination adress and returns a BridgePayment with the
 *  rippleAddress+destinationTag as the wallet_payment destination
 *
 *  @param {Object} options                                    - Holds various options
 *  @param {String}  [options.addresses.source.federated]      - Source account in federation format
 *  @param {String}  [options.addresses.source.prefix]         - Source account prefix
 *  @param {String}  [options.addresses.source.address]        - Source account address
 *  @param {String}  [options.addresses.source.domain]         - Source account gateway domain
 *  @param {String}  [options.addresses.destination.federated] - Destination account in federation format
 *  @param {String}  [options.addresses.destination.prefix]    - Destination account prefix
 *  @param {String}  [options.addresses.destination.address]   - Destination account address
 *  @param {String}  [options.addresses.destination.domain]    - Destination account gateway domain
 *  @param {String}  [options.amount.value]                    - Amount used for the quote
 *  @param {String}  [options.amount.currency]                 - Currency of the amount used for the quote
 *
 *  @promise {Object}
 *    @resolve {Object} BridgePayment
 *    @reject  {Error}
 */
BridgeQuotesService.prototype.buildReceiverBridgeQuote = function (options) {
  var _this = this;
  var destination = options.addresses.destination;
  return new Promise(function(resolve, reject) {
    _this.gatewayd.models.externalAccounts.find({where: {address: destination.address}})
      .then(function(externalAccount) {
        if (!externalAccount) {
          return reject(new Error('Gateway user not found [receiver:' + destination.address +']'));
        }
        var bridgePayment = new BridgePayment({
          destination: {
            uri: destination.federated
            // Additional details
          },
          wallet_payment: {
            destination: _this.gatewayd.config.get('COLD_WALLET')+'?dt=' + externalAccount.dataValues.id,
            // TODO: Policy logic for fee calculates amount (for now, 1:1)
            primary_amount: {
              amount:   options.amount.value,
              currency: options.amount.currency,
              issuer:   ''
            }
          }
        });
        resolve(bridgePayment);
      }).error(function(error) {
        _this.gatewayd.logger('[bridge_quote_service.js:buildSenderQuote] Unable to fetch address [{}]', destination.address);
        reject(new Error('Internal error'));
      })
  });
};

/**
 *  Fetches a BridgeQuote from the receiving gateway
 *
 *  @param {Object} options                                    - Holds various options
 *  @param {String}  [options.addresses.source.federated]      - Source account in federation format
 *  @param {String}  [options.addresses.source.prefix]         - Source account prefix
 *  @param {String}  [options.addresses.source.address]        - Source account address
 *  @param {String}  [options.addresses.source.domain]         - Source account gateway domain
 *  @param {String}  [options.addresses.destination.federated] - Destination account in federation format
 *  @param {String}  [options.addresses.destination.prefix]    - Destination account prefix
 *  @param {String}  [options.addresses.destination.address]   - Destination account address
 *  @param {String}  [options.addresses.destination.domain]    - Destination account gateway domain
 *  @param {String}  [options.amount.value]                    - Amount used for the quote
 *  @param {String}  [options.amount.currency]                 - Currency of the amount used for the quote
 *
 *  @promise {Object}
 *    @resolve {Object} BridgePayment returned from receiver gateway
 *    @reject  {Error}
 */
BridgeQuotesService.prototype.fetchExternalQuote = function (options) {
  var _this = this;
  var url = 'https://{domain}/v1/bridge_payments/quotes/{sender}/{receiver}/{amount}';
  url = url.replace('{domain}', options.addresses.destination.domain)
    .replace('{sender}', options.addresses.source.federated)
    .replace('{receiver}', options.addresses.destination.federated)
    .replace('{amount}', options.amount.value + '+' + options.amount.currency);
  return new Promise(function(resolve, reject) {
    // If the destination is the same domain, just build the receiver quote
    if (options.addresses.destination.domain === _this.gatewayd.config.get('DOMAIN')) {
      resolve (_this.buildReceiverBridgeQuote(options));
    } else {
      http
        .get(url)
        .endAsync().then(function (response) {
          if (!response.body.bridge_payments || !response.body.bridge_payments.length > 0) {
            return reject(new Error('Receiver gateway did not return a quote'));
          }
          resolve(response.body.bridge_payments[0]);
        }).error(function (error) {
          _this.gatewayd.logger.error('[bridge_quote_service.js:fetchExternalQuote] Unable to fetch quote from receiver gateway', error);
          return reject(new Error('Unable to fetch quote from receiver gateway'));
        });
    }
  });

};

/**
 *  Parses out the different components of the sending and receiving accounts
 *
 *  @param {Object} options                         - Holds various options
 *  @param {String}  [options.sender]               - Sending account
 *  @param {String}  [options.receiver]             - Receiving account
 *
 *  @promise {Object}
 *    @resolve {Object} Formatted: {
 *                                   source: {
 *                                     federated: '',
 *                                     prefix: '',
 *                                     address: '',
 *                                     domain: ''
 *                                   },
 *                                   destination: {
 *                                     federated: '',
 *                                     prefix: '',
 *                                     address: '',
 *                                     domain: ''
 *                                   }
 *                                 }
 *    @reject  {Error}
 */

BridgeQuotesService.prototype.getAddressDetails = function _getAddressDetails(options) {
  return new Promise(function(resolve, reject) {
    var addresses = {
      source: {
        federated: options.sender,
        prefix:    options.sender.substr(0, options.sender.indexOf(':')),
        address:   options.sender.substr(options.sender.indexOf(':') + 1)
      },
      destination: {
        federated: options.receiver,
        prefix:    options.receiver.substr(0, options.receiver.indexOf(':')),
        address:   options.receiver.substr(options.receiver.indexOf(':') + 1)
      }
    };
    addresses.source.domain = addresses.source.address.replace(/.*@/, '');
    addresses.destination.domain = addresses.destination.address.replace(/.*@/, '');

    if (!addresses.source.prefix || !addresses.source.address || !addresses.source.domain) {
      return reject(new Error('Invalid sender address'));
    } else if (!addresses.destination.prefix || !addresses.destination.address || !addresses.destination.domain) {
      return reject(new Error('Invalid receiver address'));
    } else {
      resolve(addresses);
    }
  })
};

/**
 *  Validates an amount string and returns a promise containing an object representation of it
 *
 *  @param {Object} options                         - Holds various options
 *  @param {String}  [options.sender]               - Sending account
 *  @param {String}  [options.receiver]             - Receiving account
 *  @param {String}  [options.amount]               - Amount string in (value+currency) format
 *
 *  @promise {Object}
 *    @resolve {Object} Formatted: {sender: 'rNNNN', receiver: 'rNNN', amount: {amount: '5', currency: 'USD'}}
 *    @reject  {Error}
 */
BridgeQuotesService.prototype._validateRequest = function (options) {
  var _this = this;
  return new Promise(function (resolve, reject) {
    var sender = options.sender;
    if (!sender) {
      return reject(new Error('Missing sender address parameter'));
    }
    var receiver = options.receiver;
    if (!receiver) {
      return reject(new Error('Missing receiver address parameter'));
    }
    _this._parseAmount(options.amount)
      .then(function(amount) {
        resolve({
          sender:   sender,
          receiver: receiver,
          amount:   amount
        })
      })
      .error(reject);
  });
};

/**
 *  Validates an amount string and returns a promise containing an object representation of it
 *
 *  @param {String} amountString    - Amount string in (value+currency) format
 *
 *  @promise {Object}
 *    @resolve {Object} Formatted: {amount: '5', currency: 'USD'}
 *    @reject  {Error}
 */
BridgeQuotesService.prototype._parseAmount = function (amountString) {
  return new Promise(function (resolve, reject) {
    if (!amountString) {
      reject(new Error('Missing amount string'));
    }
    var amountArray = amountString.split('+');
    if (amountArray.length !== 2) {
      reject(new Error('Amount string formatting error'));
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
      value:    value,
      currency: currency
    });
  });
};

module.exports = BridgeQuotesService;
