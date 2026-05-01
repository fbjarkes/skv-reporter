import * as fs from 'fs/promises';

import { CashPosition } from '../types/cash';
import { logger } from '../logging';

export const parseCsvLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current.trim());
    return values;
};

export const unquote = (value: string): string => {
    if (value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1);
    }
    return value;
};

export const parseInitialCashPositionsCsv = (content: string, taxYear: number): CashPosition[] => {
    const requiredHeaders = ['ASSET', 'ACCOUNT', 'YEAR', 'CUM_QTY', 'CUM_COST'];
    const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (lines.length < 2) {
        logger.warn(`No data lines found in Positions file for tax year ${taxYear}`);
        return [];
    }

    const headers = parseCsvLine(lines[0]).map((h) => unquote(h).toUpperCase());
    for (const header of requiredHeaders) {
        if (!headers.includes(header)) {
            throw new Error(`Missing required header "${header}" in Positions file for tax year ${taxYear}`);
        }
    }

    const assetIndex = headers.indexOf('ASSET');
    const accountIndex = headers.indexOf('ACCOUNT');
    const yearIndex = headers.indexOf('YEAR');
    const cumQtyIndex = headers.indexOf('CUM_QTY');
    const cumCostIndex = headers.indexOf('CUM_COST');
    const positions: CashPosition[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]).map((v) => unquote(v));

        if (values.length <= Math.max(assetIndex, accountIndex, yearIndex, cumQtyIndex, cumCostIndex)) {
            logger.warn(`Skipping malformed positions row ${i + 1} for tax year ${taxYear}: ${lines[i]}`);
            continue;
        }

        const rowYear = Number(values[yearIndex]);
        if (!Number.isFinite(rowYear) || rowYear !== taxYear) {
            continue;
        }

        const rawAsset = values[assetIndex].trim();
        if (!rawAsset) {
            logger.warn(`Skipping positions row ${i + 1} with empty asset for tax year ${taxYear}`);
            continue;
        }

        const symbol = rawAsset.includes('_') ? rawAsset.replace('_', '/') : rawAsset;
        const symbolParts = symbol.split('/');
        const currency = symbolParts.length > 1 ? symbolParts[symbolParts.length - 1].toUpperCase() : '';
        const cumQty = Number(values[cumQtyIndex]);
        const cumCost = Number(values[cumCostIndex]);

        if (!Number.isFinite(cumQty) || !Number.isFinite(cumCost)) {
            logger.warn(`Skipping positions row ${i + 1} with invalid numeric values for tax year ${taxYear}`);
            continue;
        }

        positions.push(
            new CashPosition({
                symbol,
                cumQty,
                cumCost,
                currency,
            }),
        );
    }

    return positions;
};

export const parseInitialCashPositionsFile = async (filePath: string, taxYear: number): Promise<CashPosition[]> => {
    const content = await fs.readFile(filePath, 'utf8');
    return parseInitialCashPositionsCsv(content, taxYear);
};
