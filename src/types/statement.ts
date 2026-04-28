// export type K4_TYPE = 'TYPE_A' | 'TYPE_B' | 'TYPE_C' | 'TYPE_D';
export enum K4_TYPE {
    TYPE_A = 'TYPE_A',
    TYPE_B = 'TYPE_B',
    TYPE_C = 'TYPE_C',
    TYPE_D = 'TYPE_D',
}

// TODO: use general SECURIY_TYPE instead
export enum K4_SEC_TYPE {
    STOCK = 'STOCK',
    OPTION = 'OPTION',
    FUTURE = 'FUTURE',
    CASH = 'CASH',
    UNKNOWN = 'UNKNOWN',
}

export class Statement {
    id: number;
    symbol: string;
    quantity = 0;
    received: number;
    paid: number;
    pnl: number;
    type: K4_TYPE;
    date: string;
    securityType: K4_SEC_TYPE;

    constructor(
        id: number,
        quantity: number,
        symbol: string,
        paid: number,
        received: number,
        pnl: number,
        type: K4_TYPE,
        date: string,
        securityType: K4_SEC_TYPE,
    ) {
        this.id = id;
        this.quantity = Math.abs(quantity);
        this.symbol = symbol.substring(0, 80);
        this.paid = Math.abs(Math.round(paid));
        this.received = Math.abs(Math.round(received));
        this.pnl = Math.round(pnl);
        this.type = type;
        this.date = date;
        this.securityType = securityType;
    }

    public toString(): string {
        return `${this.symbol} (${this.securityType}) (${this.type}) ${this.date}: qty=${this.quantity} paid=${this.paid}, received=${this.received}, pnl=${this.pnl}`;
    }
}
