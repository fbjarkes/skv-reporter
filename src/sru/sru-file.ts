import { chunk, sumBy } from 'lodash';
import format from 'date-fns/format';

import { K4_SEC_TYPE, K4_TYPE, Statement } from '../types/statement';
import { TradeType } from '../types/trade';
import { K4Form } from '../types/k4-form';
import { logger } from '../logging';

const COMMODITY_FUTURE_SYMBOL_PREFIXES = ['CL', 'GC'];
const MICRO_COMMODITY_FUTURE_SYMBOL_PREFIXES = ['MCL', 'MGC'];

export type SRUInfo = {
    id?: string;
    name?: string;
    surname?: string;
    mail?: string;
    code?: string;
    city?: string;
    taxYear?: number;
};

export type SRUPackage = {
    info?: SRUInfo;
    forms: K4Form[];
    statements: Statement[];
    totals: K4TypeTotals[];
};

export type K4TypeTotals = {
    type: K4_TYPE;
    totalProfit: number;
    totalLoss: number;
    totalPaid: number;
    totalReceived: number;
    totalPnl: number;
    totalStatements: number;
};

// --- internal functions ---
const toK4Type = (trade: TradeType): K4_TYPE => {
    switch (trade.securityType) {
        case 'STK': {
            return K4_TYPE.TYPE_A;
        }
        case 'FUT': {
            // TODO: FX/Bond futures: TYPE_C
            if (isCommodityFuture(trade.symbol)) {
                return K4_TYPE.TYPE_D;
            } else {
                return K4_TYPE.TYPE_A;
            }
        }
        case 'OPT': {
            return K4_TYPE.TYPE_A;
        }
        // Crypto: TYPE_D
    }
    throw new Error(`Unexpected trade security type: ${trade.securityType}`);
};

const toK4SecType = (trade: TradeType): K4_SEC_TYPE => {
    switch (trade.securityType) {
        case 'STK': {
            return K4_SEC_TYPE.STOCK;
        }
        case 'FUT': {
            return K4_SEC_TYPE.FUTURE;
        }
        case 'OPT': {
            return K4_SEC_TYPE.OPTION;
        }
    }
    return K4_SEC_TYPE.UNKNOWN;
};

// --- public functions ---
export const generateBlanketterFileData = (forms: K4Form[]): string[] => {
    let data: string[] = [];
    forms.forEach((f: K4Form) => {
        if (f.type === K4_TYPE.TYPE_A) {
            data = data.concat(f.generateLinesTypeA());
        } else if (f.type === K4_TYPE.TYPE_D) {
            data = data.concat(f.generateLinesTypeD());
        } else {
            throw new Error('Unknown form type');
        }
    });
    data.push('#FIL_SLUT');
    // TODO: assert size < 5mb
    return data;
};

export const validateSRUInfo = (info?: SRUInfo) => {
    if (!info) throw Error('Missing SRU info');
    if (!info.taxYear) throw Error('Invalid SRU info: taxYear');
    if (!info.id) throw Error('Invalid SRU info: id');
    if (!info.name) throw Error('Invalid SRU info: name');
    if (!info.surname) throw Error('Invalid SRU info: surname');
    if (!info.mail) throw Error('Invalid SRU info: mail');
    if (!info.code) throw Error('Invalid SRU info: code');
    if (!info.city) throw Error('Invalid SRU info: city');
    return true;
};

export const isCommodityFuture = (symbol: string) => {
    if (symbol.length == 5) {
        // e.g. MCLX1
        return MICRO_COMMODITY_FUTURE_SYMBOL_PREFIXES.includes(symbol.slice(0, 3));
    }
    if (symbol.length == 4) {
        // e.g. CLX1
        return COMMODITY_FUTURE_SYMBOL_PREFIXES.includes(symbol.slice(0, 2));
    }
    return false;
};
export class SRUFile {
    sruInfo?: SRUInfo;
    title = 'SKV-Reporter';
    trades: TradeType[];
    fxRates: Map<string, Map<string, number>>;
    createDate = new Date();
    supportedCurrencies = ['SEK', 'USD'];

    constructor(fxRates: Map<string, Map<string, number>>, trades: TradeType[], data?: SRUInfo, date = new Date()) {
        this.sruInfo = data;
        this.fxRates = fxRates;
        this.trades = trades;
        this.createDate = date;
    }

    getStatements(): Statement[] {
        const statements: Statement[] = [];
        let id = 0;
        this.trades.forEach((trade: TradeType) => {
            let rate: number | undefined = 1;
            let paid, received;

            if (this.sruInfo?.taxYear && this.sruInfo?.taxYear !== Number(trade.exitDateTime.substring(0, 4))) {
                throw new Error(`Unexpected statement for tax year '${this.sruInfo?.taxYear}' in trade '${trade}'`);
            }

            if (!this.supportedCurrencies.includes(trade.currency)) {
                throw new Error(`Unsupported currency '${trade.currency}'`);
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
            const statement = new Statement(
                id++,
                trade.quantity,
                `${trade.symbol} ${trade.description}`,
                paid,
                received,
                pnl,
                toK4Type(trade),
                trade.exitDateTime,
                toK4SecType(trade),
            );

            if (trade.openClose === 'C;O') {
                //logger.info(`Found C;O statement: ${statement}`);
            }
            if (Math.abs(pnl) < 1) {
                logger.info(`Skipping trade with < 1SEK: ${statement.toString()}`);
                //console.log(`Skipping trade with < 1SEK: ${statement.toString()}`);
            } else {
                logger.info(`Adding: ${statement.toString()}`);
                //console.log(`Adding: ${statement.toString()}`);
                statements.push(statement);
            }
        });
        return statements;
    }

    getInfoFileData(): string[] {
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
            '#MEDIELEV_SLUT',
        ];
    }

    // TODO: move to sru-file-helper.ts?
    static splitStatements(statements: Statement[]): Statement[][] {
        // TODO: max 9 TYPE_A, 7 TYPE_C, 7 TYPE_D
        const statements_a = statements.filter((s: Statement) => s.type === K4_TYPE.TYPE_A);
        return chunk(statements_a, 9);
    }

    getSRUPackages(): SRUPackage[] {
        validateSRUInfo(this.sruInfo);
        const title = `K4-${this.sruInfo?.taxYear}P4`;
        const allStatements = this.getStatements();
        console.log('Handling total statements:', allStatements.length);

        // TODO: estimate number of packages based on number of statements? (5mb per package)
        const packages = chunk(allStatements, 3500).map((statements: Statement[]) => {
            const forms: K4Form[] = [];
            let page = 1;
            const statements_a = statements.filter((s: Statement) => s.type === K4_TYPE.TYPE_A);
            const statements_d = statements.filter((s: Statement) => s.type === K4_TYPE.TYPE_D);
            logger.info(`Handling ${statements_a.length} TYPE_A, ${statements_d.length} TYPE_D`);
            // TYPE_A
            chunk(statements_a, 9).forEach((statements_a_chunk: Statement[]) => {
                const form = new K4Form(
                    title,
                    page++,
                    this.sruInfo?.id || '',
                    this.createDate,
                    statements_a_chunk,
                    K4_TYPE.TYPE_A,
                );
                forms.push(form);
            });
            // TYPE_D
            chunk(statements_d, 7).forEach((statements_d_chunk: Statement[]) => {
                const form = new K4Form(
                    title,
                    page++,
                    this.sruInfo?.id || '',
                    this.createDate,
                    statements_d_chunk,
                    K4_TYPE.TYPE_D,
                );
                forms.push(form);
            });
            // TYPE_C....

            // TODO: sum totals from K4Forms instead which is technically what happens in reality?
            const typeA_totals: K4TypeTotals = {
                type: K4_TYPE.TYPE_A,
                totalProfit: sumBy(
                    statements_a.filter((s) => s.pnl > 0),
                    'pnl',
                ),
                totalLoss: sumBy(
                    statements_a.filter((s) => s.pnl < 0),
                    'pnl',
                ),
                totalPaid: sumBy(statements_a, 'paid'),
                totalReceived: sumBy(statements_a, 'received'),
                totalPnl: sumBy(statements_a, 'pnl'),
                totalStatements: statements_a.length,
            };
            const typeD_totals: K4TypeTotals = {
                type: K4_TYPE.TYPE_D,
                totalProfit: sumBy(
                    statements_d.filter((s) => s.pnl > 0),
                    'pnl',
                ),
                totalLoss: sumBy(
                    statements_d.filter((s) => s.pnl < 0),
                    'pnl',
                ),
                totalPaid: sumBy(statements_d, 'paid'),
                totalReceived: sumBy(statements_d, 'received'),
                totalPnl: sumBy(statements_d, 'pnl'),
                totalStatements: statements_d.length,
            };
            const p: SRUPackage = {
                info: this.sruInfo,
                statements: statements,
                forms: forms,
                totals: [typeA_totals, typeD_totals],
            };
            return p;
        });
        return packages;
    }

    getFormData(): string[][] {
        const files: string[][] = [];

        const statementChunks = SRUFile.splitStatements(this.getStatements());
        const formChunks = chunk(statementChunks, 400);

        formChunks.forEach((chunks) => {
            const forms: K4Form[] = [];

            let page = 1;
            chunks.forEach((chunk: Statement[]) => {
                const form = new K4Form('K4-2020P4', page++, this.sruInfo?.id || '', this.createDate, chunk);
                forms.push(form);
            });

            let formData: string[] = [];
            forms.forEach((f: K4Form) => {
                const lines_A = f.generateLinesTypeA();
                const lines_D = f.generateLinesTypeD();
                formData = formData.concat(lines_A);
            });
            formData.push('#FIL_SLUT');
            files.push(formData);
        });

        return files;
    }
}
