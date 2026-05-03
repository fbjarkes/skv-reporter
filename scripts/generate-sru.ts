/**
 * CLI script to generate SRU files from broker exports.
 *
 * Usage:
 *   npx ts-node scripts/generate-sru.ts <input-file> <tax-year> [--type TYPE_A|TYPE_C|TYPE_D] [--broker ibkr|nordnet|kraken]
 *
 * Personal info is read from environment variables (or a .env file):
 *   SRU_ID        - Personal/organisation number (personnummer)
 *   SRU_NAME      - First name
 *   SRU_SURNAME   - Surname
 *   SRU_MAIL      - Email address
 *   SRU_CODE      - Postal code
 *   SRU_CITY      - City
 *   POSITIONS_FILE - Optional CSV file with initial cash positions (ASSET,YEAR,CUM_QTY,CUM_COST,...)
 *
 * Output files are written to the current working directory:
 *   info.sru
 *   blanketter0.sru, blanketter1.sru, ...  (rename each to blanketter.sru when uploading)
 *   totals.txt  (summary with SKV form instructions)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
// @ts-ignore parseArgs is available at runtime but missing in this project's @types/node version
import { parseArgs } from 'node:util';

import { FlexQueryParser } from '../src/flexquery/flexquery-parser';
import { NNParser } from '../src/flexquery/nn-parser';
import { SRUFile, SRUInfo, generateBlanketterFileData, totalsFileData } from '../src/sru/sru-file';
import { parseInitialCashPositionsFile } from '../src/sru/sru-utils';
import { K4_TYPE, Statement } from '../src/types/statement';
import { TradeType } from '../src/types/trade';
import { logger } from '../src/logging';

dotenv.config();

// --- arg parsing ---

const usage =
    'Usage: npx ts-node scripts/generate-sru.ts <input-file> <tax-year> [--type TYPE_A|TYPE_C|TYPE_D] [--broker ibkr|nordnet|kraken]';

const parsedArgs = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
        broker: {
            type: 'string',
        },
        type: {
            type: 'string',
        },
        help: {
            type: 'boolean',
            short: 'h',
        },
    },
});

if (parsedArgs.values.help) {
    console.log(usage);
    process.exit(0);
}

const [xmlFile, taxYearArg] = parsedArgs.positionals;

if (!xmlFile || !taxYearArg) {
    console.error(usage);
    process.exit(1);
}

const taxYear = parseInt(taxYearArg, 10);
if (isNaN(taxYear)) {
    console.error(`Invalid tax year: ${taxYearArg}`);
    process.exit(1);
}

const typeArg = parsedArgs.values.type?.toUpperCase();
const validTypes = [K4_TYPE.TYPE_A, K4_TYPE.TYPE_C, K4_TYPE.TYPE_D] as const;
const selectedType = validTypes.find((t) => t === typeArg);
if (typeArg && !selectedType) {
    console.error(`Invalid type: ${parsedArgs.values.type}`);
    console.error(usage);
    process.exit(1);
}

type Broker = 'ibkr' | 'nordnet' | 'kraken';
const brokerArg = parsedArgs.values.broker?.toLowerCase() || 'ibkr';
const brokers = ['ibkr', 'nordnet', 'kraken'] as const;
const selectedBroker = brokers.find((b) => b === brokerArg) as Broker | undefined;
if (!selectedBroker) {
    console.error(`Invalid broker: ${parsedArgs.values.broker}`);
    console.error(usage);
    process.exit(1);
}

const account: string | undefined = process.env.ACCOUNT;

const sruInfo: SRUInfo = {
    taxYear,
    id: process.env.SRU_ID,
    name: process.env.SRU_NAME,
    surname: process.env.SRU_SURNAME,
    mail: process.env.SRU_MAIL,
    code: process.env.SRU_CODE,
    city: process.env.SRU_CITY,
};

const missingEnv = (['id', 'name', 'surname', 'mail', 'code', 'city'] as const).filter((k) => !sruInfo[k]);
if (missingEnv.length > 0) {
    console.error(
        `Missing required environment variables: ${missingEnv.map((k) => `SRU_${k.toUpperCase()}`).join(', ')}`,
    );
    process.exit(1);
}

// --- main ---

const parseIbkrInput = (
    fileData: string,
    account?: string,
): { trades: TradeType[]; rates: Map<string, Map<string, number>> } => {
    const flexParser = new FlexQueryParser(account);
    const stats = flexParser.parse(fileData);

    console.log('\n--- Parse summary ---');
    console.log(`Trades:       ${stats.tradesCount} (winners: ${stats.winnersCount}, losers: ${stats.losersCount})`);
    console.log(
        `  STK: ${stats.stkTradesCount}  OPT: ${stats.optTradesCount}  FUT: ${stats.futTradesCount}  Non-USD: ${stats.tradesNonUSDCount}`,
    );
    console.log(`Trade PnL:    ${stats.tradePnl.toFixed(2)} USD  (non-USD: ${stats.tradePnlNonUsd.toFixed(2)})`);
    console.log(`Commissions:  ${stats.totalComm.toFixed(2)} USD`);
    console.log(`FX mappings:  ${stats.ratesCount}`);
    if (stats.tradesUnhandledCount > 0) {
        console.warn(`Unhandled:    ${stats.tradesUnhandledCount} trades skipped`);
    }

    const trades = [
        ...flexParser.getClosingTrades(),
        ...flexParser.getAllTrades().filter((t) => t.securityType === 'CASH'),
    ];
    const rates = flexParser.getConversionRates();
    return { trades, rates };
};

const parseNNInput = (
    fileData: string,
    account?: string,
): { trades: TradeType[]; rates: Map<string, Map<string, number>> } => {
    const nnParser = new NNParser(account);
    const stats = nnParser.parse(fileData);

    console.log('\n--- Parse summary ---');
    console.log(`Trades:       ${stats.tradesCount} (winners: ${stats.winnersCount}, losers: ${stats.losersCount})`);
    console.log(
        `  STK: ${stats.stkTradesCount}  OPT: ${stats.optTradesCount}  FUT: ${stats.futTradesCount}  Non-USD: ${stats.tradesNonUSDCount}`,
    );
    console.log(`Trade PnL:    ${stats.tradePnl.toFixed(2)} USD  (non-USD: ${stats.tradePnlNonUsd.toFixed(2)})`);
    console.log(`Commissions:  ${stats.totalComm.toFixed(2)} USD`);
    console.log(`FX mappings:  ${stats.ratesCount}`);
    if (stats.tradesUnhandledCount > 0) {
        console.warn(`Unhandled:    ${stats.tradesUnhandledCount} trades skipped`);
    }

    const trades = [
        ...nnParser.getClosingTrades(),
        ...nnParser.getAllTrades().filter((t) => t.securityType === 'CASH'),
    ];
    const rates = nnParser.getConversionRates();
    return { trades, rates };
};

const parseBrokerInput = (
    broker: Broker,
    fileData: string,
    account?: string,
): { trades: TradeType[]; rates: Map<string, Map<string, number>> } => {
    switch (broker) {
        case 'ibkr':
            return parseIbkrInput(fileData, account);
        case 'nordnet':
            return parseNNInput(fileData, account);
        case 'kraken':
            throw new Error('Broker kraken is not implemented yet');
    }
};

const main = async () => {
    const resolvedPath = path.resolve(xmlFile);
    console.log(`Reading: ${resolvedPath}`);
    const fileData = await fs.readFile(resolvedPath, 'utf8');
    console.log(`Broker: ${selectedBroker}`);
    const { trades, rates } = parseBrokerInput(selectedBroker, fileData, account);

    const sruFile = new SRUFile(rates, trades, sruInfo, account);
    const positionsFile = process.env.POSITIONS_FILE;
    if (positionsFile) {
        const resolvedPositionsPath = path.resolve(positionsFile);
        const cashPositions = await parseInitialCashPositionsFile(resolvedPositionsPath, taxYear);
        sruFile.setInitialCashPositions(cashPositions);
        console.log(`Loaded ${cashPositions.length} initial cash position(s) from ${resolvedPositionsPath}`);
    } else {
        console.log('POSITIONS_FILE not set. No initial cash positions loaded.');
    }
    const packages = sruFile.getSRUPackages(selectedType);

    console.log(`\nGenerating ${packages.length} SRU package(s)...`);

    // Write info.sru (same for all packages)
    const infoData = sruFile.getInfoFileData();
    await fs.writeFile('info.sru', infoData.join('\n'), { encoding: 'latin1' });
    console.log('Wrote: info.sru');

    // Write blanketter files
    for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i];
        const blanketterData = generateBlanketterFileData(pkg.forms);
        const filename = `blanketter${i}.sru`;
        await fs.writeFile(filename, blanketterData.join('\n'), { encoding: 'latin1' });
        console.log(`Wrote: ${filename}  (${pkg.statements.length} statements)`);
    }

    // Write totals summary
    const allTotals = packages.flatMap((p) => p.totals);
    const totalsData = totalsFileData(allTotals);
    await fs.writeFile('totals.txt', totalsData.join('\n'), 'utf8');
    console.log('Wrote: totals.txt');

    // Print statement summary
    const allStatements: Statement[] = packages.flatMap((p) => p.statements);
    let totalPnl = 0,
        totalLoss = 0,
        totalProfit = 0,
        totalPaid = 0,
        totalReceived = 0;
    allStatements.forEach((s) => {
        totalPnl += s.pnl;
        totalPaid += s.paid;
        totalReceived += s.received;
        if (s.pnl > 0) totalProfit += s.pnl;
        else totalLoss += Math.abs(s.pnl);
    });

    console.log('\n--- Statement summary (SEK) ---');
    console.log(`Account: ${account}`);
    console.log(`Statements:     ${allStatements.length}`);
    console.log(`Total PnL:      ${totalPnl.toFixed(0)}`);
    console.log(`Total profit:   ${totalProfit.toFixed(0)}`);
    console.log(`Total loss:     ${totalLoss.toFixed(0)}`);
    console.log(`Total paid:     ${totalPaid.toFixed(0)}`);
    console.log(`Total received: ${totalReceived.toFixed(0)}`);

    if (packages.length > 1) {
        console.log(
            `\nNote: ${packages.length} blanketter files generated. Rename each to 'blanketter.sru' and upload separately.`,
        );
    }
    logger.info(`[${account}] SRU generation completed`);
    logger.info(`Wrote files: info.sru`);
    // log which files were written
    for (let i = 0; i < packages.length; i++) {
        logger.info(`Wrote file: blanketter${i}.sru`);
    }
    logger.info(`Wrote file: totals.txt`);
};

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
