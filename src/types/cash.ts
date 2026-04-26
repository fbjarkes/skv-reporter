export class CashType {
    dateTime = '';
    symbol = ''; // e.g. 'USD', 'EUR'
    quantity = 0; // positive = buy, negative = sell
    price = 0; // exchange rate in SEK per unit of foreign currency
    commission = 0; // in SEK, always positive
    transactionType = '';

    constructor(symbol = '', quantity = 0, price = 0, commission = 0, dateTime = '') {
        this.symbol = symbol;
        this.quantity = quantity;
        this.price = price;
        this.commission = commission;
        this.dateTime = dateTime;
    }
}

export class CashPosition {
    symbol: string;
    cumulativeQty: number;
    cumulativeCost: number; // total cost in SEK

    constructor(symbol: string, qty = 0, cost = 0) {
        this.symbol = symbol;
        this.cumulativeQty = qty;
        this.cumulativeCost = cost;
    }

    get averageCost(): number {
        if (this.cumulativeQty === 0) return 0;
        return this.cumulativeCost / this.cumulativeQty;
    }
}
