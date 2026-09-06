var PurchaseOrder_Module_Factory = function () {
  var PO = {
    name: 'PO',
    typeInfos: [{
        localName: 'Items',
        propertyInfos: [{
            name: 'item',
            minOccurs: 0,
            collection: true,
            elementName: {
              localPart: 'item'
            },
            typeInfo: '.Items.Item'
          }]
      }, {
        localName: 'Items.Item',
        typeName: null,
        propertyInfos: [{
            name: 'productName',
            required: true,
            elementName: {
              localPart: 'productName'
            }
          }, {
            name: 'quantity',
            required: true,
            elementName: {
              localPart: 'quantity'
            },
            typeInfo: 'Int'
          }, {
            name: 'usPrice',
            required: true,
            elementName: {
              localPart: 'USPrice'
            },
            typeInfo: 'Decimal'
          }, {
            name: 'comment',
            elementName: {
              localPart: 'comment'
            }
          }, {
            name: 'shipDate',
            elementName: {
              localPart: 'shipDate'
            },
            typeInfo: 'Date'
          }, {
            name: 'partNum',
            required: true,
            attributeName: {
              localPart: 'partNum'
            },
            type: 'attribute'
          }]
      }, {
        localName: 'PurchaseOrderType',
        propertyInfos: [{
            name: 'shipTo',
            required: true,
            elementName: {
              localPart: 'shipTo'
            },
            typeInfo: '.USAddress'
          }, {
            name: 'billTo',
            required: true,
            elementName: {
              localPart: 'billTo'
            },
            typeInfo: '.USAddress'
          }, {
            name: 'comment',
            elementName: {
              localPart: 'comment'
            }
          }, {
            name: 'items',
            required: true,
            elementName: {
              localPart: 'items'
            },
            typeInfo: '.Items'
          }, {
            name: 'orderDate',
            typeInfo: 'Date',
            attributeName: {
              localPart: 'orderDate'
            },
            type: 'attribute'
          }]
      }, {
        localName: 'USAddress',
        propertyInfos: [{
            name: 'name',
            required: true,
            elementName: {
              localPart: 'name'
            }
          }, {
            name: 'street',
            required: true,
            elementName: {
              localPart: 'street'
            }
          }, {
            name: 'city',
            required: true,
            elementName: {
              localPart: 'city'
            }
          }, {
            name: 'state',
            required: true,
            elementName: {
              localPart: 'state'
            }
          }, {
            name: 'zip',
            required: true,
            elementName: {
              localPart: 'zip'
            },
            typeInfo: 'Decimal'
          }, {
            name: 'country',
            typeInfo: 'NMToken',
            attributeName: {
              localPart: 'country'
            },
            type: 'attribute'
          }]
      }],
    elementInfos: [{
        elementName: {
          localPart: 'comment'
        }
      }, {
        typeInfo: '.PurchaseOrderType',
        elementName: {
          localPart: 'purchaseOrder'
        }
      }]
  };
  return {
    PO: PO
  };
};
if (typeof define === 'function' && define.amd) {
  define([], PurchaseOrder_Module_Factory);
}
else {
  var PurchaseOrder_Module = PurchaseOrder_Module_Factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports.PO = PurchaseOrder_Module.PO;
  }
  else {
    var PO = PurchaseOrder_Module.PO;
  }
}