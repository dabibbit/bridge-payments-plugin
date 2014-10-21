function BridgePayment(options) {
  this.state = options.state;
  this.expiration = options.expiration;
  this.source = options.source || {};
  this.wallet_payment = options.wallet_payment || {};
  this.destination = options.destination || [];
  this.destination_amount = options.destination_amount || {};
  this.parties = options.parties || {};
}

module.exports = BridgePayment;