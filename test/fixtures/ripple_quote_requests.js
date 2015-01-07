module.exports = {
  valid: {
    destination: {
      amount: 5.00,
      currency: 'USD',
      address: 'rHXcECnhu9JwNphxqzRDU76iydhGEftWtU'  
    },
    source : {
      address: 'rwXNHZD4F6SzyE2yXhjhHZhLzMxtcXLSvt',
      currencies: ['BTC']
    }
  },
  invalid: {
    destination_amount: {
      destination: {
        currency: 'USD',
        address: 'rHXcECnhu9JwNphxqzRDU76iydhGEftWtU'  
      },
      source : {
        address: 'rwXNHZD4F6SzyE2yXhjhHZhLzMxtcXLSvt'
      }     
    },
    destination_currency: {
      destination : {
        amount: 5.00,
        currency: 'USD1',
        address: 'rHXcECnhu9JwNphxqzRDU76iydhGEftWtU'
      },
      source : {
        address: 'rwXNHZD4F6SzyE2yXhjhHZhLzMxtcXLSvt'
      }
    },
    destination_address: {
      destination: {
        amount: 5.00,
        currency: 'USD',
        address: 'r132321'
      },
      source : {
        address: 'rwXNHZD4F6SzyE2yXhjhHZhLzMxtcXLSvt'
      }
    },
    source_address: {
      destination: {
        amount: 5.00,
        currency: 'USD',
        address: 'rHXcECnhu9JwNphxqzRDU76iydhGEftWtU'
      },
      source : {
        address: 'r132321'
      }
    }
  },
  ripple_rest_response: {
    valid: {
      success: true,
      payments: [
        {
          source_account: 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',
          source_tag: '',
          source_amount: {
            value: '1',
            currency: 'USD',
            issuer: 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn'
          },
          source_slippage: '0',
          destination_account: 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX',
          destination_tag: '',
          destination_amount: {
            value: '1',
            currency: 'USD',
            issuer: 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn'
          },
          invoice_id: '',
          paths: '[[{\'account\':\'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q\',\'type\':1,\'type_hex\':\'0000000000000001\'},{\'currency\':\'XRP\',\'type\':16,\'type_hex\':\'0000000000000010\'},{\'currency\':\'USD\',\'issuer\':\'rsP3mgGb2tcYUrxiLFiHJiQXhsziegtwBc\',\'type\':48,\'type_hex\':\'0000000000000030\'},{\'account\':\'rsP3mgGb2tcYUrxiLFiHJiQXhsziegtwBc\',\'type\':1,\'type_hex\':\'0000000000000001\'}],[{\'account\':\'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q\',\'type\':1,\'type_hex\':\'0000000000000001\'},{\'currency\':\'BTC\',\'issuer\':\'rLEsXccBGNR3UPuPu2hUXPjziKC3qKSBun\',\'type\':48,\'type_hex\':\'0000000000000030\'},{\'account\':\'rLEsXccBGNR3UPuPu2hUXPjziKC3qKSBun\',\'type\':1,\'type_hex\':\'0000000000000001\'},{\'currency\':\'USD\',\'issuer\':\'rsP3mgGb2tcYUrxiLFiHJiQXhsziegtwBc\',\'type\':48,\'type_hex\':\'0000000000000030\'},{\'account\':\'rsP3mgGb2tcYUrxiLFiHJiQXhsziegtwBc\',\'type\':1,\'type_hex\':\'0000000000000001\'}],[{\'account\':\'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q\',\'type\':1,\'type_hex\':\'0000000000000001\'},{\'account\':\'rnziParaNb8nsU4aruQdwYE3j5jUcqjzFm\',\'type\':1,\'type_hex\':\'0000000000000001\'},{\'account\':\'rsP3mgGb2tcYUrxiLFiHJiQXhsziegtwBc\',\'type\':1,\'type_hex\':\'0000000000000001\'}]]',
          partial_payment: false,
          no_direct_ripple: false
        }
      ]
    }
  }
};
