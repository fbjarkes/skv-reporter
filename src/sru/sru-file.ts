import { chunk } from 'lodash';
import { K4_TYPE, Statement } from "../types/statement";
import { TradeType } from "../types/trade";
import { logger } from '../logging';
import { K4Form } from "../types/k4-form";
import format from "date-fns/format";


export class SRUInfo {
    id?: string;
    name?: string;
    surname?: string;
    mail?: string;
    code?: string;
    city?: string;
    taxYear?: number;
}   

export class SRUFile {
    
    sruInfo?: SRUInfo;
    title = 'SKV-Reporter';
    trades: TradeType[];
    fxRates: Map<string, Map<string, number>>;
    createDate = new Date();
    
    constructor(fxRates: Map<string, Map<string, number>>, trades: TradeType[], data?: SRUInfo) {
        this.sruInfo = data;
        this.fxRates = fxRates;
        this.trades = trades;
    }

    toK4Type(trade: TradeType): K4_TYPE {
        switch(trade.securityType) {
            case 'STK': {
                return K4_TYPE.TYPE_A;
            }
            case 'FUT': {
                // TODO: FX/Bond futures: TYPE_C
                // TODO: Commodity futures: TYPE_D
                return K4_TYPE.TYPE_A;
            }
            case 'OPT': {
                return K4_TYPE.TYPE_A;
            }
            // Crypto: TYPE_D
        }        
        throw new Error(`Unexpected trade security type: ${trade.securityType}`);
    }

    getStatements(): Statement[] {
        const statements: Statement[] = [];
        this.trades.forEach((trade: TradeType) => {            
            let rate: number | undefined = 1;
            let paid, received;

            if (this.sruInfo?.taxYear && this.sruInfo?.taxYear !== Number(trade.exitDateTime.substring(0, 4))) {
                throw new Error(`Unexpected statement for tax year ${this.sruInfo?.taxYear}`);
            }

            if (trade.currency !== 'SEK') {
                const key = trade.exitDateTime.substring(0, 10);
                rate = this.fxRates.get(key)?.get('USD/SEK');
                if (!rate) {
                    throw new Error(`Missing USD/SEK rate for ${key}`);
                }
            }             
            
            if (trade.direction === 'SHORT') {
                paid = (trade.proceeds + trade.commission) * rate;
                received = trade.cost * rate;
            } else {
                paid = (trade.cost + trade.commission) * rate;
                received = trade.proceeds * rate;
            }
            const pnl = trade.pnl * rate;
            const statement = new Statement(trade.quantity, `${trade.symbol} ${trade.description}`, paid, received, pnl, this.toK4Type(trade), trade.exitDateTime);            
            if (Math.abs(pnl) < 1) {                
                logger.info(`Skipping trade with < 1SEK: ${statement.toString()}`)
            } else {
                logger.info(`Adding: ${statement.toString()}`)
                statements.push(statement)
            }                            
        });
        return statements;
    }

    getInfoData(): string[] {
        return [
            '#DATABESKRIVNING_START',
            '#PRODUKT SRU',
            `#SKAPAD ${format(this.createDate, 'yyyyMMdd')}`,
            `#PROGRAM ${this.title} ${this.title}`,
            '#FILNAMN blanketter.sru',
            '#DATABESKRIVNING_SLUT',
            '#MEDIELEV_START',
            `#ORGNR ${this.sruInfo?.id}`,
            `#NAMN ${this.sruInfo?.name} ${this.sruInfo?.surname}`,
            `#POSTNR ${this.sruInfo?.code}`,
            `#POSTORT ${this.sruInfo?.city}`,
            `#EMAIL ${this.sruInfo?.mail}`,
            '#MEDIELEV_SLUT'
        ]
    }

    static splitStatements(statements: Statement[]): Statement[][] {
        // TODO: max 9 TYPE_A, 7 TYPE_C, 7 TYPE_D
        const statements_a = statements.filter((s: Statement) => s.type === K4_TYPE.TYPE_A);
        return chunk(statements_a, 9)
    }

    getFormData(): string[][] {
        const files: string[][] = []
        
        const statementChunks = SRUFile.splitStatements(this.getStatements());
        const formChunks = chunk(statementChunks, 400);

        formChunks.forEach(chunks => {
            const forms: K4Form[] = [];        
        
            let page = 1
            chunks.forEach((chunk: Statement[]) => {
                const form = new K4Form('K4-2020P4', page++,this.sruInfo?.id || '', this.createDate, chunk);
                forms.push(form);
            });
    
            let formData: string[] = []
            forms.forEach((f: K4Form) =>  {
                const lines = f.generateLines()
                formData = formData.concat(lines);                
            }); 
            formData.push('#FIL_SLUT');   
            files.push(formData);        
        })

        return files;
    }
    
}