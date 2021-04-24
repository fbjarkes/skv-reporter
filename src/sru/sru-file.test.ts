import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { K4Form } from '../types/k4-form';
import { TradeType } from '../types/trade';
import { SRUFile } from './sru-file';


chai.use(chaiAsPromised);

describe('SRU Files', () => {

    const fxRates: Map<string, Map<string, number>> = new Map(Object.entries({
        '2020-01-10': new Map(Object.entries({'USD/SEK': 9.1}))
    }));

    const _createTrade = (symbol: string, cost: number, proceeds: number, comm: number, pnl: number, qty = 100, secType = 'STK'): TradeType => {
        const t = new TradeType();
        t.exitDateTime = '2020-01-10';
        t.symbol = symbol
        t.description = '...';
        t.quantity = qty
        t.securityType = secType
        t.proceeds = proceeds
        t.cost = cost
        t.commission = comm;
        t.pnl = pnl;
        return t;
    }

    describe('SRU statements', () => {
        it('should create valid statement from closing trades', () => {
            const t1 = new TradeType(); 
            t1.exitDateTime = '2020-01-10';
            t1.symbol = 'SPY';
            t1.description = 'SPY ETF...';            
            t1.quantity = 10;
            t1.securityType = 'STK';
            t1.proceeds = 1000;
            t1.cost = 900;
            t1.commission = 1.5;
            t1.pnl = 98.5; // 1000 - (900 + 1.5)

            const sru = new SRUFile(fxRates, [t1]);
            const statements = sru.getStatements();
            expect(statements[0].pnl).to.equal(Math.round(98.5*9.1));
            expect(statements[0].paid).to.equal(Math.round(901.5*9.1));
            expect(statements[0].received).to.equal(Math.round(1000*9.1));
        });

    });

    describe('K4 forms', () => {
        it('should add statements', () => {
            const t1 = _createTrade('SPY', 900, 1001, 1, 100);
            const t2 = _createTrade('QQQ', 1000, 901, 1, -100);
            const sru = new SRUFile(fxRates, [t1, t2, t1, t2, t1, t2, t1, t2, t1]);
            const totalProceeds = 5 * Math.round(t1.proceeds*9.1) + 4 * Math.round(t2.proceeds*9.1); // Add comm. to cost before applying rate
            const totalCost = 5 * Math.round((t1.cost + 1) * 9.1) + 4 * Math.round((t2.cost + 1)*9.1); // Add comm. to cost before applying rate
            const totalProfit = (5 * t1.pnl) * 9.1;
            const totalLoss = Math.abs((4 * t2.pnl) * 9.1);
            const statements = sru.getStatements();
            const form = new K4Form('K4-2021P4', 1, '19900101-1234', new Date(2021, 0, 1, 14, 30, 0), statements);

            const expectedLines = [
                '#BLANKETT K4-2021P4',
                '#IDENTITET 19900101-1234 20210101 143000',
                '#UPPGIFT 7014 1',
                // T1                
                '#UPPGIFT 3100 100',
                '#UPPGIFT 3101 SPY ...',
                '#UPPGIFT 3102 9109',
                '#UPPGIFT 3103 8199',
                '#UPPGIFT 3104 910',    
                // T2
                '#UPPGIFT 3110 100',
                '#UPPGIFT 3111 QQQ ...',
                '#UPPGIFT 3112 8199',
                '#UPPGIFT 3113 9109',
                '#UPPGIFT 3115 910',
                // T1
                '#UPPGIFT 3120 100',
                '#UPPGIFT 3121 SPY ...',
                '#UPPGIFT 3122 9109',
                '#UPPGIFT 3123 8199',
                '#UPPGIFT 3124 910',
                // T2
                '#UPPGIFT 3130 100',
                '#UPPGIFT 3131 QQQ ...',
                '#UPPGIFT 3132 8199',
                '#UPPGIFT 3133 9109',
                '#UPPGIFT 3135 910',
                // T1
                '#UPPGIFT 3140 100',
                '#UPPGIFT 3141 SPY ...',
                '#UPPGIFT 3142 9109',
                '#UPPGIFT 3143 8199',
                '#UPPGIFT 3144 910',
                // T2
                '#UPPGIFT 3150 100',
                '#UPPGIFT 3151 QQQ ...',
                '#UPPGIFT 3152 8199',
                '#UPPGIFT 3153 9109',
                '#UPPGIFT 3155 910',
                // T1
                '#UPPGIFT 3160 100',
                '#UPPGIFT 3161 SPY ...',
                '#UPPGIFT 3162 9109',
                '#UPPGIFT 3163 8199',
                '#UPPGIFT 3164 910',
                // T2
                '#UPPGIFT 3170 100',
                '#UPPGIFT 3171 QQQ ...',
                '#UPPGIFT 3172 8199',
                '#UPPGIFT 3173 9109',
                '#UPPGIFT 3175 910',
                 // T1
                 '#UPPGIFT 3180 100',
                 '#UPPGIFT 3181 SPY ...',
                 '#UPPGIFT 3182 9109',
                 '#UPPGIFT 3183 8199',
                 '#UPPGIFT 3184 910',
                 // Sum
                 `#UPPGIFT 3300 ${totalProceeds}`,
                 `#UPPGIFT 3301 ${totalCost}`,                 
                 `#UPPGIFT 3304 ${totalProfit}`,
                 `#UPPGIFT 3305 ${totalLoss}`,
                 '#BLANKETTSLUT'
            ]
            const lines = form.generateLines();
            expect(lines).to.have.members(expectedLines);

        });

        // it('should throw exception when more than 9 TYPE A statements', () => {

        // });

        // TODO: validate statements: pnl == 0, paid-received match pnl etc.
    });
});