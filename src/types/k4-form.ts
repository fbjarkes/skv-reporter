import format from 'date-fns/format';
import { K4_TYPE, Statement } from "./statement";

const DATETIME_FORMAT = 'yyyyMMdd HHmmss'

export class K4Form {
    
    title: string;
    pageNumber: number;
    id: string;
    created: Date; // On format 20210101 143000 
    statements: Statement[];

    constructor(title: string, pageNumber: number, id: string, date: Date,  statements: Statement[]) {
        this.title = title;
        this.pageNumber = pageNumber;
        this.id = id;
        this.statements = statements;
        this.created = date;
    }

    public generateLines(): string[] {
        const str = format(this.created, DATETIME_FORMAT);
        const lines = [
            `#BLANKETT ${this.title}`,
            `#IDENTITET ${this.id} ${str}`,
            `#UPPGIFT 7014 ${this.pageNumber}`,
        ]

        let count_type_a = 0;
        let receivedSum = 0;
        let costSum = 0;
        let profitSum = 0;
        let lossSum = 0;
        
        this.statements.filter((s: Statement) => s.type === K4_TYPE.TYPE_A).forEach((s: Statement) => {
            lines.push(`#UPPGIFT 31${count_type_a}0 ${s.quantity}`);
            lines.push(`#UPPGIFT 31${count_type_a}1 ${s.symbol}`);
            lines.push(`#UPPGIFT 31${count_type_a}2 ${s.received}`);
            lines.push(`#UPPGIFT 31${count_type_a}3 ${s.paid}`);
            
            if (s.pnl > 0) {
                lines.push(`#UPPGIFT 31${count_type_a}4 ${s.pnl}`);
                profitSum += s.pnl;
            } else {
                lines.push(`#UPPGIFT 31${count_type_a}5 ${Math.abs(s.pnl)}`);
                lossSum += Math.abs(s.pnl);
            }
            receivedSum += s.received;
            costSum += s.paid;
            
            count_type_a++;
            if (count_type_a > 9) {
                throw new Error('Too many TYPE A records!');
            }
        });
        
        lines.push(`#UPPGIFT 3300 ${receivedSum}`);
        lines.push(`#UPPGIFT 3301 ${costSum}`);
        lines.push(`#UPPGIFT 3304 ${profitSum}`);
        lines.push(`#UPPGIFT 3305 ${lossSum}`);

        let count_type_c = 1; // TYPE_C row index starts at 1
        let receivedSumC = 0;
        let costSumC = 0;
        let profitSumC = 0;
        let lossSumC = 0;

        this.statements.filter((s: Statement) => s.type === K4_TYPE.TYPE_C).forEach((s: Statement) => {
            lines.push(`#UPPGIFT 33${count_type_c}0 ${s.quantity}`);
            lines.push(`#UPPGIFT 33${count_type_c}1 ${s.symbol}`);
            lines.push(`#UPPGIFT 33${count_type_c}2 ${s.received}`);
            lines.push(`#UPPGIFT 33${count_type_c}3 ${s.paid}`);

            if (s.pnl > 0) {
                lines.push(`#UPPGIFT 33${count_type_c}4 ${s.pnl}`);
                profitSumC += s.pnl;
            } else {
                lines.push(`#UPPGIFT 33${count_type_c}5 ${Math.abs(s.pnl)}`);
                lossSumC += Math.abs(s.pnl);
            }
            receivedSumC += s.received;
            costSumC += s.paid;

            count_type_c++;
            if (count_type_c > 7) {
                throw new Error('Too many TYPE C records! Maximum 7 statements allowed.');
            }
        });

        if (count_type_c > 1) {
            lines.push(`#UPPGIFT 3400 ${receivedSumC}`);
            lines.push(`#UPPGIFT 3401 ${costSumC}`);
            lines.push(`#UPPGIFT 3403 ${profitSumC}`);
            lines.push(`#UPPGIFT 3404 ${lossSumC}`);
        }

        lines.push(`#BLANKETTSLUT`);
        return lines;
    }
}