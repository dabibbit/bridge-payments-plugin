var util               = require('util');
var chai               = require('chai');
var chaiAsPromised     = require('chai-as-promised');
var sinon              = require('sinon');
var sinonAsPromised    = require('sinon-as-promised');
var http               = require('superagent');
var Promise            = require('bluebird');
var winston            = require('winston');
var BridgeQuoteService = require(__dirname + '/../../../lib/services/bridge_quote_service.js');
var fixture            = require(__dirname + '/../../fixtures/bridge_quote_requests.js');

describe('bridge_quote_service', function() {

  chai.use(chaiAsPromised);

  var bridgeQuoteService;

  before(function() {
    bridgeQuoteService = new BridgeQuoteService({
      gatewayd: {
        config: {
          get: sinon.stub().withArgs('RIPPLE_REST_API').returns('http://test.com')
        },
        logger: winston
      }
    });
  });

  describe('_parseAmount()', function() {

    it('should validate and and return an object representation of a value+currency string', function(done) {
      bridgeQuoteService._parseAmount('5.30+USD')
        .then(function(amount) {
          chai.assert.strictEqual(amount.value, '5.30');
          chai.assert.strictEqual(amount.currency, 'USD');
          done();
        }).error(done);
    });

    it('should fail because amountString parameter is empty', function() {
      return chai.assert.isRejected(bridgeQuoteService._parseAmount(''), /Missing amount string/);
    });

    it('should fail because amountString parameter is invalid (.split(+) returns 3 instead of 2)', function() {
      return chai.assert.isRejected(bridgeQuoteService._parseAmount('5+USD+'), /Amount string formatting error/);
    });

    it('should fail because amountString parameter is invalid (missing amount)', function() {
      return chai.assert.isRejected(bridgeQuoteService._parseAmount('+USD'), /Missing amount/);
    });

    it('should fail because amountString parameter is invalid (invalid amount)', function() {
      return chai.assert.isRejected(bridgeQuoteService._parseAmount('XRP+USD'), /Invalid amount/);
    });

    it('should fail because amountString parameter is invalid (missing currency)', function() {
      return chai.assert.isRejected(bridgeQuoteService._parseAmount('5+'), /Missing currency/);
    });

    it('should fail because amountString parameter is invalid (invalid currency)', function() {
      return chai.assert.isRejected(bridgeQuoteService._parseAmount('5+USDA'), /Invalid currency/);
    });
  });

  describe('_validateRequest()', function() {

    var bridgeQuoteService;

    before(function() {
      var get = sinon.stub();
      get.withArgs('RIPPLE_REST_API').returns('http://test.com');
      bridgeQuoteService = new BridgeQuoteService({gatewayd: {config: {get: get}}});
    });

    it('should validate request and return an object representation of it', function(done) {
      var parseAmountStub = sinon.stub(bridgeQuoteService, '_parseAmount').resolves({ value: '5', currency: 'USD'});
      try {
        bridgeQuoteService._validateRequest({
          sender: 'rHXcECnhu9JwNphxqzRDU76iydhGEftWtU',
          receiver: 'rwXNHZD4F6SzyE2yXhjhHZhLzMxtcXLSvt',
        }).then(function (request) {
          chai.assert.strictEqual(request.sender, 'rHXcECnhu9JwNphxqzRDU76iydhGEftWtU');
          chai.assert.strictEqual(request.receiver, 'rwXNHZD4F6SzyE2yXhjhHZhLzMxtcXLSvt');
          chai.assert.strictEqual(request.amount.value, '5');
          chai.assert.strictEqual(request.amount.currency, 'USD');
          done();
        }).error(done);
      } finally {
        parseAmountStub.restore();
      }
    });

    it('should fail because _parseAmount() fails', function() {
      var parseAmountStub = sinon.stub(bridgeQuoteService, '_parseAmount').rejects(new Error('Missing amount string'));
      try {
        return chai.assert.isRejected(bridgeQuoteService._validateRequest({
          sender: 'rHXcECnhu9JwNphxqzRDU76iydhGEftWtU',
          receiver: 'rwXNHZD4F6SzyE2yXhjhHZhLzMxtcXLSvt'
        }), /Missing amount string/);
      } finally {
        parseAmountStub.restore();
      }
    });

    it('should fail because sender parameter is empty (missing sender)', function() {
      return chai.assert.isRejected(bridgeQuoteService._validateRequest({}), /Missing sender address parameter/);
    });

    it('should fail because receiver parameter is empty (missing receiver)', function() {
      return chai.assert.isRejected(bridgeQuoteService._validateRequest({sender: 'rHXcECnhu9JwNphxqzRDU76iydhGEftWtU'}), /Missing receiver address parameter/);
    });
  });

  describe('getAddressDetails()', function() {

    it('should parse the sender and receiver accounts and return an object representation', function(done) {
      bridgeQuoteService.getAddressDetails({
        sender: 'acct:conner@ripple.com',
        receiver: 'acct:norm@ripple.com'
      }).then(function(addresses) {
        chai.assert.deepEqual(addresses, {
          source: {
            federated: 'acct:conner@ripple.com',
            prefix: 'acct',
            address: 'conner',
            domain: 'ripple.com'
          },
          destination: {
            federated: 'acct:norm@ripple.com',
            prefix: 'acct',
            address: 'norm',
            domain: 'ripple.com'
          }
        });
        done();
      }).error(done);
    });

    it('should fail because sender is not properly formatted', function() {
      return chai.assert.isRejected(bridgeQuoteService.getAddressDetails({
        sender: 'conner@ripple.com',
        receiver: 'acct:norm@ripple.com'
      }), /Invalid sender address/);
    });

    it('should fail because receiver is not properly formatted', function() {
      return chai.assert.isRejected(bridgeQuoteService.getAddressDetails({
        sender: 'acct:conner@ripple.com',
        receiver: 'norm@ripple.com'
      }), /Invalid receiver address/);
    });
  });

  describe('fetchExternalQuote()', function() {

    it('should make a request to fetch an external bridgeQuote and return that quote', function(done) {
      var httpGetStub = sinon.stub(http, 'get').returns({
        endAsync: function() {
          return Promise.resolve({
            body: {
              bridge_payments: [fixture.function_responses.fetchExternalQuote.valid]
            }
          });
        }
      });
      try {
        bridgeQuoteService.fetchExternalQuote(fixture.function_requests.fetchExternalQuote.valid)
          .then(function(bridgeQuote) {
            chai.assert(httpGetStub.calledWith('https://ripple.com/v1/bridge_payments/quotes/acct:conner@ripple.com/acct:norm@ripple.com/5+USD'));
            chai.assert.deepEqual(bridgeQuote, fixture.function_responses.fetchExternalQuote.valid);
            done();
          }).error(done);
      } finally {
        httpGetStub.restore();
      }
    });

    it('should fail because the external request does not return a bridge_quote', function() {
      var httpGetStub = sinon.stub(http, 'get').returns({
        endAsync: function() {
          return Promise.resolve({
            body: {
              bridge_payments: []
            }
          });
        }
      });
      try {
        return chai.assert.isRejected(bridgeQuoteService.fetchExternalQuote(fixture.function_requests.fetchExternalQuote.valid), /Receiver gateway did not return a quote/);
      } finally {
        httpGetStub.restore();
      }
    });

    it('should fail because the external request fails', function() {
      var httpGetStub = sinon.stub(http, 'get').returns({
        endAsync: function() {
          return Promise.reject(new Error('fooblah'));
        }
      });
      try {
        return chai.assert.isRejected(bridgeQuoteService.fetchExternalQuote(fixture.function_requests.fetchExternalQuote.valid), /Unable to fetch quote from receiver gateway/);
      } finally {
        httpGetStub.restore();
      }
    });
  });
});
