var util               = require('util');
var chai               = require('chai');
var chaiAsPromised     = require('chai-as-promised');
var sinon              = require('sinon');
var RippleRestClient   = require('ripple-rest-client');
var winston            = require('winston');
var RippleQuoteService = require(__dirname + '/../../../lib/services/ripple_quote_service.js');
var fixture            = require(__dirname + '/../../fixtures/ripple_quote_requests.js');

describe('ripple_quote', function() {

  chai.use(chaiAsPromised);

  var rippleQuoteService = new RippleQuoteService({
    logger: winston
  });

  it('.validate() should successfully validate a ripple quote request', function(done) {
    rippleQuoteService.validate(fixture.valid)
      .then(done)
      .catch(done);
  });

  it('.validate() should fail to validate a ripple quote (destination amount)', function() {
    return chai.assert.isRejected(rippleQuoteService.validate(fixture.invalid.destination_amount), /Destination amount is not a valid number/);
  });

  it('.validate() should fail to validate a ripple quote (destination currency)', function() {
    return chai.assert.isRejected(rippleQuoteService.validate(fixture.invalid.destination_currency), /Destination currency is not valid/);
  });

  it('.validate() should fail to validate a ripple quote (destination address)', function() {
    return chai.assert.isRejected(rippleQuoteService.validate(fixture.invalid.destination_address), /Destination address is not a valid ripple address/);
  });

  it('.validate() should fail to validate a ripple quote (source address)', function() {
    return chai.assert.isRejected(rippleQuoteService.validate(fixture.invalid.source_address), /Source address is not a valid ripple address/);
  });

  it('.build() should handle an error returned by ripple-rest', function() {
    rippleQuoteService.rippleRestClient.buildPayment = sinon.stub(RippleRestClient.prototype, 'buildPayment')
      .yields(new Error('Bad fooblah'), null);
    try {
      return chai.assert.isRejected(rippleQuoteService.build(fixture.valid), /Bad fooblah/);
    } finally {
      rippleQuoteService.rippleRestClient.buildPayment.restore();
    }
  });

  it('.build() calls ripple-rest with the provided args', function(done) {
    rippleQuoteService.rippleRestClient.buildPayment = sinon.stub(RippleRestClient.prototype, 'buildPayment')
      .yields(null, fixture.ripple_rest_response.valid);
    try {
      rippleQuoteService.build(fixture.valid)
        .then(function () {
          chai.assert.ok(rippleQuoteService.rippleRestClient.buildPayment.withArgs({
            amount: fixture.valid.destination.amount,
            currency: fixture.valid.destination.currency,
            recipient: fixture.valid.destination.address,
            source_currencies: fixture.valid.source.currencies
          }).called);
          rippleQuoteService.rippleRestClient.buildPayment.restore();
          done();
        })
        .catch(function (error) {
          rippleQuoteService.rippleRestClient.buildPayment.restore();
          if (util.isError(error)) {
            done(error);
          } else {
            done(new Error(JSON.stringify(error)));
          }
        });
    } finally {
      rippleQuoteService.rippleRestClient.buildPayment.restore();
    }
  });
});
