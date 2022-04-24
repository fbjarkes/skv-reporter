import * as React from 'react';
import { Statement } from '../types/statement';
import { TradeType } from '../types/trade';
import { TradeFilters, filterTrades } from '../utils/helper';

export type TradesContextType = {
    state: State;
    dispatch: React.Dispatch<TradeActions>;
};

const initialState = {
    trades: [],
    filteredTrades: [],
    tradeFilters: {
        long: true,
        short: true,
        equities: true,
        options: true,
        futures: true,
        duration: 100,
    },
    statements: [],
};

type State = {
    trades: TradeType[];
    filteredTrades: TradeType[];
    tradeFilters: TradeFilters;
    statements: Statement[];
};

export interface SetTradeAction {
    type: ActionType.SetTradeAction;
    payload: { trades: TradeType[]; statements: Statement[] };
}

export interface SetFilterAction {
    type: ActionType.SetFilterAction;
    payload: TradeFilters;
}

export enum ActionType {
    SetTradeAction,
    SetFilterAction,
}

type TradeActions = SetTradeAction | SetFilterAction;

export const tradesReducer: React.Reducer<State, TradeActions> = (state, action): State => {
    switch (action.type) {
        case ActionType.SetTradeAction:
            return {
                trades: action.payload.trades,
                statements: action.payload.statements,
                filteredTrades: action.payload.trades.filter((t) => filterTrades(t, state.tradeFilters)),
                tradeFilters: state.tradeFilters,
            };
        case ActionType.SetFilterAction:
            return {
                trades: state.trades,
                statements: state.statements,
                filteredTrades: state.trades.filter((t) => filterTrades(t, action.payload)),
                tradeFilters: action.payload,
            };
        default:
            return state;
    }
};

export const TradesContext = React.createContext<TradesContextType>({
    state: initialState,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    dispatch: () => {},
});

export const TradesProvider: React.FC = ({ children }) => {
    const [state, dispatch] = React.useReducer(tradesReducer, initialState);
    const value: TradesContextType = { state, dispatch };

    return <TradesContext.Provider value={value}>{children}</TradesContext.Provider>;
};

export default TradesProvider;
