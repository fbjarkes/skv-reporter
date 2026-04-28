export class CashType {
    dateTime = '';
    symbol = '';
    quantity = 0;
    price = 0;
    commission = 0;
    commissionCurrency = 'USD';
    transactionType = '';
    proceeds = 0;


    constructor(init?: Partial<CashType>) {
        if (init) {
            Object.assign(this, init);
        }
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