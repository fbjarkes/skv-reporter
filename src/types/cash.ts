export class CashType {
    dateTime = '';
    symbol = '';
    quantity = 0;
    price = 0;
    commission = 0;
    commissionCurrency = 'USD'; // Usually account base currency (IBKR)
    tradeCurrency = 'SEK'; // e.g. 'USD' for 'EUR/USD' or 'SEK' for 'USD/SEK'
    transactionType = '';
    proceeds = 0;


    constructor(init?: Partial<CashType>) {
        if (init) {
            Object.assign(this, init);
        }
    }
}

export interface CashPositionOptions {
    symbol: string;
    cumQty: number;
    cumCost: number;
    currency: string;
}

export class CashPosition {
    symbol: string;
    cumulativeQty: number;
    cumulativeCost: number;
    currency: string;

    constructor(options: CashPositionOptions) {
        this.symbol = options.symbol;
        this.cumulativeQty = options.cumQty;
        this.cumulativeCost = options.cumCost;
        this.currency = options.currency;
    }

    get averageCost(): number {
        if (this.cumulativeQty === 0) return 0;
        const v = this.cumulativeCost / this.cumulativeQty;
        return Math.round(v * 1e5) / 1e5;
    }
}