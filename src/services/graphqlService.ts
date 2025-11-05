import {
  AddressBalance,
  QueryAddressesArgs as BalanceArgs,
  Header,
  Token,
  QueryTokensArgs as TokenArgs
} from "@ergo-graphql/types";
import { ErgoGraphQLProvider } from "@fleet-sdk/blockchain-providers";
import { chunk, Network } from "@fleet-sdk/common";
import { getNetworkType } from "@/utils/otherUtils";

const BALANCE_QUERY = `query balances($addresses: [String!]!) { addresses(addresses: $addresses) { balance { nanoErgs assets { tokenId amount decimals } } } }`;
const HEIGHT_QUERY = `query height { blockHeaders(take: 1) { height } }`;
const TOKEN_METADATA_QUERY = `query tokens($tokenIds: [String!]!) { tokens(tokenIds: $tokenIds) { tokenId name decimals box { additionalRegisters } } }`;
const TRANSACTIONS_QUERY = `query transactions($spent: [String!]!, $offset: Int!, $limit: Int!) {
  transactions(spent: $spent, offset: $offset, limit: $limit) {
    transactionId
    inclusionHeight
    timestamp
    inputs { boxId ergoTree value assets { tokenId amount } }
    outputs { boxId ergoTree value assets { tokenId amount } address additionalRegisters }
  }
}`;

type BalanceResponse = { addresses: { balance: AddressBalance }[] };
type HeightResponse = { blockHeaders: Header[] };
type TokenResponse = { tokens: Token[] };
type Transaction = {
  transactionId: string;
  inclusionHeight: number;
  timestamp: number;
  inputs: Array<{
    boxId: string;
    ergoTree: string;
    value: string;
    assets: Array<{ tokenId: string; amount: string }>;
  }>;
  outputs: Array<{
    boxId: string;
    ergoTree: string;
    value: string;
    assets: Array<{ tokenId: string; amount: string }>;
    address: string;
    additionalRegisters: Record<string, string>;
  }>;
};
type TransactionsResponse = { transactions: Transaction[] };
type TransactionsArgs = { spent: string[]; offset: number; limit: number };

class GraphQLService extends ErgoGraphQLProvider {
  #getBalance;
  #getHeight;
  #getTokenMetadata;
  #getTransactions;

  constructor() {
    super(
      getNetworkType() === Network.Mainnet
        ? "https://explore.sigmaspace.io/api/graphql/"
        : "https://tn-ergo-explorer.anetabtc.io/graphql"
    );

    this.#getBalance = this.createOperation<BalanceResponse, BalanceArgs>(BALANCE_QUERY);
    this.#getHeight = this.createOperation<HeightResponse>(HEIGHT_QUERY);
    this.#getTokenMetadata = this.createOperation<TokenResponse, TokenArgs>(TOKEN_METADATA_QUERY);
    this.#getTransactions = this.createOperation<TransactionsResponse, TransactionsArgs>(TRANSACTIONS_QUERY);
  }

  public async getCurrentHeight(): Promise<number | undefined> {
    const response = await this.#getHeight();
    return response.data?.blockHeaders[0].height;
  }

  public async getBalance(addresses: string[]) {
    const chunks = chunk(addresses, 20);
    let balances = [] as AddressBalance[];

    for (const addresses of chunks) {
      const response = await this.#getBalance({ addresses });
      balances = balances.concat(response.data?.addresses.flatMap((x) => x.balance) || []);
    }

    return balances;
  }

  public async *streamTokenMetadata(tokenIds: string[]) {
    const chunks = chunk(tokenIds, 20);
    for (const tokenIds of chunks) {
      const response = await this.#getTokenMetadata({ tokenIds });

      if (response.data?.tokens) {
        yield response.data.tokens;
      }
    }
  }

  public async getTransactions(ergoTrees: string[], offset: number = 0, limit: number = 50): Promise<Transaction[]> {
    const response = await this.#getTransactions({ spent: ergoTrees, offset, limit });
    return response.data?.transactions || [];
  }
}

export const graphQLService = new GraphQLService();
export type { Transaction };
