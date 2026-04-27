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
                 '#UPPGIFT 3500 0',
                 '#UPPGIFT 3501 0',
                 '#UPPGIFT 3504 0',
                 '#UPPGIFT 3505 0',
                 '#BLANKETTSLUT'
            ]
            const lines = form.generateLines();
            expect(lines).to.have.members(expectedLines);

        });
        
        it('should calculate totals for each type');
    });

    describe('K4 TYPE_C forms', () => {
        it('should add TYPE_C statements', () => {
            // 4 profit rows + 2 loss rows = 6 rows total
            const s1 = new Statement(1000, 'USD', 9000,  11000,  2000, K4_TYPE.TYPE_C, '2021-01-10');
            const s2 = new Statement(500,  'EUR', 4000,   5000,  1000, K4_TYPE.TYPE_C, '2021-01-10');
            const s3 = new Statement(200,  'GBP', 1800,   2000,   200, K4_TYPE.TYPE_C, '2021-01-10');
            const s4 = new Statement(300,  'CHF', 2700,   3000,   300, K4_TYPE.TYPE_C, '2021-01-10');
            const s5 = new Statement(100,  'JPY', 1500,   1200,  -300, K4_TYPE.TYPE_C, '2021-01-10');
            const s6 = new Statement(150,  'DKK', 2000,   1850,  -150, K4_TYPE.TYPE_C, '2021-01-10');

            const totalReceived = 11000 + 5000 + 2000 + 3000 + 1200 + 1850;
            const totalCost     =  9000 + 4000 + 1800 + 2700 + 1500 + 2000;
            const totalProfit   = 2000 + 1000 + 200 + 300;
            const totalLoss     = 300 + 150;

            const form = new K4Form('K4-2021P4', 1, '19900101-1234', new Date(2021, 0, 1, 14, 30, 0), [s1, s2, s3, s4, s5, s6]);

            const expectedLines = [
                '#BLANKETT K4-2021P4',
                '#IDENTITET 19900101-1234 20210101 143000',
                '#UPPGIFT 7014 1',
                // S1 - USD (profit)
                '#UPPGIFT 3400 1000',
                '#UPPGIFT 3401 USD',
                '#UPPGIFT 3402 11000',
                '#UPPGIFT 3403 9000',
                '#UPPGIFT 3404 2000',
                // S2 - EUR (profit)
                '#UPPGIFT 3410 500',
                '#UPPGIFT 3411 EUR',
                '#UPPGIFT 3412 5000',
                '#UPPGIFT 3413 4000',
                '#UPPGIFT 3414 1000',
                // S3 - GBP (profit)
                '#UPPGIFT 3420 200',
                '#UPPGIFT 3421 GBP',
                '#UPPGIFT 3422 2000',
                '#UPPGIFT 3423 1800',
                '#UPPGIFT 3424 200',
                // S4 - CHF (profit)
                '#UPPGIFT 3430 300',
                '#UPPGIFT 3431 CHF',
                '#UPPGIFT 3432 3000',
                '#UPPGIFT 3433 2700',
                '#UPPGIFT 3434 300',
                // S5 - JPY (loss)
                '#UPPGIFT 3440 100',
                '#UPPGIFT 3441 JPY',
                '#UPPGIFT 3442 1200',
                '#UPPGIFT 3443 1500',
                '#UPPGIFT 3445 300',
                // S6 - DKK (loss)
                '#UPPGIFT 3450 150',
                '#UPPGIFT 3451 DKK',
                '#UPPGIFT 3452 1850',
                '#UPPGIFT 3453 2000',
                '#UPPGIFT 3455 150',
                // TYPE_A sums (no TYPE_A statements)
                '#UPPGIFT 3300 0',
                '#UPPGIFT 3301 0',
                '#UPPGIFT 3304 0',
                '#UPPGIFT 3305 0',
                // TYPE_C sums
                `#UPPGIFT 3500 ${totalReceived}`,
                `#UPPGIFT 3501 ${totalCost}`,
                `#UPPGIFT 3504 ${totalProfit}`,
                `#UPPGIFT 3505 ${totalLoss}`,
                '#BLANKETTSLUT'
            ];

            const lines = form.generateLines();
            expect(lines).to.have.members(expectedLines);
        });
    });
});