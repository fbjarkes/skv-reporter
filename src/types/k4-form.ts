import format from 'date-fns/format';
import { K4_TYPE, Statement } from './statement';

const DATETIME_FORMAT = 'yyyyMMdd HHmmss';

export const MAX_TYPE_A_STATEMENTS = 9;
export const MAX_TYPE_C_STATEMENTS = 7;
export const MAX_TYPE_D_STATEMENTS = 7;
export class K4Form {
    title: string;
    pageNumber: number;
    id: string;
    created: Date; // On format 20210101 143000
    statements: Statement[];
    type: K4_TYPE;

    constructor(
        title: string,
        pageNumber: number,
        id: string,
        date: Date,
        statements: Statement[],
        type = K4_TYPE.TYPE_A,
    ) {
        this.title = title;
        this.pageNumber = pageNumber;
        this.id = id;
        this.statements = statements;
        this.created = date;
        this.type = type;
    }

    public generateLinesTypeA(): string[] {
        if (this.statements.length === 0) {
            throw new Error('Form contains no statements');
        }
        if (this.statements.length > MAX_TYPE_A_STATEMENTS) {
            throw new Error(`Form contains too many statements for this K4 type ${this.type}`);
        }
        const str = format(this.created, DATETIME_FORMAT);
        const lines = [`#BLANKETT ${this.title}`, `#IDENTITET ${this.id} ${str}`, `#UPPGIFT 7014 ${this.pageNumber}`];

        let receivedSum = 0;
        let costSum = 0;
        let profitSum = 0;
        let lossSum = 0;

        this.statements
            .filter((s: Statement) => s.type === K4_TYPE.TYPE_A)
            .forEach((s: Statement, i) => {
                lines.push(`#UPPGIFT 31${i}0 ${s.quantity}`);
                lines.push(`#UPPGIFT 31${i}1 ${s.symbol}`);
                lines.push(`#UPPGIFT 31${i}2 ${s.received}`);
                lines.push(`#UPPGIFT 31${i}3 ${s.paid}`);

                if (s.pnl > 0) {
                    lines.push(`#UPPGIFT 31${i}4 ${s.pnl}`);
                    profitSum += s.pnl;
                } else {
                    lines.push(`#UPPGIFT 31${i}5 ${Math.abs(s.pnl)}`);
                    lossSum += Math.abs(s.pnl);
                }
                receivedSum += s.received;
                costSum += s.paid;
            });
        lines.push(`#UPPGIFT 3300 ${receivedSum}`);
        lines.push(`#UPPGIFT 3301 ${costSum}`);
        lines.push(`#UPPGIFT 3304 ${profitSum}`);
        lines.push(`#UPPGIFT 3305 ${lossSum}`);
        lines.push(`#BLANKETTSLUT`);
        return lines;
    }

    public generateLinesTypeC(): string[] {
        if (this.statements.length === 0) {
            throw new Error('Form contains no statements');
        }
        if (this.statements.length > MAX_TYPE_C_STATEMENTS) {
            throw new Error(`Form contains too many statements for this K4 type ${this.type}`);
        }
        const str = format(this.created, DATETIME_FORMAT);
        const lines = [`#BLANKETT ${this.title}`, `#IDENTITET ${this.id} ${str}`, `#UPPGIFT 7014 ${this.pageNumber}`];

        let receivedSum = 0;
        let costSum = 0;
        let profitSum = 0;
        let lossSum = 0;

        this.statements
            .filter((s: Statement) => s.type === K4_TYPE.TYPE_C)
            .forEach((s: Statement, i) => {
                const base = 331 + i;
                lines.push(`#UPPGIFT ${base}0 ${s.quantity}`);
                lines.push(`#UPPGIFT ${base}1 ${s.symbol}`);
                lines.push(`#UPPGIFT ${base}2 ${s.received}`);
                lines.push(`#UPPGIFT ${base}3 ${s.paid}`);

                if (s.pnl > 0) {
                    lines.push(`#UPPGIFT ${base}4 ${s.pnl}`);
                    profitSum += s.pnl;
                } else {
                    lines.push(`#UPPGIFT ${base}5 ${Math.abs(s.pnl)}`);
                    lossSum += Math.abs(s.pnl);
                }
                receivedSum += s.received;
                costSum += s.paid;
            });

        lines.push(`#UPPGIFT 3400 ${receivedSum}`);
        lines.push(`#UPPGIFT 3401 ${costSum}`);
        lines.push(`#UPPGIFT 3403 ${profitSum}`);
        lines.push(`#UPPGIFT 3404 ${lossSum}`);
        lines.push(`#BLANKETTSLUT`);
        return lines;
    }

    public generateLinesTypeD(): string[] {
        if (this.statements.length === 0) {
            throw new Error('Form contains no statements');
        }
        if (this.statements.length > MAX_TYPE_D_STATEMENTS) {
            throw new Error(`Form contains too many statements for this K4 type ${this.type}`);
        }
        const str = format(this.created, DATETIME_FORMAT);
        const lines = [`#BLANKETT ${this.title}`, `#IDENTITET ${this.id} ${str}`, `#UPPGIFT 7014 ${this.pageNumber}`];

        let receivedSum = 0;
        let costSum = 0;
        let profitSum = 0;
        let lossSum = 0;

        this.statements
            .filter((s: Statement) => s.type === K4_TYPE.TYPE_D)
            .forEach((s: Statement, i) => {
                lines.push(`#UPPGIFT 34${i + 1}0 ${s.quantity}`);
                lines.push(`#UPPGIFT 34${i + 1}1 ${s.symbol}`);
                lines.push(`#UPPGIFT 34${i + 1}2 ${s.received}`);
                lines.push(`#UPPGIFT 34${i + 1}3 ${s.paid}`);

                if (s.pnl > 0) {
                    lines.push(`#UPPGIFT 34${i + 1}4 ${s.pnl}`);
                    profitSum += s.pnl;
                } else {
                    lines.push(`#UPPGIFT 34${i + 1}5 ${Math.abs(s.pnl)}`);
                    lossSum += Math.abs(s.pnl);
                }
                receivedSum += s.received;
                costSum += s.paid;
            });
        lines.push(`#UPPGIFT 3500 ${receivedSum}`);
        lines.push(`#UPPGIFT 3501 ${costSum}`);
        lines.push(`#UPPGIFT 3503 ${profitSum}`);
        lines.push(`#UPPGIFT 3504 ${lossSum}`);
        lines.push(`#BLANKETTSLUT`);
        return lines;
    }
}
