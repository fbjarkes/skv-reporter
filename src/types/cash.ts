export class CashType {
    dateTime = '';
    symbol = '';
    side = '';
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
    currency: string; // Currency of the cumulative cost, e.g USD for EUR/USD, SEK for USD/SEK

    constructor(options: CashPositionOptions) {
        this.symbol = options.symbol;
        this.cumulativeQty = options.cumQty;
        this.cumulativeCost = options.cumCost;
        this.currency = options.currency;
    }

    get averageCost(): number {
        if (this.cumulativeQty === 0) return 0;
        const v = this.cumulativeCost / this.cumulativeQty;
        const precision = Math.abs(v) < 1e-5 ? 10 : 5;
        const factor = 10 ** precision;
        return Math.round(v * factor) / factor;
    }
}
