import chai, { expect } from 'chai';
import format from 'date-fns/format';
import chaiAsPromised from 'chai-as-promised';
import { K4Form } from '../types/k4-form';
import { TradeType } from '../types/trade';
import { SRUFile, SRUInfo } from './sru-file';
import { K4_TYPE, Statement } from '../types/statement';


chai.use(chaiAsPromised);

describe('SRU Files', () => {

    const fxRates: Map<string, Map<string, number>> = new Map(Object.entries({
        '2021-01-10': new Map(Object.entries({'USD/SEK': 9.1})),
        '2020-01-10': new Map(Object.entries({'USD/SEK': 9.1})),
        '2017-09-22': new Map(Object.entries({'USD/SEK': 7.98}),
        )
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
        t.transactionType = 'ExchTrade';
        return t;
    }

    it('should create SRU info', () => {
        const sru = new SRUFile(new Map(), [], {
            id: '199001011234',
            name: 'NAME',
            surname: 'SURNAME',
            mail: 'test@example.com',
            code: '12345',
            city: 'STOCKHOLM'
        });
        const lines = sru.getInfoData();
        
        const expectedLines = [
            '#DATABESKRIVNING_START',
            '#PRODUKT SRU',
            `#SKAPAD ${format(new Date(), 'yyyyMMdd')}`,
            '#PROGRAM SKV-Reporter SKV-Reporter',
            '#FILNAMN blanketter.sru',
            '#DATABESKRIVNING_SLUT',
            '#MEDIELEV_START',
            '#ORGNR 199001011234',
            '#NAMN NAME SURNAME',
            '#POSTNR 12345',
            '#POSTORT STOCKHOLM',
            '#EMAIL test@example.com',
            '#MEDIELEV_SLUT'
        ]
        expect(lines).to.have.members(expectedLines);
    });   

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
            t1.transactionType = 'ExchTrade';
            t1.pnl = 98.5; // 1000 - (900 + 1.5)

            const sru = new SRUFile(fxRates, [t1]);
            const statements = sru.getStatements();
            expect(statements[0].pnl).to.equal(Math.round(98.5*9.1));
            expect(statements[0].paid).to.equal(Math.round(901.5*9.1));
            expect(statements[0].received).to.equal(Math.round(1000*9.1));
        });

        it('should create statement for non-USD trade correctly', () => {
            const expiredOpt = new TradeType();
            expiredOpt.description = 'OMXS30 MAR15 1565 P';
            expiredOpt.exitDateTime = '2020-01-10';
            expiredOpt.quantity = -1;
            expiredOpt.proceeds = 0;
            expiredOpt.cost = -1388.5;
            expiredOpt.securityType = 'OPT';
            expiredOpt.currency = 'SEK';
            expiredOpt.pnl = -1398.5;
            expiredOpt.commission = -10;
            expiredOpt.transactionType = 'ExchTrade';
            const sru = new SRUFile(fxRates, [expiredOpt]);
            
            const statements = sru.getStatements();
            
            expect(statements[0].pnl).to.equal(-1398)
            expect(statements[0].paid).to.equal(1398);
            expect(statements[0].received).to.equal(0);
        });

        it('should handle short trades correctly', () => {
            const t1 = new TradeType();             
            t1.currency= 'USD';
            t1.direction = 'SHORT';
            t1.exitDateTime = '2017-09-22 14:21'
            t1.exitPrice = 5.1;
            t1.pnl = -436.19;
            t1.cost = 74.9;
            t1.proceeds = -510;     
            t1.commission = -1.0915;                        
            t1.quantity = 1
            t1.securityType = 'OPT';
            t1.symbol = 'APC';
            t1.transactionType = 'ExchTrade';

            const sru = new SRUFile(fxRates, [t1]);
            const statements = sru.getStatements();
            expect(statements[0].pnl).to.equal(-3481);
            expect(statements[0].quantity).to.equal(1);
            expect(statements[0].paid).to.equal(4079)
            expect(statements[0].received).to.equal(598);
        });

        it('should split statements according to K4 form limits', () => {
            const statements = new Array(19).fill(new Statement(100, 'SPY', 100, 100, 0, K4_TYPE.TYPE_A, ''));            
            const chunks = SRUFile.splitStatements(statements);
            expect(chunks[0]).to.be.of.length(9);
            expect(chunks[1]).to.be.of.length(9);
            expect(chunks[2]).to.be.of.length(1);
        });

        it('should not create statements for trades with PnL < 1 SEK', () => {
            const t1 = new TradeType();             
            t1.currency= 'USD';
            t1.exitDateTime = '2017-09-22 14:21'
            t1.exitPrice = 0;
            t1.pnl = 0;
            t1.cost = -68.59
            t1.proceeds = 0;     
            t1.commission = 0;  
            t1.quantity = -1
            t1.securityType = 'OPT';
            t1.symbol = 'IWM';
            t1.transactionType = 'BookTrade';
            const t2 = new TradeType(); 
            t2.exitDateTime = '2020-01-10';
            t2.symbol = 'SPY';              
            t2.securityType = 'STK';                
            t2.pnl = 0.1;
            const t3 = new TradeType(); 
            t3.exitDateTime = '2020-01-10';
            t3.symbol = 'SPY';              
            t3.securityType = 'STK';                
            t3.pnl = 0.2; 

            const sru = new SRUFile(fxRates, [t1, t2, t3]);
            const statements = sru.getStatements();
            expect(statements).to.be.of.length(1);
        });

        it('should throw error when including trade dates for wrong tax year', () => {
            const t1 = new TradeType(); 
            t1.exitDateTime = '2020-01-10';
            t1.symbol = 'SPY';              
            t1.securityType = 'STK';                
            t1.pnl = 1;
            const t2 = new TradeType(); 
            t2.exitDateTime = '2021-01-10';
            t2.symbol = 'SPY';              
            t2.securityType = 'STK';                
            t2.pnl = 1; 

            const sru = new SRUFile(fxRates, [t1, t2], {taxYear: 2021});
            expect(() => sru.getStatements()).to.throw(/statement for tax year 2021/);
        });
        it('should throw error when missing FX rate for trade which must be converted', () => {
            const t1 = new TradeType(); 
            t1.exitDateTime = '2020-01-10';
            t1.symbol = 'SPY';              
            t1.securityType = 'STK';                
            t1.pnl = 1;
            const t2 = new TradeType(); 
            t2.exitDateTime = '2020-01-11';
            t2.symbol = 'SPY';              
            t2.securityType = 'STK';                
            t2.pnl = 1; 

            const sru = new SRUFile(fxRates, [t1, t2]);
            expect(() => sru.getStatements()).to.throw('Missing USD/SEK rate for 2020-01-11');
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
        
        it('should add TYPE_C statements', () => {
            // Use same trade values as the TYPE_A test, but with TYPE_C statements
            const received_spy = Math.round(1001 * 9.1); // 9109
            const cost_spy = Math.round(901 * 9.1);      // 8199
            const pnl_spy = Math.round(100 * 9.1);       // 910

            const received_qqq = Math.round(901 * 9.1);  // 8199
            const cost_qqq = Math.round(1001 * 9.1);     // 9109
            const pnl_qqq = -Math.round(100 * 9.1);      // -910

            // 6 statements: t1, t2, t1, t2, t1, t2 (3 profit SPY, 3 loss QQQ)
            const s1 = new Statement(100, 'SPY ...', cost_spy, received_spy, pnl_spy, K4_TYPE.TYPE_C, '2020-01-10');
            const s2 = new Statement(100, 'QQQ ...', cost_qqq, received_qqq, pnl_qqq, K4_TYPE.TYPE_C, '2020-01-10');

            const totalProceeds = 3 * received_spy + 3 * received_qqq;
            const totalCost = 3 * cost_spy + 3 * cost_qqq;
            const totalProfit = 3 * pnl_spy;
            const totalLoss = 3 * Math.abs(pnl_qqq);

            const statements = [s1, s2, s1, s2, s1, s2];
            const form = new K4Form('K4-2021P4', 1, '19900101-1234', new Date(2021, 0, 1, 14, 30, 0), statements);

            const expectedLines = [
                '#BLANKETT K4-2021P4',
                '#IDENTITET 19900101-1234 20210101 143000',
                '#UPPGIFT 7014 1',
                // S1 (SPY, profit)
                '#UPPGIFT 3310 100',
                '#UPPGIFT 3311 SPY ...',
                '#UPPGIFT 3312 9109',
                '#UPPGIFT 3313 8199',
                '#UPPGIFT 3314 910',
                // S2 (QQQ, loss)
                '#UPPGIFT 3320 100',
                '#UPPGIFT 3321 QQQ ...',
                '#UPPGIFT 3322 8199',
                '#UPPGIFT 3323 9109',
                '#UPPGIFT 3325 910',
                // S1
                '#UPPGIFT 3330 100',
                '#UPPGIFT 3331 SPY ...',
                '#UPPGIFT 3332 9109',
                '#UPPGIFT 3333 8199',
                '#UPPGIFT 3334 910',
                // S2
                '#UPPGIFT 3340 100',
                '#UPPGIFT 3341 QQQ ...',
                '#UPPGIFT 3342 8199',
                '#UPPGIFT 3343 9109',
                '#UPPGIFT 3345 910',
                // S1
                '#UPPGIFT 3350 100',
                '#UPPGIFT 3351 SPY ...',
                '#UPPGIFT 3352 9109',
                '#UPPGIFT 3353 8199',
                '#UPPGIFT 3354 910',
                // S2
                '#UPPGIFT 3360 100',
                '#UPPGIFT 3361 QQQ ...',
                '#UPPGIFT 3362 8199',
                '#UPPGIFT 3363 9109',
                '#UPPGIFT 3365 910',
                // TYPE_A summaries (0 since no TYPE_A statements)
                '#UPPGIFT 3300 0',
                '#UPPGIFT 3301 0',
                '#UPPGIFT 3304 0',
                '#UPPGIFT 3305 0',
                // TYPE_C summaries
                `#UPPGIFT 3400 ${totalProceeds}`,
                `#UPPGIFT 3401 ${totalCost}`,
                `#UPPGIFT 3403 ${totalProfit}`,
                `#UPPGIFT 3404 ${totalLoss}`,
                '#BLANKETTSLUT'
            ];
            const lines = form.generateLines();
            expect(lines).to.have.members(expectedLines);
        });

        it('should calculate totals for each type');
    });
});