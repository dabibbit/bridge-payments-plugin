module.exports = {
  function_requests: {
    fetchExternalQuote: {
      valid: {
        addresses: {
          source: {
            federated: 'acct:conner@ripple.com',
            prefix: 'acct',
            address: 'conner@ripple.com',
            domain: 'ripple.com'
          },
          destination: {
            federated: 'acct:norm@ripple.com',
            prefix: 'acct',
            address: 'norm@ripple.com',
            domain: 'ripple.com'
          }
        },
        amount: {
          value: '5',
          currency: 'USD'
        }
      }
    }
  },
  function_responses: {
    fetchExternalQuote: {
      valid: {
        success: true,
        bridge_payments: [
          {
            state: "quote",
            created: "2015-01-06T22:10:58.728Z",
            source: {
              uri: "acct:conner@ripple.com"
            },
            wallet_payment: {
              destination: "ra5nK24KXen9AHvsdFTKHSANinZseWnPcX?dt=2",
              primary_amount: {
                amount: "0.1084568085150263",
                currency: "USD",
                issuer: ""
              }
            },
            destination: {
              uri: "acct:norm@localhost:5000"
            },
            destination_amount: {
              amount: "5",
              currency: "XRP",
              issuer: "ra5nK24KXen9AHvsdFTKHSANinZseWnPcX"
            }
          }]
      }
    }
  }
};
